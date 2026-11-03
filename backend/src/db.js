const knex = require('knex')

let dbUrl = process.env.DATABASE_URL || ''
if (dbUrl.includes('sslmode=require')) {
  dbUrl = dbUrl.replace('sslmode=require', 'sslmode=verify-full')
}
process.env.DATABASE_URL = dbUrl

const environment = process.env.NODE_ENV || 'development'
const config = require('../knexfile')[environment]

const db = knex(config)

module.exports = db

