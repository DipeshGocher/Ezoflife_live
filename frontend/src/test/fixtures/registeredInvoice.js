export function registeredInvoiceFixture() {
    const items = [
        ['Regular Laundry (Wash & Fold)',5,60,'per_kg','Per Kg'],
        ['Premium Silk Saree',2,250,'per_item','Dry Clean'],
        ["Men's Formal Shirt",4,20,'per_item','Steam Iron'],
        ['Bed Linens',2,90,'per_kg','Wash & Iron']
    ].map(([name,quantity,price,unit,serviceType]) => ({ name,quantity,price,unit,serviceType }));
    const lines = items.map(item => ({ description: item.name, quantity: item.quantity, unitPrice: item.price, unit: item.unit, sacCode: '9994', taxableValue: item.quantity * item.price, cgstAmount: item.quantity * item.price * .09, sgstAmount: item.quantity * item.price * .09, totalAmount: Math.round(item.quantity * item.price * 1.18 * 100) / 100 }));
    return {
        _id: 'order-1', orderId: '#SPZ-98765', status: 'DELIVERED', items,
        customer: { _id: 'CUST-001', displayName: 'Registered Customer' }, vendor: { _id: 'VEN-001', displayName: 'Registered Laundry' },
        gstSnapshot: { customerName: 'Registered Customer' },
        invoices: { customerInvoice: { scenario: 'A', gstScenario: 'RD_RD', documentStatus: 'FINALIZED', invoiceNo: 'SZ1/26-27/000001', invoiceDate: '2026-05-05T06:00:00Z', issuerName: 'Registered Laundry', recipientGstin: '23ABCDE1234F1Z5', supplierGstin: '23ABCDE4321F1Z5', supplierAddress: 'Vendor address, Indore', recipientAddress: 'Customer address, Indore', placeOfSupplyStateCode: '23', totalAmount: 1323.96, cgstAmount: 101.98, sgstAmount: 101.98,
            lineItems: [...lines, { description: 'Platform facilitation included in customer price', sacCode: '998311', quantity: 1, taxableValue: 22, unitPrice: 22, totalAmount: 25.96 }, { description: 'Pickup and delivery included in customer price', sacCode: '996511', quantity: 1, taxableValue: 40, unitPrice: 40, totalAmount: 47.2 }],
            presentation: { businessName: 'EZOFLIFE TECHNOLOGY LLP', customerId: 'CUST-001', vendorId: 'VEN-001', serviceLineCount: 4, serviceTypes: items.map(item => item.serviceType), serviceSubtotal: 1060, serviceTax: 190.8, logisticsFee: 40, logisticsFeeTax: 7.2, platformFee: 22, platformFeeTax: 3.96, vendorNetPayout: 1250.8 }
        } }
    };
}

export const invoiceGstNumbers = { customer: '23ABCDE1234F1Z5', vendor: '23ABCDE4321F1Z5', spinzyt: '23PQRST9012L1Z3' };
export function customerInvoiceScenarioFixture(scenario) {
    const order = registeredInvoiceFixture();
    const invoice = order.invoices.customerInvoice;
    invoice.scenario = scenario; invoice.gstScenario = { A: 'RD_RD', B: 'URD_RD', C: 'URD_URD' }[scenario];
    invoice.recipientGstin = scenario === 'A' ? invoiceGstNumbers.customer : '';
    invoice.supplierGstin = scenario !== 'C' ? invoiceGstNumbers.vendor : '';
    invoice.displayGstinLabel = { A: 'Customer GSTIN', B: 'Vendor GSTIN', C: 'Spinzyt GSTIN' }[scenario];
    invoice.displayGstinNo = { A: invoiceGstNumbers.customer, B: invoiceGstNumbers.vendor, C: invoiceGstNumbers.spinzyt }[scenario];
    invoice.presentation.spinzytGstin = invoiceGstNumbers.spinzyt;
    order.gstSnapshot.spinzytGstin = invoiceGstNumbers.spinzyt;
    // Live profiles deliberately retain both numbers: the recorded scenario wins.
    order.customer.gstNumber = invoiceGstNumbers.customer; order.vendor.gstNumber = invoiceGstNumbers.vendor;
    if (scenario === 'C') {
        invoice.presentation.serviceTax = 0; invoice.presentation.vendorNetPayout = 1060;
        invoice.totalAmount = 1133.16; invoice.cgstAmount = 0; invoice.sgstAmount = 0;
        invoice.lineItems.forEach(line => { line.cgstAmount = 0; line.sgstAmount = 0; line.totalAmount = line.taxableValue; });
    }
    return order;
}

export function unregisteredPlatformInvoiceFixture() {
    const order = customerInvoiceScenarioFixture('C');
    order.invoices.platformInvoice = {
        documentStatus: 'FINALIZED', invoiceNo: 'SZ2/26-27/000001', invoiceDate: '2026-05-05T06:00:00Z',
        issuerName: 'EZOFLIFE TECHNOLOGY LLP', recipientName: 'Vendor Name', recipientGstin: '',
        spinzytGstin: invoiceGstNumbers.spinzyt, supplierAddress: 'Spinzyt address', recipientAddress: 'Vendor address', placeOfSupplyStateCode: '23',
        platformFee: 22, platformFeeTax: 3.96, platformFeeTaxPercent: 18, logisticsFee: 40, logisticsFeeTax: 7.2, logisticsFeeTaxPercent: 18,
        totalInvoiceAmount: 73.16, cgstAmount: 5.58, sgstAmount: 5.58, spinzytPromoShare: 0,
        lineItems: [{ description: 'Platform Facilitation Fee', sacCode: '998311', taxableValue: 22, totalAmount: 25.96 }, { description: 'Logistics / Transportation Fee', sacCode: '996511', taxableValue: 40, totalAmount: 47.2 }],
        presentation: { version: 'unregistered-platform-reference-v1', scenario: 'C', vendorId: 'VEN-001', vendorName: 'Unregistered Vendor', services: order.invoices.customerInvoice.lineItems.slice(0,4).map(line => ({ ...line })), serviceTypes: order.items.map(item => item.serviceType), serviceSubtotal: 1060, customerTotal: 1133.16, vendorNetPayout: 1060 }
    };
    return order;
}

export function registeredPlatformInvoiceFixture(scenario = 'A') {
    const order = customerInvoiceScenarioFixture(scenario);
    const platform = unregisteredPlatformInvoiceFixture().invoices.platformInvoice;
    platform.recipientGstin = invoiceGstNumbers.vendor; platform.recipientName = 'Registered Vendor';
    platform.presentation = { ...platform.presentation, version: 'platform-reference-v1', scenario, vendorName: 'Registered Vendor',
        services: order.invoices.customerInvoice.lineItems.slice(0,4).map(line => ({ ...line })), serviceTax: 190.8,
        customerTotal: 1323.96, vendorNetPayout: 1250.8 };
    order.invoices.platformInvoice = platform;
    return order;
}
