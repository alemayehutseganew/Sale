require('dotenv').config();
const { Telegraf } = require('telegraf');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Use your actual Enzonic URL here. 
const WEBHOOK_URL = process.env.BACKEND_URL 
  ? `${process.env.BACKEND_URL}/api/bot/webhook` 
  : 'https://ked.enzonic.dev/api/bot/webhook';

(async () => {
  try {
    console.log(`⏳ Setting webhook to: ${WEBHOOK_URL}`);
    await bot.telegram.setWebhook(WEBHOOK_URL);
    console.log(`✅ Webhook set successfully!`);
    
    await bot.telegram.setMyCommands([
      { command: 'register', description: 'Register your phone number' },
      { command: 'start', description: 'Restart' },
      { command: 'menu', description: 'Menu' },
      { command: 'play', description: 'Play' },
      { command: 'balance', description: 'Balance' },
      { command: 'deposit', description: 'Deposit' },
      { command: 'withdraw', description: 'Withdraw' },
      { command: 'help', description: 'How to play the game' }
    ]);
    console.log('✅ Commands registered successfully!');
  } catch (err) {
    console.error('❌ Failed to set webhook:', err);
  }
})();