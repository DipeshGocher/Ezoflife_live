import { io } from 'socket.io-client';
import { getSessionToken } from './sessionToken';

const SOCKET_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5001/api').trim().replace(/\/$/, '').replace(/\/api$/, '');

export const createAuthenticatedSocket = () => io(SOCKET_URL, {
    autoConnect: false,
    reconnection: true,
    auth: callback => callback({ token: getSessionToken() })
});

const subscriptions = new WeakMap();
// Count shared room consumers so leaving a page does not remove a layout's
// subscription. Rejoin only mounted rooms after a reconnect or portal change.
export const subscribeSocketRooms = (client, rooms) => {
    let counts = subscriptions.get(client);
    if (!counts) { counts = new Map(); subscriptions.set(client, counts); }
    for (const room of rooms) counts.set(room, (counts.get(room) || 0) + 1);
    const join = () => rooms.forEach(room => client.emit('join_room', room));
    client.on('connect', join);
    const token = getSessionToken();
    if (client.sessionToken !== token) {
        client.disconnect();
        client.sessionToken = token;
    }
    if (token) {
        if (client.connected) join();
        else client.connect();
    }
    return () => {
        client.off('connect', join);
        for (const room of rooms) {
            const count = (counts.get(room) || 1) - 1;
            if (count) counts.set(room, count);
            else { counts.delete(room); if (client.connected) client.emit('leave_room', room); }
        }
        if (!counts.size) client.disconnect();
    };
};

export default createAuthenticatedSocket();
