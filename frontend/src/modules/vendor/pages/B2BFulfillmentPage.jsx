import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { materialApi, jobApi, b2bOrderApi } from '../../../lib/api';
import toast from 'react-hot-toast';

const B2BFulfillmentPage = () => {
    const navigate = useNavigate();
    const [cart, setCart] = useState([]);
    const [isRequesting, setIsRequesting] = useState(false);

    const [liveSupplies, setLiveSupplies] = useState([]);

    const rawData = localStorage.getItem('vendorData') || 
                     localStorage.getItem('user') || 
                     localStorage.getItem('userData') || '{}';
    const vendorData = JSON.parse(rawData);
    const vendorId = vendorData._id || vendorData.id || vendorData.user?._id || vendorData.user?.id;

    const supplies = useMemo(() => liveSupplies.map(m => ({
        id: m._id,
        title: m.name,
        price: m.price,
        icon: m.icon || 'fluid_med',
        supplierId: m.supplierId,
        movFreeDelivery: m.movFreeDelivery || 0,
        deliveryCharges: m.deliveryCharges || 0
    })), [liveSupplies]);

    const fetchMaterials = async () => {
        try {
            const materialsData = vendorId ? await materialApi.getLiveCatalog(vendorId) : [];
            if (Array.isArray(materialsData)) {
                setLiveSupplies(materialsData);
            } else {
                console.error('Expected array for materials but got:', materialsData);
                setLiveSupplies([]);
                if (materialsData && materialsData.message) {
                    toast.error(materialsData.message);
                }
            }
        } catch (error) {
            console.error('Fetch Data Error:', error);
            toast.error(error.message || 'Failed to load supplies');
            setLiveSupplies([]);
        }
    };

    useEffect(() => {
        fetchMaterials();
    }, [vendorId]);

    const { itemSubtotal, totalDeliveryCharges, grandTotal, supplierTotals } = useMemo(() => {
        let subTotal = 0;
        const supplierGroups = {};

        // Calculate item subtotal and group by supplier
        cart.forEach(item => {
            const itemTotal = (item.price || 0) * (item.quantity || 1);
            subTotal += itemTotal;
            
            if (!supplierGroups[item.supplierId]) {
                supplierGroups[item.supplierId] = {
                    totalAmount: 0,
                    movFreeDelivery: item.movFreeDelivery,
                    deliveryCharges: item.deliveryCharges
                };
            }
            supplierGroups[item.supplierId].totalAmount += itemTotal;
        });

        // Calculate delivery charges per supplier
        let deliveryTotal = 0;
        Object.values(supplierGroups).forEach(group => {
            if (group.totalAmount < group.movFreeDelivery) {
                deliveryTotal += group.deliveryCharges;
            }
        });

        return {
            itemSubtotal: subTotal,
            totalDeliveryCharges: deliveryTotal,
            grandTotal: subTotal + deliveryTotal,
            supplierTotals: supplierGroups
        };
    }, [cart]);

    const addToCart = (item) => {
        setCart(prev => {
            const existing = prev.find(i => i.id === item.id);
            if (existing) {
                return prev.map(i => i.id === item.id ? { ...i, quantity: (i.quantity || 1) + 1 } : i);
            }
            return [...prev, { ...item, quantity: 1 }];
        });
    };

    const removeFromCart = (itemId) => {
        setCart(prev => {
            const existing = prev.find(i => i.id === itemId);
            if (existing) {
                if (existing.quantity > 1) {
                    return prev.map(i => i.id === itemId ? { ...i, quantity: i.quantity - 1 } : i);
                }
                return prev.filter(i => i.id !== itemId);
            }
            return prev;
        });
    };

    const getItemCount = (itemId) => {
        const item = cart.find(i => i.id === itemId);
        return item ? item.quantity : 0;
    };

    return (
        <div className="bg-background text-on-surface min-h-[100dvh] pb-44 flex flex-col overflow-x-hidden">
            <header className="px-6 pt-4 flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <motion.button 
                        whileTap={{ scale: 0.9 }}
                        onClick={() => navigate(-1)}
                        className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-on-surface border border-slate-300"
                    >
                        <span className="material-symbols-outlined text-xl">arrow_back</span>
                    </motion.button>
                    <div>
                        <h1 className="text-2xl font-black tracking-tighter leading-none">Fulfillment</h1>
                        <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest opacity-40 mt-1">Industrial Logistics Hub</p>
                    </div>
                </div>
                <div className="relative">
                    <div className="w-12 h-12 rounded-2xl bg-surface-container flex items-center justify-center text-on-surface border border-slate-200">
                        <span className="material-symbols-outlined">shopping_basket</span>
                    </div>
                    {cart.length > 0 && (
                        <motion.span 
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-on-primary text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white"
                        >
                            {cart.length}
                        </motion.span>
                    )}
                </div>
            </header>

            <main className="px-6 space-y-8 flex-1">
                <div className="space-y-4">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary ml-2">Available Resources</h2>
                    <div className="grid grid-cols-1 gap-4">
                        {supplies.map(item => (
                            <motion.div
                                key={item.id}
                                whileHover={{ scale: 1.01 }}
                                className="bg-white p-6 rounded-[2.5rem] border border-slate-300 shadow-sm flex items-center justify-between group"
                            >
                                <div className="flex items-center gap-5">
                                    <div className="w-12 h-12 rounded-2xl bg-surface-container flex items-center justify-center text-primary border border-slate-100 group-hover:bg-primary/5 transition-colors">
                                        <span className="material-symbols-outlined text-2xl">{item.icon}</span>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-on-surface leading-none mb-1">{item.title}</h3>
                                        <p className="text-[11px] font-black text-primary tracking-tight leading-none opacity-80">₹{item.price}</p>
                                    </div>
                                </div>
                                {getItemCount(item.id) > 0 ? (
                                    <div className="flex items-center gap-3 bg-slate-50 p-1 rounded-2xl border border-slate-200">
                                        <motion.button
                                            whileTap={{ scale: 0.9 }}
                                            onClick={() => removeFromCart(item.id)}
                                            className="w-10 h-10 rounded-xl bg-white text-primary flex items-center justify-center border border-slate-200 hover:bg-rose-50 hover:text-rose-600 transition-all"
                                        >
                                            <span className="material-symbols-outlined text-lg">remove</span>
                                        </motion.button>
                                        
                                        <span className="text-sm font-black text-slate-900 w-6 text-center">{getItemCount(item.id)}</span>
                                        
                                        <motion.button
                                            whileTap={{ scale: 0.9 }}
                                            onClick={() => addToCart(item)}
                                            className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center shadow-lg shadow-primary/20"
                                        >
                                            <span className="material-symbols-outlined text-lg">add</span>
                                        </motion.button>
                                    </div>
                                ) : (
                                    <motion.button
                                        whileTap={{ scale: 0.9 }}
                                        onClick={() => addToCart(item)}
                                        className="w-12 h-12 rounded-2xl border border-primary/20 bg-primary/5 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-all shadow-sm"
                                    >
                                        <span className="material-symbols-outlined">add</span>
                                    </motion.button>
                                )}
                            </motion.div>
                        ))}
                    </div>
                </div>
            </main>

            {/* Bottom Request Bar - Positioned above floating nav */}
            {cart.length > 0 && (
                <div className="fixed bottom-28 left-4 right-4 p-5 bg-white/95 backdrop-blur-2xl rounded-[2.5rem] border border-slate-300 shadow-[0_20px_50px_rgba(0,0,0,0.2)] z-[150]">
                    <div className="max-w-2xl mx-auto flex items-center justify-between gap-6">
                        <div>
                            <p className="text-[8px] font-black uppercase tracking-widest text-on-surface-variant opacity-40 mb-1">Estimated Requisition</p>
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-bold text-slate-500">Items: ₹{itemSubtotal}</span>
                                    <span className="text-[10px] font-bold text-slate-500">+</span>
                                    <span className="text-[10px] font-bold text-slate-500">Delivery: ₹{totalDeliveryCharges}</span>
                                </div>
                                <p className="text-3xl font-black text-primary tracking-tighter leading-none">
                                    ₹{grandTotal}
                                </p>
                            </div>
                        </div>
                        <motion.button
                            whileTap={{ scale: 0.95 }}
                            disabled={isRequesting}
                            onClick={async () => { 
                                console.log('🚀 [B2B_ORDER] Place Requisition Clicked');
                                try {
                                    setIsRequesting(true);
                                    
                                    const rawData = localStorage.getItem('vendorData') || 
                                                     localStorage.getItem('user') || 
                                                     localStorage.getItem('userData');
                                    
                                    if (!rawData) {
                                        toast.error('Session expired. Please login again.');
                                        setIsRequesting(false);
                                        return;
                                    }

                                    const vendorData = JSON.parse(rawData);
                                    
                                    // Smart ID Extraction: Check root, then check nested .user object
                                    const vendorId = vendorData._id || vendorData.id || vendorData.user?._id || vendorData.user?.id;
                                    const pincode = vendorData.shopDetails?.pincode || vendorData.pincode || vendorData.user?.shopDetails?.pincode;
                                    const city = vendorData.shopDetails?.city || vendorData.city || vendorData.user?.shopDetails?.city;

                                    console.log('📦 [B2B_ORDER] Identity Context:', { vendorId, pincode, city });

                                    if (!pincode || pincode === 'undefined') {
                                        console.warn('⚠️ [B2B_ORDER] Pincode Missing');
                                        toast.error('Location Pincode missing! Please update your shop profile first.');
                                        setIsRequesting(false);
                                        return;
                                    }
                                    if (!vendorId) {
                                        console.warn('⚠️ [B2B_ORDER] Vendor ID Missing');
                                        toast.error('Authentication Error. Please login again.');
                                        setIsRequesting(false);
                                        return;
                                    }

                                    const orderData = {
                                        vendorId: vendorId,
                                        items: cart.map(item => ({
                                            materialId: item.id,
                                            name: item.title,
                                            price: item.price,
                                            quantity: item.quantity || 1
                                         })),
                                        totalAmount: grandTotal,
                                        subTotal: itemSubtotal,
                                        deliveryCharges: totalDeliveryCharges,
                                        shippingAddress: vendorData.address || vendorData.shopDetails?.address || vendorData.user?.shopDetails?.address,
                                        pincode: pincode,
                                        city: city
                                    };

                                    console.log('📡 [B2B_ORDER] Sending Order Data:', orderData);
                                    const loadingToast = toast.loading('Routing your request to regional supplier...');
                                    
                                    const res = await b2bOrderApi.placeOrder(orderData);
                                    toast.dismiss(loadingToast);

                                    if (res.order) {
                                        toast.success('Success! Order broadcasted to regional suppliers.');
                                        setCart([]);
                                        setTimeout(() => navigate('/vendor/dashboard'), 2000);
                                    } else {
                                        toast.error(res.message || 'Routing failed');
                                        setIsRequesting(false);
                                    }
                                } catch (error) {
                                    console.error('❌ [B2B_ORDER] Placement Error:', error);
                                    toast.error('Logistics error: No supplier available in your area.');
                                    setIsRequesting(false);
                                }
                            }}
                            className="flex-[2] py-5 bg-primary text-on-primary rounded-[2rem] font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-primary/20 pointer-events-auto relative z-[10]"
                        >
                            {isRequesting ? (
                                <motion.span 
                                    animate={{ rotate: 360 }}
                                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                                    className="material-symbols-outlined"
                                >
                                    sync
                                </motion.span>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-sm">rocket_launch</span>
                                    Place Requisition
                                </>
                            )}
                        </motion.button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default B2BFulfillmentPage;
