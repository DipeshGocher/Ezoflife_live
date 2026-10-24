import express from 'express';
const router = express.Router();
import { 
    getAllFAQs, 
    getAllFAQsAdmin,
    createFAQ, 
    updateFAQ, 
    deleteFAQ,
    reorderFAQs
} from '../controllers/faqController.js';
import { verifyAdmin } from '../middleware/authMiddleware.js';

router.get('/', getAllFAQs);
router.get('/admin/all', verifyAdmin, getAllFAQsAdmin);

// Admin-only modification routes
router.post('/reorder', verifyAdmin, reorderFAQs);
router.post('/', verifyAdmin, createFAQ);
router.patch('/:id', verifyAdmin, updateFAQ);
router.delete('/:id', verifyAdmin, deleteFAQ);

export default router;
