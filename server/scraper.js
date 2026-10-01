/*
 * Instagram Profile Scraper — server-side
 *
 * Strategy (tries multiple approaches in order):
 *   1. Instagram /embed/ endpoint (less rate-limited, sometimes has contextJSON)
 *   2. Direct profile page HTML fetch
 *   3. CORS proxies as fallback
 *
 * Each strategy retries up to 3 times since Instagram returns inconsistent
 * responses (sometimes full server-rendered page, sometimes JS shell).
 */

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
}

const CORS_PROXIES = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`,
  (url) => `https://thingproxy.freeboard.io/fetch/${url}`,
]

export function extractUsername(profileUrl) {
  const match = profileUrl.match(/instagram\.com\/([A-Za-z0-9_.]+)/)
  return match ? match[1] : ''
}

function parseCount(str) {
  if (!str) return 0
  const cleaned = str.replace(/,/g, '').trim()
  const m = cleaned.match(/^([\d.]+)\s*([KMkm]*)$/)
  if (!m) return parseInt(cleaned.replace(/[^\d]/g, '')) || 0
  const num = parseFloat(m[1])
  const suffix = m[2].toUpperCase()
  if (suffix === 'K') return Math.round(num * 1000)
  if (suffix === 'M') return Math.round(num * 1000000)
  return Math.round(num)
}

function parseStatsFromDescription(desc) {
  const stats = { followers: 0, following: 0, posts: 0 }
  if (!desc) return stats
  const m = desc.match(
    /([\d,.KMkm]+)\s*Followers?,\s*([\d,.KMkm]+)\s*Following?,\s*([\d,.KMkm]+)\s*Posts?/i
  )
  if (m) {
    stats.followers = parseCount(m[1])
    stats.following = parseCount(m[2])
    stats.posts = parseCount(m[3])
  }
  return stats
}

function findUserNode(obj, depth = 0) {
  if (depth > 15 || !obj || typeof obj !== 'object') return null
  if (obj.username && (obj.edge_owner_to_timeline_media || obj.is_private !== undefined)) {
    return obj
  }
  const items = Array.isArray(obj) ? obj : Object.values(obj)
  for (const item of items) {
    const result = findUserNode(item, depth + 1)
    if (result) return result
  }
  return null
}

function parsePostNode(node) {
  const caption = node?.edge_media_to_caption?.edges?.[0]?.node?.text || ''
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

function getMetaContent(html, property) {
  const patterns = [
    new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${property}["']`, 'i'),
  ]
  for (const p of patterns) {
    const m = html.match(p)
    if (m) return m[1]
  }
  return ''
}

function extractFullNameFromTitle(title, username) {
  if (!title) return ''
  const m = title.match(/^(.+?)\s*\(@[\w.]+\)/)
  return m ? m[1].trim() : ''
}

// ─── Extract contextJSON from embed page ─────────────────────────
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

// ─── Extract user data block (is_private, edge_followed_by, etc.) ───
function extractUserDataBlock(html) {
  const isPrivateIdx = html.indexOf('is_private')
  if (isPrivateIdx === -1) return null

  const before = html.substring(Math.max(0, isPrivateIdx - 2000), isPrivateIdx)
  const usernameMatch = before.lastIndexOf('"username":"')
  if (usernameMatch === -1) return null

  const blockStart = isPrivateIdx - 2000 + usernameMatch
  let braceIdx = blockStart
  while (braceIdx > 0 && html[braceIdx] !== '{') braceIdx--

  let depth = 0
  let endIdx = braceIdx
  for (let j = braceIdx; j < html.length; j++) {
    if (html[j] === '{') depth++
    if (html[j] === '}') {
      depth--
      if (depth === 0) { endIdx = j; break }
    }
  }

  let cleaned = html.substring(braceIdx, endIdx + 1)
  if (cleaned.includes('\\"')) {
    cleaned = cleaned.replace(/\\"/g, '"').replace(/\\\//g, '/').replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
  }

  try {
    const data = JSON.parse(cleaned)
    if (data.username && data.edge_followed_by !== undefined) return data
    if (data.user?.username) return data.user
  } catch (e) {}
  return null
}

// ─── Extract JSON data from profile page HTML ────────────────────
function extractJsonData(html) {
  // Method 1: window._sharedData
  const sharedDataMatch = html.match(/window\._sharedData\s*=\s*({[\s\S]*?});\s*<\/script>/)
  if (sharedDataMatch) {
    try {
      const data = JSON.parse(sharedDataMatch[1])
      const user = data?.entry_data?.ProfilePage?.[0]?.graphql?.user
      if (user) return user
    } catch (e) {}
  }

  // Method 2: application/json script tags
  const jsonRegex = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g
  let match
  while ((match = jsonRegex.exec(html)) !== null) {
    if (!match[1].includes('edge_owner_to_timeline_media')) continue
    try {
      const data = JSON.parse(match[1])
      const user = findUserNode(data)
      if (user) return user
    } catch (e) {}
  }

  // Method 3: RelayPrefetchedStreamCache
  const relayRegex = /\{"require":\[\["RelayPrefetchedStreamCache"[\s\S]*?\}\]\]/g
  while ((match = relayRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[0])
      const user = findUserNode(data)
      if (user) return user
    } catch (e) {}
  }

  return null
}

// ─── Parse embed page ────────────────────────────────────────────
function parseEmbedPage(html) {
  if (!html || html.length < 500) return null

  const contextData = extractContextJson(html)
  if (!contextData) return null

  const ctx = contextData.context || contextData
  const userBlock = extractUserDataBlock(html)

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

  let posts = []
  let reels = []

  if (!isPrivate) {
    if (ctx.graphql_media && Array.isArray(ctx.graphql_media)) {
      const mediaItems = ctx.graphql_media.map((m) => parsePostNode(m.shortcode_media || m))
      const photoPosts = mediaItems.filter((p) => !p.isVideo)
      const videoPosts = mediaItems.filter((p) => p.isVideo)
      posts = (photoPosts.length >= 3 ? photoPosts : mediaItems).slice(0, 3)
      reels = videoPosts.slice(0, 3)
    }

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
    username, fullName, bio, profilePicUrl,
    followers, following, postsCount,
    isVerified, isPrivate, externalUrl, category,
    posts, reels, hasJsonData: true,
    scrapedAt: new Date().toISOString(),
  }
}

// ─── Parse profile page HTML ─────────────────────────────────────
function parseProfilePage(html) {
  if (!html || html.length < 500) return null

  // Check for not found
  if (html.includes("Sorry, this page isn't available") || html.includes('Page Not Found')) {
    throw new Error('This profile does not exist or has been removed.')
  }

  const userData = extractJsonData(html)

  // Fallback to meta tags
  const ogTitle = getMetaContent(html, 'og:title')
  const ogDescription = getMetaContent(html, 'og:description')
  const ogImage = getMetaContent(html, 'og:image')
  const metaStats = parseStatsFromDescription(ogDescription)

  const isPrivate =
    userData?.is_private === true ||
    html.includes('"is_private":true') ||
    html.toLowerCase().includes('this account is private')

  const fullName = userData?.full_name || extractFullNameFromTitle(ogTitle, '')
  const bio = userData?.biography || ''
  const profilePicUrl = userData?.profile_pic_url || userData?.profile_pic_url_hd || ogImage || ''
  const followers = userData?.edge_followed_by?.count ?? metaStats.followers
  const following = userData?.edge_follow?.count ?? metaStats.following
  const postsCount = userData?.edge_owner_to_timeline_media?.count ?? metaStats.posts
  const isVerified = userData?.is_verified || false
  const externalUrl = userData?.external_url || ''
  const category = userData?.category_name || ''

  let posts = []
  let reels = []

  if (userData && !isPrivate) {
    const timelineEdges = userData.edge_owner_to_timeline_media?.edges || []
    const allItems = timelineEdges.map((e) => parsePostNode(e.node))
    const photoPosts = allItems.filter((p) => !p.isVideo)
    const videoPosts = allItems.filter((p) => p.isVideo)
    posts = (photoPosts.length >= 3 ? photoPosts : allItems).slice(0, 3)

    const felixEdges = userData.edge_felix_video_timeline?.edges || []
    if (felixEdges.length > 0) {
      reels = felixEdges.slice(0, 3).map((e) => parsePostNode(e.node))
    } else {
      reels = videoPosts.slice(0, 3)
    }
  }

  if (!userData && !ogTitle && !ogDescription && !ogImage) return null

  return {
    fullName, bio, profilePicUrl,
    followers, following, postsCount,
    isVerified, isPrivate, externalUrl, category,
    posts, reels, hasJsonData: !!userData,
    scrapedAt: new Date().toISOString(),
  }
}

// ─── Fetch helpers ───────────────────────────────────────────────
async function fetchWithTimeout(url, options, ms = 15000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timeout)
    return res
  } catch (err) {
    clearTimeout(timeout)
    throw err
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// ─── Strategy 1: Embed page (with retries) ───────────────────────
async function tryEmbedPage(username) {
  const url = `https://www.instagram.com/${username}/embed/`
  for (let attempt = 1; attempt <= 4; attempt++) {
    console.log(`[scraper] Embed attempt ${attempt} for @${username}...`)
    try {
      const res = await fetchWithTimeout(url, { headers: BROWSER_HEADERS, redirect: 'follow' }, 12000)
      if (!res.ok) { await sleep(1500); continue }
      const html = await res.text()
      if (!html || html.length < 500) { await sleep(1500); continue }
      const data = parseEmbedPage(html)
      if (data) {
        console.log(`[scraper] Embed succeeded on attempt ${attempt}`)
        return data
      }
      // Page returned but no contextJSON — might be JS shell, retry
      await sleep(1500)
    } catch (e) {
      await sleep(1500)
    }
  }
  return null
}

// ─── Strategy 2: Direct profile page ─────────────────────────────
async function tryDirectProfile(username) {
  const url = `https://www.instagram.com/${username}/`
  try {
    const res = await fetchWithTimeout(url, { headers: BROWSER_HEADERS, redirect: 'follow' }, 12000)
    if (!res.ok) return null
    const html = await res.text()
    if (!html || html.length < 500) return null
    return parseProfilePage(html)
  } catch (e) {
    return null
  }
}

// ─── Strategy 3: Proxy fetch ─────────────────────────────────────
async function tryProxyFetch(username) {
  const url = `https://www.instagram.com/${username}/`
  for (const proxy of CORS_PROXIES) {
    console.log(`[scraper] Trying proxy for @${username}...`)
    try {
      const res = await fetchWithTimeout(proxy(url), { headers: { Accept: 'text/html' }, redirect: 'follow' }, 12000)
      if (!res.ok) continue
      const html = await res.text()
      if (!html || html.length < 500) continue
      // Try parsing as profile page
      const data = parseProfilePage(html)
      if (data) return data
      // Try parsing as embed page (some proxies might redirect)
      const embedData = parseEmbedPage(html)
      if (embedData) return embedData
    } catch (e) {
      continue
    }
  }
  return null
}

// ─── Main scrape function ────────────────────────────────────────
export async function scrapeInstagramProfile(profileUrl) {
  const username = extractUsername(profileUrl)
  if (!username) {
    throw new Error('Could not extract a username from the provided URL.')
  }

  // Strategy 1: Embed page (most reliable, less rate-limited)
  console.log(`[scraper] Starting scrape for @${username}`)
  let result = await tryEmbedPage(username)
  if (result) {
    result.username = username
    return result
  }

  // Strategy 2: Direct profile page
  console.log(`[scraper] Embed failed, trying direct profile for @${username}...`)
  result = await tryDirectProfile(username)
  if (result) {
    result.username = username
    console.log(`[scraper] Direct profile succeeded for @${username}`)
    return result
  }

  // Strategy 3: Proxies
  console.log(`[scraper] Direct failed, trying proxies for @${username}...`)
  result = await tryProxyFetch(username)
  if (result) {
    result.username = username
    console.log(`[scraper] Proxy succeeded for @${username}`)
    return result
  }

  throw new Error(
    'Unable to fetch profile from Instagram. All methods failed — Instagram may be rate-limiting requests from this server. Please try again in a few minutes.'
  )
}
