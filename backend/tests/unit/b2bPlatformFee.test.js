/**
 * B2B platform fee calculation (vendor -> supplier orders).
 *
 * Pure logic, no database. Guards the formula the server charges and the
 * precedence between the global default and a supplier zone override.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    computePlatformFee,
    describeFeeRule,
    effectiveWholesaleRate,
    normalizeGlobalConfig,
    resolveFeeRule,
    validateGlobalConfig,
    validateZoneFeeFields
} from '../../src/utils/b2bPlatformFee.js';

const pct = (value, minFee = 0, maxFee = null) => ({ type: 'PERCENTAGE', value, minFee, maxFee });
const flat = (value, minFee = 0, maxFee = null) => ({ type: 'FLAT', value, minFee, maxFee });

describe('computePlatformFee', () => {
    test('percentage of goods value', () => {
        assert.equal(computePlatformFee(1000, pct(5)), 50);
    });

    test('flat fee per order ignores goods value', () => {
        assert.equal(computePlatformFee(1000, flat(25)), 25);
        assert.equal(computePlatformFee(10, flat(25)), 25);
    });

    test('minimum fee lifts a small percentage fee', () => {
        assert.equal(computePlatformFee(100, pct(5, 10)), 10);
    });

    test('maximum fee caps a large percentage fee', () => {
        assert.equal(computePlatformFee(20000, pct(5, 0, 500)), 500);
    });

    test('max of 0 is a real cap, not "no limit"', () => {
        assert.equal(computePlatformFee(1000, pct(5, 0, 0)), 0);
    });

    test('rounds to paise', () => {
        assert.equal(computePlatformFee(333.33, pct(3)), 10);
        assert.equal(computePlatformFee(101, pct(2.5)), 2.53);
    });

    test('no fee for NONE rule, zero rate, or empty cart', () => {
        assert.equal(computePlatformFee(1000, { type: 'NONE', value: 0, minFee: 0, maxFee: null }), 0);
        assert.equal(computePlatformFee(1000, pct(0)), 0);
        assert.equal(computePlatformFee(1000, pct(0, 50)), 0, 'min fee must not create a fee when the rate is 0');
        assert.equal(computePlatformFee(0, flat(25)), 0);
    });

    test('garbage input never produces a negative or NaN fee', () => {
        assert.equal(computePlatformFee(-500, pct(5)), 0);
        assert.equal(computePlatformFee('abc', pct(5)), 0);
        assert.equal(computePlatformFee(1000, pct(-5)), 0);
        assert.equal(computePlatformFee(1000, null), 0);
    });
});

describe('resolveFeeRule precedence', () => {
    const globalOn = { enabled: true, type: 'PERCENTAGE', value: 5, minFee: 10, maxFee: 500 };

    test('global default applies when zone has no override', () => {
        const rule = resolveFeeRule({ platformFeeMode: 'DEFAULT' }, globalOn);
        assert.deepEqual(rule, { type: 'PERCENTAGE', value: 5, minFee: 10, maxFee: 500, source: 'GLOBAL' });
    });

    test('global default applies when supplier has no zone', () => {
        assert.equal(resolveFeeRule(null, globalOn).source, 'GLOBAL');
    });

    test('disabled global means no fee', () => {
        const rule = resolveFeeRule(null, { ...globalOn, enabled: false });
        assert.equal(rule.type, 'NONE');
        assert.equal(computePlatformFee(1000, rule), 0);
    });

    test('missing global config uses the ₹40 first-run default', () => {
        const rule = resolveFeeRule(null, undefined);
        assert.deepEqual(rule, { type: 'FLAT', value: 40, minFee: 0, maxFee: null, source: 'GLOBAL' });
        assert.equal(computePlatformFee(1000, rule), 40);
    });

    test('zone percentage override wins over global and uses zone min/max', () => {
        const rule = resolveFeeRule({
            platformFeeMode: 'PERCENTAGE', platformFeeValue: 2,
            minSupplierPlatformFee: 5, maxSupplierPlatformFee: 100
        }, globalOn);
        assert.deepEqual(rule, { type: 'PERCENTAGE', value: 2, minFee: 5, maxFee: 100, source: 'ZONE' });
    });

    test('zone flat override', () => {
        const rule = resolveFeeRule({ platformFeeMode: 'FLAT', platformFeeValue: 30 }, globalOn);
        assert.equal(rule.type, 'FLAT');
        assert.equal(computePlatformFee(5000, rule), 30);
    });

    test('zone WAIVED beats an enabled global fee', () => {
        const rule = resolveFeeRule({ platformFeeMode: 'WAIVED' }, globalOn);
        assert.equal(computePlatformFee(5000, rule), 0);
    });

    test('legacy supplierPlatformMultiplier is ignored (it used to charge 100% at 1.0)', () => {
        const rule = resolveFeeRule({ supplierPlatformMultiplier: 1.0 }, { enabled: false });
        assert.equal(computePlatformFee(1000, rule), 0);
    });
});

describe('effectiveWholesaleRate', () => {
    const supply = { wholesaleRate: 1000, bulkThreshold: 10, bulkDiscount: 10 };

    test('no discount below threshold', () => {
        assert.equal(effectiveWholesaleRate(supply, 9), 1000);
    });

    test('bulk discount at threshold', () => {
        assert.equal(effectiveWholesaleRate(supply, 10), 900);
    });

    test('no bulk rules configured', () => {
        assert.equal(effectiveWholesaleRate({ wholesaleRate: 50 }, 1000), 50);
    });
});

describe('config validation', () => {
    test('normalizes junk to a safe disabled config', () => {
        assert.deepEqual(normalizeGlobalConfig('nonsense'), { enabled: false, type: 'PERCENTAGE', value: 0, minFee: 0, maxFee: null });
    });

    test('accepts a valid global config', () => {
        const r = validateGlobalConfig({ enabled: true, type: 'FLAT', value: 20, minFee: 0, maxFee: '' });
        assert.equal(r.ok, true);
        assert.deepEqual(r.config, { enabled: true, type: 'FLAT', value: 20, minFee: 0, maxFee: null });
    });

    test('rejects bad global configs', () => {
        assert.equal(validateGlobalConfig({ type: 'MULTIPLIER' }).ok, false);
        assert.equal(validateGlobalConfig({ type: 'PERCENTAGE', value: 101 }).ok, false);
        assert.equal(validateGlobalConfig({ value: -1 }).ok, false);
        assert.equal(validateGlobalConfig({ minFee: 50, maxFee: 10 }).ok, false);
        assert.equal(validateGlobalConfig({ maxFee: 'abc' }).ok, false);
    });

    test('zone fee field validation', () => {
        assert.equal(validateZoneFeeFields({ zoneName: 'x' }), null, 'fee fields are optional');
        assert.equal(validateZoneFeeFields({ platformFeeMode: 'FLAT', platformFeeValue: 25 }), null);
        assert.match(validateZoneFeeFields({ platformFeeMode: 'MULTIPLY' }), /platformFeeMode/);
        assert.match(validateZoneFeeFields({ platformFeeMode: 'PERCENTAGE', platformFeeValue: 150 }), /100/);
        assert.match(validateZoneFeeFields({ platformFeeValue: -2 }), />= 0/);
        assert.match(validateZoneFeeFields({ minSupplierPlatformFee: 50, maxSupplierPlatformFee: 10 }), /greater/);
    });
});

describe('describeFeeRule', () => {
    test('labels', () => {
        assert.equal(describeFeeRule({ type: 'NONE' }), 'No fee');
        assert.equal(describeFeeRule(pct(5, 10, 500)), '5% of goods value (min ₹10, max ₹500)');
        assert.equal(describeFeeRule(flat(25)), '₹25 per order');
    });
});
