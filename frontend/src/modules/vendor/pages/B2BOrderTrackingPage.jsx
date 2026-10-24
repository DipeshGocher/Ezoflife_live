import React, { useEffect, useRef, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { b2bOrderApi } from '../../../lib/api';
import { toast } from 'react-hot-toast';
import { GoogleMap, useJsApiLoader, Marker, Polyline, DirectionsRenderer } from '@react-google-maps/api';
import { GOOGLE_MAPS_LOADER_OPTIONS } from '../../../lib/googleMaps';

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};

const defaultCenter = {
  lat: 22.7196,
  lng: 75.8577
};

const RATEABLE = ['DELIVERED', 'Delivered', 'SETTLED', 'Settled'];

/** Lets the ordering vendor rate the supplier once the order is delivered. */
const SupplierRatingCard = ({ order, onSaved }) => {
  const existing = order?.supplierRating?.rating || 0;
  const [rating, setRating] = useState(existing);
  const [comment, setComment] = useState(order?.supplierRating?.comment || '');
  const [saving, setSaving] = useState(false);

  if (!order?.supplier || !RATEABLE.includes(order.status)) return null;

  const save = async () => {
    if (!rating) return toast.error('Pick a rating from 1 to 5 stars');
    setSaving(true);
    try {
      const res = await b2bOrderApi.rateSupplier(order._id, { rating, comment });
      toast.success(res.message || 'Rating saved');
      onSaved(res.supplierRating);
    } catch (err) {
      toast.error(err.message || 'Could not save rating');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white border border-slate-100 shadow-sm rounded-[2rem] p-6 space-y-4 text-left">
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rate Supplier</p>
        <h3 className="text-sm font-black text-slate-900 mt-1">
          How was {order.supplier?.supplierDetails?.businessName || order.supplier?.displayName || 'this supplier'}?
        </h3>
      </div>
      <div className="flex gap-1.5" role="radiogroup" aria-label="Supplier rating">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onClick={() => setRating(n)}
            className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${n <= rating ? 'bg-amber-50 border-amber-200 text-amber-500' : 'bg-slate-50 border-slate-100 text-slate-300'}`}
          >
            <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: n <= rating ? "'FILL' 1" : "'FILL' 0" }}>star</span>
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={e => setComment(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder="Optional: quality, packaging, delivery time…"
        className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-semibold outline-none focus:bg-white focus:border-slate-300"
      />
      <button
        type="button"
        onClick={save}
        disabled={saving || !rating}
        className="w-full py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
      >
        {saving ? 'Saving…' : existing ? 'Update Rating' : 'Submit Rating'}
      </button>
    </section>
  );
};

const B2BOrderTrackingPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [directionsResponse, setDirectionsResponse] = useState(null);
  const [otpInput, setOtpInput] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);

  const fetchOrder = async (isManual = false) => {
    try {
      if (isManual) setRefreshing(true);
      const data = await b2bOrderApi.getById(id);
      if (data) {
          setOrder(data);
      }
    } catch (err) {
      console.error('Error tracking B2B order:', err);
      toast.error('Failed to load tracking details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpInput) return;
    try {
      setVerifyingOtp(true);
      const res = await b2bOrderApi.verifyDeliveryOtp(id, otpInput);
      if (res.error) {
        toast.error(res.message || res.error || 'Invalid OTP');
      } else {
        toast.success('Order delivered and completed successfully!');
        setOtpInput('');
        fetchOrder(true);
      }
    } catch (err) {
      console.error('Verify OTP Error:', err);
      toast.error('Failed to verify OTP. Please try again.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    fetchOrder();

    // Auto refresh every 30 seconds for live updates
    const interval = setInterval(() => {
      fetchOrder(false);
    }, 30000);

    return () => clearInterval(interval);
  }, [id]);

  const mapCenter = useMemo(() => {
    if (order?.supplier?.location?.lat) {
      return { lat: order.supplier.location.lat, lng: order.supplier.location.lng };
    }
    if (order?.vendor?.location?.lat) {
      return { lat: order.vendor.location.lat, lng: order.vendor.location.lng };
    }
    return defaultCenter;
  }, [order]);

  const path = useMemo(() => {
    if (order?.supplier?.location?.lat && order?.vendor?.location?.lat) {
      return [
        { lat: order.supplier.location.lat, lng: order.supplier.location.lng },
        { lat: order.vendor.location.lat, lng: order.vendor.location.lng }
      ];
    }
    return [];
  }, [order]);

  useEffect(() => {
    if (!isLoaded || !window.google || path.length !== 2) return;
    
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
    const status = order?.status?.toUpperCase() || 'SUBMITTED';
    const steps = [
      { label: 'Placed', info: 'Order Submitted', icon: 'receipt', status: 'pending' },
      { label: 'Confirmed', info: 'Accepted by Supplier', icon: 'verified', status: 'pending' },
      { label: 'Packing', info: 'Preparing Materials', icon: 'inventory_2', status: 'pending' },
      { label: 'Shipped', info: 'In Transit', icon: 'local_shipping', status: 'pending' },
      { label: 'Delivered', info: 'At Facility', icon: 'check', status: 'pending' }
    ];

    const statusOrder = [
        'SUBMITTED', 
        'ACCEPTED', 
        'PROCESSING', 
        'DISPATCHED', 
        'DELIVERED'
    ];
    
    // Normalize status names
    let currentStatus = status;
    if (status === 'PENDING_PAYMENT') currentStatus = 'SUBMITTED';
    if (status === 'CONFIRMED') currentStatus = 'ACCEPTED';
    if (status === 'OUT FOR DELIVERY') currentStatus = 'DISPATCHED';
    if (status === 'SETTLED') currentStatus = 'DELIVERED';

    const currentIndex = statusOrder.indexOf(currentStatus);

    if (currentIndex >= 0) steps[0].status = currentIndex === 0 ? 'active' : 'completed';
    if (currentIndex >= 1) steps[1].status = currentIndex === 1 ? 'active' : 'completed';
    if (currentIndex >= 2) steps[2].status = currentIndex === 2 ? 'active' : 'completed';
    if (currentIndex >= 3) steps[3].status = currentIndex === 3 ? 'active' : 'completed';
    if (currentIndex >= 4) steps[4].status = currentIndex === 4 ? 'active' : 'completed';

    if (status === 'CANCELLED' || status === 'REJECTED') {
      steps.forEach(s => s.status = 'completed');
    }

    return steps;
  }, [order]);

  const formatB2BDate = (dateInput) => {
    if (!dateInput) return 'N/A';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-[#F8FAFC] text-slate-900 min-h-screen flex flex-col pt-[84px] pb-32 font-body"
    >
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-[80] bg-slate-50/80 backdrop-blur-xl border-b border-slate-200/50 px-6 py-4">
          <div className="max-w-md mx-auto flex items-center justify-between">
              <motion.button 
                  whileTap={{ scale: 0.9 }} 
                  onClick={() => navigate(-1)} 
                  className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-slate-900 shadow-sm border border-slate-200"
              >
                  <span className="material-symbols-outlined font-black">arrow_back</span>
              </motion.button>
              <h1 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Track Supply Order</h1>
              <div className="w-10" />
          </div>
      </header>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Loading Map & Timeline...</p>
        </div>
      ) : (
        <motion.main 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="flex-grow pt-2 pb-6 px-6 max-w-xl mx-auto w-full space-y-8 text-left"
        >
          {/* Map Section */}
          <motion.section 
            variants={itemVariants}
            className="relative w-full h-[320px] rounded-[2.5rem] overflow-hidden shadow-2xl shadow-primary/5 bg-slate-100 group border border-slate-200"
          >
            <div className="w-full h-full">
              {isLoaded ? (
                  <GoogleMap
                      mapContainerClassName="w-full h-full focus:outline-none !outline-none border-none !ring-0"
                      center={mapCenter}
                      zoom={14}
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
                      {/* Vendor Location */}
                      {order?.vendor?.location?.lat && (
                          <Marker 
                              position={{ lat: order.vendor.location.lat, lng: order.vendor.location.lng }}
                              icon={{
                                  url: 'https://cdn-icons-png.flaticon.com/512/25/25694.png',
                                  scaledSize: new window.google.maps.Size(32, 32)
                              }}
                              label={{ text: "Your Shop", className: "mt-8 bg-white px-2 py-1 rounded shadow text-xs font-bold" }}
                          />
                      )}

                      {/* Supplier Location */}
                      {order?.supplier?.location?.lat && (
                          <Marker 
                              position={{ lat: order.supplier.location.lat, lng: order.supplier.location.lng }}
                              icon={{
                                  url: 'https://cdn-icons-png.flaticon.com/512/2821/2821805.png',
                                  scaledSize: new window.google.maps.Size(32, 32)
                              }}
                              label={{ text: "Supplier", className: "mt-8 bg-white px-2 py-1 rounded shadow text-xs font-bold" }}
                          />
                      )}

                      {/* Route from Supplier to Vendor */}
                      {!directionsResponse && order?.supplier?.location?.lat && order?.vendor?.location?.lat && (
                          <Polyline 
                              path={[
                                  { lat: order.supplier.location.lat, lng: order.supplier.location.lng },
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
                                      strokeColor: "#000000",
                                      strokeWeight: 5,
                                      strokeOpacity: 0.9
                                  }
                              }}
                          />
                      )}
                  </GoogleMap>
              ) : (
                  <div className="w-full h-full flex items-center justify-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-slate-900" />
                  </div>
              )}
            </div>
          </motion.section>

          {/* Supplier Info Section */}
          {order?.supplier && (
              <motion.section 
                variants={itemVariants} 
                className="bg-white rounded-[2.5rem] p-6 border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex items-center justify-between"
              >
                  <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-55 rounded-full flex items-center justify-center border border-slate-100 shrink-0">
                          <span className="material-symbols-outlined text-slate-600">store</span>
                      </div>
                      <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Supplier Facility</p>
                          <h3 className="text-sm font-black text-slate-900 uppercase truncate">
                            {order?.supplier?.supplierDetails?.businessName || order?.supplier?.displayName || 'Unknown Supplier'}
                          </h3>
                          <p className="text-xs font-bold text-slate-500 mt-0.5">
                            Phone: {order?.supplier?.phone || 'N/A'}
                          </p>
                      </div>
                  </div>
              </motion.section>
          )}

          {/* Status Timeline */}
          <motion.section variants={itemVariants} className="relative py-2">
            <div className="overflow-x-auto no-scrollbar py-4">
              <div className="relative flex items-start min-w-max gap-8 px-2">
                
                {/* Connector Line */}
                <div className="absolute h-[3px] left-8 right-8 bg-slate-100 top-6 -translate-y-1/2 overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ 
                      width: `${(() => {
                        const activeIndex = timelineSteps.findIndex(s => s.status === 'active');
                        if (activeIndex === -1 && timelineSteps[4].status === 'completed') return 100;
                        if (activeIndex === -1) return 0;
                        return (activeIndex / 4) * 100;
                      })()}%` 
                    }}
                    transition={{ duration: 1.5, ease: "easeOut", delay: 0.5 }}
                    className="h-full bg-slate-900"
                  />
                </div>

                {/* Steps */}
                {timelineSteps.map((step, idx) => (
                  <div key={idx} className="relative flex flex-col items-center gap-3 z-10 w-20">
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.1 * idx, type: "spring" }}
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500 border-2 ${
                        step.status === 'completed' ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 
                        step.status === 'active' ? 'bg-slate-900 text-white border-slate-900 shadow-lg scale-110' : 
                        'bg-white text-slate-300 border-slate-200/60'
                      }`}
                    >
                      <span className="material-symbols-outlined text-lg">
                        {step.status === 'completed' ? 'check' : step.icon}
                      </span>
                    </motion.div>
                    <div className="text-center">
                      <p className={`font-black text-[9px] uppercase tracking-widest leading-tight ${
                          step.status === 'active' || step.status === 'completed' ? 'text-slate-900' : 'text-slate-400'
                      }`}>
                        {step.label}
                      </p>
                      <p className="text-[7px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">
                        {step.info}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>

          {/* ORDER SUMMARY */}
          <motion.section variants={itemVariants} className="flex flex-col gap-5 pt-2">
              <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight ml-1">Order Details</h3>
              
              <div className="flex flex-col gap-3">
                  {order?.items?.map((item, idx) => (
                      <div key={idx} className="bg-white rounded-[1.8rem] border border-slate-100 p-5 shadow-sm flex items-center justify-between gap-4">
                          <div className="flex flex-col gap-1 min-w-0">
                              <p className="font-black text-slate-950 text-xs uppercase tracking-tight truncate">{item.name}</p>
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Rate: ₹{item.price}</p>
                          </div>
                          <span className="font-black text-slate-900 text-[10px] uppercase bg-slate-50 px-4 py-1.5 rounded-full border border-slate-100 shrink-0">
                              QTY: {item.quantity}
                          </span>
                      </div>
                  ))}
              </div>

              {/* Order Info & Total */}
              <div className="bg-white border border-slate-100 shadow-sm rounded-[1.8rem] p-5 space-y-4">
                  <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                      <span>Delivery Day</span>
                      <span className="text-slate-900">{order?.deliveryDay}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                      <span>Est. Date</span>
                      <span className="text-slate-900">{formatB2BDate(order?.deliveryDate)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                      <span>Shipping Address</span>
                      <span className="text-slate-900 text-right max-w-[200px] truncate">{order?.shippingAddress}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                      <span>Platform Fee{order?.platformFee > 0 && order?.status === 'PENDING_PAYMENT' ? ' (Unpaid)' : ''}</span>
                      <span className="text-slate-900">{order?.platformFee > 0 ? `₹${order.platformFee}` : 'Nil'}</span>
                  </div>
                  <div className="flex justify-between items-center pt-4 border-t border-slate-50">
                      <p className="text-xs font-black text-slate-900 uppercase tracking-widest">Total Amount</p>
                      <p className="font-black text-slate-900 text-2xl tracking-tighter">₹{order?.totalAmount}</p>
                  </div>
              </div>
          </motion.section>

          <SupplierRatingCard
            key={`${order?._id || 'loading'}-${order?.supplierRating?.ratedAt || ''}`}
            order={order}
            onSaved={(supplierRating) => setOrder(prev => ({ ...prev, supplierRating }))}
          />

          {/* OTP Verification Card */}
          {order?.status?.toUpperCase() === 'DISPATCHED' && (
              <motion.section 
                  variants={itemVariants}
                  className="bg-white border border-slate-100 shadow-sm rounded-[2rem] p-6 space-y-4 text-left"
              >
                  <div>
                      <h4 className="font-black text-slate-900 text-sm uppercase tracking-tight">Verify Delivery OTP</h4>
                      <p className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider mt-1.5 leading-relaxed">
                          Enter the 6-digit OTP shared by the supplier/delivery agent to confirm receipt of materials.
                      </p>
                  </div>
                  
                  <div className="flex gap-3">
                      <input 
                          type="text" 
                          maxLength={6}
                          placeholder="ENTER OTP"
                          value={otpInput}
                          onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                          className="flex-1 px-5 py-4 bg-[#F8FAFC] border border-slate-200 rounded-2xl text-center text-sm font-black tracking-widest outline-none focus:border-slate-900 focus:bg-white transition-all placeholder:font-black placeholder:text-slate-300 placeholder:tracking-wider"
                      />
                      <button 
                          onClick={handleVerifyOtp}
                          disabled={otpInput.length !== 6 || verifyingOtp}
                          className="px-8 bg-black text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-neutral-800 transition-all disabled:opacity-40 flex items-center justify-center shrink-0"
                      >
                          {verifyingOtp ? (
                              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                          ) : (
                              'CONFIRM'
                          )}
                      </button>
                  </div>
              </motion.section>
          )}
        </motion.main>
      )}
    </motion.div>
  );
};

export default B2BOrderTrackingPage;
