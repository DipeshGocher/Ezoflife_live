import { filterList } from '../utils/queryFilters.js';
import mongoose from 'mongoose';
import AdminAuditEvent from '../models/AdminAuditEvent.js';
import { isScopedAdmin } from '../utils/adminScope.js';

export const getAdminAuditEvents = async (req, res) => {
    try {
        const { page = '1', limit = '25', actorId, targetId, outcome, from, to, search } = req.query;
        if (!/^\d+$/.test(String(page)) || Number(page) < 1 || !/^\d+$/.test(String(limit)) || Number(limit) < 1 || Number(limit) > 100) return res.status(400).json({ message: 'Invalid pagination.' });
        const query = {};
        if (isScopedAdmin(req)) query.actorId = req.admin.id;
        if (actorId) {
            if (!mongoose.isValidObjectId(actorId)) return res.status(400).json({ message: 'Invalid actor id.' });
            if (isScopedAdmin(req) && String(actorId) !== String(req.admin.id)) return res.status(403).json({ message: 'You can only inspect your own audit history.' });
            query.actorId = actorId;
        }
        if (targetId) {
            if (!mongoose.isValidObjectId(targetId)) return res.status(400).json({ message: 'Invalid target id.' });
            query.targetId = targetId;
        }
        if (outcome) {
            const values = filterList(outcome);
            if (!values.length || values.some(value => !['Requested', 'Succeeded', 'Denied', 'Failed', 'Aborted'].includes(value))) return res.status(400).json({ message: 'Invalid outcome.' });
            query.outcome = { $in: values };
        }
        if (from || to) {
            const start = from && new Date(from); const end = to && new Date(to);
            if ((from && !Number.isFinite(start.getTime())) || (to && !Number.isFinite(end.getTime())) || (start && end && start > end)) return res.status(400).json({ message: 'Invalid date range.' });
            query.createdAt = { ...(start ? { $gte: start } : {}), ...(end ? { $lte: end } : {}) };
        }
        if (search) {
            if (typeof search !== 'string' || search.length > 100) return res.status(400).json({ message: 'Invalid search.' });
            const literal = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            query.$or = [{ path: { $regex: literal, $options: 'i' } }, { operationId: { $regex: literal, $options: 'i' } }];
        }
        const offset = (Number(page) - 1) * Number(limit);
        if (!Number.isSafeInteger(offset) || offset > 1000000) return res.status(400).json({ message: 'Page is too large.' });
        const [data, total] = await Promise.all([
            AdminAuditEvent.find(query).sort({ createdAt: -1, _id: -1 }).skip(offset).limit(Number(limit)).lean(),
            AdminAuditEvent.countDocuments(query)
        ]);
        res.json({ data, pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) }, visibility: isScopedAdmin(req) ? 'own' : 'all' });
    } catch (error) {
        console.error('Audit history lookup failed:', error.message);
        res.status(503).json({ message: 'Unable to load audit history. Please try again.' });
    }
};
