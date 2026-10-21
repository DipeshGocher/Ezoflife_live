import { getGstConfigs } from '../utils/gstInvoiceHelper.js';
import MasterService from '../models/MasterService.js';
import ServiceArea from '../models/ServiceArea.js';
import AreaServiceOverride from '../models/AreaServiceOverride.js';
import mongoose from 'mongoose';

export const createMasterService = async (req, res) => {
    try {
        const { 
            itemName, categoryId, basePrice, discountedPrice, unit, description, 
            isActive, icon, tier, excelCategoryId, curr_ind, allowDiscount, gst, sacCode, estimateTAT, avgWeight 
        } = req.body;
        
        const exists = await MasterService.findOne({ itemName });
        if (exists) return res.status(400).json({ message: 'Service already exists' });

        // 1. Fetch Category details for SKU components
        const Category = (await import('../models/Category.js')).default;
        const category = await Category.findById(categoryId);
        if (!category) return res.status(400).json({ message: 'Invalid category' });

        // 2. Build SKU components
        const prefix = "SPZ";
        const catCode = category.mainCategory.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '');
        const subCatCode = category.subCategory.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '');
        const itemCode = itemName.substring(0, 5).toUpperCase().replace(/[^A-Z0-9]/g, '');

        // 3. Find latest sequence for this Category/Subcategory combination
        const catSubPrefix = `${prefix}-${catCode}-${subCatCode}`;
        const servicesInCatSub = await MasterService.find({ skuId: new RegExp(`^${catSubPrefix}-`) });
        
        let sequence = 0;
        if (servicesInCatSub.length > 0) {
            let maxSeq = -1;
            servicesInCatSub.forEach(s => {
                if (s.skuId) {
                    const parts = s.skuId.split('-');
                    const seq = parseInt(parts[parts.length - 1]);
                    if (!isNaN(seq) && seq > maxSeq) {
                        maxSeq = seq;
                    }
                }
            });
            if (maxSeq !== -1) {
                sequence = maxSeq + 1;
            }
        }

        const formattedSeq = sequence.toString().padStart(3, '0');
        const finalSkuId = `${catSubPrefix}-${itemCode}-${formattedSeq}`;

        const gstConfig = await getGstConfigs();
        const configuredGst = gst == null || gst === '' ? gstConfig.gstPercent : Number(gst);
        const heritageRate = req.body.heritageGst == null || req.body.heritageGst === '' ? configuredGst : Number(req.body.heritageGst);
        if (![configuredGst, heritageRate].every(rate => Number.isFinite(rate) && rate >= 0 && rate <= 100)) return res.status(400).json({ message: 'GST rates must be between 0 and 100' });
        const service = new MasterService({ 
            itemName, 
            categoryId, 
            basePrice, 
            discountedPrice, 
            unit, 
            description, 
            isActive, 
            icon, 
            tier, 
            skuId: finalSkuId,
            excelCategoryId: excelCategoryId || category.excelCategoryId,
            curr_ind: curr_ind || 'y',
            allowDiscount: allowDiscount !== undefined ? allowDiscount : true,
            gst: configuredGst,
            heritageGst: heritageRate,
            sacCode: sacCode || '9994',
            estimateTAT: estimateTAT || '48 Hours',
            avgWeight: avgWeight || '0.5'
        });

        await service.save();

        // Auto-sync all areas with the new master service so that active vendors are notified
        try {
            const { masterPricingService } = await import('../services/masterPricingService.js');
            const allAreas = await ServiceArea.find();
            for (const area of allAreas) {
                await masterPricingService.syncAreaWithServices(area._id);
            }
            console.log(`✅ [AUTO_SYNC] Successfully synced new service "${itemName}" to all areas`);
        } catch (syncErr) {
            console.error('❌ [AUTO_SYNC] Failed to auto-sync new service to areas:', syncErr);
        }

        res.status(201).json(service);
    } catch (err) {
        console.error('Create Master Service Error:', err);
        res.status(500).json({ message: err.message });
    }
};

export const getAllMasterServices = async (req, res) => {
    try {
        const { serviceType, page, limit, activeOnly } = req.query;
        let query = {};
        if (serviceType) {
            query.serviceType = serviceType === 'individual' ? 'normal' : serviceType;
        }

        if (activeOnly === 'true') {
            query.curr_ind = 'y';
            query.isActive = true;
        }

        if (page && limit) {
            const pageNumber = parseInt(page, 10);
            const limitNumber = parseInt(limit, 10);
            const skip = (pageNumber - 1) * limitNumber;

            const total = await MasterService.countDocuments(query);
            const services = await MasterService.find(query)
                .populate('categoryId')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNumber)
                .lean();

            return res.status(200).json({
                data: services,
                pagination: {
                    total,
                    page: pageNumber,
                    limit: limitNumber,
                    totalPages: Math.ceil(total / limitNumber)
                }
            });
        }

        const services = await MasterService.find(query)
            .populate(activeOnly === 'true' ? { path: 'categoryId', match: { isActive: true } } : 'categoryId')
            .sort({ createdAt: -1 })
            .lean();
        
        const finalServices = activeOnly === 'true' ? services.filter(s => s.categoryId !== null) : services;
        
        res.status(200).json(finalServices);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const getPricingPreview = async (req, res) => {
    try {
        const { area_id, category_id, serviceType } = req.query;
        console.log('Pricing Preview Request:', { area_id, category_id, serviceType });
        if (!area_id) return res.status(400).json({ message: 'area_id is required' });

        const area = await ServiceArea.findById(area_id);
        if (!area) return res.status(404).json({ message: 'Area not found' });

        const multiplier = area.multiplier || 1.0;

        // Fetch Global Configs
        const SystemConfig = (await import('../models/SystemConfig.js')).default;
        const globalConfigs = await SystemConfig.find({
            key: { $in: [
                'essential_fee', 
                'heritage_fee',
                'normal_logistics_fee'
            ]}
        }).lean();

        const getConfig = (key, def) => {
            const found = globalConfigs.find(c => c.key === key);
            return found ? Number(found.value) : def;
        };
        
        const essentialFee = getConfig('essential_fee', 20); // default 20%
        const heritageFee = getConfig('heritage_fee', 150); // default 150%
        const logisticsFee = getConfig('normal_logistics_fee', 50); // default 50
        const { gstPercent: feeGstPercentage } = await getGstConfigs();
        let query = { isActive: true };
        if (serviceType) {
            query.serviceType = serviceType === 'individual' ? 'normal' : serviceType;
        }
        if (category_id) {
            if (mongoose.Types.ObjectId.isValid(category_id)) {
                query.categoryId = category_id;
            } else {
                const Category = (await import('../models/Category.js')).default;
                const escaped = category_id.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const searchRegex = new RegExp('^' + escaped.replace(/\s+/g, '\\s+') + '$', 'i');
                const matchingCats = await Category.find({ mainCategory: searchRegex }).select('_id');
                query.categoryId = { $in: matchingCats.map(c => c._id) };
            }
        }

        const services = await MasterService.find(query).populate('categoryId').lean();
        const overrides = await AreaServiceOverride.find({ areaId: area_id }).lean();

        const preview = services.map(service => {
            const gstPercentage = (service.tier === 'Heritage' ? service.heritageGst : service.gst) ?? feeGstPercentage;
            const override = overrides.find(o => o.serviceId.toString() === service._id.toString());
            
            // Formula: {[(Vendor Rate X Aggregator Fee) + Logistics Fee] X Surcharge} + GST
            const aggregatorFeeMultiplier = (service.tier === 'Heritage' ? heritageFee : essentialFee) / 100;
            
            // Aggregated Rate = Vendor Rate (discountedPrice) * Markup
            const aggregatedRate = service.discountedPrice * (1 + aggregatorFeeMultiplier);
            
            // Subtotal = Aggregated Rate + Logistics Fee
            const subtotal = aggregatedRate + logisticsFee;
            
            // Price With Surge = Subtotal * Area Multiplier
            const priceWithSurge = subtotal * multiplier;
            
            // Final Price = Price With Surge + GST
            const gstAmount = service.discountedPrice * multiplier * gstPercentage / 100
                + (service.discountedPrice * aggregatorFeeMultiplier + logisticsFee) * multiplier * feeGstPercentage / 100;
            const finalPrice = priceWithSurge + gstAmount;

            return {
                serviceId: service._id,
                itemName: service.itemName,
                category: `${service.categoryId?.mainCategory || 'N/A'} / ${service.categoryId?.subCategory || 'N/A'}`,
                tier: service.tier,
                basePrice: service.basePrice,
                vendorRate: service.discountedPrice,
                aggregatorFee: `${service.tier === 'Heritage' ? heritageFee : essentialFee}%`,
                logisticsFee: logisticsFee,
                surge: multiplier,
                gst: `${gstPercentage}%`,
                finalPrice: Math.round(override ? override.customPrice : finalPrice),
                unit: service.unit,
                isOverride: !!override
            };
        });

        res.status(200).json(preview);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const updateMasterService = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body };
        if (updates.gst !== undefined && updates.gst !== null && updates.heritageGst === undefined) {
            updates.heritageGst = updates.gst;
        }
        const updated = await MasterService.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
        
        // Propagate updates to MasterPricing
        const MasterPricing = (await import('../models/MasterPricing.js')).default;
        const pricings = await MasterPricing.find({ serviceId: id });
        for (const p of pricings) {
            p.basePrice = updated.basePrice;
            p.discountPrice = updated.discountedPrice;
            if (updated.gst !== undefined && updated.gst !== null) {
                p.gstPercent = updated.gst;
            }
            if (updated.expressMultiplier !== undefined && updated.expressMultiplier !== null) {
                p.expressMultiplier = updated.expressMultiplier;
            }
            await p.save();
        }

        res.status(200).json(updated);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const deleteMasterService = async (req, res) => {
    try {
        const { id } = req.params;
        await MasterService.findByIdAndDelete(id);
        res.status(200).json({ message: 'Service deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const getVendorPricingReport = async (req, res) => {
    try {
        const { serviceId } = req.params;
        const User = (await import('../models/User.js')).default;
        const vendors = await User.find({ role: 'Vendor' });
        
        const report = vendors.map(v => {
            const serviceMatch = v.shopDetails?.services?.find(s => s.id?.toString() === serviceId);
            if (serviceMatch) {
                return {
                    vendorName: v.shopDetails.name || v.name,
                    phone: v.phone,
                    vendorRate: serviceMatch.vendorRate,
                    adminRate: serviceMatch.adminRate
                };
            }
            return null;
        }).filter(item => item !== null);

        res.status(200).json(report);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
