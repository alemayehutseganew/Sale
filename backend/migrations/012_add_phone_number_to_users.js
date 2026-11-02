exports.up = async function (knex) {
  if (!(await knex.schema.hasColumn('users', 'phone_number'))) {
    await knex.schema.alterTable('users', (table) => {
      table.string('phone_number').nullable()
    })
  }
}

exports.down = async function (knex) {
  if (await knex.schema.hasColumn('users', 'phone_number')) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('phone_number')
    })
  }
}
