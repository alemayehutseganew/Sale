const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') })

const { Telegraf } = require('telegraf')
const { getWebhookBaseUrl, getBotWebhookUrl } = require('./webhookUrl')

const botToken = process.env.TELEGRAM_BOT_TOKEN

if (!botToken) {
  console.error('❌ TELEGRAM_BOT_TOKEN must be set.')
  process.exitCode = 1
} else {
  const bot = new Telegraf(botToken)
  const webhookUrl = getBotWebhookUrl(getWebhookBaseUrl(), bot.secretPathComponent())

  ;(async () => {
    try {
      await bot.telegram.setWebhook(webhookUrl)

      await bot.telegram.setMyCommands([
        { command: 'start', description: 'Start the bot and open the game' },
        { command: 'balance', description: 'Check your wallet balance' },
        { command: 'invite', description: 'Get your referral link to earn 5%' },
        { command: 'deposit', description: 'Deposit ETB to play' },
        { command: 'withdraw', description: 'Withdraw your winnings' },
        { command: 'menu', description: 'Open the game menu' },
        { command: 'play', description: 'Play the game' },
        { command: 'help', description: 'How to play the game' },
        { command: 'register', description: 'Register your phone number' }
      ])
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
