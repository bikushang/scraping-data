import { useState } from 'react'
import { Search, Loader2, AlertCircle, ImageIcon, Video, User, Link2, Lock, Globe, Heart, MessageCircle, Play, Eye, BadgeCheck, RefreshCw, Database } from 'lucide-react'
import { scrapeInstagramProfile } from './instagramScraper'

function Instagram({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  )
}

function App() {
  const [profileLink, setProfileLink] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)

  const handleSubmit = async (e) => {
    e?.preventDefault()
    setError('')
    setProfile(null)

    if (!profileLink.trim()) {
      setError('Please enter an Instagram profile link.')
      return
    }

    const urlPattern = /^https?:\/\/(www\.)?instagram\.com\/[A-Za-z0-9_.]+\/?/
    if (!urlPattern.test(profileLink.trim())) {
      setError('Please enter a valid Instagram profile URL (e.g. https://instagram.com/username).')
      return
    }

    setLoading(true)
    try {
      const data = await scrapeInstagramProfile(profileLink)
      setProfile(data)
    } catch (err) {
      setError(err.message || 'Failed to fetch profile data. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleRetry = () => {
    if (profileLink) handleSubmit()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4 sm:px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600">
            <Instagram className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight sm:text-xl">Insta Fetcher</h1>
            <p className="hidden text-xs text-slate-500 sm:block">Get public Instagram profile data, posts & reels</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* Search Card */}
        <div className="mx-auto mb-8 max-w-2xl">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="mb-1 text-xl font-bold">Enter Instagram Profile Link</h2>
            <p className="mb-4 text-sm text-slate-500">
              Paste a public profile URL to fetch bio, recent posts, and reels. Private profiles will be detected automatically.
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={profileLink}
                  onChange={(e) => setProfileLink(e.target.value)}
                  placeholder="https://instagram.com/username"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-pink-500 focus:bg-white focus:ring-2 focus:ring-pink-500/20"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:shadow-lg hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Fetching...
                  </>
                ) : (
                  <>
                    <Search className="h-5 w-5" />
                    Fetch Data
                  </>
                )}
              </button>
            </form>

            {/* Error */}
            {error && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                <div className="flex-1">
                  <span>{error}</span>
                  <button
                    onClick={handleRetry}
                    className="mt-2 flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-800"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Try again
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="mx-auto max-w-3xl animate-pulse">
            <div className="flex gap-6">
              <div className="h-24 w-24 rounded-full bg-slate-200" />
              <div className="flex-1 space-y-3 py-2">
                <div className="h-5 w-40 rounded bg-slate-200" />
                <div className="h-4 w-64 rounded bg-slate-200" />
                <div className="flex gap-6">
                  <div className="h-4 w-20 rounded bg-slate-200" />
                  <div className="h-4 w-20 rounded bg-slate-200" />
                  <div className="h-4 w-20 rounded bg-slate-200" />
                </div>
              </div>
            </div>
            <div className="mt-8 grid grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="aspect-square rounded-xl bg-slate-200" />
              ))}
            </div>
          </div>
        )}

        {/* Profile Results */}
        {profile && !loading && (
          <div className="mx-auto max-w-3xl space-y-8">
            {/* Private profile banner */}
            {profile.isPrivate && (
              <div className="flex items-center gap-3 rounded-2xl border border-slate-300 bg-slate-100 p-6">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-slate-300">
                  <Lock className="h-6 w-6 text-slate-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">This Account is Private</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Only approved followers can see @{profile.username}'s posts and reels. Profile details below are limited.
                  </p>
                </div>
              </div>
            )}

            {/* Profile Header */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              {profile.cached && (
                <div className="mb-4 flex items-center justify-end">
                  <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600">
                    <Database className="h-3 w-3" /> Cached from MongoDB
                  </span>
                </div>
              )}
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
                {/* Avatar */}
                <div className="flex-shrink-0">
                  {profile.profilePicUrl ? (
                    <img
                      src={profile.profilePicUrl}
                      alt={profile.username}
                      className="h-24 w-24 rounded-full border-2 border-pink-500 object-cover"
                    />
                  ) : (
                    <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-pink-500 bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600">
                      <User className="h-12 w-12 text-white" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 text-center sm:text-left">
                  <div className="flex flex-col items-center gap-1 sm:flex-row sm:items-center sm:gap-3">
                    <h2 className="text-xl font-bold">@{profile.username}</h2>
                    {profile.isVerified && (
                      <BadgeCheck className="h-5 w-5 text-blue-500" />
                    )}
                    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${profile.isPrivate ? 'bg-slate-200 text-slate-600' : 'bg-green-100 text-green-700'}`}>
                      {profile.isPrivate ? (
                        <>
                          <Lock className="h-3 w-3" /> Private
                        </>
                      ) : (
                        <>
                          <Globe className="h-3 w-3" /> Public
                        </>
                      )}
                    </span>
                  </div>
                  {profile.fullName && (
                    <p className="mt-1 font-medium text-slate-700">{profile.fullName}</p>
                  )}
                  {profile.category && (
                    <p className="text-sm text-slate-500">{profile.category}</p>
                  )}

                  {/* Stats */}
                  <div className="mt-4 flex justify-center gap-8 sm:justify-start">
                    <div>
                      <span className="font-bold">{profile.postsCount.toLocaleString()}</span>
                      <span className="ml-1 text-sm text-slate-500">posts</span>
                    </div>
                    <div>
                      <span className="font-bold">{profile.followers.toLocaleString()}</span>
                      <span className="ml-1 text-sm text-slate-500">followers</span>
                    </div>
                    <div>
                      <span className="font-bold">{profile.following.toLocaleString()}</span>
                      <span className="ml-1 text-sm text-slate-500">following</span>
                    </div>
                  </div>

                  {/* Bio */}
                  {profile.bio && (
                    <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-600">{profile.bio}</p>
                  )}

                  {/* External link */}
                  {profile.externalUrl && (
                    <a
                      href={profile.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-pink-600 hover:underline"
                    >
                      <Link2 className="h-4 w-4" />
                      {profile.externalUrl}
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Posts Section — only show for public profiles */}
            {!profile.isPrivate && (
              <div>
                <div className="mb-4 flex items-center gap-2">
                  <ImageIcon className="h-5 w-5 text-slate-700" />
                  <h3 className="text-lg font-bold">Recent Posts</h3>
                  <span className="text-sm text-slate-400">(first 3)</span>
                </div>

                {profile.posts && profile.posts.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {profile.posts.map((post) => (
                      <PostCard key={post.id} post={post} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
                    {profile.hasJsonData
                      ? 'This profile has no posts to display.'
                      : 'Instagram returned limited data for this profile. Posts could not be fetched without a full JSON response.'}
                  </div>
                )}
              </div>
            )}

            {/* Reels Section — only show for public profiles */}
            {!profile.isPrivate && (
              <div>
                <div className="mb-4 flex items-center gap-2">
                  <Video className="h-5 w-5 text-slate-700" />
                  <h3 className="text-lg font-bold">Recent Reels</h3>
                  <span className="text-sm text-slate-400">(first 3)</span>
                </div>

                {profile.reels && profile.reels.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {profile.reels.map((reel) => (
                      <ReelCard key={reel.id} reel={reel} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
                    {profile.hasJsonData
                      ? 'This profile has no reels to display.'
                      : 'Instagram returned limited data for this profile. Reels could not be fetched without a full JSON response.'}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Empty state (no search yet) */}
        {!profile && !loading && !error && (
          <div className="mx-auto max-w-md py-16 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600">
              <Instagram className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700">Search for a profile</h3>
            <p className="mt-2 text-sm text-slate-500">
              Enter an Instagram profile URL above to fetch the user's bio, recent posts, and reels.
            </p>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        Insta Fetcher — public profiles only · no API key required
      </footer>
    </div>
  )
}

function PostCard({ post }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="relative aspect-square bg-slate-100">
        {post.imageUrl ? (
          <img src={post.imageUrl} alt={post.caption || 'Post'} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon className="h-10 w-10 text-slate-300" />
          </div>
        )}
        {post.isVideo && (
          <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50">
            <Play className="h-4 w-4 text-white" />
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm text-slate-600">{post.caption || 'No caption'}</p>
        <div className="mt-2 flex items-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <Heart className="h-3.5 w-3.5" />
            {post.likes?.toLocaleString() ?? 0}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5" />
            {post.comments?.toLocaleString() ?? 0}
          </span>
        </div>
      </div>
    </div>
  )
}

function ReelCard({ reel }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="relative aspect-[9/16] bg-slate-100">
        {reel.imageUrl ? (
          <img src={reel.imageUrl} alt={reel.caption || 'Reel'} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Video className="h-10 w-10 text-slate-300" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition hover:opacity-100">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90">
            <Play className="h-6 w-6 text-pink-600" />
          </div>
        </div>
        <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50">
          <Video className="h-4 w-4 text-white" />
        </div>
        {reel.views != null && (
          <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-xs font-medium text-white">
            <Eye className="h-3 w-3" />
            {reel.views.toLocaleString()}
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm text-slate-600">{reel.caption || 'No caption'}</p>
        <div className="mt-2 flex items-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <Heart className="h-3.5 w-3.5" />
            {reel.likes?.toLocaleString() ?? 0}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5" />
            {reel.comments?.toLocaleString() ?? 0}
          </span>
        </div>
      </div>
    </div>
  )
}

export default App
