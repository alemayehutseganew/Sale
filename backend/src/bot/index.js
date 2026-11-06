const { Telegraf, Markup } = require('telegraf')
const db = require('../db')
const { parseTelebirrSMS, creditVerifiedDeposit } = require('../services/paymentService')
const { getT } = require('./translations')

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://ked-seven.vercel.app'
const userStates = {}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN)

bot.catch((err, ctx) => {
  console.error(`[BOT] Error for ${ctx.updateType}:`, err.message)
})

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
        [{ text: t.btn_balance, callback_data: 'menu_balance' }, { text: t.btn_deposit, callback_data: 'menu_deposit' }],
        [{ text: t.btn_withdraw, callback_data: 'menu_withdraw' }, { text: t.btn_room, callback_data: 'menu_room' }],
        [{ text: t.btn_help, callback_data: 'menu_help' }]
      ]
    }
  }
}

bot.start((ctx) => {
  ctx.reply(getT('en').choose_lang, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🇬🇧 English', callback_data: 'lang_en' }, { text: '🇪🇹 አማርኛ', callback_data: 'lang_am' }]
      ]
    }
  }).catch((err) => console.error('Start error:', err.message))
})

bot.action('lang_en', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  try {
    await db('users').where({ telegram_id: ctx.from.id }).update({ language: 'en' })
  } catch (err) {
    console.error('Failed to set English language:', err.message)
  }
  ctx.reply(getT('en').lang_set_en, getMainMenu('en')).catch(() => {})
})

bot.action('lang_am', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  try {
    await db('users').where({ telegram_id: ctx.from.id }).update({ language: 'am' })
  } catch (err) {
    console.error('Failed to set Amharic language:', err.message)
  }
  ctx.reply(getT('am').lang_set_am, getMainMenu('am')).catch(() => {})
})

bot.command('menu', async (ctx) => {
  const lang = await getUserLanguage(ctx.from.id)
  ctx.reply(getT(lang).main_menu, getMainMenu(lang)).catch(() => {})
})

bot.command('play', async (ctx) => {
  const t = getT(await getUserLanguage(ctx.from.id))
  ctx.reply(t.play_prompt, {
    reply_markup: { inline_keyboard: [[{ text: t.play_btn, web_app: { url: FRONTEND_URL } }]] }
  }).catch(() => {})
})

bot.command('balance', async (ctx) => {
  const t = getT(await getUserLanguage(ctx.from.id))
  try {
    const user = await db('users').where({ telegram_id: ctx.from.id }).first()
    if (user) ctx.reply(`${t.my_balance}${Number(user.wallet_balance || 0).toFixed(2)}`)
    else ctx.reply(t.user_not_found)
  } catch (err) {
    console.error('[BOT ERROR] Failed to fetch balance for user:', ctx.from.id, err)
    ctx.reply(t.err_balance).catch(() => {})
  }
})

bot.command('help', async (ctx) => {
  ctx.reply(getT(await getUserLanguage(ctx.from.id)).help_text).catch(() => {})
})

bot.command('register', async (ctx) => {
  const t = getT(await getUserLanguage(ctx.from.id))
  return ctx.reply(
    t.register_prompt,
    Markup.keyboard([
      [Markup.button.contactRequest(t.register_btn)]
    ]).resize().oneTime()
  )
})

bot.command('deposit', async (ctx) => {
  userStates[ctx.from.id] = 'WAITING_FOR_RECEIPT'
  ctx.reply(getT(await getUserLanguage(ctx.from.id)).deposit_inst).catch(() => {})
})

bot.command('withdraw', async (ctx) => {
  userStates[ctx.from.id] = 'WAITING_FOR_WITHDRAW_AMOUNT'
  ctx.reply(getT(await getUserLanguage(ctx.from.id)).withdraw_prompt).catch(() => {})
})

bot.action('menu_balance', async (ctx) => {
  const t = getT(await getUserLanguage(ctx.from.id))
  try {
    await ctx.answerCbQuery().catch(() => {})
    const user = await db('users').where({ telegram_id: ctx.from.id }).first()
    if (!user) return ctx.reply(t.user_not_found)
    ctx.reply(`${t.my_balance}${Number(user.wallet_balance || 0).toFixed(2)}`).catch(() => {})
  } catch (err) {
    console.error('Balance Error:', err)
    ctx.reply(t.err_balance).catch(() => {})
  }
})

bot.action('menu_deposit', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  userStates[ctx.from.id] = 'WAITING_FOR_RECEIPT'
  const msg = getT(await getUserLanguage(ctx.from.id)).deposit_inst
  ctx.reply(msg).catch(() => {})
})

bot.action('menu_withdraw', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  userStates[ctx.from.id] = 'WAITING_FOR_WITHDRAW_AMOUNT'
  ctx.reply(getT(await getUserLanguage(ctx.from.id)).withdraw_prompt).catch(() => {})
})

bot.action('menu_room', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  const t = getT(await getUserLanguage(ctx.from.id))
  ctx.reply(t.room_prompt, {
    reply_markup: { inline_keyboard: [[{ text: t.open_lobby, web_app: { url: FRONTEND_URL } }]] }
  }).catch(() => {})
})

bot.action('menu_help', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  ctx.reply(getT(await getUserLanguage(ctx.from.id)).help_text).catch(() => {})
})

bot.on('text', async (ctx) => {
  const t = getT(await getUserLanguage(ctx.from.id))
  try {
    const state = userStates[ctx.from.id]
    if (!state) return

    if (state === 'WAITING_FOR_RECEIPT') {
      const parsedFromSMS = parseTelebirrSMS(ctx.message.text)
      if (!parsedFromSMS) {
        return ctx.reply('Could not find a valid transaction number in that SMS.').catch(() => {})
      }

      const user = await db('users').where({ telegram_id: ctx.from.id }).first()
      if (!user) {
        return ctx.reply(t.user_not_found).catch(() => {})
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
          return ctx.reply(t.deposit_used).catch(() => {})
        }
        if (err.statusCode === 400) {
          return ctx.reply(`${t.deposit_verify_fail}${err.message}`).catch(() => {})
        }
        console.error('[BOT] Deposit processing failed:', err.message)
        return ctx.reply(t.deposit_verify_fail).catch(() => {})
      }

      ctx.reply(`${t.deposit_success}${deposit.amount.toFixed(2)}${t.deposit_success2}`).catch(() => {})
      delete userStates[ctx.from.id]
      return
    }

    if (state === 'WAITING_FOR_WITHDRAW_AMOUNT') {
      const amount = Number(ctx.message.text)
      if (isNaN(amount) || amount < 100) {
        return ctx.reply(t.withdraw_invalid).catch(() => {})
      }

      const user = await db('users').where({ telegram_id: ctx.from.id }).first()
      if (!user) return ctx.reply(t.user_not_found).catch(() => {})

      if (Number(user.wallet_balance) < amount) {
        return ctx.reply(`${t.withdraw_insufficient}${Number(user.wallet_balance).toFixed(2)}.`).catch(() => {})
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

      ctx.reply(`${t.withdraw_success}${amount.toFixed(2)}${t.withdraw_pending}`).catch(() => {})
      delete userStates[ctx.from.id]
    }
  } catch (err) {
    console.error('Text Handler Error:', err)
    ctx.reply(t.err_general).catch(() => {})
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
      await ctx.reply(
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
      await ctx.reply(
        `${t.reg_complete}${phoneNumber}`,
        Markup.removeKeyboard()
      )
    }
  } catch (err) {
    console.error('Contact save error:', err)
    await ctx.reply(t.contact_save_failed)
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
