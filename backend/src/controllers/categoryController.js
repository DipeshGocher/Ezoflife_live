import { filterCondition, textFilter } from '../utils/queryFilters.js';
import Category from '../models/Category.js';

export const categoryController = {
    create: async (req, res) => {
        try {
            const { mainCategory, subCategory, image, isActive } = req.body;
            
            // Auto-generate excelCategoryId (Starts from 1, 2, 3...)
            const lastCategory = await Category.findOne({ excelCategoryId: { $ne: null } }).sort({ excelCategoryId: -1 });
            const nextId = (lastCategory?.excelCategoryId || 0) + 1;

            const category = new Category({ 
                mainCategory, 
                subCategory, 
                image, 
                isActive,
                excelCategoryId: nextId
            });
            await category.save();
            res.status(201).json(category);
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    getAll: async (req, res) => {
        try {
            const { page, limit, mainCategory, subCategory, isActive } = req.query;
            
            let query = {};
            if (mainCategory) {
                query.mainCategory = textFilter(mainCategory);
            }
            if (subCategory) {
                query.subCategory = textFilter(subCategory);
            }
            if (isActive !== undefined && isActive !== '') {
                query.isActive = filterCondition(isActive, value => String(value) === 'true');
            }

            if (page && limit) {
                const pageNumber = parseInt(page, 10);
                const limitNumber = parseInt(limit, 10);
                const skip = (pageNumber - 1) * limitNumber;

                const total = await Category.countDocuments(query);
                const categories = await Category.find(query)
                    .sort({ excelCategoryId: 1 })
                    .skip(skip)
                    .limit(limitNumber);

                return res.json({
                    data: categories,
                    pagination: {
                        total,
                        page: pageNumber,
                        limit: limitNumber,
                        totalPages: Math.ceil(total / limitNumber)
                    }
                });
            }

            const categories = await Category.find(query).sort({ excelCategoryId: 1 });
            res.json(categories);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    update: async (req, res) => {
        try {
            const { id } = req.params;
            const updates = req.body;

            // Ensure every category has an excelCategoryId
            const existing = await Category.findById(id);
            if (existing && !existing.excelCategoryId) {
                const lastCategory = await Category.findOne({ excelCategoryId: { $ne: null } }).sort({ excelCategoryId: -1 });
                updates.excelCategoryId = (lastCategory?.excelCategoryId || 0) + 1;
            }

            const category = await Category.findByIdAndUpdate(id, updates, { new: true });
            res.json(category);
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    delete: async (req, res) => {
        try {
            const { id } = req.params;

            // 1. Check if linked to Master Services
            const MasterService = (await import('../models/MasterService.js')).default;
            const linkedServicesCount = await MasterService.countDocuments({ categoryId: id });
            if (linkedServicesCount > 0) {
                return res.status(400).json({ 
                    message: `Cannot delete Category: It is currently linked to ${linkedServicesCount} active Master Service(s).` 
                });
            }

            // 2. Check if linked to Master Pricing Registry
            const MasterPricing = (await import('../models/MasterPricing.js')).default;
            const linkedPricingCount = await MasterPricing.countDocuments({ categoryId: id });
            if (linkedPricingCount > 0) {
                return res.status(400).json({ 
                    message: `Cannot delete Category: It is currently linked to ${linkedPricingCount} records in the Master Pricing Registry.` 
                });
            }

            await Category.findByIdAndDelete(id);
            res.json({ message: 'Category deleted successfully' });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    clearAll: async (req, res) => {
        try {
            await Category.deleteMany({});
            res.json({ message: 'All categories cleared successfully' });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    bulkUpload: async (req, res) => {
        try {
            const categories = req.body; // Expecting an array
            if (!Array.isArray(categories)) {
                return res.status(400).json({ message: 'Payload must be an array' });
            }

            let lastCategory = await Category.findOne({ excelCategoryId: { $ne: null } }).sort({ excelCategoryId: -1 });
            let currentId = (lastCategory?.excelCategoryId || 0);
            
            const results = {
                created: 0,
                skipped: 0,
                errors: 0
            };

            for (const catData of categories) {
                try {
                    // 1. Check for duplicates (Main + Sub combination)
                    const exists = await Category.findOne({
                        mainCategory: { $regex: new RegExp(`^${catData.mainCategory}$`, 'i') },
                        subCategory: { $regex: new RegExp(`^${catData.subCategory}$`, 'i') }
                    });

                    if (exists) {
                        results.skipped++;
                        continue;
                    }

                    // 2. Generate Next ID
                    currentId++;

                    const newCat = new Category({
                        ...catData,
                        excelCategoryId: currentId,
                        isActive: catData.isActive !== undefined ? catData.isActive : true
                    });

                    await newCat.save();
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
            res.status(500).json({ message: error.message });
        }
    }
};
