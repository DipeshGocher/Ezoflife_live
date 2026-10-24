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

test('registered-pair presentation snapshots the existing financial ledger without repricing it', async () => {
    const result = await generateOrderInvoices({ order, customer: { ...customer('23ABCDE1234F1Z5'), _id: 'customer-id' }, vendor: { ...vendor('27ABCDE1234F1Z5'), _id: 'vendor-id' }, configs });
    const details = result.customerInvoice.presentation;
    assert.equal(details.customerId, 'customer-id'); assert.equal(details.vendorId, 'vendor-id');
    assert.equal(details.serviceLineCount, 1); assert.equal(details.serviceSubtotal, 1000);
    assert.equal(details.serviceTax, 180);
    assert.equal(details.platformFee, result.platformInvoice.platformFee);
    assert.equal(details.platformFeeTax, result.platformInvoice.platformFeeTax);
    assert.equal(details.logisticsFeeTax, result.platformInvoice.logisticsFeeTax);
    assert.equal(details.vendorNetPayout, result.ledger.vendorNetPayout);
    assert.equal(result.customerInvoice.totalAmount, result.ledger.invoice1Total);
});

test('unregistered vendor/customer Invoice 2 snapshots reference services and original customer total', async () => {
    const result = await generateOrderInvoices({ order, customer: customer(''), vendor: vendor(''), configs });
    const details = result.platformInvoice.presentation;
    assert.equal(details.scenario, 'C'); assert.equal(details.services.length, order.items.length);
    assert.equal(details.serviceSubtotal, result.customerInvoice.presentation.serviceSubtotal);
    assert.equal(details.customerTotal, result.customerInvoice.totalAmount);
    assert.equal(details.vendorNetPayout, result.ledger.vendorNetPayout);
    assert.equal(details.services[0].description, 'Laundry');
    const registered = await generateOrderInvoices({ order, customer: customer(''), vendor: vendor('27ABCDE1234F1Z5'), configs });
    assert.equal(registered.platformInvoice.presentation.scenario, 'B');
    assert.equal(registered.platformInvoice.presentation.serviceTax, registered.customerInvoice.presentation.serviceTax);
    assert.equal(registered.platformInvoice.presentation.customerTotal, registered.customerInvoice.totalAmount);
});

test('both registered-vendor Invoice 2 combinations snapshot service GST and the existing payout', async () => {
    for (const gst of ['23ABCDE1234F1Z5','']) {
        const result = await generateOrderInvoices({ order, customer: customer(gst), vendor: vendor('27ABCDE1234F1Z5'), configs });
        assert.equal(result.platformInvoice.presentation.scenario, gst ? 'A' : 'B');
        assert.equal(result.platformInvoice.presentation.serviceTax, result.customerInvoice.presentation.serviceTax);
        assert.equal(result.platformInvoice.presentation.vendorNetPayout, result.ledger.vendorNetPayout);
        assert.equal(result.platformInvoice.presentation.customerTotal, result.customerInvoice.totalAmount);
    }
});
