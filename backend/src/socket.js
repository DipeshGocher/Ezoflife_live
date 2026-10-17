import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import Order from './models/Order.js';
import Ticket from './models/Ticket.js';
import User from './models/User.js';
let io;
export const initSocket = server => {
    io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });
    io.use(async (socket, next) => {
        try {
            const actor = jwt.verify(socket.handshake.auth?.token || '', process.env.JWT_SECRET || 'ezoflife_secret_key_2026');
            const user = await User.findById(actor.id).select('role status');
            if (!user || user.role !== actor.role) throw new Error('Invalid session');
            socket.data.actor = actor;
            next();
        } catch { next(new Error('Authentication required')); }
    });
    io.on('connection', socket => {
        socket.join(`user_${socket.data.actor.id}`);
        if (socket.data.actor.role === 'Admin') socket.join('admins_pool');
        if (socket.data.actor.role === 'Vendor') socket.join('vendors_pool');
        socket.on('join_room', async (room, acknowledge = () => {}) => {
            try {
                const actor = socket.data.actor;
                let allowed = room === `user_${actor.id}`;
                if (room === 'admins_pool') allowed = actor.role === 'Admin';
                if (room === 'vendors_pool') allowed = actor.role === 'Vendor';
                if (typeof room === 'string' && room.startsWith('order_')) {
                    const order = await Order.findById(room.slice(6)).select('customer vendor');
                    // Admins must not receive customer/vendor-only invoice events.
                    allowed = Boolean(order && [order.customer, order.vendor].some(id => String(id) === String(actor.id)));
                }
                if (typeof room === 'string' && room.startsWith('ticket_')) {
                    const ticket = await Ticket.findById(room.slice(7)).select('customer vendor supplier');
                    allowed = Boolean(ticket && (actor.role === 'Admin' || [ticket.customer, ticket.vendor, ticket.supplier].some(id => String(id) === String(actor.id))));
                }
                if (!allowed) return acknowledge({ ok: false, error: 'Room access denied' });
                await socket.join(room);
                acknowledge({ ok: true });
            } catch { acknowledge({ ok: false, error: 'Room access denied' }); }
        });
    });
    return io;
};
export const getIO = () => {
    if (!io) throw new Error('Socket.io not initialized!');
    return io;
};
