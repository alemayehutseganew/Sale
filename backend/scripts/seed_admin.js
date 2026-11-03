const db = require('../src/db')
const bcrypt = require('bcryptjs')

async function seedAdmin() {
  const username = 'kedir'
  const password = process.env.ADMIN_SEED_PASSWORD

  try {
    if (!password || Buffer.byteLength(password, 'utf8') < 16 || Buffer.byteLength(password, 'utf8') > 72) {
      throw new Error('Set ADMIN_SEED_PASSWORD to a strong password between 16 and 72 bytes.')
    }

    const passwordHash = bcrypt.hashSync(password, 10)
    const existing = await db('admins').where({ username }).first()
    if (existing) {
      await db('admins').where({ username }).update({ password_hash: passwordHash })
    } else {
      await db('admins').insert({ username, password_hash: passwordHash })
    }

    console.log(`✅ Admin '${username}' created/updated successfully.`)
  } finally {
    await db.destroy()
  }
}

seedAdmin().catch((err) => {
  console.error('❌ Admin seed error:', err.message)
  process.exitCode = 1
})
