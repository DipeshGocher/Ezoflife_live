import { filterCondition, textFilter } from '../utils/queryFilters.js';
import VendorSupplyCategory from '../models/VendorSupplyCategory.js';
import { httpStatusForError } from '../utils/errorResponse.js';

export const vendorSupplyCategoryController = {
    create: async (req, res) => {
        try {
            const { mainCategory, subCategory, image, isActive } = req.body;
            
            // Auto-generate excelCategoryId (Starts from 1, 2, 3...)
            const lastCategory = await VendorSupplyCategory.findOne({ excelCategoryId: { $ne: null } }).sort({ excelCategoryId: -1 });
            const nextId = (lastCategory?.excelCategoryId || 0) + 1;

            const category = new VendorSupplyCategory({ 
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

                const total = await VendorSupplyCategory.countDocuments(query);
                const categories = await VendorSupplyCategory.find(query)
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

            const categories = await VendorSupplyCategory.find(query).sort({ excelCategoryId: 1 });
            res.json(categories);
        } catch (error) {
            res.status(httpStatusForError(error)).json({ message: error.message });
        }
    },

    update: async (req, res) => {
        try {
            const { id } = req.params;
            const updates = req.body;

            // Ensure every category has an excelCategoryId
            const existing = await VendorSupplyCategory.findById(id);
            if (existing && !existing.excelCategoryId) {
                const lastCategory = await VendorSupplyCategory.findOne({ excelCategoryId: { $ne: null } }).sort({ excelCategoryId: -1 });
                updates.excelCategoryId = (lastCategory?.excelCategoryId || 0) + 1;
            }

            const category = await VendorSupplyCategory.findByIdAndUpdate(id, updates, { new: true });
            res.json(category);
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    delete: async (req, res) => {
        try {
            const { id } = req.params;
            // No MasterService or MasterPricing dependencies check needed since this is completely standalone
            await VendorSupplyCategory.findByIdAndDelete(id);
            res.json({ message: 'Vendor supply category deleted successfully' });
        } catch (error) {
            res.status(httpStatusForError(error)).json({ message: error.message });
        }
    },

    clearAll: async (req, res) => {
        try {
            await VendorSupplyCategory.deleteMany({});
            res.json({ message: 'All vendor supply categories cleared successfully' });
        } catch (error) {
            res.status(httpStatusForError(error)).json({ message: error.message });
        }
    },

    bulkUpload: async (req, res) => {
        try {
            const categories = req.body; // Expecting an array
            if (!Array.isArray(categories)) {
                return res.status(400).json({ message: 'Payload must be an array' });
            }

            let lastCategory = await VendorSupplyCategory.findOne({ excelCategoryId: { $ne: null } }).sort({ excelCategoryId: -1 });
            let currentId = (lastCategory?.excelCategoryId || 0);
            
            const results = {
                created: 0,
                skipped: 0,
                errors: 0
            };

            for (const catData of categories) {
                try {
                    // 1. Check for duplicates (Main + Sub combination)
                    const exists = await VendorSupplyCategory.findOne({
                        mainCategory: { $regex: new RegExp(`^${catData.mainCategory}$`, 'i') },
                        subCategory: { $regex: new RegExp(`^${catData.subCategory}$`, 'i') }
                    });

                    if (exists) {
                        results.skipped++;
                        continue;
                    }

                    // 2. Generate Next ID
                    currentId++;

                    const newCat = new VendorSupplyCategory({
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
            res.status(httpStatusForError(error)).json({ message: error.message });
        }
    }
};
