import React, { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { b2bOrderApi, adminApi } from '../../../lib/api';
import VendorHeader from '../components/VendorHeader';
import B2BInvoicePrint from '../components/B2BInvoicePrint';
import { Printer, X, FileText, ShoppingBag } from 'lucide-react';

const B2BOrderHistory = () => {
    const navigate = useNavigate();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showInvoice, setShowInvoice] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [invoiceSettings, setInvoiceSettings] = useState({});
    const [scale, setScale] = useState(1);

    const calculateScale = () => {
        const width = window.innerWidth;
        if (width < 850) {
            setScale((width - 40) / 850);
        } else {
            setScale(1);
        }
    };

    useEffect(() => {
        calculateScale();
        window.addEventListener('resize', calculateScale);
        return () => window.removeEventListener('resize', calculateScale);
    }, []);

    const vendorDataRaw = localStorage.getItem('vendorData') || localStorage.getItem('user') || localStorage.getItem('userData') || '{}';
    const vendorData = JSON.parse(vendorDataRaw);
    const vendorId = vendorData._id || vendorData.id || vendorData.user?._id || vendorData.user?.id;

    const fetchOrders = useCallback(async () => {
        try {
            const data = await b2bOrderApi.getVendorOrders(vendorId);
            setOrders(data);
        } catch (err) {
            console.error('Fetch B2B Orders Error:', err);
        } finally {
            setTimeout(() => {
                setLoading(false);
            }, 5000);
        }
    }, [vendorId]);

    const fetchInvoiceSettings = useCallback(async () => {
        try {
            const configs = await adminApi.getConfig();
            const config = configs.find(c => c.key === 'invoice_settings');
            if (config) setInvoiceSettings(config.value);
        } catch (err) {
            console.error('Failed to fetch invoice settings:', err);
        }
    }, []);

    useEffect(() => {
        if (!vendorId) return;
        fetchOrders();
        fetchInvoiceSettings();
    }, [vendorId, fetchOrders, fetchInvoiceSettings]);

    const handlePrint = () => {
        const printContent = document.getElementById('b2b-invoice-content');
        const WindowPnt = window.open('', '', 'left=0,top=0,width=800,height=900,toolbar=0,scrollbars=0,status=0');
        WindowPnt.document.write('<html><head><title>B2B Invoice</title>');
        WindowPnt.document.write('<script src="https://cdn.tailwindcss.com"></script>');
        WindowPnt.document.write('</head><body>');
        WindowPnt.document.write(printContent.innerHTML);
        WindowPnt.document.write('</body></html>');
        WindowPnt.document.close();
        setTimeout(() => {
            WindowPnt.focus();
            WindowPnt.print();
            WindowPnt.close();
        }, 500);
    };

    const openInvoice = (order) => {
        setSelectedOrder(order);
        setShowInvoice(true);
    };

    const b2bStatusMapVendor = {
        'CART': { label: 'Draft', emoji: '🛒', color: 'bg-slate-100 text-slate-700 border-slate-200' },
        'PENDING_PAYMENT': { label: 'Awaiting Fee Payment', emoji: '💳', color: 'bg-amber-50 text-amber-600 border-amber-200' },
        'SUBMITTED': { label: 'Awaiting Supplier Review', emoji: '⌛', color: 'bg-amber-50 text-amber-600 border-amber-200' },
        'ACCEPTED': { label: 'Order Confirmed', emoji: '✅', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
        'PROCESSING': { label: 'Packing', emoji: '📦', color: 'bg-blue-50 text-blue-600 border-blue-200' },
        'DISPATCHED': { label: 'In Transit', emoji: '🚚', color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
        'DELIVERED': { label: 'Received at Facility', emoji: '🧺', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
        'REJECTED': { label: 'Rejected by Supplier', emoji: '❌', color: 'bg-rose-50 text-rose-600 border-rose-200' },
        'CANCELLED': { label: 'Cancelled by You', emoji: '🛑', color: 'bg-red-50 text-red-600 border-red-200' },

        // Old CamelCase statuses for backward compatibility
        'Submitted': { label: 'Awaiting Supplier Review', emoji: '⌛', color: 'bg-amber-50 text-amber-600 border-amber-200' },
        'Confirmed': { label: 'Order Confirmed', emoji: '✅', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
        'Out for Delivery': { label: 'In Transit', emoji: '🚚', color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
        'Delivered': { label: 'Received at Facility', emoji: '🧺', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
        'Cancelled': { label: 'Cancelled by You', emoji: '🛑', color: 'bg-red-50 text-red-600 border-red-200' }
    };

    const getStatusLabel = (status) => b2bStatusMapVendor[status]?.label || status;
    const getStatusIcon = (status) => b2bStatusMapVendor[status]?.emoji || '⌛';
    const getStatusColor = (status) => b2bStatusMapVendor[status]?.color || 'bg-slate-500 text-white';

    return (
        <Motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-[#F8FAFC] min-h-screen pb-32 font-sans"
        >
            
            <main className="max-w-xl mx-auto px-6 pt-8 space-y-8">
                <header>
                    <h2 className="text-3xl font-black tracking-tighter text-slate-900 leading-none">Material <br/><span className="text-primary italic">Requisitions.</span></h2>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-3">Track your supply chain fulfillment</p>
                </header>

                <div className="space-y-4">
                    {loading ? (
                        <div className="space-y-6">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className="bg-white rounded-[2.5rem] p-7 border border-slate-100 shadow-sm relative overflow-hidden animate-pulse">
                                    <div className="flex justify-between items-start gap-4 mb-6">
                                        <div className="flex items-start gap-4 flex-1">
                                            <div className="w-14 h-14 rounded-2xl bg-slate-100 shrink-0"></div>
                                            <div className="flex flex-col gap-2 flex-1 pt-1">
                                                <div className="w-24 h-2 bg-slate-200 rounded"></div>
                                                <div className="w-48 h-4 bg-slate-200 rounded"></div>
                                                <div className="w-32 h-2 bg-slate-100 rounded"></div>
                                            </div>
                                        </div>
                                        <div className="w-20 h-6 bg-slate-200 rounded-full shrink-0"></div>
                                    </div>
                                    <div className="space-y-6">
                                        <div className="bg-slate-50 rounded-3xl p-5 space-y-4 border border-slate-100">
                                            <div className="flex justify-between items-center"><div className="w-32 h-2 bg-slate-200 rounded"></div><div className="w-12 h-2 bg-slate-200 rounded"></div></div>
                                            <div className="flex justify-between items-center"><div className="w-24 h-2 bg-slate-200 rounded"></div><div className="w-12 h-2 bg-slate-200 rounded"></div></div>
                                            <div className="pt-3 border-t border-slate-200 flex justify-between items-center"><div className="w-24 h-2 bg-slate-300 rounded"></div><div className="w-20 h-4 bg-slate-300 rounded"></div></div>
                                        </div>
                                        <div className="flex items-center justify-between pt-4 border-t border-slate-50 gap-4">
                                            <div className="w-24 h-2 bg-slate-200 rounded"></div>
                                            <div className="w-10 h-10 bg-slate-100 rounded-full"></div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : orders.length > 0 ? (
                        <AnimatePresence>
                            {orders.map((order, i) => (
                                <Motion.div
                                    key={order._id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.1 }}
                                    className="bg-white rounded-[2.5rem] p-7 border border-slate-100 shadow-xl shadow-slate-200/40 relative overflow-hidden group hover:border-primary/20 transition-all"
                                >
                                    <div className="flex justify-between items-start gap-4 mb-6">
                                        {/* Order Info */}
                                        <div className="flex items-start gap-4 flex-1 min-w-0">
                                            <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-primary shrink-0 border border-slate-100 shadow-inner">
                                                <span className="material-symbols-outlined text-2xl">inventory_2</span>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Batch ID: {order._id.slice(-8).toUpperCase()}</p>
                                                <h4 className="text-xl font-black text-slate-900 tracking-tight leading-none mb-1.5 truncate pr-2">{order.items[0]?.name || 'Bulk Materials'}</h4>
                                                <div className="flex items-center gap-2 text-slate-500">
                                                    <span className="material-symbols-outlined text-sm">local_shipping</span>
                                                    <p className="text-[10px] font-bold uppercase tracking-wide truncate">
                                                        From: {order.supplier?.supplierDetails?.businessName || 'Assigned Supplier'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Status Badge */}
                                        <div className="shrink-0">
                                            <span className={`px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm flex items-center gap-1 border ${getStatusColor(order.status)}`}>
                                                <span className="text-xs">{getStatusIcon(order.status)}</span>
                                                <span>{getStatusLabel(order.status)}</span>
                                            </span>
                                        </div>
                                    </div>

                                    <div className="space-y-6">

                                        {/* Nested Items Grid */}
                                        <div className="bg-slate-50 rounded-3xl p-5 space-y-3 border border-slate-100">
                                            {order.items.map((item, idx) => (
                                                <div key={idx} className="flex justify-between items-center">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-2 h-2 rounded-full bg-primary/30"></div>
                                                        <span className="text-[11px] font-bold text-slate-600">{item.name}</span>
                                                    </div>
                                                    <span className="text-[10px] font-black text-slate-400 uppercase">Qty: {item.quantity}</span>
                                                </div>
                                            ))}
                                            <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                                                <span className="text-[10px] font-black text-slate-400 uppercase">Settlement Value</span>
                                                <span className="text-md font-black text-slate-900 tracking-tighter italic">₹{order.totalAmount.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-black text-slate-400 uppercase">
                                                    Platform Fee
                                                    {order.platformFee > 0 && order.status === 'PENDING_PAYMENT' && (
                                                        <span className="ml-2 text-amber-600">(Unpaid)</span>
                                                    )}
                                                    {order.platformFee > 0 && order.status !== 'PENDING_PAYMENT' && (
                                                        <span className="ml-2 text-emerald-600">(Paid)</span>
                                                    )}
                                                </span>
                                                <span className="text-[11px] font-black text-slate-700 tabular-nums">
                                                    {order.platformFee > 0 ? `₹${Number(order.platformFee).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : 'Nil'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Timeline Footer & Actions */}
                                        <div className="flex items-center justify-between pt-4 border-t border-slate-50 gap-4">
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-md text-slate-300">calendar_today</span>
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                    Placed: {new Date(order.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {['Delivered', 'DELIVERED', 'Settled', 'SETTLED'].includes(order.status) && order.supplier && (
                                                    <button
                                                        onClick={() => navigate(`/vendor/material-request/track/${order._id}`)}
                                                        className="px-3 py-2.5 bg-amber-50 border border-amber-100 text-amber-700 rounded-xl text-[9px] font-black uppercase tracking-[0.15em] flex items-center gap-1 hover:bg-amber-100 transition-all"
                                                    >
                                                        {order.supplierRating?.rating ? `★ ${order.supplierRating.rating} Rated` : 'Rate Supplier'}
                                                    </button>
                                                )}
                                                {['Delivered', 'DELIVERED'].includes(order.status) && (
                                                    <button 
                                                        onClick={() => openInvoice(order)}
                                                        className="px-4 py-2.5 bg-white border border-slate-200 text-slate-900 rounded-xl text-[9px] font-black uppercase tracking-[0.15em] shadow-sm flex items-center gap-2 hover:bg-slate-50 transition-all"
                                                    >
                                                        <FileText size={14} />
                                                        Invoice
                                                    </button>
                                                )}

                                                <div className="px-4 py-2 flex items-center gap-2 rounded-full text-[8px] font-black uppercase tracking-widest border bg-amber-50 text-amber-700 border-amber-100">
                                                    <span className="material-symbols-outlined text-sm">handshake</span>
                                                    Pay Supplier Directly
                                                </div>

                                                <button 
                                                    onClick={() => navigate(`/vendor/fulfillment`)}
                                                    className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 transition-all shadow-sm"
                                                >
                                                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </Motion.div>
                            ))}
                        </AnimatePresence>
                    ) : (
                        <div className="bg-white rounded-[3rem] p-20 text-center border-4 border-dashed border-slate-100 flex flex-col items-center">
                            <div className="w-24 h-24 rounded-full bg-slate-50 flex items-center justify-center text-slate-100 mb-6">
                                <span className="material-symbols-outlined text-6xl">shopping_cart_off</span>
                            </div>
                            <h3 className="text-xl font-black text-slate-300 uppercase tracking-widest mb-3">No Material Orders</h3>
                            <p className="text-[10px] font-black text-slate-200 uppercase tracking-[0.3em] max-w-[200px] leading-relaxed">
                                You haven't placed any requisitions from the supply pool yet.
                            </p>
                            <button 
                                onClick={() => navigate('/vendor/fulfillment')}
                                className="mt-8 px-8 py-4 bg-primary-gradient text-white rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                            >
                                Shop Materials
                            </button>
                        </div>
                    )}
                </div>
            </main>

            <AnimatePresence>
                {showInvoice && selectedOrder && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <Motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setShowInvoice(false)}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
                        />
                        <Motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="bg-white w-full max-w-4xl h-[90vh] rounded-[3rem] shadow-2xl relative z-10 overflow-hidden flex flex-col"
                        >
                            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
                                        <FileText size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 leading-none">B2B Material Invoice</h3>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Batch ID: {selectedOrder._id.slice(-8).toUpperCase()}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button 
                                        onClick={handlePrint}
                                        className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20"
                                    >
                                        <Printer size={16} /> Print / Download
                                    </button>
                                    <button 
                                        onClick={() => setShowInvoice(false)}
                                        className="p-3 hover:bg-slate-100 rounded-2xl transition-colors text-slate-400"
                                    >
                                        <X size={24} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-0 bg-slate-50 relative">
                                <div className="min-h-full w-full flex flex-col items-center">
                                    <div 
                                        style={{ 
                                            transform: `scale(${scale})`,
                                            transformOrigin: 'top center',
                                            width: '850px',
                                            marginTop: '2rem',
                                            marginBottom: `${(1100 * scale) - 1100 + 40}px` 
                                        }}
                                        className="bg-white shadow-2xl shrink-0"
                                    >
                                        <B2BInvoicePrint order={selectedOrder} settings={invoiceSettings} />
                                    </div>
                                </div>
                            </div>
                        </Motion.div>
                    </div>
                )}
            </AnimatePresence>
        </Motion.div>
    );
};

export default B2BOrderHistory;
