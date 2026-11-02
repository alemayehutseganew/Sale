exports.up = async function (knex) {
  // users.telegram_id unique index
  const hasUsersTg = await knex.schema.hasColumn('users', 'telegram_id')
  if (hasUsersTg) {
    await knex.raw('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id)')
  }
  // room_card_selections composite index
  const hasRcs = await knex.schema.hasTable('room_card_selections')
  if (hasRcs) {
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_rcs_room_user_card ON room_card_selections(room_id, user_id, card_id)')
  }
  // financial_ledger indexes
  const hasLedger = await knex.schema.hasTable('financial_ledger')
  if (hasLedger) {
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_ledger_user_id ON financial_ledger(user_id)')
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON financial_ledger(created_at)')
  }
  // payments transaction_reference unique
  const hasPayments = await knex.schema.hasTable('payments')
  if (hasPayments) {
    await knex.raw('CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_transaction_reference ON payments(transaction_reference)')
  }
}

exports.down = async function (knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_users_telegram_id')
  await knex.raw('DROP INDEX IF EXISTS idx_rcs_room_user_card')
  await knex.raw('DROP INDEX IF EXISTS idx_ledger_user_id')
  await knex.raw('DROP INDEX IF EXISTS idx_ledger_created_at')
  await knex.raw('DROP INDEX IF EXISTS idx_payments_transaction_reference')
}
