
require('dotenv').config()

const express = require('express')
const cors = require('cors')
const http = require('http')
const { Server } = require('socket.io')
const authRoutes = require('./src/routes/auth')
const roomsRoutes = require('./src/routes/rooms')
const paymentsRoutes = require('./src/routes/payments')
const authMiddleware = require('./middleware/auth')
const { initGameHandler } = require('./src/sockets/gameHandler')

const app = express()
app.use(cors())
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/rooms', roomsRoutes)
app.use('/api/payments', paymentsRoutes)

// Example protected route to verify middleware
app.get('/api/me', authMiddleware, (req, res) => {
  res.json(req.user)
})

const server = http.createServer(app)
const io = new Server(server, { cors: { origin: '*' } })
initGameHandler(io)

const PORT = process.env.PORT || 3000

function start(port = PORT) {
  return server.listen(port, () => {
    console.log(`Server running on port ${port}`)
  })
}

if (require.main === module) {
  start()
}

module.exports = { app, server, io, start }



