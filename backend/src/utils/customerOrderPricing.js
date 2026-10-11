import mongoose from 'mongoose';
import MasterService from '../models/MasterService.js';
import Service from '../models/Service.js';
import ServiceArea from '../models/ServiceArea.js';
import SystemConfig from '../models/SystemConfig.js';
import Promotion from '../models/Promotion.js';
import { getGstConfigs } from './gstInvoiceHelper.js';

/**
 * Server-side price of a customer order.
 *
 * Every number comes from the database: service prices (Master Services and
 * approved vendor services), the service area covering the pickup point (price
 * factor, platform fee, express and heritage multipliers), the global configs and
 * the applied promotion. Prices, multipliers and fees sent by the app are ignored,
 * so what the customer pays (and what Razorpay is asked to collect) cannot be
 * edited in the request.
 *
 * The formula is the one the cart displays (CartPage.jsx):
 *   unit       = round(price × areaFactor × (Heritage ? heritageMultiplier : 1))
 *   base       = Σ unit × qty
 *   express    = base × (expressMultiplier − 1)
 *   platform   = (base + express) × rate, clamped to the area's min/max fee
 *   logistics  = normal_logistics_fee
 *   gst        = item GST + (platform + logistics) × configured GST%
 *   total      = base + express + platform + logistics + gst − promo discount
 */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const MAX_QTY = 1000;

export class PricingError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

const configNumber = (configs, key) => {
    const row = configs.find(c => c.key === key);
    const n = Number(row?.value);
    return Number.isFinite(n) ? n : null;
};

const findServiceArea = async (location) => {
    const lat = Number(location?.lat);
    const lng = Number(location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return ServiceArea.findOne({
        isActive: true,
        boundary: { $geoIntersects: { $geometry: { type: 'Point', coordinates: [lng, lat] } } }
    }).lean();
};

/** A promotion can only discount while it is live. */
const isPromoLive = (promo, now = new Date()) => {
    if (!promo) return false;
    if (promo.status && !['Active', 'ACTIVE', 'active'].includes(promo.status)) return false;
    const start = promo.start_date || promo.startDate;
    const end = promo.expiryDate || promo.end_date || promo.endDate;
    if (start && new Date(start) > now) return false;
    if (end && new Date(end) < now) return false;
    return true;
};

/**
 * @param {object} input
 * @param {Array<{serviceId, quantity}>} input.items
 * @param {{lat, lng}} input.pickupLocation
 * @param {'Normal'|'Express'} input.deliveryMode
 * @param {'Essential'|'Heritage'} input.selectedTier
 * @param {string} [input.promoApplied]  Promotion id
 * @param {boolean} [input.useWallet]
 * @param {object} input.customer        User document (for the wallet balance)
 */
export const priceCustomerOrder = async ({
    items, pickupLocation, deliveryMode, selectedTier, promoApplied, useWallet, customer
}) => {
    if (!Array.isArray(items) || items.length === 0) throw new PricingError('Add at least one service to the order');

    const lines = items.map((item) => {
        const quantity = Number(item?.quantity);
        if (!mongoose.isValidObjectId(item?.serviceId)) throw new PricingError('Order contains an unknown service');
        if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_QTY) {
            throw new PricingError(`Quantity must be between 0 and ${MAX_QTY}`);
        }
        return { serviceId: String(item.serviceId), quantity };
    });

    const ids = [...new Set(lines.map(l => l.serviceId))];
    const [masters, customs, area, configs, gstConfigs] = await Promise.all([
        MasterService.find({ _id: { $in: ids }, isActive: { $ne: false } }).lean(),
        Service.find({ _id: { $in: ids }, approvalStatus: 'Approved', status: { $in: ['Active', null] } }).lean(),
        findServiceArea(pickupLocation),
        SystemConfig.find({ key: { $in: ['express_multiplier', 'platform_fee_multiplier', 'normal_logistics_fee', 'advance_percentage'] } }).lean(),
        getGstConfigs()
    ]);
    const services = new Map([...masters, ...customs].map(s => [String(s._id), s]));
    const missing = ids.filter(id => !services.has(id));
    if (missing.length) throw new PricingError('Some services in the cart are no longer available. Please refresh your cart.');

    const tier = selectedTier === 'Heritage' ? 'Heritage' : 'Essential';
    const isExpress = deliveryMode === 'Express';

    // Area factors (same fallbacks as /api/geofence/check-availability and the cart).
    const areaFactor = area ? (Number(area.basePriceMultiplier || area.multiplier) || 1) : 1;
    const allowDiscount = area ? area.allowDiscount !== false : false;
    const heritageMultiplier = area ? (area.heritageMultiplier ?? 1) : 1;
    const expressMultiplier = isExpress
        ? (area ? (area.dynamicSurgeMultiplier ?? 1) : (configNumber(configs, 'express_multiplier') ?? 1.5))
        : 1;
    const rawPlatform = area ? (area.platformMultiplier ?? 0) : (configNumber(configs, 'platform_fee_multiplier') || 0);
    const platformRate = rawPlatform >= 1 ? rawPlatform - 1 : rawPlatform;
    const minPlatformFee = area ? (Number(area.minPlatformFee) || 0) : 0;
    const maxPlatformFee = area ? (Number(area.maxPlatformFee) || null) : null;
    const logisticsFee = configNumber(configs, 'normal_logistics_fee') || 0;

    let base = 0;
    let gst = 0;
    const pricedItems = lines.map(({ serviceId, quantity }) => {
        const svc = services.get(serviceId);
        const basePrice = Number(svc.basePrice || svc.totalPrice) || 0;
        const discounted = Number(svc.discountedPrice) || basePrice;
        const source = (!allowDiscount || svc.showDiscountPrice === false) ? basePrice : discounted;
        const unitPrice = Math.round(source * areaFactor * (tier === 'Heritage' ? heritageMultiplier : 1));
        const lineBase = unitPrice * quantity;
        const gstPercent = tier === 'Heritage'
            ? (svc.heritageGst ?? gstConfigs.gstPercent)
            : (svc.gst ?? gstConfigs.gstPercent);
        base += lineBase;
        gst += lineBase * expressMultiplier * (Number(gstPercent) / 100);
        return {
            serviceId,
            name: svc.itemName || svc.name || 'Service Item',
            quantity,
            price: unitPrice,
            gstPercent: Number(gstPercent),
            sacCode: String(svc.sacCode || ''),
            serviceType: svc.serviceType || '',
            tier: svc.tier || tier,
            unit: svc.unit
        };
    });

    const expressSurcharge = base * (expressMultiplier - 1);
    let platformFee = (base + expressSurcharge) * platformRate;
    if (minPlatformFee > 0 && platformFee < minPlatformFee) platformFee = minPlatformFee;
    if (maxPlatformFee > 0 && platformFee > maxPlatformFee) platformFee = maxPlatformFee;

    // Customer fees are part of the taxable supply; snapshot the configured
    // rate so a subsequent config change cannot reprice a paid order.
    gst += (platformFee + logisticsFee) * gstConfigs.gstPercent / 100;
    const grandTotal = base + expressSurcharge + platformFee + logisticsFee + gst;

    // Promotion discount, from the promotion itself (never from the request).
    let promo = null;
    let discount = 0;
    if (promoApplied && mongoose.isValidObjectId(promoApplied)) {
        const found = await Promotion.findById(promoApplied).lean();
        if (isPromoLive(found)) {
            promo = found;
            const value = Number(found.discountValue) || 0;
            discount = ['Flat', 'FLAT_AMOUNT'].includes(found.discountType)
                ? Math.min(value, grandTotal)
                : grandTotal * value / 100;
            discount = Math.max(0, Math.min(discount, grandTotal));
        }
    }

    const finalTotal = Math.max(0, grandTotal - discount);
    const walletBalance = Number(customer?.walletBalance) || 0;
    const walletDeduction = useWallet && walletBalance > 0 ? Math.min(walletBalance, finalTotal) : 0;
    const remaining = Math.max(0, finalTotal - walletDeduction);
    const advancePercent = configNumber(configs, 'advance_percentage') || 100;

    return {
        items: pricedItems,
        area: area ? { id: area._id, name: area.areaName } : null,
        multipliers: { areaFactor, expressMultiplier, heritageMultiplier, platformRate, minPlatformFee, maxPlatformFee, tier },
        priceBreakdown: {
            baseWithArea: round2(base),
            expressSurcharge: round2(expressSurcharge),
            platformFee: round2(platformFee),
            logisticsFee: round2(logisticsFee),
            gstAmount: round2(gst),
            feeGstPercent: gstConfigs.gstPercent
        },
        grandTotal: round2(grandTotal),
        promo,
        discount: round2(discount),
        finalTotal: round2(finalTotal),
        walletDeduction: round2(walletDeduction),
        remaining: round2(remaining),
        // Preserve paise so checkout, collection, invoice, and ledger reconcile.
        payableOnline: round2(remaining),
        advancePercent
    };
};
