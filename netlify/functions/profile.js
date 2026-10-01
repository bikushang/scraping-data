import { MongoClient } from 'mongodb'
import { scrapeInstagramProfile } from '../../server/scraper.js'

const DB_NAME = 'insta_fetcher'
const COLLECTION = 'profiles'
let db

async function getDatabase() {
  if (db || !process.env.MONGODB_URI) return db
  try {
    const client = new MongoClient("mongodb+srv://kushangtanawala_db_user:EnjdAi0U7XTsxtOO@cluster.mongodb.net/?retryWrites=true&w=majority")
    await client.connect()
    db = client.db(DB_NAME)
    console.log('Connected to MongoDB')
  } catch (error) {
    console.error('MongoDB connection failed:', error.message)
  }
  return db
}

function response(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  })
}

export default async function handler(request) {
  // Netlify's current runtime passes a Request, while the fallback fields
  // keep this usable if the function is invoked with the older event shape.
  const method = request.method || request.httpMethod
  if (method !== 'GET') return response(405, { error: 'Method not allowed.' })

  const queryUrl = request.url ? new URL(request.url).searchParams.get('url') : null
  const url = queryUrl || request.queryStringParameters?.url
  if (!url) return response(400, { error: 'Missing "url" query parameter.' })

  const match = url.match(/instagram\.com\/([A-Za-z0-9_.]+)/)
  const username = match ? match[1] : ''
  if (!username) return response(400, { error: 'Could not extract username from URL.' })

  try {
    const database = await getDatabase()
    if (database) {
      const cached = await database.collection(COLLECTION).findOne({
        username,
        scrapedAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
      })
      if (cached) {
        const { _id, ...profile } = cached
        return response(200, { ...profile, cached: true })
      }
    }

    const profile = await scrapeInstagramProfile(url)
    if (database) {
      try {
        await database.collection(COLLECTION).updateOne(
          { username },
          { $set: { ...profile, scrapedAt: new Date() } },
          { upsert: true },
        )
      } catch (error) {
        console.error('Cache save failed:', error.message)
      }
    }
    return response(200, { ...profile, cached: false })
  } catch (error) {
    console.error('Scrape error:', error.message)
    return response(500, { error: error.message || 'Unable to fetch profile.' })
  }
}
