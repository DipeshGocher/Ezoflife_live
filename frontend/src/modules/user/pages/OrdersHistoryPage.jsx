import { appDialog } from '../../../shared/stores/appDialogStore';
import { renderCustomerInvoiceHtml } from '../../../lib/customerInvoiceHtml';
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { orderApi, adminApi } from '../../../lib/api';
import socket from '../../../lib/socket';
import { toast } from 'react-hot-toast';

const OrdersHistoryPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('active');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(null);
  
  // DATE FILTER STATES
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [orderTypeFilter, setOrderTypeFilter] = useState('all');
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);

  const userData = JSON.parse(localStorage.getItem('userData') || localStorage.getItem('user') || '{}');
  const userId = userData._id || userData.id || localStorage.getItem('userId');

  const [invoiceSettings, setInvoiceSettings] = useState(null);

  const isCancellable = (order) => {
    if (!order || !order.createdAt || order.status === 'CANCELLED') return false;
    const cancellableStatuses = ['ORDER_PLACED', 'PICKUP_ASSIGNED', 'RIDER_ARRIVING'];
    if (!cancellableStatuses.includes(order.status)) return false;
    const diffInMs = Date.now() - new Date(order.createdAt).getTime();
    const diffInMinutes = diffInMs / (1000 * 60);
    return diffInMinutes <= 120; // 2 hours
  };

  const handleCancelOrder = async (orderId) => {
    if (!await appDialog.confirm("Are you sure you want to cancel this order? Paid amount will be refunded automatically.")) return;
    try {
        setCancelling(orderId);
        const res = await orderApi.cancelOrder(orderId);
        toast.success(res.message || "Order cancelled successfully!");
        setOrders((prevOrders) => {
            return prevOrders.map((o) => {
                if (o._id === orderId || o.id === orderId) {
                    return {
                        ...o,
                        status: 'CANCELLED',
                        paymentStatus: o.paymentStatus === 'Paid' ? 'Refunded' : o.paymentStatus
                    };
                }
                return o;
            });
        });
    } catch (err) {
        toast.error(err.message || "Failed to cancel order");
    } finally {
        setCancelling(null);
    }
  };

  const fetchOrders = async () => {
    try {
      setLoading(true);
      console.log('📡 Fetching orders for UserID:', userId);
      try {
        const filters = {};
        if (startDate) filters.startDate = startDate;
        if (endDate) filters.endDate = endDate;
        if (orderTypeFilter !== 'all') filters.orderType = orderTypeFilter;

        const data = await orderApi.getMyOrders(userId, filters);
        console.log('✅ Received orders count:', data?.length || 0);
        
        setOrders(data || []);
      } catch (orderErr) {
        console.error('❌ Error fetching orders:', orderErr);
        setOrders([]);
      }

      try {
        const configs = await adminApi.getConfig();
        if (Array.isArray(configs)) {
          const invConfig = configs.find(c => c.key === 'invoice_settings');
          if (invConfig) setInvoiceSettings(invConfig.value);
        }
      } catch (configErr) {
        console.warn('⚠️ Could not fetch invoice settings, using defaults');
      }
    } catch (err) {
      console.error('❌ Error in fetchOrders main loop:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('📦 OrdersHistoryPage Mounted or Filters Changed. UserID:', userId);
    if (!userId) {
      console.warn('⚠️ No UserID found in local storage. Fetch aborted.');
      setLoading(false);
      return;
    }
    fetchOrders();
  }, [userId, startDate, endDate, orderTypeFilter]);

  useEffect(() => {
    const handleOrderStatusUpdate = (updatedOrder) => {
      console.log('🔌 [SOCKET] Received order status update in history:', updatedOrder);
      if (!updatedOrder || !updatedOrder._id) return;
      
      setOrders((prevOrders) => {
        return prevOrders.map((o) => {
          if (o._id === updatedOrder._id || o.id === updatedOrder._id) {
            return {
              ...o,
              ...updatedOrder
            };
          }
          return o;
        });
      });
    };

    socket.on('order_status_update', handleOrderStatusUpdate);

    return () => {
      socket.off('order_status_update', handleOrderStatusUpdate);
    };
  }, []);

  const activeOrders = useMemo(() => 
    orders.filter(o => !['DELIVERED', 'CANCELLED'].includes(o.status)), 
  [orders]);

  const pastOrders = useMemo(() => {
    let filtered = orders.filter(o => ['DELIVERED', 'CANCELLED'].includes(o.status));
    
    if (orderTypeFilter !== 'all') {
      filtered = filtered.filter(o => {
        if (orderTypeFilter === 'walk-in') return o.orderType === 'walk-in';
        if (orderTypeFilter === 'online') return o.orderType === 'online' || !o.orderType;
        return true;
      });
    }

    if (startDate || endDate) {
      filtered = filtered.filter(o => {
        const orderDate = new Date(o.createdAt).setHours(0,0,0,0);
        const start = startDate ? new Date(startDate).setHours(0,0,0,0) : null;
        const end = endDate ? new Date(endDate).setHours(0,0,0,0) : null;
        
        if (start && orderDate < start) return false;
        if (end && orderDate > end) return false;
        return true;
      });
    }
    
    return filtered;
  }, [orders, startDate, endDate, orderTypeFilter]);

  const containerVariants = useMemo(() => ({
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.2 }
    }
  }), []);

  const itemVariants = useMemo(() => ({
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { duration: 0.5, ease: "easeOut" } }
  }), []);

  const handleDownloadInvoice = (order) => {
    if (order.status !== 'DELIVERED' || order.invoices?.customerInvoice?.documentStatus !== 'FINALIZED') {
      toast.error('The final invoice is available after delivery.');
      return;
    }
    const html = renderCustomerInvoiceHtml(order, invoiceSettings || {});
    const printWindow = window.open('', '_blank');
    if (!printWindow) { toast.error('Allow pop-ups to download your invoice.'); return; }
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="text-on-background min-h-[100dvh] flex flex-col"
    >
      <main className="pt-[50px] pb-44 px-6 max-w-2xl mx-auto w-full">
        {loading ? (
          <div className="py-20 text-center flex flex-col items-center">
             <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full mb-6"
            />
            <p className="text-xs font-black uppercase tracking-[0.2em] opacity-40">Syncing with server...</p>
            <p className="text-[10px] opacity-20 mt-4">Session: {userId || 'Guest'}</p>
          </div>
        ) : (
          <>
        <motion.section 
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="mb-6 pt-4"
        >
          <div className="flex gap-4 mb-2">
            <button 
              onClick={() => setActiveTab('active')}
              className={`flex-1 py-4 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest transition-all relative overflow-hidden ${
                activeTab === 'active' 
                  ? 'bg-slate-900 text-white shadow-2xl shadow-slate-900/20' 
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              Active Orders
              {activeTab === 'active' && activeOrders.length > 0 && (
                <span className="ml-2 bg-primary text-on-primary px-2 py-0.5 rounded-full text-[8px]">{activeOrders.length}</span>
              )}
            </button>
            <button 
              onClick={() => setActiveTab('past')}
              className={`flex-1 py-4 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest transition-all ${
                activeTab === 'past' 
                  ? 'bg-slate-900 text-white shadow-2xl shadow-slate-900/20' 
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              Past Orders
            </button>
          </div>
        </motion.section>

        {/* Orders List */}
        <div className="min-h-[400px]">
          <AnimatePresence mode="wait">
            {activeTab === 'active' ? (
              <motion.div 
                key="active-section"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
                className="space-y-4"
              >
                {activeOrders.length > 0 ? (
                  activeOrders.map((order) => (
                    <motion.div 
                      key={order._id || order.id}
                      variants={itemVariants}
                      whileHover={{ scale: 1.01 }}
                      className="bg-white rounded-[2rem] p-5 relative overflow-hidden group shadow-[0_15px_40px_rgba(0,0,0,0.04)] border border-slate-100 mb-4"
                    >
                      <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-50">
                        <div className="space-y-1">
                          <h3 className="text-lg font-black text-slate-900 tracking-tighter leading-none">{order.orderId || `#${order._id?.slice(-6)}`}</h3>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-1">
                            {new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                        <p className="text-lg font-headline font-black text-slate-900 tracking-tighter leading-none">₹{order.totalAmount?.toFixed(2)}</p>
                      </div>

                      <div className="flex items-center justify-between gap-4 mb-5">
                        <div className="flex items-center gap-3 opacity-60">
                          <span className="material-symbols-outlined text-[16px]">storefront</span>
                          <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest truncate max-w-[120px]">{order.vendor?.displayName || 'Spinzyt Hub'}</p>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-100/50">
                          <span className="material-symbols-outlined text-xs text-primary">schedule</span>
                          <p className="text-[9px] font-black text-slate-900">
                            {new Date(order.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                          </p>
                        </div>
                      </div>

                      <div className="mb-5 px-1 relative">
                        <div className="flex justify-between text-[5.5px] text-slate-400 font-black uppercase tracking-widest mb-1.5 px-0.5">
                          <span className="text-primary">Placed</span>
                          <span className={['PICKUP_ASSIGNED', 'RIDER_ARRIVING', 'IN_TRANSIT', 'RECEIVED_BY_VENDOR', 'PROCESSING', 'READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(order.status) ? 'text-primary' : ''}>Rider Assigned</span>
                          <span className={['IN_TRANSIT', 'RECEIVED_BY_VENDOR', 'PROCESSING', 'READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(order.status) ? 'text-primary' : ''}>In Transit</span>
                          <span className={['PROCESSING', 'READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(order.status) ? 'text-primary' : ''}>Processing</span>
                          <span className={['OUT_FOR_DELIVERY', 'DELIVERED'].includes(order.status) ? 'text-primary' : ''}>Out for Delivery</span>
                        </div>
                        <div className="relative h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: 
                                order.status === 'PICKUP_ASSIGNED' ? '25%' : 
                                order.status === 'RIDER_ARRIVING' ? '37.5%' :
                                order.status === 'IN_TRANSIT' ? '50%' :
                                order.status === 'RECEIVED_BY_VENDOR' ? '62.5%' :
                                order.status === 'PROCESSING' ? '75%' : 
                                order.status === 'READY_FOR_DISPATCH' ? '87.5%' :
                                ['OUT_FOR_DELIVERY', 'DELIVERED'].includes(order.status) ? '100%' : '10%'
                            }}
                            className="absolute top-0 left-0 h-full bg-primary rounded-full transition-all duration-1000" 
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <motion.button 
                          whileTap={order.status === 'ORDER_PLACED' ? {} : { scale: 0.98 }}
                          onClick={() => {
                            if (order.status !== 'ORDER_PLACED') {
                              navigate(`/user/tracking/${order._id || order.id}`);
                            }
                          }}
                          disabled={order.status === 'ORDER_PLACED'}
                          className="flex-[1.5] py-3 rounded-xl font-black text-[8px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all bg-slate-900 text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
                        >
                          <span className="material-symbols-outlined text-[14px]">my_location</span>
                          Track
                        </motion.button>
                        
                        <motion.button 
                          whileTap={{ scale: 0.95 }}
                          onClick={() => navigate('/user/verification', { state: { orderId: order._id || order.id } })}
                          className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-black text-[8px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-200 transition-all"
                        >
                          <span className="material-symbols-outlined text-[14px]">inventory</span>
                          Articles
                        </motion.button>

                        <motion.button 
                          whileTap={{ scale: 0.95 }}
                          onClick={() => navigate(`/user/chat/${order._id}`)}
                          className="w-10 h-10 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center hover:bg-slate-200 transition-all shrink-0"
                        >
                          <span className="material-symbols-outlined text-lg">chat</span>
                        </motion.button>
                      </div>

                      {isCancellable(order) && (
                        <div className="mt-3">
                          <motion.button 
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleCancelOrder(order._id || order.id)}
                            disabled={cancelling === (order._id || order.id)}
                            className="w-full py-3 bg-rose-50 text-rose-600 rounded-xl font-black text-[8px] uppercase tracking-widest flex items-center justify-center gap-2 border border-rose-100/50 hover:bg-rose-100 transition-all shadow-sm"
                          >
                            {cancelling === (order._id || order.id) ? (
                              <div className="w-3.5 h-3.5 border-2 border-rose-600 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <>
                                <span className="material-symbols-outlined text-sm">cancel</span>
                                Cancel Order
                              </>
                            )}
                          </motion.button>
                        </div>
                      )}
                    </motion.div>
                  ))
                ) : (
                  <div className="py-20 text-center opacity-40">
                    <span className="material-symbols-outlined text-5xl mb-4">shopping_basket</span>
                    <p className="text-xs font-black uppercase tracking-widest">No active orders</p>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div 
                key="past-section"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
                className="space-y-2"
              >
                {/* Date Filter Toggle Button */}
                <motion.button
                  variants={itemVariants}
                  onClick={() => setShowDateFilter(!showDateFilter)}
                  className={`w-full py-2.5 rounded-xl font-black text-[8px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all mb-3 ${
                    showDateFilter || startDate || endDate || orderTypeFilter !== 'all'
                      ? 'bg-primary text-white shadow-lg'
                      : 'bg-white text-slate-900 border border-slate-200'
                  }`}
                >
                  <span className="material-symbols-outlined text-xs">filter_list</span>
                  {startDate || endDate || orderTypeFilter !== 'all' ? 'Filters Active' : 'Filter Orders'}
                  <span className="material-symbols-outlined text-xs transition-transform duration-300" style={{ transform: showDateFilter ? 'rotate(180deg)' : 'none' }}>expand_more</span>
                </motion.button>

                <AnimatePresence>
                  {showDateFilter && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-3 mb-6">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-0.5">
                            <label className="text-[7px] font-black text-slate-300 uppercase ml-2">From</label>
                            <input 
                              type={startDate ? "date" : "text"} 
                              placeholder="DD/MM/YYYY"
                              onFocus={(e) => e.target.type = 'date'}
                              onBlur={(e) => !startDate && (e.target.type = 'text')}
                              value={startDate}
                              onChange={(e) => setStartDate(e.target.value)}
                              className="w-full bg-slate-50 border-none rounded-lg px-3 py-2 text-[9px] font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                            />
                          </div>
                          <div className="space-y-0.5">
                            <label className="text-[7px] font-black text-slate-300 uppercase ml-2">To</label>
                            <input 
                              type={endDate ? "date" : "text"} 
                              placeholder="DD/MM/YYYY"
                              onFocus={(e) => e.target.type = 'date'}
                              onBlur={(e) => !endDate && (e.target.type = 'text')}
                              value={endDate}
                              onChange={(e) => setEndDate(e.target.value)}
                              className="w-full bg-slate-50 border-none rounded-lg px-3 py-2 text-[9px] font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                            />
                          </div>
                        </div>
                        <div className="space-y-0.5 mt-2 relative">
                           <label className="text-[7px] font-black text-slate-300 uppercase ml-2">Order Type</label>
                           <button 
                             onClick={() => setShowTypeDropdown(!showTypeDropdown)}
                             className="w-full bg-slate-50 border-none rounded-lg px-3 py-2 text-[9px] font-bold text-left flex justify-between items-center focus:ring-2 focus:ring-primary/20 transition-all"
                           >
                             <span className={orderTypeFilter === 'all' ? 'text-slate-600' : 'text-slate-900'}>
                               {orderTypeFilter === 'all' ? 'All Orders' : orderTypeFilter === 'online' ? 'Online Orders' : 'Walk-in Orders'}
                             </span>
                             <span className="material-symbols-outlined text-[14px] text-slate-400">expand_more</span>
                           </button>
                           
                           <AnimatePresence>
                             {showTypeDropdown && (
                               <motion.div 
                                 initial={{ opacity: 0, height: 0 }} 
                                 animate={{ opacity: 1, height: 'auto' }} 
                                 exit={{ opacity: 0, height: 0 }} 
                                 className="mt-1 bg-white border border-slate-100 rounded-lg shadow-sm overflow-hidden"
                               >
                                 {[{v: 'all', l: 'All Orders'}, {v: 'online', l: 'Online Orders'}, {v: 'walk-in', l: 'Walk-in Orders'}].map(opt => (
                                   <button 
                                     key={opt.v} 
                                     onClick={() => { setOrderTypeFilter(opt.v); setShowTypeDropdown(false); }} 
                                     className={`w-full text-left px-3 py-2.5 text-[9px] font-bold hover:bg-slate-50 transition-all border-b border-slate-50 last:border-b-0 ${orderTypeFilter === opt.v ? 'text-primary bg-primary/5' : 'text-slate-600'}`}
                                   >
                                     {opt.l}
                                   </button>
                                 ))}
                               </motion.div>
                             )}
                           </AnimatePresence>
                        </div>

                        {(startDate || endDate || orderTypeFilter !== 'all') && (
                          <button 
                            onClick={() => { setStartDate(''); setEndDate(''); setOrderTypeFilter('all'); }}
                            className="text-[8px] font-black text-rose-500 uppercase tracking-widest w-full py-1.5 hover:bg-rose-50 rounded-lg transition-all mt-2"
                          >
                            Clear Filters
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>



                {pastOrders.length > 0 ? (
                  pastOrders.map((order) => (
                    <motion.div 
                      key={order._id || order.id}
                      variants={itemVariants}
                      whileHover={{ scale: 1.01 }}
                      className="bg-white rounded-[1.2rem] p-4 relative overflow-hidden group shadow-[0_10px_30px_rgba(0,0,0,0.03)] border border-slate-100 mb-3 opacity-90 hover:opacity-100 transition-all"
                    >
                      <div className="flex justify-between items-center mb-3 pb-3 border-b border-slate-50">
                        <div className="space-y-0.5">
                          <h3 className="text-base font-bold text-slate-900 tracking-tight leading-none not-italic">{order.orderId || `#${order._id?.slice(-6)}`}</h3>
                          <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest not-italic">{new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {order.status === 'CANCELLED' ? (
                            <>
                              <span className="text-rose-600 uppercase text-[10px] font-black leading-none">Cancelled</span>
                              <span className="text-sm font-bold text-slate-500 leading-none">₹{order.totalAmount?.toFixed(0)}</span>
                            </>
                          ) : (
                            <span className="text-base font-black text-slate-900 tracking-tight leading-none">₹{order.totalAmount?.toFixed(0)}</span>
                          )}
                        </div>
                      </div>

                      <details className="group bg-slate-50/50 rounded-lg border border-slate-100/50 mb-3 overflow-hidden transition-all">
                        <summary className="list-none p-3 cursor-pointer flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-[12px] text-slate-400">inventory_2</span>
                            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none">Articles</p>
                          </div>
                          <span className="material-symbols-outlined text-slate-400 text-[10px] group-open:rotate-180 transition-transform">expand_more</span>
                        </summary>
                        <div className="px-3 pb-3 space-y-1.5">
                          {order.items && order.items.length > 0 ? (
                            order.items.map((item, idx) => (
                              <div key={idx} className="flex justify-between items-center bg-white/50 p-2 rounded-lg border border-slate-50">
                                <p className="text-[8px] font-black text-slate-900 uppercase">{item.name}</p>
                                <p className="text-[8px] font-black text-slate-900">₹{(item.price || 0) * (item.quantity || 1)}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-[8px] font-bold text-slate-400 italic text-center py-1">No items</p>
                          )}
                        </div>
                      </details>

                      <div className="flex justify-between items-center mt-2">
                        <motion.button 
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleDownloadInvoice(order)}
                          className="py-2.5 px-8 bg-black text-white rounded-full font-black text-[8px] uppercase tracking-widest flex items-center justify-center gap-1.5"
                        >
                          Invoice
                        </motion.button>
                        <motion.button 
                          whileTap={{ scale: 0.95 }}
                          onClick={() => {
                            const newCart = { 'dry-clean': 2, 'ironing': 5 };
                            localStorage.setItem('cart_quantities', JSON.stringify(newCart));
                            navigate('/user/cart');
                          }}
                          className="py-2.5 px-8 bg-black text-white rounded-full font-black text-[8px] uppercase tracking-widest flex items-center justify-center gap-1.5"
                        >
                          Reorder
                        </motion.button>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="py-20 text-center opacity-40">
                    <span className="material-symbols-outlined text-5xl mb-4">archive</span>
                    <p className="text-xs font-black uppercase tracking-widest">No history found</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        </>
        )}
      </main>
    </motion.div>
  );
};

export default OrdersHistoryPage;
