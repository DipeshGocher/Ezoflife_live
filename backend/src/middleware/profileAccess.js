import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { canAccessAccount } from '../utils/adminScope.js';
import { requireAccountScope } from './adminAccountScope.js';

export const requireProfileAccess = ({ resolveId = req => req.params.id || req.params.vendorId, applicant = false, walkInAddress = false } = {}) => async (req, res, next) => {
    try {
        const id = resolveId(req);
        if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid account id.' });
        const target = await User.findById(id);
        if (!target) return res.status(404).json({ message: 'Account not found.' });
        req.profileTarget = target;
        if (applicant && (String(req.user.id) !== String(id) || target.role === 'Admin')) return res.status(403).json({ message: 'Only the applicant can submit onboarding information.' });
        if (String(req.user.id) === String(id)) return next();
        if (req.user.role === 'Admin') return requireAccountScope({ resolveId: () => id })(req, res, next);
        if (walkInAddress && req.user.role === 'Vendor' && req.account.status === 'approved' && target.role === 'Customer' && !target.isBlocked) {
            const proof = jwt.verify(req.headers['x-walk-in-authorization'] || '', process.env.JWT_SECRET || 'ezoflife_secret_key_2026');
            if (proof.purpose === 'walkin-address' && proof.actorId === String(req.user.id) && proof.customerId === String(id)) {
                if (Object.keys(req.body).some(key => !['address', 'location', 'addresses'].includes(key))) return res.status(403).json({ message: 'Walk-in authorization only permits address updates.' });
                req.walkInAddress = true;
                return next();
            }
        }
        return res.status(403).json({ message: 'You cannot access this account.' });
    } catch (error) {
        if (['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name)) return res.status(403).json({ message: 'Walk-in address authorization is missing or expired. Look up the customer again.' });
        console.error('Profile access lookup failed:', error.message);
        return res.status(503).json({ message: 'Unable to verify profile access.' });
    }
};

export const requireWalkInLookup = (req, res, next) => {
    if (req.user.role === 'Admin' || (req.user.role === 'Vendor' && req.account.status === 'approved')) return next();
    return res.status(403).json({ message: 'Approved vendor or admin access is required.' });
};
export const requireProfileDestination = async (req, candidate) => req.user.role !== 'Admin' || (candidate.role === 'Admin' && String(candidate._id) === String(req.user.id)) || await canAccessAccount(req, candidate);
