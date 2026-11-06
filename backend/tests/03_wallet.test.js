const request = require('supertest')
const {
  createApiApp,
  createTestContext,
  createTestUser,
  createToken,
  db,
} = require('./helpers')

function telebirrPaymentDate() {
  const date = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
  const [year, month, day] = date.slice(0, 10).split('-')
  const time = date.slice(11, 19)
  return `${day}-${month}-${year} ${time}`
}

function validReceipt(amount) {
  return {
    ok: true,
    receipt: {
      source: 'telebirr-html',
      transactionStatus: 'Completed',
      creditedPartyAccountNo: process.env.TELEBIRR_RECEIVER_NUMBER,
      settledAmount: String(amount),
      paymentDate: telebirrPaymentDate(),
    },
  }
}

describe('wallet and payment integrity', () => {
  const context = createTestContext()
  let app
  let fetchMock

  beforeAll(() => {
    app = createApiApp()
  })

  afterEach(() => {
    fetchMock?.mockRestore()
    fetchMock = null
  })

  afterAll(async () => {
    await context.cleanup()
    await db.destroy()
  })

  test('prevents a verified receipt from being credited twice', async () => {
    const user = await createTestUser(context)
    const token = createToken(user)
    fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => validReceipt(100),
    }))
    const payload = { amount: 100, reference: 'MOCKTXN123' }

    const first = await request(app)
      .post('/api/wallet/deposit')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
    const second = await request(app)
      .post('/api/wallet/deposit')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)

    expect(first.status).toBe(200)
    expect(second.status).toBe(409)
    const updatedUser = await db('users').where({ id: user.id }).first()
    expect(Number(updatedUser.wallet_balance)).toBe(100)
    const transactionCount = await db('verified_transactions')
      .where({ user_id: user.id })
      .count('* as count')
      .first()
    expect(Number(transactionCount.count)).toBe(1)
  })

  test('serializes competing withdrawals so the same balance is not spent twice', async () => {
    const user = await createTestUser(context, { walletBalance: 100 })
    const payload = {
      userId: user.id,
      amount: 100,
      provider: 'telebirr',
      phoneNumber: '0900000000',
    }

    const responses = await Promise.all(
      Array.from({ length: 3 }, () => request(app).post('/api/wallet/withdraw').send(payload)),
    )

    expect(responses.filter((response) => response.status === 200)).toHaveLength(1)
    const failures = responses.filter((response) => response.status === 400)
    expect(failures).toHaveLength(2)
    expect(failures.every((response) => /Insufficient wallet balance/.test(response.body.error))).toBe(true)
    const updatedUser = await db('users').where({ id: user.id }).first()
    expect(Number(updatedUser.wallet_balance)).toBe(0)
  })

  test('enforces the referral withdrawal minimum and permits eligible withdrawals', async () => {
    const user = await createTestUser(context, { referralBalance: 500 })
    const requestWithdrawal = (amount) => request(app)
      .post('/api/wallet/withdraw')
      .send({ userId: user.id, amount, provider: 'telebirr', source: 'referral' })

    const belowThreshold = await requestWithdrawal(100)
    expect(belowThreshold.status).toBe(400)
    expect(belowThreshold.body.error).toMatch(/1,000 ETB/)

    await db('users').where({ id: user.id }).update({ referral_balance: 1200 })
    const eligible = await requestWithdrawal(500)
    expect(eligible.status).toBe(200)
    expect(eligible.body.newBalance).toBe(700)
  })
})
