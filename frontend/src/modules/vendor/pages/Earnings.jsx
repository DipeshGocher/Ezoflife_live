import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import VendorHeader from '../components/VendorHeader';
import { orderApi, authApi, vendorPaymentApi } from '../../../lib/api';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const payoutStatusLabel = payout => !payout.order ? payout.status : ({
    SETTLED: 'Bank settled', ON_HOLD: 'Bank settlement on hold', REVIEW: 'Reconciliation required'
}[payout.bankSettlementStatus] || (payout.status === 'Completed' ? 'Transferred · bank pending' : 'Transfer pending'));

const Earnings = () => {
    const navigate = useNavigate();
    const [performanceFilter, setPerformanceFilter] = useState('Weekly');
    const [summary, setSummary] = useState(null);
    const [payouts, setPayouts] = useState([]);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    const vendorDataRaw = localStorage.getItem('vendorData') || localStorage.getItem('user') || localStorage.getItem('userData') || '{}';
    const localVendor = JSON.parse(vendorDataRaw);
    const vendorId = localVendor?._id || localVendor?.id || localVendor?.user?._id || localVendor?.user?.id;

    const fetchData = async () => {
        if (!vendorId) return;
        try {
            setLoading(true);
            const [ordersData, summaryData, historyData] = await Promise.all([
                orderApi.getVendorOrders(vendorId),
                vendorPaymentApi.getEarningsSummary(vendorId),
                vendorPaymentApi.getPayoutHistory(vendorId)
            ]);
            setOrders(ordersData);
            setSummary(summaryData);
            setPayouts(Array.isArray(historyData) ? historyData : []);
        } catch (err) {
            console.error('Error fetching earnings data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [vendorId]);

    const handleDownloadInvoice = () => {
        try {
            const doc = new jsPDF();
            doc.setFontSize(22);
            doc.setTextColor(61, 90, 254);
            doc.text('EARNINGS STATEMENT', 105, 20, { align: 'center' });
            
            doc.setFontSize(10);
            doc.text(`Generated on: ${new Date().toLocaleString()}`, 105, 28, { align: 'center' });

            doc.setFillColor(248, 250, 252);
            doc.rect(20, 45, 170, 40, 'F');
            doc.setFontSize(12);
            doc.setTextColor(0);
            doc.text('FINANCIAL SUMMARY', 25, 55);
            doc.setFontSize(10);
            doc.text(`Total Lifetime Earnings: INR ${summary?.totalEarnings?.toLocaleString() || 0}`, 25, 65);
            doc.text(`Transferred / Recorded: INR ${summary?.totalPaid?.toLocaleString() || 0}`, 25, 72);
            doc.setFontSize(11);
            doc.text(`CURRENT PENDING BALANCE: INR ${summary?.pendingBalance?.toLocaleString() || 0}`, 25, 80);

            if (payouts.length > 0) {
                const tableData = payouts.map(p => [
                    p.transactionId,
                    new Date(p.paidAt).toLocaleDateString(),
                    p.paymentMethod,
                    `INR ${p.amount}`,
                    payoutStatusLabel(p)
                ]);

                autoTable(doc, {
                    startY: 95,
                    head: [['Transaction ID', 'Date', 'Method', 'Amount', 'Status']],
                    body: tableData,
                    theme: 'grid',
                    headStyles: { fillColor: [61, 90, 254] }
                });
            }

            doc.save(`Statement_${vendorId}_${Date.now()}.pdf`);
        } catch (error) {
            alert('Could not generate PDF');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-slate-900 min-h-screen pb-32 font-body"
        >
            <header className="bg-white px-6 py-6 border-b border-slate-100 sticky top-0 z-50 flex items-center gap-4">
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)} className="p-2 hover:bg-slate-50 rounded-full">
                    <span className="material-symbols-outlined text-primary">arrow_back</span>
                </motion.button>
                <h1 className="text-xl font-black tracking-tight">Financial Wallet</h1>
            </header>

            <main className="max-w-xl mx-auto px-6 pt-6 space-y-8">
                {/* 1. PENDING BALANCE CARD */}
                <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-xl shadow-slate-900/10 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/20 rounded-full blur-3xl -mr-16 -mt-16 transition-all"></div>
                    
                    <div className="relative z-10 space-y-6">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Available Payout</p>
                            </div>
                            <h2 className="text-5xl font-black tracking-tighter">₹{summary?.pendingBalance?.toLocaleString() || 0}</h2>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Due from Admin</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-6 border-t border-white/5">
                            <div>
                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total Earned</p>
                                <p className="text-sm font-black text-slate-200">₹{summary?.totalEarnings?.toLocaleString() || 0}</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Transferred / Recorded</p>
                                <p className="text-sm font-black text-slate-200">₹{summary?.totalPaid?.toLocaleString() || 0}</p>
                            </div>
                        </div>

                        <button 
                            onClick={handleDownloadInvoice}
                            className="w-full py-4 bg-white text-slate-900 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-lg hover:bg-primary hover:text-white transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined text-lg">description</span>
                            Download Full Statement
                        </button>
                    </div>
                </div>

                {/* 2. RECENT PAYOUTS HISTORY */}
                <section className="space-y-6">
                    <div className="flex items-center justify-between px-1">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Payout Settlements</h3>
                        <div className="bg-blue-50 text-blue-600 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border border-blue-100">
                            {payouts.length} Transactions
                        </div>
                    </div>

                    <div className="space-y-3">
                        {payouts.length > 0 ? (
                            payouts.map((p) => (
                                <div key={p._id} className="bg-white p-5 rounded-3xl flex items-center justify-between border border-slate-100 shadow-sm transition-all hover:border-primary/20 group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                                            <span className="material-symbols-outlined text-2xl">account_balance_wallet</span>
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-slate-900 uppercase tracking-tight">{p.transactionId}</p>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                                                {new Date(p.paidAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · {p.paymentMethod}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-base font-black text-emerald-600 tracking-tight leading-none">+₹{p.amount.toLocaleString()}</p>
                                        <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mt-1">{payoutStatusLabel(p)}</p>
                                        {p.recipientSettlementId && <p className="text-[8px] text-slate-500 mt-1">{p.recipientSettlementId}</p>}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="py-20 text-center opacity-30">
                                <span className="material-symbols-outlined text-5xl mb-3">payments</span>
                                <p className="text-[10px] font-black uppercase tracking-widest">No payouts received yet</p>
                            </div>
                        )}
                    </div>
                </section>

                {/* 3. ORDER WISE BREAKDOWN (ONLY TOP 5) */}
                <section className="space-y-4">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Recent Revenue Items</h3>
                    <div className="space-y-2">
                        {orders.filter(o => ['Ready', 'Delivered', 'Out for Delivery'].includes(o.status)).slice(0, 5).map(order => (
                             <div key={order._id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                 <div>
                                     <p className="text-[11px] font-black text-slate-900 uppercase tracking-tight">{order.orderId}</p>
                                     <p className="text-[9px] text-slate-400 font-bold uppercase">{new Date(order.createdAt).toLocaleDateString()}</p>
                                 </div>
                                 <p className="text-xs font-black text-slate-900">₹{((order.priceBreakdown?.baseWithArea || 0) + (order.priceBreakdown?.expressSurcharge || 0)).toFixed(0)}</p>
                             </div>
                        ))}
                    </div>
                </section>
            </main>
        </motion.div>
    );
};

export default Earnings;
