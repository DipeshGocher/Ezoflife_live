import { requireProfileAccess, requireWalkInLookup } from '../middleware/profileAccess.js';
import express from 'express';
import { 
    requestOtp, 
    verifyOtp, 
    completeVendorProfile, 
    getStatus, 
    getUserProfile, 
    updateUserProfile, 
    updateVendorDocuments, 
    registerVendor, 
    vendorLogin, 
    becomeVendor, 
    becomeSupplier, 
    tempSeedUser,
    updateFcmToken,
    getVendorEarnings,
    submitVendorServices,
    updateProfileImage,
    getDraftCart,
    updateDraftCart,
    lookupCustomerByPhone
} from '../controllers/authController.js';
import { getAdminInvite, acceptAdminInvite } from '../controllers/adminInviteController.js';
import { getVendorPayoutHistory } from '../controllers/adminController.js';
import upload from '../middleware/upload.js';
import { verifyAdmin, verifyUser, requireSelfOrAdmin, requireRole } from '../middleware/authMiddleware.js';

// Account routes addressed by id: the caller must be that account or an Admin
const self = (param = 'id') => [verifyUser, requireSelfOrAdmin(param)];

// For routes that address the account by the phone in the (multipart) body
const ownPhoneOrAdmin = (req, res, next) => {
    if (req.user?.role === 'Admin' || String(req.body?.phone || '') === String(req.user?.phone || '')) return next();
    return res.status(403).json({ success: false, message: 'You can only update your own account.' });
};

const router = express.Router();

// Sub-admin invitation (public: the emailed token is the credential)
router.get('/admin-invite', getAdminInvite);
router.post('/admin-invite/accept', acceptAdminInvite);

// DEV SCAFFOLDING — provisions a hardcoded account with a known OTP. Gated to
// Admin so it is no longer a public backdoor; it should be deleted outright once
// nothing depends on it.
router.post('/temp-seed', (req, res, next) => (
    process.env.NODE_ENV === 'production' ? res.status(404).json({ message: 'Not found' }) : next()
), verifyAdmin, tempSeedUser);
router.post('/request-otp', requestOtp);
router.post('/verify-otp', verifyOtp);
router.post('/update-fcm-token', verifyUser, requireProfileAccess({ resolveId: req => req.body.userId }), updateFcmToken);
router.post('/register-vendor', verifyAdmin, registerVendor);
router.post('/vendor-login', vendorLogin);
router.post('/complete-vendor-profile', verifyUser, requireProfileAccess({ resolveId: req => req.user.id, applicant: true }), upload.fields([
    { name: 'gstDoc', maxCount: 1 },
    { name: 'msmeDoc', maxCount: 1 }
]), ownPhoneOrAdmin, completeVendorProfile);

router.get('/get-status', verifyUser, requireProfileAccess({ resolveId: req => req.user.id }), getStatus);
router.get('/profile/:id', verifyUser, requireProfileAccess(), getUserProfile);
router.get('/lookup-phone/:phone', verifyUser, requireWalkInLookup, lookupCustomerByPhone);
router.patch('/profile/update/:id', verifyUser, requireProfileAccess({ walkInAddress: true }), updateUserProfile);
router.patch('/update-documents/:id', verifyUser, requireProfileAccess(), upload.single('document'), updateVendorDocuments);
router.patch('/update-profile-image/:id', verifyUser, requireProfileAccess(), upload.single('image'), updateProfileImage);
router.patch('/become-vendor/:id', verifyUser, requireProfileAccess({ applicant: true }), upload.fields([
    { name: 'panDoc', maxCount: 1 },
    { name: 'gstDoc', maxCount: 1 },
    { name: 'aadharDoc', maxCount: 1 },
    { name: 'msmeDoc', maxCount: 1 },
    { name: 'franchiseDoc', maxCount: 1 },
    { name: 'chequeDoc', maxCount: 1 },
    { name: 'exteriorPhoto', maxCount: 1 },
    { name: 'interiorPhotos', maxCount: 2 },
    { name: 'walkthroughVideo', maxCount: 1 }
]), becomeVendor);
router.patch('/become-vendor/:id/submit-services', verifyUser, requireProfileAccess({ applicant: true }), submitVendorServices);
router.post('/become-supplier/:id', verifyUser, requireProfileAccess({ applicant: true }), (req, res, next) => {
    upload.fields([
        { name: 'gstCert', maxCount: 1 },
        { name: 'udyogAadhar', maxCount: 1 },
        { name: 'aadharCard', maxCount: 1 },
        { name: 'addressProof', maxCount: 1 }
    ])(req, res, (err) => {
        if (err) {
            console.error('❌ [MULTER_ERROR]', err);
            return res.status(400).json({ message: 'Document upload failed', error: err.message });
        }
        next();
    });
}, becomeSupplier);

router.get('/vendor-earnings', verifyUser, requireProfileAccess({ resolveId: req => req.query.vendorId }), getVendorEarnings);
router.get('/vendor-payouts/:vendorId', verifyUser, requireProfileAccess(), getVendorPayoutHistory);
router.get('/cart/:id', verifyUser, requireProfileAccess(), getDraftCart);
router.post('/cart/:id', verifyUser, requireProfileAccess(), updateDraftCart);

export default router;
