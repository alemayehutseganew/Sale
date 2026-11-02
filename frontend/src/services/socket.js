import { io } from 'socket.io-client'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

let socket = null

const SocketService = {
  connect: () => {
    if (!socket) {
      socket = io(API_URL, { transports: ['websocket'] })
    }
    return socket
  },
  get: () => socket,
}

export default SocketService
