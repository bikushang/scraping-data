/*
 * Embed page scraper — uses Instagram's /embed/ endpoint
 * which is less aggressively rate-limited than profile pages.
 *
 * The embed page contains:
 *   1. "contextJSON" — a JSON string with username, full_name,
 *      followers_count, posts_count, profile_pic_url, and graphql_media (posts)
 *   2. A separate JSON block with is_private, edge_followed_by, edge_follow,
 *      edge_owner_to_timeline_media, biography, external_url, etc.
 */

function parsePostNode(node) {
  const caption =
    node?.edge_media_to_caption?.edges?.[0]?.node?.text ||
    node?.accessibility_caption ||
    ''
  const likes = node?.edge_media_preview_like?.count || 0
  const comments = node?.edge_media_to_comment?.count || 0

  return {
    id: node?.id || Math.random().toString(36),
    imageUrl: node?.display_url || node?.thumbnail_src || '',
    caption,
    likes,
    comments,
    isVideo: node?.is_video || false,
    shortcode: node?.shortcode || '',
    views: node?.video_view_count ?? null,
    timestamp: node?.taken_at_timestamp || null,
  }
}

function extractContextJson(html) {
  const startMarker = '"contextJSON":"'
  const startIdx = html.indexOf(startMarker)
  if (startIdx === -1) return null

  const valueStart = startIdx + startMarker.length

  let i = valueStart
  let rawValue = ''
  while (i < html.length) {
    if (html[i] === '\\' && i + 1 < html.length) {
      rawValue += html[i] + html[i + 1]
      i += 2
      continue
    }
    if (html[i] === '"') break
    rawValue += html[i]
    i++
  }

  try {
    const unescaped = JSON.parse('"' + rawValue + '"')
    return JSON.parse(unescaped)
  } catch (e) {
    return null
  }
}

function extractUserDataBlock(html) {
  // The embed page has a separate JSON block containing is_private, edge_followed_by, etc.
  // Pattern: "username":"...","followed_by_viewer":...,"is_private":...,"edge_followed_by":{"count":...}
  // We find this block and extract the user object

  const isPrivateIdx = html.indexOf('is_private')
  if (isPrivateIdx === -1) return null

  // Search backwards for "username" to find the start of the user object
  const before = html.substring(Math.max(0, isPrivateIdx - 2000), isPrivateIdx)
  const usernameIdx = before.lastIndexOf('"username":"')
  if (usernameIdx === -1) return null

  const blockStart = isPrivateIdx - 2000 + usernameIdx

  // Find the enclosing JSON object by searching backwards for the opening brace
  let braceIdx = blockStart
  while (braceIdx > 0 && html[braceIdx] !== '{') {
    braceIdx--
  }

  // Now find the matching closing brace
  let depth = 0
  let endIdx = braceIdx
  for (let j = braceIdx; j < html.length; j++) {
    if (html[j] === '{') depth++
    if (html[j] === '}') {
      depth--
      if (depth === 0) {
        endIdx = j
        break
      }
    }
  }

  const blockStr = html.substring(braceIdx, endIdx + 1)

  // Unescape if needed (it might be inside a JSON string)
  let cleaned = blockStr
  // Check if it's double-escaped (starts with \")
  if (cleaned.includes('\\"')) {
    cleaned = cleaned
      .replace(/\\"/g, '"')
      .replace(/\\\//g, '/')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
  }

  try {
    const data = JSON.parse(cleaned)
    // The block might be the user object directly, or contain it
    if (data.username && data.edge_followed_by !== undefined) {
      return data
    }
    // Search nested
    if (data.user && data.user.username) {
      return data.user
    }
  } catch (e) {
    // Try to find just the user fields with regex
  }

  return null
}

export function parseEmbedPage(html) {
  if (!html || html.length < 500) return null

  // 1. Extract contextJSON (always present for profile embeds)
  const contextData = extractContextJson(html)
  if (!contextData) return null

  const ctx = contextData.context || contextData

  // 2. Extract the user data block with is_private, edge_followed_by, etc.
  const userBlock = extractUserDataBlock(html)

  // Merge data from both sources
  const username = ctx.username || userBlock?.username || ''
  const fullName = ctx.full_name || userBlock?.full_name || ''
  const isVerified = ctx.is_verified ?? userBlock?.is_verified ?? false
  const profilePicUrl = ctx.profile_pic_url || userBlock?.profile_pic_url || ''
  const isPrivate = userBlock?.is_private ?? false
  const bio = userBlock?.biography || ''
  const followers = ctx.followers_count ?? userBlock?.edge_followed_by?.count ?? 0
  const following = userBlock?.edge_follow?.count ?? 0
  const postsCount = ctx.posts_count ?? userBlock?.edge_owner_to_timeline_media?.count ?? 0
  const externalUrl = userBlock?.external_url || ''
  const category = userBlock?.category_name || ''

  // 3. Extract posts from graphql_media (in contextJSON) or edge_owner_to_timeline_media (in userBlock)
  let posts = []
  let reels = []

  if (!isPrivate) {
    // Try graphql_media first (from contextJSON)
    if (ctx.graphql_media && Array.isArray(ctx.graphql_media)) {
      const mediaItems = ctx.graphql_media.map((m) => {
        const sm = m.shortcode_media || m
        return parsePostNode(sm)
      })
      const photoPosts = mediaItems.filter((p) => !p.isVideo)
      const videoPosts = mediaItems.filter((p) => p.isVideo)
      posts = (photoPosts.length >= 3 ? photoPosts : mediaItems).slice(0, 3)
      reels = videoPosts.slice(0, 3)
    }

    // Also try edge_owner_to_timeline_media from userBlock (may have more data)
    if (userBlock?.edge_owner_to_timeline_media?.edges?.length > 0) {
      const edges = userBlock.edge_owner_to_timeline_media.edges
      const allItems = edges.map((e) => parsePostNode(e.node))
      const photoPosts = allItems.filter((p) => !p.isVideo)
      const videoPosts = allItems.filter((p) => p.isVideo)
      if (allItems.length > posts.length) {
        posts = (photoPosts.length >= 3 ? photoPosts : allItems).slice(0, 3)
      }

      const felixEdges = userBlock.edge_felix_video_timeline?.edges || []
      if (felixEdges.length > 0) {
        reels = felixEdges.slice(0, 3).map((e) => parsePostNode(e.node))
      } else if (videoPosts.length > reels.length) {
        reels = videoPosts.slice(0, 3)
      }
    }
  }

  return {
    username,
    fullName,
    bio,
    profilePicUrl,
    followers,
    following,
    postsCount,
    isVerified,
    isPrivate,
    externalUrl,
    category,
    posts,
    reels,
    hasJsonData: true,
    scrapedAt: new Date().toISOString(),
  }
}

export async function fetchEmbedPage(username) {
  const url = `https://www.instagram.com/${username}/embed/`
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    })
    if (!res.ok) return null
    const html = await res.text()
    if (!html || html.length < 500) return null
    return html
  } catch (e) {
    return null
  }
}
