exports.up = async function (knex) {
  await knex.schema.alterTable('users', (table) => {
    table.string('referral_code').nullable().unique()
    table.integer('referred_by').nullable().references('id').inTable('users').onDelete('SET NULL')
    table.decimal('referral_balance', 14, 2).notNullable().defaultTo(0)
  })

  const usersWithoutCodes = await knex('users').whereNull('referral_code').select('id')
  for (const user of usersWithoutCodes) {
    const record = await knex('users').where({ id: user.id }).first('username', 'telegram_id')
    let referralCode = record.username ? `@${record.username}` : String(record.telegram_id)
    let suffix = 0
    while (await knex('users')
      .where({ referral_code: referralCode })
      .whereNot({ id: user.id })
      .first('id')) {
      suffix += 1
      referralCode = `${record.username ? `@${record.username}` : record.telegram_id}_${suffix}`
    }
    await knex('users').where({ id: user.id }).update({ referral_code: referralCode })
  }

  await knex.schema.alterTable('users', (table) => {
    table.string('referral_code').notNullable().alter()
  })

  await knex.schema.createTable('referral_earnings', (table) => {
    table.increments('id').primary()
    table.integer('inviter_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.integer('invitee_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.uuid('room_id').notNullable().references('id').inTable('game_rooms').onDelete('CASCADE')
    table.decimal('amount', 14, 2).notNullable()
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
  })
}

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('referral_earnings')
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('referral_balance')
    table.dropColumn('referred_by')
    table.dropColumn('referral_code')
  })
}
