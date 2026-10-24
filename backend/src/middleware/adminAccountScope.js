import mongoose from 'mongoose';
import User from '../models/User.js';
import SupplierApplication from '../models/SupplierApplication.js';
import { canAccessAccount, isScopedAdmin } from '../utils/adminScope.js';
import { auditAccountSnapshot } from './adminAudit.js';

export const requireUnrestrictedAdmin = (req, res, next) => isScopedAdmin(req)
    ? res.status(403).json({ message: 'This operation requires an admin with access to all service areas.' }) : next();

export const requireAccountScope = ({ supplierApplication = false, allowAdmin = false, resolveId = req => req.params.id || req.params.vendorId } = {}) => async (req, res, next) => {
    try {
        const id = resolveId(req);
        if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid account id.' });
        const application = supplierApplication ? await SupplierApplication.findById(id).lean() : null;
        const target = application || await User.findById(id).lean();
        if (!target) return res.status(404).json({ message: 'Account not found.' });
        if (target.role === 'Admin' && !allowAdmin) return res.status(403).json({ message: 'Admin accounts cannot be managed through this account operation.' });
        if (!await canAccessAccount(req, target)) return res.status(403).json({ message: 'This account is outside your permitted service areas.' });
        req.profileTarget = target;
        req.auditBefore = auditAccountSnapshot(target);
        // Observe persisted state after an authorized account operation without
        // adding private response fields to the audit log.
        const json = res.json.bind(res);
        res.json = body => {
            if (res.statusCode >= 400 || ['GET', 'HEAD'].includes(req.method)) return json(body);
            const model = application ? SupplierApplication : User;
            model.findById(id).select('role status isBlocked onboardingStage tier').lean().then(current => {
                req.auditAfter = auditAccountSnapshot(current);
            }).catch(error => console.error('Audit state snapshot unavailable:', error.message))
                .finally(() => json(body));
            return res;
        };
        next();
    } catch (error) {
        console.error('Account scope lookup failed:', error.message);
        res.status(503).json({ message: 'Unable to verify account scope. Please try again.' });
    }
};
