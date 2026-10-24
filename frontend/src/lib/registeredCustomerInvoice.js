import { customerInvoiceGst } from './customerInvoiceGst.js';
const text = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const amount = value => typeof value === 'number' && Number.isFinite(value) ? `₹${value.toFixed(2)}` : 'Not recorded';
const tax = line => Number(line.cgstAmount || 0) + Number(line.sgstAmount || 0) + Number(line.igstAmount || 0);

export function registeredCustomerInvoiceView(order, settings = {}, invoice = order.invoices?.customerInvoice) {
    const snapshot = order.gstSnapshot || {};
    const gst = customerInvoiceGst(order, settings, invoice);
    const presentation = invoice.presentation || {};
    const platform = order.invoices?.platformInvoice;
    const allLines = invoice.lineItems || [];
    const serviceCount = presentation.serviceLineCount ?? (order.items?.length || allLines.length);
    const services = allLines.slice(0, serviceCount);
    const feeLines = allLines.slice(serviceCount);
    const customer = order.customer || order.user || {};
    const vendor = order.vendor || {};
    const id = value => typeof value === 'object' ? value?._id : value;
    return {
        finalized: invoice.documentStatus === 'FINALIZED', invoiceNo: invoice.invoiceNo || 'Pending delivery',
        date: invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Finalized on delivery',
        company: presentation.businessName || settings.businessName || 'EZOFLIFE TECHNOLOGY LLP',
        website: settings.website || 'www.spinzyt.com', email: settings.contactEmail || 'connect@spinzyt.com',
        logo: /^https?:\/\//i.test(settings.logo || '') ? settings.logo : '/logo.png', showLogo: settings.showLogo !== false,
        customerId: presentation.customerId || id(customer) || order.customerSnapshot?.customerId || 'Not recorded',
        vendorId: presentation.vendorId || id(vendor) || order.vendorSnapshot?.vendorId || 'Not recorded',
        customerName: snapshot.customerName || order.customerSnapshot?.displayName || customer.displayName || 'Not recorded',
        vendorName: invoice.issuerName || snapshot.vendorName || order.vendorSnapshot?.shopName || 'Not recorded',
        gst, showServiceTax: gst.scenario !== 'C',
        serviceTypes: (presentation.serviceTypes || (order.items || []).map(item => item.serviceType || '')).map(value => String(value).replaceAll('_', ' ').replace(/\b[a-z]/g, letter => letter.toUpperCase())),
        orderNo: order.orderId || order.orderNo || order._id || 'Not recorded', services, feeLines,
        serviceSubtotal: presentation.serviceSubtotal ?? services.reduce((sum, line) => sum + Number(line.taxableValue || 0), 0),
        serviceTax: presentation.serviceTax ?? services.reduce((sum, line) => sum + tax(line), 0),
        customerTotal: invoice.totalAmount, discount: invoice.discountAmount,
        platformFee: presentation.platformFee ?? platform?.platformFee,
        platformTax: presentation.platformFeeTax ?? platform?.platformFeeTax,
        logisticsFee: presentation.logisticsFee ?? platform?.logisticsFee,
        logisticsTax: presentation.logisticsFeeTax ?? platform?.logisticsFeeTax,
        netPayout: presentation.vendorNetPayout ?? order.ledger?.vendorNetPayout,
        taxRows: ['cgst', 'sgst', 'igst'].filter(key => invoice[`${key}Amount`] > 0).map(key => [key.toUpperCase(), invoice[`${key}Amount`]]),
        supplierAddress: invoice.supplierAddress, recipientAddress: invoice.recipientAddress,
        placeOfSupply: invoice.placeOfSupplyStateCode, note: settings.invoiceNote || 'This is a computer generated invoice.',
        terms: settings.showTerms !== false ? settings.customTerms : '', paymentInstructions: settings.paymentInstructions
    };
}

export const registeredInvoiceStyles = `
.registered-invoice{box-sizing:border-box;max-width:940px;width:100%;margin:auto;padding:28px 30px;background:white;color:#101010;font-family:Arial,sans-serif;overflow-wrap:anywhere}.registered-invoice *{box-sizing:border-box}.registered-invoice p{margin:0}.registered-invoice .reference-banner{min-height:185px;display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding:30px 20px;background-color:#d9d7d8;background-image:linear-gradient(30deg,#e4dfe5 12%,transparent 12.5%,transparent 87%,#e4dfe5 87.5%);background-size:52px 70px}.registered-invoice .reference-banner>div{min-width:0}.registered-invoice .reference-company{font-size:29px;line-height:1.35;font-weight:500;letter-spacing:2px;color:#763781;margin:0 0 20px}.registered-invoice .reference-contact{font-size:15px;line-height:1.5;color:#295260}.registered-invoice .reference-logo{width:125px;height:125px;object-fit:contain;flex-shrink:0}.registered-invoice .reference-meta{display:grid;grid-template-columns:1.2fr 1fr;gap:26px 40px;margin:30px 0;font:19px/1.4 Georgia,'Times New Roman',serif}.registered-invoice .reference-meta p{margin:0 0 3px}.registered-invoice .reference-parties{margin-top:22px}.registered-invoice .reference-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:14px}.registered-invoice .reference-table th,.registered-invoice .reference-table td{border:1px solid #7c818b;padding:7px 6px;text-align:left;vertical-align:top}.registered-invoice .reference-table th{background:#38648b;color:#fff;font-weight:700}.registered-invoice .reference-table th:first-child{width:34%}.registered-invoice .reference-table th:nth-child(2){width:7%}.registered-invoice .reference-table th:nth-child(3){width:17%}.registered-invoice .reference-table th:nth-child(4){width:14%}.registered-invoice .reference-table th:nth-child(5){width:14%}.registered-invoice .reference-table th:last-child{width:14%}.registered-invoice .reference-table tbody{background:#f8f8fc}.registered-invoice .reference-table .reference-inclusive{display:block;color:#536078;font-size:9px;line-height:1.4;margin-top:3px}.registered-invoice .reference-summary td{background:#e9ebf0;font-weight:700}.registered-invoice .reference-summary td:last-child{text-align:right;white-space:nowrap}.registered-invoice .reference-summary .reference-net td{border-top:18px solid white;font-size:16px}.registered-invoice .reference-draft{padding:12px;background:#fff4d8;color:#795000;margin-bottom:12px}.registered-invoice .reference-footer{font-size:10px;line-height:1.5;color:#526078;margin-top:18px}.registered-invoice .reference-footer p{margin-bottom:5px}.registered-invoice .reference-tax{display:flex;flex-wrap:wrap;gap:6px 20px;margin:10px 0}.registered-invoice .reference-fee-detail{font-size:10px;margin-top:10px;line-height:1.5}
@media screen and (max-width:600px){.registered-invoice{padding:16px 12px}.registered-invoice .reference-banner{padding:18px 12px;min-height:135px;gap:12px}.registered-invoice .reference-company{font-size:17px;letter-spacing:1px;margin-bottom:12px}.registered-invoice .reference-logo{width:65px;height:65px}.registered-invoice .reference-contact{font-size:11px}.registered-invoice .reference-meta{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:15px;font-size:13px;margin:20px 0}.registered-invoice .reference-table{font-size:10px}.registered-invoice .reference-table th,.registered-invoice .reference-table td{padding:5px 3px}.registered-invoice .reference-summary .reference-net td{font-size:12px}.registered-invoice .reference-table th:first-child{width:31%}.registered-invoice .reference-table th:nth-child(2){width:9%}.registered-invoice .reference-table th:nth-child(3){width:16%}.registered-invoice .reference-table th:nth-child(4){width:13%}.registered-invoice .reference-table th:nth-child(5){width:14%}.registered-invoice .reference-table th:last-child{width:17%}.registered-invoice .reference-summary td:last-child{white-space:normal}.registered-invoice .reference-summary .reference-net td:last-child{font-size:10px;white-space:nowrap}.registered-invoice .reference-inclusive{display:none!important}}
@media print{.registered-invoice{padding:0;max-width:none;print-color-adjust:exact;-webkit-print-color-adjust:exact}.registered-invoice .reference-table tr{break-inside:avoid}.registered-invoice .reference-banner{break-inside:avoid}.registered-invoice .reference-table thead{display:table-header-group}.invoice-print-actions{display:none!important}@page{size:A4;margin:12mm}}
`;

export function renderRegisteredCustomerInvoice(order, settings = {}, invoice = order.invoices?.customerInvoice, options = {}) {
    const view = options.view || registeredCustomerInvoiceView(order, settings, invoice);
    const row = (label, value, cls = '') => `<tr class="${cls}"><td colspan="5">${text(label)}</td><td>${amount(value)}</td></tr>`;
    const serviceType = (line, index) => view.serviceTypes[index] || line.unit?.replaceAll('_', ' ') || 'Service';
    return `<article id="invoice-content" class="invoice-document registered-invoice" aria-label="${options.platform ? 'Spinzyt to vendor invoice' : 'Vendor to customer invoice'}"><style>${registeredInvoiceStyles}</style>
    ${view.finalized ? '' : '<p class="reference-draft">Draft — Not a Tax Invoice</p>'}
    <header class="reference-banner"><div><h1 class="reference-company">${text(view.company)}</h1><p class="reference-contact">${text(view.website)}<br>${text(view.email)}${view.gst.placement === 'header' && view.gst.value ? `<br><span data-invoice-gst="spinzyt">GST # ${text(view.gst.value)}</span>` : ''}</p></div>${view.showLogo ? `<img class="reference-logo" src="${text(view.logo)}" alt="Spinzyt">` : ''}</header>
    ${options.platform ? `<section class="reference-meta"><div><p><strong>Invoice No:</strong> ${text(view.invoiceNo)}</p><p><strong>Vendor ID:</strong> ${text(view.vendorId)}</p><p><strong>Vendor Name:</strong> ${text(view.vendorName)}</p></div><div><p><strong>Order No:</strong> ${text(view.orderNo)}</p><p><strong>Date:</strong> ${text(view.date)}</p></div></section>` : `    <section class="reference-meta"><div><p><strong>Date:</strong> ${text(view.date)}</p><p><strong>Invoice No:</strong> ${text(view.invoiceNo)}</p><p><strong>Customer ID:</strong> ${text(view.customerId)}</p><div class="reference-parties"><p><strong>Customer Name:</strong> ${text(view.customerName)}</p>${view.gst.placement === 'customer' ? `<p data-invoice-gst="customer"><strong>${text(view.gst.label)}:</strong> ${text(view.gst.value || 'Not recorded')}</p>` : ''}</div></div>
    <div><p>&nbsp;</p><p><strong>Order No:</strong> ${text(view.orderNo)}</p><p><strong>Vendor ID:</strong> ${text(view.vendorId)}</p><div class="reference-parties"><p><strong>Vendor Name:</strong> ${text(view.vendorName)}</p>${view.gst.placement === 'vendor' ? `<p data-invoice-gst="vendor"><strong>${text(view.gst.label)}:</strong> ${text(view.gst.value || 'Not recorded')}</p>` : ''}</div></div></section>
`}
    <table class="reference-table"><thead><tr>${['Item Description','SAC','Service Type','Qty / Weight','Unit Price','Total'].map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead>
    <tbody>${view.services.map((line, index) => `<tr><td>${text(line.description)}</td><td>${text(line.sacCode)}</td><td>${text(serviceType(line,index))}</td><td>${text(line.quantity)} ${text(line.unit === 'per_kg' || line.unit === 'kg' ? 'kg' : line.unit === 'per_item' ? 'Units' : '')}</td><td>${amount(line.unitPrice)}</td><td>${amount(line.taxableValue)}<small class="reference-inclusive">Including tax ${amount(line.totalAmount)}</small></td></tr>`).join('')}</tbody>
    <tbody class="reference-summary">${row('Subtotal Services',view.serviceSubtotal)}${view.showServiceTax ? row('Service GST',view.serviceTax) : ''}${view.discount > 0 ? row('Platform checkout discount',-view.discount) : ''}${row('Amount Charged to the Customer',view.customerTotal)}${row('Logistics Fee',view.logisticsFee)}${row('Logistics Fee GST',view.logisticsTax)}${row('Platform Fee',view.platformFee)}${row('Platform GST',view.platformTax)}${row('Net Payout to Vendor',view.netPayout,'reference-net')}</tbody></table>
    <footer class="reference-footer">${options.platform ? `<p><strong>Total platform charges:</strong> ${amount(view.platformCharges)} · Platform tax ${text(view.platformFeeTaxPercent)}% · Logistics tax ${text(view.logisticsFeeTaxPercent)}%</p>${view.spinzytPromoShare > 0 ? `<p>Spinzyt Promo Share: ${amount(view.spinzytPromoShare)}</p>` : ''}` : view.showServiceTax ? '' : '<p>Service tax rate: 0% (unregistered vendor).</p>'}<div class="reference-tax">${view.taxRows.map(([label,value]) => `<span><strong>${label}:</strong> ${amount(value)}</span>`).join('')}</div>
    ${view.feeLines.length ? `<div class="reference-fee-detail">${view.feeLines.map(line => `${text(line.description)} · SAC ${text(line.sacCode)} · Total including tax ${amount(line.totalAmount)}`).join('<br>')}</div>` : ''}
    <p><strong>Supplier Address:</strong> ${text(view.supplierAddress || 'Not recorded')}</p><p><strong>Recipient Address:</strong> ${text(view.recipientAddress || 'Not recorded')}</p><p><strong>Place of supply:</strong> ${text(view.placeOfSupply || 'Not recorded')}</p><p>${text(view.note)}</p>${view.paymentInstructions ? `<p>${text(view.paymentInstructions)}</p>` : ''}${view.terms ? `<p>${text(view.terms)}</p>` : ''}</footer></article>`;
}
