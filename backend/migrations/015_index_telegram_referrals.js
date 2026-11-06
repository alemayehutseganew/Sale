exports.up = async function (knex) {
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)')
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users(LOWER(username))')
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id)')

  const users = await knex('users').select('id', 'username', 'telegram_id')
  for (const user of users) {
    let referralCode = user.username ? `@${user.username}` : String(user.telegram_id)
    let suffix = 0
    while (await knex('users')
      .where({ referral_code: referralCode })
      .whereNot({ id: user.id })
      .first('id')) {
      suffix += 1
      referralCode = `${user.username ? `@${user.username}` : user.telegram_id}_${suffix}`
    }

    await knex('users')
      .where({ id: user.id })
      .update({ referral_code: referralCode })
  }
}

exports.down = async function (knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_users_telegram_id')
  await knex.raw('DROP INDEX IF EXISTS idx_users_username_lower')
  await knex.raw('DROP INDEX IF EXISTS idx_users_username')
}
