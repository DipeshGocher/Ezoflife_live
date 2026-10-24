import { filterCondition, textFilter, priceFilter } from '../utils/queryFilters.js';
import VendorMasterSupply from '../models/VendorMasterSupply.js';
import VendorSupplyCategory from '../models/VendorSupplyCategory.js';
import SupplierApplication from '../models/SupplierApplication.js';
import SupplierServiceZone from '../models/SupplierServiceZone.js';
import ServiceArea from '../models/ServiceArea.js';
import fs from 'fs';
import { httpStatusForError } from '../utils/errorResponse.js';
import SystemConfig from '../models/SystemConfig.js';
import User from '../models/User.js';
import { describeFeeRule, loadGlobalFeeConfig, resolveFeeRule } from '../utils/b2bPlatformFee.js';

const logToFile = (msg) => {
    try {
        fs.appendFileSync('./REAL_USER_DEBUG.log', `[CONTROLLER_DEBUG] ${new Date().toISOString()} - ${msg}\n`);
    } catch (e) {}
};

// Helper to generate SKU ID
const generateSkuId = (categoryDoc, serialNumber) => {
    const prefix1 = "spz";
    const prefix2 = "sup";
    
    let catPart = "cat";
    if (categoryDoc && categoryDoc.mainCategory) {
        catPart = categoryDoc.mainCategory.trim().replace(/[^a-zA-Z\s]/g, '').slice(0, 3).toLowerCase();
        if (!catPart) catPart = "cat";
    }
    
    let subPart = "sub";
    if (categoryDoc && categoryDoc.subCategory) {
        const words = categoryDoc.subCategory.trim().replace(/[^a-zA-Z\s]/g, '').split(/\s+/).filter(Boolean);
        if (words.length >= 2) {
            subPart = (words[0][0] + words[1][0]).toLowerCase();
        } else if (words.length === 1) {
            subPart = words[0].slice(0, 2).toLowerCase();
        }
        if (!subPart) subPart = "sub";
    }
    
    const serialStr = String(serialNumber).padStart(3, '0');
    return `${prefix1}-${prefix2}-${catPart}-${subPart}-${serialStr}`.toUpperCase();
};

const populateDeliveryFrequencies = async (supplies) => {
    logToFile(`populateDeliveryFrequencies processing ${supplies.length} items`);
    const transformed = [];
    const globalFeeConfig = await loadGlobalFeeConfig(SystemConfig);
    for (const supply of supplies) {
        const supplyObj = supply.toObject();
        supplyObj.zoneName = '-';
        
        logToFile(`supplyObj details: ID=${supplyObj._id}, supplierId=${supplyObj.supplierId}, supplierFacilityName=${supplyObj.supplierFacilityName}`);
        let hasMasterProduct = false;
        if (supplyObj.supplierId && supplyObj.supplierId !== '-') {
            // Check if there is an admin template with the same materialName
            const templateItem = await VendorMasterSupply.findOne({ 
                materialName: { $regex: new RegExp(`^${supplyObj.materialName.trim()}$`, 'i') }, 
                supplierId: '-' 
            });

            if (templateItem) {
                // If it is template-based, approve/reject buttons are directly available
                hasMasterProduct = true;
                
                // Fallback images & description from template if empty
                if (!supplyObj.images || supplyObj.images.length === 0) {
                    supplyObj.images = templateItem.images || [];
                }
                if (!supplyObj.description || supplyObj.description.trim() === '') {
                    supplyObj.description = templateItem.description || '';
                }
            } else {
                // For completely new products, require category to be active first
                if (supplyObj.categoryId && supplyObj.categoryId.isActive === true) {
                    hasMasterProduct = true;
                }
            }
        } else {
            hasMasterProduct = true;
        }
        supplyObj.hasMasterProduct = hasMasterProduct;

        if (supplyObj.supplierId && supplyObj.supplierId !== '-') {

            const zone = await SupplierServiceZone.findOne({ supplierId: supplyObj.supplierId });
            if (zone) {
                supplyObj.zoneName = zone.zoneName;
                supplyObj.minSupplierPlatformFee = zone.minSupplierPlatformFee || 0;
                supplyObj.maxSupplierPlatformFee = zone.maxSupplierPlatformFee || null;
            } else {
                supplyObj.minSupplierPlatformFee = 0;
                supplyObj.maxSupplierPlatformFee = null;
            }
            supplyObj.platformFeeRule = resolveFeeRule(zone, globalFeeConfig);
            supplyObj.platformFeeLabel = describeFeeRule(supplyObj.platformFeeRule);

            if (supplyObj.supplierFacilityName && supplyObj.supplierFacilityName !== '-') {
                const app = await SupplierApplication.findOne({ registeredBusinessName: supplyObj.supplierFacilityName });
                logToFile(`found app: ${app ? JSON.stringify({ id: app._id, registeredBusinessName: app.registeredBusinessName, deliveryFrequency: app.deliveryFrequency }) : 'null'}`);
                if (app && app.deliveryFrequency && app.deliveryFrequency.length > 0) {
                    supplyObj.deliveryFrequency = app.deliveryFrequency.join(', ');
                }
            }
        }
        transformed.push(supplyObj);
    }
    return transformed;
};

/**
 * Admins manage every product; a supplier only the products listed under their
 * own code (SUP-<last 4 phone digits>, the same code My Supplies files them under).
 */
const canManageSupply = async (req, supply) => {
    if (req.user?.role === 'Admin') return true;
    if (req.user?.role !== 'Supplier') return false;
    const supplier = await User.findById(req.user.id).select('phone').lean();
    const phone = String(supplier?.phone || '');
    return Boolean(phone) && supply.supplierId === `SUP-${phone.slice(-4)}`;
};

export const vendorMasterSupplyController = {
    create: async (req, res) => {
        try {
            const { 
                materialName, categoryId, categoryName, subCategoryName, hsnCode, gst, brand, quantity, 
                wholesaleRate, costPrice, bulkDiscount, bulkThreshold, isActive,
                deliveryFrequency, movFreeDelivery, supplierId, supplierFacilityName,
                description, images
            } = req.body;
            
            // 1. Fetch or create category
            let category = null;
            if (categoryId) {
                category = await VendorSupplyCategory.findById(categoryId);
            } else if (categoryName && subCategoryName) {
                const mainCat = categoryName.trim();
                const subCat = subCategoryName.trim();
                
                category = await VendorSupplyCategory.findOne({
                    mainCategory: { $regex: new RegExp(`^${mainCat}$`, 'i') },
                    subCategory: { $regex: new RegExp(`^${subCat}$`, 'i') }
                });
                
                if (!category) {
                    const lastCategory = await VendorSupplyCategory.findOne({ excelCategoryId: { $ne: null } }).sort({ excelCategoryId: -1 });
                    const nextId = (lastCategory?.excelCategoryId || 0) + 1;
                    category = new VendorSupplyCategory({
                        mainCategory: mainCat,
                        subCategory: subCat,
                        excelCategoryId: nextId,
                        isActive: false
                    });
                    await category.save();
                }
            }

            if (!category) {
                return res.status(404).json({ message: 'Selected Category does not exist and no categoryName/subCategoryName provided' });
            }

            // 2. Determine serial number
            const lastSupply = await VendorMasterSupply.findOne().sort({ serialNumber: -1 });
            const nextSerial = (lastSupply?.serialNumber || 0) + 1;

            // 3. Generate SKU ID
            const skuId = generateSkuId(category, nextSerial);

            const supply = new VendorMasterSupply({
                skuId,
                categoryId: category._id,
                hsnCode,
                gst,
                brand,
                materialName,
                quantity,
                wholesaleRate,
                costPrice: Number(costPrice) || 0,
                bulkDiscount,
                bulkThreshold,
                isActive: isActive || 'y',
                approvalStatus: supplierId === '-' ? 'Approved' : 'Pending',
                deliveryFrequency,
                movFreeDelivery,
                supplierId,
                supplierFacilityName,
                serialNumber: nextSerial,
                description: description || '',
                images: images || []
            });

            await supply.save();
            res.status(201).json(supply);
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    getUniqueFilters: async (req, res) => {
        try {
            const supplierIds = await VendorMasterSupply.distinct('supplierId');
            const dbDeliveryFrequencies = await VendorMasterSupply.distinct('deliveryFrequency');
            const appDeliveryFrequencies = await SupplierApplication.distinct('deliveryFrequency');
            
            const allFrequencies = [...new Set([...dbDeliveryFrequencies, ...appDeliveryFrequencies])];
            
            const cleanSupplierIds = supplierIds.filter(id => id && id !== '-');
            const cleanDeliveryFrequencies = allFrequencies.filter(df => df && df !== '-');

            return res.json({
                supplierIds: cleanSupplierIds.sort(),
                deliveryFrequencies: cleanDeliveryFrequencies.sort()
            });
        } catch (error) {
            console.error('Get Unique Filters Error:', error);
            res.status(500).json({ message: 'Failed to fetch unique filters', error: error.message });
        }
    },

    getAll: async (req, res) => {
        try {
            const { page, limit, materialName, categoryId, isActive, brand, supplierId, isTemplate, deliveryFrequency, wholesaleRate, approvalStatus } = req.query;
            
            let query = {};
            if (approvalStatus) {
                query.approvalStatus = approvalStatus;
            }
            if (materialName) {
                query.materialName = { $regex: materialName, $options: 'i' };
            }
            if (brand) {
                query.brand = { $regex: brand, $options: 'i' };
            }
            if (supplierId) {
                if (supplierId === '-') {
                    query.supplierId = '-';
                } else {
                    query.supplierId = textFilter(supplierId);
                }
            }
            if (categoryId) {
                query.categoryId = filterCondition(categoryId);
            }
            if (isActive !== undefined && isActive !== '') {
                query.isActive = filterCondition(isActive);
            }
            if (deliveryFrequency) {
                const matchingApps = await SupplierApplication.find({
                    deliveryFrequency: textFilter(deliveryFrequency)
                });
                const appNames = matchingApps.map(app => app.registeredBusinessName);
                
                query.$or = [
                    { deliveryFrequency: textFilter(deliveryFrequency) },
                    { supplierFacilityName: { $in: appNames } }
                ];
            }
            if (wholesaleRate) {
                query.$and = [...(query.$and || []), priceFilter(wholesaleRate)];
            }
            if (isTemplate === 'y') {
                query.supplierId = '-';
            } else if (isTemplate === 'n') {
                if (!supplierId) {
                    query.supplierId = { $ne: '-' };
                }
            }

            if (page && limit) {
                const pageNumber = parseInt(page, 10);
                const limitNumber = parseInt(limit, 10);
                const skip = (pageNumber - 1) * limitNumber;

                const total = await VendorMasterSupply.countDocuments(query);
                const supplies = await VendorMasterSupply.find(query)
                    .populate('categoryId')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limitNumber);

                const populated = await populateDeliveryFrequencies(supplies);

                return res.json({
                    data: populated,
                    pagination: {
                        total,
                        page: pageNumber,
                        limit: limitNumber,
                        totalPages: Math.ceil(total / limitNumber)
                    }
                });
            }

            const supplies = await VendorMasterSupply.find(query)
                .populate('categoryId')
                .sort({ createdAt: -1 });

            const populated = await populateDeliveryFrequencies(supplies);
            res.json(populated);
        } catch (error) {
            res.status(httpStatusForError(error)).json({ message: error.message });
        }
    },

    getMyCosts: async (req, res) => {
        try {
            if (!['Supplier', 'Admin'].includes(req.user?.role)) {
                return res.status(403).json({ message: 'Only suppliers can view product costs' });
            }
            let supplierCode = req.query.supplierId;
            if (req.user.role === 'Supplier') {
                const supplier = await User.findById(req.user.id).select('phone role');
                if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
                supplierCode = `SUP-${String(supplier.phone || '').slice(-4)}`;
            }
            if (!supplierCode || supplierCode === '-') return res.json([]);
            const rows = await VendorMasterSupply.find({ supplierId: supplierCode }).select('+costPrice').lean();
            res.json(rows.map(row => ({ _id: row._id, costPrice: Number(row.costPrice) || 0 })));
        } catch (error) {
            res.status(httpStatusForError(error)).json({ message: error.message });
        }
    },

    update: async (req, res) => {
        try {
            const { id } = req.params;
            const { 
                materialName, categoryId, hsnCode, gst, brand, quantity, 
                wholesaleRate, costPrice, bulkDiscount, bulkThreshold, isActive,
                approvalStatus, adminMessage,
                deliveryFrequency, movFreeDelivery, supplierId, supplierFacilityName,
                description, images
            } = req.body;

            const existing = await VendorMasterSupply.findById(id);
            if (!existing) {
                return res.status(404).json({ message: 'Supply item not found' });
            }
            if (!(await canManageSupply(req, existing))) {
                return res.status(403).json({ message: 'You can only edit your own products' });
            }

            const updates = { 
                materialName, hsnCode, gst, brand, quantity, 
                wholesaleRate, costPrice, bulkDiscount, bulkThreshold, isActive,
                approvalStatus, adminMessage,
                deliveryFrequency, movFreeDelivery, supplierId, supplierFacilityName,
                description, images
            };
            if (req.user?.role !== 'Admin') {
                // Suppliers can't approve their own edits or hand the product to someone else.
                updates.approvalStatus = 'Pending';
                delete updates.adminMessage;
                delete updates.supplierId;
            }

            // If category changed, update skuId
            if (categoryId && categoryId !== String(existing.categoryId)) {
                const category = await VendorSupplyCategory.findById(categoryId);
                if (!category) {
                    return res.status(404).json({ message: 'Selected Category does not exist' });
                }
                updates.categoryId = categoryId;
                updates.skuId = generateSkuId(category, existing.serialNumber);
            }

            const updated = await VendorMasterSupply.findByIdAndUpdate(id, updates, { new: true }).populate('categoryId');
            res.json(updated);
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    delete: async (req, res) => {
        try {
            const { id } = req.params;
            const existing = await VendorMasterSupply.findById(id);
            if (!existing) {
                return res.status(404).json({ message: 'Supply item not found' });
            }
            if (!(await canManageSupply(req, existing))) {
                return res.status(403).json({ message: 'You can only delete your own products' });
            }
            await VendorMasterSupply.findByIdAndDelete(id);
            res.json({ message: 'Supply item deleted successfully' });
        } catch (error) {
            res.status(httpStatusForError(error)).json({ message: error.message });
        }
    },

    clearAll: async (req, res) => {
        try {
            await VendorMasterSupply.deleteMany({});
            res.json({ message: 'All supply items cleared successfully' });
        } catch (error) {
            res.status(httpStatusForError(error)).json({ message: error.message });
        }
    },

    bulkUpload: async (req, res) => {
        try {
            const items = req.body; // Array of items
            if (!Array.isArray(items)) {
                return res.status(400).json({ message: 'Payload must be an array' });
            }

            const results = {
                created: 0,
                skipped: 0,
                errors: 0
            };

            const lastSupply = await VendorMasterSupply.findOne().sort({ serialNumber: -1 });
            let currentSerial = (lastSupply?.serialNumber || 0);

            for (const itemData of items) {
                try {
                    // Find category matching categoryName + subCategoryName OR categoryId
                    let category = null;
                    if (itemData.categoryId) {
                        category = await VendorSupplyCategory.findById(itemData.categoryId);
                    } else if (itemData.mainCategory && itemData.subCategory) {
                        category = await VendorSupplyCategory.findOne({
                            mainCategory: { $regex: new RegExp(`^${itemData.mainCategory}$`, 'i') },
                            subCategory: { $regex: new RegExp(`^${itemData.subCategory}$`, 'i') }
                        });
                    }

                    if (!category) {
                        results.errors++;
                        continue;
                    }

                    // Check for duplicate materialName under same category
                    const exists = await VendorMasterSupply.findOne({
                        materialName: { $regex: new RegExp(`^${itemData.materialName}$`, 'i') },
                        categoryId: category._id
                    });

                    if (exists) {
                        results.skipped++;
                        continue;
                    }

                    currentSerial++;
                    const skuId = generateSkuId(category, currentSerial);

                    let itemIsActive = 'y';
                    if (itemData.isActive !== undefined) {
                        const actStr = String(itemData.isActive).toLowerCase();
                        if (actStr === 'n' || actStr === 'false' || actStr === 'inactive') {
                            itemIsActive = 'n';
                        }
                    }

                    const newSupply = new VendorMasterSupply({
                        skuId,
                        categoryId: category._id,
                        hsnCode: itemData.hsnCode || '2800',
                        gst: Number(itemData.gst) || 18,
                        brand: itemData.brand || 'Generic',
                        materialName: itemData.materialName,
                        quantity: itemData.quantity || '1 Unit',
                        wholesaleRate: Number(itemData.wholesaleRate) || 0,
                        bulkDiscount: Number(itemData.bulkDiscount) || 0,
                        bulkThreshold: Number(itemData.bulkThreshold) || 0,
                        isActive: itemIsActive,
                        deliveryFrequency: itemData.deliveryFrequency || 'Weekly',
                        movFreeDelivery: Number(itemData.movFreeDelivery) || 0,
                        supplierId: itemData.supplierId || 'SUP-001',
                        supplierFacilityName: itemData.supplierFacilityName || 'Main Facility',
                        serialNumber: currentSerial
                    });

                    await newSupply.save();
                    results.created++;
                } catch (err) {
                    console.error('Bulk row error:', err);
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
    },

    getLiveCatalog: async (req, res) => {
        try {
            const { vendorId } = req.query;
            if (!vendorId) {
                return res.status(400).json({ message: 'vendorId is required' });
            }

            // 1. Find the Vendor User
            const User = (await import('../models/User.js')).default;
            const vendor = await User.findById(vendorId);
            if (!vendor) {
                return res.status(404).json({ message: 'Vendor not found' });
            }

            // 2. Resolve matching pincodes based on coordinates/geofence/address
            const matchingPincodes = [];
            const rawPincode = vendor.shopDetails?.pincode || vendor.pincode || vendor.supplierDetails?.pincode;
            if (rawPincode) {
                matchingPincodes.push(String(rawPincode).trim());
            }

            // Extract 6-digit pincode from address strings if pincode field is missing
            if (matchingPincodes.length === 0) {
                const fullAddr = `${vendor.address || ''} ${vendor.shopDetails?.address || ''} ${vendor.businessAddress || ''}`;
                const pinMatch = fullAddr.match(/\b[1-9][0-9]{5}\b/);
                if (pinMatch) {
                    matchingPincodes.push(pinMatch[0]);
                }
            }

            const vLat = Number(vendor.location?.lat || 0);
            const vLng = Number(vendor.location?.lng || 0);

            if (vLat && vLng) {
                const ServiceArea = (await import('../models/ServiceArea.js')).default;
                const serviceArea = await ServiceArea.findOne({
                    isActive: true,
                    boundary: {
                        $geoIntersects: {
                            $geometry: {
                                type: 'Point',
                                coordinates: [vLng, vLat] // [lng, lat]
                            }
                        }
                    }
                });

                if (serviceArea && serviceArea.pincodes && serviceArea.pincodes.length > 0) {
                    serviceArea.pincodes.forEach(pin => {
                        if (!matchingPincodes.includes(String(pin).trim())) {
                            matchingPincodes.push(String(pin).trim());
                        }
                    });
                }
            }

            // 3. Find active Supplier Service Zones
            const SupplierServiceZone = (await import('../models/SupplierServiceZone.js')).default;
            let zoneQuery = { isActive: true };
            if (matchingPincodes.length > 0) {
                zoneQuery.pincodes = { $in: matchingPincodes };
            }

            const zones = await SupplierServiceZone.find(zoneQuery);

            // Extract supplierIds and map their delivery settings
            let supplierIds = zones.map(z => z.supplierId);
            const supplierZoneMap = {};
            const globalFeeConfig = await loadGlobalFeeConfig(SystemConfig);
            const vendorPin = matchingPincodes[0] || null;
            zones.forEach(z => {
                // Same zone preference as order placement: the zone serving the vendor's own pincode wins.
                const existing = supplierZoneMap[z.supplierId];
                if (existing && existing.servesVendorPin) return;
                supplierZoneMap[z.supplierId] = {
                    minOrderValue: z.minOrderValue || 0,
                    deliveryCharges: z.deliveryCharges || 0,
                    platformFeeRule: resolveFeeRule(z, globalFeeConfig),
                    servesVendorPin: Boolean(vendorPin && (z.pincodes || []).map(String).includes(String(vendorPin)))
                };
            });
            const noZoneFeeRule = resolveFeeRule(null, globalFeeConfig);

            // 4. Find all active supplies in VendorMasterSupply
            const query = {
                isActive: 'y',
                approvalStatus: { $in: ['Approved', null, undefined] }
            };

            if (supplierIds.length > 0) {
                query.supplierId = { $in: supplierIds };
            }

            const supplies = await VendorMasterSupply.find(query)
                .populate('categoryId')
                .sort({ createdAt: -1 });

            const populated = await populateDeliveryFrequencies(supplies);
            
            // Build a map to resolve the actual Supplier User info (for their displayNames)
            const suppliers = await User.find({ role: 'Supplier' });
            const supplierUserMap = {};
            suppliers.forEach(s => {
                if (s.phone) {
                    const suffix = s.phone.slice(-4);
                    supplierUserMap[`SUP-${suffix}`] = s;
                }
            });

            const SupplierApplication = (await import('../models/SupplierApplication.js')).default;
            const supplierApps = await SupplierApplication.find({});
            const supplierAppMap = {};
            supplierApps.forEach(app => {
                if (app.user) {
                    supplierAppMap[app.user.toString()] = app;
                }
            });

            const { calculateNextDeliveryDateForSupplier } = await import('../utils/cycleHelper.js');

            // Format items to match frontend expectation
            const formatted = populated.map(item => {
                const supplierUserObj = supplierUserMap[item.supplierId];
                const supplierAppObj = supplierUserObj ? supplierAppMap[supplierUserObj._id.toString()] : null;
                const nextDelivDateObj = calculateNextDeliveryDateForSupplier(supplierAppObj);
                const nextDeliveryDateString = nextDelivDateObj ? nextDelivDateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'On-Demand';

                const gst = item.gst || 18;
                const basePrice = Math.round((item.wholesaleRate + (item.wholesaleRate * gst / 100)) * 100) / 100;
                // The platform fee is charged once per supplier order at checkout,
                // not baked into the unit price.
                const platformFeeRule = supplierZoneMap[item.supplierId]?.platformFeeRule || noZoneFeeRule;
                
                return {
                    _id: item._id,
                    skuId: item.skuId,
                    hsnCode: item.hsnCode,
                    name: item.materialName,
                    price: basePrice,
                    basePrice: basePrice,
                    wholesaleRate: item.wholesaleRate,
                    gst: gst,
                    platformFeeRule,
                    platformFeeLabel: describeFeeRule(platformFeeRule),
                    category: item.categoryId?.mainCategory || 'Other',
                    subCategory: item.categoryId?.subCategory || 'General',
                    brand: item.brand || 'Generic',
                    description: item.description || '',
                    quantity: item.quantity || '1 Unit',
                    supplierId: item.supplierId,
                    supplierFacilityName: supplierUserObj?.displayName || item.supplierFacilityName || item.supplierId,
                    supplierPhone: supplierUserObj?.phone || '',
                    stock: 'Available',
                    image: null,
                    images: item.images || [],
                    deliveryFrequency: item.deliveryFrequency || 'On-Demand',
                    nextDeliveryDate: nextDeliveryDateString,
                    movFreeDelivery: (item.movFreeDelivery !== undefined && item.movFreeDelivery !== null && Number(item.movFreeDelivery) > 0)
                        ? Number(item.movFreeDelivery)
                        : (Number(supplierZoneMap[item.supplierId]?.minOrderValue) || 0),
                    deliveryCharges: (supplierZoneMap[item.supplierId]?.deliveryCharges !== undefined && Number(supplierZoneMap[item.supplierId]?.deliveryCharges) > 0)
                        ? Number(supplierZoneMap[item.supplierId]?.deliveryCharges)
                        : ((item.deliveryCharges !== undefined && Number(item.deliveryCharges) > 0)
                            ? Number(item.deliveryCharges)
                            : (Number(item.movFreeDelivery) > 0 ? 50 : 0)),
                    bulkDiscount: item.bulkDiscount || 0,
                    bulkThreshold: item.bulkThreshold || 0,
                    createdAt: item.createdAt,
                    updatedAt: item.updatedAt
                };
            });

            res.json(formatted);
        } catch (error) {
            console.error('Error in getLiveCatalog:', error);
            res.status(httpStatusForError(error)).json({ message: error.message });
        }
    }
};
