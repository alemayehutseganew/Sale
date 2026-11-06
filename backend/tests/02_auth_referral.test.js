const request = require('supertest')
const jwt = require('jsonwebtoken')
const {
  createApiApp,
  createInitData,
  createTestContext,
  createTestRoom,
  createTestUser,
  createToken,
  db,
  nextTelegramId,
} = require('./helpers')

describe('authentication and referral capture', () => {
  const context = createTestContext()
  let app

  beforeAll(() => {
    app = createApiApp()
  })

  afterAll(async () => {
    await context.cleanup()
    await db.destroy()
  })

  test('registers a Telegram user and returns a verifiable JWT', async () => {
    const telegramId = nextTelegramId()
    const username = `qa_auth_${telegramId}`
    context.trackTelegramId(telegramId)
    const response = await request(app)
      .post('/api/auth/login')
      .send({ initData: createInitData({ id: telegramId, username }) })

    expect(response.status).toBe(200)
    expect(response.body.user.telegram_id).toBe(String(telegramId))
    expect(response.body.token).toEqual(expect.any(String))
    expect(jwt.verify(response.body.token, process.env.JWT_SECRET)).toMatchObject({
      id: response.body.user.id,
      telegram_id: String(telegramId),
    })
  })

  test('attributes a new invitee to the referring user', async () => {
    const inviterId = nextTelegramId()
    const inviteeId = nextTelegramId()
    const inviterName = `qa_inviter_${inviterId}`
    context.trackTelegramId(inviterId)
    context.trackTelegramId(inviteeId)

    const inviterResponse = await request(app)
      .post('/api/auth/login')
      .send({ initData: createInitData({ id: inviterId, username: inviterName }) })
    expect(inviterResponse.status).toBe(200)

    const inviteeResponse = await request(app)
      .post('/api/auth/login')
      .send({
        initData: createInitData({ id: inviteeId, username: `qa_invitee_${inviteeId}` }),
        referralRef: `@${inviterName}`,
      })
    expect(inviteeResponse.status).toBe(200)

    const invitee = await db('users').where({ telegram_id: inviteeId }).first()
    expect(invitee.referred_by).toBe(inviterResponse.body.user.id)
  })

  test('rejects unauthenticated wallet balance requests', async () => {
    const user = await createTestUser(context)
    const response = await request(app)
      .get(`/api/wallet/balance?userId=${user.id}`)

    expect(response.status).toBe(401)
  })

  test('uses the JWT identity instead of a spoofed room-join userId', async () => {
    const userA = await createTestUser(context)
    const userB = await createTestUser(context)
    const room = await createTestRoom(context, { stake: 987654 })
    const response = await request(app)
      .post('/api/rooms/join')
      .set('Authorization', `Bearer ${createToken(userA)}`)
      .send({ userId: userB.id, stake: room.stake_amount, card_number: 1 })

    expect(response.status).toBe(200)
    const participantA = await db('room_participants')
      .where({ room_id: response.body.roomId, user_id: userA.id })
      .first()
    const participantB = await db('room_participants')
      .where({ room_id: response.body.roomId, user_id: userB.id })
      .first()
    expect(participantA).toBeTruthy()
    expect(participantB).toBeFalsy()
  })
})
