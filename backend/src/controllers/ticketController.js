import { hasAdminPermission } from '../utils/adminPermissions.js';
import Ticket from '../models/Ticket.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import { httpStatusForError } from '../utils/errorResponse.js';
import { supportActor, supportError, canAccessSupport, requireSupportAccess } from '../utils/supportAccess.js';

const ticketResponse = (req, value) => {
    if (Array.isArray(value)) return value.map(ticket => ticketResponse(req, ticket));
    if (!value || supportActor(req).role === 'Admin') return value;
    const record = value.toObject ? value.toObject() : { ...value };
    for (const key of ['assignmentHistory', 'assignmentVersion', 'assignedTo', 'assignedAt']) delete record[key];
    return record;
};
const fail = (res, error) => res.status(error.status || httpStatusForError(error)).json({ message: error.message });
const customerFields = 'displayName phone email role location addresses';
const orderFields = 'totalAmount status createdAt items pickupLocation orderType vendor';
const emit = async (room, event, data) => {
    // A transport failure must not turn a persisted message into a failed write.
    try {
        const { getEventPublisher } = await import('../socket.js');
        getEventPublisher().to(room).emit(event, data);
    } catch (error) { console.error('Support event delivery failed:', error.message); }
};
const findTicket = async id => {
    const ticket = await Ticket.findById(id);
    if (!ticket) throw supportError('Ticket not found', 404);
    return ticket;
};
const requireOrderAccess = async (req, orderId) => {
    const order = await Order.findById(orderId);
    if (!order) throw supportError('Order not found', 404);
    const actor = supportActor(req);
    if (actor.role === 'Admin') await requireSupportAccess(req, { order });
    else if (![order.customer, order.vendor].some(value => String(value) === String(actor.id))) throw supportError('You cannot access this order.');
    return order;
};

export const createTicket = async (req, res) => {
    try {
        const actor = supportActor(req);
        const { subject, category, description, orderId, attachments } = req.body;
        const customer = actor.role === 'Admin' ? (req.body.customer || actor.id) : actor.id;
        if (!await User.exists({ _id: customer })) throw supportError('Customer not found', 404);
        if (orderId) await requireOrderAccess(req, orderId);
        await requireSupportAccess(req, { customer, order: orderId || null });
        const newTicket = await Ticket.create({ customer, subject, category, description, order: orderId || null,
            messages: [{ sender: actor.id, senderRole: actor.role, message: description, attachments: attachments || [] }] });
        await emit('admins_pool', 'new_ticket', { ticketId: newTicket._id, subject: newTicket.subject });
        res.status(201).json(ticketResponse(req, newTicket));
    } catch (error) { fail(res, error); }
};

export const getCustomerTickets = async (req, res) => {
    try {
        const actor = supportActor(req);
        if (actor.role !== 'Admin' && String(actor.id) !== req.params.customerId) throw supportError('You cannot access these tickets.');
        const tickets = await Ticket.find({ customer: req.params.customerId }).sort({ createdAt: -1 });
        const visible = await Promise.all(tickets.map(ticket => canAccessSupport(req, ticket)));
        res.status(200).json(ticketResponse(req, tickets.filter((ticket, index) => visible[index])));
    } catch (error) { fail(res, error); }
};

export const getTicketByOrder = async (req, res) => {
    try {
        await requireOrderAccess(req, req.params.orderId);
        const actor = supportActor(req);
        const query = { order: req.params.orderId };
        if (actor.role !== 'Admin') query.customer = actor.id;
        const ticket = await Ticket.findOne(query).sort({ createdAt: -1 });
        if (ticket) await requireSupportAccess(req, ticket);
        res.status(200).json(ticketResponse(req, ticket));
    } catch (error) { fail(res, error); }
};

export const getAllTickets = async (req, res) => {
    try {
        const tickets = await Ticket.find().populate('customer', customerFields).populate('order', orderFields).populate('assignedTo', 'displayName').sort({ createdAt: -1 });
        const visible = await Promise.all(tickets.map(ticket => canAccessSupport(req, ticket)));
        res.status(200).json(ticketResponse(req, tickets.filter((ticket, index) => visible[index])));
    } catch (error) { fail(res, error); }
};

export const addMessage = async (req, res) => {
    try {
        const ticket = await findTicket(req.params.ticketId);
        await requireSupportAccess(req, ticket);
        const actor = supportActor(req);
        const attachments = req.body.attachments || [];
        const message = req.body.message || (attachments.length ? 'Attachment' : '');
        ticket.messages.push({ sender: actor.id, senderRole: actor.role, message, attachments });
        ticket.lastMessageAt = new Date();
        if (actor.role === 'Admin' && ticket.status === 'Open') ticket.status = 'In Progress';
        await ticket.save();
        await emit(`ticket_${ticket._id}`, 'new_message', { ticketId: ticket._id, message: ticket.messages.at(-1) });
        res.status(200).json(ticketResponse(req, ticket));
    } catch (error) { fail(res, error); }
};

export const updateTicketStatus = async (req, res) => {
    try {
        const ticket = await findTicket(req.params.ticketId);
        await requireSupportAccess(req, ticket);
        ticket.status = req.body.status;
        await ticket.save();
        await emit(`ticket_${ticket._id}`, 'status_updated', { ticketId: ticket._id, status: ticket.status });
        res.status(200).json(ticketResponse(req, ticket));
    } catch (error) { fail(res, error); }
};

export const updateTicket = async (req, res) => {
    try {
        const ticket = await findTicket(req.params.ticketId);
        await requireSupportAccess(req, ticket);
        if (['Resolved', 'Closed'].includes(ticket.status)) throw supportError('Resolved tickets cannot be edited', 400);
        for (const field of ['subject', 'category', 'description']) if (req.body[field]) ticket[field] = req.body[field];
        await ticket.save();
        res.status(200).json(ticketResponse(req, ticket));
    } catch (error) { fail(res, error); }
};

export const deleteTicket = async (req, res) => {
    try {
        const ticket = await findTicket(req.params.ticketId);
        await requireSupportAccess(req, ticket);
        await ticket.deleteOne();
        res.status(200).json({ message: 'Ticket deleted successfully' });
    } catch (error) { fail(res, error); }
};

export const getTicketDetails = async (req, res) => {
    try {
        const ticket = await findTicket(req.params.ticketId);
        await requireSupportAccess(req, ticket);
        await ticket.populate([{ path: 'customer', select: customerFields }, { path: 'order', select: orderFields }, { path: 'assignedTo', select: 'displayName' }, { path: 'assignmentHistory.actor', select: 'displayName' }, { path: 'assignmentHistory.from', select: 'displayName' }, { path: 'assignmentHistory.to', select: 'displayName' }, { path: 'messages.sender', select: 'displayName profileImage role' }]);
        res.status(200).json(ticketResponse(req, ticket));
    } catch (error) { fail(res, error); }
};


export const getSupportStaff = async (req, res) => {
    try {
        const staff = await User.find({ role: 'Admin', status: 'approved', isBlocked: { $ne: true }, adminAccessType: { $ne: 'Read-Only' } }).select('displayName adminRole adminPermissions').lean();
        const tickets = await Ticket.find({ status: { $in: ['Open', 'In Progress'] } }).select('customer order assignedTo').lean();
        const visible = await Promise.all(tickets.map(ticket => canAccessSupport(req, ticket)));
        const counts = new Map();
        tickets.forEach((ticket, index) => { if (visible[index] && ticket.assignedTo) counts.set(String(ticket.assignedTo), (counts.get(String(ticket.assignedTo)) || 0) + 1); });
        res.json(staff.filter(user => hasAdminPermission(user, 'Support Tickets')).map(user => ({ _id: user._id, displayName: user.displayName || 'Admin', workload: counts.get(String(user._id)) || 0 })));
    } catch (error) { fail(res, error); }
};

export const assignTicket = async (req, res) => {
    try {
        const ticket = await findTicket(req.params.ticketId);
        await requireSupportAccess(req, ticket);
        if (['Closed', 'Resolved'].includes(ticket.status)) throw supportError('Reopen the ticket before assigning it.', 409);
        const { assignedTo, expectedVersion, reason } = req.body;
        if (!Number.isInteger(expectedVersion) || expectedVersion < 0 || typeof reason !== 'string' || !reason.trim() || reason.length > 1000) throw supportError('Provide the current assignment version and a reason (up to 1000 characters).', 400);
        if (assignedTo !== null) {
            const staff = await User.findById(assignedTo);
            if (!staff || staff.role !== 'Admin' || staff.status !== 'approved' || staff.isBlocked || staff.adminAccessType === 'Read-Only' || !hasAdminPermission(staff, 'Support Tickets')) throw supportError('Choose an active admin with write access.', 400);
            if (!await canAccessSupport({ user: { id: String(staff._id), role: 'Admin' }, account: staff }, ticket)) throw supportError('This admin cannot access the ticket service area.', 400);
        }
        const version = expectedVersion === 0 ? { $or: [{ assignmentVersion: 0 }, { assignmentVersion: { $exists: false } }] } : { assignmentVersion: expectedVersion };
        const updated = await Ticket.findOneAndUpdate({ _id: ticket._id, status: { $in: ['Open', 'In Progress'] }, ...version }, {
            $set: { assignedTo, assignedAt: new Date(), status: assignedTo ? 'In Progress' : ticket.status },
            $inc: { assignmentVersion: 1 },
            $push: { assignmentHistory: { from: ticket.assignedTo || null, to: assignedTo, actor: supportActor(req).id, reason: reason.trim(), at: new Date() } }
        }, { new: true, runValidators: true });
        if (!updated) throw supportError('Ticket assignment changed. Reload before assigning again.', 409);
        await emit(`ticket_${ticket._id}`, 'assignment_updated', { ticketId: ticket._id, assignedTo, assignmentVersion: updated.assignmentVersion });
        res.json(updated);
    } catch (error) { fail(res, error); }
};


export const getTicketEvidence = async (req, res) => {
    try {
        const ticket = await findTicket(req.params.ticketId);
        await requireSupportAccess(req, ticket);
        if (!ticket.order) return res.json({ order: null, bookingPhotos: [], itemPhotos: [], custody: [], limitation: 'This ticket has no linked order.' });
        const order = await Order.findById(ticket.order).select('orderId customerPhotos items.name items.photos statusHistory logisticsHandshakes.phase logisticsHandshakes.isVerified logisticsHandshakes.verifiedAt createdAt').lean();
        if (!order) return res.status(404).json({ message: 'Linked order no longer exists.' });
        const validUrl = url => typeof url === 'string' && /^https?:\/\//i.test(url);
        res.json({ order: { _id: order._id, orderNumber: order.orderId },
            bookingPhotos: (order.customerPhotos || []).filter(validUrl),
            itemPhotos: (order.items || []).map(item => ({ name: item.name, photos: (item.photos || []).filter(validUrl) })).filter(item => item.photos.length),
            custody: (order.logisticsHandshakes || []).map(event => ({ phase: event.phase, verified: event.isVerified, verifiedAt: event.verifiedAt || null })),
            timeline: order.statusHistory || [],
            limitation: 'Booking and item photos are submitted evidence; capture time and original custody phase are not verified. Vendor dispatch and delivery photos are unavailable unless recorded separately. Existing media storage URLs retain their current access policy.'
        });
    } catch (error) { fail(res, error); }
};
