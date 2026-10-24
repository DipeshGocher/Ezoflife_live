import { requireB2BAccount, requireB2BOrder, requireGlobalB2BAdmin } from '../middleware/b2bAccess.js';
import express from 'express';
const router = express.Router();
import * as b2bController from '../controllers/b2bOrderController.js';

import { verifyAdmin, verifyUser } from '../middleware/authMiddleware.js';

// Literal paths MUST be declared before the '/:id' wildcard. Express matches in
// declaration order, so '/timeline' and '/admin/escrow' were previously captured
// by '/:id', which then tried to cast "timeline" to an ObjectId and returned 500.
// Both endpoints were unreachable.
router.get('/timeline', verifyUser, b2bController.getSupplierTimeline);
router.get('/admin/escrow', verifyAdmin, b2bController.getAdminEscrowOrders);
router.get('/supplier/:supplierId', verifyUser, requireB2BAccount('Supplier', 'supplierId'), b2bController.getSupplierOrders);
router.get('/vendor/:vendorId', verifyUser, requireB2BAccount('Vendor', 'vendorId'), b2bController.getVendorOrders);

router.post('/place', verifyUser, requireB2BAccount('Vendor', 'vendorId'), b2bController.placeB2BOrder);
router.post('/bulk-status-update', verifyAdmin, requireB2BOrder({ ids: req => req.body.orderIds }), b2bController.bulkUpdateB2BStatus);
router.post('/verify-platform-fee', verifyUser, requireB2BOrder({ ids: req => req.body.orderIds, vendorOnly: true }), b2bController.verifyPlatformFeePayment);
router.post('/initiate-payment', verifyUser, requireB2BOrder({ vendorOnly: true }), b2bController.initiateB2BPayment);
router.post('/verify-payment', verifyUser, requireB2BOrder({ vendorOnly: true }), b2bController.verifyB2BPayment);

// Wildcard routes last.
router.get('/:id', verifyUser, requireB2BOrder(), b2bController.getB2BOrderById);
router.patch('/:id/status', verifyUser, requireB2BOrder({ claim: true }), b2bController.updateB2BStatus);
router.post('/:id/verify-otp', verifyUser, requireB2BOrder(), b2bController.verifyDeliveryOtp);
router.patch('/:id/delivery-date', verifyUser, requireB2BOrder(), b2bController.updateB2BDeliveryDate);
router.patch('/:id/release', verifyAdmin, requireB2BOrder(), b2bController.releaseSupplierPayment);

export default router;
