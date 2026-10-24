import { Server } from 'socket.io';
import { socketActor, canJoinSocketRoom, canReceiveSocketEvent } from './utils/socketAccess.js';

let io;

export const initSocket = server => {
    io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });
    io.use(async (socket, next) => {
        try {
            socket.data.actor = await socketActor(socket.handshake.auth?.token);
            next();
        } catch { next(new Error('Authentication required. Please sign in again.')); }
    });
    io.on('connection', socket => {
        // Expiry also closes idle sessions, without waiting for another event.
        const expires = socket.data.actor.user.exp;
        let expiryTimer;
        const scheduleExpiry = () => {
            if (!expires) return;
            const remaining = expires * 1000 - Date.now();
            if (remaining <= 0) { socket.disconnect(true); return; }
            expiryTimer = setTimeout(scheduleExpiry, Math.min(remaining, 2147483647));
        };
        scheduleExpiry();
        socket.on('disconnect', () => clearTimeout(expiryTimer));
        let roomQueue = Promise.resolve();
        const queueRoomChange = operation => { roomQueue = roomQueue.then(operation).catch(() => socket.disconnect(true)); };
        socket.on('join_room', (room, acknowledge) => queueRoomChange(async () => {
            const reply = value => { if (typeof acknowledge === 'function') acknowledge(value); };
            try {
                const actor = await socketActor(socket.handshake.auth?.token);
                if (!await canJoinSocketRoom(actor, room)) return reply({ ok: false, message: 'Room access denied' });
                await socket.join(room);
                reply({ ok: true });
            } catch {
                reply({ ok: false, message: 'Authentication required' });
                socket.disconnect(true);
            }
        }));
        socket.on('leave_room', (room, acknowledge) => queueRoomChange(async () => {
            if (typeof room === 'string' && room !== socket.id) await socket.leave(room);
            if (typeof acknowledge === 'function') acknowledge({ ok: true });
        }));
    });
    return io;
};

export const getIO = () => {
    if (!io) throw new Error('Socket.io not initialized!');
    return io;
};

// All application publishers use this interface. Recheck identity and resource
// access immediately before delivery, including users already in a room when
// blocked, deleted, reassigned or moved outside an admin's scope.
const publish = async (room, event, data) => {
    try {
        const sockets = room ? [...getIO().sockets.sockets.values()].filter(socket => socket.rooms.has(room)) : [...getIO().sockets.sockets.values()];
        await Promise.all(sockets.map(socket => {
            // Preserve event order while asynchronous account/resource checks run.
            socket.data.deliveryQueue = (socket.data.deliveryQueue || Promise.resolve()).then(async () => {
                if (!socket.connected || (room && !socket.rooms.has(room))) return;
                let actor;
                try { actor = await socketActor(socket.handshake.auth?.token); }
                catch { socket.disconnect(true); return; }
                try {
                    if (await canReceiveSocketEvent(actor, room, event, data)) socket.emit(event, data);
                    else if (room && !await canJoinSocketRoom(actor, room)) await socket.leave(room);
                } catch (error) { console.error('Socket delivery denied:', error.message); }
            }).catch(error => console.error('Socket delivery failed:', error.message));
            return socket.data.deliveryQueue;
        }));
    } catch (error) { console.error('Socket publish failed:', error.message); }
};
export const getEventPublisher = () => {
    getIO();
    return { to: room => ({ emit: (event, data) => publish(room, event, data) }), emit: (event, data) => publish(null, event, data) };
};
