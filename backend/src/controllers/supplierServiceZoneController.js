import { filterCondition } from '../utils/queryFilters.js';
import SupplierServiceZone from '../models/SupplierServiceZone.js';
import { httpStatusForError } from '../utils/errorResponse.js';
import { validateZoneFeeFields } from '../utils/b2bPlatformFee.js';

export const supplierServiceZoneController = {
    create: async (req, res) => {
        try {
            const { zoneName, supplierId, pincodes, deliveryCharges, minOrderValue, isActive } = req.body;

            const feeError = validateZoneFeeFields(req.body);
            if (feeError) return res.status(400).json({ message: feeError });

            // Auto-generate zoneId (Starts from SPZ-ZONE-001, SPZ-ZONE-002...)
            const lastZone = await SupplierServiceZone.findOne({ zoneId: { $regex: /^SPZ-ZONE-/ } }).sort({ zoneId: -1 });
            let nextNum = 1;
            if (lastZone && lastZone.zoneId) {
                const match = lastZone.zoneId.match(/^SPZ-ZONE-(\d+)$/);
                if (match) {
                    nextNum = parseInt(match[1], 10) + 1;
                }
            }
            const zoneId = `SPZ-ZONE-${String(nextNum).padStart(3, '0')}`;

            const zone = new SupplierServiceZone({
                zoneId,
                zoneName,
                supplierId: supplierId || 'SUP-001',
                pincodes: Array.isArray(pincodes) ? pincodes : [],
                deliveryCharges: Number(deliveryCharges) || 0,
                minOrderValue: Number(minOrderValue) || 0,
                supplierPlatformMultiplier: Number(req.body.supplierPlatformMultiplier) || 0,
                platformFeeMode: req.body.platformFeeMode || 'DEFAULT',
                platformFeeValue: Number(req.body.platformFeeValue) || 0,
                minSupplierPlatformFee: Number(req.body.minSupplierPlatformFee) || 0,
                maxSupplierPlatformFee: req.body.maxSupplierPlatformFee ? Number(req.body.maxSupplierPlatformFee) : null,
                isActive: isActive !== undefined ? isActive : true
            });

            await zone.save();
            res.status(201).json(zone);
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    getAll: async (req, res) => {
        try {
            const { page, limit, zoneName, supplierId, isActive } = req.query;

            let query = {};
            if (zoneName) {
                query.zoneName = { $regex: zoneName, $options: 'i' };
            }
            if (supplierId) {
                query.supplierId = { $regex: supplierId, $options: 'i' };
            }
            if (isActive !== undefined && isActive !== '') {
                query.isActive = filterCondition(isActive, value => String(value) === 'true');
            }

            if (page && limit) {
                const pageNumber = parseInt(page, 10);
                const limitNumber = parseInt(limit, 10);
                const skip = (pageNumber - 1) * limitNumber;

                const total = await SupplierServiceZone.countDocuments(query);
                const zones = await SupplierServiceZone.find(query)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limitNumber);

                return res.json({
                    data: zones,
                    pagination: {
                        total,
                        page: pageNumber,
                        limit: limitNumber,
                        totalPages: Math.ceil(total / limitNumber)
                    }
                });
            }

            const zones = await SupplierServiceZone.find(query).sort({ createdAt: -1 });
            res.json(zones);
        } catch (error) {
            res.status(httpStatusForError(error)).json({ message: error.message });
        }
    },

    update: async (req, res) => {
        try {
            const { id } = req.params;
            const updates = req.body;

            const feeError = validateZoneFeeFields(updates);
            if (feeError) return res.status(400).json({ message: feeError });

            // Ensure the zone has a zoneId if missing for some reason
            const existing = await SupplierServiceZone.findById(id);
            if (existing && !existing.zoneId) {
                const lastZone = await SupplierServiceZone.findOne({ zoneId: { $regex: /^SPZ-ZONE-/ } }).sort({ zoneId: -1 });
                let nextNum = 1;
                if (lastZone && lastZone.zoneId) {
                    const match = lastZone.zoneId.match(/^SPZ-ZONE-(\d+)$/);
                    if (match) {
                        nextNum = parseInt(match[1], 10) + 1;
                    }
                }
                updates.zoneId = `SPZ-ZONE-${String(nextNum).padStart(3, '0')}`;
            }

            if (updates.pincodes && !Array.isArray(updates.pincodes)) {
                updates.pincodes = String(updates.pincodes).split(',').map(p => p.trim()).filter(Boolean);
            }

            const zone = await SupplierServiceZone.findByIdAndUpdate(id, updates, { new: true });
            res.json(zone);
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    delete: async (req, res) => {
        try {
            const { id } = req.params;
            await SupplierServiceZone.findByIdAndDelete(id);
            res.json({ message: 'Supplier service zone deleted successfully' });
        } catch (error) {
            res.status(httpStatusForError(error)).json({ message: error.message });
        }
    },

    clearAll: async (req, res) => {
        try {
            await SupplierServiceZone.deleteMany({});
            res.json({ message: 'All supplier service zones cleared successfully' });
        } catch (error) {
            res.status(httpStatusForError(error)).json({ message: error.message });
        }
    },

    bulkUpload: async (req, res) => {
        try {
            const zones = req.body; // Expecting an array
            if (!Array.isArray(zones)) {
                return res.status(400).json({ message: 'Payload must be an array' });
            }

            const lastZone = await SupplierServiceZone.findOne({ zoneId: { $regex: /^SPZ-ZONE-/ } }).sort({ zoneId: -1 });
            let currentNum = 0;
            if (lastZone && lastZone.zoneId) {
                const match = lastZone.zoneId.match(/^SPZ-ZONE-(\d+)$/);
                if (match) {
                    currentNum = parseInt(match[1], 10);
                }
            }

            const results = {
                created: 0,
                skipped: 0,
                errors: 0
            };

            for (const zoneData of zones) {
                try {
                    if (validateZoneFeeFields(zoneData)) {
                        results.errors++;
                        continue;
                    }
                    // Check for duplicates by zoneName (case-insensitive)
                    const exists = await SupplierServiceZone.findOne({
                        zoneName: { $regex: new RegExp(`^${zoneData.zoneName}$`, 'i') }
                    });

                    if (exists) {
                        results.skipped++;
                        continue;
                    }

                    currentNum++;
                    const zoneId = `SPZ-ZONE-${String(currentNum).padStart(3, '0')}`;

                    let pincodeArr = [];
                    if (Array.isArray(zoneData.pincodes)) {
                        pincodeArr = zoneData.pincodes;
                    } else if (zoneData.pincodes) {
                        pincodeArr = String(zoneData.pincodes).split(',').map(p => p.trim()).filter(Boolean);
                    }

                    const newZone = new SupplierServiceZone({
                        zoneId,
                        zoneName: zoneData.zoneName,
                        supplierId: zoneData.supplierId || 'SUP-001',
                        pincodes: pincodeArr,
                        deliveryCharges: Number(zoneData.deliveryCharges) || 0,
                        minOrderValue: Number(zoneData.minOrderValue) || 0,
                        supplierPlatformMultiplier: Number(zoneData.supplierPlatformMultiplier) || 0,
                        platformFeeMode: zoneData.platformFeeMode || 'DEFAULT',
                        platformFeeValue: Number(zoneData.platformFeeValue) || 0,
                        minSupplierPlatformFee: Number(zoneData.minSupplierPlatformFee) || 0,
                        maxSupplierPlatformFee: zoneData.maxSupplierPlatformFee ? Number(zoneData.maxSupplierPlatformFee) : null,
                        isActive: zoneData.isActive !== undefined ? zoneData.isActive : true
                    });

                    await newZone.save();
                    results.created++;
                } catch (err) {
                    results.errors++;
                }
            }

            res.status(200).json({
                message: `Bulk upload complete. Created: ${results.created}, Skipped (duplicates): ${results.skipped}, Errors: ${results.errors}`,
                results
            });
        } catch (error) {
            res.status(httpStatusForError(error)).json({ message: error.message });
        }
    }
};
