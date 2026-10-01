import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { MongoClient } from 'mongodb'
import { scrapeInstagramProfile } from './scraper.js'

const app = express()
const PORT = process.env.PORT || 3001

const MONGODB_URI = "mongodb+srv://kushangtanawala_db_user:EnjdAi0U7XTsxtOO@cluster.mongodb.net/?retryWrites=true&w=majority"
const DB_NAME = 'insta_fetcher'
const COLLECTION = 'profiles'

let mongoClient = null
let db = null

async function connectMongo() {
  if (mongoClient) return db
  try {
    mongoClient = new MongoClient(MONGODB_URI)
    await mongoClient.connect()
    db = mongoClient.db(DB_NAME)
    console.log('Connected to MongoDB')
    return db
  } catch (err) {
    console.error('MongoDB connection failed:', err.message)
    return null
  }
}

connectMongo()

app.use(cors())
app.use(express.json())

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mongo: db ? 'connected' : 'disconnected' })
})

// Scrape profile
app.get('/api/profile', async (req, res) => {
  const { url } = req.query

  if (!url) {
    return res.status(400).json({ error: 'Missing "url" query parameter.' })
  }

  try {
    // Extract username for cache lookup
    const match = url.match(/instagram\.com\/([A-Za-z0-9_.]+)/)
    const username = match ? match[1] : ''

    if (!username) {
      return res.status(400).json({ error: 'Could not extract username from URL.' })
    }

    // Check MongoDB cache (profiles younger than 1 hour)
    if (db) {
      const cached = await db.collection(COLLECTION).findOne({
        username,
        scrapedAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
      })

      if (cached) {
        console.log(`Cache hit for @${username}`)
        return res.json({ ...cached, _id: undefined, cached: true })
      }
    }

    // Scrape fresh
    console.log(`Scraping @${username}...`)
    const profile = await scrapeInstagramProfile(url)

    // Save to MongoDB cache
    if (db) {
      try {
        await db.collection(COLLECTION).updateOne(
          { username },
          {
            $set: {
              ...profile,
              scrapedAt: new Date(),
            },
          },
          { upsert: true }
        )
        console.log(`Cached @${username}`)
      } catch (cacheErr) {
        console.error('Cache save failed:', cacheErr.message)
      }
    }

    res.json({ ...profile, cached: false })
  } catch (err) {
    console.error('Scrape error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`Insta Fetcher API running on http://localhost:${PORT}`)
})
