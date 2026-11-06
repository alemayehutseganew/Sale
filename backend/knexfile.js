const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env'), quiet: true });
const normalizeDatabaseUrl = require('./src/dbUrl')

function buildConfig(isProduction = false) {
  const base = {
    migrations: { directory: './migrations' },
    pool: {
      min: 0,
      max: 1,
      acquireTimeoutMillis: 60000,
      ...(isProduction ? { createTimeoutMillis: 30000 } : {}),
      idleTimeoutMillis: 10000,
    },
  }
  const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL)
  if (databaseUrl) {
    process.env.DATABASE_URL = databaseUrl
    return {
      ...base,
      client: 'pg',
      connection: {
        connectionString: databaseUrl,
        ssl: isProduction ? { rejectUnauthorized: false } : false,
      },
    }
  }
  return {
    ...base,
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'postgres',
    },
  }
}

module.exports = {
  development: buildConfig(),
  production: {
    client: 'pg',
    connection: {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false } // Required for Enzonic SSL
    },
    pool: {
      min: 0, // CRITICAL: Do not keep idle connections
      max: 1, // CRITICAL: Only 1 connection per serverless instance
      acquireTimeoutMillis: 60000,
      createTimeoutMillis: 30000,
      idleTimeoutMillis: 10000
    },
    migrations: {
      directory: './migrations'
    }
  }
}
