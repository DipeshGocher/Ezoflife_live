import { getIssuedInvoice, issueInvoice } from '../controllers/issuedInvoiceController.js';
import { getAdminUserHistory } from '../controllers/adminUserHistoryController.js';
import { getAdminAuditEvents } from '../controllers/adminAuditController.js';
import { requireAccountScope, requireUnrestrictedAdmin } from '../middleware/adminAccountScope.js';
import User from '../models/User.js';
import { settleVendorOrder } from '../services/vendorSettlement.js';
console.log('--- ADMIN ROUTES MODULE LOADED ---');
import express from 'express';
import { getAdminOrderDetail } from '../controllers/adminOrderController.js';
import {
    getPendingApprovals,
    getSidebarCounts,
    approveVendor,
    approveFinalVendor,
    rejectVendor,
    getDashboardStats,
    getAllVendors,
    getVendorById,
    getCustomers,
    deleteVendor,
    registerCustomer,
    updateVendorServiceStatus,
    uploadVendorDocument,
    getAllSuppliers,
    approveSupplier,
    rejectSupplier,
    updateSupplier,
    getSystemConfig,
    updateSystemConfig,
    getAllUsers,
    toggleUserStatus,
    deleteUser,
    clearAllUsers,
    clearAllServices,
    clearAllOrders,
    getCustomerPaymentSummary,
    getVendorPaymentSummary,
    recordVendorPayout,
    getVendorPayoutHistory,
    getCloudinaryUsage,
} from '../controllers/adminController.js';
import upload from '../middleware/upload.js';
import { inviteSubAdmin, listAdmins, resendSubAdminInvite } from '../controllers/adminInviteController.js';
import { requireMasterAdmin } from '../middleware/authMiddleware.js';
import { getRefundLedger } from '../controllers/refundLedgerController.js';

const router = express.Router();
router.get('/audit-events', getAdminAuditEvents);

// Admin directory & invitations — master admins only
router.post('/invite-sub-admin', requireMasterAdmin, requireUnrestrictedAdmin, inviteSubAdmin);
router.get('/sub-admins', requireMasterAdmin, requireUnrestrictedAdmin, listAdmins);
router.post('/sub-admins/:id/resend-invite', requireMasterAdmin, requireUnrestrictedAdmin, resendSubAdminInvite);
router.delete('/services-clear-all', requireUnrestrictedAdmin, clearAllServices);

router.get('/config', getSystemConfig);
router.post('/config', requireUnrestrictedAdmin, updateSystemConfig);
router.get('/stats', getDashboardStats);
router.get('/orders/:id/invoices', getIssuedInvoice);
router.post('/orders/:id/invoices', issueInvoice);
router.get('/orders/:id', getAdminOrderDetail);
router.get('/cloudinary-usage', getCloudinaryUsage);
router.get('/users', getAllUsers);
router.get('/users/:id/history', requireAccountScope(), getAdminUserHistory);
router.patch('/users/:id/toggle-status', requireAccountScope({ allowAdmin: true }), toggleUserStatus);
router.delete('/users/:id', requireAccountScope(), deleteUser);
router.get('/vendors', getAllVendors);
router.post('/vendors/:id/documents', requireAccountScope(), upload.single('file'), uploadVendorDocument);
router.get('/vendors/:id', requireAccountScope(), getVendorById);
router.patch('/vendors/:vendorId/services/:serviceId/status', requireAccountScope(), updateVendorServiceStatus);
router.delete('/vendors/:id', requireAccountScope(), deleteVendor);
router.get('/customers', getCustomers);
router.post('/register-customer', requireUnrestrictedAdmin, registerCustomer);
router.get('/pending-approvals', getPendingApprovals);
router.get('/sidebar-counts', getSidebarCounts);
router.post('/approve-vendor/:id', requireAccountScope(), approveVendor);
router.post('/reject-vendor/:id', requireAccountScope(), rejectVendor);
router.delete('/users-clear-all', requireUnrestrictedAdmin, clearAllUsers);
router.post('/orders-clear-all', requireUnrestrictedAdmin, clearAllOrders);
router.get('/customer-payments', getCustomerPaymentSummary);
router.get('/vendor-payments', getVendorPaymentSummary);
router.post('/vendor-payments/account/:vendorId', requireUnrestrictedAdmin, async (req, res) => {
    try {
        const account = String(req.body.account || '');
        if (!/^acc_[A-Za-z0-9]+$/.test(account)) return res.status(400).json({ message: 'Enter a valid Razorpay linked account ID' });
        const vendor = await User.findOneAndUpdate({ _id: req.params.vendorId, role: 'Vendor' }, { $set: { razorpayLinkedAccountId: account } }, { new: true }).select('_id razorpayLinkedAccountId');
        if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
        res.json(vendor);
    } catch (error) { res.status(error.name === 'CastError' ? 400 : 500).json({ message: 'Could not save linked account' }); }
});

router.post('/vendor-payments/route/:orderId', requireUnrestrictedAdmin, async (req, res) => {
    try { res.json(await settleVendorOrder(req.params.orderId)); }
    catch (error) { res.status(error.status || 500).json({ message: error.message }); }
});
router.get('/refunds', requireUnrestrictedAdmin, getRefundLedger);
router.post('/record-vendor-payout', requireUnrestrictedAdmin, recordVendorPayout);
router.get('/vendor-payouts/:vendorId', getVendorPayoutHistory);
router.get('/vendor-request/:id', requireAccountScope(), getVendorById);
router.patch('/vendor-request/:id/approve-initial', requireAccountScope(), approveVendor);
router.patch('/vendor-request/:id/approve-final', requireAccountScope(), approveFinalVendor);

// Supplier Management
router.get('/suppliers', getAllSuppliers);
router.patch('/suppliers/:id/approve', requireAccountScope({ supplierApplication: true }), approveSupplier);
router.patch('/suppliers/:id/reject', requireAccountScope({ supplierApplication: true }), rejectSupplier);
router.patch('/suppliers/:id', requireAccountScope(), updateSupplier);
router.delete('/suppliers/:id', requireAccountScope(), deleteUser); // Use generic deleteUser

// Diagnostic Route
router.get('/diagnostic', requireUnrestrictedAdmin, async (req, res) => {
    try {
        const User = (await import('../models/User.js')).default;
        const allUsers = await User.find({}, 'role phone').lean();
        const uniqueRoles = [...new Set(allUsers.map(u => u.role))];

        const invalidUsers = allUsers.filter(u => u.role === 'User');

        res.json({
            status: 'ok',
            uniqueRolesInDB: uniqueRoles,
            fixedInvalidRoles: 0,
            invalidRoles: invalidUsers.length,
            totalUsers: allUsers.length
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

router.get('/referrals', async (req, res) => {
    try {
        const Referral = (await import('../models/Referral.js')).default;
        const User = (await import('../models/User.js')).default;

        const referrals = await Referral.find({}).populate('referrer', 'displayName phone').lean();

        const enhancedReferrals = await Promise.all(referrals.map(async (ref) => {
            const referredUser = await User.findOne({ phone: ref.referredPhone }).lean();
            return {
                _id: ref._id,
                referrerName: ref.referrer?.displayName || 'N/A',
                referrerPhone: ref.referrer?.phone || 'N/A',
                referredPhone: ref.referredPhone,
                isDownloaded: referredUser ? 'Yes' : 'No',
                createdAt: ref.createdAt
            };
        }));

        res.json(enhancedReferrals);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
