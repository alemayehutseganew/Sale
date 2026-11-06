const path = require('path')

require('dotenv').config({
  path: path.resolve(__dirname, '../.env'),
  quiet: true,
})

process.env.NODE_ENV = 'development'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must point to a dedicated YogaBingo test database.')
}
process.env.TELEGRAM_BOT_TOKEN ||= '123456:TEST_TOKEN'
process.env.LINKS_ET_API_KEY ||= 'mock-links-et-key'

let databaseName
try {
  const databaseUrl = new URL(process.env.DATABASE_URL)
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error('DATABASE_URL must use PostgreSQL.')
  }
  databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ''))
} catch (err) {
  throw new Error(`DATABASE_URL must be a PostgreSQL URL for a dedicated test database: ${err.message}`)
}

if (!/(^|[_-])test([_-]|$)/i.test(databaseName)) {
  throw new Error('Refusing to run database tests: DATABASE_URL database name must contain "test".')
}
