const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true })

const knex = require('knex')
const normalizeDatabaseUrl = require('./dbUrl')

if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = normalizeDatabaseUrl(process.env.DATABASE_URL)
}

const environment = process.env.NODE_ENV || 'development'
const config = require('../knexfile')[environment]

const db = knex(config)

module.exports = db
