export { DEFAULT_INVOICE_SETTINGS, normalizeInvoiceSettings, escapeInvoiceText } from '../../../shared/invoiceSettings.mjs';

// Keep existing PDF geometry; fit branding to its left header column.
export function drawInvoiceContactDetails(doc, settings) {
    const fit = (value, width) => {
        const text = String(value || '').replace(/\s+/g, ' ');
        const lines = doc.splitTextToSize(text, width);
        return lines.length > 1 ? `${lines[0].slice(0, -3)}...` : (lines[0] || '');
    };
    doc.setFontSize(7);
    doc.text(fit([settings.contactEmail, settings.contactPhone].filter(Boolean).join(' | '), 105), 15, 31);
    doc.text(fit(settings.businessAddress, 105), 15, 36);
}

export function drawInvoiceFooter(doc, settings, startY) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    let y = startY;
    const blocks = [settings.invoiceNote, settings.paymentInstructions, settings.showTerms ? settings.customTerms : ''].filter(Boolean);
    for (const block of blocks) {
        for (const line of doc.splitTextToSize(block, 180)) {
            if (y > doc.internal.pageSize.getHeight() - 15) { doc.addPage(); y = 20; }
            doc.text(line, 15, y);
            y += 4;
        }
        y += 3;
    }
}

export function drawInvoiceBusinessName(doc, name) {
    let text = String(name || '').replace(/\s+/g, ' ');
    doc.setFontSize(22);
    while (doc.getTextWidth(text) > 105 && doc.getFontSize() > 10) doc.setFontSize(doc.getFontSize() - 1);
    if (doc.getTextWidth(text) > 105) {
        while (text.length && doc.getTextWidth(`${text}...`) > 105) text = text.slice(0, -1);
        text += '...';
    }
    doc.text(text, 15, 20);
}
