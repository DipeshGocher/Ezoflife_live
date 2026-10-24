import { usesPlatformReferenceTemplate } from './platformReferenceInvoice';
import { usesCustomerReferenceTemplate, customerInvoiceGst } from './customerInvoiceGst';
import { downloadRegisteredCustomerInvoicePdf } from './registeredCustomerInvoicePdf';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/** Export the server's finalized amounts and identity without repricing them. */
export function downloadFinalizedInvoice(order, type = 'customer', settings = {}) {
    const invoice = type === 'customer' ? order.invoices?.customerInvoice : order.invoices?.platformInvoice;
    if (invoice?.documentStatus !== 'FINALIZED' || !invoice.invoiceNo) throw new Error('The final invoice is available after delivery.');
    if (type === 'customer' && usesCustomerReferenceTemplate(invoice)) return downloadRegisteredCustomerInvoicePdf(order, settings);
    if (type === 'platform_vendor' && usesPlatformReferenceTemplate(order, invoice)) return downloadRegisteredCustomerInvoicePdf(order, settings, true);
    const doc = new jsPDF();
    const money = value => Number(value || 0).toFixed(2);
    doc.setFontSize(18);
    doc.text(invoice.issuerName || 'Invoice', 15, 20);
    doc.setFontSize(10);
    doc.text(`Invoice: ${invoice.invoiceNo}`, 15, 30);
    doc.text(`Order: ${order.orderId || order._id}`, 15, 37);
    doc.text(`Date: ${new Date(invoice.invoiceDate).toLocaleDateString('en-IN')}`, 15, 44);
    doc.text(`Supplier: ${invoice.supplierAddress || ''}`, 15, 53, { maxWidth: 180 });
    doc.text(`Recipient: ${invoice.recipientAddress || ''}`, 15, 66, { maxWidth: 180 });
    if (type === 'customer') {
        const gst = customerInvoiceGst(order, settings, invoice);
        if (gst.value) doc.text(gst.placement === 'header' ? `GST # ${gst.value}` : `${gst.label}: ${gst.value}`, 15, gst.placement === 'header' ? 50 : 79);
    } else {
        if (invoice.supplierGstin) doc.text(`Supplier GSTIN: ${invoice.supplierGstin}`, 15, 79);
        if (invoice.recipientGstin) doc.text(`Recipient GSTIN: ${invoice.recipientGstin}`, 15, 86);
    }
    autoTable(doc, {
        startY: 94,
        head: [['Description', 'Service code', 'Quantity', 'Unit price', 'Tax', 'Total']],
        body: (invoice.lineItems || []).map(line => [line.description, line.sacCode || '', line.quantity, money(line.unitPrice), money(Number(line.cgstAmount || 0) + Number(line.sgstAmount || 0) + Number(line.igstAmount || 0)), money(line.totalAmount)]),
        styles: { fontSize: 9 }, headStyles: { fillColor: [15, 23, 42] }
    });
    let y = doc.lastAutoTable.finalY + 12;
    if (y > 240) { doc.addPage(); y = 20; }
    if (invoice.discountAmount) { doc.text(`Discount: INR ${money(invoice.discountAmount)}`, 15, y); y += 8; }
    doc.text(`Total: INR ${money(invoice.totalAmount ?? invoice.totalInvoiceAmount)}`, 15, y);
    doc.save(`Invoice_${type}_${invoice.invoiceNo.replace(/[^a-z0-9-]/gi, '_')}.pdf`);
}
