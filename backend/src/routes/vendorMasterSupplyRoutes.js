import express from 'express';
import { vendorMasterSupplyController } from '../controllers/vendorMasterSupplyController.js';
import { verifyAdmin, verifyUser } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', vendorMasterSupplyController.getAll);
router.get('/unique-filters', vendorMasterSupplyController.getUniqueFilters);
router.get('/live-catalog', vendorMasterSupplyController.getLiveCatalog);
router.get('/costs', verifyUser, vendorMasterSupplyController.getMyCosts);

// Admin / Supplier modification routes
router.post('/', verifyUser, vendorMasterSupplyController.create);
router.post('/bulk-upload', verifyAdmin, vendorMasterSupplyController.bulkUpload);
router.delete('/clear-all', verifyAdmin, vendorMasterSupplyController.clearAll);
router.put('/:id', verifyUser, vendorMasterSupplyController.update);
router.patch('/:id', verifyUser, vendorMasterSupplyController.update);
router.delete('/:id', verifyUser, vendorMasterSupplyController.delete);

export default router;
