exports.up = async function (knex) {
  const exists = await knex.schema.hasTable('financial_ledger')
  if (exists) return
  await knex.schema.createTable('financial_ledger', (table) => {
    table.increments('id').primary()
    table.integer('user_id').references('id').inTable('users').onDelete('SET NULL')
    table.string('type').notNullable()
    table.decimal('amount', 14, 2).notNullable()
    table.string('reference').nullable()
    table.timestamps(true, true)
  })
}

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('financial_ledger')
}
