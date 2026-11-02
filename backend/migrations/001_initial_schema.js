exports.up = async function (knex) {
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.bigInteger('telegram_id').unique().notNullable();
    table.string('username').nullable();
    table.string('first_name').nullable();
    table.decimal('wallet_balance', 14, 2).defaultTo(0);
    table.timestamps(true, true);
  });

  await knex.schema.createTable('rooms', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.integer('stake_amount').notNullable();
    table.string('status').defaultTo('WAITING');
    table.jsonb('called_numbers').defaultTo(knex.raw("'[]'::jsonb"));
    table.string('winning_pattern').nullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('room_participants', (table) => {
    table.increments('id').primary();
    table.uuid('room_id').notNullable().references('id').inTable('rooms').onDelete('CASCADE');
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.boolean('is_winner').defaultTo(false);
    table.timestamp('joined_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('room_cards', (table) => {
    table.increments('id').primary();
    table.uuid('room_id').notNullable().references('id').inTable('rooms').onDelete('CASCADE');
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.integer('card_number').notNullable();
    table.jsonb('matrix').notNullable();
    table.jsonb('marked_numbers').defaultTo(knex.raw("'[]'::jsonb"));
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('room_cards');
  await knex.schema.dropTableIfExists('room_participants');
  await knex.schema.dropTableIfExists('rooms');
  await knex.schema.dropTableIfExists('users');
};
