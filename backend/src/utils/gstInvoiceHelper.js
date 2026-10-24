import SystemConfig from '../models/SystemConfig.js';
import { resolvePartyAddress, stateCodeFromGstin, stateCodeFromName } from './gstStateCodes.js';

export const GST_SCENARIOS = Object.freeze({ RD_RD: 'RD_RD', URD_RD: 'URD_RD', URD_URD: 'URD_URD', BLOCKED: 'BLOCKED' });

export class GstConfigurationError extends Error {
    constructor(message) { super(message); this.name = 'GstConfigurationError'; this.status = 503; }
}
export class GstEligibilityError extends Error {
    constructor(message = 'A GST-registered customer can only place an order with a GST-registered vendor.') {
        super(message); this.name = 'GstEligibilityError'; this.status = 403; this.code = 'GST_VENDOR_INELIGIBLE';
    }
}

export const normalizeGstin = value => String(value || '').replace(/\s+/g, '').toUpperCase();
export const isValidGstin = value => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(normalizeGstin(value));
export const customerGstin = customer => normalizeGstin(customer?.gstNumber || customer?.customerSnapshot?.gstNumber);
export const vendorGstin = vendor => normalizeGstin(vendor?.shopDetails?.gst || vendor?.gstNumber || vendor?.vendorSnapshot?.gstNumber);
export const checkCustomerRD = customer => isValidGstin(customerGstin(customer));
export const checkVendorRD = vendor => isValidGstin(vendorGstin(vendor));

export const resolveGstScenario = (customer, vendor) => {
    const customerRegistered = checkCustomerRD(customer);
    const vendorRegistered = checkVendorRD(vendor);
    if (customerRegistered && vendorRegistered) return GST_SCENARIOS.RD_RD;
    if (customerRegistered) return GST_SCENARIOS.BLOCKED;
    if (vendorRegistered) return GST_SCENARIOS.URD_RD;
    return GST_SCENARIOS.URD_URD;
};
const money = value => Math.round((Number(value) || 0) * 100) / 100;
const configuredRate = (value, key) => {
    if (value === '' || value === null || value === undefined) throw new GstConfigurationError(`Missing financial configuration: ${key}`);
    const rate = Number(value);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new GstConfigurationError(`Invalid financial configuration: ${key}`);
    return rate;
};

export const validateGstConfigs = configMap => {
    const invoiceSettings = configMap.invoice_settings || {};
    const spinzytGstin = normalizeGstin(configMap.spinzyt_gstin || invoiceSettings.gstNumber);
    if (!isValidGstin(spinzytGstin)) throw new GstConfigurationError('Missing or invalid financial configuration: spinzyt_gstin');
    const platformFeeFixed = configMap.platform_fee_fixed == null ? 0 : Number(configMap.platform_fee_fixed);
    if (!Number.isFinite(platformFeeFixed) || platformFeeFixed < 0) throw new GstConfigurationError('Invalid financial configuration: platform_fee_fixed');
    return {
        gstPercent: configuredRate(configMap.gst_percent, 'gst_percent'),
        platformFeeFixed,
        platformFeeGstPercent: configuredRate(configMap.platform_fee_gst_percent, 'platform_fee_gst_percent'),
        logisticsFeeGstPercent: configuredRate(configMap.logistics_fee_gst_percent, 'logistics_fee_gst_percent'),
        spinzytGstin,
        invoiceSettings
    };
};

export const getGstConfigs = async () => {
    const keys = ['gst_percent', 'platform_fee_fixed', 'platform_fee_gst_percent', 'logistics_fee_gst_percent', 'spinzyt_gstin', 'invoice_settings'];
    const configs = await SystemConfig.find({ key: { $in: keys } }).lean();
    const result = validateGstConfigs(Object.fromEntries(configs.map(config => [config.key, config.value])));
    const required = ['registeredAddress', 'platformSacCode', 'logisticsSacCode', 'promotionSacCode'];
    const missing = required.filter(key => !String(result.invoiceSettings[key] || '').trim());
    if (missing.length) throw new GstConfigurationError(`Complete Admin Invoice Settings before checkout: ${missing.join(', ')}`);
    return result;
};

const taxSplit = (taxAmount, rate, supplierStateCode, placeOfSupplyStateCode) => {
    if (!taxAmount) return { cgstRate: 0, cgstAmount: 0, sgstRate: 0, sgstAmount: 0, igstRate: 0, igstAmount: 0 };
    if (supplierStateCode && placeOfSupplyStateCode && supplierStateCode === placeOfSupplyStateCode) {
        const cgstAmount = money(taxAmount / 2);
        return { cgstRate: rate / 2, cgstAmount, sgstRate: rate / 2, sgstAmount: money(taxAmount - cgstAmount), igstRate: 0, igstAmount: 0 };
    }
    return { cgstRate: 0, cgstAmount: 0, sgstRate: 0, sgstAmount: 0, igstRate: rate, igstAmount: money(taxAmount) };
};

const partySnapshot = party => {
    const address = resolvePartyAddress(party);
    return { ...address, stateCode: stateCodeFromGstin(party?.gstNumber || party?.shopDetails?.gst) || address.stateCode };
};

export const buildGstSnapshot = ({ customer, vendor, order, configs, scenario }) => {
    const customerAddress = partySnapshot(customer || {});
    const vendorAddress = partySnapshot(vendor || {});
    if (!customerAddress.state && order?.analyticsLocation?.state) {
        customerAddress.state = order.analyticsLocation.state;
        customerAddress.stateCode = stateCodeFromName(order.analyticsLocation.state);
        customerAddress.city ||= order.analyticsLocation.city || '';
        customerAddress.pincode ||= order.analyticsLocation.pincode || '';
    }
    customerAddress.address ||= order?.dropAddress || order?.pickupAddress || '';
    vendorAddress.address ||= order?.vendorSnapshot?.address || '';
    return {
        scenario,
        customerRegistered: checkCustomerRD(customer), customerGstin: customerGstin(customer),
        vendorRegistered: checkVendorRD(vendor), vendorGstin: vendorGstin(vendor),
        spinzytGstin: configs.spinzytGstin,
        gstPercent: configs.gstPercent,
        platformFeeGstPercent: configs.platformFeeGstPercent,
        logisticsFeeGstPercent: configs.logisticsFeeGstPercent,
        customerName: customer?.businessName || customer?.displayName || order?.customerSnapshot?.displayName || '',
        customerAddress: customerAddress.address, customerCity: customerAddress.city,
        customerState: customerAddress.state, customerStateCode: customerAddress.stateCode,
        customerPincode: customerAddress.pincode,
        vendorName: vendor?.shopDetails?.name || vendor?.businessName || vendor?.displayName || order?.vendorSnapshot?.shopName || '',
        vendorAddress: vendorAddress.address, vendorCity: vendorAddress.city,
        vendorState: vendorAddress.state, vendorStateCode: vendorAddress.stateCode,
        vendorPincode: vendorAddress.pincode,
        capturedAt: new Date()
    };
};

const makeLine = ({ description, sacCode, quantity = 1, unit = 'service', unitPrice, taxableValue, gstRate, supplierStateCode, placeOfSupplyStateCode }) => {
    const taxAmount = money(taxableValue * gstRate / 100);
    const split = taxSplit(taxAmount, gstRate, supplierStateCode, placeOfSupplyStateCode);
    return {
        description, sacCode: String(sacCode || ''), quantity: Number(quantity) || 1, unit,
        unitPrice: money(unitPrice), taxableValue: money(taxableValue), gstRate,
        ...split, totalAmount: money(taxableValue + taxAmount)
    };
};

export const generateOrderInvoices = async ({ order, customer, vendor, configs = null, vendorPromoValue = 0 }) => {
    if (order.customerSnapshot?.gstNumber != null) {
        const plainCustomer = typeof customer?.toObject === 'function' ? customer.toObject() : customer;
        const frozen = typeof order.customerSnapshot.toObject === 'function' ? order.customerSnapshot.toObject() : order.customerSnapshot;
        customer = { ...plainCustomer, ...frozen, gstNumber: frozen.gstNumber };
    }
    const activeConfigs = configs ? validateGstConfigs({
        gst_percent: configs.gstPercent, platform_fee_fixed: configs.platformFeeFixed,
        platform_fee_gst_percent: configs.platformFeeGstPercent,
        logistics_fee_gst_percent: configs.logisticsFeeGstPercent,
        spinzyt_gstin: configs.spinzytGstin, invoice_settings: configs.invoiceSettings
    }) : await getGstConfigs();
    const scenario = resolveGstScenario(customer || order.customerSnapshot, vendor || order.vendorSnapshot);
    if (scenario === GST_SCENARIOS.BLOCKED) throw new GstEligibilityError();

    const snapshot = buildGstSnapshot({ customer, vendor, order, configs: activeConfigs, scenario });
    const baseWithArea = Number(order.priceBreakdown?.baseWithArea || 0);
    const expressSurcharge = Number(order.priceBreakdown?.expressSurcharge || 0);
    const platformFee = Number(order.priceBreakdown?.platformFee ?? activeConfigs.platformFeeFixed ?? 0);
    const vendorPlatformFee = activeConfigs.platformFeeFixed;
    const hasStoredTax = order.orderType !== 'Walk-In' && order.priceBreakdown?.gstAmount != null;
    // Pre-fix paid orders did not tax customer fees. Retain those historical
    // terms; new checkouts always persist feeGstPercent explicitly.
    const feeGstPercent = Number(order.priceBreakdown?.feeGstPercent ?? (hasStoredTax ? 0 : activeConfigs.gstPercent));
    const logisticsFee = Number(order.priceBreakdown?.logisticsFee ?? order.deliveryCharge ?? 0);
    const grossServiceValue = money(baseWithArea + expressSurcharge + platformFee + logisticsFee);
    const taxable = scenario !== GST_SCENARIOS.URD_URD;
    const customerSupplierState = snapshot.vendorStateCode;
    const customerPlaceOfSupply = snapshot.customerStateCode;

    const expressFactor = baseWithArea > 0 ? (baseWithArea + expressSurcharge) / baseWithArea : 1;
    let customerLines = (order.items || []).map(item => {
        const quantity = Number(item.quantity) || 1;
        const unitPrice = Number(item.price) || 0;
        const value = money(unitPrice * quantity * expressFactor);
        const rate = taxable ? Number(item.gstPercent ?? activeConfigs.gstPercent) : 0;
        return makeLine({ description: item.name, sacCode: item.sacCode, quantity, unit: item.unit || 'service', unitPrice, taxableValue: value, gstRate: rate, supplierStateCode: customerSupplierState, placeOfSupplyStateCode: customerPlaceOfSupply });
    });
    if (platformFee) customerLines.push(makeLine({ description: 'Platform facilitation included in customer price', sacCode: activeConfigs.invoiceSettings.platformSacCode, unitPrice: platformFee, taxableValue: platformFee, gstRate: taxable ? feeGstPercent : 0, supplierStateCode: customerSupplierState, placeOfSupplyStateCode: customerPlaceOfSupply }));
    if (logisticsFee) customerLines.push(makeLine({ description: 'Pickup and delivery included in customer price', sacCode: activeConfigs.invoiceSettings.logisticsSacCode, unitPrice: logisticsFee, taxableValue: logisticsFee, gstRate: taxable ? feeGstPercent : 0, supplierStateCode: customerSupplierState, placeOfSupplyStateCode: customerPlaceOfSupply }));

    const storedCheckoutTax = order.orderType !== 'Walk-In' && Number.isFinite(Number(order.priceBreakdown?.gstAmount)) ? Number(order.priceBreakdown.gstAmount) : null;
    let taxAmount = taxable ? money(storedCheckoutTax ?? customerLines.reduce((sum, line) => sum + line.cgstAmount + line.sgstAmount + line.igstAmount, 0)) : 0;
    const calculatedTax = money(customerLines.reduce((sum, line) => sum + line.cgstAmount + line.sgstAmount + line.igstAmount, 0));
    const adjustment = money(taxAmount - calculatedTax);
    const lastTaxable = [...customerLines].reverse().find(line => line.gstRate > 0);
    if (lastTaxable && adjustment) {
        if (lastTaxable.igstRate) lastTaxable.igstAmount = money(lastTaxable.igstAmount + adjustment);
        else lastTaxable.sgstAmount = money(lastTaxable.sgstAmount + adjustment);
        lastTaxable.totalAmount = money(lastTaxable.totalAmount + adjustment);
    }
    const itemRates = [...new Set(customerLines.filter(line => line.gstRate > 0).map(line => line.gstRate))];
    const taxPercent = taxable ? (itemRates.length === 1 ? itemRates[0] : activeConfigs.gstPercent) : 0;
    const platformCheckoutDiscount = money(order.checkoutDiscountAmount ?? (order.ledger?.promoOwnerType === 'PLATFORM' ? order.discountAmount : 0));
    // URD vendors issue a zero-GST invoice for the agreed inclusive amount.
    // Never discard the tax component already included in checkout/payment.
    const inclusiveCheckoutTax = !taxable && order.orderType !== 'Walk-In'
        ? money(order.priceBreakdown?.gstAmount) : 0;
    if (inclusiveCheckoutTax) {
        const weights = customerLines.map(line => line.taxableValue);
        const weightTotal = weights.reduce((sum, value) => sum + value, 0);
        let remaining = inclusiveCheckoutTax;
        customerLines.forEach((line, index) => {
            const share = index === customerLines.length - 1 ? remaining
                : money(inclusiveCheckoutTax * (weightTotal ? weights[index] / weightTotal : 0));
            remaining = money(remaining - share);
            line.taxableValue = money(line.taxableValue + share);
            line.unitPrice = money(line.taxableValue / line.quantity);
            line.totalAmount = line.taxableValue;
        });
    }
    const serviceValue = money(grossServiceValue + inclusiveCheckoutTax - platformCheckoutDiscount);
    const invoice1Total = money(serviceValue + taxAmount);
    const customerTaxSplit = customerLines.reduce((sum, line) => ({
        cgstAmount: money(sum.cgstAmount + line.cgstAmount), sgstAmount: money(sum.sgstAmount + line.sgstAmount), igstAmount: money(sum.igstAmount + line.igstAmount)
    }), { cgstAmount: 0, sgstAmount: 0, igstAmount: 0 });
    const legacyScenario = scenario === GST_SCENARIOS.RD_RD ? 'A' : scenario === GST_SCENARIOS.URD_RD ? 'B' : 'C';
    const display = scenario === GST_SCENARIOS.RD_RD ? ['Customer GSTIN', snapshot.customerGstin] : scenario === GST_SCENARIOS.URD_RD ? ['Vendor GSTIN', snapshot.vendorGstin] : ['Spinzyt GSTIN', snapshot.spinzytGstin];
    const preparedAt = new Date();
    // A vendor-funded benefit cannot exceed that vendor's available earnings.
    const feeCharges = money(vendorPlatformFee * (1 + activeConfigs.platformFeeGstPercent / 100) + logisticsFee * (1 + activeConfigs.logisticsFeeGstPercent / 100));
    const totalPromoDiscount = money(Math.min(Math.max(0, vendorPromoValue), Math.max(0, invoice1Total - feeCharges)));
    const customerWalletShare = money(totalPromoDiscount / 2);
    const spinzytPromoShare = money(totalPromoDiscount - customerWalletShare);
    const customerInvoice = {
        invoiceNo: '', documentStatus: 'DRAFT', financialYear: '', invoiceDate: null, finalizedAt: null,
        scenario: legacyScenario, gstScenario: scenario, issuerName: snapshot.vendorName,
        supplierGstin: snapshot.vendorGstin, recipientGstin: snapshot.customerGstin,
        supplierAddress: snapshot.vendorAddress, supplierStateCode: customerSupplierState,
        recipientAddress: snapshot.customerAddress, recipientStateCode: snapshot.customerStateCode,
        placeOfSupplyStateCode: customerPlaceOfSupply, reverseCharge: false, currency: 'INR',
        lineItems: customerLines, discountAmount: platformCheckoutDiscount,
        ...customerTaxSplit, serviceValue, taxPercent, taxAmount,
        displayGstinLabel: display[0], displayGstinNo: display[1],
        customerWalletCredit: customerWalletShare, totalAmount: invoice1Total,
        preparedAt, generatedAt: null
    };

    const spinzytState = stateCodeFromGstin(snapshot.spinzytGstin);
    const vendorPlaceOfSupply = snapshot.vendorStateCode;
    const platformFeeTax = money(vendorPlatformFee * activeConfigs.platformFeeGstPercent / 100);
    const logisticsFeeTax = money(logisticsFee * activeConfigs.logisticsFeeGstPercent / 100);
    const platformLines = [
        makeLine({ description: 'Platform Facilitation Fee', sacCode: activeConfigs.invoiceSettings.platformSacCode, unitPrice: vendorPlatformFee, taxableValue: vendorPlatformFee, gstRate: activeConfigs.platformFeeGstPercent, supplierStateCode: spinzytState, placeOfSupplyStateCode: vendorPlaceOfSupply }),
        makeLine({ description: 'Logistics / Transportation Fee', sacCode: activeConfigs.invoiceSettings.logisticsSacCode, unitPrice: logisticsFee, taxableValue: logisticsFee, gstRate: activeConfigs.logisticsFeeGstPercent, supplierStateCode: spinzytState, placeOfSupplyStateCode: vendorPlaceOfSupply })
    ];
    if (spinzytPromoShare) platformLines.push(makeLine({ description: 'Spinzyt promotion share', sacCode: activeConfigs.invoiceSettings.promotionSacCode, unitPrice: spinzytPromoShare, taxableValue: spinzytPromoShare, gstRate: 0, supplierStateCode: spinzytState, placeOfSupplyStateCode: vendorPlaceOfSupply }));
    const platformTaxSplit = platformLines.reduce((sum, line) => ({
        cgstAmount: money(sum.cgstAmount + line.cgstAmount), sgstAmount: money(sum.sgstAmount + line.sgstAmount), igstAmount: money(sum.igstAmount + line.igstAmount)
    }), { cgstAmount: 0, sgstAmount: 0, igstAmount: 0 });
    const totalInvoice2Amount = money(vendorPlatformFee + platformFeeTax + logisticsFee + logisticsFeeTax + spinzytPromoShare);
    const platformInvoice = {
        invoiceNo: '', documentStatus: 'DRAFT', financialYear: '', invoiceDate: null, finalizedAt: null,
        issuerName: activeConfigs.invoiceSettings.businessName || 'Spinzyt', recipientName: snapshot.vendorName,
        recipientGstin: snapshot.vendorGstin, supplierAddress: activeConfigs.invoiceSettings.registeredAddress || '',
        supplierStateCode: spinzytState, recipientAddress: snapshot.vendorAddress,
        recipientStateCode: snapshot.vendorStateCode, placeOfSupplyStateCode: vendorPlaceOfSupply,
        reverseCharge: false, currency: 'INR', lineItems: platformLines, ...platformTaxSplit,
        platformFee: vendorPlatformFee, platformFeeTaxPercent: activeConfigs.platformFeeGstPercent, platformFeeTax,
        logisticsFee, logisticsFeeTaxPercent: activeConfigs.logisticsFeeGstPercent, logisticsFeeTax,
        spinzytGstin: snapshot.spinzytGstin, spinzytPromoShare,
        totalInvoiceAmount: totalInvoice2Amount, preparedAt, generatedAt: null
    };

    const vendorNetPayout = money(invoice1Total - totalInvoice2Amount - customerWalletShare);
    const ledger = {
        vendorNetPayout, customerWalletCredit: customerWalletShare, platformFee: vendorPlatformFee,
        spinzytCombinedRevenue: totalInvoice2Amount, appliedPromoValue: totalPromoDiscount,
        promoOwnerType: totalPromoDiscount > 0 ? 'VENDOR' : (order.ledger?.promoOwnerType || 'NONE'),
        invoice1Total, invoice2Total: totalInvoice2Amount, spinzytPromoShare
    };
    if (['A', 'B', 'C'].includes(legacyScenario)) {
        const services = customerLines.slice(0, (order.items || []).length);
        customerInvoice.presentation = {
            version: 'registered-pair-reference-v1',
            businessName: activeConfigs.invoiceSettings.businessName || '',
            spinzytGstin: snapshot.spinzytGstin,
            customerId: String(customer?._id || order.customer?._id || order.customer || ''),
            vendorId: String(vendor?._id || order.vendor?._id || order.vendor || ''),
            serviceLineCount: services.length,
            serviceTypes: (order.items || []).map(item => item.serviceType || item.unit || 'Service'),
            serviceSubtotal: money(services.reduce((sum, line) => sum + line.taxableValue, 0)),
            serviceTax: money(services.reduce((sum, line) => sum + line.cgstAmount + line.sgstAmount + line.igstAmount, 0)),
            platformFee: vendorPlatformFee, platformFeeTax,
            logisticsFee, logisticsFeeTax, vendorNetPayout
        };
    }
    if (['A','B','C'].includes(legacyScenario)) {
        platformInvoice.presentation = {
            version: 'platform-reference-v1', scenario: legacyScenario,
            vendorId: customerInvoice.presentation.vendorId, vendorName: snapshot.vendorName,
            services: customerInvoice.lineItems.slice(0, customerInvoice.presentation.serviceLineCount).map(line => ({ ...line })),
            serviceTypes: [...customerInvoice.presentation.serviceTypes],
            serviceSubtotal: customerInvoice.presentation.serviceSubtotal,
            serviceTax: customerInvoice.presentation.serviceTax,
            customerTotal: customerInvoice.totalAmount, vendorNetPayout
        };
    }
    return { customerInvoice, platformInvoice, ledger, gstSnapshot: snapshot };
};
