import { socketAuth } from './socketAuth';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace(/\/api\/?$/, '') || 'http://localhost:5001';

const socket = io(SOCKET_URL, {
    auth: socketAuth,
    autoConnect: true,
    reconnection: true
});

const rooms = new Set();
const originalEmit = socket.emit.bind(socket);
socket.emit = (event, ...args) => {
    if (event === 'join_room') rooms.add(args[0]);
    return originalEmit(event, ...args);
};
socket.on('connect', () => { for (const room of rooms) originalEmit('join_room', room); });

// Login may happen after this singleton is first imported; reconnect using
// the current portal's token rather than retaining a previous account session.
let previousToken = '';
setInterval(() => socketAuth(({ token }) => {
    if (token !== previousToken) {
        previousToken = token;
        rooms.clear();
        socket.disconnect();
        if (token) socket.connect();
    }
}), 1000);
export default socket;
