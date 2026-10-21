import { appDialog } from '../../../shared/stores/appDialogStore';
import React, { useState, useEffect } from 'react';
import { IndianRupee, ShieldCheck, Truck, User, Store, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { b2bOrderApi } from '../../../lib/api';
import PageHeader from '../components/common/PageHeader';
import DataGrid from '../components/tables/DataGrid';
import { motion } from 'framer-motion';

export default function B2BEscrowManagement() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchEscrowOrders = async () => {
    setLoading(true);
    try {
      const data = await b2bOrderApi.getAdminEscrowOrders();
      setOrders(data);
    } catch (error) {
      console.error('Fetch Escrow Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEscrowOrders();
  }, []);

  const handleRelease = async (orderId) => {
    if (!await appDialog.confirm('Are you sure you want to release funds to the supplier? This action cannot be undone.')) return;
    try {
      await b2bOrderApi.releasePayment(orderId);
      await appDialog.alert('Funds released successfully!');
      fetchEscrowOrders();
    } catch (error) {
      await appDialog.alert('Failed to release funds');
    }
  };

  const columns = [
    { 
      header: 'Order Details', 
      key: 'b2bOrderId',
      render: (val, row) => (
        <div className="flex flex-col">
          <span className="font-bold text-slate-900 text-[11px] tracking-widest uppercase">{val}</span>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
            {new Date(row.updatedAt).toLocaleDateString()}
          </span>
        </div>
      )
    },
    { 
      header: 'Vendor (Payer)', 
      key: 'vendor',
      render: (val) => (
        <div className="flex items-center gap-2">
           <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
             <Store size={14} className="text-slate-400" />
           </div>
           <div className="flex flex-col">
             <span className="font-bold text-slate-800 text-[10px] uppercase tracking-tight">{val?.displayName}</span>
             <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">Retailer</span>
           </div>
        </div>
      )
    },
    { 
      header: 'Supplier (Payee)', 
      key: 'supplier',
      render: (val) => (
        <div className="flex items-center gap-2">
           <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
             <Truck size={14} className="text-blue-400" />
           </div>
           <div className="flex flex-col">
             <span className="font-bold text-slate-800 text-[10px] uppercase tracking-tight">{val?.displayName}</span>
             <span className="text-[8px] text-blue-400 font-bold uppercase tracking-widest leading-none mt-1">Pool Supplier</span>
           </div>
        </div>
      )
    },
    { 
      header: 'Held Amount', 
      key: 'totalAmount', 
      render: (val, row) => (
        <div className="flex flex-col">
          <span className="font-black text-slate-900 tabular-nums text-xs">₹{val.toLocaleString()}</span>
          <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-1">
            {row.platformFee > 0 ? `+ ₹${row.platformFee.toLocaleString()} Platform Fee` : 'No Platform Fee'}
          </span>
        </div>
      )
    },
    { 
      header: 'Escrow State', 
      key: 'escrowStatus', 
      render: (val) => (
        <div className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest flex items-center gap-2 w-fit ${
          val === 'Held' ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
        }`}>
          <ShieldCheck size={10} />
          {val === 'Held' ? 'Payment Held' : 'Released'}
        </div>
      )
    },
    { 
      header: 'Actions', 
      key: 'actions', 
      align: 'right',
      render: (_, row) => (
        <div className="flex items-center justify-end gap-3">
          {row.escrowStatus === 'Held' && row.paymentStatus === 'Paid' && (
            <button 
              onClick={() => handleRelease(row._id)}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-[0.15em] hover:bg-black transition-all flex items-center gap-2 shadow-lg shadow-slate-900/10"
            >
              <IndianRupee size={12} /> Release to Supplier
            </button>
          )}
          {row.escrowStatus === 'Released' && (
             <div className="flex items-center gap-1.5 text-emerald-500">
               <CheckCircle2 size={14} />
               <span className="text-[9px] font-black uppercase tracking-widest">Settled</span>
             </div>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50 pb-20">
      <PageHeader 
        title="B2B Escrow System" 
        subtitle="Manage secure settlements between Vendors and Pool Suppliers"
      />

      <div className="p-6 max-w-[1600px] mx-auto w-full space-y-6">
        
        {/* Statistics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:scale-110 transition-transform">
                <ShieldCheck size={80} className="text-slate-900" />
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Total Held in Escrow</p>
              <h3 className="text-4xl font-black text-slate-900 tracking-tighter tabular-nums leading-none italic">
                ₹{orders.filter(o => o.escrowStatus === 'Held').reduce((acc, curr) => acc + curr.totalAmount, 0).toLocaleString()}
              </h3>
           </div>
           <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Awaiting Settlement</p>
              <h3 className="text-4xl font-black text-slate-900 tracking-tighter leading-none italic tabular-nums">
                {orders.filter(o => o.escrowStatus === 'Held').length.toString().padStart(2, '0')} <span className="text-lg text-slate-300">Orders</span>
              </h3>
           </div>
           <div className="bg-[#0F172A] p-8 rounded-[2rem] border border-slate-800 shadow-xl shadow-slate-900/10">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Payout Capability</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                </div>
                <h3 className="text-xl font-black text-white uppercase tracking-tight">Active Node</h3>
              </div>
           </div>
        </div>

        {/* Data Grid */}
        <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
          {loading ? (
             <div className="py-20 flex flex-col items-center justify-center space-y-4 opacity-40">
                <div className="w-10 h-10 border-4 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em]">Auditing Ledgers...</p>
             </div>
          ) : orders.length > 0 ? (
            <DataGrid 
              columns={columns}
              data={orders}
            />
          ) : (
            <div className="py-32 flex flex-col items-center justify-center text-center px-10">
               <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center text-slate-200 mb-6">
                 <AlertCircle size={40} />
               </div>
               <h3 className="text-xl font-black text-slate-300 uppercase tracking-widest mb-3 text-center">No Active Escrow Holds</h3>
               <p className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em] max-w-sm leading-relaxed text-center">
                 Payments are only held in escrow after vendor confirmation of delivery.
               </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
