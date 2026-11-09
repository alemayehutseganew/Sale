console.log('🤖 Bot instance initialized...')

const { Telegraf, Markup } = require('telegraf')
const db = require('../db')
const { parseTelebirrSMS, creditVerifiedDeposit } = require('../services/paymentService')
const { getT } = require('./translations')

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://sale-green.vercel.app/'
const SUPPORT_SUFFIX = '\n\nFor more support: @saleg122'
const botTranslations = {
  en: {
    helpMessage: `✅ Game Card
1. To start the game, select a Bingo card from the 1-400 card selection board.
2. Inactive numbers on the board mean the card has already been selected by another player.
3. When you select a card, it will show the numbers at the bottom.
4. When the countdown timer reaches zero, you will automatically enter the game.

✅ How the game is played
1. After entering the game, you will find your selected card on the right side.
2. When the game starts, the system will randomly call numbers from 1 to 75.
3. From the numbers called by the system, select and mark (shade) the ones that match your card.

🏆 Ways to win
1. Based on the marked numbers on your card:
• Complete a horizontal or vertical line.
• Complete a diagonal line.
• Mark all four corners.

✅ If there is more than one winner, the prize pool is split among them.

For more support: @saleg122`,
  },
  am: {
    helpMessage: `✅ መጫወቻ ካርድ
1. ጨዋታውን ለመጀመር ከ1-400 የካርድ መምረጫ ቦርድ ውስጥ አንድ የመጫወቻ ካርድ (ካርቴላ) ይምረጡ።
2. የካርድ መምረጫ ቦርድ ላይ Inactive ቁጥሮች የሚያሳዩት መጫወቻ ካርዱ (ካርቴላው) በሌላ ተጫዋች መመረጡን ነው።
3. የመጫወቻ ካርዱን (ካርቴላውን) ሲመርጡት ከታች የሚይዛቸውን ቁጥሮች ያሳያል።
4. ወደ ጨዋታው ለመግባት ለምዝገባ የተሰጠው ሰኮንድ ዜሮ ሲሆን ቀጥታ ወደ ጨዋታ ያስገባል።

✅ ጨዋታ እንዴት ይካሄዳል
1. ወደ ጨዋታው ከገቡ በኋላ በመረጡት የመጫወቻ ካርድ (ካርቴላ) በቀኝ በኩል ያገኙታል።
2. ጨዋታው ሲጀምር ሲስተሙ ከ1 እስከ 75 ያሉ ቁጥሮችን Randomly መጥራት ይጀምራል።
3. ሲስተሙ ከሚጠራቸው ቁጥሮች ውስጥ በራስዎ የመጫወቻ ካርድ (ካርቴላ) ላይ ካሉ በመምረጥ ያጥቁሩ።

🏆 አሸናፊ የሚሆኑባቸው መንገዶች
1. መጫወቻ ካርድ (ካርቴላ) ላይ የተጠቆሩት ቁጥሮች፦
• ወደጎን ወይም ወደታች መስመር ከሰሩ
• ወደሁለቱም አግዳሚ (Diagonal) መስመር ከሰሩ
• አራቱ ማእዘናት (ኮርነር) ከተጠሩ አሸናፊ ይሆናሉ።

✅ ከአንድ በላይ አሸናፊ ካለ ደራሽ ገንዘቡን ይከፋፈላሉ።

ለተጨማሪ ድጋፍ፦ @saleg122`,
  },
}
const userStates = {}
let commandRegistrationPromise
let botInfoPromise

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN)

bot.catch((err, ctx) => {
  console.error(`[BOT] Error for ${ctx.updateType}:`, err.message)
})

function replyWithSupport(ctx, text, options) {
  const message = `${text}${SUPPORT_SUFFIX}`
  return options ? ctx.reply(message, options) : ctx.reply(message)
}

async function getUserLanguage(telegramId) {
  try {
    const user = await db('users').where({ telegram_id: telegramId }).first()
    return user?.language || 'en'
  } catch (err) {
    console.error('Failed to fetch user language:', err.message)
    return 'en'
  }
}

function getMainMenu(lang = 'en') {
  const t = getT(lang)
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: t.play_btn, web_app: { url: FRONTEND_URL } }],
        [{ text: '👥 Invite Friends & Earn 5%', callback_data: 'show_invite' }],
        [{ text: t.btn_balance, callback_data: 'menu_balance' }, { text: t.btn_deposit, callback_data: 'menu_deposit' }],
        [{ text: t.btn_withdraw, callback_data: 'menu_withdraw' }, { text: t.btn_room, callback_data: 'menu_room' }],
        [{ text: t.btn_help, callback_data: 'menu_help' }],
      ]
    }
  }
}

async function registerBotCommands() {
  if (!commandRegistrationPromise) {
    commandRegistrationPromise = bot.telegram.setMyCommands([
      { command: 'start', description: 'start' },
      { command: 'play', description: 'play' },
      { command: 'invite', description: 'invite' },
      { command: 'menu', description: 'menu' },
      { command: 'balance', description: 'balance' },
      { command: 'deposit', description: 'deposit' },
      { command: 'withdraw', description: 'withdraw' },
      { command: 'register', description: 'register' },
      { command: 'help', description: 'help' }
    ]).then(() => console.log('✅ Commands registered')).catch(console.error)
  }
  return commandRegistrationPromise
}

registerBotCommands().catch((err) => {
  console.error('[BOT] Command menu initialization failed:', err)
})

async function sendInvite(ctx) {
  try {
    const user = await db('users').where({ telegram_id: ctx.from.id }).first()
    if (!user) return replyWithSupport(ctx, 'Please open the Mini App first to register.')

    const refId = user.username || user.telegram_id
    const botUsername = ctx.botInfo?.username || await getBotUsername()
    const refLink = `https://t.me/${botUsername}?start=REF_${encodeURIComponent(String(refId))}`
    const shareText = 'Join me on GoBingo and win big! 🎰'
    const message = `🎉 Invite & Earn 5%!\n\nShare your unique link with friends. When they win a game, you get 5% of their prize!\n\n🔗 Your Link:\n${refLink}\n\nYou can withdraw your earnings once you reach 1,000 ETB!`
    const openGameButton = ctx.chat?.type === 'private'
      ? { text: '🎮 Open Game', web_app: { url: FRONTEND_URL } }
      : { text: '🎮 Open Game', url: FRONTEND_URL }

    return replyWithSupport(ctx, message, {
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [{
            text: '📢 Share to Group/Channel',
            url: `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent(shareText)}`,
          }],
          [openGameButton],
        ],
      },
    })
  } catch (err) {
    console.error('Invite command error:', err)
    return replyWithSupport(ctx, '❌ Could not generate your invite link. Please try again later.')
  }
}

async function getBotUsername() {
  if (!botInfoPromise) {
    botInfoPromise = bot.telegram.getMe().catch((err) => {
      botInfoPromise = null
      throw err
    })
  }
  return (await botInfoPromise).username
}

bot.start(async (ctx) => {
  try {
    console.log('[BOT TRACE] /start command triggered!')
    try {
      await registerBotCommands()
    } catch {
      // Keep /start available even if Telegram command-menu registration fails.
    }

    const payload = ctx.startPayload
    if (payload) {
      let webAppUrl = FRONTEND_URL
      try {
        const parsedUrl = new URL(FRONTEND_URL)
        const referral = payload.startsWith('REF_') ? payload.slice(4) : payload
        parsedUrl.searchParams.set('ref', /^\d+$/.test(referral) ? referral : `@${referral}`)
        webAppUrl = parsedUrl.toString()
      } catch (err) {
        console.error('[BOT] Invalid FRONTEND_URL for referral link:', err.message)
        return replyWithSupport(ctx, 'The game link is temporarily unavailable.')
      }

      return replyWithSupport(ctx, 'Welcome to GoBingo! 🎰', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎮 Open Game', web_app: { url: webAppUrl } }],
            [{ text: '👥 Invite Friends & Earn 5%', callback_data: 'show_invite' }],
          ],
        },
      }).catch((err) => console.error('Start error:', err.message))
    }

    return replyWithSupport(ctx, getT('en').choose_lang, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🇬🇧 English', callback_data: 'lang_en' }, { text: '🇪🇹 አማርኛ', callback_data: 'lang_am' }],
          [{ text: '👥 Invite Friends & Earn 5%', callback_data: 'show_invite' }],
        ]
      }
    }).catch((err) => console.error('Start error:', err.message))
  } catch (err) {
    console.error('❌ /start CRASH:', err)
  }
})

bot.command(['invite', 'refer'], sendInvite)
bot.action('show_invite', async (ctx) => {
  await ctx.answerCbQuery().catch((err) => console.error('Invite callback error:', err))
  await sendInvite(ctx)
})

bot.on('inline_query', async (ctx) => {
  const query = ctx.inlineQuery.query.trim()
  const referral = query.startsWith('start=') ? query.slice('start='.length) : query
  if (!referral) {
    return ctx.answerInlineQuery([])
  }

  const botUsername = process.env.TELEGRAM_BOT_USERNAME || process.env.VITE_BOT_USERNAME || 'GoBingoBot'
  const referralUrl = `https://t.me/${botUsername.replace(/^@/, '')}?start=${encodeURIComponent(referral)}`
  await ctx.answerInlineQuery([{
    type: 'article',
    id: 'Gobingo-referral',
    title: 'Play GoBingo!',
    description: 'Tap to join the game and win big!',
    input_message_content: {
      message_text: `🎰 Join me on GoBingo and win big!\n${referralUrl}`,
    },
    reply_markup: {
      inline_keyboard: [
        [{ text: '🎮 Play Now', url: referralUrl }],
      ],
    },
  }])
})

bot.action('lang_en', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  try {
    await db('users').where({ telegram_id: ctx.from.id }).update({ language: 'en' })
  } catch (err) {
    console.error('Failed to set English language:', err.message)
  }
  replyWithSupport(ctx, getT('en').lang_set_en, getMainMenu('en')).catch(() => {})
})

bot.action('lang_am', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  try {
    await db('users').where({ telegram_id: ctx.from.id }).update({ language: 'am' })
  } catch (err) {
    console.error('Failed to set Amharic language:', err.message)
  }
  replyWithSupport(ctx, getT('am').lang_set_am, getMainMenu('am')).catch(() => {})
})

bot.command('menu', async (ctx) => {
  const lang = await getUserLanguage(ctx.from.id)
  replyWithSupport(ctx, getT(lang).main_menu, getMainMenu(lang)).catch(() => {})
})

bot.command('play', async (ctx) => {
  const t = getT(await getUserLanguage(ctx.from.id))
  replyWithSupport(ctx, t.play_prompt, {
    reply_markup: { inline_keyboard: [[{ text: t.play_btn, web_app: { url: FRONTEND_URL } }]] }
  }).catch(() => {})
})

bot.command('balance', async (ctx) => {
  const t = getT(await getUserLanguage(ctx.from.id))
  try {
    const user = await db('users').where({ telegram_id: ctx.from.id }).first()
    if (user) replyWithSupport(ctx, `${t.my_balance}${Number(user.wallet_balance || 0).toFixed(2)}`)
    else replyWithSupport(ctx, t.user_not_found)
  } catch (err) {
    console.error('[BOT ERROR] Failed to fetch balance for user:', ctx.from.id, err)
    replyWithSupport(ctx, t.err_balance).catch(() => {})
  }
})

bot.command('help', async (ctx) => {
  const lang = await getUserLanguage(ctx.from.id)
  ctx.reply((botTranslations[lang] || botTranslations.en).helpMessage).catch(() => {})
})

bot.command('register', async (ctx) => {
  const t = getT(await getUserLanguage(ctx.from.id))
  return replyWithSupport(ctx,
    t.register_prompt,
    Markup.keyboard([
      [Markup.button.contactRequest(t.register_btn)]
    ]).resize().oneTime()
  )
})

bot.command('deposit', async (ctx) => {
  userStates[ctx.from.id] = 'WAITING_FOR_RECEIPT'
  replyWithSupport(ctx, getT(await getUserLanguage(ctx.from.id)).deposit_inst).catch(() => {})
})

bot.command('withdraw', async (ctx) => {
  userStates[ctx.from.id] = 'WAITING_FOR_WITHDRAW_AMOUNT'
  replyWithSupport(ctx, getT(await getUserLanguage(ctx.from.id)).withdraw_prompt).catch(() => {})
})

bot.action('menu_balance', async (ctx) => {
  const t = getT(await getUserLanguage(ctx.from.id))
  try {
    await ctx.answerCbQuery().catch(() => {})
    const user = await db('users').where({ telegram_id: ctx.from.id }).first()
    if (!user) return replyWithSupport(ctx, t.user_not_found)
    replyWithSupport(ctx, `${t.my_balance}${Number(user.wallet_balance || 0).toFixed(2)}`).catch(() => {})
  } catch (err) {
    console.error('Balance Error:', err)
    replyWithSupport(ctx, t.err_balance).catch(() => {})
  }
})

bot.action('menu_deposit', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  userStates[ctx.from.id] = 'WAITING_FOR_RECEIPT'
  const msg = getT(await getUserLanguage(ctx.from.id)).deposit_inst
  replyWithSupport(ctx, msg).catch(() => {})
})

bot.action('menu_withdraw', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  userStates[ctx.from.id] = 'WAITING_FOR_WITHDRAW_AMOUNT'
  replyWithSupport(ctx, getT(await getUserLanguage(ctx.from.id)).withdraw_prompt).catch(() => {})
})

bot.action('menu_room', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  const t = getT(await getUserLanguage(ctx.from.id))
  replyWithSupport(ctx, t.room_prompt, {
    reply_markup: { inline_keyboard: [[{ text: t.open_lobby, web_app: { url: FRONTEND_URL } }]] }
  }).catch(() => {})
})

bot.action('menu_help', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  const lang = await getUserLanguage(ctx.from.id)
  ctx.reply((botTranslations[lang] || botTranslations.en).helpMessage).catch(() => {})
})

bot.on('text', async (ctx) => {
  const t = getT(await getUserLanguage(ctx.from.id))
  try {
    const state = userStates[ctx.from.id]
    if (!state) return

    if (state === 'WAITING_FOR_RECEIPT') {
      const parsedFromSMS = parseTelebirrSMS(ctx.message.text)
      if (!parsedFromSMS) {
        return replyWithSupport(ctx, 'Could not find a valid transaction number in that SMS.').catch(() => {})
      }

      const user = await db('users').where({ telegram_id: ctx.from.id }).first()
      if (!user) {
        return replyWithSupport(ctx, t.user_not_found).catch(() => {})
      }

      console.log('[TELEBIRR VERIFY] Extracted Reference:', parsedFromSMS.transactionId)

      let deposit
      try {
        deposit = await creditVerifiedDeposit({
          userId: user.id,
          reference: parsedFromSMS.transactionId,
          amount: parsedFromSMS.amount,
        })
      } catch (err) {
        if (err.code === '23505') {
          return replyWithSupport(ctx, t.deposit_used).catch(() => {})
        }
        if (err.statusCode === 400) {
          return replyWithSupport(ctx, `${t.deposit_verify_fail}${err.message}`).catch(() => {})
        }
        console.error('[BOT] Deposit processing failed:', err.message)
        return replyWithSupport(ctx, t.deposit_verify_fail).catch(() => {})
      }

      replyWithSupport(ctx, `${t.deposit_success}${deposit.amount.toFixed(2)}${t.deposit_success2}`).catch(() => {})
      delete userStates[ctx.from.id]
      return
    }

    if (state === 'WAITING_FOR_WITHDRAW_AMOUNT') {
      const amount = Number(ctx.message.text)
      if (isNaN(amount) || amount < 100) {
        return replyWithSupport(ctx, t.withdraw_invalid).catch(() => {})
      }

      const user = await db('users').where({ telegram_id: ctx.from.id }).first()
      if (!user) return replyWithSupport(ctx, t.user_not_found).catch(() => {})

      if (Number(user.wallet_balance) < amount) {
        return replyWithSupport(ctx, `${t.withdraw_insufficient}${Number(user.wallet_balance).toFixed(2)}.`).catch(() => {})
      }

      await db.transaction(async (trx) => {
        await trx('users')
          .where({ id: user.id })
          .decrement('wallet_balance', amount)

        await trx('payments').insert({
          user_id: user.id,
          amount,
          provider: 'telebirr',
          status: 'pending',
          type: 'withdrawal',
          transaction_reference: `WD-${Date.now()}-${user.id}`
        })
      })

      replyWithSupport(ctx, `${t.withdraw_success}${amount.toFixed(2)}${t.withdraw_pending}`).catch(() => {})
      delete userStates[ctx.from.id]
    }
  } catch (err) {
    console.error('Text Handler Error:', err)
    replyWithSupport(ctx, t.err_general).catch(() => {})
  }
})

bot.on('contact', async (ctx) => {
  const t = getT(await getUserLanguage(ctx.from.id))
  try {
    const contact = ctx.message.contact
    const telegramId = ctx.from.id
    const phoneNumber = contact.phone_number

    const updated = await db('users')
      .where({ telegram_id: telegramId })
      .update({ phone_number: phoneNumber })

    if (updated) {
      await replyWithSupport(ctx,
        `${t.phone_saved}${phoneNumber}${t.phone_saved_suffix}`,
        Markup.removeKeyboard()
      )
    } else {
      await db('users').insert({
        telegram_id: telegramId,
        first_name: ctx.from.first_name || 'Player',
        phone_number: phoneNumber,
        wallet_balance: 0
      })
      await replyWithSupport(ctx,
        `${t.reg_complete}${phoneNumber}`,
        Markup.removeKeyboard()
      )
    }
  } catch (err) {
    console.error('Contact save error:', err)
    await replyWithSupport(ctx, t.contact_save_failed)
  }
})

const handleUpdate = async (req, res) => {
  try {
    await bot.handleUpdate(req.body)
    res.status(200).send('OK')
  } catch (err) {
    console.error('Error handling update:', err)
    res.status(500).send('Error')
  }
}

bot.on('message', (ctx) => {
  console.log('[BOT TRACE] Incoming message:', ctx.message.text || 'non-text message')
})

module.exports = { bot, getMainMenu, handleUpdate }
