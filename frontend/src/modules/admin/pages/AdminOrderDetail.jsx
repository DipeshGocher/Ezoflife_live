import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Package, User, Store, Clock, ChevronRight, CheckCircle2, XCircle } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';

export default function AdminOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const order = useMemo(() => ({
    id: id || '#SZ-8821',
    status: 'In Progress',
    date: '25 Mar, 2026',
    time: '10:45 AM',
    user: {
      name: 'Julian Mendoza',
      phone: '+91 98765 43210',
      address: 'Skyline Apts, Sector 4, HSR Layout, Bengaluru - 560102'
    },
    vendor: {
      name: 'Julian Cleaners',
      shop: 'Pristine Heights',
      address: '2nd Cross, Sector 2, HSR Layout'
    },
    items: [
      { name: 'Wash & Fold', qty: '5 kg', price: 495 },
      { name: 'Steam Ironing', qty: '2 pcs', price: 30 }
    ],
    total: 525,
    timeline: [
      { status: 'Order Placed', time: '10:30 AM', completed: true },
      { status: 'Picked Up', time: '11:15 AM', completed: true },
      { status: 'In Processing', time: '11:45 AM', completed: true },
      { status: 'Ready for Delivery', time: '--', completed: false },
      { status: 'Delivered', time: '--', completed: false }
    ]
  }), [id]);

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50 pb-20">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="h-6 w-px bg-slate-200" />
          <h1 className="font-bold text-slate-900 tracking-tight">Order Details <span className="text-slate-400 font-medium ml-1">{order.id}</span></h1>
          
          <div className="ml-auto flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
              order.status === 'Delivered' ? 'bg-emerald-100 text-emerald-700' : 
              order.status === 'Cancelled' ? 'bg-rose-100 text-rose-700' : 
              'bg-blue-100 text-blue-700'
            }`}>
              {order.status}
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
                      <td className="px-6 py-4 text-xs font-bold text-slate-900 text-right">₹{item.price}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50/50 font-bold">
                  <tr>
                    <td colSpan="2" className="px-6 py-4 text-xs text-slate-600">Total Amount</td>
                    <td className="px-6 py-4 text-sm text-slate-900 text-right">₹{order.total}</td>
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
                {order.timeline.map((step, i) => (
                  <div key={i} className="relative flex items-start gap-4">
                    <div className={`mt-1 h-6 w-6 rounded-full border-2 flex items-center justify-center z-10 ${
                      step.completed ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-300'
                    }`}>
                      {step.completed ? <CheckCircle2 size={12} /> : <div className="h-1.5 w-1.5 rounded-full bg-slate-200" />}
                    </div>
                    <div>
                      <p className={`text-xs font-bold ${step.completed ? 'text-slate-900' : 'text-slate-400'}`}>{step.status}</p>
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
             <button className="w-full py-2 bg-slate-50 text-slate-900 rounded-sm text-[9px] font-bold uppercase tracking-widest hover:bg-slate-100 transition-colors">
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
             <button className="w-full py-2 bg-slate-50 text-slate-900 rounded-sm text-[9px] font-bold uppercase tracking-widest hover:bg-slate-100 transition-colors">
                View Partner Details
             </button>
          </div>

          {/* Critical Actions */}
          <div className="bg-rose-50/50 border border-rose-100 rounded-sm p-5 space-y-4">
             <span className="text-[10px] font-bold text-rose-800 uppercase tracking-widest">Control Actions</span>
             <div className="grid grid-cols-1 gap-2">
                <button className="w-full py-3 bg-white border border-rose-200 text-rose-600 rounded-sm text-[10px] font-bold uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all flex items-center justify-center gap-2">
                  <XCircle size={14} /> Terminate Order
                </button>
             </div>
          </div>
        </div>
      </div>

    </div>
  );
}
