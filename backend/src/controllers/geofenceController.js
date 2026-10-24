import { filterCondition, textFilter } from '../utils/queryFilters.js';
import ServiceArea from '../models/ServiceArea.js';
import PincodeMapping from '../models/PincodeMapping.js';
import { masterPricingService } from '../services/masterPricingService.js';
import fs from 'fs';

const debugLog = (msg) => {
    try {
        fs.appendFileSync('./REAL_USER_DEBUG.log', `${new Date().toISOString()} - [DEBUG_GEOFENCE] ${msg}\n`);
    } catch (e) {}
};

// Admin: Get all pincode mappings
export const getPincodeMappings = async (req, res) => {
    try {
        const { page, limit } = req.query;

        if (page && limit) {
            const pageNumber = parseInt(page, 10);
            const limitNumber = parseInt(limit, 10);
            const skip = (pageNumber - 1) * limitNumber;

            const total = await PincodeMapping.countDocuments();
            const mappings = await PincodeMapping.find()
                .sort({ mappingId: 1 })
                .skip(skip)
                .limit(limitNumber);

            return res.status(200).json({
                data: mappings,
                pagination: {
                    total,
                    page: pageNumber,
                    limit: limitNumber,
                    totalPages: Math.ceil(total / limitNumber)
                }
            });
        }

        const mappings = await PincodeMapping.find().sort({ mappingId: 1 });
        res.status(200).json(mappings);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Admin: Create a new service area
export const createServiceArea = async (req, res) => {
    try {
        const { 
            name, // Frontend sends 'name' instead of 'areaName' sometimes
            areaName, 
            city, 
            coordinates, 
            color, 
            multiplier, 
            minimumOrderValue,
            dynamicSurgeMultiplier,
            basePriceMultiplier,
            discountPriceMultiplier,
            heritageMultiplier,
            isActive,
            pincodes,
            allowDiscount,
            platformMultiplier,
            minPlatformFee,
            maxPlatformFee
        } = req.body;

        // Validation
        if (!(name || areaName) || !coordinates || !Array.isArray(coordinates)) {
            return res.status(400).json({ message: 'Missing required fields or invalid coordinates' });
        }

        // Auto-generate excelFenceId (Starts from 1, 2, 3...)
        const lastArea = await ServiceArea.findOne({ excelFenceId: { $ne: null } }).sort({ excelFenceId: -1 });
        const nextId = (lastArea?.excelFenceId || 0) + 1;

        const newArea = new ServiceArea({
            areaName: name || areaName,
            city: city || 'Indore',
            boundary: {
                type: 'Polygon',
                coordinates: [coordinates] 
            },
            color,
            multiplier: multiplier || basePriceMultiplier || 1.0,
            minimumOrderValue: minimumOrderValue || 0,
            dynamicSurgeMultiplier: dynamicSurgeMultiplier || 1.0,
            basePriceMultiplier: basePriceMultiplier || 1.0,
            discountPriceMultiplier: discountPriceMultiplier || 1.0,
            heritageMultiplier: heritageMultiplier || 1.0,
            isActive: isActive !== undefined ? isActive : true,
            pincodes: pincodes || [],
            excelFenceId: nextId,
            allowDiscount: allowDiscount !== undefined ? allowDiscount : true,
            platformMultiplier: platformMultiplier || 1.0,
            minPlatformFee: minPlatformFee || 0,
            maxPlatformFee: maxPlatformFee || null
        });

        await newArea.save();

        // Auto-sync master pricing entries for this new zone!
        try {
            await masterPricingService.syncAreaWithServices(newArea._id);
            console.log(`✅ [AUTO_SYNC] Master pricing synced for new area: ${newArea.areaName}`);
        } catch (syncErr) {
            console.error('Auto Sync master pricing failed on creation:', syncErr);
        }

        res.status(201).json(newArea);
    } catch (err) {
        console.error('Create Service Area Error:', err);
        res.status(500).json({ message: err.message });
    }
};

// Admin: Get all service areas
export const getAllServiceAreas = async (req, res) => {
    try {
        debugLog(`req.query: ${JSON.stringify(req.query)}`);
        const query = {};
        
        if (req.query.areaName) {
            query.areaName = textFilter(req.query.areaName);
        }

        const parseMultiplier = val => {
            if (!val) return undefined;
            return filterCondition(val, item => {
                const number = Number(String(item).trim().toLowerCase().replace(/x$/, '').trim());
                return Number.isNaN(number) ? -1 : number;
            });
        };

        const baseVal = parseMultiplier(req.query.basePriceMultiplier);
        if (baseVal !== undefined) {
            query.basePriceMultiplier = baseVal;
        }

        const dynamicVal = parseMultiplier(req.query.dynamicSurgeMultiplier);
        if (dynamicVal !== undefined) {
            query.dynamicSurgeMultiplier = dynamicVal;
        }

        const heritageVal = parseMultiplier(req.query.heritageMultiplier);
        if (heritageVal !== undefined) {
            query.heritageMultiplier = heritageVal;
        }

        const discountVal = parseMultiplier(req.query.discountPriceMultiplier);
        if (discountVal !== undefined) {
            query.discountPriceMultiplier = discountVal;
        }

        debugLog(`Built Mongoose query: ${JSON.stringify(query)}`);
        const areas = await ServiceArea.find(query).sort({ createdAt: -1 });
        debugLog(`Fetched ${areas.length} areas. Data: ${JSON.stringify(areas)}`);
        res.status(200).json(areas);
    } catch (err) {
        debugLog(`Error in getAllServiceAreas: ${err.message}`);
        res.status(500).json({ message: err.message });
    }
};

// Admin: Update service area
export const updateServiceArea = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (updates.name) {
            updates.areaName = updates.name;
            delete updates.name;
        }

        if (updates.coordinates) {
            updates.boundary = {
                type: 'Polygon',
                coordinates: [updates.coordinates]
            };
            delete updates.coordinates;
        }

        // Ensure every zone has an excelFenceId
        const existing = await ServiceArea.findById(id);
        if (existing && !existing.excelFenceId) {
            const lastArea = await ServiceArea.findOne().sort({ excelFenceId: -1 });
            updates.excelFenceId = (lastArea?.excelFenceId || 0) + 1;
        }

        if (updates.basePriceMultiplier !== undefined) {
            updates.multiplier = updates.basePriceMultiplier;
        }

        const updatedArea = await ServiceArea.findByIdAndUpdate(id, updates, { new: true });
        if (!updatedArea) return res.status(404).json({ message: 'Area not found' });

        // Auto-sync master pricing entries for this updated zone!
        try {
            await masterPricingService.syncAreaWithServices(updatedArea._id);
            console.log(`✅ [AUTO_SYNC] Master pricing synced for updated area: ${updatedArea.areaName}`);
        } catch (syncErr) {
            console.error('Auto Sync master pricing failed on update:', syncErr);
        }

        res.status(200).json(updatedArea);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Admin: Delete service area
export const deleteServiceArea = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await ServiceArea.findByIdAndDelete(id);
        if (!deleted) return res.status(404).json({ message: 'Area not found' });
        res.status(200).json({ message: 'Service area deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Public/Customer: Check availability and get zone details
export const checkLocationAvailability = async (req, res) => {
    try {
        const { lat, lng } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({ message: 'Latitude and Longitude are required' });
        }

        // Geospatial Query: Point-in-Polygon
        const area = await ServiceArea.findOne({
            isActive: true,
            boundary: {
                $geoIntersects: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [parseFloat(lng), parseFloat(lat)] // [lng, lat]
                    }
                }
            }
        });

        if (!area) {
            return res.status(200).json({ 
                available: false, 
                message: 'Sorry, we do not serve this location yet.' 
            });
        }

        res.status(200).json({
            available: true,
            areaId: area._id,
            name: area.areaName,
            pricingFactor: area.basePriceMultiplier || area.multiplier || 1.0,
            minimumOrderValue: area.minimumOrderValue,
            allowDiscount: area.allowDiscount !== false,
            platformMultiplier: area.platformMultiplier !== undefined ? area.platformMultiplier : 0,
            expressMultiplier: area.dynamicSurgeMultiplier !== undefined ? area.dynamicSurgeMultiplier : 1.0,
            heritageMultiplier: area.heritageMultiplier !== undefined ? area.heritageMultiplier : 1.0,
            minPlatformFee: area.minPlatformFee || 0,
            maxPlatformFee: area.maxPlatformFee || null,
            freeDeliveryThreshold: area.freeDeliveryThreshold !== undefined ? area.freeDeliveryThreshold : 500
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
