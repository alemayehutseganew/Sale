exports.up = async function (knex) {
  if (await knex.schema.hasColumn('users', 'demo_wallet_balance')) {
    await knex.schema.alterTable('users', (t) => { t.dropColumn('demo_wallet_balance') })
  }
  if (await knex.schema.hasColumn('game_rooms', 'is_demo')) {
    await knex.schema.alterTable('game_rooms', (t) => { t.dropColumn('is_demo') })
  }
  if (await knex.schema.hasColumn('financial_ledger', 'is_demo')) {
    await knex.schema.alterTable('financial_ledger', (t) => { t.dropColumn('is_demo') })
  }
}

exports.down = function (knex) {
  return Promise.resolve()
}