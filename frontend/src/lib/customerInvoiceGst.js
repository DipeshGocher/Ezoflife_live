const clean = value => typeof value === 'string' ? value.trim() : '';
const scenarios = { RD_RD: 'A', URD_RD: 'B', URD_URD: 'C', A: 'A', B: 'B', C: 'C' };

/** The customer copy displays one GST number. Never copy both tax identities into it. */
export function customerInvoiceGst(order, settings = {}, invoice = order.invoices?.customerInvoice) {
    const snapshot = order.gstSnapshot || {};
    const finalized = invoice?.documentStatus === 'FINALIZED';
    const customer = order.customer || order.user || {};
    const vendor = order.vendor || {};
    const customerNumber = clean(invoice?.recipientGstin ?? snapshot.customerGstin ?? (finalized ? '' : customer.gstNumber));
    const vendorNumber = clean(invoice?.supplierGstin ?? snapshot.vendorGstin ?? (finalized ? '' : vendor.shopDetails?.gst || vendor.gstNumber));
    const scenario = scenarios[invoice?.gstScenario] || scenarios[invoice?.scenario] || scenarios[snapshot.scenario]
        || (customerNumber && vendorNumber ? 'A' : !customerNumber && vendorNumber ? 'B' : !customerNumber && !vendorNumber ? 'C' : null);
    if (scenario === 'A') return { scenario, owner: 'customer', label: 'Customer GST', value: customerNumber, placement: 'customer' };
    if (scenario === 'B') return { scenario, owner: 'vendor', label: 'Vendor GST', value: vendorNumber, placement: 'vendor' };
    const platformNumber = !invoice?.displayGstinLabel || /spinzyt/i.test(invoice.displayGstinLabel) ? invoice?.displayGstinNo : '';
    if (scenario === 'C') return { scenario, owner: 'spinzyt', label: 'Spinzyt GST', value: clean(platformNumber || snapshot.spinzytGstin || invoice?.presentation?.spinzytGstin || (finalized ? '' : settings.gstNumber)), placement: 'header' };
    return { scenario: null, owner: null, label: '', value: '', placement: null };
}

export const usesCustomerReferenceTemplate = invoice => Boolean(scenarios[invoice?.gstScenario] || scenarios[invoice?.scenario]);
