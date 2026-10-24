/**
 * Customer Promotions: Admin-only platform promo codes in customer ordering.
 *
 * Verifies that:
 * 1. Customer can fetch applicable promo codes without requiring vendorId.
 * 2. Only Admin-created promotions (owner_type: 'PLATFORM') are returned.
 * 3. Vendor-created promotions (owner_type: 'VENDOR') are strictly excluded.
 * 4. Customer can validate an Admin platform promo code without vendorId.
 * 5. Customer cannot validate/apply a Vendor promo code for customer orders.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestEnvironment, api } from '../helpers/testEnvironment.js';
import { createUser, tokenFor } from '../helpers/factories.js';

let env, admin, customer, vendor;

before(async () => {
    env = await startTestEnvironment();
    admin = { token: tokenFor('Admin') };
    customer = await createUser(api, env.baseUrl, '9990000072', 'Customer');
    vendor = await createUser(api, env.baseUrl, '9990000073', 'Vendor');
    assert.ok(admin.token && customer.token && vendor.token, 'all fixtures must exist');
}, { timeout: 90000 });

after(async () => {
    if (env) await env.stop();
});

const DAY = 24 * 60 * 60 * 1000;

describe('Customer promotions are strictly Admin-created platform promos', () => {
    let platformPromoCode, vendorPromoCode;

    before(async () => {
        // 1. Admin creates an active PLATFORM promo
        platformPromoCode = `ADMIN${Date.now()}`;
        const adminRes = await api(env.baseUrl, '/api/promotions', {
            method: 'POST',
            token: admin.token,
            body: {
                title: 'Admin Platform Offer 20% OFF',
                code: platformPromoCode,
                owner_type: 'PLATFORM',
                discountType: 'Percentage',
                discountValue: 20,
                minOrderValue: 200,
                usageLimit: 100,
                start_date: new Date(Date.now() - DAY).toISOString(),
                expiryDate: new Date(Date.now() + 30 * DAY).toISOString(),
                status: 'Active'
            }
        });
        assert.equal(adminRes.status, 201, 'admin platform promo should be created');

        // 2. Vendor creates a VENDOR promo
        vendorPromoCode = `VEND${Date.now()}`;
        const vendorRes = await api(env.baseUrl, '/api/promotions', {
            method: 'POST',
            token: vendor.token,
            body: {
                title: 'Vendor Special Discount ₹50',
                code: vendorPromoCode,
                owner_type: 'VENDOR',
                vendorId: vendor.id,
                discountType: 'Flat',
                discountValue: 50,
                minOrderValue: 150,
                usageLimit: 50,
                start_date: new Date(Date.now() - DAY).toISOString(),
                expiryDate: new Date(Date.now() + 30 * DAY).toISOString(),
                status: 'Active'
            }
        });
        assert.equal(vendorRes.status, 201, 'vendor promo should be created');
    });

    test('customer gets active admin platform promos without vendorId', async () => {
        const res = await api(env.baseUrl, '/api/promotions/applicable', {
            method: 'GET',
            token: customer.token
        });

        assert.equal(res.status, 200, 'fetching applicable promos should return 200');
        const promos = Array.isArray(res.body) ? res.body : [];

        // Platform promo must be present
        const hasPlatformPromo = promos.some(p => p.code === platformPromoCode);
        assert.ok(hasPlatformPromo, 'platform promo created by admin should be in applicable promos');

        // Vendor promo MUST NOT be present
        const hasVendorPromo = promos.some(p => p.code === vendorPromoCode);
        assert.equal(hasVendorPromo, false, 'vendor promo should strictly NOT be in customer applicable promos');

        // All returned promos must have owner_type PLATFORM
        for (const p of promos) {
            assert.equal(p.owner_type, 'PLATFORM', `promo ${p.code} must be a PLATFORM promo`);
        }
    });

    test('customer validates admin platform promo successfully without vendorId', async () => {
        const res = await api(env.baseUrl, '/api/promotions/validate', {
            method: 'POST',
            token: customer.token,
            body: {
                code: platformPromoCode,
                orderValue: 500
            }
        });

        assert.equal(res.status, 200, 'platform promo validation should succeed');
        assert.equal(res.body.code, platformPromoCode);
        assert.equal(res.body.discountValue, 20);
        assert.equal(res.body.discountType, 'Percentage');
    });

    test('customer attempting to validate a vendor promo is rejected', async () => {
        const res = await api(env.baseUrl, '/api/promotions/validate', {
            method: 'POST',
            token: customer.token,
            body: {
                code: vendorPromoCode,
                orderValue: 500
            }
        });

        assert.equal(res.status, 400, 'vendor promo should be rejected for customer order');
        assert.ok(
            res.body.message.includes('Customer online orders accept admin platform promo codes only') ||
            res.body.message.includes('store walk-in'),
            `expected informative rejection message, got: ${res.body.message}`
        );
    });
});
