import { io } from 'socket.io-client'
import { SOCKET_BASE_URL } from './api'

let socket = null

const SocketService = {
  connect: (token = localStorage.getItem('token')) => {
    if (!socket) {
      socket = io(SOCKET_BASE_URL, { auth: { token } })
    } else if (socket.auth?.token !== token) {
      socket.auth = { token }
      socket.disconnect()
      socket.connect()
    }
    return socket
  },
  get: () => socket,
}

export default SocketService
