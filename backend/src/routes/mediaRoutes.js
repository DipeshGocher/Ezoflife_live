import express from 'express';
import upload from '../middleware/upload.js';
import localUpload from '../middleware/localUpload.js';
import { 
    uploadMedia, 
    uploadMultipleMedia, 
    getMediaHistory, 
    getLatestMedia, 
    submitInquiry, 
    getAllInquiries, 
    getInquiryFilters, 
    deleteInquiry, 
    updateInquiryStatus, 
    updateInquiryNotes, 
    getMyInquiries 
} from '../controllers/mediaController.js';
import { verifyAdmin, verifyUser, optionalUser } from '../middleware/authMiddleware.js';

const router = express.Router();

const makeUploadHandler = (multerMiddleware) => (req, res, next) => {
    multerMiddleware(req, res, (err) => {
        if (err) {
            console.error('❌ [UPLOAD_ERROR] Multer / Cloudinary upload failed:', err);
            
            const errStr = String(err.message || err.stack || err);
            const isCloudinaryQuota = errStr.toLowerCase().includes('limit') || 
                                      errStr.toLowerCase().includes('quota') || 
                                      errStr.toLowerCase().includes('capacity') ||
                                      errStr.toLowerCase().includes('storage') || 
                                      errStr.toLowerCase().includes('full');
                                      
            if (isCloudinaryQuota) {
                console.error('🚨 [CRITICAL] Cloudinary limit reached or account is out of storage capacity!');
            }
            
            return res.status(500).json({
                success: false,
                message: 'Media upload failed: ' + err.message,
                error: err.message,
                isCloudinaryQuota
            });
        }
        next();
    });
};

router.post('/upload', verifyUser, makeUploadHandler(upload.single('media')), uploadMedia);
router.post('/upload-pdf', verifyAdmin, makeUploadHandler(localUpload.single('media')), uploadMedia);
router.post('/bulk-upload', verifyUser, makeUploadHandler(upload.array('photos', 5)), uploadMultipleMedia);
router.get('/history', getMediaHistory);
router.get('/latest', getLatestMedia);

// Ad Inquiries
router.post('/inquiry', optionalUser, submitInquiry);
router.get('/inquiries/my', verifyUser, getMyInquiries);
router.get('/inquiries/filters', verifyAdmin, getInquiryFilters);
router.get('/inquiries', verifyAdmin, getAllInquiries);
router.delete('/inquiries/:id', verifyAdmin, deleteInquiry);
router.put('/inquiries/:id/status', verifyAdmin, updateInquiryStatus);
router.put('/inquiries/:id/notes', verifyAdmin, updateInquiryNotes);

export default router;
