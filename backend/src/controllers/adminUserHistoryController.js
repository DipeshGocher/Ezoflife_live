import Order from '../models/Order.js';
import Ticket from '../models/Ticket.js';
import { canAccessSupport } from '../utils/supportAccess.js';

export const getAdminUserHistory = async (req, res) => {
    try {
        const { id } = req.params;
        const { section = 'orders', page = '1', limit = '20' } = req.query;
        if (!['orders', 'tickets'].includes(section) || !/^\d+$/.test(String(page)) || Number(page) < 1 || !/^\d+$/.test(String(limit)) || Number(limit) < 1 || Number(limit) > 100 || (Number(page) - 1) * Number(limit) > 1000000) return res.status(400).json({ message: 'Invalid history filters.' });
        const target = req.profileTarget;
        let records;
        if (section === 'orders') {
            records = await Order.find({ $or: [{ customer: id }, { vendor: id }, { rider: id }] })
                .select('_id orderId customer vendor rider status totalAmount paymentStatus createdAt pickupLocation orderType')
                .sort({ createdAt: -1, _id: -1 }).lean();
        } else {
            records = await Ticket.find({ customer: id })
                .select('_id subject category status priority order customer createdAt lastMessageAt').sort({ createdAt: -1, _id: -1 }).lean();
        }
        // Apply resource scope before totals and pagination; an in-zone account
        // can still have an order or conversation outside this admin's zones.
        const permitted = await Promise.all(records.map(record => canAccessSupport(req, section === 'orders' ? { order: record } : record)));
        const visible = records.filter((record, index) => permitted[index]);
        const offset = (Number(page) - 1) * Number(limit);
        const data = visible.slice(offset, offset + Number(limit)).map(record => {
            const { pickupLocation, customer, vendor, rider, orderType, ...summary } = record;
            return summary;
        });
        res.json({ user: { _id: target._id, displayName: target.displayName, role: target.role, status: target.status, isBlocked: target.isBlocked }, section, data,
            pagination: { page: Number(page), limit: Number(limit), total: visible.length, totalPages: Math.ceil(visible.length / Number(limit)) } });
    } catch (error) {
        console.error('User history lookup failed:', error.message);
        res.status(503).json({ message: 'Unable to load user history.' });
    }
};
