import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import InvoicePrint from '../../admin/components/InvoicePrint';
import PlatformRevenueInvoicePrint from './PlatformRevenueInvoicePrint';

export default function InvoicePreview({ order, onClose }) {
  const [active, setActive] = useState('invoice1');
  const [printError, setPrintError] = useState('');
  const closeButton = useRef(null);
  const content = useRef(null);
  const dialog = useRef(null);
  const selectedInvoice = active === 'invoice1' ? order.invoices?.customerInvoice : order.invoices?.platformInvoice;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const root = document.getElementById('root');
    const previousInert = root?.inert;
    document.body.style.overflow = 'hidden';
    document.body.setAttribute('data-invoice-preview-open', 'true');
    if (root) root.inert = true;
    closeButton.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.removeAttribute('data-invoice-preview-open');
      if (root) root.inert = previousInert;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  const print = () => {
    const invoice = content.current?.querySelector('.invoice-document');
    if (!invoice) return;
    const win = window.open('', '_blank', 'width=1000,height=800');
    if (!win) { setPrintError('Allow popups for this site to print or save the invoice as PDF.'); return; }
    setPrintError('');
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${active === 'invoice1' ? 'Customer invoice' : 'Platform charges invoice'}</title></head><body>${invoice.outerHTML}</body></html>`);
    win.document.close();
    Promise.all([...win.document.images].map(img => img.complete ? Promise.resolve() : new Promise(resolve => { img.onload = resolve; img.onerror = resolve; })))
      .then(() => { if (!win.closed) { win.focus(); win.print(); } });
  };

  const onKeyDown = event => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    if (event.key !== 'Tab') return;
    const controls = [...dialog.current.querySelectorAll('button:not(:disabled)')];
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  return createPortal(<div className="invoice-preview-overlay" role="dialog" aria-modal="true" aria-labelledby="invoice-preview-title" ref={dialog} onKeyDown={onKeyDown}>
    <style>{`
      body[data-invoice-preview-open] [data-bottom-navigation]{display:none!important}
      .invoice-preview-overlay{position:fixed;inset:0;z-index:10000;background:#edf1f5;display:flex;flex-direction:column;height:100dvh;overflow:hidden;color:#172033;font-family:Arial,sans-serif}
      .invoice-preview-toolbar{padding:max(12px,env(safe-area-inset-top)) 16px 12px;background:#172033;color:white;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-shrink:0}
      .invoice-preview-toolbar h2{margin:0;font-size:15px;font-weight:700;overflow-wrap:anywhere}.invoice-preview-toolbar p{margin:4px 0 0;font-size:12px;color:#cbd5e1}
      .invoice-preview-actions{display:flex;gap:8px;flex-shrink:0}.invoice-preview-overlay button{min-height:44px;border:0;cursor:pointer;font:600 12px Arial,sans-serif;border-radius:10px}
      .invoice-preview-overlay button:focus-visible{outline:2px solid #60a5fa;outline-offset:2px}
      .invoice-preview-print{display:flex;align-items:center;gap:8px;padding:10px 14px;background:#2563eb;color:white}.invoice-preview-print:disabled{opacity:.5;cursor:not-allowed}.invoice-preview-close{display:grid;place-items:center;width:44px;background:#ffffff15;color:white}
      .invoice-preview-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;max-width:940px;width:100%;margin:0 auto;padding:12px 16px;flex-shrink:0}
      .invoice-preview-tab{padding:10px;background:#e2e8f0;color:#52627a;text-align:left}.invoice-preview-tab[aria-selected=true]{background:white;color:#172033;box-shadow:0 1px 4px #17203315}.invoice-preview-tab small{display:block;margin-top:5px;font-size:11px;font-weight:400}
      .invoice-preview-scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:0 16px max(20px,env(safe-area-inset-bottom))}.invoice-preview-paper{max-width:900px;margin:0 auto;box-shadow:0 2px 12px #1720330d}
      .invoice-preview-error{padding:10px 16px;margin:0;font-size:12px;background:#fff4d8;color:#795000}
      @media(max-width:600px){.invoice-preview-toolbar{padding-left:12px;padding-right:8px}.invoice-preview-toolbar p{display:none}.invoice-preview-toolbar h2{font-size:13px}.invoice-preview-print{padding:10px}.invoice-preview-print span{display:none}.invoice-preview-tabs{padding:10px 8px;gap:6px}.invoice-preview-tab small{font-size:10px}.invoice-preview-scroll{padding-left:0;padding-right:0}.invoice-preview-paper{box-shadow:none}}
    `}</style>
    <header className="invoice-preview-toolbar"><div><h2 id="invoice-preview-title">Order invoices · {order.orderId || order._id}</h2><p>{active === 'invoice1' ? 'Issued by the vendor to the customer' : 'Issued by Spinzyt to the vendor'}</p></div>
      <div className="invoice-preview-actions"><button className="invoice-preview-print" onClick={print} disabled={selectedInvoice?.documentStatus !== 'FINALIZED'} aria-label="Print or save invoice as PDF"><Printer size={18} /><span>Print / PDF</span></button><button className="invoice-preview-close" ref={closeButton} onClick={onClose} aria-label="Close invoice preview"><X size={22} /></button></div>
    </header>
    <div className="invoice-preview-tabs" role="tablist" aria-label="Invoice type">{[
      ['invoice1', 'Invoice 1 · Customer', 'Vendor → Customer'], ['invoice2', 'Invoice 2 · Platform', 'Spinzyt → Vendor'],
    ].map(([id, label, direction]) => <button key={id} id={`tab-${id}`} role="tab" className="invoice-preview-tab" aria-selected={active === id} aria-controls="invoice-preview-panel" onClick={() => { setActive(id); setPrintError(''); content.current?.scrollTo?.(0, 0); }}>{label}<small>{direction}</small></button>)}</div>
    {printError && <p className="invoice-preview-error" role="status">{printError}</p>}
    <div className="invoice-preview-scroll" id="invoice-preview-panel" role="tabpanel" aria-labelledby={`tab-${active}`} ref={content}>
      <div className="invoice-preview-paper">{active === 'invoice1' ? <InvoicePrint order={order} /> : <PlatformRevenueInvoicePrint order={order} />}</div>
    </div>
  </div>, document.body);
}
