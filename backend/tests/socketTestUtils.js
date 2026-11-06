const http = require('http')
const jwt = require('jsonwebtoken')
const { io: createClient } = require('socket.io-client')
const { jwtSecret } = require('./helpers')

async function startSocketHarness() {
  const { setupSocket } = require('../src/sockets/gameHandler')
  const httpServer = http.createServer()
  const io = setupSocket(httpServer)

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(0, '127.0.0.1', resolve)
  })

  const address = httpServer.address()
  const url = `http://127.0.0.1:${address.port}`
  const sockets = new Set()

  return {
    io,
    async connect(user) {
      const socket = createClient(url, {
        auth: {
          token: jwt.sign({ id: user.id, telegram_id: user.telegram_id }, jwtSecret()),
        },
        reconnection: false,
        transports: ['websocket'],
      })
      sockets.add(socket)
      await new Promise((resolve, reject) => {
        socket.once('connect', resolve)
        socket.once('connect_error', reject)
      })
      return socket
    },
    async close() {
      for (const socket of sockets) socket.disconnect()
      await new Promise((resolve) => io.close(resolve))
    },
  }
}

function waitForEvent(socket, eventName, options = {}) {
  const timeout = options.timeout ?? 5000
  const predicate = options.predicate || (() => true)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, listener)
      reject(new Error(`Timed out waiting for socket event "${eventName}"`))
    }, timeout)
    const listener = (payload) => {
      if (!predicate(payload)) return
      clearTimeout(timer)
      socket.off(eventName, listener)
      resolve(payload)
    }
    socket.on(eventName, listener)
  })
}

module.exports = { startSocketHarness, waitForEvent }
