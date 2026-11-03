import { io } from 'socket.io-client'
import { API_BASE } from './api'

let socket = null

const SocketService = {
  connect: () => {
    if (!socket) {
      socket = io(API_BASE, { transports: ['websocket'] })
    }
    return socket
  },
  get: () => socket,
}

export default SocketService
