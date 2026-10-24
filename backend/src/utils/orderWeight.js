import mongoose from 'mongoose';
import MasterService from '../models/MasterService.js';

/**
 * Order weight, from the most reliable source available:
 *   1. weighed   — measured by the vendor (walk-in counter, or on receipt)
 *   2. estimated — per-kg quantities + each service's admin-configured "Avg Weight"
 * If none is known, the weight is null and shown as "—" (never a made-up number).
 */

export const MAX_WEIGHT_KG = 200;
const round2 = n => Math.round(n * 100) / 100;
const isKgUnit = unit => /kg/i.test(String(unit || '')); // 'kg', 'per_kg'

/** A weight in kg (0 < w <= 200) rounded to 10g, or null if missing/invalid. */
export const parseWeightKg = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0 || n > MAX_WEIGHT_KG) return null;
    return round2(n);
};

/** True if a value was supplied but isn't a usable weight. */
export const isInvalidWeight = (value) =>
    value !== undefined && value !== null && value !== '' && parseWeightKg(value) === null;

/**
 * Estimate from the items. Per-kg items contribute their quantity; per-piece
 * items need their Master Service "Avg Weight". If any per-piece item has no
 * known average weight the estimate is null (a partial sum would mislead).
 */
export const estimateWeightFromItems = async (items = []) => {
    if (!Array.isArray(items) || items.length === 0) return null;

    const pieceIds = items
        .filter(i => !isKgUnit(i.unit) && mongoose.isValidObjectId(i.serviceId))
        .map(i => i.serviceId);
    const masters = pieceIds.length
        ? await MasterService.find({ _id: { $in: pieceIds } }).select('avgWeight').lean()
        : [];
    const avgById = new Map(masters.map(m => [String(m._id), parseWeightKg(m.avgWeight)]));

    let total = 0;
    for (const item of items) {
        const qty = Number(item.quantity) || 0;
        if (qty <= 0) continue;
        if (isKgUnit(item.unit)) {
            total += qty;
            continue;
        }
        const avg = avgById.get(String(item.serviceId));
        if (!avg) return null; // unknown piece weight
        total += avg * qty;
    }
    return total > 0 ? round2(total) : null;
};

/** Pick the best available weight. */
export const resolveOrderWeight = ({ weighedWeight, estimatedWeight }) => {
    if (weighedWeight) return { totalWeight: weighedWeight, weightSource: 'weighed' };
    if (estimatedWeight) return { totalWeight: estimatedWeight, weightSource: 'estimated' };
    return { totalWeight: null, weightSource: null };
};

/**
 * Fill in the estimate for orders saved without any weight (e.g. placed before
 * weight estimation existed). Orders that already have a weight — especially a
 * vendor-weighed one — are never touched. Returns what was (or would be) updated.
 */
export const backfillMissingOrderWeights = async (Order, { dryRun = false } = {}) => {
    const orders = await Order.find({
        $or: [{ totalWeight: { $exists: false } }, { totalWeight: null }, { totalWeight: { $lte: 0 } }]
    }).select('orderId items').lean();

    const updated = [];
    const skipped = [];
    for (const order of orders) {
        const estimatedWeight = await estimateWeightFromItems(order.items);
        if (!estimatedWeight) {
            skipped.push(order.orderId || String(order._id));
            continue;
        }
        if (!dryRun) {
            await Order.updateOne(
                { _id: order._id, $or: [{ totalWeight: { $exists: false } }, { totalWeight: null }, { totalWeight: { $lte: 0 } }] },
                { $set: { totalWeight: estimatedWeight, weightSource: 'estimated', estimatedWeight } }
            );
        }
        updated.push({ orderId: order.orderId || String(order._id), totalWeight: estimatedWeight });
    }
    return { updated, skipped };
};
