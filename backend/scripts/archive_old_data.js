require('dotenv').config()
const db = require('../src/db');

async function archiveOldData() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const hasLedger = await db.schema.hasTable('financial_ledger')
  if (!hasLedger) return { moved: 0 }
  const hasArchive = await db.schema.hasTable('financial_ledger_archive')
  if (!hasArchive) {
    await db.schema.createTable('financial_ledger_archive', (table) => {
      table.increments('id').primary()
      table.integer('user_id')
      table.string('type')
      table.decimal('amount', 14, 2)
      table.string('reference')
      table.timestamp('created_at')
      table.timestamp('archived_at').defaultTo(db.fn.now())
    })
  }
  const rows = await db('financial_ledger').where('created_at', '<', cutoff)
  if (rows.length === 0) return { moved: 0 }
  const archiveRows = rows.map((r) => ({
    user_id: r.user_id,
    type: r.type,
    amount: r.amount,
    reference: r.reference,
    created_at: r.created_at,
  }))
  await db('financial_ledger_archive').insert(archiveRows)
  await db('financial_ledger').whereIn('id', rows.map((r) => r.id)).del()
  return { moved: rows.length }
}

if (require.main === module) {
  archiveOldData()
    .then((r) => {
      console.log('Archived:', r)
      process.exit(0)
    })
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}

module.exports = { archiveOldData }
