import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import UserHeader from '../components/UserHeader';
import BottomNav from '../components/BottomNav';
import VendorHeader from '../../vendor/components/VendorHeader';

// Vendor-specific imports for unification
import socket, { subscribeSocketRooms } from '../../../lib/socket';
import { orderApi, authApi } from '../../../lib/api';
import useNotificationStore from '../../../shared/stores/notificationStore';
import useVendorOrderStore from '../../../shared/stores/vendorOrderStore';
import toast from 'react-hot-toast';

const UserLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname.replace(/\/$/, '') || '/user';
  
  const [userRole, setUserRole] = useState(() => {
    try {
      return (localStorage.getItem('userRole') || 'customer').toLowerCase();
    } catch (e) {
      return 'customer';
    }
  });
  const [activationAvailable, setActivationAvailable] = useState(false);

  // Vendor-specific state & logic
  const { incomingRequest, setIncomingRequest, clearIncomingRequest } = useVendorOrderStore();
  const [acceptingId, setAcceptingId] = useState(null);
  const [timeLeft, setTimeLeft] = useState(45);
  const { addNotification } = useNotificationStore();

  const getSafeStorage = (key) => {
    try {
      return JSON.parse(localStorage.getItem(key) || '{}');
    } catch (e) {
      return {};
    }
  };

  const socketUser = getSafeStorage('user');
  const socketUserId = socketUser._id || socketUser.id;
  const vendorData = getSafeStorage('vendorData');
  const vendorId = vendorData?._id || vendorData?.id;

  // Reconcile an approval missed while offline; only the authenticated own
  // profile can change the portal mode. An event payload alone is not trusted.
  useEffect(() => {
    if (!socketUserId || userRole !== 'customer') return;
    let current = true, inFlight = false;
    const refresh = async () => {
      if (inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      try {
        const profile = await authApi.getProfile(socketUserId);
        if (current && profile.role === 'Vendor' && profile.status === 'approved' && profile.onboardingStage === 'COMPLETED') {
          localStorage.setItem('user', JSON.stringify(profile));
          localStorage.setItem('vendorData', JSON.stringify(profile));
          localStorage.setItem('userRole', 'vendor');
          setUserRole('vendor'); setActivationAvailable(true);
        }
      } catch { /* Existing session/network handling owns failures. */ }
      finally { inFlight = false; }
    };
    socket.on('account_updated', refresh);
    document.addEventListener('visibilitychange', refresh);
    refresh(); const timer = setInterval(refresh, 60000);
    return () => { current = false; clearInterval(timer); socket.off('account_updated', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [socketUserId, userRole]);

  // Enforce Profile Completion for Customer accounts
  useEffect(() => {
    const userData = getSafeStorage('user');
    const token = localStorage.getItem('token');
    if (token && userData && userData._id) {
      const role = (localStorage.getItem('userRole') || 'customer').toLowerCase();
      if (role === 'customer') {
        const path = location.pathname.replace(/\/$/, '') || '/user';
        const isAuthOrProfileCreate = path.startsWith('/user/auth') || 
                                     path.startsWith('/user/otp') || 
                                     path.startsWith('/user/splash') ||
                                     path.startsWith('/user/profile/create');
        const hasDetails = userData.displayName && userData.address;
        if (!userData.isProfileComplete && !hasDetails && !isAuthOrProfileCreate) {
          navigate('/user/profile/create');
        }
      }
    }
  }, [location.pathname, navigate]);

  // Timer logic for incoming request (Vendor Only)
  useEffect(() => {
    let timer;
    if (userRole === 'vendor' && incomingRequest) {
      setTimeLeft(45);
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [incomingRequest, userRole]);

  // Handle timer expiration in a separate effect
  useEffect(() => {
    if (userRole === 'vendor' && incomingRequest && timeLeft === 0) {
      clearIncomingRequest();
    }
  }, [timeLeft, incomingRequest, clearIncomingRequest, userRole]);

    // Socket Logic (Global Notifications & Vendor Requests)
    useEffect(() => {
        const userId = socketUserId;
        
        if (!userId) {
            console.warn('⚠️ [SOCKET] No user ID found in localStorage. Cannot join room.');
            return;
        }

        const unsubscribeRooms = subscribeSocketRooms(socket, [`user_${userId}`, ...(userRole === 'vendor' ? ['vendors_pool'] : [])]);

        // 1. Browser Notification Permission (Safe check for Safari)
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            // Note: Safari mobile only allows requestPermission via user gesture
            // but we wrap it to avoid crashes
            try {
                Notification.requestPermission();
            } catch (e) {
                console.warn('Notification.requestPermission failed:', e);
            }
        }

        // 2. Handle Push Notifications (Socket fallback)
        const handlePushNotification = (data) => {
            console.log('🔔 [NOTIFICATION_RECEIVED] Incoming data:', data);
            
            if (addNotification) {
                addNotification('order_update', data.title, data.body, userRole);
            }

            try {
                if (Notification.permission === 'granted') {
                    new Notification(data.title, { body: data.body });
                }
            } catch (err) {
                console.error('❌ [NOTIFICATION_ERROR]', err);
            }
            
            toast.success(`${data.title}: ${data.body}`, { icon: '🔔', duration: 5000 });
        };

        socket.on('push_notification', handlePushNotification);
        
        // 3. Handle Payment Trigger - DISABLED per user request (Upfront payment flow)
        // const handlePaymentTrigger = (data) => { ... };
        // socket.on('payment_trigger', handlePaymentTrigger);

        // --- Vendor Specific ---
        const handleNewOrder = async (data) => {
            if (userRole !== 'vendor') return;
            setIncomingRequest({
                _id: data.orderId,
                orderId: data.displayId,
                items: [{ name: 'New Order Request', quantity: 1 }],
                specialInstructions: ''
            });

            try {
                const fullDetail = await orderApi.getById(data.orderId);
                setIncomingRequest(fullDetail);
                addNotification('order_available', 'New Order Nearby', `Order ${data.displayId} is available.`, 'vendor');
            } catch (err) {
                console.error('Error fetching full order in layout', err);
            }
        };

        socket.on('new_order_available', handleNewOrder);

        return () => {
            unsubscribeRooms();
            socket.off('push_notification', handlePushNotification);
            socket.off('new_order_available', handleNewOrder);
            // socket.off('payment_trigger', handlePaymentTrigger);
        };
    }, [socketUserId, userRole, addNotification, setIncomingRequest]);

  const handleAccept = async (orderId) => {
    try {
      setAcceptingId(orderId);
      await orderApi.vendorAcceptOrder(orderId, vendorId);
      clearIncomingRequest();
      navigate('/vendor/dashboard');
    } catch (err) {
      alert('Order already taken or error occurred.');
    } finally {
      setAcceptingId(null);
    }
  };

  const hideHeaderPaths = [
    '/user/auth', 
    '/user/otp', 
    '/user/splash', 
    '/user/tracking', 
    '/user/success', 
    '/user/notifications', 
    '/user/profile',
    '/user/profile/edit', 
    '/user/profile/addresses', 
    '/user/services',
    '/user/cart',
    '/user/confirmation',
    '/user/chat',
    '/user/partnerships',
    '/user/advertise',
    '/user/faq',
    '/user/terms',
    '/user/careers',
    '/user/review',
    '/user/support',
    '/user/payment',
    '/user/success-feedback',
    '/user/verification',
    '/user/land',
    '/user/referral',
    '/land',
    '/vendor'
  ];
  const hideNavPaths = [
    '/user/auth', 
    '/user/otp',
    '/user/profile/create',
    '/user/splash', 
    '/user/land',
    '/land'
  ];

  // Special handle for Splash which is exactly '/user'
  const isSplash = currentPath === '/user';
  const showHeader = !isSplash && !hideHeaderPaths.some(path => currentPath.startsWith(path));
  const showNav = !isSplash && !hideNavPaths.some(path => currentPath.startsWith(path));

  // Determine which header to show
  const renderHeader = () => {
    if (userRole === 'vendor') return <VendorHeader />;
    // We can add SupplierHeader here later
    return <UserHeader />;
  };
  
   return (
    <div className="flex flex-col min-h-screen bg-slate-50/50">
      {activationAvailable && <div role="status" className="p-3 bg-emerald-50 text-emerald-900 text-sm">Your vendor account is approved. <button className="underline font-bold" onClick={() => { const token = localStorage.getItem('token'); if (token) localStorage.setItem('vendorToken', token); navigate('/vendor/dashboard'); }}>Open vendor dashboard</button></div>}
      {showHeader && renderHeader()}
      <div className={`flex-1 ${showNav ? 'pb-32' : ''}`}>
        <Outlet />
      </div>
      {showNav && <BottomNav />}

      {/* Global Incoming Request Modal (Vendor Only) */}
      {userRole === 'vendor' && (
        <AnimatePresence>
          {incomingRequest && (
            <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-[#0a0f18]/90 backdrop-blur-xl"
                onClick={() => clearIncomingRequest()}
              />
              <motion.div
                initial={{ scale: 0.85, opacity: 0, y: 100 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.85, opacity: 0, y: 100 }}
                className="bg-white w-full max-w-md rounded-[3rem] shadow-[0_40px_80px_-15px_rgba(0,0,0,0.5)] border border-slate-100 relative z-[5001] overflow-y-auto max-h-[92vh] hide-scrollbar"
              >
                {/* Theme Bar */}
                <div className="h-2 bg-[#73e0c9] sticky top-0 z-20 flex justify-end">
                    <button 
                        onClick={() => clearIncomingRequest()}
                        className="absolute -top-4 -right-4 w-10 h-10 bg-white rounded-full shadow-xl border border-slate-100 flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors z-30"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                
                <div className="p-7 space-y-6">
                  {/* Header: Timer & ID */}
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/10 rounded-xl border border-rose-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                      <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest whitespace-nowrap">
                          Expires in 00:{timeLeft.toString().padStart(2, '0')}
                      </p>
                    </div>
                    <span className="bg-slate-900 text-white px-4 py-1.5 rounded-xl text-[10px] font-black tracking-[0.15em] uppercase shadow-sm">
                      {incomingRequest.orderId}
                    </span>
                  </div>

                  {/* Primary Title & Order Type */}
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className="w-20 h-20 rounded-[2rem] bg-[#73e0c9]/10 flex items-center justify-center text-[#73e0c9] shadow-inner">
                      <span className="material-symbols-outlined text-4xl animate-bounce">notifications_active</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-3">
                          <h3 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">New Request</h3>
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-[14px] text-[#73e0c9]">distance</span>
                        {incomingRequest.distance || '1.8'} KM Away
                      </p>
                    </div>
                  </div>

                  {/* Service Info Card */}
                  <div className="bg-slate-50 rounded-[3rem] p-6 border border-slate-100 space-y-5">
                    <div className="flex items-center gap-4 bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
                      <div className="w-12 h-12 rounded-2xl bg-[#73e0c9]/10 flex items-center justify-center text-[#73e0c9]">
                        <span className="material-symbols-outlined text-2xl">schedule</span>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Pickup Slot</p>
                        <h4 className="text-[13px] font-black text-slate-900 leading-none mt-1">
                          {typeof incomingRequest.pickupSlot === 'object' && incomingRequest.pickupSlot?.time 
                              ? `${incomingRequest.pickupSlot.date} | ${incomingRequest.pickupSlot.time}` 
                              : incomingRequest.pickupSlot || 'As soon as possible'}
                        </h4>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-3 bg-white/50 p-4 rounded-3xl border border-slate-100">
                        <span className="material-symbols-outlined text-xl text-[#73e0c9]">local_laundry_service</span>
                        <div className="min-w-0">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Service</p>
                          <p className="text-[11px] font-black text-slate-900 truncate mt-1 leading-none">
                              Order Request
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 bg-white/50 p-4 rounded-3xl border border-slate-100">
                        <span className="material-symbols-outlined text-xl text-[#73e0c9]">layers</span>
                        <div className="min-w-0">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Status</p>
                          <p className="text-[11px] font-black text-slate-900 truncate mt-1 leading-none">
                              New
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => handleAccept(incomingRequest._id)}
                      disabled={acceptingId === incomingRequest._id}
                      className="w-full py-5 rounded-[1.5rem] bg-slate-950 text-white font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all flex items-center justify-center gap-4 group"
                    >
                      {acceptingId === incomingRequest._id ? 'Processing...' : 'Accept Order'}
                      <span className="material-symbols-outlined text-lg group-hover:translate-x-1 transition-transform">arrow_forward</span>
                    </button>
                    <button
                      onClick={() => clearIncomingRequest()}
                      className="w-full py-4 rounded-[1.5rem] bg-slate-100 text-slate-400 font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                    >
                      Not Now
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
};

export default UserLayout;
