import { appDialog } from '../../../shared/stores/appDialogStore';
import React, { useEffect, useRef, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { orderApi, logisticsApi } from '../../../lib/api';
import socket, { subscribeSocketRooms } from '../../../lib/socket';
import { toast } from 'react-hot-toast';
import { GoogleMap, useJsApiLoader, Marker, Polyline, DirectionsRenderer } from '@react-google-maps/api';
import { GOOGLE_MAPS_LOADER_OPTIONS } from '../../../lib/googleMaps';
import FindingVendorScreen from '../components/FindingVendorScreen';
import UserHeader from '../components/UserHeader';

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};

const defaultCenter = {
  lat: 22.7196,
  lng: 75.8577
};

const OrderTrackingPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const confirmedOrder = location.state?.order;
  const initialOrder = confirmedOrder?._id === id ? confirmedOrder : null;
  const [order, setOrder] = useState(initialOrder);
  const [loading, setLoading] = useState(!initialOrder);
  const [refreshing, setRefreshing] = useState(false);
  const [isHandshakeModalOpen, setIsHandshakeModalOpen] = useState(false);
  const [handshakeOtp, setHandshakeOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [riderLocation, setRiderLocation] = useState(null);
  const mapRef = useRef(null);

  const currentHandshakeOtp = useMemo(() => {
    if (!order || !order.logisticsHandshakes) return null;
    const phase = (order.status === 'Assigned' || order.status === 'RIDER_ARRIVING' || order.status === 'PICKUP_ASSIGNED') ? 'Collection' : 'Completion';
    const handshake = order.logisticsHandshakes.find(h => h.phase === phase && !h.isVerified);
    return handshake ? handshake.otp : null;
  }, [order]);

  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);

  const fetchOrder = async (isManual = false) => {
    try {
      if (isManual) setRefreshing(true);
      const data = await orderApi.getById(id);
      if (data) {
          setOrder(data);
          if (data.rider?.location) {
              setRiderLocation(data.rider.location);
          }
      }
    } catch (err) {
      console.error('Error tracking order:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRequestHandshake = async () => {
    try {
        const phase = (order.status === 'Assigned' || order.status === 'RIDER_ARRIVING' || order.status === 'PICKUP_ASSIGNED') ? 'Collection' : 'Completion';
        toast.loading(`Requesting ${phase} Handshake...`, { id: 'handshake' });
        await logisticsApi.requestHandshake(id, phase);
        await fetchOrder(); // Fetch latest order details to load the generated OTP
        toast.success('Rider received OTP on SMS!', { id: 'handshake' });
        setIsHandshakeModalOpen(true);
    } catch (error) {
        toast.error('Failed to request handshake', { id: 'handshake' });
    }
  };

  const handleVerifyHandshake = async () => {
    if (handshakeOtp.length !== 4) return toast.error('Enter 4-digit OTP');
    try {
        setVerifying(true);
        const phase = (order.status === 'Assigned' || order.status === 'RIDER_ARRIVING' || order.status === 'PICKUP_ASSIGNED') ? 'Collection' : 'Completion';
        const res = await logisticsApi.verifyHandshake(id, phase, handshakeOtp);
        toast.success(res.message);
        setIsHandshakeModalOpen(false);
        setHandshakeOtp('');
        if (phase === 'Completion') {
            navigate('/user/review');
        } else {
            fetchOrder();
        }
    } catch (error) {
        toast.error('Invalid OTP. Please check with Rider.');
    } finally {
        setVerifying(false);
    }
  };

  const isCancellable = useMemo(() => {
    if (!order || !order.createdAt || order.status === 'CANCELLED') return false;
    const cancellableStatuses = ['ORDER_PLACED', 'PICKUP_ASSIGNED', 'RIDER_ARRIVING'];
    if (!cancellableStatuses.includes(order.status)) return false;
    const diffInMs = Date.now() - new Date(order.createdAt).getTime();
    const diffInMinutes = diffInMs / (1000 * 60);
    return diffInMinutes <= 120; // 2 hours
  }, [order]);

  const handleCancelOrder = async () => {
    if (!await appDialog.confirm("Are you sure you want to cancel this order? Paid amount will be refunded automatically.")) return;
    try {
        setCancelling(true);
        const res = await orderApi.cancelOrder(id);
        toast.success(res.message || "Order cancelled successfully!");
        if (res.order) {
            setOrder(res.order);
        } else {
            fetchOrder();
        }
    } catch (err) {
        toast.error(err.message || "Failed to cancel order");
    } finally {
        setCancelling(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    fetchOrder();

    // Socket.io Real-time Setup
    const unsubscribeRooms = subscribeSocketRooms(socket, [`order_${id}`]);

    const handleStatusUpdate = (updatedOrder) => {
      console.log('⚡ Real-time status update received:', updatedOrder.status);
      setOrder(updatedOrder);
    };

    const handleRiderLocationUpdate = (location) => {
      console.log('📍 Real-time rider location received:', location);
      setRiderLocation(location);
    };

    socket.on('order_status_update', handleStatusUpdate);
    socket.on('rider_location_update', handleRiderLocationUpdate);

    return () => {
      unsubscribeRooms();
      socket.off('order_status_update', handleStatusUpdate);
      socket.off('rider_location_update', handleRiderLocationUpdate);
    };
  }, [id]);

  const mapCenter = useMemo(() => {
    if (riderLocation?.lat) return { lat: riderLocation.lat, lng: riderLocation.lng };
    if (order?.pickupLocation?.lat) return { lat: order.pickupLocation.lat, lng: order.pickupLocation.lng };
    return defaultCenter;
  }, [riderLocation, order]);

  const path = useMemo(() => {
    if (!riderLocation?.lat) return [];
    
    // Delivery phase
    if (['OUT_FOR_DELIVERY'].includes(order?.status) && order?.pickupLocation?.lat) {
        return [
            { lat: riderLocation.lat, lng: riderLocation.lng },
            { lat: order.pickupLocation.lat, lng: order.pickupLocation.lng }
        ];
    }
    
    // Pickup phase
    if (['PICKUP_ASSIGNED', 'RIDER_ARRIVING'].includes(order?.status) && order?.pickupLocation?.lat) {
        return [
            { lat: riderLocation.lat, lng: riderLocation.lng },
            { lat: order.pickupLocation.lat, lng: order.pickupLocation.lng }
        ];
    }

    // In Transit phase
    if (['IN_TRANSIT'].includes(order?.status) && order?.vendor) {
        const vendorLat = order.vendor.location?.lat || (order.pickupLocation?.lat ? order.pickupLocation.lat + 0.005 : 0);
        const vendorLng = order.vendor.location?.lng || (order.pickupLocation?.lng ? order.pickupLocation.lng + 0.005 : 0);
        if (vendorLat !== 0) {
            return [
                { lat: riderLocation.lat, lng: riderLocation.lng },
                { lat: vendorLat, lng: vendorLng }
            ];
        }
    }

    return [];
  }, [riderLocation, order]);

  const [directionsResponse, setDirectionsResponse] = useState(null);

  useEffect(() => {
    if (!isLoaded || !window.google) return;
    
    if (path.length === 2) {
      const directionsService = new window.google.maps.DirectionsService();
      directionsService.route(
        {
          origin: path[0],
          destination: path[1],
          travelMode: window.google.maps.TravelMode.DRIVING
        },
        (result, status) => {
          if (status === window.google.maps.DirectionsStatus.OK) {
            setDirectionsResponse(result);
          }
        }
      );
    } else {
      setDirectionsResponse(null);
    }
  }, [isLoaded, path]);

  const containerVariants = useMemo(() => ({
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  }), []);

  const itemVariants = useMemo(() => ({
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { duration: 0.6, ease: "easeOut" } }
  }), []);

  const timelineSteps = useMemo(() => {
    const status = order?.status || 'ORDER_PLACED';
    const steps = [
      { label: 'Placed', time: 'Received', icon: 'check_circle', status: 'pending', stepNum: 'Step 1 of 8' },
      { label: 'Rider Assigned', time: 'Pending', icon: 'electric_moped', status: 'pending', stepNum: 'Step 2 of 8' },
      { label: 'Rider Arriving', time: 'Pending', icon: 'location_on', status: 'pending', stepNum: 'Step 3 of 8' },
      { label: 'In Transit', time: 'Pending', icon: 'local_shipping', status: 'pending', stepNum: 'Step 4 of 8' },
      { label: 'Processing', time: 'In Shop', icon: 'local_laundry_service', status: 'pending', stepNum: 'Step 5 of 8' },
      { label: 'Ready', time: 'Pending', icon: 'inventory_2', status: 'pending', stepNum: 'Step 6 of 8' },
      { label: 'Out for Delivery', time: 'Final Leg', icon: 'handshake', status: 'pending', stepNum: 'Step 7 of 8' },
      { label: 'Delivered', time: 'Completed', icon: 'check', status: 'pending', stepNum: 'Step 8 of 8' }
    ];

    const statusOrder = [
        'ORDER_PLACED', 
        'PICKUP_ASSIGNED', 
        'RIDER_ARRIVING', 
        'IN_TRANSIT', 
        'RECEIVED_BY_VENDOR', 
        'PROCESSING', 
        'READY_FOR_DISPATCH', 
        'OUT_FOR_DELIVERY', 
        'DELIVERED'
    ];
    
    const currentIndex = statusOrder.indexOf(status);

    if (currentIndex >= 0) steps[0].status = currentIndex === 0 ? 'active' : 'completed';
    if (currentIndex >= 1) steps[1].status = currentIndex === 1 ? 'active' : 'completed';
    if (currentIndex >= 2) steps[2].status = currentIndex === 2 ? 'active' : 'completed';
    if (currentIndex >= 3) steps[3].status = currentIndex === 3 ? 'active' : 'completed';
    if (currentIndex >= 4) steps[4].status = (currentIndex === 4 || currentIndex === 5) ? 'active' : 'completed';
    if (currentIndex >= 6) steps[5].status = currentIndex === 6 ? 'active' : 'completed';
    if (currentIndex >= 7) steps[6].status = currentIndex === 7 ? 'active' : 'completed';
    if (currentIndex >= 8) steps[7].status = currentIndex === 8 ? 'active' : 'completed';

    if (status === 'CANCELLED') {
      steps.forEach(s => s.status = 'completed');
    }

    return steps;
  }, [order]);

  if (order?.status === 'ORDER_PLACED') {
      return <FindingVendorScreen order={order} onBack={() => navigate('/user/home')} />;
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-transparent text-on-background min-h-[100dvh] flex flex-col -mb-32 pb-32"
    >
      {/* Header */}
      <div className="fixed top-0 w-full z-50">
          <UserHeader title={`Order ${order?.orderId || '#' + (id?.slice(-6) || '......')}`} showBack={true} onBack={() => navigate('/user/home')} />
      </div>

      <motion.main 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex-grow pt-16 pb-6 px-6 max-w-5xl mx-auto w-full space-y-8"
      >
        {/* Map Section */}
        <motion.section 
          variants={itemVariants}
          className="relative w-full h-[380px] md:h-[450px] rounded-[2.5rem] overflow-hidden shadow-2xl shadow-primary/5 bg-surface-container-high group [&_.gm-style_iframe]:outline-none [&_.gm-style]:!outline-none [&>div]:!outline-none"
        >
          <div className="w-full h-full bg-slate-200">
            {isLoaded ? (
                <GoogleMap
                    mapContainerClassName="w-full h-full focus:outline-none !outline-none border-none !ring-0"
                    center={mapCenter}
                    zoom={15}
                    options={{
                        disableDefaultUI: true,
                        gestureHandling: "greedy",
                        styles: [
                            {
                                "featureType": "administrative",
                                "stylers": [{ "visibility": "off" }]
                            },
                            {
                                "featureType": "poi",
                                "stylers": [{ "visibility": "off" }]
                            },
                            {
                                "featureType": "transit",
                                "stylers": [{ "visibility": "off" }]
                            },
                            {
                                "featureType": "road",
                                "elementType": "geometry",
                                "stylers": [{ "color": "#ffffff" }]
                            },
                            {
                                "featureType": "water",
                                "elementType": "geometry",
                                "stylers": [{ "color": "#b0d0ff" }]
                            },
                            {
                                "featureType": "landscape",
                                "elementType": "geometry",
                                "stylers": [{ "color": "#e8eaed" }]
                            }
                        ]
                    }}
                >
                    {/* Customer Location */}
                    {order?.pickupLocation?.lat && (
                        <Marker 
                            position={{ lat: order.pickupLocation.lat, lng: order.pickupLocation.lng }}
                            icon={{
                                url: 'https://cdn-icons-png.flaticon.com/512/25/25694.png',
                                scaledSize: new window.google.maps.Size(32, 32)
                            }}
                            label={{ text: "Customer", className: "mt-8 bg-white px-2 py-1 rounded shadow text-xs font-bold" }}
                        />
                    )}

                    {/* Vendor Location */}
                    {order?.vendor && (
                        <Marker 
                            position={{ 
                                lat: order.vendor.location?.lat || (order.pickupLocation?.lat ? order.pickupLocation.lat + 0.005 : 0), 
                                lng: order.vendor.location?.lng || (order.pickupLocation?.lng ? order.pickupLocation.lng + 0.005 : 0) 
                            }}
                            icon={{
                                url: 'https://cdn-icons-png.flaticon.com/512/2821/2821805.png',
                                scaledSize: new window.google.maps.Size(32, 32)
                            }}
                            label={{ text: "Shop", className: "mt-8 bg-white px-2 py-1 rounded shadow text-xs font-bold" }}
                        />
                    )}

                    {/* Rider Location */}
                    {riderLocation?.lat && (
                        <Marker 
                            position={{ lat: riderLocation.lat, lng: riderLocation.lng }}
                            icon={{
                                url: 'https://cdn-icons-png.flaticon.com/512/3198/3198336.png',
                                scaledSize: new window.google.maps.Size(48, 48)
                            }}
                        />
                    )}

                    {/* Route from Customer to Vendor (always shown if both exist) */}
                    {!directionsResponse && order?.pickupLocation?.lat && order?.vendor?.location?.lat && (
                        <Polyline 
                            path={[
                                { lat: order.pickupLocation.lat, lng: order.pickupLocation.lng },
                                { lat: order.vendor.location.lat, lng: order.vendor.location.lng }
                            ]}
                            options={{
                                strokeColor: "#94a3b8",
                                strokeOpacity: 0.5,
                                strokeWeight: 3,
                                icons: [{
                                    icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 },
                                    offset: '0',
                                    repeat: '20px'
                                }]
                            }}
                        />
                    )}

                    {/* Active Route via Directions API */}
                    {directionsResponse && (
                        <DirectionsRenderer 
                            options={{
                                directions: directionsResponse,
                                suppressMarkers: true,
                                polylineOptions: {
                                    strokeColor: "#2563eb", // thick blue line
                                    strokeWeight: 5,
                                    strokeOpacity: 0.9
                                }
                            }}
                        />
                    )}
                </GoogleMap>
            ) : (
                <div className="w-full h-full flex items-center justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-primary" />
                </div>
            )}
          </div>
        </motion.section>

        {/* Combined Delivery Partner & Timeline Section */}
        <div className="flex flex-col gap-10">
          {/* Delivery Partner Info */}
          {['PICKUP_ASSIGNED', 'RIDER_ARRIVING', 'OUT_FOR_DELIVERY'].includes(order?.status) && (order?.status === 'OUT_FOR_DELIVERY' ? (order?.riderDropOff || order?.rider) : order?.rider) && (
              <motion.section variants={itemVariants} className="bg-white rounded-[2.5rem] p-6 border border-slate-100 shadow-sm flex items-center justify-between mb-2">
                  <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                          <span className="material-symbols-outlined text-slate-600">two_wheeler</span>
                      </div>
                      <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Delivery Partner</p>
                          <h3 className="text-sm font-black text-slate-900 uppercase">{order?.status === 'OUT_FOR_DELIVERY' ? (order?.riderDropOff?.displayName || order?.rider?.displayName || 'Unknown') : (order?.rider?.displayName || 'Unknown')}</h3>
                          <p className="text-xs font-bold text-slate-500 mt-0.5">{order?.status === 'OUT_FOR_DELIVERY' ? (order?.riderDropOff?.phone || order?.rider?.phone || 'N/A') : (order?.rider?.phone || 'N/A')}</p>
                      </div>
                  </div>
                  <a href={`tel:${order?.status === 'OUT_FOR_DELIVERY' ? (order?.riderDropOff?.phone || order?.rider?.phone) : order?.rider?.phone}`} className="w-12 h-12 rounded-full bg-slate-900 text-white flex items-center justify-center hover:bg-black transition-colors shrink-0 shadow-lg shadow-slate-900/10">
                      <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>call</span>
                  </a>
              </motion.section>
          )}

          {/* Status Timeline - No Box Styling */}
          <motion.section variants={itemVariants} className="relative">
            {/* Timeline Wrapper */}
            <div className="overflow-x-auto no-scrollbar py-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <div className="relative flex items-start min-w-max gap-8">
                {/* Base Progress Line */}
              <div className="absolute h-[3px] left-8 right-8 bg-slate-200/50 top-6 -translate-y-1/2 overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ 
                    width: `${(() => {
                      const activeIndex = timelineSteps.findIndex(s => s.status === 'active');
                      if (activeIndex === -1 && timelineSteps[7].status === 'completed') return 100;
                      if (activeIndex === -1) return 0;
                      return (activeIndex / 7) * 100;
                    })()}%` 
                  }}
                  transition={{ duration: 1.5, ease: "easeOut", delay: 1.2 }}
                  className="h-full bg-slate-900 relative"
                />
              </div>

              {/* Steps */}
              {timelineSteps.map((step, idx) => (
                <div key={idx} className="relative flex flex-col items-center gap-3 z-10 w-16">
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2 * idx, type: "spring" }}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500 border-2 ${
                      step.status === 'completed' ? 'bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-900/10' : 
                      step.status === 'active' ? 'bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-900/20 scale-110' : 
                      'bg-white text-slate-300 border-slate-200/60'
                    }`}
                  >
                    <span className="material-symbols-outlined text-lg">
                      {step.status === 'completed' ? 'check' : step.icon}
                    </span>
                  </motion.div>
                  <div className="text-center">
                    <p className={`font-black text-[9px] uppercase tracking-widest leading-tight ${
                        step.status === 'active' ? 'text-slate-900' : 
                        step.status === 'completed' ? 'text-slate-900' : 
                        'text-slate-400'
                    }`}>
                      {step.label}
                    </p>
                  </div>
                </div>
              ))}
              </div>
            </div>
          </motion.section>
        </div>

        {/* ORDER SUMMARY */}
        <motion.section variants={itemVariants} className="flex flex-col gap-6 -mt-4">
            <h3 className="font-black text-slate-900 text-xl uppercase tracking-tighter ml-1">Order Summary</h3>
            
            <div className="flex flex-col gap-4">
                {order?.items?.map((item, idx) => (
                    <div key={idx} className="bg-white rounded-[2.5rem] border border-slate-100 p-6 shadow-sm flex flex-col gap-5">
                        {/* Row 1: Item Name & Quantity */}
                        <div className="flex justify-between items-center">
                            <p className="font-black text-slate-900 text-base uppercase tracking-tight">{item.name}</p>
                            <p className="font-black text-slate-900 text-sm uppercase bg-slate-50 px-4 py-1.5 rounded-full border border-slate-100">
                                {item.quantity} {item.unit ? item.unit.replace('PER_', '') : 'ITEM'}
                            </p>
                        </div>
                        
                        {/* Row 2: Delivery Mode & Tier */}
                        <div className="flex justify-between items-center text-[10px] sm:text-[11px] font-black text-slate-500 uppercase tracking-[0.15em] sm:tracking-[0.2em] px-1">
                            <div className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-sm">local_shipping</span>
                                <p>{order?.deliveryMode || 'Normal'} Delivery</p>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-sm">diamond</span>
                                <p>{item.tier || order?.items?.[0]?.tier || 'Essential'} Care</p>
                            </div>
                        </div>

                        {/* Row 3: Images */}
                        {item.photos?.length > 0 ? (
                            <div className={`grid gap-3 ${item.photos.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                                {item.photos.map((photo, pIdx) => (
                                    <div 
                                        key={pIdx} 
                                        className={`w-full ${item.photos.length === 1 ? 'h-48' : 'h-32'} rounded-[1.5rem] bg-slate-50 overflow-hidden border border-slate-100 cursor-pointer`}
                                    >
                                        <img src={photo} alt={`${item.name} photo ${pIdx + 1}`} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="w-full h-32 rounded-[1.5rem] bg-slate-50 overflow-hidden flex flex-col items-center justify-center border border-dashed border-slate-200 gap-2">
                                <span className="material-symbols-outlined text-slate-300 text-3xl">no_photography</span>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">No photos</p>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Total Amount Box */}
            <div className="flex justify-between items-center bg-white border border-slate-100 shadow-sm rounded-[1.5rem] p-5 mt-4">
                <p className="text-sm font-black text-slate-900 uppercase tracking-widest">Total Amount</p>
                <p className="font-black text-slate-900 text-3xl tracking-tighter">₹{order?.totalAmount}</p>
            </div>

            {/* Cancel Order Button */}
            {isCancellable && (
                <div className="mt-4 flex justify-end">
                    <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleCancelOrder}
                        disabled={cancelling}
                        className="w-full py-4 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest bg-rose-50 border border-rose-100 hover:bg-rose-100 text-rose-600 transition-all flex items-center justify-center gap-2 shadow-sm"
                    >
                        {cancelling ? (
                            <div className="w-4 h-4 border-2 border-rose-600 border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-sm">cancel</span>
                                Cancel Order
                            </>
                        )}
                    </motion.button>
                </div>
            )}

            {/* Simple OTP Verification Box */}
            {['RIDER_ARRIVING', 'OUT_FOR_DELIVERY'].includes(order?.status) && (
                <div className="bg-slate-50 border border-slate-200 rounded-[2rem] p-5 flex flex-col gap-4 mt-2">
                    {!isHandshakeModalOpen ? (
                        <>
                            <p className="text-sm font-black text-slate-900 uppercase tracking-tight text-left">
                                Click verify button for verifying the {order.status === 'OUT_FOR_DELIVERY' ? 'delivery' : 'order'}
                            </p>
                            <div className="flex justify-end w-full">
                                <button 
                                    onClick={handleRequestHandshake}
                                    className="bg-slate-900 text-white px-8 py-2.5 rounded-full font-black text-[10px] uppercase tracking-widest shadow-md hover:bg-black active:scale-95 transition-all"
                                >
                                    Verify
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center gap-4 py-2">
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Enter 4-digit code</p>
                            {currentHandshakeOtp && (
                                <div className="px-4 py-2 bg-blue-50 border border-blue-100 text-blue-700 rounded-xl text-xs font-black uppercase tracking-wider animate-pulse">
                                    [DEMO ONLY] OTP: {currentHandshakeOtp}
                                </div>
                            )}
                            <div className="flex justify-center gap-2">
                                {[0, 1, 2, 3].map((i) => (
                                    <input
                                        key={i}
                                        type="text"
                                        maxLength="1"
                                        autoFocus={i === 0}
                                        value={handshakeOtp[i] || ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (val && !/^\d+$/.test(val)) return;
                                            const newOtp = handshakeOtp.split('');
                                            newOtp[i] = val;
                                            setHandshakeOtp(newOtp.join(''));
                                            if (val && i < 3) {
                                                const next = e.target.nextElementSibling;
                                                if (next) next.focus();
                                            }
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Backspace' && !handshakeOtp[i] && i > 0) {
                                                const prev = e.target.previousElementSibling;
                                                if (prev) prev.focus();
                                            }
                                        }}
                                        className="w-10 h-12 bg-white border border-slate-200 rounded-xl text-center text-xl font-black text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 transition-all outline-none"
                                    />
                                ))}
                            </div>
                            <div className="flex w-full gap-2 mt-2">
                                <button 
                                    onClick={() => !verifying && setIsHandshakeModalOpen(false)}
                                    className="flex-1 bg-slate-200 text-slate-500 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-300 transition-all"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={handleVerifyHandshake}
                                    disabled={handshakeOtp.length !== 4 || verifying}
                                    className="flex-[2] bg-slate-900 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                                >
                                    {verifying ? (
                                        <div className="w-3 h-3 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
                                    ) : 'Verify Code'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </motion.section>


      </motion.main>


    </motion.div>
  );
};

export default OrderTrackingPage;

