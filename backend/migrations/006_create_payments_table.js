exports.up = async function (knex) {
  const exists = await knex.schema.hasTable('payments')
  if (exists) return
  await knex.schema.createTable('payments', (table) => {
    table.increments('id').primary()
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.string('type').notNullable() // 'deposit' or 'withdrawal'
    table.string('provider').notNullable() // 'telebirr' or 'cbebirr'
    table.decimal('amount', 14, 2).notNullable()
    table.string('status').defaultTo('pending') // 'pending', 'completed', 'failed'
    table.string('transaction_reference').notNullable().unique()
    table.jsonb('provider_response').nullable()
    table.timestamps(true, true)
  })
}

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('payments')
}
