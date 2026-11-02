exports.up = async function (knex) {
  await knex.schema.createTable('room_card_selections', (table) => {
    table.increments('id').primary();
    table.uuid('room_id').notNullable().references('id').inTable('rooms').onDelete('CASCADE');
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.integer('card_number').notNullable();
    table.jsonb('matrix').notNullable();
    table.jsonb('marked_numbers').defaultTo(knex.raw("'[]'::jsonb"));
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('room_card_selections');
};
