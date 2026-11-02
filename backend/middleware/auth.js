const jwt = require('jsonwebtoken')
const db = require('../src/db')

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'

module.exports = async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

    if (!token) {
      return res.status(401).json({ error: 'no token provided' })
    }

    const payload = jwt.verify(token, JWT_SECRET)
    const user = await db('users').where({ id: payload.id }).first()

    if (!user) {
      return res.status(401).json({ error: 'user not found' })
    }

    req.user = user
    next()
  } catch (err) {
    return res.status(401).json({ error: 'invalid or expired token' })
  }
}
