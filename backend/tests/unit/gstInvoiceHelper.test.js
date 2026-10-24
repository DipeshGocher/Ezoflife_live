import { financialYearFor } from '../../src/services/invoiceFinalizationService.js';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    GST_SCENARIOS, GstConfigurationError, GstEligibilityError,
    generateOrderInvoices, isValidGstin, normalizeGstin,
    resolveGstScenario, validateGstConfigs
} from '../../src/utils/gstInvoiceHelper.js';

const customer = gstNumber => ({ displayName: 'Customer', gstNumber });
const vendor = gst => ({ displayName: 'Vendor', shopDetails: { name: 'Laundry', gst } });
const configs = {
    gstPercent: 18,
    platformFeeFixed: 0,
    platformFeeGstPercent: 18,
    logisticsFeeGstPercent: 18,
    spinzytGstin: '23ABCDE1234F1Z5',
    invoiceSettings: {
        businessName: 'Spinzyt Test', registeredAddress: '1 Test Road, Indore',
        platformSacCode: '998311', logisticsSacCode: '996511', promotionSacCode: '9983'
    }
};
const order = {
    _id: 'order-1', orderId: '#ON-1',
    items: [{ name: 'Laundry', quantity: 1, price: 1000, gstPercent: 18, sacCode: '9994', unit: 'service' }],
    priceBreakdown: { baseWithArea: 1000, expressSurcharge: 0, platformFee: 100, logisticsFee: 50 }
};

describe('GST classification', () => {
    test('normalizes and validates complete 15-character GSTINs', () => {
        assert.equal(normalizeGstin(' 23abcde1234f1z5 '), '23ABCDE1234F1Z5');
        assert.equal(isValidGstin('23ABCDE1234F1Z5'), true);
        assert.equal(isValidGstin('23ABCDE1234F1'), false);
    });

    test('resolves all four customer/vendor combinations', () => {
        assert.equal(resolveGstScenario(customer('23ABCDE1234F1Z5'), vendor('27ABCDE1234F1Z5')), GST_SCENARIOS.RD_RD);
        assert.equal(resolveGstScenario(customer(''), vendor('27ABCDE1234F1Z5')), GST_SCENARIOS.URD_RD);
        assert.equal(resolveGstScenario(customer(''), vendor('')), GST_SCENARIOS.URD_URD);
        assert.equal(resolveGstScenario(customer('23ABCDE1234F1Z5'), vendor('')), GST_SCENARIOS.BLOCKED);
    });

    test('accepts configured zero tax rates without replacing them', () => {
        const value = validateGstConfigs({
            gst_percent: 0, platform_fee_fixed: 0, platform_fee_gst_percent: 0,
            logistics_fee_gst_percent: 0, spinzyt_gstin: '23ABCDE1234F1Z5'
        });
        assert.equal(value.gstPercent, 0);
        assert.equal(value.platformFeeGstPercent, 0);
    });

    test('rejects missing financial configuration', () => {
        assert.throws(() => validateGstConfigs({ spinzyt_gstin: '23ABCDE1234F1Z5' }), GstConfigurationError);
    });
});

describe('GST invoices and ledger', () => {
    test('blocks a registered customer with an unregistered vendor', async () => {
        await assert.rejects(
            generateOrderInvoices({ order, customer: customer('23ABCDE1234F1Z5'), vendor: vendor(''), configs }),
            GstEligibilityError
        );
    });

    test('retains both supplier and recipient GSTINs for RD/RD', async () => {
        const result = await generateOrderInvoices({
            order, customer: customer('23ABCDE1234F1Z5'), vendor: vendor('27ABCDE1234F1Z5'), configs
        });
        assert.equal(result.customerInvoice.gstScenario, GST_SCENARIOS.RD_RD);
        assert.equal(result.customerInvoice.supplierGstin, '27ABCDE1234F1Z5');
        assert.equal(result.customerInvoice.recipientGstin, '23ABCDE1234F1Z5');
    });

    test('uses zero vendor GST for URD/URD and displays Spinzyt GSTIN', async () => {
        const result = await generateOrderInvoices({ order, customer: customer(''), vendor: vendor(''), configs });
        assert.equal(result.customerInvoice.taxPercent, 0);
        assert.equal(result.customerInvoice.displayGstinNo, configs.spinzytGstin);
    });

    test('splits promotion exactly and conserves the invoice total', async () => {
        const result = await generateOrderInvoices({
            order, customer: customer(''), vendor: vendor('27ABCDE1234F1Z5'), configs, vendorPromoValue: 101
        });
        assert.equal(result.ledger.customerWalletCredit, 50.5);
        assert.equal(result.ledger.spinzytPromoShare, 50.5);
        assert.equal(result.ledger.customerWalletCredit + result.ledger.spinzytPromoShare, 101);
        assert.equal(
            result.ledger.vendorNetPayout + result.ledger.invoice2Total + result.ledger.customerWalletCredit,
            result.ledger.invoice1Total
        );
    });

    test('uses the immutable checkout GST so payment and Invoice 1 cannot drift', async () => {
        const paidOrder = {
            ...order,
            orderType: 'Normal',
            totalAmount: 1207.5,
            items: [{ gstPercent: 5 }],
            priceBreakdown: { ...order.priceBreakdown, gstAmount: 57.5, feeGstPercent: 5 }
        };
        const result = await generateOrderInvoices({
            order: paidOrder, customer: customer(''), vendor: vendor('27ABCDE1234F1Z5'), configs
        });
        assert.equal(result.customerInvoice.taxPercent, 5);
        assert.equal(result.customerInvoice.taxAmount, 57.5);
        assert.equal(result.customerInvoice.totalAmount, paidOrder.totalAmount);
    });
});

 test('invoice financial year changes at midnight in India', () => {
    assert.equal(financialYearFor('2026-03-31T18:29:59Z'), '25-26');
    assert.equal(financialYearFor('2026-03-31T18:30:00Z'), '26-27');
});
