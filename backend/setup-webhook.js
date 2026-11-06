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
      { command: 'start', description: 'Start the bot and open the game' },
      { command: 'balance', description: 'Check your wallet balance' },
      { command: 'invite', description: 'Get your referral link to earn 5%' },
      { command: 'deposit', description: 'Deposit ETB to play' },
      { command: 'withdraw', description: 'Withdraw your winnings' },
      { command: 'menu', description: 'Open the game menu' },
      { command: 'play', description: 'Play the game' },
      { command: 'help', description: 'How to play the game' },
      { command: 'register', description: 'Register your phone number' }
    ]);
    console.log('✅ Commands registered successfully!');
  } catch (err) {
    console.error('❌ Failed to set webhook:', err);
  }
})();