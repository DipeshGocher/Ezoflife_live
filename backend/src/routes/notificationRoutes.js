import express from 'express';
import { getNotifications, markAsRead, clearAll } from '../controllers/notificationController.js';
import { verifyUser } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', verifyUser, getNotifications);
router.patch('/:id/read', verifyUser, markAsRead);
router.delete('/clear', verifyUser, clearAll);

export default router;
