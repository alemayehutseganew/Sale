exports.up = async function (knex) {
  const exists = await knex.schema.hasTable('admins')
  if (exists) return
  await knex.schema.createTable('admins', (table) => {
    table.increments('id').primary()
    table.string('username').notNullable().unique()
    table.string('password_hash').notNullable()
    table.timestamps(true, true)
  })
}

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('admins')
}
