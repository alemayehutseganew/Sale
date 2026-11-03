const knex = require('knex')

let dbUrl = process.env.DATABASE_URL || ''
// Normalize all weak SSL modes to verify-full to prevent pg-connection-string warnings
for (const mode of ['sslmode=prefer', 'sslmode=require', 'sslmode=verify-ca']) {
  if (dbUrl.includes(mode)) {
    dbUrl = dbUrl.replace(mode, 'sslmode=verify-full')
  }
}
process.env.DATABASE_URL = dbUrl

const environment = process.env.NODE_ENV || 'development'
const config = require('../knexfile')[environment]

const db = knex(config)

module.exports = db

