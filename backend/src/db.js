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

/**
 * Retry wrapper for critical queries to handle Neon serverless cold starts.
 * Retries with exponential backoff on transient connection errors.
 */
async function withRetry(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      const message = String(err.message || '')
      const isTransient =
        /connection|timeout|socket|ECONNREFUSED|ETIMEDOUT|terminating|server closed|cold/i.test(message)
      if (!isTransient || attempt === maxRetries - 1) break
      const delay = baseDelay * Math.pow(2, attempt)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw lastError
}

module.exports = db
module.exports.withRetry = withRetry
