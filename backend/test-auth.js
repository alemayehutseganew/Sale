require('dotenv').config()

// Ensure a bot token is available for the test (override if not set)
if (!process.env.TELEGRAM_BOT_TOKEN) {
  process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token-12345'
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'dev-secret'
}

const crypto = require('crypto')
const { app } = require('./index')

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN

function buildInitData() {
  const user = { id: 987654321, first_name: 'TestUser', username: 'testuser' }
  const params = {
    user: JSON.stringify(user),
    auth_date: String(Math.floor(Date.now() / 1000)),
  }

  const dataCheckString = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('\n')

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest()
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

  const search = new URLSearchParams({ ...params, hash })
  return search.toString()
}

;(async () => {
  const server = app.listen(0, async () => {
    const port = server.address().port
    const initData = buildInitData()

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      })

      const data = await res.json()
      console.log('HTTP status:', res.status)
      console.log('Response:', JSON.stringify(data, null, 2))

      if (res.ok && data.user && data.user.id && String(data.user.telegram_id) === '987654321') {
        console.log('\nSUCCESS: user found/created. Internal DB id =', data.user.id)
      } else {
        console.log('\nFAILURE: unexpected response')
        process.exitCode = 1
      }
    } catch (err) {
      console.error('Test error:', err)
      process.exitCode = 1
    } finally {
      server.close(() => process.exit(process.exitCode || 0))
    }
  })
})()
