import { describe, it, expect } from 'vitest';
import { calculateVendorCart, computePlatformFee } from '../utils/vendorCartCalculations';

describe('calculateVendorCart delivery threshold and fee logic', () => {
    const mockMaterials = [
        {
            _id: 'prod-butter-300',
            name: 'Amul Butter',
            wholesaleRate: 300,
            price: 354,
            gst: 18,
            supplierId: 'SUP-3333',
            supplierFacilityName: 'Ujjawal Supplier',
            movFreeDelivery: 500, // Threshold 500
            deliveryCharges: 0     // Default/unspecified
        },
        {
            _id: 'prod-caustic-soda',
            name: 'Caustic Soda Flakes',
            wholesaleRate: 300,
            price: 354,
            gst: 18,
            supplierId: 'SUP-3333',
            supplierFacilityName: 'Ujjawal Supplier',
            movFreeDelivery: 500,
            deliveryCharges: 0
        },
        {
            _id: 'prod-oil-custom-fee',
            name: 'Cooking Oil',
            wholesaleRate: 200,
            price: 210,
            gst: 5,
            supplierId: 'SUP-9999',
            supplierFacilityName: 'City Oil Distributors',
            movFreeDelivery: 1000,
            deliveryCharges: 75 // Explicit delivery charge
        }
    ];

    it('charges delivery fee (fallback 50) when item subtotal (₹300) is below movFreeDelivery (₹500)', () => {
        const cart = {
            'prod-butter-300': 1 // 1 unit @ ₹300
        };

        const result = calculateVendorCart(cart, mockMaterials);

        expect(result.itemSubtotal).toBe(300);
        expect(result.groupedCarts).toHaveLength(1);

        const group = result.groupedCarts[0];
        expect(group.supplierId).toBe('SUP-3333');
        expect(group.subTotal).toBe(300);
        expect(group.movFreeDelivery).toBe(500);
        
        // Key assertion: Delivery fee MUST NOT be 0 (must NOT be FREE)
        expect(group.effectiveDeliveryFee).toBe(50);
        expect(group.isFreeDelivery).toBe(false);
        expect(result.totalDeliveryCharges).toBe(50);

        // Supplier total = 300 (subtotal) + 54 (18% GST) + 50 (delivery) = 404
        expect(group.payableToSupplier).toBe(404);
    });

    it('grants FREE delivery when item subtotal reaches or exceeds movFreeDelivery (₹500)', () => {
        const cart = {
            'prod-butter-300': 2 // 2 units @ ₹300 = ₹600 (>= 500)
        };

        const result = calculateVendorCart(cart, mockMaterials);

        expect(result.itemSubtotal).toBe(600);
        const group = result.groupedCarts[0];
        expect(group.subTotal).toBe(600);
        expect(group.movFreeDelivery).toBe(500);

        // Key assertion: Delivery fee must be 0 and marked free
        expect(group.effectiveDeliveryFee).toBe(0);
        expect(group.isFreeDelivery).toBe(true);
        expect(result.totalDeliveryCharges).toBe(0);

        // Supplier total = 600 + 108 (GST) + 0 (delivery) = 708
        expect(group.payableToSupplier).toBe(708);
    });

    it('uses custom supplier delivery charge when below threshold', () => {
        const cart = {
            'prod-oil-custom-fee': 1 // 1 unit @ ₹200 (MOV is ₹1000)
        };

        const result = calculateVendorCart(cart, mockMaterials);
        const group = result.groupedCarts[0];

        expect(group.subTotal).toBe(200);
        expect(group.movFreeDelivery).toBe(1000);
        expect(group.effectiveDeliveryFee).toBe(75);
        expect(group.isFreeDelivery).toBe(false);
        expect(result.totalDeliveryCharges).toBe(75);
    });

    it('correctly calculates independent supplier groups in multi-supplier cart', () => {
        const cart = {
            'prod-butter-300': 2,      // SUP-3333: ₹600 >= ₹500 -> FREE Delivery
            'prod-oil-custom-fee': 1    // SUP-9999: ₹200 < ₹1000 -> ₹75 Delivery Fee
        };

        const result = calculateVendorCart(cart, mockMaterials);

        expect(result.groupedCarts).toHaveLength(2);

        const group1 = result.groupedCarts.find(g => g.supplierId === 'SUP-3333');
        const group2 = result.groupedCarts.find(g => g.supplierId === 'SUP-9999');

        expect(group1.isFreeDelivery).toBe(true);
        expect(group1.effectiveDeliveryFee).toBe(0);

        expect(group2.isFreeDelivery).toBe(false);
        expect(group2.effectiveDeliveryFee).toBe(75);

        expect(result.totalDeliveryCharges).toBe(75);
    });
});

describe('platform fee (vendor -> supplier orders)', () => {
    const pctRule = { type: 'PERCENTAGE', value: 5, minFee: 10, maxFee: 500 };
    const flatRule = { type: 'FLAT', value: 25, minFee: 0, maxFee: null };
    const materials = [
        { _id: 'a', name: 'A', wholesaleRate: 100, price: 118, gst: 18, supplierId: 'SUP-A', platformFeeRule: pctRule },
        { _id: 'b', name: 'B', wholesaleRate: 1000, price: 1180, gst: 18, supplierId: 'SUP-B', platformFeeRule: flatRule, bulkThreshold: 10, bulkDiscount: 10 },
        { _id: 'c', name: 'C', wholesaleRate: 100, price: 118, gst: 18, supplierId: 'SUP-C', platformFeeRule: { type: 'NONE', value: 0, minFee: 0, maxFee: null } },
        { _id: 'legacy', name: 'Legacy', wholesaleRate: 100, price: 118, gst: 18, supplierId: 'SUP-L', supplierPlatformMultiplier: 1.0 }
    ];

    it('computePlatformFee mirrors the server formula', () => {
        expect(computePlatformFee(400, pctRule)).toBe(20);
        expect(computePlatformFee(100, pctRule)).toBe(10); // min
        expect(computePlatformFee(20000, pctRule)).toBe(500); // max
        expect(computePlatformFee(5000, flatRule)).toBe(25);
        expect(computePlatformFee(1000, null)).toBe(0);
        expect(computePlatformFee(0, flatRule)).toBe(0);
        expect(computePlatformFee(1000, { type: 'PERCENTAGE', value: 5, minFee: 0, maxFee: 0 })).toBe(0);
    });

    it('charges per supplier group on goods value excl. GST', () => {
        const result = calculateVendorCart({ a: 4, b: 1 }, materials);
        const a = result.groupedCarts.find(g => g.supplierId === 'SUP-A');
        const b = result.groupedCarts.find(g => g.supplierId === 'SUP-B');
        expect(a.platformFeeFinal).toBe(20); // 5% of 400
        expect(b.platformFeeFinal).toBe(25); // flat
        expect(result.totalPlatformFee).toBe(45);
        expect(result.grandTotal).toBeCloseTo(result.itemSubtotal + result.totalGst + result.totalDeliveryCharges + 45, 5);
    });

    it('platform fee is not paid to the supplier', () => {
        const result = calculateVendorCart({ a: 4 }, materials);
        expect(result.payableToSupplier).toBeCloseTo(400 + 72, 5);
    });

    it('no rule, NONE rule, or legacy multiplier -> no fee', () => {
        const result = calculateVendorCart({ c: 3, legacy: 5 }, materials);
        expect(result.totalPlatformFee).toBe(0);
    });

    it('bulk discount lowers the percentage fee base', () => {
        const bulkPct = [{ ...materials[1], platformFeeRule: { type: 'PERCENTAGE', value: 5, minFee: 0, maxFee: null } }];
        const result = calculateVendorCart({ b: 10 }, bulkPct);
        expect(result.totalPlatformFee).toBe(450); // 5% of 10 x 900
    });
});
