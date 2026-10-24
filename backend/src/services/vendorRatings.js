import Feedback from '../models/Feedback.js';

// Add genuine customer feedback without changing vendor order or visibility.
export const withVendorRatings = async vendors => {
    const ids = vendors.map(vendor => vendor._id || vendor.id);
    const ratings = await Feedback.aggregate([
        { $match: { vendor: { $in: ids } } },
        { $group: { _id: '$vendor', rating: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);
    const feedback = new Map(ratings.map(row => [String(row._id), row]));
    return vendors.map(vendor => ({ ...vendor, rating: feedback.get(String(vendor._id || vendor.id))?.rating ?? null, ratingCount: feedback.get(String(vendor._id || vendor.id))?.count || 0 }));
};
