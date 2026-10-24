import mongoose from 'mongoose';
import B2BOrder from '../models/B2BOrder.js';
import User from '../models/User.js';
import { createAdminReportScope } from '../utils/adminReportScope.js';
import { requireAccountScope, requireUnrestrictedAdmin } from './adminAccountScope.js';
const actor = req => req.user || req.admin;
const id = value => String(value?._id || value || '');
export const requireB2BAccount = (role, parameter) => async (req, res, next) => {
    const user = actor(req), target = req.params[parameter] || req.body[parameter];
    if (user.role === 'Admin') return requireAccountScope({ resolveId: () => target })(req, res, next);
    if (user.role !== role || id(user.id) !== id(target)) return res.status(403).json({ message: 'You cannot access this B2B account.' });
    next();
};
export const requireB2BOrder = ({ ids = req => [req.params.id || req.body.orderId], claim = false, vendorOnly = false } = {}) => async (req, res, next) => {
    try {
        const requested = ids(req);
        if (!Array.isArray(requested) || !requested.length || requested.length > 500 || requested.some(value => !mongoose.isValidObjectId(value))) return res.status(400).json({ message: 'Valid B2B order IDs are required (maximum 500).' });
        const user = actor(req);
        let query = { _id: { $in: requested } };
        if (user.role === 'Admin') {
            const scope = await createAdminReportScope(req, ['B2BOrder']); query = scope.query('B2BOrder', query);
        }
        const orders = await B2BOrder.find(query).select('_id vendor supplier pincode city status').lean();
        if (orders.length !== new Set(requested.map(String)).size) return res.status(403).json({ message: 'B2B order is unavailable or outside your service areas.' });
        if (user.role !== 'Admin') {
            if (vendorOnly && user.role !== 'Vendor') return res.status(403).json({ message: 'Only the purchasing vendor can perform this payment action.' });
            let supplier;
            if (user.role === 'Supplier') supplier = await User.findById(user.id).select('supplierDetails shopDetails addresses').lean();
            for (const order of orders) {
                if (user.role === 'Vendor' && id(order.vendor) === id(user.id)) continue;
                if (user.role === 'Supplier' && id(order.supplier) === id(user.id)) continue;
                const destination = supplier?.supplierDetails || {};
                const address = supplier?.addresses?.find(address => address.isDefault) || supplier?.addresses?.[0];
                const pincode = destination.pincode || supplier?.shopDetails?.pincode || address?.pincode;
                const city = destination.city || supplier?.shopDetails?.city || address?.city;
                const regional = (pincode && String(pincode).trim() === order.pincode) || (city && String(city).trim().toLowerCase() === order.city?.trim().toLowerCase());
                if (user.role === 'Supplier' && !order.supplier && regional && ['SUBMITTED', 'Confirmed'].includes(order.status) && (req.method === 'GET' || (claim && ['ACCEPTED', 'Accepted'].includes(req.body.status)))) continue;
                return res.status(403).json({ message: 'You cannot access this B2B order.' });
            }
            if (user.role === 'Supplier' && req.body.supplierId && req.body.supplierId !== id(user.id)) return res.status(403).json({ message: 'Supplier identity must match your session.' });
            if (user.role === 'Supplier' && claim) req.body.supplierId = id(user.id);
        }
        next();
    } catch (error) { res.status(error.name === 'CastError' ? 400 : 503).json({ message: 'Unable to verify B2B access.' }); }
};
export const requireGlobalB2BAdmin = requireUnrestrictedAdmin;
