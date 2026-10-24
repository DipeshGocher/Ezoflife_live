import B2BOrder from '../models/B2BOrder.js';

/**
 * Average supplier rating from vendors' ratings on delivered supply orders.
 * Returns Map<supplierId, { avgRating, ratingCount }>; suppliers with no
 * ratings are absent (callers show "no ratings", never a default score).
 */
export const getSupplierRatings = async (supplierIds = null) => {
    const match = { 'supplierRating.rating': { $gte: 1 }, supplier: { $ne: null } };
    if (supplierIds) match.supplier = { $in: supplierIds };
    const rows = await B2BOrder.aggregate([
        { $match: match },
        { $group: { _id: '$supplier', avg: { $avg: '$supplierRating.rating' }, count: { $sum: 1 } } }
    ]);
    return new Map(rows.map(r => [String(r._id), { avgRating: Math.round(r.avg * 10) / 10, ratingCount: r.count }]));
};
