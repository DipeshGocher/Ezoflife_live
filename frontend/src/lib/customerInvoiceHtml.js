const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const money = value => `₹${Number(value || 0).toFixed(2)}`;
/** Print only the server's frozen customer invoice, never recompute financials. */
export function renderCustomerInvoiceHtml(order, settings = {}) {
    const invoice = order.invoices?.customerInvoice;
    if (invoice?.documentStatus !== 'FINALIZED' || !invoice.invoiceNo || order.status !== 'DELIVERED') {
        throw new Error('The final invoice is available after delivery.');
    }
    const row = (label, value) => `<tr><td colspan="5">${escapeHtml(label)}</td><td>${value}</td></tr>`;
    const lines = invoice.lineItems.map(line => `<tr>
        <td>${escapeHtml(line.description)}</td><td>${escapeHtml(line.sacCode)}</td><td>${escapeHtml(line.quantity)}</td>
        <td>${money(line.unitPrice)}</td><td>${Number(line.gstRate)}%</td><td>${money(line.totalAmount)}</td></tr>`).join('');
    return `<!doctype html><html><head><meta charset="UTF-8"><title>Invoice ${escapeHtml(invoice.invoiceNo)}</title>
    <style>body{font:14px Arial,sans-serif;color:#172033;margin:36px}h1{font-size:24px}table{width:100%;border-collapse:collapse;margin:24px 0}td,th{padding:12px;border-bottom:1px solid #ddd;text-align:left}td:last-child{text-align:right}.total{font-weight:bold;font-size:18px}@media print{button{display:none}}</style></head><body>
    <img src="/logo.png" alt="Spinzyt" style="height:72px"><h1>${invoice.scenario === 'C' ? 'Customer Invoice' : 'Customer Tax Invoice'}</h1>
    <p>Invoice No: ${escapeHtml(invoice.invoiceNo)}<br>Date: ${escapeHtml(new Date(invoice.invoiceDate).toLocaleDateString('en-IN'))}<br>Order: ${escapeHtml(order.orderId)}</p>
    <p>Issued by: ${escapeHtml(invoice.issuerName)}<br>${escapeHtml(invoice.supplierAddress)}<br>${invoice.supplierGstin ? `Vendor GSTIN: ${escapeHtml(invoice.supplierGstin)}` : `${escapeHtml(invoice.displayGstinLabel)}: ${escapeHtml(invoice.displayGstinNo)}`}</p>
    <p>Customer: ${escapeHtml(order.gstSnapshot?.customerName || order.customerSnapshot?.displayName || order.customer?.displayName)}<br>${escapeHtml(invoice.recipientAddress)}${invoice.recipientGstin ? `<br>Customer GSTIN: ${escapeHtml(invoice.recipientGstin)}` : ''}</p>
    <table><thead><tr><th>Description</th><th>SAC</th><th>Quantity</th><th>Unit price</th><th>GST</th><th>Total</th></tr></thead><tbody>${lines}
    ${invoice.discountAmount ? row('Platform checkout discount', `− ${money(invoice.discountAmount)}`) : ''}
    ${row('Service value', money(invoice.serviceValue))}
    ${invoice.cgstAmount ? row('CGST', money(invoice.cgstAmount)) : ''}
    ${invoice.sgstAmount ? row('SGST', money(invoice.sgstAmount)) : ''}
    ${invoice.igstAmount ? row('IGST', money(invoice.igstAmount)) : ''}
    ${invoice.scenario === 'C' ? row('Vendor GST (0%)', money(0)) : ''}
    ${invoice.customerWalletCredit ? row('Customer wallet promotion credit', money(invoice.customerWalletCredit)) : ''}
    ${row('Total customer payment', `<strong>${money(invoice.totalAmount)}</strong>`)}
    </tbody></table><p>${escapeHtml(settings.invoiceNote || 'Computer generated invoice.')}</p>
    <button onclick="window.print()">Print / Save PDF</button></body></html>`;
}
