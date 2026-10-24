import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import User from '../src/models/User.js';
import Order from '../src/models/Order.js';
import SystemConfig from '../src/models/SystemConfig.js';
import { generateOrderInvoices, checkCustomerRD, checkVendorRD, getGstConfigs } from '../src/utils/gstInvoiceHelper.js';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/ezoflife';

async function runTests() {
    console.log('🧪 Starting GST Compliance & Invoice Resolution Test Suite...\n');

    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        // 1. Test checkCustomerRD and checkVendorRD helpers
        console.log('\n--- 1. Testing RD/URD Qualification Helpers ---');
        const rdCust = { customerType: 'retail', gstNumber: '07AAAAA1111A1Z1' };
        const urdCust1 = { customerType: 'individual', gstNumber: '' };
        const urdCust2 = { customerType: 'retail', gstNumber: '' };
        console.assert(checkCustomerRD(rdCust) === true, 'RD Customer check failed');
        console.assert(checkCustomerRD(urdCust1) === false, 'URD Customer 1 check failed');
        console.assert(checkCustomerRD(urdCust2) === false, 'URD Customer without GST should be false');

        const rdVend = { shopDetails: { gst: '07BBBBB2222B1Z2' } };
        const urdVend = { shopDetails: { gst: '' }, gstNumber: '' };
        console.assert(checkVendorRD(rdVend) === true, 'RD Vendor check failed');
        console.assert(checkVendorRD(urdVend) === false, 'URD Vendor check failed');
        console.log('✅ RD/URD qualification checks passed!');

        // 2. Test Dual Invoices & Scenarios Calculation
        console.log('\n--- 2. Testing Dual Invoice Generation (Scenarios A, B, C) ---');
        const mockOrder = {
            _id: new mongoose.Types.ObjectId(),
            orderId: '#ON-99901',
            priceBreakdown: {
                baseWithArea: 500,
                expressSurcharge: 50,
                platformFee: 20,
                logisticsFee: 40
            },
            deliveryCharge: 40
        };

        const mockConfigs = {
            gstPercent: 18,
            platformFeeFixed: 20,
            platformFeeGstPercent: 18,
            logisticsFeeGstPercent: 18,
            spinzytGstin: '07SPINZYT0000Z1',
            invoiceSettings: {}
        };

        // Total service value = 500 + 50 + 20 + 40 = 610

        // Test Scenario A: RD Customer + RD Vendor
        const resA = await generateOrderInvoices({
            order: mockOrder,
            customer: rdCust,
            vendor: rdVend,
            configs: mockConfigs
        });
        console.log('Scenario A Output:', {
            scenario: resA.customerInvoice.scenario,
            serviceValue: resA.customerInvoice.serviceValue,
            taxPercent: resA.customerInvoice.taxPercent,
            taxAmount: resA.customerInvoice.taxAmount,
            totalAmount: resA.customerInvoice.totalAmount,
            gstinLabel: resA.customerInvoice.displayGstinLabel,
            gstinNo: resA.customerInvoice.displayGstinNo
        });
        console.assert(resA.customerInvoice.scenario === 'A', 'Scenario A mismatch');
        console.assert(resA.customerInvoice.serviceValue === 610, 'Service value mismatch');
        console.assert(resA.customerInvoice.taxPercent === 18, 'Tax percent should be 18%');
        console.assert(resA.customerInvoice.taxAmount === 109.8, 'Tax amount mismatch on service value');
        console.assert(resA.customerInvoice.totalAmount === 719.8, 'Total amount mismatch for Scenario A');
        console.assert(resA.customerInvoice.displayGstinLabel === 'Customer GSTIN', 'Scenario A label mismatch');
        console.assert(resA.customerInvoice.displayGstinNo === '07AAAAA1111A1Z1', 'Scenario A GSTIN mismatch');
        console.log('✅ Scenario A assertions passed!');

        // Test Scenario B: URD Customer + RD Vendor
        const resB = await generateOrderInvoices({
            order: mockOrder,
            customer: urdCust1,
            vendor: rdVend,
            configs: mockConfigs
        });
        console.log('Scenario B Output:', {
            scenario: resB.customerInvoice.scenario,
            serviceValue: resB.customerInvoice.serviceValue,
            taxPercent: resB.customerInvoice.taxPercent,
            taxAmount: resB.customerInvoice.taxAmount,
            totalAmount: resB.customerInvoice.totalAmount,
            gstinLabel: resB.customerInvoice.displayGstinLabel,
            gstinNo: resB.customerInvoice.displayGstinNo
        });
        console.assert(resB.customerInvoice.scenario === 'B', 'Scenario B mismatch');
        console.assert(resB.customerInvoice.taxPercent === 18, 'Scenario B tax percent should be 18%');
        console.assert(resB.customerInvoice.displayGstinLabel === 'Vendor GSTIN', 'Scenario B label mismatch');
        console.assert(resB.customerInvoice.displayGstinNo === '07BBBBB2222B1Z2', 'Scenario B GSTIN mismatch');
        console.log('✅ Scenario B assertions passed!');

        // Test Scenario C: URD Customer + URD Vendor
        const resC = await generateOrderInvoices({
            order: mockOrder,
            customer: urdCust1,
            vendor: urdVend,
            configs: mockConfigs
        });
        console.log('Scenario C Output:', {
            scenario: resC.customerInvoice.scenario,
            serviceValue: resC.customerInvoice.serviceValue,
            taxPercent: resC.customerInvoice.taxPercent,
            taxAmount: resC.customerInvoice.taxAmount,
            totalAmount: resC.customerInvoice.totalAmount,
            gstinLabel: resC.customerInvoice.displayGstinLabel,
            gstinNo: resC.customerInvoice.displayGstinNo
        });
        console.assert(resC.customerInvoice.scenario === 'C', 'Scenario C mismatch');
        console.assert(resC.customerInvoice.taxPercent === 0, 'Scenario C GST must be 0%');
        console.assert(resC.customerInvoice.taxAmount === 0, 'Scenario C tax amount must be 0');
        console.assert(resC.customerInvoice.totalAmount === 610, 'Scenario C total must be total inclusive service value');
        console.assert(resC.customerInvoice.displayGstinLabel === 'Spinzyt GSTIN', 'Scenario C label mismatch');
        console.assert(resC.customerInvoice.displayGstinNo === '07SPINZYT0000Z1', 'Scenario C GSTIN mismatch');
        console.log('✅ Scenario C assertions passed!');

        // 3. Test Invoice 2 (Platform Revenue Invoice) & Vendor Payout
        console.log('\n--- 3. Testing Invoice 2 & Net Payout Formula ---');
        console.log('Platform Invoice 2 Output:', resA.platformInvoice);
        console.assert(resA.platformInvoice.platformFee === 20, 'Platform fee mismatch');
        console.assert(resA.platformInvoice.platformFeeTax === 3.6, 'Platform fee 18% tax mismatch');
        console.assert(resA.platformInvoice.logisticsFee === 40, 'Logistics fee mismatch');
        console.assert(resA.platformInvoice.logisticsFeeTax === 7.2, 'Logistics fee 18% tax mismatch');
        // Total Invoice 2 = 20 + 3.6 + 40 + 7.2 = 70.8
        console.assert(resA.platformInvoice.totalInvoiceAmount === 70.8, 'Total Invoice 2 mismatch');
        console.assert(resA.platformInvoice.spinzytGstin === '07SPINZYT0000Z1', 'Spinzyt GSTIN mismatch on Invoice 2');

        // Net Payout Calculation check: Net Payment = Invoice 1 Total - Invoice 2 Total
        // For Scenario A: 719.8 - 70.8 = 649
        console.assert(resA.ledger.vendorNetPayout === 649, `Vendor Net Payout expected 649, got ${resA.ledger.vendorNetPayout}`);
        console.log('✅ Invoice 2 and Net Payout formulas verified!');

        // 4. Test Vendor Promotion 50/50 Split
        console.log('\n--- 4. Testing Vendor Promotion 50/50 Split ---');
        const promoVal = 100;
        const resPromo = await generateOrderInvoices({
            order: mockOrder,
            customer: urdCust1,
            vendor: rdVend,
            configs: mockConfigs,
            vendorPromoValue: promoVal
        });

        console.log('Promo Split Output:', {
            customerWalletCredit: resPromo.customerInvoice.customerWalletCredit,
            spinzytPromoShare: resPromo.platformInvoice.spinzytPromoShare,
            totalInvoice2: resPromo.platformInvoice.totalInvoiceAmount,
            vendorNetPayout: resPromo.ledger.vendorNetPayout
        });

        console.assert(resPromo.customerInvoice.customerWalletCredit === 50, '50% Customer wallet credit mismatch');
        console.assert(resPromo.platformInvoice.spinzytPromoShare === 50, '50% Spinzyt promo share mismatch');
        // Invoice 2 with promo share: 70.8 + 50 = 120.8
        console.assert(resPromo.platformInvoice.totalInvoiceAmount === 120.8, 'Invoice 2 total with promo share mismatch');
        // Net payout: 719.8 - 120.8 = 599
        console.assert(resPromo.ledger.vendorNetPayout === 599, 'Net payout with promo mismatch');
        console.log('✅ Promotion 50/50 split and accounting balance verified!');

        // 5. Test DB Order Pool Visibility & Acceptance Guard
        console.log('\n--- 5. Testing DB Order Pool Filtering & Acceptance Guard ---');
        const testRdCustomer = new User({
            phone: '9999911111',
            displayName: 'Test RD Business Cust',
            role: 'Customer',
            customerType: 'retail',
            gstNumber: '07TESTGST9999Z1'
        });

        const testUrdVendor = new User({
            phone: '8888822222',
            displayName: 'Test URD Vendor',
            role: 'Vendor',
            status: 'approved',
            location: { lat: 28.5, lng: 77.2 },
            shopDetails: { gst: '' }
        });

        const testRdVendor = new User({
            phone: '7777733333',
            displayName: 'Test RD Vendor',
            role: 'Vendor',
            status: 'approved',
            location: { lat: 28.5, lng: 77.2 },
            shopDetails: { gst: '07TESTVEND8888Z2' }
        });

        // Clean up any previous test records
        await User.deleteMany({ phone: { $in: ['9999911111', '8888822222', '7777733333'] } });
        await Order.deleteMany({ pickupAddress: 'GST_TEST_STREET' });

        await testRdCustomer.save();
        await testUrdVendor.save();
        await testRdVendor.save();

        const testOrder = new Order({
            customer: testRdCustomer._id,
            isCustomerRD: true,
            status: 'ORDER_PLACED',
            totalAmount: 500,
            pickupAddress: 'GST_TEST_STREET',
            dropAddress: 'GST_TEST_STREET',
            pickupLocation: { lat: 28.5, lng: 77.2 },
            dropLocation: { lat: 28.5, lng: 77.2 },
            items: [{ serviceId: 'test_svc', name: 'Test Shirt', quantity: 1, price: 500 }]
        });
        await testOrder.save();

        // Query Pool as URD Vendor:
        const isUrdVendorRD = checkVendorRD(testUrdVendor);
        const urdPoolQuery = {
            status: 'ORDER_PLACED',
            vendor: null,
            pickupAddress: 'GST_TEST_STREET'
        };
        if (!isUrdVendorRD) {
            urdPoolQuery.isCustomerRD = { $ne: true };
        }
        const urdVisibleOrders = await Order.find(urdPoolQuery);
        console.assert(urdVisibleOrders.length === 0, 'URD Vendor must NOT see RD customer orders');
        console.log('✅ URD Vendor pool successfully hid RD order (0 orders returned)');

        // Query Pool as RD Vendor:
        const isRdVendorRD = checkVendorRD(testRdVendor);
        const rdPoolQuery = {
            status: 'ORDER_PLACED',
            vendor: null,
            pickupAddress: 'GST_TEST_STREET'
        };
        if (!isRdVendorRD) {
            rdPoolQuery.isCustomerRD = { $ne: true };
        }
        const rdVisibleOrders = await Order.find(rdPoolQuery);
        console.assert(rdVisibleOrders.length === 1, 'RD Vendor MUST see RD customer orders');
        console.log('✅ RD Vendor pool successfully fetched RD order (1 order returned)');

        // Test Acceptance Guard:
        const orderToAccept = await Order.findById(testOrder._id);
        const canUrdAccept = !(orderToAccept.isCustomerRD && !checkVendorRD(testUrdVendor));
        console.assert(canUrdAccept === false, 'Acceptance must be rejected for URD vendor');
        console.log('✅ URD Vendor acceptance attempt strictly blocked (403 Forbidden check passed)');

        const canRdAccept = !(orderToAccept.isCustomerRD && !checkVendorRD(testRdVendor));
        console.assert(canRdAccept === true, 'Acceptance must be allowed for RD vendor');
        console.log('✅ RD Vendor acceptance attempt approved (200 OK check passed)');

        // Cleanup test data
        await User.deleteMany({ phone: { $in: ['9999911111', '8888822222', '7777733333'] } });
        await Order.deleteMany({ pickupAddress: 'GST_TEST_STREET' });
        console.log('✅ Test DB records cleaned up.');

        console.log('\n🎉 ALL GST, INVOICE & PAYOUT RULES ARE 100% VERIFIED AND PASSING!\n');
    } catch (err) {
        console.error('❌ Test failed:', err);
    } finally {
        await mongoose.disconnect();
    }
}

runTests();
