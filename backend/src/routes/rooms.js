const express = require('express')
const router = express.Router()
const db = require('../db')
const { generateSingleCard, generateCardFromNumber } = require('../utils/cardGenerator')
const MAX_ROOM_PLAYERS = 10

function findUserByIdOrTelegramId(query, userId) {
  return query('users')
    .where(function () {
      this.where('id', userId).orWhere('telegram_id', userId)
    })
    .first()
}

// GET /api/rooms (list waiting rooms)
router.get('/', async (req, res) => {
  try {
    const rooms = await db('game_rooms').where({ status: 'WAITING' })
    res.json({ rooms })
  } catch (err) {
    res.status(500).json({ error: 'Failed' })
  }
})

// GET /api/rooms/active-cards?stake=X — returns cards reserved in active rooms for this stake
router.get('/active-cards', async (req, res) => {
  try {
    const stake = Number(req.query.stake)
    if (!stake) {
      return res.status(400).json({ error: 'stake is required' })
    }
    const rooms = await db('game_rooms')
      .where({ stake_amount: stake })
      .whereIn('status', ['WAITING', 'COUNTDOWN'])
      .where('created_at', '>', db.raw("NOW() - INTERVAL '2 hours'"))
      .select('id')
    const roomIds = rooms.map((r) => r.id)
    if (roomIds.length === 0) {
      return res.json({ takenCards: [] })
    }
    const taken = await db('room_card_selections')
      .whereIn('room_id', roomIds)
      .select('card_id')
    res.json({ takenCards: [...new Set(taken.map((t) => Number(t.card_id)))] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch active cards' })
  }
})

router.post('/join', async (req, res) => {
  try {
    // 1. DEFINE VARIABLES
    const stake = Number(req.body.stake || req.body.level);
    const userId = req.tgUser?.id || req.body.userId;
    const cardNumber = Number(req.body.card_number);
    const requestedRoomId = req.body.roomId;

    // 2. FIND USER
    const user = userId ? await findUserByIdOrTelegramId(db, userId) : null
    if (!user) return res.status(404).json({ error: 'User not found' })

    // 3. START TRANSACTION
    const result = await db.transaction(async (trx) => {
      await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [`game_rooms:${stake}`])

      let room = null
      let existing = null

      if (requestedRoomId) {
        room = await trx('game_rooms')
          .select('id', 'stake_amount', 'status')
          .where({ id: requestedRoomId, stake_amount: stake })
          .forUpdate()
          .first()
        if (!room) throw new Error('ROOM_NOT_FOUND')

        existing = await trx('room_participants')
          .where({ room_id: room.id, user_id: user.id })
          .first()
        if (['PLAYING', 'CLAIMING'].includes(room.status)) {
          return { status: existing ? 'reconnected' : 'spectator', room }
        }
        if (!['WAITING', 'COUNTDOWN'].includes(room.status)) {
          throw new Error('GAME_ALREADY_STARTED')
        }
        if (!existing) {
          const participantCount = await trx('room_participants')
            .where({ room_id: room.id })
            .count('* as count')
            .first()
          if (Number(participantCount.count) >= MAX_ROOM_PLAYERS) {
            throw new Error('ROOM_FULL')
          }
        }
      } else {
        const activeRoom = await trx('game_rooms')
          .select('id', 'stake_amount', 'status')
          .where({ stake_amount: stake })
          .whereIn('status', ['COUNTDOWN', 'PLAYING', 'CLAIMING'])
          .orderBy('created_at', 'desc')
          .forUpdate()
          .first()

        if (activeRoom) {
          const activeParticipant = await trx('room_participants')
            .where({ room_id: activeRoom.id, user_id: user.id })
            .first()
          if (['PLAYING', 'CLAIMING'].includes(activeRoom.status)) {
            return { status: activeParticipant ? 'reconnected' : 'spectator', room: activeRoom }
          }
          if (activeRoom.status === 'COUNTDOWN') {
            const participantCount = await trx('room_participants')
              .where({ room_id: activeRoom.id })
              .count('* as count')
              .first()
            if (activeParticipant || Number(participantCount.count) < MAX_ROOM_PLAYERS) {
              room = activeRoom
              existing = activeParticipant
            }
          }
        }

        // 4. FIND OR CREATE ROOM
        if (!room) {
          const waitingRooms = await trx('game_rooms')
            .select('id', 'stake_amount', 'status')
            .where({ stake_amount: stake, status: 'WAITING' })
            .orderBy('created_at')
            .forUpdate()

          for (const waitingRoom of waitingRooms) {
            const existingParticipant = await trx('room_participants')
              .where({ room_id: waitingRoom.id, user_id: user.id })
              .first()
            if (existingParticipant) {
              room = waitingRoom
              existing = existingParticipant
              break
            }

            const participantCount = await trx('room_participants')
              .where({ room_id: waitingRoom.id })
              .count('* as count')
              .first()
            if (Number(participantCount.count) < MAX_ROOM_PLAYERS) {
              room = waitingRoom
              break
            }
          }

          if (!room) {
            const [newRoom] = await trx('game_rooms').insert({
              stake_amount: stake,
              status: 'WAITING',
              called_numbers: JSON.stringify([])
            }).returning('*')
            room = newRoom
          }
        }
      }

      // 5. CHECK IF ALREADY IN ROOM
      if (!existing) {
        await trx('room_participants').insert({ room_id: room.id, user_id: user.id, is_winner: false })
      }

      // 6. ENSURE USER HAS A CARD (use user-selected card_number)
      if (!cardNumber || cardNumber < 1 || cardNumber > 400) {
        throw new Error('INVALID_CARD_NUMBER');
      }

      let cardSelection = await trx('room_card_selections')
        .where({ room_id: room.id, user_id: user.id })
        .first();
      const cardTakenByAnotherPlayer = await trx('room_card_selections')
        .where({ room_id: room.id, card_id: cardNumber })
        .whereNot({ user_id: user.id })
        .first();
      if (cardTakenByAnotherPlayer) {
        throw new Error('CARD_ALREADY_TAKEN');
      }

      const matrix = generateCardFromNumber(cardNumber);
      if (cardSelection && Number(cardSelection.card_id) !== cardNumber) {
        await trx('room_card_selections')
          .where({ room_id: room.id, user_id: user.id })
          .update({
            card_id: cardNumber,
            card: JSON.stringify(matrix),
            status: 'reserved',
          });
        cardSelection = { ...cardSelection, card_id: cardNumber, card: JSON.stringify(matrix) };
      } else if (!cardSelection) {
        const [inserted] = await trx('room_card_selections').insert({
          room_id: room.id,
          card_id: cardNumber,
          user_id: user.id,
          card: JSON.stringify(matrix),
          status: 'reserved',
        }).returning('*');
        cardSelection = inserted;
      }

      return {
         room,
         card: {
           id: cardSelection.card_id,
           matrix: typeof cardSelection.card === 'string' ? JSON.parse(cardSelection.card) : cardSelection.card,
         },
       }
    })

    if (result.status === 'spectator') {
       const io = req.app.get('io')
       if (io) {
         await io.in(`user_${user.id}`).socketsJoin(result.room.id)
       }
       return res.json({
         status: 'spectator',
         roomId: result.room.id,
         stake: result.room.stake_amount,
         message: 'Game already in progress',
       })
    }

    if (result.status === 'reconnected') {
      return res.json({
        status: 'reconnected',
        roomId: result.room.id,
        stake: result.room.stake_amount,
      })
    }

    const io = req.app.get('io')
    if (io) {
      const countResult = await db('room_participants')
        .where({ room_id: result.room.id })
        .count('* as count')
        .first()
      io.to(result.room.id).emit('players_updated', { count: Number(countResult.count) })
    }

    return res.json({ roomId: result.room.id, stake: result.room.stake_amount, card: result.card })

  } catch (err) {
    if (err.message === 'INVALID_CARD_NUMBER') {
      return res.status(400).json({ error: 'Invalid card number. Choose a card between 1 and 400.' })
    }
    if (err.message === 'CARD_ALREADY_TAKEN') {
      return res.status(400).json({ error: 'Card already taken' })
    }
    if (err.message === 'GAME_ALREADY_STARTED') {
      return res.status(400).json({ error: 'Game has already started. Cannot change card.' })
    }
    if (err.message === 'ROOM_NOT_FOUND') {
      return res.status(404).json({ error: 'Room not found' })
    }
    if (err.message === 'NOT_IN_ROOM') {
      return res.status(403).json({ error: 'Join the room before changing cards.' })
    }
    if (err.message === 'ROOM_FULL') {
      return res.status(409).json({ error: 'Room is full' })
    }
    res.status(500).json({ error: 'JOIN_FAILED', message: err.message })
  }
})

// GET /api/rooms/:roomId/cards
router.get('/:roomId/cards', async (req, res) => {
  try {
    const { roomId } = req.params
    const { userId } = req.query
    if (!userId) return res.status(400).json({ error: 'userId is required' })

    const user = await findUserByIdOrTelegramId(db, userId)
    if (!user) return res.status(404).json({ error: 'User not found' })

    const room = await db('game_rooms').where({ id: roomId }).first()
    if (!room) return res.status(404).json({ error: 'Room not found' })
    if (!['WAITING', 'COUNTDOWN'].includes(room.status)) {
      return res.status(409).json({ error: 'Game in progress. Please wait for the next round.' })
    }

    const participant = await db('room_participants').where({ room_id: roomId, user_id: user.id }).first()
    if (!participant) return res.status(403).json({ error: 'Join the room before selecting cards.' })

    const cards = []
    for (let i = 1; i <= 400; i++) {
      cards.push({
        id: i,
        card_number: i,
        taken: false,
        matrix: generateSingleCard(),
      })
    }
    return res.json(cards)
  } catch (err) {
    console.error('[cards] Failed to generate room cards:', err)
    return res.status(500).json({ error: 'Failed to load cards' })
  }
})

// POST /api/rooms/:id/cards/:cardId
router.post('/:id/cards/:cardId', async (req, res) => {
  try {
    const { id: roomId, cardId } = req.params
    const { userId } = req.body

    const user = await findUserByIdOrTelegramId(db, userId)
    if (!user) return res.status(404).json({ error: 'User not found' })

    const room = await db('game_rooms').where({ id: roomId }).first()
    if (!room) return res.status(404).json({ error: 'Room not found' })
    if (!['WAITING', 'COUNTDOWN'].includes(room.status)) {
      return res.status(409).json({ error: 'Game in progress. Please wait for the next round.' })
    }
    const participant = await db('room_participants').where({ room_id: roomId, user_id: user.id }).first()
    if (!participant) return res.status(403).json({ error: 'Join the room before selecting cards.' })

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

    const user = await findUserByIdOrTelegramId(db, userId)
    if (!user) return res.status(404).json({ error: 'User not found' })

    const normalizedCardIds = [...new Set(cardIds.map(Number))]
    if (normalizedCardIds.some((cardId) => !Number.isInteger(cardId) || cardId < 1 || cardId > 400)) {
      return res.status(400).json({ error: 'Invalid card number. Choose a card between 1 and 400.' })
    }

    const result = await db.transaction(async (trx) => {
      const room = await trx('game_rooms').where({ id: roomId }).forUpdate().first()
      if (!room) throw new Error('ROOM_NOT_FOUND')
      if (!['WAITING', 'COUNTDOWN'].includes(room.status)) throw new Error('GAME_ALREADY_STARTED')

      const participant = await trx('room_participants')
        .where({ room_id: roomId, user_id: user.id })
        .first()
      if (!participant) throw new Error('NOT_IN_ROOM')

      const taken = normalizedCardIds.length
        ? await trx('room_card_selections')
          .where({ room_id: roomId })
          .whereIn('card_id', normalizedCardIds)
          .whereNot({ user_id: user.id })
          .first()
        : null
      if (taken) throw new Error('CARD_ALREADY_TAKEN')

      await trx('room_card_selections').where({ room_id: roomId, user_id: user.id }).del()
      const rows = normalizedCardIds.map((cardId) => ({
        room_id: roomId,
        card_id: cardId,
        user_id: user.id,
        card: JSON.stringify(generateCardFromNumber(cardId)),
        status: 'reserved',
      }))
      if (rows.length) await trx('room_card_selections').insert(rows)
      return { room, rows }
    })

    return res.json({
      success: true,
      roomId,
      stake: result.room.stake_amount,
      count: result.rows.length,
      cards: result.rows.map((card) => ({
        id: card.card_id,
        matrix: JSON.parse(card.card),
      })),
      ...(result.rows[0] ? {
        card: { id: result.rows[0].card_id, matrix: JSON.parse(result.rows[0].card) },
      } : {}),
    })
  } catch (err) {
    if (err.message === 'ROOM_NOT_FOUND') return res.status(404).json({ error: 'Room not found' })
    if (err.message === 'GAME_ALREADY_STARTED') {
      return res.status(409).json({ error: 'Game in progress. Please wait for the next round.' })
    }
    if (err.message === 'NOT_IN_ROOM') {
      return res.status(403).json({ error: 'Join the room before selecting cards.' })
    }
    if (err.message === 'CARD_ALREADY_TAKEN') return res.status(409).json({ error: 'Card already taken' })
    console.error('[ERROR] Failed to select room cards:', err)
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

    const user = await findUserByIdOrTelegramId(db, userId)

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const participant = await db('room_participants').where({ room_id: roomId, user_id: user.id }).first()
    if (!participant) return res.status(403).json({ error: 'Only room participants can view their cards.' })

    const selections = await db('room_card_selections').where({ room_id: roomId, user_id: user.id })
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