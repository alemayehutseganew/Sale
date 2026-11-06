const crypto = require('crypto')
const express = require('express')
const jwt = require('jsonwebtoken')
const db = require('../src/db')

function jwtSecret() {
  return process.env.JWT_SECRET || 'dev-secret'
}

function nextTelegramId() {
  return 7000000000000 + (Date.now() % 1000000000) * 100 + crypto.randomInt(100)
}

function createTestContext() {
  const telegramIds = new Set()
  const roomIds = new Set()

  return {
    trackTelegramId(id) {
      telegramIds.add(String(id))
    },
    trackRoomId(id) {
      roomIds.add(id)
    },
    async cleanup() {
      const users = telegramIds.size
        ? await db('users').whereIn('telegram_id', [...telegramIds]).select('id')
        : []
      const userIds = users.map((user) => user.id)

      if (userIds.length) {
        await db('financial_ledger').whereIn('user_id', userIds).del()
        await db('verified_transactions').whereIn('user_id', userIds).del()
      }
      if (roomIds.size) {
        await db('game_rooms').whereIn('id', [...roomIds]).del()
      }
      if (userIds.length) {
        await db('users').whereIn('id', userIds).del()
      }
    },
  }
}

async function createTestUser(context, options = {}) {
  const telegramId = options.telegramId || nextTelegramId()
  const username = options.username || `qa_${telegramId}`
  context.trackTelegramId(telegramId)
  const [user] = await db('users').insert({
    telegram_id: telegramId,
    username,
    first_name: options.firstName || 'QA Player',
    wallet_balance: options.walletBalance ?? 0,
    referral_code: options.referralCode || `@${username}`,
    referral_balance: options.referralBalance ?? 0,
    referred_by: options.referredBy || null,
  }).returning('*')
  return user
}

function createApiApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/auth', require('../src/routes/auth'))
  app.use('/api/wallet', require('../src/routes/wallet'))
  app.use('/api/rooms', require('../src/routes/rooms'))
  return app
}

function createToken(user) {
  return jwt.sign({ id: user.id, telegram_id: user.telegram_id }, jwtSecret(), { expiresIn: '1h' })
}

function createInitData({ id, username, firstName = 'QA Player' }) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `qa-${id}`,
    user: JSON.stringify({ id: Number(id), username, first_name: firstName }),
  })
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secretKey = crypto.createHmac('sha256', 'WebAppData')
    .update(process.env.TELEGRAM_BOT_TOKEN)
    .digest()
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')
  params.set('hash', hash)
  return params.toString()
}

function trackRoom(context, room) {
  context.trackRoomId(room.id)
  return room
}

async function createTestRoom(context, options = {}) {
  const [room] = await db('game_rooms').insert({
    stake_amount: options.stake ?? 10,
    status: options.status || 'WAITING',
    called_numbers: options.calledNumbers || [],
  }).returning('*')
  return trackRoom(context, room)
}

async function addParticipant(roomId, user, cardId = 1, card) {
  const { generateCardFromNumber } = require('../src/utils/cardGenerator')
  const matrix = card || generateCardFromNumber(cardId)
  await db('room_participants').insert({
    room_id: roomId,
    user_id: user.id,
    is_winner: false,
  })
  await db('room_card_selections').insert({
    room_id: roomId,
    user_id: user.id,
    card_id: cardId,
    card: JSON.stringify(matrix),
    status: 'reserved',
  })
  return matrix
}

module.exports = {
  addParticipant,
  createApiApp,
  createInitData,
  createTestContext,
  createTestRoom,
  createTestUser,
  createToken,
  db,
  jwtSecret,
  nextTelegramId,
}
