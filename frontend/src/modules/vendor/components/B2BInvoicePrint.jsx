import { normalizeInvoiceSettings } from '../../../lib/invoiceSettings';
import React from 'react';
import { FileText, MapPin, Phone, Mail, Hash, Calendar, ShoppingBag, ShieldCheck } from 'lucide-react';

const B2BInvoicePrint = ({ order, settings: savedSettings = {} }) => {
    const settings = normalizeInvoiceSettings(savedSettings);
    if (!order) return null;

    const businessName = settings.businessName;
    const contactEmail = settings.contactEmail;
    const gstNumber = settings.gstNumber || 'Not provided';

    return (
        <div id="b2b-invoice-content" className="bg-white min-h-[1100px] w-full p-16 font-sans text-slate-800 border-[20px] border-slate-50">
            {/* Top Bar */}
            <div className="flex justify-between items-center mb-12 pb-8 border-b-2 border-slate-100">
                <div className="flex items-center gap-4">
                    {settings.showLogo && (settings.logo ? (
                        <img src={settings.logo} alt="Logo" className="h-12 object-contain" />
                    ) : (
                        <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-lg">
                            <ShoppingBag size={24} />
                        </div>
                    ))}
                    <div>
                        <h1 className="text-2xl font-black tracking-tighter text-slate-900 uppercase leading-none">{businessName}</h1>
                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mt-1">Industrial Supply Chain</p>
                        {settings.businessAddress && <p className="text-xs text-slate-500 whitespace-pre-line max-w-[300px] mt-2">{settings.businessAddress}</p>}
                        {settings.contactPhone && <p className="text-xs text-slate-500 mt-1">{settings.contactPhone}</p>}
                        {settings.website && <p className="text-xs text-slate-500 mt-1">{settings.website}</p>}
                    </div>
                </div>
                <div className="text-right">
                    <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">{settings.invoiceTitle}</h2>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Original for Recipient</p>
                </div>
            </div>

            {/* Header Info */}
            <div className="grid grid-cols-3 gap-8 mb-12">
                <div className="space-y-4 p-6 bg-slate-50 rounded-3xl border border-slate-100">
                    <div className="flex items-center gap-2 opacity-50">
                        <FileText size={14} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Invoice Details</span>
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Inv No:</span>
                            <span className="text-xs font-black text-slate-900">EZ-B2B-{order._id.slice(-6).toUpperCase()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Date:</span>
                            <span className="text-xs font-black text-slate-900">{new Date(order.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">GSTIN:</span>
                            <span className="text-xs font-black text-slate-900">{gstNumber}</span>
                        </div>
                    </div>
                </div>

                <div className="col-span-2 grid grid-cols-2 gap-8">
                    <div className="space-y-3">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Supplier (From)</span>
                        <h3 className="text-base font-black text-slate-900 leading-none">{order.supplier?.supplierDetails?.businessName || 'Authorized Supplier'}</h3>
                        <p className="text-xs font-bold text-slate-500 leading-relaxed">
                            {order.supplier?.address || 'Industrial Estate, Phase 2, Delhi - 110020'}<br/>
                            GSTIN: {order.supplier?.supplierDetails?.gstNumber || 'Unregistered'}<br/>
                            Phone: {order.supplier?.phone}
                        </p>
                    </div>
                    <div className="space-y-3">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bill To (Vendor)</span>
                        <h3 className="text-base font-black text-slate-900 leading-none">{order.vendor?.shopDetails?.name || 'Laundry Partner'}</h3>
                        <p className="text-xs font-bold text-slate-500 leading-relaxed">
                            {order.vendor?.address || 'No registered address'}<br/>
                            Phone: {order.vendor?.phone}<br/>
                            Email: {order.vendor?.email}
                        </p>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="mb-12 overflow-hidden rounded-[2rem] border border-slate-100 shadow-sm">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-slate-900 text-white">
                            <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest">#</th>
                            <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest">Material & Specification</th>
                            <th className="px-8 py-5 text-center text-[10px] font-black uppercase tracking-widest">HSN</th>
                            <th className="px-8 py-5 text-center text-[10px] font-black uppercase tracking-widest">Qty</th>
                            <th className="px-8 py-5 text-right text-[10px] font-black uppercase tracking-widest">Rate</th>
                            <th className="px-8 py-5 text-right text-[10px] font-black uppercase tracking-widest">Total Amount</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {order.items.map((item, i) => (
                            <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-8 py-6 text-xs font-black text-slate-400">{i + 1}</td>
                                <td className="px-8 py-6">
                                    <p className="text-sm font-black text-slate-900">{item.name}</p>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Batch Code: MAT-{item.materialId?.slice(-4).toUpperCase()}</p>
                                </td>
                                <td className="px-8 py-6 text-center text-xs font-bold text-slate-500">3402</td>
                                <td className="px-8 py-6 text-center text-sm font-black text-slate-900">{item.quantity}</td>
                                <td className="px-8 py-6 text-right text-sm font-bold text-slate-600">₹{item.price?.toLocaleString()}</td>
                                <td className="px-8 py-6 text-right text-sm font-black text-slate-900">₹{(item.price * item.quantity).toLocaleString()}</td>
                            </tr>
                        ))}
                        {/* Empty spacing rows to keep height consistent */}
                        {[...Array(Math.max(0, 4 - order.items.length))].map((_, i) => (
                            <tr key={`empty-${i}`} className="h-20">
                                <td colSpan={6} />
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Calculations & Summary */}
            <div className="grid grid-cols-2 gap-12 mb-12">
                <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 flex flex-col justify-center">
                    <div className="flex items-center gap-3 mb-4">
                        <ShieldCheck size={20} className="text-emerald-500" />
                        <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-900">Payment Summary</h4>
                    </div>
                    <div className="space-y-2">
                        <p className="text-[11px] font-bold text-slate-500 leading-relaxed italic">
                            This transaction has been successfully processed through the EzOfLife Escrow System. 
                            Funds are secured until delivery confirmation.
                        </p>
                        <div className="pt-2 flex items-center gap-2">
                            <span className="text-[9px] font-black uppercase text-emerald-600 px-2 py-0.5 bg-emerald-50 rounded-full border border-emerald-100">Paid via Razorpay</span>
                            <span className="text-[9px] font-black uppercase text-slate-400 px-2 py-0.5 bg-white rounded-full border border-slate-100">Ref: {order._id.slice(-10)}</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-3 px-8">
                    <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Taxable Value</span>
                        <span className="text-sm font-black text-slate-900 tracking-tight">₹{(order.totalAmount / 1.18).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Integrated GST (18%)</span>
                        <span className="text-sm font-black text-slate-900 tracking-tight">₹{(order.totalAmount - (order.totalAmount / 1.18)).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2">
                        <span className="text-sm font-black text-slate-900 uppercase tracking-widest">Grand Total</span>
                        <div className="text-right">
                            <span className="text-4xl font-black text-slate-900 tracking-tighter italic">₹{order.totalAmount.toLocaleString()}</span>
                            <p className="text-[9px] font-black text-slate-400 uppercase mt-1">Includes all applicable taxes</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="flex justify-between items-end pt-12 border-t-2 border-slate-900">
                <div className="space-y-6">
                    {settings.showTerms && <div className="space-y-2">
                        <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-900">Terms of Supply</h5>
                        <p className="text-[10px] text-slate-500 whitespace-pre-line max-w-[400px]">{settings.customTerms}</p>
                    </div>}
                    {settings.paymentInstructions && <p className="text-[10px] text-slate-500 whitespace-pre-line max-w-[400px]">{settings.paymentInstructions}</p>}
                    <p className="text-[10px] text-slate-400 whitespace-pre-line max-w-[400px]">{settings.invoiceNote}</p>
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                            <Mail size={14} />
                        </div>
                        <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{contactEmail}</p>
                    </div>
                </div>
                <div className="text-right">
                    <div className="mb-6 space-y-1">
                        <p className="text-[10px] font-black uppercase text-slate-400">Authorized Signatory For</p>
                        <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{businessName}</p>
                    </div>
                    <div className="relative inline-block">
                        <div className="w-48 h-20 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center overflow-hidden grayscale opacity-40">
                             <span className="text-[10px] font-black uppercase tracking-widest -rotate-12">Digital Seal</span>
                        </div>
                        <div className="absolute top-0 right-0 -mr-4 -mt-4 bg-emerald-500 text-white p-1 rounded-full shadow-lg">
                            <ShieldCheck size={16} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default B2BInvoicePrint;
