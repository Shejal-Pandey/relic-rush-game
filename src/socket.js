import { io } from 'socket.io-client'

/**
 * Create a socket.io connection to the Flask-SocketIO backend.
 * Uses the current hostname so it works from both desktop and mobile.
 */
export function createSocket() {
    const socketUrl = `http://${window.location.hostname}:5002`
    const socket = io(socketUrl, {
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
    })

    socket.on('connect', () => {
        console.log('[Socket] Connected:', socket.id)
    })

    socket.on('disconnect', () => {
        console.log('[Socket] Disconnected')
    })

    socket.on('connect_error', (err) => {
        console.warn('[Socket] Connection error:', err.message)
    })

    return socket
}
