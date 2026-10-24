import { appDialog } from '../../../shared/stores/appDialogStore';
import BrandLogo from '../../../shared/components/BrandLogo.jsx';
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { b2bOrderApi, authApi } from '../../../lib/api';
import toast from 'react-hot-toast';
import useNotificationStore from '../../../shared/stores/notificationStore';
import SupplierOrderDetailsModal from '../components/SupplierOrderDetailsModal';

const SupplierDashboard = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('available');
    const [orders, setOrders] = useState([]);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [updatingOrderId, setUpdatingOrderId] = useState(null);
    const [expandedOrderId, setExpandedOrderId] = useState(null);
    const [dateModalOpen, setDateModalOpen] = useState(false);
    const [selectedOrderForDate, setSelectedOrderForDate] = useState(null);
    const [newDeliveryDate, setNewDeliveryDate] = useState('');
    const [updatingDate, setUpdatingDate] = useState(false);

    const b2bStatusMapSupplier = {
        'SUBMITTED': { label: 'New Order Received', emoji: '📥', color: 'bg-amber-50 text-amber-600 border-amber-200' },
        'ACCEPTED': { label: 'Timeline Scheduled', emoji: '📅', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
        'PROCESSING': { label: 'Preparing Order', emoji: '📦', color: 'bg-blue-50 text-blue-600 border-blue-200' },
        'DISPATCHED': { label: 'Shipped / En Route', emoji: '🚚', color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
        'DELIVERED': { label: 'Fulfilled & Completed', emoji: '🏁', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
        'REJECTED': { label: 'Order Declined', emoji: '🚫', color: 'bg-rose-50 text-rose-600 border-rose-200' },
        'CANCELLED': { label: 'Cancelled by Buyer', emoji: '💣', color: 'bg-red-50 text-red-600 border-red-200' },

        // Old CamelCase statuses for backward compatibility
        'Submitted': { label: 'New Order Received', emoji: '📥', color: 'bg-amber-50 text-amber-600 border-amber-200' },
        'Confirmed': { label: 'Timeline Scheduled', emoji: '📅', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
        'Accepted': { label: 'Timeline Scheduled', emoji: '📅', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
        'Out for Delivery': { label: 'Shipped / En Route', emoji: '🚚', color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
        'Delivered': { label: 'Fulfilled & Completed', emoji: '🏁', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
        'Cancelled': { label: 'Cancelled by Buyer', emoji: '💣', color: 'bg-red-50 text-red-600 border-red-200' }
    };

    const getStatusLabel = (status) => b2bStatusMapSupplier[status]?.label || status;
    const getStatusIcon = (status) => b2bStatusMapSupplier[status]?.emoji || '📥';
    const getStatusColor = (status) => b2bStatusMapSupplier[status]?.color || 'bg-slate-500 text-white';

    const getNextStatus = (status) => {
        if (!status) return null;
        const s = status.toUpperCase();
        if (s === 'ACCEPTED' || s === 'CONFIRMED') return 'PROCESSING';
        if (s === 'PROCESSING') return 'DISPATCHED';
        if (s === 'DISPATCHED' || s === 'OUT FOR DELIVERY') return 'DELIVERED';
        return null;
    };


    const user = JSON.parse(localStorage.getItem('supplierData') || localStorage.getItem('userData') || localStorage.getItem('user') || '{}');
    const supplierId = user._id || user.id;

    const fetchOrders = async () => {
        try {
            setLoading(true);
            const ordersData = await b2bOrderApi.getSupplierOrders(supplierId);
            setOrders(ordersData);
        } catch (error) {
            console.error('Fetch Data Error:', error);
            toast.error('Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    };

    const { fetchNotifications, unreadCount } = useNotificationStore();

    useEffect(() => {
        if (supplierId) {
            fetchOrders();
            fetchNotifications(supplierId, 'supplier');
        }
    }, [supplierId]);

    const handleStatusUpdate = async (orderId, newStatus) => {
        try {
            setUpdatingOrderId(orderId);
            await b2bOrderApi.updateStatus(orderId, { status: newStatus, supplierId });
            toast.success(`Order marked as ${newStatus}`);
            fetchOrders();
        } catch (error) {
            console.error('Update Status Error:', error);
            toast.error(error.response?.data?.message || 'Failed to update status');
        } finally {
            setUpdatingOrderId(null);
        }
    };

    const handleUpdateDeliveryDate = async () => {
        if (!selectedOrderForDate || !newDeliveryDate) return;
        try {
            setUpdatingDate(true);
            const res = await b2bOrderApi.updateDeliveryDate(selectedOrderForDate._id, newDeliveryDate);
            if (res.error) {
                toast.error(res.message || res.error || 'Failed to update delivery date');
            } else {
                toast.success('Delivery date updated successfully');
                setDateModalOpen(false);
                fetchOrders();
            }
        } catch (error) {
            console.error('Update Delivery Date Error:', error);
            toast.error(error.message || 'Failed to update delivery date');
        } finally {
            setUpdatingDate(false);
        }
    };

    const handleBulkDeliver = async () => {
        const activeOrders = orders.filter(o => o.supplier && !['DELIVERED', 'Delivered', 'CANCELLED', 'Cancelled', 'REJECTED'].includes(o.status));
        if (activeOrders.length === 0) {
            toast.error('No active orders to mark as delivered');
            return;
        }

        try {
            setLoading(true);
            const orderIds = activeOrders.map(o => o._id);
            await b2bOrderApi.bulkUpdateStatus({
                orderIds,
                status: 'DELIVERED',
                supplierId
            });
            toast.success('All active orders marked as Delivered');
            fetchOrders();
        } catch (error) {
            console.error('Bulk Update Error:', error);
            toast.error('Failed to update orders');
        } finally {
            setLoading(false);
        }
    };

    const handleVendorBulkUpdate = async (orderIds, nextStatus) => {
        try {
            setLoading(true);
            await b2bOrderApi.bulkUpdateStatus({
                orderIds,
                status: nextStatus,
                supplierId
            });
            toast.success(`Orders marked as ${nextStatus}`);
            fetchOrders();
        } catch (error) {
            console.error('Bulk Update Error:', error);
            toast.error('Failed to update orders');
        } finally {
            setLoading(false);
        }
    };

    const containerVariants = useMemo(() => ({
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
    }), []);
    const itemVariants = useMemo(() => ({
        hidden: { y: 20, opacity: 0 },
        visible: { y: 0, opacity: 1 }
    }), []);

    const dashboardTabs = useMemo(() => ['Incoming Orders', 'History', 'Logistics'], []);

    const inProgressOrders = useMemo(() => {
        return orders.filter(o => 
            o.supplier && 
            ['ACCEPTED', 'Accepted', 'Confirmed', 'PROCESSING', 'Processing', 'DISPATCHED', 'Dispatched', 'Out for Delivery'].includes(o.status)
        );
    }, [orders]);

    const aggregatedStats = useMemo(() => {
        const stats = {};
        orders.forEach(order => {
            // Only aggregate orders that this supplier has accepted and aren't delivered yet
            if (order.supplier && order.status !== 'Delivered') {
                order.items.forEach(item => {
                    const name = item.name.toLowerCase();
                    if (!stats[name]) stats[name] = { quantity: 0, unit: 'Units' };
                    stats[name].quantity += item.quantity;
                    
                    if (name.includes('detergent')) stats[name].unit = 'KG';
                    else if (name.includes('softener') || name.includes('liquid')) stats[name].unit = 'Ltr';
                    else if (name.includes('hanger') || name.includes('bag')) stats[name].unit = 'Units';
                    else stats[name].unit = 'Qty';
                });
            }
        });
        return Object.entries(stats).map(([name, data]) => ({ name, ...data }));
    }, [orders]);

    const vendorAggregatedStats = useMemo(() => {
        const vendorGroups = {};
        
        orders.forEach(order => {
            // Include orders that are Accepted, Processing, or Dispatched (belonging to this supplier)
            if (order.supplier && ['Accepted', 'ACCEPTED', 'PROCESSING', 'Dispatched', 'DISPATCHED', 'Out for Delivery'].includes(order.status)) {
                const vendorId = order.vendor?._id || 'unknown_vendor';
                
                if (!vendorGroups[vendorId]) {
                    vendorGroups[vendorId] = {
                        vendorId: vendorId,
                        vendorName: order.vendor?.displayName || 'Unknown Vendor',
                        vendorPhone: order.vendor?.phone || 'N/A',
                        deliveryAddress: order.shippingAddress || 'Address not provided',
                        deliveryCity: order.vendor?.shopDetails?.city || 'Local',
                        totalAmount: 0,
                        orderIds: [],
                        orders: [],
                        earliestOrderDate: order.createdAt,
                        items: {}
                    };
                }
                
                const group = vendorGroups[vendorId];
                group.totalAmount += order.totalAmount || 0;
                group.orderIds.push(order._id);
                group.orders.push(order);
                
                if (new Date(order.createdAt) < new Date(group.earliestOrderDate)) {
                    group.earliestOrderDate = order.createdAt;
                }

                // Aggregate items
                order.items.forEach(item => {
                    const name = item.name;
                    if (!group.items[name]) {
                        group.items[name] = { quantity: 0 };
                    }
                    group.items[name].quantity += item.quantity;
                });
            }
        });
        
        return Object.values(vendorGroups).map(group => {
            // Determine next status
            let nextStatus = 'DELIVERED';
            if (group.orders.some(o => ['Accepted', 'ACCEPTED'].includes(o.status))) {
                nextStatus = 'PROCESSING';
            } else if (group.orders.some(o => o.status === 'PROCESSING')) {
                nextStatus = 'DISPATCHED';
            }
            
            return {
                ...group,
                nextStatus,
                itemsList: Object.entries(group.items).map(([name, data]) => ({ name, ...data }))
            };
        });
    }, [orders]);

    const isToday = (dateInput) => {
        if (!dateInput) return false;
        const d = new Date(dateInput);
        const today = new Date();
        return d.getDate() === today.getDate() &&
               d.getMonth() === today.getMonth() &&
               d.getFullYear() === today.getFullYear();
    };

    const isWithinNext2Days = (dateInput) => {
        if (!dateInput) return false;
        const d = new Date(dateInput);
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfLimit = new Date(startOfToday.getTime() + 3 * 24 * 60 * 60 * 1000);
        return d.getTime() >= startOfToday.getTime() && d.getTime() < endOfLimit.getTime();
    };

    const isCurrentMonth = (dateInput) => {
        if (!dateInput) return false;
        const d = new Date(dateInput);
        const now = new Date();
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    };

    const newRequestsCount = useMemo(() => {
        return orders.filter(o => 
            ['SUBMITTED', 'Confirmed', 'Open', 'Pending'].includes(o.status)
        ).length;
    }, [orders]);

    const upcomingPickupsCount = useMemo(() => {
        return orders.filter(o => 
            ['ACCEPTED', 'Confirmed', 'PROCESSING'].includes(o.status) &&
            o.deliveryDate && 
            isWithinNext2Days(o.deliveryDate)
        ).length;
    }, [orders]);

    const activeOrdersCount = useMemo(() => {
        return orders.filter(o => 
            ['ACCEPTED', 'Confirmed', 'PROCESSING', 'DISPATCHED', 'Out for Delivery'].includes(o.status) && 
            isCurrentMonth(o.updatedAt || o.createdAt)
        ).length;
    }, [orders]);

    const businessBookedToday = useMemo(() => {
        return orders
            .filter(o => 
                !['SUBMITTED', 'Open', 'Pending', 'REJECTED', 'CANCELLED', 'Cancelled'].includes(o.status) && 
                isCurrentMonth(o.updatedAt || o.createdAt)
            )
            .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    }, [orders]);

    const totalPayoutsReceived = useMemo(() => {
        return orders
            .filter(o => 
                o.paymentStatus === 'Paid' && 
                isCurrentMonth(o.updatedAt || o.createdAt)
            )
            .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    }, [orders]);

    const readyForDeliveryCount = useMemo(() => {
        return orders.filter(o => o.status === 'PROCESSING').length;
    }, [orders]);

    const formatB2BDate = (dateInput) => {
        if (!dateInput) return 'N/A';
        const d = new Date(dateInput);
        if (isNaN(d.getTime())) return 'N/A';
        const day = d.getDate();
        const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
        const year = d.getFullYear();
        return `${day} ${month} ${year}`;
    };

    const formatReceivedDate = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'N/A';
        const day = date.getDate();
        const month = date.toLocaleString('en-US', { month: 'short' });
        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'pm' : 'am';
        hours = hours % 12;
        hours = hours ? hours : 12;
        return `${day} ${month}, ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
    };

    return (
        <div className="text-on-surface min-h-screen pb-60 font-body relative">
            {/* Header */}
            <header className="px-6 pt-2 flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <BrandLogo className="h-10 w-auto" />
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1 animate-pulse"></div>
                </div>

                {/* Profile Icon */}
                <motion.div 
                    onClick={() => navigate('/supplier/profile')}
                    whileHover={{ scale: 1.05 }}
                    className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden cursor-pointer border border-slate-200"
                >
                    {user.avatar ? (
                        <img src={user.avatar} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                        <span className="material-symbols-outlined text-slate-500 text-[20px]">person</span>
                    )}
                </motion.div>
            </header>

            {/* MONTH SUMMARY (ULTRA COMPACT BLACK & WHITE MATCHING VENDOR STYLE) */}
            <section className="px-6 mb-6 max-w-xl mx-auto w-full">
                <div className="relative bg-black text-white p-3.5 rounded-[2rem] shadow-xl border border-neutral-900">
                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-2.5 px-1">
                            <p className="text-[12px] font-medium text-zinc-400 tracking-wider leading-none">Monthly Summary</p>
                            <div className="w-8 h-8 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400">
                                <span className="material-symbols-outlined text-[18px]">calendar_month</span>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { label: 'New Request', value: newRequestsCount },
                                { label: 'Upcoming Pickups (Next 2 days)', value: upcomingPickupsCount, highlight: upcomingPickupsCount > 0 },
                                { label: 'Active orders', value: activeOrdersCount },
                                { label: 'Business booked today', value: `₹${businessBookedToday.toLocaleString('en-IN')}` },
                                { label: 'Total Payouts received', value: `₹${totalPayoutsReceived.toLocaleString('en-IN')}` },
                                { label: 'Ready for delivery', value: readyForDeliveryCount },
                            ].map((stat, idx) => (
                                <div key={idx} className={`flex items-center justify-between py-2 px-4 rounded-2xl border min-h-[44px] transition-colors ${stat.highlight ? 'bg-red-500/10 border-red-500/50 hover:bg-red-500/20' : 'bg-black border-white hover:border-white/80'}`}>
                                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                        <span className={`text-[10px] font-bold leading-snug line-clamp-2 ${stat.highlight ? 'text-red-400' : 'text-zinc-300'}`}>
                                            {stat.label}
                                        </span>
                                    </div>
                                    <span className={`text-xs font-black shrink-0 ml-2 ${stat.highlight ? 'text-red-500' : 'text-white'}`}>
                                        {stat.value}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* TABS */}
            <div className="px-6 mb-6 relative z-10">
                <div className="flex p-1 bg-white/60 rounded-2xl gap-1 backdrop-blur-xl border border-black/5 shadow-sm">
                    {['available', 'queue', 'history'].map(tab => {
                        const count = tab === 'available'
                            ? orders.filter(o => ['SUBMITTED', 'Confirmed', 'Open', 'Pending'].includes(o.status)).length
                            : tab === 'queue'
                            ? inProgressOrders.length
                            : orders.filter(o => ['Delivered', 'DELIVERED', 'Settled', 'SETTLED', 'Cancelled', 'CANCELLED', 'REJECTED'].includes(o.status)).length;

                        return (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`flex-1 py-3.5 px-1 rounded-[1.1rem] text-[9px] font-black uppercase tracking-tight transition-all flex items-center justify-center gap-1.5 ${
                                    activeTab === tab 
                                    ? 'bg-white text-slate-950 shadow-md scale-[1.02]' 
                                    : 'text-slate-400 hover:text-slate-600'
                                }`}
                            >
                                <span>{tab === 'available' ? 'Available' : tab === 'queue' ? 'In Progress' : 'Completed'}</span>
                                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-black tabular-nums transition-colors ${
                                    activeTab === tab ? 'bg-slate-950 text-white' : 'bg-slate-200 text-slate-400'
                                }`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <main className="px-6 space-y-8 flex-1 max-w-xl mx-auto w-full">
                <AnimatePresence mode="wait">
                    {activeTab === 'queue' && (
                        <motion.div 
                            key="queue" 
                            initial={{ opacity: 0, y: 10 }} 
                            animate={{ opacity: 1, y: 0 }} 
                            exit={{ opacity: 0, y: -10 }} 
                            transition={{ duration: 0.2 }}
                            className="space-y-6"
                        >
                            <section className="space-y-4 pb-20">

                                {inProgressOrders.length === 0 ? (
                                    <div className="text-center py-10 opacity-40 italic text-xs font-black uppercase tracking-widest">No active deliveries in progress.</div>
                                ) : (
                                    inProgressOrders.map((order) => {
                                        const nextStatus = getNextStatus(order.status);
                                        return (
                                            <motion.div 
                                                key={order._id}
                                                variants={itemVariants}
                                                initial="hidden"
                                                animate="visible"
                                                className="w-full max-w-xl mx-auto bg-white p-4.5 rounded-[2rem] border border-slate-150 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-2.5 relative overflow-hidden group text-slate-900 text-left"
                                            >
                                                {/* Top Row: Order ID Badge */}
                                                <div className="flex justify-start">
                                                    <span className="bg-black text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm">
                                                        #{order.b2bOrderId}
                                                    </span>
                                                </div>

                                                {/* Key-Value Details Stack */}
                                                <div className="space-y-2 my-1">
                                                    {/* DATE & TIME RECEIVED */}
                                                    <div className="flex items-center justify-between gap-4">
                                                        <span className="text-[8.5px] font-black text-[#8fa0b5] uppercase tracking-widest">
                                                            DATE & TIME RECEIVED
                                                        </span>
                                                        <span className="text-[10px] font-bold text-slate-800 bg-[#F8FAFC] px-3 py-1 rounded-lg border border-slate-100/50 flex items-center gap-1.5">
                                                            <span className="material-symbols-outlined text-[14px] text-slate-400">schedule</span>
                                                            {formatReceivedDate(order.createdAt)}
                                                        </span>
                                                    </div>

                                                    {/* TIME FOR DELIVERY */}
                                                    <div className="flex items-center justify-between gap-4">
                                                        <span className="text-[8.5px] font-black text-[#8fa0b5] uppercase tracking-widest">
                                                            TIME FOR DELIVERY
                                                        </span>
                                                        <span className="text-[10px] font-bold text-slate-800 bg-[#F8FAFC] px-3 py-1 rounded-lg border border-slate-100/50 flex items-center gap-1.5">
                                                            <span className="material-symbols-outlined text-[14px] text-slate-400">calendar_today</span>
                                                            {order.deliveryDate ? formatB2BDate(order.deliveryDate) : 'N/A'}
                                                        </span>
                                                    </div>

                                                    {/* VENDOR NAME */}
                                                    <div className="flex items-center justify-between gap-4">
                                                        <span className="text-[8.5px] font-black text-[#8fa0b5] uppercase tracking-widest">
                                                            VENDOR NAME
                                                        </span>
                                                        <span className="text-[10px] font-bold text-slate-800 bg-[#F8FAFC] px-3 py-1 rounded-lg border border-slate-100/50 flex items-center gap-1.5">
                                                            <span className="material-symbols-outlined text-[14px] text-slate-400">store</span>
                                                            {order.vendor?.displayName || 'Unknown Vendor'}
                                                        </span>
                                                    </div>

                                                    {/* VENDOR LOCATION */}
                                                    <div className="flex items-center justify-between gap-4">
                                                        <span className="text-[8.5px] font-black text-[#8fa0b5] uppercase tracking-widest">
                                                            VENDOR LOCATION
                                                        </span>
                                                        <span className="text-[10px] font-bold text-slate-800 bg-[#F8FAFC] px-3 py-1 rounded-lg border border-slate-100/50 flex items-center gap-1.5">
                                                            <span className="material-symbols-outlined text-[14px] text-slate-400">location_on</span>
                                                            {order.vendor?.shopDetails?.city || order.city || 'Local'}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Bottom Row: Amount & Action Buttons */}
                                                <div className="flex items-center justify-between pt-2.5 mt-1.5 border-t border-slate-100">
                                                    <div className="bg-[#F8FAFC] px-4 py-1.5 rounded-lg border border-slate-100/80 text-[11px] font-black text-slate-900">
                                                        ₹{order.totalAmount || 0}
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button 
                                                            onClick={() => navigate(`/supplier/order/${order._id}`)}
                                                            className="px-5 py-2 bg-black text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-md active:scale-95"
                                                        >
                                                            MORE
                                                        </button>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })
                                )}
                            </section>
                        </motion.div>
                    )}

                    {activeTab === 'available' && (
                        <motion.div 
                            key="available" 
                            initial={{ opacity: 0, y: 10 }} 
                            animate={{ opacity: 1, y: 0 }} 
                            exit={{ opacity: 0, y: -10 }} 
                            transition={{ duration: 0.2 }}
                            className="space-y-4"
                        >
                            <div className="space-y-4 pb-20">
                                {orders.filter(o => ['SUBMITTED', 'Confirmed', 'Open', 'Pending'].includes(o.status)).length === 0 ? (
                                    <div className="text-center py-10 opacity-40 italic text-xs font-black uppercase tracking-widest">No incoming orders in your region yet.</div>
                                ) : (
                                    orders.filter(o => ['SUBMITTED', 'Confirmed', 'Open', 'Pending'].includes(o.status)).map(order => (
                                        <motion.div 
                                            key={order._id}
                                            variants={itemVariants}
                                            initial="hidden"
                                            animate="visible"
                                            className="w-full max-w-md mx-auto bg-white text-slate-900 rounded-[2.2rem] p-4.5 border border-slate-200 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.06),0_8px_16px_-6px_rgba(0,0,0,0.04)] flex flex-col gap-4"
                                        >
                                            {/* Row 1: Action Buttons (Left) | Order ID (Right) */}
                                            <div className="flex justify-between items-center px-1">
                                                <div className="flex gap-2">
                                                    <button 
                                                        onClick={() => handleStatusUpdate(order._id, 'ACCEPTED')}
                                                        disabled={updatingOrderId === order._id}
                                                        className={`px-6 py-2.5 rounded-full font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${
                                                            updatingOrderId === order._id ? 'bg-slate-200 text-slate-500' : 'bg-black text-white hover:bg-neutral-800 shadow-md active:scale-95'
                                                        }`}
                                                    >
                                                        {updatingOrderId === order._id ? (
                                                            <>
                                                                <span className="material-symbols-outlined text-[10px] animate-spin">refresh</span>
                                                                PROCESSING
                                                            </>
                                                        ) : (
                                                            'ACCEPT'
                                                        )}
                                                    </button>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black bg-black text-white px-5 py-2 rounded-full uppercase tracking-widest shadow-sm">
                                                        #{order.b2bOrderId}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Dark summary box */}
                                            <div className="bg-[#090F21] text-white rounded-[1.8rem] p-5 shadow-xl relative overflow-hidden group border border-white/5">
                                                <div className="absolute right-0 top-0 p-4 opacity-[0.03] pointer-events-none">
                                                    <span className="material-symbols-outlined text-[60px]">local_shipping</span>
                                                </div>
                                                
                                                <div className="relative z-10 flex flex-col gap-4 text-left">
                                                    <div className="grid grid-cols-2 gap-y-4 gap-x-2">
                                                        {/* Left Column */}
                                                        <div className="space-y-4">
                                                            {/* Submitted Date */}
                                                            <div className="flex items-center gap-2">
                                                                <span className="material-symbols-outlined text-white/70 text-[20px] shrink-0">schedule</span>
                                                                <div className="min-w-0">
                                                                    <p className="text-[7.5px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">SUBMITTED DATE</p>
                                                                    <p className="text-[10px] font-black text-white uppercase truncate">
                                                                        {formatB2BDate(order.createdAt)}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            {/* Delivery Date */}
                                                            <div 
                                                                onClick={() => {
                                                                    setSelectedOrderForDate(order);
                                                                    const d = order.deliveryDate ? new Date(order.deliveryDate) : new Date();
                                                                    const formatted = d.toISOString().split('T')[0];
                                                                    setNewDeliveryDate(formatted);
                                                                    setDateModalOpen(true);
                                                                }}
                                                                className="flex items-center gap-2 cursor-pointer hover:bg-white/5 p-1 rounded-xl transition-all"
                                                            >
                                                                <span className="material-symbols-outlined text-white/70 text-[20px] shrink-0">calendar_today</span>
                                                                <div className="min-w-0">
                                                                    <p className="text-[7.5px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1 flex items-center gap-1">
                                                                        DELIVERY DATE
                                                                        <span className="material-symbols-outlined text-[10px] text-slate-400">edit</span>
                                                                    </p>
                                                                    <p className="text-[10px] font-black text-white uppercase truncate">
                                                                        {formatB2BDate(order.deliveryDate)}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Right Column */}
                                                        <div className="space-y-4">
                                                            {/* Vendor Name */}
                                                            <div className="flex items-center gap-2">
                                                                <span className="material-symbols-outlined text-white/70 text-[20px] shrink-0">store</span>
                                                                <div className="min-w-0">
                                                                    <p className="text-[7.5px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">VENDOR NAME</p>
                                                                    <p className="text-[10px] font-black text-white uppercase truncate">
                                                                        {order.vendor?.displayName || 'UNKNOWN VENDOR'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            {/* Vendor Address */}
                                                            <div className="flex items-center gap-2">
                                                                <span className="material-symbols-outlined text-white/70 text-[20px] shrink-0">location_on</span>
                                                                <div className="min-w-0">
                                                                    <p className="text-[7.5px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">VENDOR ADDRESS</p>
                                                                    <p className="text-[10px] font-black text-white uppercase truncate" title={order.shippingAddress || order.vendor?.shopDetails?.address || 'N/A'}>
                                                                        {order.shippingAddress || order.vendor?.shopDetails?.address || 'N/A'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Bottom Row: Price and More Button */}
                                            <div className="flex items-center justify-between px-1 mt-1">
                                                <span className="text-[20px] font-black text-slate-900">₹{order.totalAmount}</span>
                                                <button 
                                                    onClick={() => {
                                                        setSelectedOrder(order);
                                                        setShowModal(true);
                                                    }}
                                                    className="px-6 py-2.5 bg-black text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-md active:scale-95"
                                                >
                                                    MORE
                                                </button>
                                            </div>
                                        </motion.div>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'history' && (
                        <motion.div 
                            key="history" 
                            initial={{ opacity: 0, y: 10 }} 
                            animate={{ opacity: 1, y: 0 }} 
                            exit={{ opacity: 0, y: -10 }} 
                            transition={{ duration: 0.2 }}
                            className="space-y-6 pb-20"
                        >
                            <div className="space-y-3">
                                {orders.filter(o => ['Delivered', 'DELIVERED', 'Settled', 'SETTLED', 'Cancelled', 'CANCELLED', 'REJECTED'].includes(o.status)).slice(0, 50).map((order) => {
                                    return (
                                        <motion.div 
                                            key={order._id}
                                            layout
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm space-y-2 relative overflow-hidden group text-slate-900"
                                        >
                                            {/* Order ID */}
                                            <div className="flex justify-start items-center">
                                                <span className="bg-slate-900 text-white px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest">
                                                    #{order.b2bOrderId}
                                                </span>
                                            </div>

                                            {/* Date & Time Received */}
                                            <div className="flex items-center justify-between mt-1">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Date & Time Received</span>
                                                <span className="text-[10px] font-black text-slate-900 bg-slate-50 px-1.5 py-0.5 rounded-md border border-slate-100 flex items-center gap-1.5">
                                                    <span className="material-symbols-outlined text-[10px] text-slate-400">schedule</span>
                                                    {new Date(order.createdAt).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>

                                            {/* Time for Delivery */}
                                            <div className="flex items-center justify-between mt-1">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Time for Delivery</span>
                                                <span className="text-[10px] font-black text-slate-900 bg-slate-50 px-1.5 py-0.5 rounded-md border border-slate-100 flex items-center gap-1.5">
                                                    <span className="material-symbols-outlined text-[10px] text-slate-400">timer</span>
                                                    {(() => {
                                                        const end = ['DELIVERED', 'Delivered', 'CANCELLED', 'Cancelled', 'REJECTED'].includes(order.status) ? new Date(order.updatedAt) : new Date();
                                                        const timeTakenMs = end - new Date(order.createdAt);
                                                        const hours = Math.floor(timeTakenMs / (1000 * 60 * 60));
                                                        const minutes = Math.floor((timeTakenMs % (1000 * 60 * 60)) / (1000 * 60));
                                                        return `${hours}h ${minutes}m`;
                                                    })()}
                                                </span>
                                            </div>

                                            {/* Total Amount */}
                                            <div className="flex items-center justify-end mt-1">
                                                <span className="text-[12px] font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                                                    ₹{order.totalAmount || 0}
                                                </span>
                                            </div>

                                            {/* Actions for Completed Tab */}
                                            <div className="flex flex-col gap-1.5 mt-2 pt-2 border-t border-slate-100">
                                                <button 
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        await appDialog.alert('Invoice will be downloaded shortly.');
                                                    }}
                                                    className="w-full py-1.5 bg-black text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">download</span>
                                                    Download Invoice
                                                </button>
                                                
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setExpandedOrderId(expandedOrderId === order._id ? null : order._id);
                                                    }}
                                                    className="w-full py-1.5 bg-white text-black border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 shadow-sm"
                                                >
                                                    <span className="material-symbols-outlined text-[14px] transition-transform duration-300" style={{ transform: expandedOrderId === order._id ? 'rotate(180deg)' : 'none' }}>expand_more</span>
                                                    Product Detail
                                                </button>
                                            </div>

                                            {/* Expanded Product Details */}
                                            {expandedOrderId === order._id && (
                                                <motion.div 
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="overflow-hidden mt-1.5 bg-slate-50 p-2 rounded-2xl border border-slate-100 space-y-1.5 text-left"
                                                >
                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Products / Items</p>
                                                    {order.items?.map((item, idx) => (
                                                        <div key={idx} className="flex items-center justify-between py-1 border-b border-slate-200/50 last:border-0">
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] font-bold text-slate-800">{item.name}</span>
                                                            </div>
                                                            <span className="text-[10px] font-black text-slate-600 bg-white px-2 py-0.5 rounded shadow-sm border border-slate-100">Qty: {item.quantity || 1}</span>
                                                        </div>
                                                    ))}
                                                </motion.div>
                                            )}
                                        </motion.div>
                                    );
                                })}
                                {orders.filter(o => ['Delivered', 'DELIVERED', 'Settled', 'SETTLED', 'Cancelled', 'CANCELLED', 'REJECTED'].includes(o.status)).length === 0 && (
                                    <p className="text-center py-10 opacity-30 text-[11px] font-black uppercase tracking-widest italic">No historical data available</p>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {/* Order Details Modal */}
            <SupplierOrderDetailsModal
                order={showModal ? selectedOrder : null}
                statusLabel={selectedOrder && getStatusLabel(selectedOrder.status)}
                onClose={() => setShowModal(false)}
                accepting={updatingOrderId === selectedOrder?._id}
                onAccept={selectedOrder && ['SUBMITTED', 'Confirmed', 'Open', 'Pending'].includes(selectedOrder.status)
                    ? async () => {
                        await handleStatusUpdate(selectedOrder._id, 'ACCEPTED');
                        setShowModal(false);
                    }
                    : null}
            />

            {/* Delivery Date Change Modal */}
            <AnimatePresence>
                {dateModalOpen && selectedOrderForDate && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }} 
                            animate={{ opacity: 1 }} 
                            exit={{ opacity: 0 }}
                            onClick={() => setDateModalOpen(false)}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
                        />
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="bg-white w-full max-w-md rounded-[2.5rem] p-6 shadow-2xl relative z-10 flex flex-col gap-5 text-left border border-slate-100 text-slate-900"
                        >
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 leading-none">
                                    Change Delivery Date
                                </h3>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                    Order #{selectedOrderForDate.b2bOrderId}
                                </p>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">
                                    Select New Date
                                </label>
                                <input 
                                    type="date"
                                    value={newDeliveryDate}
                                    onChange={(e) => setNewDeliveryDate(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 text-sm font-bold text-slate-800 bg-[#F8FAFC]"
                                />
                            </div>

                            <div className="flex justify-end gap-2 mt-2">
                                <button 
                                    onClick={() => setDateModalOpen(false)}
                                    className="px-5 py-2.5 rounded-full border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all active:scale-95"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={handleUpdateDeliveryDate}
                                    disabled={updatingDate || !newDeliveryDate}
                                    className="px-6 py-2.5 bg-black text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                                >
                                    {updatingDate ? (
                                        <>
                                            <span className="material-symbols-outlined text-[12px] animate-spin">refresh</span>
                                            SAVING...
                                        </>
                                    ) : (
                                        'SAVE CHANGES'
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default SupplierDashboard;
