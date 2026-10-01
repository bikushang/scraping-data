/*
 * Frontend API client — calls the Node.js backend server
 * which handles Instagram scraping server-side.
 *
 * The backend caches scraped profiles in MongoDB for 1 hour.
 */

export function extractUsername(profileUrl) {
  const match = profileUrl.trim().match(/instagram\.com\/([A-Za-z0-9_.]+)/)
  return match ? match[1] : ''
}

export async function scrapeInstagramProfile(profileUrl) {
  const apiUrl = `/api/profile?url=${encodeURIComponent(profileUrl)}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)

  try {
    const res = await fetch(apiUrl, { signal: controller.signal })
    clearTimeout(timeout)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `Server returned status ${res.status}`)
    }

    const data = await res.json()

    if (data.error) {
      throw new Error(data.error)
    }

    return data
  } catch (err) {
    clearTimeout(timeout)
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. The server may be slow to reach Instagram — please try again.')
    }
    if (err.message?.includes('Failed to fetch')) {
      throw new Error('Could not reach the backend server. Make sure the server is running (npm start in the server folder).')
    }
    throw err
  }
}
