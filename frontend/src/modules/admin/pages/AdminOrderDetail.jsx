import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Package, User, Store, Clock, CheckCircle2, FileText, Printer, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatOrderDate, formatOrderMoney, formatOrderStatus, orderDetailView, orderInvoiceView } from '../utils/orderDetail';
import InvoicePrint from '../components/InvoicePrint';
import { adminApi } from '../../../lib/api';

export default function AdminOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceSettings, setInvoiceSettings] = useState({});

  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setRecord(null);
    setError(null);
    setLoading(true);
    setShowInvoice(false); setIssueError('');
    adminApi.getOrderDetail(id).then(data => {
      if (!data?._id || !Array.isArray(data.items)) throw new Error('Invalid order response.');
      if (!cancelled) setRecord({ id, data });
    }).catch(err => {
      if (!cancelled) setError({ status: err.status, message: err.message });
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id, retry]);

  useEffect(() => {
    let cancelled = false;
    adminApi.getConfig().then(configs => {
      const config = Array.isArray(configs) ? configs.find(item => item.key === 'invoice_settings') : null;
      if (!cancelled && config) setInvoiceSettings(config.value);
    }).catch(err => console.error('Failed to fetch invoice settings:', err));
    return () => { cancelled = true; };
  }, []);

  const currentRecord = record?.id === id ? record.data : null;
  const order = useMemo(() => currentRecord ? orderDetailView(currentRecord) : null, [currentRecord]);
  const invoice = useMemo(() => currentRecord ? orderInvoiceView(currentRecord.issuedInvoice ? { ...currentRecord.issuedInvoice.facts, invoiceNo: currentRecord.issuedInvoice.number, createdAt: currentRecord.issuedInvoice.issuedAt } : currentRecord) : null, [currentRecord]);
  const issueInvoice = async () => {
    const currentId = id; setIssuing(true); setIssueError('');
    try {
      const issuedInvoice = await adminApi.issueInvoice(currentRecord._id);
      setRecord(current => current?.id === currentId ? { ...current, data: { ...current.data, issuedInvoice } } : current);
    } catch (err) { setIssueError(err.message || 'Unable to issue invoice.'); }
    finally { setIssuing(false); }
  };

  const handlePrint = () => {
    const content = document.getElementById('invoice-content');
    if (!content || !order) return;
    const popup = window.open('', '', 'width=900,height=1000');
    if (!popup) { toast.error('Allow popups to print this invoice.'); return; }
    // Copy the application's loaded CSS, rather than relying on a CDN script.
    popup.document.write('<!doctype html><html><head><title>Order invoice</title></head><body></body></html>');
    const ready = [];
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach(style => {
      // Reuse already-loaded rules so blocked font imports cannot delay print CSS.
      // Cross-origin sheets may prohibit CSSOM access; keep their normal link fallback.
      if (style.tagName === 'LINK' && style.sheet) {
        try {
          const loaded = popup.document.createElement('style');
          loaded.textContent = Array.from(style.sheet.cssRules)
            .filter(rule => rule.type !== CSSRule.IMPORT_RULE)
            .map(rule => rule.cssText).join('\n');
          popup.document.head.appendChild(loaded);
          return;
        } catch { /* Cross-origin stylesheet: copy the link below. */ }
      }
      const copy = style.cloneNode(true);
      if (style.tagName === 'LINK') {
        copy.href = style.href;
        ready.push(new Promise(resolve => { copy.onload = resolve; copy.onerror = resolve; }));
      }
      popup.document.head.appendChild(copy);
    });
    popup.document.body.innerHTML = content.outerHTML;
    popup.document.close();
    popup.addEventListener('afterprint', () => popup.close(), { once: true });
    Promise.race([Promise.all(ready), new Promise(resolve => setTimeout(resolve, 3000))]).then(() => {
      if (!popup.closed) { popup.focus(); popup.print(); }
    });
  };

  if (loading || !order) return <div className="p-8 space-y-5">
    <button type="button" onClick={() => navigate('/admin/orders')} className="text-sm font-bold text-slate-600">Back to orders</button>
    {error ? <div role="alert" className="rounded-sm border border-slate-200 bg-white p-6 space-y-3">
      <h1 className="font-bold text-slate-900">{error.status === 404 ? 'Order not found' : error.status === 403 ? 'Access denied' : 'Unable to load order'}</h1>
      <p className="text-sm text-slate-500">{error.message}</p>
      {![403, 404].includes(error.status) && <button type="button" onClick={() => setRetry(value => value + 1)} className="font-bold text-sm underline">Try again</button>}
    </div> : <p role="status" className="text-sm text-slate-500">Loading order details...</p>}
  </div>;


  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50 pb-20">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center gap-4">
          <button 
            onClick={() => navigate('/admin/orders')}
            aria-label="Back to orders" className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="h-6 w-px bg-slate-200" />
          <h1 className="font-bold text-slate-900 tracking-tight">Order Details <span className="text-slate-400 font-medium ml-1">{order.id}</span></h1>
          
          <div className="ml-auto flex items-center gap-3">
            <button 
              onClick={() => setShowInvoice(true)}
              disabled={!Number.isFinite(order.total) || order.items.some(item => item.lineTotal === null)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10 disabled:opacity-50"
            >
              <FileText size={14} /> Download Invoice
            </button>
            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
              order.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-700' :
              order.status === 'CANCELLED' ? 'bg-rose-100 text-rose-700' :
              'bg-blue-100 text-blue-700'
            }`}>
              {formatOrderStatus(order.status)}
            </span>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-[1600px] mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Order Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Items Summary */}
          <div className="bg-white rounded-sm border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-900">
                <Package size={16} />
                <span className="text-xs font-bold uppercase tracking-widest">Order Summary</span>
              </div>
            </div>
            <div className="p-0">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Service</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quantity</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.items.map((item, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 text-xs font-bold text-slate-700">{item.name}</td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-500">{item.qty}</td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-900 text-right">{formatOrderMoney(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50/50 font-bold">
                  <tr>
                    <td colSpan="2" className="px-6 py-4 text-xs text-slate-600">Total Amount</td>
                    <td className="px-6 py-4 text-sm text-slate-900 text-right">{formatOrderMoney(order.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-sm border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2 text-slate-900">
              <Clock size={16} />
              <span className="text-xs font-bold uppercase tracking-widest">Activity Log</span>
            </div>
            <div className="p-6">
              <div className="relative space-y-8">
                <div className="absolute left-[11px] top-2 bottom-2 w-px bg-slate-100" />
                {!order.timeline.length && <p className="text-xs text-slate-500">No activity history recorded.</p>}
                {order.timeline.map((step, i) => (
                  <div key={i} className="relative flex items-start gap-4">
                    <div className="mt-1 h-6 w-6 rounded-full border-2 flex items-center justify-center z-10 bg-slate-900 border-slate-900 text-white">
                      <CheckCircle2 size={12} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">{step.status}</p>
                      <p className="text-[10px] font-medium text-slate-400">{step.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Entities */}
        <div className="space-y-6">
          {/* Customer Card */}
          <div className="bg-white rounded-sm border border-slate-200 overflow-hidden shadow-sm p-5 space-y-4">
             <div className="flex items-center gap-2 text-slate-400 mb-2">
                <User size={14} />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Customer</span>
             </div>
             <div>
                <h4 className="font-bold text-slate-900 text-sm">{order.user.name}</h4>
                <p className="text-xs text-slate-500 font-medium">{order.user.phone}</p>
             </div>
             <div className="pt-3 border-t border-slate-50">
                <p className="text-[10px] text-slate-400 mb-1 font-bold uppercase tracking-widest">Delivery Address</p>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">{order.user.address}</p>
             </div>
             <button disabled={!order.user.id} onClick={() => navigate(`/admin/users?search=${encodeURIComponent(order.user.phone)}`)} className="disabled:opacity-40 w-full py-2 bg-slate-50 text-slate-900 rounded-sm text-[9px] font-bold uppercase tracking-widest hover:bg-slate-100 transition-colors">
                View User Profile
             </button>
          </div>

          {/* Vendor Card */}
          <div className="bg-white rounded-sm border border-slate-200 overflow-hidden shadow-sm p-5 space-y-4">
             <div className="flex items-center gap-2 text-slate-400 mb-2">
                <Store size={14} />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Fulfillment Partner</span>
             </div>
             <div>
                <h4 className="font-bold text-slate-900 text-sm">{order.vendor.shop}</h4>
                <p className="text-xs text-slate-500 font-medium">Owner: {order.vendor.name}</p>
             </div>
             <div className="pt-3 border-t border-slate-50">
                <p className="text-[10px] text-slate-400 mb-1 font-bold uppercase tracking-widest">Shop Address</p>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">{order.vendor.address}</p>
             </div>
             <button disabled={!order.vendor.id} onClick={() => navigate(`/admin/vendors/${encodeURIComponent(order.vendor.id)}`)} className="w-full py-2 bg-slate-50 text-slate-900 rounded-sm text-[9px] font-bold uppercase tracking-widest hover:bg-slate-100 transition-colors">
                View Partner Details
             </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-sm p-5 space-y-3">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Payment details</h2>
            <p className="text-xs text-slate-600">Status: {order.paymentStatus || 'Not recorded'}</p>
            <p className="text-xs text-slate-600">Method: {order.paymentMethod || 'Not recorded'}</p>
            <p className="text-xs text-slate-600">Advance: {formatOrderMoney(order.advanceAmount)}</p>
            <p className="text-xs text-slate-600">Balance due: {formatOrderMoney(order.dueAmount)}</p>
            <p className="text-xs text-slate-600">Placed: {formatOrderDate(order.createdAt)}</p>
          </div>
        </div>
      </div>
      <AnimatePresence>
        {showInvoice && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <Motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowInvoice(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <Motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-slate-100 w-full max-w-4xl h-[90vh] rounded-3xl shadow-2xl relative z-10 overflow-hidden flex flex-col"
            >
              <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">Invoice Preview</h3>
                  <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Order ID: {order.id}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handlePrint}
                    className="flex items-center gap-2 px-6 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg"
                  >
                    <Printer size={14} /> Print / Save PDF
                  </button>
                  <button 
                    onClick={() => setShowInvoice(false)}
                    aria-label="Close invoice" className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-12 bg-slate-50">
                <div className="bg-white shadow-sm ring-1 ring-slate-200">
                  <div className="p-3 border-b bg-white text-sm">
                    {currentRecord.issuedInvoice ? <p>Issued {currentRecord.issuedInvoice.number}. Downloads preserve its original recorded facts and business details.</p> : <><p>Draft preview. Issuing freezes the recorded order facts and business details without changing payment status.</p><button disabled={issuing} className="mt-2 border border-slate-300 px-3 py-2 rounded-sm disabled:opacity-50" onClick={issueInvoice}>{issuing ? 'Issuing…' : 'Issue customer invoice'}</button></>}
                    {issueError && <p role="alert" className="text-red-700">{issueError}</p>}
                  </div>
                  <InvoicePrint order={invoice} settings={currentRecord.issuedInvoice?.settings || invoiceSettings} recordedOnly />
                </div>
              </div>
            </Motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
