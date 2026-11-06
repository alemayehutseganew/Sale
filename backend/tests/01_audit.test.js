const {
  createTestContext,
  db,
} = require('./helpers')

describe('environment and schema audit', () => {
  const context = createTestContext()

  afterAll(async () => {
    await context.cleanup()
    await db.destroy()
  })

  test('required database tables exist', async () => {
    const requiredTables = [
      'users',
      'game_rooms',
      'payments',
      'referral_earnings',
      'admins',
      'financial_ledger',
    ]

    for (const table of requiredTables) {
      await expect(db.schema.hasTable(table)).resolves.toBe(true)
    }
  })

  test('users has playable and referral balance columns', async () => {
    const columns = await db('users').columnInfo()
    expect(columns).toHaveProperty('wallet_balance')
    expect(columns).toHaveProperty('referral_balance')
  })

  test('required runtime secrets are loaded', () => {
    expect(process.env.JWT_SECRET).toBeTruthy()
    expect(process.env.TELEBIRR_RECEIVER_NUMBER).toBeTruthy()
  })
})
