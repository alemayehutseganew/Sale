exports.up = async function (knex) {
  await knex.schema.alterTable('room_card_selections', (table) => {
    table.renameColumn('card_number', 'card_id')
    table.renameColumn('matrix', 'card')
    table.string('status').defaultTo('reserved')
  })
}

exports.down = async function (knex) {
  await knex.schema.alterTable('room_card_selections', (table) => {
    table.dropColumn('status')
    table.renameColumn('card', 'matrix')
    table.renameColumn('card_id', 'card_number')
  })
}
