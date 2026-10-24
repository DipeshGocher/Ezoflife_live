import { hasAdminPermission } from './adminPermissions.js';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Ticket from '../models/Ticket.js';
import Order from '../models/Order.js';
import { loadSessionAccount } from './sessionAccount.js';
import { canAccessSupport } from './supportAccess.js';

export const socketActor = async token => {
    const decoded = jwt.verify(token || '', process.env.JWT_SECRET || 'ezoflife_secret_key_2026');
    const account = await loadSessionAccount(decoded);
    if (!account) throw new Error('Account is not active');
    return { user: { ...decoded, role: account.role }, account };
};

export const canJoinSocketRoom = async (actor, room) => {
    if (typeof room !== 'string' || room.length > 100) return false;
    if (room === 'admins_pool') return actor.user.role === 'Admin';
    if (room === 'vendors_pool') return actor.user.role === 'Vendor';
    const match = /^(user|ticket|order)_([a-f\d]{24})$/i.exec(room);
    if (!match || !mongoose.isValidObjectId(match[2])) return false;
    const [, kind, id] = match;
    if (kind === 'user') return id === String(actor.user.id);
    if (kind === 'ticket') {
        if (actor.user.role === 'Admin' && !hasAdminPermission(actor.account, 'Support Tickets')) return false;
        const ticket = await Ticket.findById(id);
        return !!ticket && canAccessSupport(actor, ticket);
    }
    const order = await Order.findById(id);
    if (!order) return false;
    if (actor.user.role === 'Admin') return hasAdminPermission(actor.account, 'Orders') && canAccessSupport(actor, { order });
    return [order.customer, order.vendor, order.rider].some(owner => owner && String(owner) === String(actor.user.id));
};

export const canReceiveSocketEvent = async (actor, room, event, data) => {
    if (room && !await canJoinSocketRoom(actor, room)) return false;
    // A party may be reassigned after joining their own notification room.
    if (event === 'order_status_update') {
        const id = data?._id || data?.orderId;
        return !!id && canJoinSocketRoom(actor, `order_${id}`);
    }
    if (event === 'new_ticket') return actor.user.role === 'Admin' && canJoinSocketRoom(actor, `ticket_${data?.ticketId}`);
    if (event === 'new_notification') {
        const sameRecipient = String(data?.recipient) === String(actor.user.id);
        // Legacy labor notices address the admin role using a fixed recipient.
        const adminNotice = data?.role === 'admin' && actor.user.role === 'Admin' && !actor.account.geofenceRestrictions?.length;
        return sameRecipient || adminNotice;
    }
    if (event === 'pool_update') return ['Vendor', 'Rider'].includes(actor.user.role);
    return !!room; // Unknown global broadcasts fail closed.
};
