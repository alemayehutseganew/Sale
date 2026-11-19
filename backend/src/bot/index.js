const { Telegraf, Markup } = require('telegraf')
const db = require('../db')
const { parseTelebirrSMS, creditVerifiedDeposit } = require('../services/paymentService')
const { getT } = require('./translations')

const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://sale-green.vercel.app').replace(/\/+$/, '')
const SUPPORT_SUFFIX = '\n\n💬 <i>For more support: @saleg122</i>'
const botTranslations = {
  en: {
    selectLanguage: '🌐 <b>Please select your language:</b>\n\n<i>Choose your preferred language to continue.</i>',
    mainMenu: '🏠 <b>Main Menu</b>\n\n<i>Select an option below to continue playing.</i>',
    launchPrompt: '🎮 <b>Ready to play?</b>\n\nSelect a stake amount below to enter the game.',
    balance: '💰 <b>Your Current Balance</b>\n\n<code>ETB {{amount}}</code>',
    userNotFound: '⚠️ <b>User Not Found</b>\n\nPlease open the Mini App first to register.',
    balanceFailed: '⚠️ <b>Balance Unavailable</b>\n\nPlease try again in a moment.',
    helpMessage: '<b>📖 Game Rules &amp; Help</b>\n\n1️⃣ Open the Mini App.\n2️⃣ Select a stake.\n3️⃣ Choose a card (1-400).\n4️⃣ Wait for the countdown.\n5️⃣ Tap numbers when called.\n6️⃣ Complete a line and press <b>BINGO!</b>\n\n<i>Good luck!</i>',
    depositInstructions: '💳 <b>Deposit Funds</b>\n\n👤 Name: <b>Saleamlak misganaw dagnaw</b>\n📱 Telebirr: <code>0991179163</code>\n\n1️⃣ Open your Telebirr app.\n2️⃣ Send money to the number above.\n3️⃣ Copy the SMS you receive.\n\n👇 <b>Paste the full SMS here:</b>',
    withdrawPrompt: '💸 <b>Withdraw Funds</b>\n\nEnter the amount you want to withdraw (Minimum 100 ETB):\n\n<i>Your request will be processed by an admin.</i>',
    withdrawalPending: '⏳ <b>Withdrawal Requested</b>\n\nYour request for <code>ETB {{amount}}</code> is pending admin approval.',
    depositSubmitted: '✅ <b>Receipt Verified!</b>\n\nYour deposit of <code>ETB {{amount}}</code> has been submitted for admin approval.',
    inviteEarn: '🎉 <b>Invite &amp; Earn 5%</b>\n\nShare your unique link with friends. When they win a game, you get 5% of their prize!\n\n🔗 <b>Your Link:</b>\n<code>{{link}}</code>\n\n💰 <i>Withdraw your earnings once you reach 1,000 ETB!</i>',
    inviteMissingUser: '⚠️ <b>User Not Found</b>\n\nPlease open the Mini App first to register.',
    inviteFailed: '⚠️ <b>Invite Link Unavailable</b>\n\nPlease try again later.',
    alreadyRegistered: '✅ <b>You are already registered.</b>',
    languageSet: '✅ <b>Language updated.</b>',
  },
  am: {
    selectLanguage: '🌐 <b>እባክዎ ቋንቋዎን ይምረጡ:</b>\n\n<i>ለመቀጠል የሚመርጡትን ቋንቋ ይምረጡ።</i>',
    mainMenu: '🏠 <b>ዋና ማውጫ</b>\n\n<i>መጫወትዎን ለመቀጠል ከታች አማራጭ ይምረጡ።</i>',
    launchPrompt: '🎮 <b>ለመጫወት ዝግጁ ነዎት?</b>\n\nወደ ጨዋታው ለመግባት ከታች የውርርድ መጠን ይምረጡ።',
    balance: '💰 <b>የአሁኑ ቀሪ ሂሳብዎ</b>\n\n<code>{{amount}} ብር</code>',
    userNotFound: '⚠️ <b>ተጠቃሚው አልተገኘም</b>\n\nለመመዝገብ እባክዎ መጀመሪያ ሚኒ አፑን ይክፈቱ።',
    balanceFailed: '⚠️ <b>ቀሪ ሂሳቡን ማሳየት አልተቻለም</b>\n\nእባክዎ ከጥቂት ጊዜ በኋላ እንደገና ይሞክሩ።',
    helpMessage: '<b>📖 የጨዋታ ህጎች እና እርዳታ</b>\n\n1️⃣ ሚኒ አፑን ይክፈቱ።\n2️⃣ ውርርድ ይምረጡ።\n3️⃣ ካርድ (1-400) ይምረጡ።\n4️⃣ ቆጠራውን ይጠብቁ።\n5️⃣ ቁጥሮች ሲጠሩ ይምረጡ።\n6️⃣ መስመር ሲሞሉ <b>BINGO!</b> ይጫኑ።\n\n<i>መልካም ዕድል!</i>',
    depositInstructions: '💳 <b>ገንዘብ ማስገባት</b>\n\n👤 ስም: <b>Saleamlak misganaw dagnaw</b>\n📱 ቴሌብር: <code>0991179163</code>\n\n1️⃣ የቴሌብር አፕዎን ይክፈቱ።\n2️⃣ ከላይ ወዳለው ቁጥር ገንዘብ ይላኩ።\n3️⃣ የደረሰዎትን ኤስኤምኤስ ይቅዱ።\n\n👇 <b>ሙሉውን ኤስኤምኤስ እዚህ ይለጥፉ:</b>',
    withdrawPrompt: '💸 <b>ገንዘብ ማውጣት</b>\n\nማውጣት የሚፈልጉትን መጠን ያስገቡ (ቢያንስ 100 ብር):\n\n<i>ጥያቄዎ በአስተዳዳሪ ይስተናገዳል።</i>',
    withdrawalPending: '⏳ <b>የማውጣት ጥያቄ ተልኳል</b>\n\nየ<code>{{amount}} ብር</code> ጥያቄዎ የአስተዳዳሪ ፈቃድ እየጠበቀ ነው።',
    depositSubmitted: '✅ <b>ደረሰኙ ተረጋግጧል!</b>\n\nየ<code>{{amount}} ብር</code> ተቀማጭዎ ለአስተዳዳሪ ፈቃድ ተልኳል።',
    inviteEarn: '🎉 <b>ይጋብዙ እና 5% ያግኙ</b>\n\nልዩ የግብዣ አገናኝዎን ለጓደኞችዎ ያጋሩ። እነሱ ሲያሸንፉ ከሽልማታቸው 5% ያገኛሉ!\n\n🔗 <b>የእርስዎ አገናኝ:</b>\n<code>{{link}}</code>\n\n💰 <i>ገቢዎ 1,000 ብር ሲደርስ ማውጣት ይችላሉ!</i>',
    inviteMissingUser: '⚠️ <b>ተጠቃሚው አልተገኘም</b>\n\nለመመዝገብ እባክዎ መጀመሪያ ሚኒ አፑን ይክፈቱ።',
    inviteFailed: '⚠️ <b>የግብዣ አገናኙን ማዘጋጀት አልተቻለም</b>\n\nእባክዎ ቆይተው እንደገና ይሞክሩ።',
    alreadyRegistered: '✅ <b>አስቀድመው ተመዝግበዋል።</b>',
    languageSet: '✅ <b>ቋንቋው ተቀይሯል።</b>',
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
  const formattedText = /<\/?(?:b|i|code)\b/i.test(text)
    ? text
    : `<b>${escapeHtml(text)}</b>`
  const message = `${formattedText}${SUPPORT_SUFFIX}`
  return ctx.reply(message, { ...options, parse_mode: 'HTML' })
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  })[character])
}

function botText(lang, key, values = {}) {
  const translations = botTranslations[lang] || botTranslations.en
  return translations[key].replace(/\{\{(\w+)\}\}/g, (_, name) => escapeHtml(values[name] ?? ''))
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
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        ...getStakeButtons(FRONTEND_URL),
        [{ text: t.btn_balance, callback_data: 'menu_balance' }, { text: t.btn_deposit, callback_data: 'menu_deposit' }],
        [{ text: t.btn_withdraw, callback_data: 'menu_withdraw' }, { text: t.btn_help, callback_data: 'menu_help' }],
        [{ text: t.btn_room, callback_data: 'menu_room' }],
        [{ text: '👥 Invite Friends', callback_data: 'show_invite' }],
      ]
    }
  }
}

function getStakeUrl(stake, referral, frontendUrl = FRONTEND_URL) {
  const url = new URL(`${frontendUrl.replace(/\/+$/, '')}/select-card`)
  url.searchParams.set('stake', String(stake))
  if (referral) url.searchParams.set('ref', referral)
  return url.toString()
}

function getStakeButtons(frontendUrl = FRONTEND_URL, referral, useWebApp = true) {
  const button = (stake) => {
    const link = getStakeUrl(stake, referral, frontendUrl)
    return useWebApp
      ? { text: `🎮 Play ${stake} ETB`, web_app: { url: link } }
      : { text: `🎮 Play ${stake} ETB`, url: link }
  }
  return [
    [button(10), button(50)],
    [button(100)],
  ]
}

function getStakeKeyboard(referral) {
  return getStakeButtons(FRONTEND_URL, referral)
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
    ]).catch((err) => console.error('[BOT] Command registration failed:', err))
  }
  return commandRegistrationPromise
}

registerBotCommands().catch((err) => {
  console.error('[BOT] Command menu initialization failed:', err)
})

async function sendInvite(ctx) {
  const lang = await getUserLanguage(ctx.from.id)
  try {
    const user = await db('users').where({ telegram_id: ctx.from.id }).first()
    if (!user) return replyWithSupport(ctx, botText(lang, 'inviteMissingUser'))

    const refId = user.username || user.telegram_id
    const botUsername = ctx.botInfo?.username || await getBotUsername()
    const refLink = `https://t.me/${botUsername}?start=REF_${encodeURIComponent(String(refId))}`
    const shareText = 'Join me on GoBingo and win big! 🎰'
    const message = botText(lang, 'inviteEarn', { link: refLink })
    const isPrivate = ctx.chat?.type === 'private'

    return replyWithSupport(ctx, message, {
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [{
            text: '📢 Share to Group/Channel',
            url: `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent(shareText)}`,
          }],
          ...getStakeButtons(FRONTEND_URL, undefined, isPrivate),
        ],
      },
    })
  } catch (err) {
    console.error('Invite command error:', err)
    return replyWithSupport(ctx, botText(lang, 'inviteFailed'))
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
  console.log(`[BOT TRACE] /start received from Sale user: ${ctx.from.id}`)
  try {
    try {
      await registerBotCommands()
    } catch {
      // Keep /start available even if Telegram command-menu registration fails.
    }

    const payload = ctx.startPayload
    if (payload) {
      const referral = payload.startsWith('REF_') ? payload.slice(4) : payload
      const referralRef = /^\d+$/.test(referral) ? referral : `@${referral}`

      return replyWithSupport(ctx, '🎰 <b>Welcome to GoBingo!</b>', {
        reply_markup: {
          inline_keyboard: [
            ...getStakeButtons(FRONTEND_URL, referralRef),
            [{ text: '👥 Invite Friends & Earn 5%', callback_data: 'show_invite' }],
          ],
        },
      }).catch((err) => console.error('Start error:', err.message))
    }

    const lang = await getUserLanguage(ctx.from.id)
    return replyWithSupport(ctx, botText(lang, 'selectLanguage'), {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🇬🇧 English', callback_data: 'lang_en' }, { text: '🇪🇹 አማርኛ', callback_data: 'lang_am' }],
          ...getStakeButtons(FRONTEND_URL),
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
  replyWithSupport(ctx, botText('en', 'languageSet'), getMainMenu('en')).catch(() => {})
})

bot.action('lang_am', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  try {
    await db('users').where({ telegram_id: ctx.from.id }).update({ language: 'am' })
  } catch (err) {
    console.error('Failed to set Amharic language:', err.message)
  }
  replyWithSupport(ctx, botText('am', 'languageSet'), getMainMenu('am')).catch(() => {})
})

bot.command('menu', async (ctx) => {
  const lang = await getUserLanguage(ctx.from.id)
  replyWithSupport(ctx, botText(lang, 'mainMenu'), getMainMenu(lang)).catch(() => {})
})

bot.command('play', async (ctx) => {
  const lang = await getUserLanguage(ctx.from.id)
  replyWithSupport(ctx, botText(lang, 'launchPrompt'), {
    reply_markup: {
      inline_keyboard: getStakeKeyboard()
    }
  }).catch(() => {})
})

bot.command('balance', async (ctx) => {
  const lang = await getUserLanguage(ctx.from.id)
  try {
    const user = await db('users').where({ telegram_id: ctx.from.id }).first()
    if (user) replyWithSupport(ctx, botText(lang, 'balance', { amount: Number(user.wallet_balance || 0).toFixed(2) }))
    else replyWithSupport(ctx, botText(lang, 'userNotFound'))
  } catch (err) {
    console.error('[BOT ERROR] Failed to fetch balance for user:', ctx.from.id, err)
    replyWithSupport(ctx, botText(lang, 'balanceFailed')).catch(() => {})
  }
})

bot.command('help', async (ctx) => {
  const lang = await getUserLanguage(ctx.from.id)
  replyWithSupport(ctx, botText(lang, 'helpMessage')).catch(() => {})
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
  const lang = await getUserLanguage(ctx.from.id)
  replyWithSupport(ctx, botText(lang, 'depositInstructions')).catch(() => {})
})

bot.command('withdraw', async (ctx) => {
  userStates[ctx.from.id] = 'WAITING_FOR_WITHDRAW_AMOUNT'
  const lang = await getUserLanguage(ctx.from.id)
  replyWithSupport(ctx, botText(lang, 'withdrawPrompt')).catch(() => {})
})

bot.action('menu_balance', async (ctx) => {
  const lang = await getUserLanguage(ctx.from.id)
  try {
    await ctx.answerCbQuery().catch(() => {})
    const user = await db('users').where({ telegram_id: ctx.from.id }).first()
    if (!user) return replyWithSupport(ctx, botText(lang, 'userNotFound'))
    replyWithSupport(ctx, botText(lang, 'balance', { amount: Number(user.wallet_balance || 0).toFixed(2) })).catch(() => {})
  } catch (err) {
    console.error('Balance Error:', err)
    replyWithSupport(ctx, botText(lang, 'balanceFailed')).catch(() => {})
  }
})

bot.action('menu_deposit', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  userStates[ctx.from.id] = 'WAITING_FOR_RECEIPT'
  const msg = botText(await getUserLanguage(ctx.from.id), 'depositInstructions')
  replyWithSupport(ctx, msg).catch(() => {})
})

bot.action('menu_withdraw', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  userStates[ctx.from.id] = 'WAITING_FOR_WITHDRAW_AMOUNT'
  const lang = await getUserLanguage(ctx.from.id)
  replyWithSupport(ctx, botText(lang, 'withdrawPrompt')).catch(() => {})
})

bot.action('menu_room', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  const t = getT(await getUserLanguage(ctx.from.id))
  replyWithSupport(ctx, t.room_prompt, {
    reply_markup: {
      inline_keyboard: [
        ...getStakeKeyboard(),
      ]
    }
  }).catch(() => {})
})

bot.action('menu_help', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  const lang = await getUserLanguage(ctx.from.id)
  replyWithSupport(ctx, botText(lang, 'helpMessage')).catch(() => {})
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

      replyWithSupport(ctx, botText(lang, 'depositSubmitted', {
        amount: deposit.amount.toFixed(2),
      })).catch(() => {})
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

      replyWithSupport(ctx, botText(lang, 'withdrawalPending', {
        amount: amount.toFixed(2),
      })).catch(() => {})
      delete userStates[ctx.from.id]
    }
  } catch (err) {
    console.error('Text Handler Error:', err)
    replyWithSupport(ctx, t.err_general).catch(() => {})
  }
})

bot.on('contact', async (ctx) => {
  const lang = await getUserLanguage(ctx.from.id)
  const t = getT(lang)
  try {
    const contact = ctx.message.contact
    const telegramId = ctx.from.id
    const phoneNumber = contact.phone_number

    const existingUser = await db('users').where({ telegram_id: telegramId }).first()
    if (existingUser && existingUser.phone_number) {
      await ctx.reply(
        (botTranslations[lang] || botTranslations.en).alreadyRegistered,
        { ...Markup.removeKeyboard(), parse_mode: 'HTML' }
      )
      return
    }

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

module.exports = { bot, getMainMenu, handleUpdate }
