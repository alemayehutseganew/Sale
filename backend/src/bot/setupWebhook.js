const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') })

const { Telegraf } = require('telegraf')

const backendUrl = process.env.BACKEND_URL
const botToken = process.env.TELEGRAM_BOT_TOKEN

if (!backendUrl || !botToken) {
  console.error('❌ BACKEND_URL and TELEGRAM_BOT_TOKEN must be set.')
  process.exitCode = 1
} else {
  const webhookUrl = `${backendUrl.replace(/\/+$/, '')}/api/bot/webhook`
  const bot = new Telegraf(botToken)

  ;(async () => {
    try {
      await bot.telegram.setWebhook(webhookUrl, {
        drop_pending_updates: true
      })
      console.log(`✅ Webhook set to: ${webhookUrl}`)

      await bot.telegram.setMyCommands([
        { command: 'register', description: 'Register your phone number' },
        { command: 'start', description: 'Restart' },
        { command: 'menu', description: 'Menu' },
        { command: 'play', description: 'Play' },
        { command: 'balance', description: 'Balance' },
        { command: 'deposit', description: 'Deposit' },
        { command: 'withdraw', description: 'Withdraw' },
        { command: 'help', description: 'How to play the game' }
      ])
      console.log('✅ Commands registered')
    } catch (err) {
      if (err.response?.error_code === 409) {
        console.error('❌ Webhook conflict: Another bot instance is already running with this token. Make sure only one instance is active.')
      } else {
        console.error('❌ Failed to set webhook or commands:', err)
      }
      process.exitCode = 1
    }
  })()
}
