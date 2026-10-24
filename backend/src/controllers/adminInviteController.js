import crypto from 'crypto';
import User from '../models/User.js';
import { sendAdminInviteEmail } from '../utils/emailHelper.js';
import { getAllowedOrigins } from '../config/allowedOrigins.js';
import {
    ADMIN_MODULES,
    ROLE_PRESETS,
    CUSTOM_ROLE,
    FORCED_ACCESS_TYPE,
    ACCESS_TYPES
} from '../config/adminAccess.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\d{10}$/;

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Base URL for the invite link: ADMIN_PANEL_URL if set; otherwise the admin
 * site the master admin is using (its Origin, when it is an allowed origin);
 * otherwise the first allowed origin.
 */
const adminPanelBaseUrl = (req) => {
    if (process.env.ADMIN_PANEL_URL) return process.env.ADMIN_PANEL_URL.trim().replace(/\/$/, '');
    const allowed = getAllowedOrigins();
    const origin = (req.headers.origin || '').replace(/\/$/, '');
    if (origin && allowed.includes(origin)) return origin;
    return allowed[0];
};

/** Issues a fresh token (invalidating any earlier link) and emails it. */
const issueAndSendInvite = async (admin, baseUrl) => {
    const token = crypto.randomBytes(32).toString('hex');
    admin.inviteTokenHash = hashToken(token);
    admin.inviteSentAt = new Date();
    admin.inviteSendCount = (admin.inviteSendCount || 0) + 1;
    await admin.save();

    const inviteLink = `${baseUrl}/admin/accept-invite?token=${token}`;
    try {
        await sendAdminInviteEmail({
            email: admin.email,
            firstName: (admin.displayName || '').split(' ')[0],
            roleName: admin.adminRole,
            inviteLink
        });
        return true;
    } catch (err) {
        console.error(`❌ [ADMIN_INVITE] Email to ${admin.email} failed:`, err.message);
        return false;
    }
};

export const inviteStatusOf = (admin) => {
    if (admin.status === 'approved') return admin.inviteSentAt ? 'Accepted' : 'Active';
    return 'Invite Pending';
};

const toDirectoryRow = (admin) => ({
    _id: admin._id,
    displayName: admin.displayName,
    email: admin.email,
    phone: admin.phone,
    adminRole: admin.adminRole || 'Master Admin',
    adminPermissions: admin.adminPermissions || [],
    adminAccessType: admin.adminAccessType || 'Read/Write',
    geofenceRestrictions: admin.geofenceRestrictions || [],
    status: admin.status,
    inviteStatus: inviteStatusOf(admin),
    inviteSentAt: admin.inviteSentAt,
    inviteAcceptedAt: admin.inviteAcceptedAt,
    inviteSendCount: admin.inviteSendCount || 0,
    // Invited before the current flow: their old link no longer works
    needsResend: admin.status !== 'approved' && !admin.inviteSentAt,
    createdAt: admin.createdAt
});

// GET /api/admin/sub-admins
export const listAdmins = async (req, res) => {
    try {
        const admins = await User.find({ role: 'Admin' }).sort({ createdAt: -1 }).lean();
        res.status(200).json(admins.map(toDirectoryRow));
    } catch (err) {
        console.error('List Admins Error:', err);
        res.status(500).json({ message: 'Error fetching admins' });
    }
};

// POST /api/admin/invite-sub-admin
export const inviteSubAdmin = async (req, res) => {
    try {
        const firstName = String(req.body.firstName || '').trim();
        const lastName = String(req.body.lastName || '').trim();
        const email = String(req.body.email || '').trim().toLowerCase();
        const phone = String(req.body.phone || '').trim();
        const role = String(req.body.role || '').trim();
        const geofences = Array.isArray(req.body.geofences) ? req.body.geofences.map(String) : [];

        if (!firstName || !lastName || !email || !phone || !role) {
            return res.status(400).json({ message: 'Name, email, mobile number and role are required' });
        }
        if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Enter a valid email address' });
        if (!PHONE_RE.test(phone)) return res.status(400).json({ message: 'Enter a valid 10-digit mobile number' });

        let permissions;
        if (role === CUSTOM_ROLE) {
            const requested = Array.isArray(req.body.permissions) ? req.body.permissions : [];
            permissions = ADMIN_MODULES.filter(m => requested.includes(m));
            if (permissions.length === 0) {
                return res.status(400).json({ message: 'Select at least one module for a custom role' });
            }
        } else if (Object.prototype.hasOwnProperty.call(ROLE_PRESETS, role)) {
            permissions = ROLE_PRESETS[role] || [...ADMIN_MODULES];
        } else {
            return res.status(400).json({ message: 'Unknown role' });
        }

        const accessType = FORCED_ACCESS_TYPE[role]
            || (ACCESS_TYPES.includes(req.body.accessType) ? req.body.accessType : 'Read/Write');

        const existing = await User.findOne({ $or: [{ phone }, { email }] }).lean();
        if (existing) {
            return res.status(400).json({ message: 'A user with this mobile number or email already exists' });
        }

        const admin = new User({
            phone,
            email,
            role: 'Admin',
            displayName: `${firstName} ${lastName}`,
            status: 'pending',
            isProfileComplete: true,
            adminRole: role,
            adminPermissions: permissions,
            adminAccessType: accessType,
            geofenceRestrictions: geofences,
            invitedBy: req.admin?.id || null
        });

        const emailSent = await issueAndSendInvite(admin, adminPanelBaseUrl(req));

        res.status(201).json({
            success: true,
            emailSent,
            message: emailSent
                ? `Invitation sent to ${email}`
                : 'Invitation saved, but the email could not be sent. Use Resend once email is working.',
            admin: toDirectoryRow(admin.toObject())
        });
    } catch (err) {
        console.error('Invite Sub-Admin Error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/admin/sub-admins/:id/resend-invite
export const resendSubAdminInvite = async (req, res) => {
    try {
        const admin = await User.findOne({ _id: req.params.id, role: 'Admin' }).catch(() => null);
        if (!admin) return res.status(404).json({ message: 'Admin not found' });
        if (admin.status === 'approved') {
            return res.status(400).json({ message: 'This invitation has already been accepted' });
        }

        const emailSent = await issueAndSendInvite(admin, adminPanelBaseUrl(req));
        if (!emailSent) {
            return res.status(502).json({ message: 'Could not send the invitation email. Please try again.' });
        }
        res.status(200).json({ success: true, message: `Invitation re-sent to ${admin.email}`, admin: toDirectoryRow(admin.toObject()) });
    } catch (err) {
        console.error('Resend Invite Error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

const findByInviteToken = (token) =>
    typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)
        ? User.findOne({ inviteTokenHash: hashToken(token), role: 'Admin' })
        : null;

// GET /api/auth/admin-invite?token=  (public)
export const getAdminInvite = async (req, res) => {
    try {
        const admin = await findByInviteToken(req.query.token);
        if (!admin) {
            return res.status(404).json({ message: 'This invitation link is invalid or has been replaced by a newer one.' });
        }
        if (admin.status === 'approved') {
            return res.status(410).json({ message: 'This invitation has already been accepted. Please log in.' });
        }
        res.status(200).json({
            displayName: admin.displayName,
            email: admin.email,
            phone: admin.phone,
            adminRole: admin.adminRole
        });
    } catch (err) {
        console.error('Get Admin Invite Error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/auth/admin-invite/accept  (public)
export const acceptAdminInvite = async (req, res) => {
    try {
        const admin = await findByInviteToken(req.body?.token);
        if (!admin) {
            return res.status(404).json({ message: 'This invitation link is invalid or has been replaced by a newer one.' });
        }
        if (admin.status === 'approved') {
            return res.status(410).json({ message: 'This invitation has already been accepted. Please log in.' });
        }

        admin.status = 'approved';
        admin.inviteAcceptedAt = new Date();
        await admin.save();

        res.status(200).json({
            success: true,
            message: 'Invitation accepted. You can now log in with your mobile number.',
            phone: admin.phone
        });
    } catch (err) {
        console.error('Accept Admin Invite Error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};
