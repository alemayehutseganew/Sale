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

module.exports = knex(databaseConfig)
