require('dotenv').config()

const express = require('express')
const cors = require('cors')
const http = require('http')
const authRoutes = require('./routes/auth')
const roomRoutes = require('./routes/rooms')
const paymentsRoutes = require('./routes/payments')
const walletRoutes = require('./routes/wallet')
const usersRoutes = require('./routes/users')
const adminRoutes = require('./routes/admin')
const db = require('./db')
const { setupSocket } = require('./sockets/gameHandler')
const { launch: launchBot } = require('./bot')

const app = express()

const allowedOrigins = [
  'http://localhost:5173',
  'https://frontend-five-sigma-72.vercel.app'
]

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true)
      return
    }

    console.log('Blocked by CORS:', origin)
    callback(new Error('Not allowed by CORS'))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-telegram-init-data', 'x-admin-seed-token']
}
app.use(cors(corsOptions))
app.options(/.*/, cors(corsOptions))
app.use(express.json())
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('Invalid JSON payload:', err.message)
    return res.status(400).json({ error: 'Invalid JSON payload' })
  }
  next(err)
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/auth', authRoutes)
app.use('/api/rooms', roomRoutes)
console.log('✅ API routes mounted: /api/auth, /api/rooms')
app.use('/api/payments', paymentsRoutes)
app.use('/api/wallet', walletRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/admin', adminRoutes)
console.log('✅ Admin routes mounted at /api/admin')

const server = http.createServer(app)
const io = setupSocket(server)

// Optional Redis adapter for horizontal scaling
if (process.env.REDIS_URL) {
  try {
    const { createAdapter } = require('@socket.io/redis-adapter')
    const { createClient } = require('redis')
    const pubClient = createClient({ url: process.env.REDIS_URL })
    const subClient = pubClient.duplicate()
    Promise.all([pubClient.connect(), subClient.connect()])
      .then(() => {
        io.adapter(createAdapter(pubClient, subClient))
        console.log('✅ Redis adapter connected for Socket.io scaling')
      })
      .catch((err) => console.error('Redis adapter error:', err))
  } catch (err) {
    console.log('⚠️ Redis packages not installed. Using in-memory adapter.')
  }
} else {
  console.log('⚠️ REDIS_URL not set. Using in-memory Socket.io adapter.')
}

const PORT = process.env.PORT || 3001

async function start() {
  console.log('⏳ Running database migrations...')
  try {
    await db.migrate.latest()
    console.log('✅ Database migrations completed successfully.')
  } catch (err) {
    console.error('❌ MIGRATION FAILED:', err.message)
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`)
    launchBot()
  })
}

start()

module.exports = { app, server, start }
