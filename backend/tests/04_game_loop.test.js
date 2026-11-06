jest.mock('../src/bot/index', () => ({
  bot: { telegram: { sendMessage: jest.fn().mockResolvedValue(true) } },
}))

const {
  createApiApp,
  createTestContext,
  createTestRoom,
  createTestUser,
  db,
} = require('./helpers')
const request = require('supertest')
const { startSocketHarness, waitForEvent } = require('./socketTestUtils')
const { rooms } = require('../src/sockets/gameHandler')

describe('game loop and socket integration', () => {
  const context = createTestContext()
  let harness
  let roomId

  afterEach(async () => {
    jest.clearAllTimers()
    if (roomId && rooms[roomId]) {
      if (rooms[roomId].intervalId) clearInterval(rooms[roomId].intervalId)
      if (rooms[roomId].resetTimeoutId) clearTimeout(rooms[roomId].resetTimeoutId)
      rooms[roomId].players = {}
      delete rooms[roomId]
    }
    jest.useRealTimers()
    if (harness) {
      await harness.close()
      harness = null
    }
    roomId = null
  })

  afterAll(async () => {
    await context.cleanup()
    await db.destroy()
  })

  test('two connected players receive the same active room state', async () => {
    const userA = await createTestUser(context, { walletBalance: 100 })
    const userB = await createTestUser(context, { walletBalance: 100 })
    const app = createApiApp()
    const stake = 987654
    const joinA = await request(app)
      .post('/api/rooms/join')
      .send({ userId: userA.id, stake, card_number: 21 })
    const joinB = await request(app)
      .post('/api/rooms/join')
      .send({ userId: userB.id, stake, card_number: 22 })
    expect(joinA.status).toBe(200)
    expect(joinB.status).toBe(200)
    expect(joinB.body.roomId).toBe(joinA.body.roomId)
    roomId = joinA.body.roomId
    context.trackRoomId(roomId)
    await db('game_rooms').where({ id: roomId }).update({
      status: 'PLAYING',
      called_numbers: [4, 12],
    })
    harness = await startSocketHarness()

    const socketA = await harness.connect(userA)
    const socketB = await harness.connect(userB)
    const stateA = waitForEvent(socketA, 'game_in_progress')
    const stateB = waitForEvent(socketB, 'game_in_progress')
    socketA.emit('join_room', { roomId, userId: userA.id })
    socketB.emit('join_room', { roomId, userId: userB.id })

    const [gameA, gameB] = await Promise.all([stateA, stateB])
    expect(gameA.players).toBe(2)
    expect(gameB.players).toBe(2)
    expect(gameA.calledNumbers).toEqual([4, 12])

    const count = await db('room_participants').where({ room_id: roomId }).count('* as count').first()
    expect(Number(count.count)).toBe(2)
  })

  test('starts number draws at three-second intervals after the countdown', async () => {
    const userA = await createTestUser(context, { walletBalance: 100 })
    const userB = await createTestUser(context, { walletBalance: 100 })
    const room = await createTestRoom(context)
    roomId = room.id
    await addParticipant(roomId, userA, 31)
    await addParticipant(roomId, userB, 32)
    harness = await startSocketHarness()

    const socketA = await harness.connect(userA)
    const socketB = await harness.connect(userB)
    jest.useFakeTimers({
      doNotFake: ['setTimeout', 'clearTimeout', 'nextTick', 'setImmediate', 'Date', 'performance', 'queueMicrotask'],
    })

    const countdown = waitForEvent(socketA, 'countdown_tick', {
      predicate: (payload) => payload.timeLeft === 30,
    })
    socketA.emit('join_room', { roomId, userId: userA.id })
    socketB.emit('join_room', { roomId, userId: userB.id })
    await countdown

    const firstCall = waitForEvent(socketA, 'new_number_called')
    const expectedNumberCall = waitForEvent(socketA, 'number_called', { timeout: 1500 })
      .then(() => true, () => false)
    await jest.advanceTimersByTimeAsync(33000)
    expect((await firstCall).number).toEqual(expect.any(Number))
    expect((await db('game_rooms').where({ id: roomId }).first()).status).toBe('PLAYING')

    let secondCallReceived = false
    const secondCall = waitForEvent(socketA, 'new_number_called').then((payload) => {
      secondCallReceived = true
      return payload
    })
    await jest.advanceTimersByTimeAsync(2999)
    await new Promise((resolve) => setImmediate(resolve))
    expect(secondCallReceived).toBe(false)
    await jest.advanceTimersByTimeAsync(1)
    expect((await secondCall).number).toEqual(expect.any(Number))
    expect(await expectedNumberCall).toBe(true)
  })

  test('rejects empty and uncalled marks, then pays a valid Bingo and referral commission', async () => {
    const inviter = await createTestUser(context, { walletBalance: 0 })
    const winner = await createTestUser(context, {
      walletBalance: 90,
      referredBy: inviter.id,
    })
    const otherPlayer = await createTestUser(context, { walletBalance: 90 })
    const room = await createTestRoom(context, { status: 'PLAYING', stake: 10 })
    roomId = room.id
    const winningCard = await addParticipant(roomId, winner, 41)
    await addParticipant(roomId, otherPlayer, 42)
    const calledNumbers = winningCard[0].map(Number)
    await db('game_rooms').where({ id: roomId }).update({
      called_numbers: JSON.stringify(calledNumbers),
    })
    harness = await startSocketHarness()
    const socket = await harness.connect(winner)
    const activeGame = waitForEvent(socket, 'game_in_progress')
    socket.emit('join_room', { roomId, userId: winner.id })
    await activeGame

    rooms[roomId].players[socket.id] = { socketId: socket.id, userId: winner.id }

    const emptyMarks = waitForEvent(socket, 'bingo_invalid')
    socket.emit('claim_bingo', {
      roomId,
      userId: winner.id,
      cardId: 41,
      markedNumbers: [],
    })
    expect((await emptyMarks).message).toMatch(/mark numbers/)

    const fakeMarks = waitForEvent(socket, 'bingo_result')
    socket.emit('claim_bingo', {
      roomId,
      userId: winner.id,
      cardId: 41,
      markedNumbers: [75],
    })
    expect((await fakeMarks).success).toBe(false)

    const gameOver = waitForEvent(socket, 'game_over', { timeout: 10000 })
    socket.emit('claim_bingo', {
      roomId,
      userId: winner.id,
      cardId: 41,
      markedNumbers: calledNumbers,
    })
    const result = await gameOver
    expect(result.winnerIds).toContain(winner.id)
    expect(Number(result.payout)).toBe(17)

    const updatedWinner = await db('users').where({ id: winner.id }).first()
    const updatedInviter = await db('users').where({ id: inviter.id }).first()
    expect(Number(updatedWinner.wallet_balance)).toBe(107)
    expect(Number(updatedInviter.referral_balance)).toBe(1)
    await expect(db('financial_ledger')
      .where({ user_id: winner.id, type: 'WINNING_PAYOUT', amount: 17 })
      .first()).resolves.toBeTruthy()
    await expect(db('financial_ledger')
      .where({ user_id: inviter.id, type: 'referral_commission', amount: 1 })
      .first()).resolves.toBeTruthy()
    await expect(db('referral_earnings')
      .where({ inviter_id: inviter.id, invitee_id: winner.id, room_id: roomId })
      .first()).resolves.toBeTruthy()
  })

  test('emits bingo_valid when a valid claim is accepted', async () => {
    const winner = await createTestUser(context, { walletBalance: 90 })
    const otherPlayer = await createTestUser(context, { walletBalance: 90 })
    const room = await createTestRoom(context, { status: 'PLAYING', stake: 10 })
    roomId = room.id
    const card = await addParticipant(roomId, winner, 51)
    await addParticipant(roomId, otherPlayer, 52)
    const calledNumbers = card[0].map(Number)
    await db('game_rooms').where({ id: roomId }).update({ called_numbers: calledNumbers })
    harness = await startSocketHarness()
    const socket = await harness.connect(winner)
    const activeGame = waitForEvent(socket, 'game_in_progress')
    socket.emit('join_room', { roomId, userId: winner.id })
    await activeGame
    rooms[roomId].players[socket.id] = { socketId: socket.id, userId: winner.id }

    const accepted = waitForEvent(socket, 'bingo_valid', { timeout: 1500 })
      .then(() => true, () => false)
    const gameOver = waitForEvent(socket, 'game_over', { timeout: 10000 })
    socket.emit('claim_bingo', {
      roomId,
      userId: winner.id,
      cardId: 51,
      markedNumbers: calledNumbers,
    })
    await gameOver
    expect(await accepted).toBe(true)
  })
})
