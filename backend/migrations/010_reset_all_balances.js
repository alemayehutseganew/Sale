exports.up = function (knex) {
  return knex('users').update({
    wallet_balance: 0
  })
}

exports.down = function (knex) {
  return Promise.resolve()
}