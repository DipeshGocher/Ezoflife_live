import { invoiceMoney } from '../utils/invoiceFormat';

const invoiceStyles = `
.invoice-document{box-sizing:border-box;width:100%;max-width:900px;margin:0 auto;background:#fff;color:#172033;font:14px/1.5 Arial,sans-serif;padding:32px;overflow-wrap:anywhere}
.invoice-document *{box-sizing:border-box}.invoice-document p,.invoice-document h1,.invoice-document h2{margin:0}
.invoice-document .invoice-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding-bottom:24px;border-bottom:2px solid #172033}
.invoice-document .invoice-heading>div{min-width:0}.invoice-document h1{font-size:24px;line-height:1.2;letter-spacing:-.5px;font-weight:750}
.invoice-document .invoice-kicker{color:#52627a;font-size:12px;font-weight:700;margin-bottom:8px}.invoice-document .invoice-logo{width:72px;height:72px;object-fit:contain;flex-shrink:0}
.invoice-document .invoice-contact{margin-top:12px;color:#52627a;font-size:12px}.invoice-document .invoice-draft{padding:10px 12px;background:#fff4d8;color:#795000;margin-bottom:18px;border-radius:8px}
.invoice-document .invoice-meta{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;padding:24px 0}
.invoice-document .invoice-meta>div{min-width:0}.invoice-document .invoice-meta h2{font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:#64748b;margin-bottom:8px}
.invoice-document .invoice-meta p{margin-bottom:5px;font-size:12px}.invoice-document .invoice-meta strong{font-weight:700}
.invoice-document .invoice-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px}
.invoice-document .invoice-table th{padding:12px 8px;background:#f1f5f9;color:#52627a;text-align:right;font-size:11px}
.invoice-document .invoice-table th:first-child{width:32%;text-align:left}.invoice-document .invoice-table td{padding:14px 8px;text-align:right;border-bottom:1px solid #e5eaf0;vertical-align:top;font-variant-numeric:tabular-nums}
.invoice-document .invoice-table td:first-child{text-align:left}.invoice-document .invoice-line-name{display:block;font-weight:700}.invoice-document .invoice-line-note{display:block;color:#64748b;font-size:11px;margin-top:4px}.invoice-document .invoice-line-tax{display:block;color:#64748b;font-size:11px}
.invoice-document .invoice-summary{max-width:440px;margin:24px 0 0 auto;display:grid;gap:10px}
.invoice-document .invoice-summary-row{display:flex;justify-content:space-between;gap:16px;font-size:12px}.invoice-document .invoice-summary-row span{min-width:0}.invoice-document .invoice-summary-row strong{white-space:nowrap;font-variant-numeric:tabular-nums}
.invoice-document .invoice-grand-total{background:#172033;color:#fff;padding:16px;border-radius:10px;font-size:14px;font-weight:700}
.invoice-document .invoice-note{margin-top:24px;padding:14px;background:#f8fafc;border:1px solid #e5eaf0;border-radius:10px;font-size:12px;color:#52627a}
.invoice-document .invoice-footer{margin-top:28px;padding-top:16px;border-top:1px solid #e5eaf0;font-size:11px;color:#64748b;text-align:center}
@media screen and (max-width:600px){
.invoice-document{padding:20px 16px;font-size:13px}.invoice-document h1{font-size:20px;line-height:1.3}.invoice-document .invoice-heading{gap:12px;padding-bottom:18px}.invoice-document .invoice-logo{width:48px;height:48px}
.invoice-document .invoice-meta{grid-template-columns:1fr;gap:16px;padding:20px 0}.invoice-document .invoice-meta>div{padding-bottom:12px;border-bottom:1px solid #e5eaf0}
.invoice-document .invoice-table,.invoice-document .invoice-table tbody{display:block}.invoice-document .invoice-table thead{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
.invoice-document .invoice-table tr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;border:1px solid #e5eaf0;border-radius:12px;padding:14px;margin-bottom:12px}
.invoice-document .invoice-table td{display:block;width:auto!important;border:0;padding:0;text-align:left!important;font-size:12px;min-width:0}
.invoice-document .invoice-table td:first-child{grid-column:1/-1;padding-bottom:10px;border-bottom:1px solid #e5eaf0}
.invoice-document .invoice-table td[data-label]::before{content:attr(data-label);display:block;font-size:10px;color:#64748b;margin-bottom:3px;font-weight:500}
.invoice-document .invoice-summary{max-width:none;margin-top:18px}.invoice-document .invoice-grand-total{font-size:13px;padding:14px}
}
@media print{.invoice-document{max-width:none;padding:0;font-size:11px;print-color-adjust:exact;-webkit-print-color-adjust:exact}.invoice-document .invoice-table tr,.invoice-document .invoice-summary,.invoice-document .invoice-heading{break-inside:avoid}.invoice-document .invoice-table thead{display:table-header-group}@page{size:A4;margin:12mm}}
`;

export default function InvoiceDocument({ id, title, issuerName, gstin, finalized, settings = {}, metadata, lines, summary, totalLabel, total, note }) {
  return <article id={id} className="invoice-document">
    <style>{invoiceStyles}</style>
    {!finalized && <p className="invoice-draft">Draft — Not a Tax Invoice</p>}
    <header className="invoice-heading">
      <div><p className="invoice-kicker">{title}</p><h1>{issuerName}</h1>
        <div className="invoice-contact">{gstin && <p>{gstin}</p>}<p>www.spinzyt.com · {settings.contactEmail || 'connect@spinzyt.com'}</p></div>
      </div>
      {settings.showLogo !== false && <img className="invoice-logo" src="/logo.png" alt="Spinzyt" />}
    </header>
    <section className="invoice-meta">{metadata.map(group => <div key={group.title}>
      <h2>{group.title}</h2>{group.rows.filter(row => row.value !== undefined && row.value !== null && row.value !== '').map(row =>
        <p key={row.label}><strong>{row.label}: </strong>{row.value}</p>)}
    </div>)}</section>
    <table className="invoice-table"><thead><tr>{['Description', 'Quantity', 'Unit price', 'Taxable value', 'GST', 'Total'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{lines.map((line, i) => <tr key={i}>
        <td><span className="invoice-line-name">{line.description}</span><span className="invoice-line-note">SAC {line.sacCode || '—'} · {(line.unit || 'service').replaceAll('_', ' ')}</span></td>
        <td data-label="Quantity">{line.quantity ?? 1}</td><td data-label="Unit price">{invoiceMoney(line.unitPrice)}</td>
        <td data-label="Taxable value">{invoiceMoney(line.taxableValue)}</td>
        <td data-label="GST"><span>{Number(line.gstRate || 0)}%</span><span className="invoice-line-tax">{invoiceMoney(Number(line.cgstAmount || 0) + Number(line.sgstAmount || 0) + Number(line.igstAmount || 0))}</span></td>
        <td data-label="Total"><strong>{invoiceMoney(line.totalAmount ?? line.taxableValue)}</strong></td>
      </tr>)}</tbody>
    </table>
    <section className="invoice-summary" aria-label="Invoice totals">
      {summary.filter(row => row.show !== false).map(row => <div className="invoice-summary-row" key={row.label}><span>{row.label}</span><strong>{row.value}</strong></div>)}
      <div className="invoice-summary-row invoice-grand-total"><span>{totalLabel}</span><strong>{invoiceMoney(total)}</strong></div>
    </section>
    {note && <p className="invoice-note">{note}</p>}
    <footer className="invoice-footer"><p>{settings.invoiceNote || 'This is a computer-generated invoice and does not require a physical signature.'}</p>{settings.showTerms !== false && settings.customTerms && <p>{settings.customTerms}</p>}</footer>
  </article>;
}
