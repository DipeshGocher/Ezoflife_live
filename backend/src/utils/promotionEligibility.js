/** One eligibility predicate for discovery, pool visibility, acceptance and checkout. */
export const promotionQuery = ({ owner, vendorId, amount, areaId, serviceIds = [], now = new Date() }) => ({
    owner_type: owner, ...(vendorId ? { vendorId } : {}),
    approval_status: 'APPROVED', status: 'Active',
    start_date: { $lte: now }, expiryDate: { $gte: now },
    $and: [
        { $or: [{ minOrderValue: { $lte: amount } }, { minOrderValue: { $exists: false } }] },
        { $or: [{ geofence_id: null }, ...(areaId ? [{ geofence_id: areaId }] : [])] },
        { $or: [{ scope_type: 'GLOBAL_ORDER' }, { scope_type: 'SELECTED_SERVICES', selected_services: { $in: serviceIds } }] },
        { $expr: { $lt: [{ $ifNull: ['$currentUsage', 0] }, { $ifNull: ['$usageLimit', 100] }] } }
    ]
});
