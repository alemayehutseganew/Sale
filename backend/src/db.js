const knex = require('knex')
const config = require('../knexfile.js')
const environment = process.env.NODE_ENV || 'development'

const databaseConfig = { ...config[environment] }

if (environment === 'production') {
  const connectionString = typeof databaseConfig.connection === 'string'
    ? databaseConfig.connection
    : process.env.DATABASE_URL

  databaseConfig.connection = {
    connectionString,
    ssl: { rejectUnauthorized: false },
  }
  databaseConfig.pool = {
    ...databaseConfig.pool,
    min: 0,
    max: 10,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    createRetryIntervalMillis: 1000,
    idleTimeoutMillis: 10000,
  }
}

const db = knex(databaseConfig)

const MAX_RETRIES = 5
const BASE_DELAY_MS = 1000
const CONNECTION_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  '08006',
  '08001',
  '57P01',
])

function isConnectionError(error) {
  if (!error) return false
  if (CONNECTION_ERROR_CODES.has(error.code)) return true
  if (error.name === 'KnexTimeoutError') return true

  const message = String(error.message || '')
  return (
    message.includes('Connection terminated') ||
    message.includes('Connection ended') ||
    message.includes('KnexTimeoutError')
  )
}

/**
 * Retry wrapper for critical queries to handle Neon serverless cold starts.
 * Retries with exponential backoff on transient connection errors.
 */
async function withRetry(operation, retries = MAX_RETRIES, baseDelayMs = BASE_DELAY_MS) {
  let retryCount = 0
  while (true) {
    try {
      return await operation()
    } catch (err) {
      if (retries <= 0 || !isConnectionError(err)) throw err

      const delay = baseDelayMs * Math.pow(2, retryCount) + Math.random() * BASE_DELAY_MS
      console.warn(`[DB RETRY] Connection error. Retrying in ${Math.round(delay)}ms... (${retries} attempts left)`)
      await new Promise((resolve) => setTimeout(resolve, delay))
      retries -= 1
      retryCount += 1
    }
  }
}

module.exports = db
module.exports.withRetry = withRetry
