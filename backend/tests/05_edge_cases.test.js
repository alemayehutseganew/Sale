jest.mock('../src/bot/index', () => ({
  bot: { telegram: { sendMessage: jest.fn().mockResolvedValue(true) } },
}))

const {
  addParticipant,
  createTestContext,
  createTestRoom,
  createTestUser,
  db,
} = require('./helpers')
const { startSocketHarness, waitForEvent } = require('./socketTestUtils')
const { rooms } = require('../src/sockets/gameHandler')

describe('game exhaustion and reconnect edge cases', () => {
  const context = createTestContext()
  let harness
  let roomId

  afterEach(async () => {
    jest.clearAllTimers()
    jest.restoreAllMocks()
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

  test('sends the persisted called numbers to a reconnecting player', async () => {
    const user = await createTestUser(context, { walletBalance: 100 })
    const numbers = [1, 2, 3, 4, 5, 16, 17, 18, 19, 20]
    const room = await createTestRoom(context, {
      status: 'PLAYING',
      calledNumbers: numbers,
    })
    roomId = room.id
    await addParticipant(roomId, user, 61)
    harness = await startSocketHarness()

    const firstSocket = await harness.connect(user)
    const firstState = waitForEvent(firstSocket, 'game_in_progress')
    firstSocket.emit('join_room', { roomId, userId: user.id })
    await firstState
    firstSocket.disconnect()
    await new Promise((resolve) => setTimeout(resolve, 50))

    const reconnectedSocket = await harness.connect(user)
    const state = waitForEvent(reconnectedSocket, 'game_in_progress')
    const latestBall = waitForEvent(reconnectedSocket, 'new_number_called')
    reconnectedSocket.emit('join_room', { roomId, userId: user.id })
    const currentState = await state
    expect(currentState.calledNumbers).toEqual(numbers)
    expect((await latestBall).calledNumbers).toEqual(numbers)
  })

  test('emits sync_game_state to a reconnecting player', async () => {
    const user = await createTestUser(context, { walletBalance: 100 })
    const room = await createTestRoom(context, {
      status: 'PLAYING',
      calledNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    })
    roomId = room.id
    await addParticipant(roomId, user, 62)
    harness = await startSocketHarness()

    const socket = await harness.connect(user)
    const synced = waitForEvent(socket, 'sync_game_state', { timeout: 1500 })
    socket.emit('join_room', { roomId, userId: user.id })
    await synced
  })

  test('refunds stakes and resets the room after exhausting all balls without a winner', async () => {
    const userA = await createTestUser(context, { walletBalance: 100 })
    const userB = await createTestUser(context, { walletBalance: 100 })
    const room = await createTestRoom(context, { stake: 10 })
    roomId = room.id
    await addParticipant(roomId, userA, 71)
    await addParticipant(roomId, userB, 72)
    harness = await startSocketHarness()
    const socketA = await harness.connect(userA)
    const socketB = await harness.connect(userB)
    jest.spyOn(Math, 'random').mockReturnValue(0.99)
    jest.useFakeTimers({
      doNotFake: ['setTimeout', 'clearTimeout', 'nextTick', 'setImmediate', 'Date', 'performance', 'queueMicrotask'],
    })

    const countdown = waitForEvent(socketA, 'countdown_tick', {
      predicate: (payload) => payload.timeLeft === 30,
    })
    socketA.emit('join_room', { roomId, userId: userA.id })
    socketB.emit('join_room', { roomId, userId: userB.id })
    await countdown
    await jest.advanceTimersByTimeAsync(30000)

    rooms[roomId].calledNumbers = new Set(Array.from({ length: 74 }, (_, index) => index + 1))
    const exhaustion = waitForEvent(socketA, 'game_ended_for_spectators', { timeout: 10000 })
    await jest.advanceTimersByTimeAsync(3000)
    expect((await exhaustion).noWinner).toBe(true)

    const reset = waitForEvent(socketA, 'room_reset', { timeout: 10000 })
    await reset
    const updatedRoom = await db('game_rooms').where({ id: roomId }).first()
    expect(updatedRoom.status).toBe('WAITING')
    const balances = await db('users').whereIn('id', [userA.id, userB.id])
    expect(balances.every((user) => Number(user.wallet_balance) === 100)).toBe(true)
  })

  test('emits game_over with reason no_winner when all 75 balls are exhausted', async () => {
    const userA = await createTestUser(context, { walletBalance: 100 })
    const userB = await createTestUser(context, { walletBalance: 100 })
    const room = await createTestRoom(context, { stake: 10 })
    roomId = room.id
    await addParticipant(roomId, userA, 73)
    await addParticipant(roomId, userB, 74)
    harness = await startSocketHarness()
    const socketA = await harness.connect(userA)
    const socketB = await harness.connect(userB)
    jest.spyOn(Math, 'random').mockReturnValue(0.99)
    jest.useFakeTimers({
      doNotFake: ['setTimeout', 'clearTimeout', 'nextTick', 'setImmediate', 'Date', 'performance', 'queueMicrotask'],
    })

    const countdown = waitForEvent(socketA, 'countdown_tick', {
      predicate: (payload) => payload.timeLeft === 30,
    })
    socketA.emit('join_room', { roomId, userId: userA.id })
    socketB.emit('join_room', { roomId, userId: userB.id })
    await countdown
    await jest.advanceTimersByTimeAsync(30000)
    rooms[roomId].calledNumbers = new Set(Array.from({ length: 74 }, (_, index) => index + 1))

    const noWinner = waitForEvent(socketA, 'game_over', {
      predicate: (payload) => payload.reason === 'no_winner',
      timeout: 10000,
    })
    await jest.advanceTimersByTimeAsync(3000)
    await noWinner
  })
})
