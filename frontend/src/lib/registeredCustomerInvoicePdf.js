import { platformReferenceInvoiceView } from './platformReferenceInvoice';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getBrandLogoDataUrl } from './brandAssets';
import { registeredCustomerInvoiceView } from './registeredCustomerInvoice';

export async function downloadRegisteredCustomerInvoicePdf(order, settings = {}, platform = false) {
    const view = platform ? platformReferenceInvoiceView(order, settings) : registeredCustomerInvoiceView(order, settings);
    const doc = new jsPDF();
    const money = value => typeof value === 'number' && Number.isFinite(value) ? `INR ${value.toFixed(2)}` : 'Not recorded';
    doc.setFillColor(218, 216, 218); doc.rect(12, 12, 186, 43, 'F');
    doc.setTextColor(118, 55, 129); doc.setFontSize(18);
    doc.text(doc.splitTextToSize(view.company, 138), 16, 24);
    doc.setFontSize(10); doc.setTextColor(41, 82, 96);
    doc.text([view.website, view.email, ...(view.gst.placement === 'header' && view.gst.value ? [`GST # ${view.gst.value}`] : [])], 19, 41);
    if (view.showLogo) {
        try { doc.addImage(await getBrandLogoDataUrl(), 'PNG', 166, 16, 27, 30); }
        catch { /* The recorded invoice remains printable if the logo cannot load. */ }
    }
    doc.setTextColor(16, 16, 16); doc.setFontSize(10);
    autoTable(doc, { startY: 63, theme: 'plain', styles: { fontSize: 9, cellPadding: 2, overflow: 'linebreak' }, margin: { left: 12, right: 12 },
        columnStyles: { 0: { cellWidth: 99 }, 1: { cellWidth: 87 } },
        body: platform ? [[`Invoice No: ${view.invoiceNo}`, `Order No: ${view.orderNo}`], [`Vendor ID: ${view.vendorId}`, `Date: ${view.date}`], [`Vendor Name: ${view.vendorName}`, '']] : [[`Date: ${view.date}`, ''], [`Invoice No: ${view.invoiceNo}`, `Order No: ${view.orderNo}`], [`Customer ID: ${view.customerId}`, `Vendor ID: ${view.vendorId}`], [`Customer Name: ${view.customerName}`, `Vendor Name: ${view.vendorName}`], ...(view.gst.placement === 'customer' ? [[`Customer GST: ${view.gst.value || 'Not recorded'}`, '']] : view.gst.placement === 'vendor' ? [['', `Vendor GST: ${view.gst.value || 'Not recorded'}`]] : [])] });
    autoTable(doc, { startY: doc.lastAutoTable.finalY + 6, margin: { left: 12, right: 12 }, styles: { fontSize: 8, cellPadding: 2, lineWidth: 0.2, lineColor: [124,129,139] }, headStyles: { fillColor: [56,100,139], textColor: 255 },
        head: [['Item Description', 'SAC', 'Service Type', 'Qty / Weight', 'Unit Price', 'Total']],
        body: view.services.map((line, index) => [line.description, line.sacCode || '', view.serviceTypes[index] || line.unit || 'Service', line.quantity, money(line.unitPrice), money(line.taxableValue)]),
        columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 15 }, 2: { cellWidth: 28 }, 3: { cellWidth: 22 }, 4: { cellWidth: 30 }, 5: { cellWidth: 31 } } });
    const summary = [['Subtotal Services',view.serviceSubtotal],...(view.showServiceTax ? [['Service GST',view.serviceTax]] : []), ...(view.discount > 0 ? [['Platform checkout discount',-view.discount]] : []), ['Amount Charged to the Customer',view.customerTotal],['Logistics Fee',view.logisticsFee],['Logistics Fee GST',view.logisticsTax],['Platform Fee',view.platformFee],['Platform GST',view.platformTax],['Net Payout to Vendor',view.netPayout]];
    autoTable(doc, { startY: doc.lastAutoTable.finalY, margin: { left: 12, right: 12 }, theme: 'grid', styles: { fontSize: 9, cellPadding: 2, fillColor: [233,235,240], textColor: [16,16,16], fontStyle: 'bold', lineColor: [124,129,139], lineWidth: 0.2 }, columnStyles: { 0: { cellWidth: 155 }, 1: { cellWidth: 31, halign: 'right' } }, body: summary.map(([label,value]) => [label,money(value)]) });
    const notes = [...(platform ? [`Total platform charges: ${money(view.platformCharges)} | Platform tax ${view.platformFeeTaxPercent}% | Logistics tax ${view.logisticsFeeTaxPercent}%`, ...(view.spinzytPromoShare > 0 ? [`Spinzyt Promo Share: ${money(view.spinzytPromoShare)}`] : [])] : []), ...(platform || view.showServiceTax ? [] : ['Service tax rate: 0% (unregistered vendor).']), view.taxRows.map(([label,value]) => `${label}: ${money(value)}`).join(' | '), `Supplier Address: ${view.supplierAddress || 'Not recorded'}`, `Recipient Address: ${view.recipientAddress || 'Not recorded'}`, `Place of supply: ${view.placeOfSupply || 'Not recorded'}`, view.note, view.paymentInstructions, view.terms].filter(Boolean);
    let y = doc.lastAutoTable.finalY + 7; doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(82,96,120);
    for (const note of notes) for (const line of doc.splitTextToSize(note, 184)) { if (y > 280) { doc.addPage(); y = 15; } doc.text(line,12,y); y += 4; }
    doc.save(`Invoice_${platform ? 'platform_vendor' : 'customer'}_${view.invoiceNo.replace(/[^a-z0-9-]/gi,'_')}.pdf`);
}
