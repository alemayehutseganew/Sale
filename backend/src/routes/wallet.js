const express = require('express')
const router = express.Router()
const db = require('../db')
const authMiddleware = require('../../middleware/auth')
const { creditVerifiedDeposit } = require('../services/paymentService')

// GET /api/wallet/balance?userId=...
router.get('/balance', async (req, res) => {
  try {
    const { userId } = req.query
    let user = await db('users').where({ id: userId }).first()
    if (!user) {
      user = await db('users').where({ telegram_id: userId }).first()
    }
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({
      balance: user.wallet_balance || 0,
      referral_balance: user.referral_balance || 0,
      referral_threshold: 1000,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/wallet/deposit (manual Telebirr receipt verification)
router.post('/deposit', authMiddleware, async (req, res) => {
  try {
    const { amount, reference } = req.body || {}
    if (amount === undefined || !reference) return res.status(400).json({ error: 'Missing fields' })

    const result = await creditVerifiedDeposit({ userId: req.user.id, amount, reference })
    res.json({ success: true, newBalance: result.newBalance })
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'This transaction has already been used' })
    }
    if (err.statusCode === 400 || err.statusCode === 404) {
      return res.status(err.statusCode).json({ error: err.message })
    }
    console.error('[wallet] Deposit processing failed:', err.message)
    return res.status(500).json({ error: 'Unable to process deposit.' })
  }
})

// POST /api/wallet/withdraw
router.post('/withdraw', async (req, res) => {
  try {
    const { userId, amount, provider, phoneNumber } = req.body || {}
    const source = req.body?.source === undefined ? 'wallet' : req.body.source
    const numericAmount = Number(amount)
    if (!userId || amount === undefined || !provider) return res.status(400).json({ error: 'Missing fields' })
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: 'Invalid withdrawal amount' })
    }
    if (!['wallet', 'referral'].includes(source)) {
      return res.status(400).json({ error: 'Invalid withdrawal source' })
    }
    if (numericAmount < 100) return res.status(400).json({ error: 'Minimum withdrawal is 100 ETB' })

    const reference = `WD-${Date.now()}-${userId}`
    let newBalance
    await db.transaction(async (trx) => {
      const user = await trx('users')
        .where({ id: userId })
        .orWhere({ telegram_id: userId })
        .forUpdate()
        .first()
      if (!user) {
        const error = new Error('User not found')
        error.code = 'USER_NOT_FOUND'
        throw error
      }

      const balanceColumn = source === 'referral' ? 'referral_balance' : 'wallet_balance'
      const availableBalance = Number(user[balanceColumn] || 0)
      if (source === 'referral' && availableBalance < 1000) {
        const error = new Error('You need at least 1,000 ETB in referral earnings to withdraw.')
        error.code = 'REFERRAL_THRESHOLD_NOT_MET'
        throw error
      }
      if (numericAmount > availableBalance) {
        const error = new Error(source === 'referral'
          ? 'Insufficient referral balance.'
          : 'Insufficient wallet balance.')
        error.code = 'INSUFFICIENT_BALANCE'
        throw error
      }

      await trx('users').where({ id: user.id }).decrement(balanceColumn, numericAmount)
      await trx('payments').insert({
        user_id: user.id,
        type: 'withdrawal',
        provider,
        amount: numericAmount,
        status: 'pending',
        transaction_reference: reference,
        provider_response: { phoneNumber, source },
      })
      await trx('financial_ledger').insert({
        user_id: user.id,
        amount: -numericAmount,
        type: source === 'referral' ? 'REFERRAL_WITHDRAWAL' : 'WITHDRAWAL',
        reference,
      })

      const updatedUser = await trx('users').where({ id: user.id }).first()
      newBalance = Number(updatedUser[balanceColumn] || 0)
    })

    res.json({ success: true, message: 'Withdrawal request submitted', reference, source, newBalance })
  } catch (err) {
    if (err.code === 'USER_NOT_FOUND') return res.status(404).json({ error: err.message })
    if (err.code === 'REFERRAL_THRESHOLD_NOT_MET' || err.code === 'INSUFFICIENT_BALANCE') {
      return res.status(400).json({ error: err.message })
    }
    console.error('[wallet] Withdrawal processing failed:', err)
    res.status(500).json({ error: 'Unable to process withdrawal.' })
  }
})

module.exports = router