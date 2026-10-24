import { requireProfileAccess, requireWalkInLookup } from '../middleware/profileAccess.js';
import express from 'express';
import { 
    requestOtp, 
    verifyOtp, 
    adminLogin, 
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
    lookupCustomerByPhone,
    getSubAdminActivationDetails,
    activateSubAdmin
} from '../controllers/authController.js';
import { getVendorPayoutHistory } from '../controllers/adminController.js';
import upload from '../middleware/upload.js';
import { verifyAdmin, verifyUser } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/sub-admin-activation-details', getSubAdminActivationDetails);
router.post('/activate-sub-admin', activateSubAdmin);

// DEV SCAFFOLDING — provisions a hardcoded account with a known OTP. Gated to
// Admin so it is no longer a public backdoor; it should be deleted outright once
// nothing depends on it.
router.post('/temp-seed', verifyAdmin, tempSeedUser);
router.post('/request-otp', requestOtp);
router.post('/verify-otp', verifyOtp);
router.post('/update-fcm-token', verifyUser, requireProfileAccess({ resolveId: req => req.body.userId }), updateFcmToken);
router.post('/admin-login', adminLogin);
router.post('/register-vendor', registerVendor);
router.post('/vendor-login', vendorLogin);
router.post('/complete-vendor-profile', verifyUser, requireProfileAccess({ resolveId: req => req.user.id, applicant: true }), upload.fields([
    { name: 'gstDoc', maxCount: 1 },
    { name: 'msmeDoc', maxCount: 1 }
]), completeVendorProfile);

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
