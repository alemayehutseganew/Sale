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
} else {
  console.log('✅ All required environment variables are loaded successfully.');
}

const express = require('express')
const cors = require('cors')
const http = require('http')
const db = require('./db')
const { bot } = require('./bot')

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
    console.log('Blocked by CORS:', origin)
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
  console.log('[SERVER TRACE] Telegram update received!')
  res.sendStatus(200)
  const update = req.body
  setImmediate(() => {
    bot.handleUpdate(update).catch((err) => {
      console.error('[WEBHOOK ASYNC ERROR]:', err)
    })
  })
})

// --- API routes ---
function useLazyRouter(path, modulePath) {
  app.use(path, (req, res, next) => {
    require(modulePath)(req, res, next)
  })
}

useLazyRouter('/api/auth', './routes/auth')
useLazyRouter('/api/rooms', './routes/rooms')
useLazyRouter('/api/payments', './routes/payments')
useLazyRouter('/api/wallet', './routes/wallet')
useLazyRouter('/api/users', './routes/users')
useLazyRouter('/api/admin', './routes/admin')
console.log('✅ API routes mounted: /api/auth, /api/rooms, /api/payments, /api/wallet, /api/users, /api/admin')

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
let io

function configureRedisAdapter() {
  if (!process.env.REDIS_URL) {
    console.log('⚠️ REDIS_URL not set. Using in-memory Socket.io adapter.')
    return
  }

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
      .catch((err) => console.error('❌ Redis adapter error:', err))
  } catch (err) {
    console.log('⚠️ Redis packages not installed. Using in-memory adapter.')
  }
}

const PORT = process.env.PORT || 3001

async function start() {
  console.log('⏳ Running database migrations...')
  const connectionConfig = { ...db.client.config.connection }
  if (connectionConfig.connectionString) {
    connectionConfig.connectionString = '[REDACTED]'
  }
  if (connectionConfig.password) {
    connectionConfig.password = '[REDACTED]'
  }
  console.log('=== DATABASE CONNECTION DEBUG ===')
  console.log('NODE_ENV:', process.env.NODE_ENV)
  console.log('DATABASE_URL loaded:', Boolean(process.env.DATABASE_URL))
  console.log('Knex Config being used:', JSON.stringify({
    client: db.client.config.client,
    connection: connectionConfig
  }, null, 2))
  console.log('Knex Pool settings:', JSON.stringify(db.client.config.pool, null, 2))
  console.log('=================================')
  try {
    await db.migrate.latest()
    console.log('✅ Database migrations complete')
  } catch (err) {
    console.error('❌ MIGRATION FAILED:', err)
    // Do NOT process.exit(1) here. Let the server start so we can see the real error.
  }

  const { setupSocket } = require('./sockets/gameHandler')
  io = setupSocket(server)
  app.set('io', io)
  configureRedisAdapter()

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`)
    console.log('🤖 Telegram webhook handler is ready')

    const WEBHOOK_URL = process.env.WEBHOOK_URL
    if (WEBHOOK_URL) {
      bot.telegram.setWebhook(`${WEBHOOK_URL}/telegraf/${bot.secretPathComponent()}`)
        .then(() => console.log('✅ Telegram Webhook set successfully to:', WEBHOOK_URL))
        .catch((err) => console.error('❌ Failed to set Telegram Webhook:', err))
    } else {
      console.error('❌ WEBHOOK_URL is not defined in environment variables!')
    }
  })
}

// --- Graceful shutdown (important for real-money: avoid mid-transaction kills) ---
function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`)
  const closeServer = () => {
    server.close(() => {
      db.destroy()
        .catch((err) => console.error('DB destroy error:', err))
        .finally(() => {
          console.log('👋 Shutdown complete')
          process.exit(0)
        })
    })
  }
  if (io) io.close(closeServer)
  else closeServer()
  // Hard exit if something hangs
  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout')
    process.exit(1)
  }, 10_000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED REJECTION]:', err)
});

start()

module.exports = { app, server, start }