import { MongoClient } from 'mongodb'
import { scrapeInstagramProfile } from '../../server/scraper.js'

const DB_NAME = 'insta_fetcher'
const COLLECTION = 'profiles'
let db

async function getDatabase() {
  if (db || !process.env.MONGODB_URI) return db
  try {
    const client = new MongoClient(process.env.MONGODB_URI)
    await client.connect()
    db = client.db(DB_NAME)
    console.log('Connected to MongoDB')
  } catch (error) {
    console.error('MongoDB connection failed:', error.message)
  }
  return db
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  }
}

export default async function handler(event) {
  if (event.httpMethod !== 'GET') return response(405, { error: 'Method not allowed.' })

  const url = event.queryStringParameters?.url
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
