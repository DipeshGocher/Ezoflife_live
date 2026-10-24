/**
 * B2B Platform Fee
 *
 * The fee a vendor pays the platform when ordering supplies from a supplier.
 * It is charged per supplier order (one B2BOrder per supplier), on the goods
 * value excluding GST and delivery.
 *
 * Where the rule comes from, in priority order:
 *   1. The supplier's Service Zone, when its platformFeeMode is PERCENTAGE, FLAT or WAIVED.
 *   2. The global default in SystemConfig (key: b2b_platform_fee).
 *   3. Nothing configured -> the ₹40 first-run default. Admin can replace or
 *      explicitly disable it from Supplier Platform Fee settings.
 *
 * The client never supplies the fee. The server computes it here and the
 * vendor cart mirrors the same formula only for display.
 */

export const PLATFORM_FEE_CONFIG_KEY = 'b2b_platform_fee';
export const FEE_TYPES = ['PERCENTAGE', 'FLAT'];
export const ZONE_FEE_MODES = ['DEFAULT', 'PERCENTAGE', 'FLAT', 'WAIVED'];

export const DEFAULT_PLATFORM_FEE_CONFIG = Object.freeze({
    enabled: true,
    type: 'FLAT',
    value: 40,
    minFee: 0,
    maxFee: null
});

const SAFE_DISABLED_PLATFORM_FEE_CONFIG = Object.freeze({
    enabled: false,
    type: 'PERCENTAGE',
    value: 0,
    minFee: 0,
    maxFee: null
});

const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

const toNonNegative = (n, fallback = 0) => {
    const v = Number(n);
    return Number.isFinite(v) && v >= 0 ? v : fallback;
};

const toOptionalMax = n => {
    if (n === null || n === undefined || n === '') return null;
    const v = Number(n);
    return Number.isFinite(v) && v >= 0 ? v : null;
};

/** Coerce whatever is stored in SystemConfig into a well-formed config. */
export const normalizeGlobalConfig = raw => {
    const isMissing = raw === null || raw === undefined;
    const isObject = raw && typeof raw === 'object' && !Array.isArray(raw);
    // A genuinely missing first-run record receives the documented default.
    // Corrupt persisted data fails closed so an invalid admin setting can
    // never start charging vendors unexpectedly.
    if (!isMissing && !isObject) return { ...SAFE_DISABLED_PLATFORM_FEE_CONFIG };

    const hasConfig = Boolean(isObject);
    const cfg = hasConfig ? raw : DEFAULT_PLATFORM_FEE_CONFIG;
    return {
        enabled: cfg.enabled === true,
        type: FEE_TYPES.includes(cfg.type) ? cfg.type : DEFAULT_PLATFORM_FEE_CONFIG.type,
        value: toNonNegative(cfg.value, hasConfig ? 0 : DEFAULT_PLATFORM_FEE_CONFIG.value),
        minFee: toNonNegative(cfg.minFee, DEFAULT_PLATFORM_FEE_CONFIG.minFee),
        maxFee: toOptionalMax(cfg.maxFee)
    };
};

/**
 * Validate an admin-submitted global config. Returns { ok, config } or { ok: false, message }.
 */
export const validateGlobalConfig = input => {
    const body = input && typeof input === 'object' ? input : {};
    if (body.type !== undefined && !FEE_TYPES.includes(body.type)) {
        return { ok: false, message: `type must be one of ${FEE_TYPES.join(', ')}` };
    }
    for (const field of ['value', 'minFee']) {
        if (body[field] !== undefined && body[field] !== '' && !(Number(body[field]) >= 0)) {
            return { ok: false, message: `${field} must be a number >= 0` };
        }
    }
    if (body.maxFee !== undefined && body.maxFee !== null && body.maxFee !== '' && !(Number(body.maxFee) >= 0)) {
        return { ok: false, message: 'maxFee must be empty or a number >= 0' };
    }
    const config = normalizeGlobalConfig({ ...body, enabled: body.enabled === true || body.enabled === 'true' });
    if (config.type === 'PERCENTAGE' && config.value > 100) {
        return { ok: false, message: 'Percentage fee cannot exceed 100' };
    }
    if (config.maxFee !== null && config.minFee > config.maxFee) {
        return { ok: false, message: 'minFee cannot be greater than maxFee' };
    }
    return { ok: true, config };
};

/**
 * Validate the fee fields on a Supplier Service Zone payload (create/update/bulk).
 * Only checks fields that are present. Returns null when valid, else a message.
 */
export const validateZoneFeeFields = body => {
    if (!body || typeof body !== 'object') return null;
    const { platformFeeMode, platformFeeValue, minSupplierPlatformFee, maxSupplierPlatformFee } = body;
    if (platformFeeMode !== undefined && !ZONE_FEE_MODES.includes(platformFeeMode)) {
        return `platformFeeMode must be one of ${ZONE_FEE_MODES.join(', ')}`;
    }
    if (platformFeeValue !== undefined && platformFeeValue !== '' && !(Number(platformFeeValue) >= 0)) {
        return 'platformFeeValue must be a number >= 0';
    }
    if (platformFeeMode === 'PERCENTAGE' && Number(platformFeeValue) > 100) {
        return 'Percentage fee cannot exceed 100';
    }
    if (minSupplierPlatformFee !== undefined && minSupplierPlatformFee !== '' && !(Number(minSupplierPlatformFee) >= 0)) {
        return 'minSupplierPlatformFee must be a number >= 0';
    }
    const max = toOptionalMax(maxSupplierPlatformFee);
    if (max !== null && Number(minSupplierPlatformFee) > max) {
        return 'minSupplierPlatformFee cannot be greater than maxSupplierPlatformFee';
    }
    return null;
};

/**
 * Pick the rule that applies to a supplier.
 *
 * @param {object|null} zone          SupplierServiceZone (or plain object) for the supplier, if any
 * @param {object}      globalConfig  normalized global config
 * @returns {{ type: 'PERCENTAGE'|'FLAT'|'NONE', value: number, minFee: number, maxFee: number|null, source: 'ZONE'|'GLOBAL'|'NONE' }}
 */
export const resolveFeeRule = (zone, globalConfig) => {
    const mode = zone?.platformFeeMode;

    if (mode === 'WAIVED') {
        return { type: 'NONE', value: 0, minFee: 0, maxFee: null, source: 'ZONE' };
    }
    if (mode === 'PERCENTAGE' || mode === 'FLAT') {
        return {
            type: mode,
            value: toNonNegative(zone.platformFeeValue),
            minFee: toNonNegative(zone.minSupplierPlatformFee),
            maxFee: toOptionalMax(zone.maxSupplierPlatformFee),
            source: 'ZONE'
        };
    }

    const g = normalizeGlobalConfig(globalConfig);
    if (!g.enabled) {
        return { type: 'NONE', value: 0, minFee: 0, maxFee: null, source: 'NONE' };
    }
    return { type: g.type, value: g.value, minFee: g.minFee, maxFee: g.maxFee, source: 'GLOBAL' };
};

/**
 * Fee for one supplier order.
 * @param {number} goodsSubtotal  goods value excl. GST and delivery
 * @param {object} rule           from resolveFeeRule
 */
export const computePlatformFee = (goodsSubtotal, rule) => {
    const subtotal = toNonNegative(goodsSubtotal);
    if (!rule || rule.type === 'NONE' || subtotal <= 0) return 0;

    let fee = rule.type === 'FLAT' ? toNonNegative(rule.value) : (subtotal * toNonNegative(rule.value)) / 100;
    if (fee <= 0) return 0;

    const min = toNonNegative(rule.minFee);
    const max = toOptionalMax(rule.maxFee);
    if (min > 0 && fee < min) fee = min;
    if (max !== null && fee > max) fee = max;

    return round2(fee);
};

/**
 * Unit wholesale rate for a line, after the supplier's bulk discount.
 * Mirrors the vendor cart so the fee base matches what the vendor sees.
 */
export const effectiveWholesaleRate = (supply, quantity) => {
    const rate = toNonNegative(supply?.wholesaleRate);
    const threshold = toNonNegative(supply?.bulkThreshold);
    const discount = toNonNegative(supply?.bulkDiscount);
    const qty = toNonNegative(quantity);
    if (threshold > 0 && discount > 0 && qty >= threshold) {
        return rate - (rate * discount) / 100;
    }
    return rate;
};

/** Short human label for a rule, e.g. "5% (min ₹10, max ₹500)". */
export const describeFeeRule = rule => {
    if (!rule || rule.type === 'NONE') return 'No fee';
    const base = rule.type === 'FLAT' ? `₹${rule.value} per order` : `${rule.value}% of goods value`;
    const limits = [];
    if (rule.minFee > 0) limits.push(`min ₹${rule.minFee}`);
    if (rule.maxFee !== null && rule.maxFee !== undefined) limits.push(`max ₹${rule.maxFee}`);
    return limits.length ? `${base} (${limits.join(', ')})` : base;
};

/** Read the global config from the DB (SystemConfig model passed in to keep this file pure). */
export const loadGlobalFeeConfig = async SystemConfig => {
    const doc = await SystemConfig.findOne({ key: PLATFORM_FEE_CONFIG_KEY }).lean();
    return normalizeGlobalConfig(doc?.value);
};
