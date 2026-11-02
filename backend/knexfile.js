require('dotenv').config()

function buildConfig() {
  const base = {
    migrations: { directory: './migrations' },
    pool: {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 60000,
      idleTimeoutMillis: 30000,
    },
  }
  if (process.env.DATABASE_URL) {
    return {
      ...base,
      client: 'pg',
      connection: {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
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

const config = buildConfig()

module.exports = {
  development: config,
  production: config,
}

