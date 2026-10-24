import express from 'express';
import { submitPartnershipInquiry, getAllPartnershipInquiries, getPartnershipFilters, deletePartnershipInquiry, updatePartnershipStatus, getMyPartnershipInquiries, updatePartnershipNotes } from '../controllers/partnershipController.js';
import { verifyAdmin, verifyUser, optionalUser } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/submit', optionalUser, submitPartnershipInquiry);
router.get('/my-inquiries', verifyUser, getMyPartnershipInquiries);

// Admin-only routes
router.get('/all', verifyAdmin, getAllPartnershipInquiries);
router.get('/filters', verifyAdmin, getPartnershipFilters);
router.delete('/:id', verifyAdmin, deletePartnershipInquiry);
router.put('/:id/status', verifyAdmin, updatePartnershipStatus);
router.put('/:id/notes', verifyAdmin, updatePartnershipNotes);

export default router;

