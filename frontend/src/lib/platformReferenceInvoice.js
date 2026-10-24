import { registeredCustomerInvoiceView, renderRegisteredCustomerInvoice } from './registeredCustomerInvoice.js';

/** Invoice 2 references for both registered and unregistered vendors. */
export function usesPlatformReferenceTemplate(order, invoice = order.invoices?.platformInvoice) {
    const scenario = invoice?.presentation?.scenario || order.invoices?.customerInvoice?.gstScenario || order.invoices?.customerInvoice?.scenario || order.gstSnapshot?.scenario;
    return ['A', 'B', 'C', 'RD_RD', 'URD_RD', 'URD_URD'].includes(scenario);
}

export function platformReferenceInvoiceView(order, settings = {}, invoice = order.invoices?.platformInvoice) {
    const details = invoice.presentation || {};
    const customerInvoice = order.invoices?.customerInvoice || {};
    const scenario = details.scenario || customerInvoice.scenario || customerInvoice.gstScenario || order.gstSnapshot?.scenario;
    const registeredVendor = ['A','B','RD_RD','URD_RD'].includes(scenario);
    const original = registeredCustomerInvoiceView(order, settings, customerInvoice);
    return {
        ...original,
        finalized: invoice.documentStatus === 'FINALIZED', invoiceNo: invoice.invoiceNo || 'Pending delivery',
        date: invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Finalized on delivery',
        company: invoice.issuerName || settings.businessName || original.company,
        gst: { owner: 'spinzyt', placement: 'header', label: 'Spinzyt GST', value: invoice.spinzytGstin || order.gstSnapshot?.spinzytGstin || '' },
        vendorId: details.vendorId || original.vendorId,
        vendorName: details.vendorName || invoice.recipientName || order.gstSnapshot?.vendorName || 'Not recorded',
        services: details.services || original.services,
        serviceTypes: details.serviceTypes || original.serviceTypes,
        serviceSubtotal: details.serviceSubtotal ?? original.serviceSubtotal,
        customerTotal: details.customerTotal ?? customerInvoice.totalAmount,
        platformFee: invoice.platformFee, platformTax: invoice.platformFeeTax,
        logisticsFee: invoice.logisticsFee, logisticsTax: invoice.logisticsFeeTax,
        netPayout: details.vendorNetPayout ?? order.ledger?.vendorNetPayout,
        serviceTax: details.serviceTax ?? original.serviceTax,
        showServiceTax: registeredVendor, discount: 0, feeLines: invoice.lineItems || [],
        taxRows: ['cgst','sgst','igst'].filter(key => invoice[`${key}Amount`] > 0).map(key => [key.toUpperCase(),invoice[`${key}Amount`]]),
        supplierAddress: invoice.supplierAddress, recipientAddress: invoice.recipientAddress,
        placeOfSupply: invoice.placeOfSupplyStateCode,
        platformCharges: invoice.totalInvoiceAmount,
        platformFeeTaxPercent: invoice.platformFeeTaxPercent, logisticsFeeTaxPercent: invoice.logisticsFeeTaxPercent,
        spinzytPromoShare: invoice.spinzytPromoShare
    };
}

export function renderPlatformReferenceInvoice(order, settings = {}, invoice = order.invoices?.platformInvoice) {
    return renderRegisteredCustomerInvoice(order, settings, order.invoices?.customerInvoice || {}, { platform: true, view: platformReferenceInvoiceView(order, settings, invoice) });
}
