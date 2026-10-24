import { adminPermissionForRequest, hasAdminPermission } from '../utils/adminPermissions.js';
import { beginAdminAudit } from './adminAudit.js';
import jwt from 'jsonwebtoken';
import { loadSessionAccount, isReadOnlyMutation } from '../utils/sessionAccount.js';

const authenticate = (allowedRoles = null, adminOnly = false) => async (req, res, next) => {
    try {
        const header = req.headers.authorization || req.headers.Authorization;
        if (!header?.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
        const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET || 'ezoflife_secret_key_2026');
        const account = await loadSessionAccount(decoded);
        if (!account) return res.status(403).json({ success: false, message: 'Account is not active. Please sign in with an active account.' });
        req.account = account;
        const actor = { ...decoded, role: account.role };
        if (!adminOnly) req.user = actor;
        if (account.role === 'Admin') req.admin = actor;
        await beginAdminAudit(req, res);
        if (allowedRoles && !allowedRoles.includes(account.role)) return res.status(403).json({ success: false, message: 'Forbidden. Access required.' });
        if (isReadOnlyMutation(account, req.method)) return res.status(403).json({ success: false, message: 'Access Denied. You have Read-Only permissions.' });
        const permission = account.role === 'Admin' ? adminPermissionForRequest(req) : null;
        if (permission && !hasAdminPermission(account, permission)) return res.status(403).json({ success: false, message: `Access to ${permission} is required.` });
        next();
    } catch (error) {
        if (error.code === 'AUDIT_UNAVAILABLE') return res.status(503).json({ success: false, message: 'Unable to record admin action. No changes were made. Please try again.' });
        if (error.name === 'TokenExpiredError') return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
        if (['JsonWebTokenError', 'NotBeforeError', 'CastError'].includes(error.name)) return res.status(401).json({ success: false, message: 'Invalid token. Authentication failed.' });
        console.error('Session account lookup failed:', error.message);
        return res.status(503).json({ success: false, message: 'Unable to verify account. Please try again.' });
    }
};

export const verifyAdmin = authenticate(['Admin'], true);
export const verifyAdminOrVendor = authenticate(['Admin', 'Vendor']);
// Pending and revision-required accounts retain their existing onboarding and
// support access. Individual operations still enforce their role and ownership.
export const verifyUser = authenticate();

/**
 * The id of the account a request is acting *as*.
 *
 * Normally that is the caller. An Admin may act on behalf of another account
 * (support, walk-in orders raised by staff), so an explicit id in the body is
 * honoured only for Admins — for everyone else the token wins, which is what
 * closes "anyone can place orders as anyone".
 */
export const resolveActorId = (req, bodyField = 'customerId') => {
    if (req.user?.role === 'Admin' && req.body?.[bodyField]) {
        return req.body[bodyField];
    }
    return req.user?.id;
};

/**
 * True when the caller owns the resource, or is an Admin.
 * `ownerId` may be an ObjectId, a populated doc, or a string.
 */
export const isOwnerOrAdmin = (req, ownerId) => {
    if (req.user?.role === 'Admin') return true;
    if (!ownerId || !req.user?.id) return false;
    const owner = ownerId._id ? ownerId._id.toString() : ownerId.toString();
    return owner === req.user.id.toString();
};
