const express = require('express')
const router = express.Router()
const db = require('../db')
const { generateSingleCard } = require('../utils/cardGenerator')

// GET /api/rooms (list waiting rooms)
router.get('/', async (req, res) => {
  try {
    const rooms = await db('game_rooms').where({ status: 'WAITING' })
    res.json({ rooms })
  } catch (err) {
    res.status(500).json({ error: 'Failed' })
  }
})

router.post('/join', async (req, res) => {
  try {
    // 1. DEFINE VARIABLES
    const stake = Number(req.body.stake || req.body.level);
    const userId = req.tgUser?.id || req.body.userId;
    
    console.log('[join] Request received for stake:', stake, 'userId:', userId);

    // 2. FIND USER
    let user = null
    if (userId) {
      user = await db('users').where({ id: userId }).first()
      if (!user) user = await db('users').where({ telegram_id: userId }).first()
    }
    console.log('[join] User found:', user ? user.id : 'NOT FOUND')
    if (!user) return res.status(404).json({ error: 'User not found' })

    // 3. START TRANSACTION
    const result = await db.transaction(async (trx) => {
      console.log('[join] Transaction started')

      // 4. FIND OR CREATE ROOM
      let room = await trx('game_rooms').where({ stake_amount: stake, status: 'WAITING' }).forUpdate().first()
      console.log('[join] Room found/created:', room ? room.id : 'Creating new room')

      if (!room) {
        const [newRoom] = await trx('game_rooms').insert({
          stake_amount: stake,
          status: 'WAITING',
          called_numbers: JSON.stringify([])
        }).returning('*')
        room = newRoom
        console.log('[join] New room created:', room.id)
      }

      // 5. CHECK IF ALREADY IN ROOM
      const existing = await trx('room_participants').where({ room_id: room.id, user_id: user.id }).first()

      if (!existing) {
        await trx('room_participants').insert({ room_id: room.id, user_id: user.id, is_winner: false })
        console.log(`[JOIN] Added user ${user.id} to room ${room.id}.`)
      } else {
        console.log(`[JOIN] User ${user.id} was already in room. Join skipped.`)
      }

      console.log('[join] Transaction successful')
      return { room }
    })

    console.log('[join] Sending response:', result.room.id)
    return res.json({ roomId: result.room.id, stake: result.room.stake_amount })

  } catch (err) {
    console.error('[join] CATCH ERROR:', err.message)
    res.status(500).json({ error: 'JOIN_FAILED', message: err.message })
  }
})

// GET /api/rooms/:roomId/cards
router.get('/:roomId/cards', (req, res) => {
  const cards = []
  for (let i = 1; i <= 400; i++) {
    cards.push({
      id: i,
      card_number: i,
      taken: false,
      matrix: generateSingleCard(),
    })
  }
  res.json(cards)
})

// POST /api/rooms/:id/cards/:cardId
router.post('/:id/cards/:cardId', async (req, res) => {
  try {
    const { id: roomId, cardId } = req.params
    const { userId } = req.body

    const user = await db('users').where({ id: userId }).first()
    if (!user) return res.status(404).json({ error: 'User not found' })

    const matrix = generateSingleCard()

    await db('room_card_selections').insert({
      room_id: roomId,
      card_id: parseInt(cardId),
      user_id: user.id,
      card: JSON.stringify(matrix),
      status: 'reserved'
    })

    res.json({ success: true, cardId, matrix })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to save card' })
  }
})

// POST /api/rooms/:id/select-cards
router.post('/:id/select-cards', async (req, res) => {
  try {
    const roomId = req.params.id
    const { userId, cardIds } = req.body || {}
    if (!userId || !Array.isArray(cardIds)) {
      return res.status(400).json({ error: 'userId and cardIds are required' })
    }

    await db('room_card_selections').where({ room_id: roomId, user_id: userId }).del()

    const rows = cardIds.map((cardId) => ({
      room_id: roomId,
      card_id: cardId,
      user_id: userId,
      card: JSON.stringify(generateSingleCard()),
      status: 'reserved',
    }))

    if (rows.length) {
      await db('room_card_selections').insert(rows)
    }

    return res.json({ success: true, count: rows.length })
  } catch (err) {
    console.error('select-cards error:', err)
    return res.status(500).json({ error: 'server error' })
  }
})

// GET /api/rooms/:id/my-cards
router.get('/:id/my-cards', async (req, res) => {
  try {
    const roomId = req.params.id
    const { userId } = req.query

    if (!roomId || !userId) {
      return res.status(400).json({ error: 'roomId and userId are required' })
    }

    let user = await db('users').where({ id: userId }).first()
    if (!user) {
      user = await db('users').where({ telegram_id: userId }).first()
    }

    if (!user) {
      console.log(`[my-cards] User not found for ID/Telegram: ${userId}`)
      return res.json({ cards: [] })
    }

    const selections = await db('room_card_selections').where({ room_id: roomId, user_id: user.id })
    console.log(`[my-cards] Found ${selections.length} cards for DB user ${user.id} in room ${roomId}`)

    const cards = selections.map((selection) => ({
      id: selection.card_id,
      matrix: typeof selection.card === 'string' ? JSON.parse(selection.card) : selection.card,
    }))

    return res.json({ cards })
  } catch (error) {
    console.error('[my-cards] Error:', error)
    return res.status(500).json({ error: 'Failed to fetch cards' })
  }
})

module.exports = router