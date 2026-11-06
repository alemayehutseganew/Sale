const express = require('express')
const router = express.Router()
const db = require('../db')
const authMiddleware = require('../../middleware/auth')

function maskName(name, userId) {
  if (!name) return `User ${userId}`
  return name.length < 3 ? `${name[0]}***` : `${name[0]}***${name[name.length - 1]}`
}

// GET /api/users/referrals
router.get('/referrals', authMiddleware, async (req, res) => {
  try {
    const invitedUsers = await db('users')
      .where({ referred_by: req.user.id })
      .select('id', 'first_name', 'username', 'created_at')
      .orderBy('id', 'desc')

    const earnings = await db('referral_earnings')
      .where({ inviter_id: req.user.id })
      .sum('amount as total_earned')
      .first()

    res.json({
      referral_code: req.user.referral_code,
      referred_users: invitedUsers.map((user) => ({
        id: user.id,
        name: maskName(user.first_name || user.username, user.id),
        joined_at: user.created_at,
      })),
      invited_users: invitedUsers.map((user) => ({
        username: maskName(user.username || user.first_name, user.id),
      })),
      total_earned: Number(earnings.total_earned || 0),
      referral_balance: Number(req.user.referral_balance || 0),
      referral_threshold: 1000,
    })
  } catch (err) {
    console.error('referrals error:', err)
    res.status(500).json({ error: 'Unable to load referral information.' })
  }
})

// GET /api/users/history?userId=...
router.get('/history', async (req, res) => {
  try {
    const userId = req.query.userId
    const user = await db('users').where({ telegram_id: userId }).first()
      || await db('users').where({ id: userId }).first()
    if (!user) return res.status(404).json({ error: 'User not found' })

    const history = await db('room_participants')
      .join('game_rooms', 'room_participants.room_id', 'game_rooms.id')
      .where({ 'room_participants.user_id': user.id })
      .select('game_rooms.stake_amount', 'room_participants.is_winner', 'room_participants.joined_at')
      .orderBy('room_participants.joined_at', 'desc')
      .limit(20)

    res.json({ history })
  } catch (err) {
    console.error('history error:', err)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/users/leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const leaders = await db('users')
      .select('first_name', 'wallet_balance')
      .orderBy('wallet_balance', 'desc')
      .limit(10)
    res.json({ leaders })
  } catch (err) {
    console.error('leaderboard error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
