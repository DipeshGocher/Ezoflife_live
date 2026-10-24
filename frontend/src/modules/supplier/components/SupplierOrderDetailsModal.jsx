import React from 'react';
import { createPortal } from 'react-dom';
import { motion as Motion, AnimatePresence } from 'framer-motion';

const money = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
/** Order fields default to '-' when unknown; treat those as missing. */
const present = (value) => (value && value !== '-' ? value : null);

const formatDateTime = (value) => {
    const d = value ? new Date(value) : null;
    if (!d || Number.isNaN(d.getTime())) return 'N/A';
    return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const formatDate = (value) => {
    const d = value ? new Date(value) : null;
    if (!d || Number.isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
};

const Section = ({ title, icon, children }) => (
    <section className="bg-[#F8FAFC] rounded-[1.5rem] border border-slate-100 p-4 space-y-3">
        <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-slate-400">{icon}</span>
            <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{title}</h4>
        </div>
        {children}
    </section>
);

/** Label above a value that wraps instead of being cut off. */
const Field = ({ label, children, className = '' }) => (
    <div className={`min-w-0 ${className}`}>
        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
        <div className="text-xs font-bold text-slate-900 break-words whitespace-normal">{children}</div>
    </div>
);

/**
 * Full details of a vendor's B2B order, opened from the supplier dashboard's
 * MORE button. Every value comes from the order (and its populated vendor).
 */
const SupplierOrderDetailsModal = ({ order, statusLabel, onClose, onAccept, accepting }) => {
    const vendor = order?.vendor || {};
    const snapshot = order?.vendorSnapshot || {};
    const vendorName = vendor.shopDetails?.name || vendor.businessName || vendor.displayName
        || snapshot.businessName || snapshot.displayName || 'Unknown Vendor';
    const ownerName = vendor.displayName && vendor.displayName !== vendorName ? vendor.displayName : null;
    const phone = vendor.phone || snapshot.phone;
    const gstin = present(vendor.shopDetails?.gst);
    const address = present(order?.shippingAddress) || present(vendor.shopDetails?.address) || 'Address not provided';
    const city = present(order?.city) || present(vendor.shopDetails?.city);
    const pincode = present(order?.pincode) || present(vendor.shopDetails?.pincode);

    const items = (order?.items || []).map((item) => {
        const quantity = Number(item.quantity) || 0;
        const unitPrice = Number(item.price) || 0; // GST-inclusive
        const gst = Number.isFinite(Number(item.gst)) ? Number(item.gst) : 18;
        const lineTotal = round2(unitPrice * quantity);
        const taxable = round2(lineTotal / (1 + gst / 100));
        return { ...item, quantity, unitPrice, gst, lineTotal, taxable, tax: round2(lineTotal - taxable) };
    });
    const itemsTotal = round2(items.reduce((sum, item) => sum + item.lineTotal, 0));
    const taxableTotal = round2(items.reduce((sum, item) => sum + item.taxable, 0));
    const gstTotal = round2(itemsTotal - taxableTotal);
    const deliveryCharge = Number(order?.deliveryCharge) || 0;
    const units = items.reduce((sum, item) => sum + item.quantity, 0);

    // Portal + z-[200] so the fixed bottom nav (z-[100]) can't cover the footer buttons.
    return createPortal(
        <AnimatePresence>
            {order && (
                <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-3 sm:p-4">
                    <Motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
                    />
                    <Motion.div
                        initial={{ scale: 0.95, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: 20 }}
                        className="bg-white w-full max-w-md max-h-[90vh] rounded-[2.5rem] shadow-2xl relative z-10 flex flex-col text-left border border-slate-100 text-slate-900 overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
                            <div className="min-w-0">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Order Details</p>
                                <h3 className="text-base font-black text-slate-950 tracking-tight break-all">#{order.b2bOrderId}</h3>
                                <span className="inline-block mt-1.5 text-[8px] font-black uppercase tracking-widest bg-black text-white px-2.5 py-1 rounded-full">
                                    {statusLabel || order.status}
                                </span>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-9 h-9 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-black hover:bg-slate-100 transition-colors shrink-0"
                            >
                                <span className="material-symbols-outlined text-sm font-bold">close</span>
                            </button>
                        </div>

                        {/* Scrollable body */}
                        <div className="overflow-y-auto px-5 py-4 space-y-3 flex-1 min-h-0">
                            <Section title="Schedule" icon="event">
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Submitted">{formatDateTime(order.createdAt)}</Field>
                                    <Field label="Delivery Date">{formatDate(order.deliveryDate)}</Field>
                                    {present(order.cycleId) && <Field label="Delivery Cycle">{order.cycleId}</Field>}
                                    <Field label="Items">{items.length} product{items.length === 1 ? '' : 's'} · {units} unit{units === 1 ? '' : 's'}</Field>
                                </div>
                            </Section>

                            <Section title="Vendor" icon="store">
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Business Name" className="col-span-2">{vendorName}</Field>
                                    {ownerName && <Field label="Contact Person">{ownerName}</Field>}
                                    {phone && (
                                        <Field label="Phone">
                                            <a href={`tel:${phone}`} className="underline underline-offset-2">{phone}</a>
                                        </Field>
                                    )}
                                    {gstin && <Field label="GSTIN" className="col-span-2"><span className="font-mono">{gstin}</span></Field>}
                                </div>
                            </Section>

                            <Section title="Delivery Address" icon="location_on">
                                <Field label="Address">{address}</Field>
                                {(city || pincode) && (
                                    <div className="grid grid-cols-2 gap-3">
                                        {city && <Field label="City">{city}</Field>}
                                        {pincode && <Field label="Pincode">{pincode}</Field>}
                                    </div>
                                )}
                            </Section>

                            <Section title="Products" icon="inventory_2">
                                <div className="space-y-2">
                                    {items.map((item, idx) => (
                                        <div key={item._id || idx} className="bg-white rounded-2xl border border-slate-100 p-3 space-y-1.5">
                                            <div className="flex items-start justify-between gap-3">
                                                <p className="text-xs font-black text-slate-900 uppercase tracking-wide break-words min-w-0">{item.name}</p>
                                                <span className="bg-black text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shrink-0">
                                                    Qty: {item.quantity}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between gap-3 text-[10px] font-bold text-slate-500">
                                                <span>{money(item.unitPrice)} × {item.quantity} · GST {item.gst}% incl.</span>
                                                <span className="text-xs font-black text-slate-900 shrink-0">{money(item.lineTotal)}</span>
                                            </div>
                                        </div>
                                    ))}
                                    {items.length === 0 && <p className="text-[10px] font-bold text-slate-400">No products on this order.</p>}
                                </div>
                            </Section>

                            <Section title="Bill Summary" icon="receipt_long">
                                <div className="space-y-1.5 text-xs font-bold text-slate-600">
                                    <div className="flex justify-between gap-3"><span>Taxable value</span><span>{money(taxableTotal)}</span></div>
                                    <div className="flex justify-between gap-3"><span>GST</span><span>{money(gstTotal)}</span></div>
                                    <div className="flex justify-between gap-3"><span>Delivery charge</span><span>{deliveryCharge > 0 ? money(deliveryCharge) : 'Free'}</span></div>
                                    <div className="flex justify-between gap-3 pt-2 mt-1 border-t border-slate-200 text-sm font-black text-slate-950">
                                        <span>Total payable to you</span><span>{money(order.totalAmount)}</span>
                                    </div>
                                </div>
                                <p className="text-[9px] font-bold text-slate-400 leading-snug">
                                    {order.paymentStatus === 'Direct'
                                        ? 'The vendor pays this amount to you directly.'
                                        : `Payment: ${order.paymentStatus || 'Pending'}${order.escrowStatus && order.escrowStatus !== 'Not Applicable' ? ` · Escrow ${order.escrowStatus}` : ''}`}
                                </p>
                            </Section>
                        </div>

                        {/* Footer */}
                        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 shrink-0">
                            <button
                                onClick={onClose}
                                className="px-6 py-2.5 rounded-full border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all active:scale-95"
                            >
                                Close
                            </button>
                            {onAccept && (
                                <button
                                    onClick={onAccept}
                                    disabled={accepting}
                                    className="px-6 py-2.5 bg-black text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-md active:scale-95 disabled:opacity-50"
                                >
                                    {accepting ? 'Accepting…' : 'Accept Order'}
                                </button>
                            )}
                        </div>
                    </Motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
};

export default SupplierOrderDetailsModal;
