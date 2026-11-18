const db = require('../db')
const { validateBingo } = require('../utils/bingoValidator')
const { Server } = require('socket.io')
const jwt = require('jsonwebtoken')
const { bot } = require('../bot/index')

const rooms = {}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'
const roomStatusRank = { WAITING: 0, COUNTDOWN: 1, PLAYING: 2, CLAIMING: 3, ENDED: 4 }

function clearRoomTimer(room, key) {
  if (!room?.timers || !(key in room.timers)) return
  clearTimeout(room.timers[key])
  clearInterval(room.timers[key])
  delete room.timers[key]
}

function clearRoomTimers(room) {
  if (!room?.timers) return
  for (const timer of Object.values(room.timers)) {
    clearTimeout(timer)
    clearInterval(timer)
  }
  room.timers = {}
}

function scheduleRoomTimeout(room, key, callback, delay) {
  if (!room.timers) room.timers = {}
  clearRoomTimer(room, key)
  const timer = setTimeout(async () => {
    if (room.timers[key] === timer) delete room.timers[key]
    await callback()
  }, delay)
  room.timers[key] = timer
  return timer
}

function scheduleRoomInterval(room, key, callback, delay) {
  if (!room.timers) room.timers = {}
  clearRoomTimer(room, key)
  const timer = setInterval(callback, delay)
  room.timers[key] = timer
  return timer
}

function getBallData(number) {
  if (!Number.isFinite(Number(number))) return null

  const value = Number(number)
  let letter = 'B'
  if (value > 15) letter = 'I'
  if (value > 30) letter = 'N'
  if (value > 45) letter = 'G'
  if (value > 60) letter = 'O'

  return { number: value, letter, ball: `${letter}-${value}` }
}

async function getPlayerCount(roomId) {
  const result = await db('room_participants')
    .where({ room_id: roomId })
    .count('* as count')
    .first()
  return Number(result.count)
}

function registerRoomSocket(room, socket, userId, isParticipant) {
  if (!room.sockets) room.sockets = {}
  if (!room.players) room.players = {}
  room.sockets[socket.id] = userId
  if (isParticipant) room.players[socket.id] = { socketId: socket.id, userId }
}

function hasConnectedRoomSockets(room) {
  return Object.keys(room.sockets || {}).length > 0 || Object.keys(room.players || {}).length > 0
}

async function emitCurrentRoomState(socket, roomId, room, currentPlayerCount) {
  const playerCount = currentPlayerCount ?? await getPlayerCount(roomId)
  const calledNumbers = Array.from(room.calledNumbers || [])
  socket.emit('players_updated', { count: playerCount })

  if (calledNumbers.length > 0) {
    const lastBall = room.latestNumber || getBallData(calledNumbers[calledNumbers.length - 1])
    if (lastBall) {
      socket.emit('new_number_called', {
        ...lastBall,
        ball: lastBall.ball || `${lastBall.letter}-${lastBall.number}`,
        calledNumbers,
      })
    }
  }
  return playerCount
}

async function broadcastPlayerCount(io, roomId, room) {
  const count = await getPlayerCount(roomId)
  io.to(roomId).emit('players_updated', { count })
  io.to(roomId).emit('room_update', { players: count, stake: room?.stake })
}

function scheduleRoomReset(io, roomId, room) {
  scheduleRoomTimeout(room, 'reset', async () => {
    if (rooms[roomId] !== room || room.status !== 'ENDED') return

    try {
      await db.transaction(async (trx) => {
        await trx('room_card_selections').where({ room_id: roomId }).del()
        await trx('room_participants').where({ room_id: roomId }).del()
        await trx('game_rooms').where({ id: roomId }).update({
          status: 'WAITING',
          called_numbers: JSON.stringify([]),
        })
      })

      clearRoomTimer(room, 'draw')
      room.status = 'WAITING'
      room.players = {}
      room.sockets = {}
      room.calledNumbers.clear()
      room.claimedBy = []
      room.latestNumber = null

      io.to(roomId).emit('room_reset', {
        roomId,
        stake: room.stake,
      })
    } catch (err) {
      console.error(`[Game] Failed to prepare next room after ${roomId}:`, err)
      return
    }

    try {
      await io.in(roomId).socketsLeave(roomId)
    } catch (err) {
      console.error(`[Game] Failed to remove sockets from reset room ${roomId}:`, err)
    } finally {
      if (room.status === 'WAITING' && rooms[roomId] === room) delete rooms[roomId]
    }
  }, 5000)
}

async function cleanupEmptyRoom(roomId, room) {
  if (rooms[roomId] !== room || hasConnectedRoomSockets(room)) return

  if (room.status === 'CLAIMING') {
    try {
      await db('game_rooms').where({ id: roomId, status: 'CLAIMING' }).update({ status: 'PLAYING' })
    } catch (err) {
      console.error(`[ERROR] Failed to resume interrupted claim for room ${roomId}:`, err)
    }
  }
  if (rooms[roomId] !== room || hasConnectedRoomSockets(room)) return
  clearRoomTimers(room)
  if (rooms[roomId] === room && !hasConnectedRoomSockets(room)) {
    delete rooms[roomId]
  }
}

function startDrawLoop(io, roomId, room) {
  if (room.status !== 'PLAYING' || room.timers?.draw) return

  const drawNextNumber = async () => {
    if (rooms[roomId] !== room || room.status !== 'PLAYING') {
      clearRoomTimer(room, 'draw')
      return
    }

    if (room.calledNumbers.size >= 75) {
      clearRoomTimer(room, 'draw')
      room.status = 'ENDED'
      await db('game_rooms').where({ id: roomId }).update({ status: 'ENDED' })
      io.to(roomId).emit('game_ended_for_spectators', { noWinner: true })
      scheduleRoomReset(io, roomId, room)
      return
    }

    let number
    do {
      number = Math.floor(Math.random() * 75) + 1
    } while (room.calledNumbers.has(number))

    room.calledNumbers.add(number)
    const calledNumbers = Array.from(room.calledNumbers)
    const isFinalNumber = room.calledNumbers.size === 75
    try {
      await db('game_rooms')
        .where({ id: roomId })
        .update({
          called_numbers: JSON.stringify(calledNumbers),
          ...(isFinalNumber ? { status: 'ENDED' } : {}),
        })
    } catch (err) {
      room.calledNumbers.delete(number)
      console.error('[ERROR] Failed to save called number:', err)
      scheduleRoomTimeout(room, 'draw', drawNextNumber, 4000)
      return
    }

    if (rooms[roomId] !== room) return

    const ball = getBallData(number)
    room.latestNumber = ball
    io.to(roomId).emit('new_number_called', { ...ball, calledNumbers })

    if (isFinalNumber) {
      clearRoomTimer(room, 'draw')
      room.status = 'ENDED'
      io.to(roomId).emit('game_ended_for_spectators', { noWinner: true })
      scheduleRoomReset(io, roomId, room)
      return
    }

    scheduleRoomTimeout(room, 'draw', drawNextNumber, 4000)
  }

  scheduleRoomTimeout(room, 'draw', drawNextNumber, 4000)
}

async function startCountdown(io, roomId) {
  const room = rooms[roomId]
  if (
    !room ||
    !['WAITING', 'COUNTDOWN'].includes(room.status) ||
    room.timers?.countdown ||
    room.countdownStarting
  ) return
  const isResuming = room.status === 'COUNTDOWN'
  room.countdownStarting = true
  clearRoomTimer(room, 'draw')
  room.status = 'COUNTDOWN'

  try {
    if (isResuming && await getPlayerCount(roomId) < 2) {
      await db('game_rooms').where({ id: roomId }).update({ status: 'WAITING' })
      room.status = 'WAITING'
      room.countdownStarting = false
      io.to(roomId).emit('countdown_tick', { timeLeft: null })
      io.to(roomId).emit('game_aborted', { message: 'Not enough players. Game cancelled.' })
      return
    }

    if (!isResuming) {
      await db('game_rooms').where({ id: roomId }).update({ status: 'COUNTDOWN' })
    }
  } catch (err) {
    room.countdownStarting = false
    console.error('[ERROR] Failed to initialize countdown:', err)
    room.status = 'WAITING'
    io.to(roomId).emit('game_aborted', { message: 'Server error. Game cancelled.' })
    return
  }

  room.countdownStarting = false
  if (rooms[roomId] !== room) return
  let timeLeft = 30
  io.to(roomId).emit('countdown_tick', { timeLeft })

  scheduleRoomInterval(room, 'countdown', async () => {
    timeLeft -= 1
    io.to(roomId).emit('countdown_tick', { timeLeft })

    if (timeLeft <= 0) {
      clearRoomTimer(room, 'countdown')
      try {
        const settlement = await db.transaction(async (trx) => {
          await trx('game_rooms').where({ id: roomId }).forUpdate().first()
          const participants = await trx('room_participants')
            .where({ room_id: roomId })
            .forUpdate()

          if (participants.length < 2) {
            return {
              success: false,
              error: 'NOT_ENOUGH_PLAYERS',
              poorPlayers: [],
              cardlessPlayers: [],
            }
          }

          const validPlayers = []
          const poorPlayers = []
          const cardlessPlayers = []
          const participantIds = participants.map((participant) => participant.user_id)
          const [selections, users] = await Promise.all([
            trx('room_card_selections')
              .where({ room_id: roomId })
              .whereIn('user_id', participantIds)
              .select('user_id'),
            trx('users').whereIn('id', participantIds).forUpdate(),
          ])
          const usersById = new Map(users.map((user) => [user.id, user]))
          const playersWithCards = new Set(selections.map((selection) => selection.user_id))

          for (const participant of participants) {
            if (!playersWithCards.has(participant.user_id)) {
              cardlessPlayers.push(participant)
              continue
            }

            const user = usersById.get(participant.user_id)
            if (user && Number(user.wallet_balance) >= room.stake) {
              validPlayers.push({ participant, user })
            } else {
              poorPlayers.push(participant)
            }
          }

          if (validPlayers.length + poorPlayers.length < 2) {
            if (cardlessPlayers.length) {
              await trx('room_participants')
                .where({ room_id: roomId })
                .whereIn('user_id', cardlessPlayers.map((player) => player.user_id))
                .del()
            }
            return { success: false, error: 'NOT_ENOUGH_PLAYERS', poorPlayers, cardlessPlayers }
          }

          const removedUserIds = [...new Set([
            ...poorPlayers.map((player) => player.user_id),
            ...cardlessPlayers.map((player) => player.user_id),
          ])]
          if (removedUserIds.length) {
            await trx('room_participants')
              .where({ room_id: roomId })
              .whereIn('user_id', removedUserIds)
              .del()
            await trx('room_card_selections')
              .where({ room_id: roomId })
              .whereIn('user_id', removedUserIds)
              .del()
          }

          if (validPlayers.length < 2) {
            return { success: false, error: 'NOT_ENOUGH_VALID_PLAYERS', poorPlayers, cardlessPlayers }
          }

          const validUserIds = validPlayers.map(({ user }) => user.id)
          await trx('users').whereIn('id', validUserIds).decrement('wallet_balance', room.stake)
          await trx('financial_ledger').insert(validPlayers.map(({ user }) => ({
            user_id: user.id,
            amount: -room.stake,
            type: 'ENTRY_FEE'
          })))
          await trx('game_rooms').where({ id: roomId }).update({ status: 'PLAYING' })

          return {
            success: true,
            validPlayers: validUserIds,
            poorPlayers,
            cardlessPlayers,
          }
        })

        if (settlement.success && Array.isArray(settlement.validPlayers)) {
          const updatedUsers = await db('users')
            .whereIn('id', settlement.validPlayers)
            .select('id', 'wallet_balance')
          for (const updatedUser of updatedUsers) {
            io.to(`user_${updatedUser.id}`).emit('wallet_updated', {
              newBalance: Number(updatedUser.wallet_balance),
            })
          }
        }

        for (const cardlessPlayer of settlement.cardlessPlayers) {
          const playerSocketId = Object.keys(room.players).find((id) => (
            String(room.players[id].userId) === String(cardlessPlayer.user_id)
          ))
          if (playerSocketId) {
            io.to(playerSocketId).emit('game_aborted', {
              message: 'Your card was not assigned. Please select a card for the next round.'
            })
            try {
              await io.in(playerSocketId).socketsLeave(roomId)
            } catch (err) {
              console.error('[Game] Failed to remove player without a card:', err)
            }
            delete room.players[playerSocketId]
            delete room.sockets?.[playerSocketId]
          }
        }

        for (const poorPlayer of settlement.poorPlayers) {
          const playerSocketId = Object.keys(room.players).find((id) => (
            String(room.players[id].userId) === String(poorPlayer.user_id)
          ))
          if (playerSocketId) {
            io.to(playerSocketId).emit('insufficient_funds', {
              message: 'You do not have enough balance. Please deposit funds.'
            })
            try {
              await io.in(playerSocketId).socketsLeave(roomId)
            } catch (err) {
              console.error('[Game] Failed to remove underfunded socket:', err)
            }
            delete room.players[playerSocketId]
            delete room.sockets?.[playerSocketId]
          }
        }

        await broadcastPlayerCount(io, roomId, room)

        if (!settlement.success) {
          room.status = 'WAITING'
          await db('game_rooms').where({ id: roomId }).update({ status: 'WAITING' })
          const message = settlement.error === 'NOT_ENOUGH_PLAYERS'
            ? 'Not enough players. Game cancelled.'
            : 'Not enough players with sufficient balance. Game cancelled.'
          io.to(roomId).emit('countdown_tick', { timeLeft: null })
          io.to(roomId).emit('game_aborted', { message })
          return
        }

        room.status = 'PLAYING'
        io.to(roomId).emit('game_started')
        startDrawLoop(io, roomId, room)
      } catch (err) {
        console.error('[Game] Error during countdown end:', err)
        room.status = 'WAITING'
        clearRoomTimers(room)
        room.calledNumbers.clear()
        room.claimedBy = []
        room.latestNumber = null
        try {
          await db('game_rooms').where({ id: roomId }).update({
            status: 'WAITING',
            called_numbers: JSON.stringify([]),
            winning_pattern: null,
          })
        } catch (resetErr) {
          console.error(`[Game] Failed to reset room ${roomId} after countdown error:`, resetErr)
        }
        io.to(roomId).emit('countdown_tick', { timeLeft: null })
        io.to(roomId).emit('game_aborted', { message: 'Server error. Game cancelled.' })
      }
    }
  }, 1000)
}

function initGameHandler(io) {
  io.on('connection', (socket) => {
    if (socket.data.userId) {
      socket.join(`user_${socket.data.userId}`)
    }

    socket.on('join_room', async ({ roomId, userId, stake, spectator }) => {
      try {
        if (!userId || !roomId) return socket.emit('error', { message: 'User and room are required' })

        const [user, persistedRoom] = await Promise.all([
          db('users')
            .where(function () {
              this.where('id', userId).orWhere('telegram_id', userId)
            })
            .first(),
          db('game_rooms').where({ id: roomId }).first(),
        ])
        if (!user) return socket.emit('error', { message: 'User not found' })
        if (!persistedRoom) return socket.emit('error', { message: 'Room not found' })
        await socket.join(roomId)
        const [joinedPlayerCount, participant, selections] = await Promise.all([
          getPlayerCount(roomId),
          db('room_participants').where({ room_id: roomId, user_id: user.id }).first(),
          db('room_card_selections').where({ room_id: roomId, user_id: user.id }),
        ])
        io.to(roomId).emit('players_updated', { count: joinedPlayerCount })

        const cardSelection = selections[0] || null

        // Early reconnection: returning player in an active game resumes without re-entering the lobby
        if (participant && ['PLAYING', 'COUNTDOWN', 'CLAIMING'].includes(persistedRoom.status)) {
          let room = rooms[roomId]
          if (!room) {
            if (persistedRoom.status === 'CLAIMING') {
              await db('game_rooms').where({ id: roomId }).update({ status: 'PLAYING' })
              persistedRoom.status = 'PLAYING'
            }
            let calledNumbers = persistedRoom.called_numbers || []
            if (typeof calledNumbers === 'string') calledNumbers = JSON.parse(calledNumbers)
            if (!Array.isArray(calledNumbers)) calledNumbers = []
            room = rooms[roomId] = {
              id: roomId,
              stake: Number(persistedRoom.stake_amount) || Number(stake) || 10,
              status: persistedRoom.status,
              players: {},
              calledNumbers: new Set(calledNumbers.map(Number).filter(Number.isFinite)),
              latestNumber:
                calledNumbers.length > 0
                  ? getBallData(calledNumbers[calledNumbers.length - 1])
                  : null,
              timers: {}
            }
          }
          registerRoomSocket(room, socket, user.id, true)
          socket.emit('my_cards', {
            cards: selections.map((selection) => ({
              id: selection.card_id,
              matrix: typeof selection.card === 'string' ? JSON.parse(selection.card) : selection.card,
            })),
          })
          socket.emit('sync_game_state', {
            calledNumbers: Array.from(room.calledNumbers),
            currentBall: room.latestNumber,
            status: room.status,
            players: joinedPlayerCount,
          })
          if (room.status === 'COUNTDOWN') await startCountdown(io, roomId)
          if (room.status === 'PLAYING') startDrawLoop(io, roomId, room)
          return
        }

        if (spectator && persistedRoom.status === 'WAITING' && (!participant || !cardSelection)) {
          socket.emit('next_game_ready', {
            roomId,
            stake: persistedRoom.stake_amount,
          })
          return
        }

        if (persistedRoom.status !== 'WAITING') {
          if (!rooms[roomId]) {
            if (persistedRoom.status === 'CLAIMING') {
              await db('game_rooms').where({ id: roomId }).update({ status: 'PLAYING' })
              persistedRoom.status = 'PLAYING'
            }
            let calledNumbers = persistedRoom.called_numbers || []
            if (typeof calledNumbers === 'string') calledNumbers = JSON.parse(calledNumbers)
            rooms[roomId] = {
              id: roomId,
              stake: Number(persistedRoom.stake_amount) || Number(stake) || 10,
              status: persistedRoom.status,
              players: {},
              calledNumbers: new Set(Array.isArray(calledNumbers) ? calledNumbers : []),
              latestNumber: Array.isArray(calledNumbers) && calledNumbers.length > 0
                ? getBallData(calledNumbers[calledNumbers.length - 1])
                : null,
              timers: {}
            }
          } else if ((roomStatusRank[persistedRoom.status] ?? -1) >= (roomStatusRank[rooms[roomId].status] ?? -1)) {
            rooms[roomId].status = persistedRoom.status
          }
        }

        if (persistedRoom.status === 'ENDED') {
          registerRoomSocket(rooms[roomId], socket, user.id, false)
          const playerCount = await emitCurrentRoomState(socket, roomId, rooms[roomId], joinedPlayerCount)
          return socket.emit('game_in_progress', {
            message: 'This game has ended. Please wait for the next round.',
            status: persistedRoom.status,
            players: playerCount,
            calledNumbers: [],
            currentBall: null
          })
        }

        if (['PLAYING', 'CLAIMING', 'COUNTDOWN'].includes(persistedRoom.status)) {
          const room = rooms[roomId]
          let persistedCalledNumbers = persistedRoom.called_numbers || []
          if (typeof persistedCalledNumbers === 'string') {
            persistedCalledNumbers = JSON.parse(persistedCalledNumbers)
          }
          if (!Array.isArray(persistedCalledNumbers)) persistedCalledNumbers = []
          room.calledNumbers = new Set([
            ...persistedCalledNumbers.map(Number).filter(Number.isFinite),
            ...room.calledNumbers,
          ])
          const calledNumbers = Array.from(room.calledNumbers)
          room.latestNumber = calledNumbers.length
            ? getBallData(calledNumbers[calledNumbers.length - 1])
            : null
          if (room.status === 'COUNTDOWN') await startCountdown(io, roomId)
          if (room.status === 'PLAYING') startDrawLoop(io, roomId, room)

          registerRoomSocket(room, socket, user.id, false)
          const playerCount = await emitCurrentRoomState(socket, roomId, room, joinedPlayerCount)
          socket.emit('game_in_progress', {
            message: 'A game is in progress. Please wait for the next round.',
            currentBall: room.latestNumber,
            calledNumbers,
            players: playerCount,
            status: room.status
          })
          return
        }

        if (!participant || !cardSelection) {
          return socket.emit('error', { message: 'Join the room before playing.' })
        }

        // 2. ADD PLAYER
        if (!rooms[roomId]) {
          rooms[roomId] = {
            id: roomId,
            stake: Number(stake) || 10,
            status: 'WAITING',
            players: {},
            calledNumbers: new Set(),
            latestNumber: null,
            timers: {}
          }
        }

        registerRoomSocket(rooms[roomId], socket, user.id, true)
        socket.emit('my_cards', {
          cards: selections.map((selection) => ({
            id: selection.card_id,
            matrix: typeof selection.card === 'string' ? JSON.parse(selection.card) : selection.card,
          })),
        })

        const playerCount = joinedPlayerCount
        await emitCurrentRoomState(socket, roomId, rooms[roomId], playerCount)
        io.to(roomId).emit('players_updated', { count: playerCount })
        io.to(roomId).emit('room_update', { players: playerCount, stake: rooms[roomId].stake })

        // 3. AUTO-START
        if (rooms[roomId].status === 'WAITING' && playerCount >= 2) {
          scheduleRoomTimeout(rooms[roomId], 'autoStart', async () => {
            const activeRoom = rooms[roomId]
            const participantCount = activeRoom ? await getPlayerCount(roomId) : 0
            if (activeRoom && activeRoom.status === 'WAITING' && participantCount >= 2) {
              await startCountdown(io, roomId)
            }
          }, 2000)
        }
      } catch (err) {
        console.error('[Game] Join room error:', err)
        socket.emit('error', { message: 'Server error' })
      }
    })
    socket.on('join_as_spectator', async ({ roomId, userId }) => {
      try {
        const room = rooms[roomId]
        if (!room) return

        socket.join(roomId)
        registerRoomSocket(room, socket, userId, false)
        const playerCount = await emitCurrentRoomState(socket, roomId, room)

        socket.emit('spectator_sync', {
          calledNumbers: Array.from(room.calledNumbers),
          currentBall: room.latestNumber || null,
          status: room.status,
          players: playerCount
        })
      } catch (err) {
        console.error('Spectator join error:', err)
      }
    })
    socket.on('leave_room', async ({ roomId, userId }) => {
      try {
        const room = rooms[roomId]
        if (userId) {
          const user = await db('users')
            .where(function () {
              this.where('id', userId).orWhere('telegram_id', userId)
            })
            .first()
          if (user) {
            await db.transaction(async (trx) => {
              const persistedRoom = await trx('game_rooms').where({ id: roomId }).forUpdate().first()
              if (!persistedRoom || !['WAITING', 'COUNTDOWN'].includes(persistedRoom.status)) return

              const participant = await trx('room_participants')
                .where({ room_id: roomId, user_id: user.id })
                .first()
              if (!participant) return

              await trx('room_participants').where({ room_id: roomId, user_id: user.id }).del()
              await trx('room_card_selections').where({ room_id: roomId, user_id: user.id }).del()
            })
          }
        }

        if (room) {
          const wasPlayer = Boolean(room.players?.[socket.id])
          delete room.players?.[socket.id]
          delete room.sockets?.[socket.id]
          if (wasPlayer) await broadcastPlayerCount(io, roomId, room)
          await cleanupEmptyRoom(roomId, room)
        }
        socket.leave(roomId)
      } catch (err) {
        console.error('[ERROR] Failed to leave room:', err)
      }
    })
    socket.on('claim_bingo', async ({ roomId, userId, cardId, markedNumbers }) => {
  if (!Array.isArray(markedNumbers) || markedNumbers.length === 0) {
    return socket.emit('bingo_invalid', { message: 'You must mark numbers before claiming Bingo.' });
  }

  const room = rooms[roomId];
  if (!room) return;

  // 1. Prevent claiming if game is not playing or is already ending
  if (room.status !== 'PLAYING') {
    return socket.emit('bingo_result', { success: false, message: 'The game is not currently active.' });
  }

  // 2. Prevent the same user from claiming twice
  if (!room.claimedBy) room.claimedBy = [];
  if (!Array.isArray(room.claimedBy)) room.claimedBy = [];
  if (room.claimedBy.includes(userId)) {
    return socket.emit('bingo_result', { success: false, message: 'You have already claimed Bingo!' });
  }

  try {
    // 3. Fetch the user's card from the database
    let user = await db('users').where({ id: userId }).first();
    if (!user) user = await db('users').where({ telegram_id: userId }).first();
    const connectedPlayer = room.players[socket.id]
    if (!user || !connectedPlayer || String(connectedPlayer.userId) !== String(user.id)) {
      return socket.emit('bingo_result', { success: false, message: 'Only players in this game can claim Bingo.' });
    }

    const participant = await db('room_participants').where({ room_id: roomId, user_id: user.id }).first();
    if (!participant) {
      return socket.emit('bingo_result', { success: false, message: 'Only players in this game can claim Bingo.' });
    }

    const selection = await db('room_card_selections').where({ room_id: roomId, user_id: user.id, card_id: cardId }).first();
    
    if (!selection) {
      return socket.emit('bingo_result', { success: false, message: 'Card not found.' });
    }

    const cardMatrix = typeof selection.card === 'string' ? JSON.parse(selection.card) : selection.card;

    // Validate client marks against server calls, then check the card pattern using those marks.
    const calledSet = new Set(Array.from(room.calledNumbers, Number));
    const result = validateBingo(cardMatrix, calledSet, markedNumbers);

    if (!result.isValid) {
      return socket.emit('bingo_result', { success: false, message: 'Not a valid Bingo. Keep playing!' });
    }

    // 5. Valid Bingo! Lock the room
    const transitioned = await db('game_rooms')
      .where({ id: roomId, status: 'PLAYING' })
      .update({ status: 'CLAIMING' })
    if (!transitioned) {
      return socket.emit('bingo_result', { success: false, message: 'The game is not currently active.' });
    }

    room.claimedBy.push(userId);
    room.status = 'CLAIMING';
    
    // Stop calling numbers
    clearRoomTimer(room, 'draw')

    // 6. Start the 3-second claim window (allows others to tie)
    scheduleRoomTimeout(room, 'claim', async () => {
      try {
        let winnerName = 'A Player';
        const winnerCount = room.claimedBy.length;
        const participants = await db('room_participants').where({ room_id: roomId });
        const totalPlayers = participants.length;
        
        if (totalPlayers === 0) throw new Error('No players in room');
        const totalPool = room.stake * totalPlayers;
        const platformFee = totalPool * 0.15;
        const netWinnerPool = totalPool - platformFee;
        const payoutPerWinner = Math.floor((netWinnerPool / winnerCount) * 100) / 100;
        const referralPool = Math.floor((totalPool * 0.05) * 100) / 100;
        // Keep total commissions within 5% of the pot when winners tie.
        const referralCommissionPerWinner = Math.floor((referralPool / winnerCount) * 100) / 100;

        // Process payouts in DB
        const inviterUpdates = new Map();
        const winnerUpdates = new Map();
        await db.transaction(async (trx) => {
          for (const winnerId of room.claimedBy) {
            let winnerUser = await trx('users').where({ id: winnerId }).first();
            if (!winnerUser) winnerUser = await trx('users').where({ telegram_id: winnerId }).first();
            if (!winnerUser) continue;
            if (winnerName === 'A Player') winnerName = winnerUser.first_name || winnerUser.username || 'A Player';

            await trx('room_participants')
              .where({ room_id: roomId, user_id: winnerUser.id })
              .update({ is_winner: true });
            await trx('users').where({ id: winnerUser.id }).increment('wallet_balance', payoutPerWinner);
            await trx('financial_ledger').insert({
              user_id: winnerUser.id,
              amount: payoutPerWinner,
              type: 'WINNING_PAYOUT'
            });
            const updatedWinner = await trx('users').where({ id: winnerUser.id }).first();
            if (!updatedWinner) {
              throw new Error(`Could not load winner ${winnerUser.id} after payout.`);
            }
            winnerUpdates.set(winnerUser.id, updatedWinner);
            if (winnerUser.referred_by && referralCommissionPerWinner > 0) {
              const inviter = await trx('users').where({ id: winnerUser.referred_by }).first();
              if (inviter) {
                await trx('users')
                  .where({ id: inviter.id })
                  .increment('referral_balance', referralCommissionPerWinner);
                await trx('referral_earnings').insert({
                  inviter_id: inviter.id,
                  invitee_id: winnerUser.id,
                  room_id: roomId,
                  amount: referralCommissionPerWinner,
                });
                await trx('financial_ledger').insert({
                  user_id: inviter.id,
                  amount: referralCommissionPerWinner,
                  type: 'referral_commission',
                  reference: `Locked referral commission for room ${roomId}`,
                });
                inviterUpdates.set(inviter.id, inviter);
              }
            }
          }

          for (const [inviterId, inviter] of inviterUpdates) {
            const updatedInviter = await trx('users').where({ id: inviterId }).first();
            inviterUpdates.set(inviterId, updatedInviter);
          }
          await trx('game_rooms').where({ id: roomId }).update({ status: 'ENDED' });
        });

        for (const [winnerId, winner] of winnerUpdates) {
          try {
            io.to(`user_${winnerId}`).emit('wallet_updated', {
              newBalance: Number(winner.wallet_balance),
            });
          } catch (emitErr) {
            console.error(`[PAYOUT] Failed to notify winner ${winnerId}:`, emitErr);
          }
        }

        for (const [inviterId, inviter] of inviterUpdates) {
          try {
            io.to(`user_${inviterId}`).emit('wallet_updated', {
              newBalance: Number(inviter.wallet_balance || 0),
              referralBalance: Number(inviter.referral_balance || 0),
            });
          } catch (emitErr) {
            console.error(`[PAYOUT] Failed to notify inviter ${inviterId}:`, emitErr);
          }
        }

        // Emit game over to everyone
        room.status = 'ENDED';
        io.to(roomId).emit('game_over', { 
          winnerIds: room.claimedBy, 
          payout: payoutPerWinner,
          winnerName: winnerName
        });
        io.to(roomId).emit('game_ended_for_spectators');

        scheduleRoomReset(io, roomId, room)

      } catch (err) {
        console.error('[Claim] Payout Error:', err);
        room.status = 'ENDED';
        await db('game_rooms').where({ id: roomId }).update({ status: 'ENDED' }).catch(() => {});
        io.to(roomId).emit('game_over', { winnerIds: room.claimedBy, payout: 0, winnerName: 'Error' });
        io.to(roomId).emit('game_ended_for_spectators');
        scheduleRoomReset(io, roomId, room)
      }
    }, 3000)

  } catch (err) {
    console.error('[Claim] Validation Error:', err);
    socket.emit('bingo_result', { success: false, message: 'Server error during validation.' });
  }
});

    socket.on('get_my_cards', async ({ roomId, userId } = {}) => {
      try {
        let uid = userId
        if (uid) {
          const u = await db('users').where({ id: uid }).first()
          if (!u) {
            const u2 = await db('users').where({ telegram_id: uid }).first()
            if (u2) uid = u2.id
          }
        }
        const persistedRoom = await db('game_rooms').where({ id: roomId }).first()
        const isRejoiningActiveGame =
          persistedRoom &&
          ['COUNTDOWN', 'PLAYING', 'CLAIMING'].includes(persistedRoom.status) &&
          !rooms[roomId]?.players?.[socket.id]
        if (isRejoiningActiveGame) {
          socket.emit('my_cards', { cards: [] })
          return
        }
        const participant = uid
          ? await db('room_participants').where({ room_id: roomId, user_id: uid }).first()
          : null
        if (!participant) {
          socket.emit('my_cards', { cards: [] })
          return
        }

        const selections = await db('room_card_selections').where({ room_id: roomId, user_id: uid })
        const cards = selections.map((sel) => ({
          id: sel.card_id,
          matrix: typeof sel.card === 'string' ? JSON.parse(sel.card) : sel.card,
        }))
        socket.emit('my_cards', { cards })
      } catch (err) {
        console.error('get_my_cards error:', err)
      }
    })

    socket.on('disconnect', async () => {
      for (const roomId of Object.keys(rooms)) {
        const room = rooms[roomId]
        if (!room.sockets?.[socket.id] && !room.players?.[socket.id]) continue

        const wasPlayer = Boolean(room.players?.[socket.id])
        delete room.players?.[socket.id]
        delete room.sockets?.[socket.id]

        if (wasPlayer) {
          try {
            await broadcastPlayerCount(io, roomId, room)
          } catch (err) {
            console.error(`[ERROR] Failed to broadcast player count for room ${roomId}:`, err)
          }
        }

        await cleanupEmptyRoom(roomId, room)
      }
    })
  })
}

function setupSocket(server) {
  const io = new Server(server, {
    cors: { origin: true, methods: ['GET', 'POST'], credentials: true },
  })
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token
    if (!token) return next()

    try {
      const payload = jwt.verify(token, JWT_SECRET)
      if (payload.id) socket.data.userId = payload.id
    } catch (err) {
    }
    next()
  })
  initGameHandler(io)
  return io
}

module.exports = { initGameHandler, setupSocket, rooms }
