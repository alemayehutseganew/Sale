const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true })

const criticalEnvVars = ['LINKS_ET_API_KEY', 'TELEBIRR_RECEIVER_NUMBER']
const missingCriticalEnvVars = criticalEnvVars.filter(v => !process.env[v])
if (missingCriticalEnvVars.length > 0) {
  console.error('❌ CRITICAL ERROR: Missing required Telebirr configuration:', missingCriticalEnvVars.join(', '))
  process.exit(1)
}

const requiredEnvVars = [
  'DATABASE_URL',
  'TELEGRAM_BOT_TOKEN',
  'JWT_SECRET',
  'TELEBIRR_RECEIVER_NUMBER',
  'TELEBIRR_RECEIVER_NAME',
  'LINKS_ET_API_KEY',
  'FRONTEND_URL'
];

const missingVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingVars.length > 0) {
  console.error('❌ CRITICAL ERROR: Missing environment variables:', missingVars.join(', '));
  if (process.env.NODE_ENV === 'production') {
    console.error('If running on Enzonic, ensure these are added in the Enzonic Dashboard.');
  }
}

const express = require('express')
const cors = require('cors')
const http = require('http')
const authRoutes = require('./routes/auth')
const roomRoutes = require('./routes/rooms')
const paymentsRoutes = require('./routes/payments')
const walletRoutes = require('./routes/wallet')
const usersRoutes = require('./routes/users')
const adminRoutes = require('./routes/admin')
const { Server } = require('socket.io')
const jwt = require('jsonwebtoken')
const db = require('./db')
const { getWebhookBaseUrl, getBotWebhookUrl } = require('./bot/webhookUrl')
const { initGameHandler } = require('./sockets/gameHandler')
const { bot } = require('./bot')

async function performStartupCleanup() {
  try {
    await cleanupStaleRooms()
  } catch (err) {
    console.error('[ERROR] Startup room cleanup failed:', err)
  }
}

async function cleanupStaleRooms() {
  const staleRooms = await db('game_rooms')
    .whereIn('status', ['WAITING', 'COUNTDOWN'])
    .andWhere('created_at', '<', db.raw("NOW() - INTERVAL '1 hour'"))
    .select('id')

  if (staleRooms.length === 0) return

  const roomIds = staleRooms.map((room) => room.id)
  await db.transaction(async (trx) => {
    await trx('room_card_selections').whereIn('room_id', roomIds).del()
    await trx('room_participants').whereIn('room_id', roomIds).del()
    await trx('game_rooms').whereIn('id', roomIds).del()
  })
}

function startPeriodicCleanup() {
  let cleanupRunning = false
  setInterval(async () => {
    if (cleanupRunning) return
    cleanupRunning = true
    try {
      await cleanupStaleRooms()
    } catch (err) {
      console.error('[Cron] Periodic cleanup failed:', err)
    } finally {
      cleanupRunning = false
    }
  }, 10 * 60 * 1000)
}

async function initializeHeavyServices() {
  const baseUrl = getWebhookBaseUrl()
  try {
    const webhookUrl = getBotWebhookUrl(baseUrl, bot.secretPathComponent())
    await bot.telegram.setWebhook(webhookUrl)
    console.log(`✅ Sale Telegram Webhook set successfully to: ${baseUrl}`)
  } catch (err) {
    console.error('❌ Failed to set Sale Telegram Webhook:', err)
    throw err
  }

  await performStartupCleanup()
  startPeriodicCleanup()
}

const app = express()

// --- App hardening ---
app.disable('x-powered-by')
app.set('trust proxy', 1) // Enzonic sits behind a proxy (needed for correct req.ip / rate limits)

// --- CORS ---
const configuredOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://ked-seven.vercel.app',
  process.env.FRONTEND_URL
].filter(Boolean)

const corsOptions = {
  origin: (origin, callback) => {
    // Allow server-to-server / curl / Telegram WebView requests with no Origin header
    if (!origin) return callback(null, true)
    if (configuredOrigins.includes(origin)) return callback(null, true)
    // Allow Vercel preview deployments (e.g. frontend-git-branch.vercel.app)
    if (origin.endsWith('.vercel.app')) return callback(null, true)
    return callback(new Error('Not allowed by CORS'))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-telegram-init-data', 'x-admin-seed-token']
}

// cors() already answers OPTIONS preflight requests — no app.options() needed.
app.use(cors(corsOptions))
app.use(express.json({ limit: '1mb' }))

// --- Health check ---
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.post(`/telegraf/${bot.secretPathComponent()}`, (req, res) => {
  console.log('[WEBHOOK TRACE] Received update from Telegram for Sale:', req.body?.update_id)
  res.sendStatus(200)
  try {
    bot.handleUpdate(req.body).catch((err) => console.error('❌ [WEBHOOK ASYNC ERROR]', err))
  } catch (err) {
    console.error('❌ [WEBHOOK SYNC ERROR]', err)
  }
})

// --- API routes ---
app.use('/api/auth', authRoutes)
app.use('/api/rooms', roomRoutes)
app.use('/api/payments', paymentsRoutes)
app.use('/api/wallet', walletRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/admin', adminRoutes)

// --- 404 (must come after all routes) ---
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// --- Global error handler (must be the LAST middleware) ---
// Express forwards errors from express.json() and any route via next(err) to this handler.
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('Invalid JSON payload:', err.message)
    return res.status(400).json({ error: 'Invalid JSON payload' })
  }
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS: origin not allowed' })
  }
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

// --- HTTP + Socket.io ---
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: [
      'https://noor-one-beta.vercel.app',
      'https://ked-seven.vercel.app',
      'https://sale-green.vercel.app'
    ],
    methods: ['GET', 'POST'],
    credentials: true
  }
})
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'
io.use((socket, next) => {
  const token = socket.handshake.auth?.token
  if (!token) return next()

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    if (payload.id) socket.data.userId = payload.id
  } catch (err) {
    console.error('[ERROR] Invalid socket auth token:', err.message)
  }
  next()
})
initGameHandler(io)
app.set('io', io)

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
      })
      .catch((err) => console.error('❌ Redis adapter error:', err))
  } catch (err) {
    console.error('[ERROR] Redis packages are unavailable:', err)
  }
}

const PORT = process.env.PORT || 3001

async function start() {
  await db.migrate.latest()
  await initializeHeavyServices()

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(PORT, '0.0.0.0', () => {
      server.removeListener('error', reject)
      resolve()
    })
  })
  console.log(`✅ Backend listening on port ${PORT}`)
}

// --- Graceful shutdown (important for real-money: avoid mid-transaction kills) ---
function shutdown() {
  io.close(() => {
    server.close(() => {
      db.destroy()
        .catch((err) => console.error('DB destroy error:', err))
        .finally(() => {
          process.exit(0)
        })
    })
  })
  // Hard exit if something hangs
  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout')
    process.exit(1)
  }, 10_000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED REJECTION]:', err)
});

start().catch(async (err) => {
  console.error('❌ STARTUP FAILED:', err)
  try {
    await db.destroy()
  } catch (shutdownError) {
    console.error('❌ Failed to close database after startup failure:', shutdownError)
  }
  process.exitCode = 1
})

module.exports = { app, server, start }