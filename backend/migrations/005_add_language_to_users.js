exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('users', 'language')
  if (!hasColumn) {
    await knex.schema.alterTable('users', (table) => {
      table.string('language').defaultTo('en')
    })
  }
}

exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('users', 'language')
  if (hasColumn) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('language')
    })
  }
}
