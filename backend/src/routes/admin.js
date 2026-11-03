const express = require('express')
const router = express.Router()
const db = require('../db')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const { adminAuth, JWT_SECRET } = require('../middleware/adminAuth')
const archiveData = require('../../scripts/archive_old_data');

function verifyPassword(password, stored) {
  if (/^\$2[aby]\$/.test(stored)) {
    return bcrypt.compareSync(password, stored)
  }

  const [salt, derived] = stored.split(':')
  const check = crypto.scryptSync(password, salt, 64).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(derived, 'hex'))
}

router.post('/seed', async (req, res) => {
  const configuredToken = process.env.ADMIN_SEED_TOKEN
  const providedToken = req.get('x-admin-seed-token') || ''
  if (!configuredToken || Buffer.byteLength(configuredToken, 'utf8') < 32) {
    return res.status(503).json({ error: 'Admin seeding is not configured.' })
  }

  const expected = Buffer.from(configuredToken, 'utf8')
  const provided = Buffer.from(providedToken, 'utf8')
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return res.status(401).json({ error: 'Unauthorized.' })
  }

  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  const passwordLength = Buffer.byteLength(password, 'utf8')
  if (username !== 'kedir') {
    return res.status(400).json({ error: 'This endpoint only provisions the kedir admin account.' })
  }
  if (passwordLength < 16 || passwordLength > 72) {
    return res.status(400).json({ error: 'Password must be 16-72 bytes.' })
  }

  try {
    const passwordHash = bcrypt.hashSync(password, 10)
    const inserted = await db('admins')
      .insert({ username, password_hash: passwordHash })
      .onConflict('username')
      .ignore()
      .returning('id')

    if (!inserted.length) {
      return res.status(409).json({ error: 'Admin username already exists.' })
    }

    return res.status(201).json({ message: `Admin '${username}' created successfully.` })
  } catch (err) {
    console.error('Admin seed error:', err.message)
    return res.status(500).json({ error: 'Failed to create admin.' })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body
    const admin = await db('admins').where({ username }).first()
    if (!admin || !verifyPassword(password, admin.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '24h' })
    res.json({ token })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/stats', adminAuth, async (req, res) => {
  try {
    const userCountResult = await db('users').count('* as count').first()
    const totalUsers = parseInt(userCountResult.count, 10)

    const activeGamesResult = await db('game_rooms')
      .whereIn('status', ['WAITING', 'COUNTDOWN', 'PLAYING'])
      .count('* as count')
      .first()
    const activeGames = parseInt(activeGamesResult.count, 10)

    const wageredResult = await db('financial_ledger')
      .where({ type: 'ENTRY_FEE' })
      .sum(db.raw('ABS(amount) as total'))
      .first()
    const totalWagered = parseFloat(wageredResult.total || 0).toFixed(2)

    const payoutsResult = await db('financial_ledger')
      .where({ type: 'WINNING_PAYOUT' })
      .sum('amount as total')
      .first()
    const totalPayouts = parseFloat(payoutsResult.total || 0).toFixed(2)

    const platformProfit = (parseFloat(totalWagered) - parseFloat(totalPayouts)).toFixed(2)

    res.json({
      totalUsers,
      activeGames,
      totalWagered,
      totalPayouts,
      platformProfit,
    })
  } catch (err) {
    console.error('Stats error:', err)
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
})

router.get('/users', adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const requestedLimit = parseInt(req.query.limit, 10) || 100
    const limit = Math.min(Math.max(requestedLimit, 1), 100)
    const offset = (page - 1) * limit
    const users = await db('users')
      .select('id', 'telegram_id', 'first_name', 'username', 'wallet_balance', 'created_at')
      .orderBy('wallet_balance', 'desc')
      .orderBy('id', 'desc')
      .limit(limit)
      .offset(offset)
    const total = await db('users').count('* as c').first()
    res.json({ users, total: Number(total.c), page, limit })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/users/:id/adjust-balance', adminAuth, async (req, res) => {
  try {
    const { amount, type } = req.body
    const user = await db('users').where({ id: req.params.id }).first()
    if (!user) return res.status(404).json({ error: 'User not found' })
    const amt = Number(amount)
    if (type === 'add') {
      await db('users').where({ id: user.id }).increment('wallet_balance', amt)
    } else if (type === 'subtract') {
      await db('users').where({ id: user.id }).decrement('wallet_balance', amt)
    } else {
      return res.status(400).json({ error: 'Invalid type' })
    }
    const hasLedger = await db.schema.hasTable('financial_ledger')
    if (hasLedger) {
      await db('financial_ledger').insert({
        user_id: user.id,
        type: `admin_${type}`,
        amount: amt,
        reference: `ADMIN-${Date.now()}`,
        created_at: new Date(),
      })
    }
    const updated = await db('users').where({ id: user.id }).first()
    res.json({ success: true, user: updated })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/games', adminAuth, async (req, res) => {
  try {
    const games = await db('game_rooms')
      .select(
        'game_rooms.id',
        'game_rooms.stake_amount',
        'game_rooms.status',
        'game_rooms.created_at',
        db.raw('COUNT(room_participants.id) as total_players')
      )
      .leftJoin('room_participants', 'game_rooms.id', 'room_participants.room_id')
      .groupBy('game_rooms.id')
      .orderBy('game_rooms.created_at', 'desc')
      .limit(100)

    const gameIds = games.map(g => g.id)
    const winners = await db('room_participants')
      .join('users', 'room_participants.user_id', 'users.id')
      .whereIn('room_participants.room_id', gameIds)
      .andWhere('room_participants.is_winner', true)
      .select('room_participants.room_id', 'users.first_name', 'users.username')

    const winnerMap = {}
    winners.forEach(w => winnerMap[w.room_id] = w.first_name || w.username || 'Unknown')

    const result = games.map(g => ({
      ...g,
      winner_name: winnerMap[g.id] || 'No Winner / In Progress'
    }))

    res.json({ games: result })
  } catch (err) {
    console.error('Games fetch error:', err)
    res.status(500).json({ error: err.message })
  }
})

router.get('/payments', adminAuth, async (req, res) => {
  try {
    const ledgerTransactions = await db('financial_ledger')
      .join('users', 'financial_ledger.user_id', 'users.id')
      .select(
        'financial_ledger.id',
        'users.first_name',
        'users.username',
        'users.telegram_id',
        'financial_ledger.amount',
        db.raw("CASE financial_ledger.type WHEN 'game_win' THEN 'WINNING_PAYOUT' WHEN 'admin_add' THEN 'ADMIN_ADJUSTMENT' WHEN 'admin_subtract' THEN 'ADMIN_ADJUSTMENT' ELSE UPPER(financial_ledger.type) END as type"),
        'financial_ledger.reference as reference_id',
        'financial_ledger.created_at'
      )
      .orderBy('financial_ledger.created_at', 'desc')
      .limit(200)

    const pendingPayments = await db('payments')
      .join('users', 'payments.user_id', 'users.id')
      .where({ 'payments.status': 'pending' })
      .select(
        'payments.id as payment_id',
        'users.first_name',
        'users.username',
        'users.telegram_id',
        'payments.amount',
        'payments.type',
        'payments.transaction_reference as reference_id',
        'payments.created_at'
      )
      .orderBy('payments.created_at', 'desc')

    const transactions = [
      ...pendingPayments.map((payment) => ({
        ...payment,
        id: `pending-${payment.payment_id}`,
        type: payment.type === 'deposit' ? 'DEPOSIT' : 'WITHDRAWAL',
        status: 'pending',
      })),
      ...ledgerTransactions.map((transaction) => ({ ...transaction, status: 'completed' })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 200)

    res.json({ transactions })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/payments/:id/approve', adminAuth, async (req, res) => {
  try {
    let paymentType
    await db.transaction(async (trx) => {
      const p = await trx('payments').where({ id: req.params.id }).forUpdate().first()
      if (!p) {
        const err = new Error('Not found')
        err.statusCode = 404
        throw err
      }
      if (p.status !== 'pending') {
        const err = new Error('Payment already processed')
        err.statusCode = 400
        throw err
      }

      const user = await trx('users').where({ id: p.user_id }).first()
      if (!user) {
        const err = new Error('User not found')
        err.statusCode = 404
        throw err
      }

      if (p.type === 'deposit') {
        await trx('users').where({ id: p.user_id }).increment('wallet_balance', p.amount)
      } else if (p.type === 'withdrawal') {
        const current = await trx('users').where({ id: p.user_id }).forUpdate().first()
        if (!current || Number(current.wallet_balance || 0) < Number(p.amount)) {
          const err = new Error('INSUFFICIENT_BALANCE')
          err.code = 'INSUFFICIENT_BALANCE'
          throw err
        }
        await trx('users').where({ id: p.user_id }).decrement('wallet_balance', p.amount)
      }

      await trx('payments').where({ id: p.id }).update({ status: 'completed' })

      const hasLedger = await trx.schema.hasTable('financial_ledger')
      if (hasLedger) {
        await trx('financial_ledger').insert({
          user_id: p.user_id,
          amount: p.type === 'deposit' ? p.amount : -p.amount,
          type: p.type === 'deposit' ? 'DEPOSIT' : 'WITHDRAWAL',
          reference: `PAYMENT-${p.id}`,
          created_at: new Date(),
        })
      }
      paymentType = p.type
    })

    res.json({ success: true, message: `${paymentType} approved` })
  } catch (err) {
    if (err.code === 'INSUFFICIENT_BALANCE') {
      return res.status(400).json({ error: 'User has insufficient balance for withdrawal' })
    }
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message })
    res.status(500).json({ error: err.message })
  }
})

router.post('/payments/:id/reject', adminAuth, async (req, res) => {
  try {
    let paymentType
    await db.transaction(async (trx) => {
      const p = await trx('payments').where({ id: req.params.id }).forUpdate().first()
      if (!p) {
        const err = new Error('Not found')
        err.statusCode = 404
        throw err
      }
      if (p.status !== 'pending') {
        const err = new Error('Payment already processed')
        err.statusCode = 400
        throw err
      }

      await trx('payments').where({ id: p.id }).update({ status: 'rejected' })
      paymentType = p.type
    })
    res.json({ success: true, message: `${paymentType} rejected` })
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message })
    res.status(500).json({ error: err.message })
  }
})

router.post('/reset-balances', adminAuth, async (req, res) => {
  try {
    await db('users').update({ wallet_balance: 0 })
    res.json({ success: true, message: 'All wallet balances reset to 0' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
router.post('/archive-data', adminAuth, async (req, res) => {
  try {
    const r = await archiveOldData()
    res.json({ success: true, ...r })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


module.exports = router
