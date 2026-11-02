exports.up = async function (knex) {
  const hasRooms = await knex.schema.hasTable('rooms')
  const hasGameRooms = await knex.schema.hasTable('game_rooms')
  if (hasRooms && !hasGameRooms) {
    await knex.raw('ALTER TABLE rooms RENAME TO game_rooms')
  }
}

exports.down = async function (knex) {
  const hasGameRooms = await knex.schema.hasTable('game_rooms')
  const hasRooms = await knex.schema.hasTable('rooms')
  if (hasGameRooms && !hasRooms) {
    await knex.raw('ALTER TABLE game_rooms RENAME TO rooms')
  }
}

