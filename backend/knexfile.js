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
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to configure the database.')
  }
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

module.exports = {
  development: buildConfig(),
  production: {
    client: 'pg',
    connection: {
      connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL),
      ssl: { rejectUnauthorized: false },
    },
    pool: {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 30000,
      idleTimeoutMillis: 30000
    },
    migrations: { directory: './migrations' }
  }
}
