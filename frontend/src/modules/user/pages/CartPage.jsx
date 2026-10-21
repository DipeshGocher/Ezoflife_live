import { appDialog } from '../../../shared/stores/appDialogStore';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MASTER_SERVICES } from '../../../shared/data/sharedData';
import { BASE_URL, orderApi, serviceApi, authApi, promotionApi, masterServiceApi, mediaApi, geofenceApi } from '../../../lib/api';
import { shippingConfigApi } from '../../../lib/shippingApi';
import { useLocationStore } from '../../../shared/stores/locationStore';
import toast from 'react-hot-toast';

import { Autocomplete } from '@react-google-maps/api';

const mapContainerStyle = { width: '100%', height: '400px' };
const defaultCenter = { lat: 22.7196, lng: 75.8577 }; // Indore as default

const CartPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedService = location.state?.selectedService;
  const placedOrderRef = useRef(null);

  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applicablePromos, setApplicablePromos] = useState([]);
  const [appliedPromoData, setAppliedPromoData] = useState(null);
  const [detectedVendorId, setDetectedVendorId] = useState(null);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        setLoading(true);
        const [masterRes, customRes] = await Promise.all([
          masterServiceApi.getAll({ activeOnly: true }),
          serviceApi.getAll({ approvedOnly: true })
        ]);
        
        const combinedData = [
          ...(Array.isArray(masterRes) ? masterRes.map(s => ({ 
            ...s, 
            isMaster: true,
            name: s.itemName || s.name // Normalize name for validation
          })) : []),
          ...(Array.isArray(customRes) ? customRes.map(s => ({ 
            ...s, 
            isMaster: false,
            name: s.name || s.itemName 
          })) : [])
        ];
        
        setServices(combinedData);
      } catch (error) {
        console.error('Error fetching services for cart:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchServices();
  }, []);

  const [quantities, setQuantities] = useState(() => {
    const saved = localStorage.getItem('cart_quantities');
    const q = saved ? JSON.parse(saved) : {};
    if (selectedService && !q[selectedService._id || selectedService.id]) {
        const sid = selectedService._id || selectedService.id;
        q[sid] = selectedService.initialQuantity || 1;
    }
    return q;
  });

  const [clothCounts, setClothCounts] = useState({});

  const cartItems = useMemo(() => {
    if (services.length === 0) return [];
    return services.filter(s => {
      const id = s._id || s.id;
      return quantities[id] > 0;
    });
  }, [services, quantities]);

  // Combined Address/Map States
  const [mapLocation, setMapLocation] = useState(defaultCenter);
  const [mapAddress, setMapAddress] = useState('');
  const [promosLoading, setPromosLoading] = useState(false);

  const fetchApplicablePromos = useCallback(async (vId = null) => {
    try {
      setPromosLoading(true);
      const data = await promotionApi.getApplicablePromos({
        vendorId: vId || detectedVendorId || undefined,
        lat: mapLocation?.lat,
        lng: mapLocation?.lng
      });
      console.log('🎁 CartPage: Fetched Admin Platform Promos:', data);
      if (Array.isArray(data)) setApplicablePromos(data);
    } catch (err) {
      console.error('❌ CartPage: Promo Fetch Error:', err);
    } finally {
      setPromosLoading(false);
    }
  }, [detectedVendorId, mapLocation]);

  useEffect(() => {
    const detectAndFetchPromos = async () => {
        const detectVendorId = () => {
            let vid = null;
            // 1. Try from cart items
            if (cartItems.length > 0) {
                for (const item of cartItems) {
                    vid = item.vendorId || 
                          item.vendor?._id || 
                          item.vendor?.id || 
                          (item._id && typeof item._id === 'object' ? item._id.vendorId : null) ||
                          item.userId;

                    if (vid && vid !== 'undefined' && vid !== 'null' && vid.length > 10) {
                        console.log('🔍 CartPage: Detected Vendor ID from Cart Items:', vid);
                        return vid;
                    }
                }
            }

            // 2. Try from localStorage (Shop Context)
            const storageKeys = ['last_visited_vendor_id', 'selected_vendor_id', 'current_shop_id', 'vendor_id', 'vendorData'];
            for (const key of storageKeys) {
                let val = localStorage.getItem(key);
                if (val) {
                    try {
                        const parsed = JSON.parse(val);
                        val = parsed._id || parsed.id || val;
                    } catch (e) {}
                    if (val && val !== 'undefined' && val !== 'null' && typeof val === 'string' && val.length > 10) {
                        console.log(`💾 CartPage: Detected Vendor ID from LocalStorage (${key}):`, val);
                        return val;
                    }
                }
            }
            return null;
        };

        let vId = detectVendorId();
        
        // 3. Fallback: Find Nearest Vendor if no ID detected (Crucial for Master Services)
        if (!vId && mapLocation?.lat) {
            console.log('🔄 CartPage: No explicit Vendor ID, searching for nearby vendors...');
            try {
                const nearby = await orderApi.getNearbyVendors(mapLocation.lat, mapLocation.lng, 15); // Search up to 15km
                if (nearby && nearby.length > 0) {
                    vId = nearby[0].id;
                    console.log('📍 CartPage: Fallback to nearest vendor:', nearby[0].name, vId);
                }
            } catch (err) {
                console.warn('⚠️ CartPage: Fallback vendor search failed:', err);
            }
        }

        if (vId && vId !== 'undefined' && vId !== 'null') {
            setDetectedVendorId(vId); // Store for promo application
            console.log('🚀 CartPage: Fetching promos for Vendor:', vId);
            try {
                const data = await promotionApi.getApplicablePromos(vId);
                console.log('🎁 CartPage: Fetched Promos:', data);
                if (Array.isArray(data)) setApplicablePromos(data);
            } catch (err) {
                console.error('❌ CartPage: Promo Fetch Error:', err);
            }
            setDetectedVendorId(vId);
        } else {
            setDetectedVendorId(null);
            console.warn('⚠️ CartPage: No Vendor ID detected (even after fallback) for promo fetching');
        }

        // Fetch Admin Platform Promos unconditionally for customer checkout
        try {
            setPromosLoading(true);
            const data = await promotionApi.getApplicablePromos({
                vendorId: vId || undefined,
                lat: mapLocation?.lat,
                lng: mapLocation?.lng
            });
            console.log('🎁 CartPage: Fetched Admin Promos on mount/update:', data);
            if (Array.isArray(data)) setApplicablePromos(data);
        } catch (err) {
            console.error('❌ CartPage: Promo Fetch Error:', err);
        } finally {
            setPromosLoading(false);
        }
    };

    detectAndFetchPromos();
  }, [cartItems, services, mapLocation]);

  const [billingUnits, setBillingUnits] = useState({});

  useEffect(() => {
    if (cartItems.length > 0 && Object.keys(billingUnits).length === 0) {
      const u = {};
      cartItems.forEach(item => {
        const id = item._id || item.id;
        u[id] = item.unit || (id.includes('wash') || id.includes('carpet') ? 'kg' : 'pc');
      });
      setBillingUnits(u);
    }
  }, [cartItems]);

  const configuredWeight = useMemo(() => {
    if (cartItems.length === 0) return null;

    let total = 0;
    for (const item of cartItems) {
      const itemId = item._id || item.id;
      const quantity = Number(quantities[itemId]) || 0;
      if (quantity <= 0) continue;

      const unit = billingUnits[itemId] || item.unit || '';
      if (/kg/i.test(unit)) {
        total += quantity;
        continue;
      }

      const itemWeight = Number(item.avgWeight);
      if (!Number.isFinite(itemWeight) || itemWeight <= 0) return null;
      total += itemWeight * quantity;
    }

    return total > 0 ? Math.round(total * 100) / 100 : null;
  }, [billingUnits, cartItems, quantities]);
  
  useEffect(() => {
    localStorage.setItem('cart_quantities', JSON.stringify(quantities));
  }, [quantities]);

  useEffect(() => {
    if (!placedOrderRef.current && !loading && cartItems.length === 0) {
      navigate('/user/home');
    }
  }, [loading, cartItems, navigate]);
  
  const [expressMultiplier, setExpressMultiplier] = useState(1.5); // same default as the server
  const [platformMultiplier, setPlatformMultiplier] = useState(1);
  const [gstPercent, setGstPercent] = useState(18);
  const [normalLogisticsConfig, setNormalLogisticsConfig] = useState(0);
  
  useEffect(() => {
    const fetchConfig = async () => {
        try {
            const configs = await shippingConfigApi.getConfig();
            const exMult = configs.find(c => c.key === 'express_multiplier');
            if (exMult) setExpressMultiplier(Number(exMult.value));
            const platMult = configs.find(c => c.key === 'platform_fee_multiplier');
            if (platMult) setPlatformMultiplier(Number(platMult.value));
            const gst = configs.find(c => c.key === 'gst_percent');
            if (gst) setGstPercent(Number(gst.value));
            const normalFee = configs.find(c => c.key === 'normal_logistics_fee');
            if (normalFee) setNormalLogisticsConfig(Number(normalFee.value));
        } catch (err) {
            console.error('Error fetching delivery config:', err);
        }
    };
    fetchConfig();
  }, []);

  const [isExpress, setIsExpress] = useState(() => localStorage.getItem('is_express') === 'true');
  const [itemPhotos, setItemPhotos] = useState(() => {
    const saved = localStorage.getItem('item_photos');
    return saved ? JSON.parse(saved) : {};
  });
  const [activePhotoService, setActivePhotoService] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // Camera capture state
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [capturedPhoto, setCapturedPhoto] = useState(null); // { file, previewUrl }
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [garmentPhotos, setGarmentPhotos] = useState(() => {
    const saved = localStorage.getItem('order_photos');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedTier] = useState(() => {
    const saved = localStorage.getItem('selected_tier');
    if (saved === 'Essential' || saved === 'Heritage') return saved;
    return 'Essential'; // fallback to Essential instead of showing invalid tier
  });
  const fileInputRef = useRef(null);

  const availableDates = useMemo(() => {
    const dates = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      let dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
      if (i === 0) dayLabel = 'TODAY';
      if (i === 1) dayLabel = 'TOMORROW';
      dates.push({
        day: dayLabel,
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        raw: d
      });
    }
    return dates;
  }, []);

  const [selectedPickup, setSelectedPickup] = useState(() => localStorage.getItem('pickup_date') || `${availableDates[0].day}, ${availableDates[0].date}`);
  const [pickupTime, setPickupTime] = useState(() => localStorage.getItem('pickup_time') || '02:00 PM - 04:00 PM');
  const [selectedDelivery, setSelectedDelivery] = useState(() => localStorage.getItem('delivery_date') || `${availableDates[1].day}, ${availableDates[1].date}`);
  const [deliveryTime, setDeliveryTime] = useState(() => localStorage.getItem('delivery_time') || '06:00 PM - 08:00 PM');
  
  const [promoCode, setPromoCode] = useState('');
  const [isPromoApplied, setIsPromoApplied] = useState(false);
  const [promoError, setPromoError] = useState('');

  const [addresses, setAddresses] = useState([]);
  const [selectedPickupAddress, setSelectedPickupAddress] = useState(() => {
    const saved = localStorage.getItem('pickup_address');
    return saved ? JSON.parse(saved) : null;
  });
  const [selectedDropAddress, setSelectedDropAddress] = useState(() => {
    const saved = localStorage.getItem('drop_address');
    return saved ? JSON.parse(saved) : null;
  });
  const [isSameAddress, setIsSameAddress] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Online'); // Default to Online
  const [showPromoDropdown, setShowPromoDropdown] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [useWallet, setUseWallet] = useState(false);

  useEffect(() => {
    const fetchWallet = async () => {
      try {
        const userRaw = localStorage.getItem('user');
        if (userRaw) {
          const user = JSON.parse(userRaw);
          const userId = user._id || user.id;
          if (userId) {
            const profile = await authApi.getProfile(userId);
            setWalletBalance(profile?.walletBalance || 0);
          }
        }
      } catch (err) {
        console.error('Error fetching wallet balance:', err);
      }
    };
    fetchWallet();
  }, []);

  const timeInfo = useMemo(() => {
    const now = new Date();
    const currentHour = now.getHours();
    
    if (currentHour >= 6 && currentHour < 12) {
      return {
        message: "Pickup will be scheduled for today.",
        color: "bg-emerald-50 text-emerald-700 border-emerald-100",
        indicator: "bg-emerald-500",
        icon: "check_circle",
        probability: "High Probability"
      };
    } else if (currentHour >= 12 && currentHour < 15) {
      return {
        message: "Trying for today pickup, based on courier availability.",
        color: "bg-amber-50 text-amber-700 border-amber-100",
        indicator: "bg-amber-500",
        icon: "schedule",
        probability: "Medium Probability"
      };
    } else if (currentHour >= 15 && currentHour < 18) {
      return {
        message: "Late request! Pickup will likely happen tomorrow.",
        color: "bg-orange-50 text-orange-700 border-orange-100",
        indicator: "bg-orange-500",
        icon: "history",
        probability: "Low Probability"
      };
    } else {
      return {
        message: "Pickup will be scheduled for tomorrow.",
        color: "bg-rose-50 text-rose-700 border-rose-100",
        indicator: "bg-rose-500",
        icon: "event",
        probability: "Next Day Scheduled"
      };
    }
  }, []);

  const maxServiceTime = useMemo(() => {
    if (cartItems.length === 0) return 1;
    return cartItems.reduce((max, item) => Math.max(max, item.completionTime || 1), 1);
  }, [cartItems]);

  useEffect(() => {
    // When selectedPickup or maxServiceTime changes, update selectedDelivery
    const pickupIndex = availableDates.findIndex(d => `${d.day}, ${d.date}` === selectedPickup);
    if (pickupIndex !== -1) {
      const deliveryIndex = Math.min(pickupIndex + maxServiceTime, availableDates.length - 1);
      const deliveryD = availableDates[deliveryIndex];
      setSelectedDelivery(`${deliveryD.day}, ${deliveryD.date}`);
    }
  }, [selectedPickup, maxServiceTime, availableDates]);

  useEffect(() => {
    const syncAddresses = async () => {
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      const userId = userData._id || userData.id;
      const localPickup = JSON.parse(localStorage.getItem('pickup_address') || 'null');
      const localDrop = JSON.parse(localStorage.getItem('drop_address') || 'null');
      const detectedAddr = localStorage.getItem('detected_address');
      const detectedCoords = JSON.parse(localStorage.getItem('detected_coords') || 'null');

      let initialAddresses = [];
      if (localPickup) initialAddresses.push(localPickup);
      if (localDrop && localDrop.id !== localPickup?.id) initialAddresses.push(localDrop);
      if (detectedAddr && !localPickup) {
          initialAddresses.push({ 
            id: 'current_set', 
            type: 'Current Selection', 
            address: detectedAddr, 
            location: detectedCoords || defaultCenter 
          });
      }

      if (userId) {
        try {
          const profile = await authApi.getProfile(userId);
          if (profile.address) {
            const profileAddr = { 
              id: 'profile', 
              type: 'Profile Home', 
              address: profile.address, 
              location: profile.location || defaultCenter 
            };
            if (!initialAddresses.some(a => a.address === profile.address)) {
              initialAddresses.push(profileAddr);
            }
            if (profile.location) setMapLocation(profile.location);
          }
        } catch (error) {
          console.error('Error fetching profile address:', error);
        }
      }
      setAddresses(initialAddresses);
      if (localPickup) setSelectedPickupAddress(localPickup);
      else if (initialAddresses.length > 0) setSelectedPickupAddress(initialAddresses[0]);
      if (localDrop) setSelectedDropAddress(localDrop);
      else if (initialAddresses.length > 0) setSelectedDropAddress(initialAddresses[0]);
    };
    syncAddresses();
  }, []);

  // Sync Geofence Zone whenever selected pickup address changes
  useEffect(() => {
    const checkGeofenceForPickup = async () => {
      const lat = selectedPickupAddress?.location?.lat;
      const lng = selectedPickupAddress?.location?.lng;
      if (lat && lng) {
        try {
          const zoneInfo = await geofenceApi.checkAvailability(lat, lng);
          if (zoneInfo && zoneInfo.available) {
            useLocationStore.getState().setZoneData(zoneInfo);
          }
        } catch (err) {
          console.warn('⚠️ CartPage: Geofence check failed for pickup address:', err);
        }
      }
    };
    checkGeofenceForPickup();
  }, [selectedPickupAddress]);

  const updateQuantity = (id, delta) => {
    const current = quantities[id] || 0;
    const next = Math.max(0, current + delta);

    if (delta > 0 && current === 0 && next === 1) {
      const item = services.find(s => (s._id?.toString() === id || s.id?.toString() === id));
      setActivePhotoService({ id, name: item?.name || item?.itemName });
    }

    if (next === 0) {
      setItemPhotos(prev => {
        const { [id]: _, ...rest } = prev;
        localStorage.setItem('item_photos', JSON.stringify(rest));
        return rest;
      });
    }

    setQuantities(prev => {
      const nextQ = { ...prev };
      if (next === 0) delete nextQ[id];
      else nextQ[id] = next;
      return nextQ;
    });
  };

  const { pricingFactor, zone, allowDiscount, platformMultiplier: zonePlatformMultiplier, minPlatformFee: zoneMinPlatformFee, maxPlatformFee: zoneMaxPlatformFee, expressMultiplier: zoneExpressMultiplier, heritageMultiplier: zoneHeritageMultiplier } = useLocationStore();
  
  // Use zone platform multiplier if defined, otherwise fallback to global platformMultiplier config
  const rawPlatformMultiplier = (zone && zonePlatformMultiplier !== undefined && zonePlatformMultiplier !== null)
    ? zonePlatformMultiplier 
    : (platformMultiplier || 0);

  // Convert multiplier to rate: If multiplier >= 1 (e.g. 1.2 for 20%), rate is 0.2. If multiplier < 1 (e.g. 0.05 for 5%), rate is 0.05.
  const activePlatformRate = rawPlatformMultiplier >= 1 ? (rawPlatformMultiplier - 1) : rawPlatformMultiplier;

  const activeMinPlatformFee = zone ? (zoneMinPlatformFee || 0) : 0;
  const activeMaxPlatformFee = zone ? (zoneMaxPlatformFee || null) : null;
  const activeExpressMultiplier = zone ? (zoneExpressMultiplier !== undefined ? zoneExpressMultiplier : expressMultiplier) : expressMultiplier;
  const activeHeritageMultiplier = zone ? (zoneHeritageMultiplier !== undefined ? zoneHeritageMultiplier : 1) : 1;

  const getItemPrice = (item) => {
    // Priority: Respect showDiscountPrice or allowDiscount toggle from Master Service
    const basePrice = item.basePrice || item.totalPrice || 0;
    const discountedPrice = item.discountedPrice || basePrice;
    
    // If allowDiscount is false or showDiscountPrice is false, explicitly use basePrice
    const sourcePrice = (allowDiscount === false || item.showDiscountPrice === false) ? basePrice : discountedPrice;
    
    const isHeritage = selectedTier === 'Heritage';
    return Math.round(sourcePrice * (pricingFactor || 1) * (isHeritage ? (activeHeritageMultiplier || 1) : 1));
  };

  const areaMultiplier = 1; // Default to 1, can be linked to location later
  
  // V_Items = Base + (Base * (Express - 1)) + (Base * PlatformMultiplier)
  const currentExpressMultiplier = isExpress ? activeExpressMultiplier : 1;
  
  const V_Items = useMemo(() => {
    const totalBase = cartItems.reduce((acc, item) => {
        return acc + (getItemPrice(item) * (quantities[item._id || item.id] || 0) * areaMultiplier);
    }, 0);
    
    const expressSurcharge = totalBase * (currentExpressMultiplier - 1);
    const baseWithExpress = totalBase + expressSurcharge;
    
    let platformFee = baseWithExpress * activePlatformRate;
    if (activeMinPlatformFee > 0 && platformFee < activeMinPlatformFee) {
        platformFee = activeMinPlatformFee;
    }
    if (activeMaxPlatformFee > 0 && platformFee > activeMaxPlatformFee) {
        platformFee = activeMaxPlatformFee;
    }
    
    return totalBase + expressSurcharge + platformFee;
  }, [cartItems, quantities, areaMultiplier, currentExpressMultiplier, activePlatformRate, activeMinPlatformFee, activeMaxPlatformFee]);

  const V = V_Items + normalLogisticsConfig;
  const taxAmount = useMemo(() => {
    const itemsGst = cartItems.reduce((acc, item) => {
      const itemBase = getItemPrice(item) * (quantities[item._id || item.id] || 0) * areaMultiplier;
      const expressSurcharge = itemBase * (currentExpressMultiplier - 1);
      const taxableValue = itemBase + expressSurcharge;
      
      const itemGstPercent = selectedTier === 'Heritage' 
        ? (item.heritageGst !== undefined && item.heritageGst !== null ? item.heritageGst : gstPercent)
        : (item.gst !== undefined && item.gst !== null ? item.gst : gstPercent);
        
      return acc + (taxableValue * (itemGstPercent / 100));
    }, 0);

    const serviceValue = cartItems.reduce((sum, item) => sum + getItemPrice(item) * (quantities[item._id || item.id] || 0) * areaMultiplier * currentExpressMultiplier, 0);
    const customerFees = V_Items - serviceValue + normalLogisticsConfig;
    return itemsGst + customerFees * gstPercent / 100;
  }, [cartItems, quantities, areaMultiplier, currentExpressMultiplier, selectedTier, V_Items, normalLogisticsConfig, gstPercent]);

  const grandTotal = V + taxAmount;
  
  const discount = useMemo(() => {
      if (!isPromoApplied || !appliedPromoData) return 0;
      if (['Flat', 'FLAT_AMOUNT'].includes(appliedPromoData.discountType)) return Math.min(appliedPromoData.discountValue, grandTotal);
      return (grandTotal * appliedPromoData.discountValue) / 100;
  }, [isPromoApplied, appliedPromoData, grandTotal]);

  const finalTotal = useMemo(() => Math.max(0, grandTotal - discount), [grandTotal, discount]);

  const remainingPayable = useMemo(() => {
    const balanceUsed = useWallet ? Math.min(walletBalance, finalTotal) : 0;
    return Math.max(0, finalTotal - balanceUsed);
  }, [useWallet, walletBalance, finalTotal]);

  const priceBreakdown = useMemo(() => {
    const baseWithArea = cartItems.reduce((acc, item) => {
        return acc + (getItemPrice(item) * (quantities[item._id || item.id] || 0) * areaMultiplier);
    }, 0);
    
    // Additive logic breakdown based on Base Price
    const expressSurcharge = baseWithArea * (currentExpressMultiplier - 1);
    const baseWithExpress = baseWithArea + expressSurcharge;
    
    let platformFee = baseWithExpress * activePlatformRate;
    if (activeMinPlatformFee > 0 && platformFee < activeMinPlatformFee) {
        platformFee = activeMinPlatformFee;
    }
    if (activeMaxPlatformFee > 0 && platformFee > activeMaxPlatformFee) {
        platformFee = activeMaxPlatformFee;
    }
    
    return {
        baseWithArea,
        expressSurcharge,
        platformFee,
        logisticsFee: normalLogisticsConfig,
        gstAmount: taxAmount
    };
  }, [cartItems, quantities, areaMultiplier, activePlatformRate, activeMinPlatformFee, activeMaxPlatformFee, currentExpressMultiplier, normalLogisticsConfig, taxAmount]);

  const subtotal = priceBreakdown.baseWithArea;

  const handleApplyPromo = async (code) => {
    const targetCode = typeof code === 'string' ? code : promoCode;
    if (!targetCode) return;
    
    const vendorId = detectedVendorId;
    if (!vendorId) {
        console.warn('❌ Cannot apply promo: No valid Vendor ID detected');
        setPromoError('Vendor context missing. Please refresh cart.');
        return;
    }
    setPromoError('');

    try {
        const response = await promotionApi.validate({
            code: targetCode,
            vendorId,
            vendorId: detectedVendorId || undefined,
            orderValue: subtotal
        });

        if (response.message) {
            setPromoError(response.message);
            setIsPromoApplied(false);
            setAppliedPromoData(null);
        } else {
            setAppliedPromoData(response);
            setIsPromoApplied(true);
            setPromoError('');
            setPromoCode(response.code);
        }
    } catch (err) {
        setPromoError('Invalid or Expired Code');
        setPromoError(err?.message || 'Invalid or Expired Code');
        setIsPromoApplied(false);
        setAppliedPromoData(null);
    }
  };

  const [specialInstructions, setSpecialInstructions] = useState(() => localStorage.getItem('order_notes') || '');

  const handlePlaceOrder = async () => {
    try {
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      const userId = userData._id || userData.id; 
      if (!userId) return await appDialog.alert('Please login');

      // Enforce photo presence validation
      for (const item of cartItems) {
        const itemId = item._id || item.id;
        const photos = itemPhotos[itemId] || [];
        if (photos.length === 0) {
          toast.error(`Please upload at least one photo for "${item.name || 'selected service'}" before placing order.`);
          setActivePhotoService({ id: itemId, name: item.name || item.itemName });
          return;
        }
      }

      const amountToPay = Math.round(remainingPayable * 100) / 100;

      if (paymentMethod === 'Online' && amountToPay > 0) {
        const loadScript = (src) => {
          return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.body.appendChild(script);
          });
        };

        const res = await loadScript('https://checkout.razorpay.com/v1/checkout.js');
        if (!res) {
          await appDialog.alert('Razorpay SDK failed to load');
          return;
        }

        // The server prices the cart itself and opens the checkout for that
        // amount; the amount shown here is never what decides the charge.
        let rzpOrder;
        try {
          rzpOrder = await orderApi.createRazorpayOrder({
            purpose: 'CUSTOMER_ORDER',
            order: {
              items: cartItems.map(item => {
                const itemId = item._id || item.id;
                return { serviceId: itemId, quantity: quantities[itemId] };
              }),
              pickupLocation: selectedPickupAddress?.location || defaultCenter,
              deliveryMode: isExpress ? 'Express' : 'Normal',
              selectedTier,
              promoApplied: isPromoApplied ? appliedPromoData?._id : null,
              useWallet
            }
          });
        } catch (err) {
          toast.error(err.message || 'Could not start the payment');
          return;
        }

        if (Math.abs((rzpOrder.payable || 0) - amountToPay) > 1) {
          const proceed = await appDialog.confirm(
            `The final amount for this order is ₹${rzpOrder.payable} (the cart showed ₹${amountToPay}). Continue and pay ₹${rzpOrder.payable}?`
          );
          if (!proceed) return;
        }

        const options = {
          key: rzpOrder.keyId,
          amount: rzpOrder.amount,
          currency: rzpOrder.currency,
          name: 'Spinzyt',
          image: `${window.location.origin}/logo-mark.png`,
          description: `Full Payment`,
          order_id: rzpOrder.id,
          handler: async function (response) {
            // The full Razorpay response is forwarded so the server can verify the
            // signature. Payment success is confirmed by the backend, not here.
            await finalizeOrder(userId, response, 'Online');
          },
          prefill: {
            name: userData.displayName || '',
            email: userData.email || '',
            contact: userData.phone || ''
          },
          theme: { color: '#000000' },
          modal: {
            ondismiss: () => toast('Payment cancelled. Your cart is saved.')
          }
        };

        const paymentObject = new window.Razorpay(options);
        paymentObject.on('payment.failed', (response) => {
          toast.error(response?.error?.description || 'Payment failed. No money was taken for this attempt.');
        });
        paymentObject.open();
      } else {
        const actualMethod = amountToPay === 0 ? 'Online' : 'COD';
        await finalizeOrder(userId, null, actualMethod);
      }
    } catch (err) {
      await appDialog.alert('Error initiating order');
    }
  };

  const finalizeOrder = async (userId, paymentResponse, method) => {
    try {
      setLoading(true);

      const allItemPhotos = [];
      cartItems.forEach(item => {
        const itemId = item._id || item.id;
        const photos = itemPhotos[itemId] || [];
        allItemPhotos.push(...photos);
      });

      const mergedPhotos = Array.from(new Set([...garmentPhotos, ...allItemPhotos]));
      const amountToPay = Math.round(remainingPayable * 100) / 100;

      const orderData = {
        customerId: userId,
        items: cartItems.map(item => {
          const itemId = item._id || item.id;
          return {
            serviceId: itemId,
            name: item.name || item.itemName || 'Service Item',
            quantity: quantities[itemId],
            price: getItemPrice(item),
            unit: billingUnits[itemId],
            photos: itemPhotos[itemId] || []
          };
        }),
        pickupSlot: { date: selectedPickup, time: pickupTime },
        deliverySlot: { date: selectedDelivery, time: deliveryTime },
        pickupAddress: selectedPickupAddress?.address || '',
        pickupLocation: selectedPickupAddress?.location || defaultCenter,
        dropAddress: isSameAddress ? (selectedPickupAddress?.address || '') : (selectedDropAddress?.address || ''),
        dropLocation: isSameAddress ? (selectedPickupAddress?.location || defaultCenter) : (selectedDropAddress?.location || defaultCenter),
        totalAmount: finalTotal,
        paymentMethod: amountToPay === 0 ? 'Wallet' : method,
        useWallet: useWallet,
        razorpayPaymentId: paymentResponse?.razorpay_payment_id || null,
        razorpayOrderId: paymentResponse?.razorpay_order_id || null,
        razorpaySignature: paymentResponse?.razorpay_signature || null,
        deliveryMode: isExpress ? 'Express' : 'Normal',
        deliveryCharge: normalLogisticsConfig,
        areaMultiplier: areaMultiplier,
        platformMultiplier: activePlatformRate,
        minPlatformFee: activeMinPlatformFee,
        maxPlatformFee: activeMaxPlatformFee,
        expressMultiplier: activeExpressMultiplier,
        heritageMultiplier: activeHeritageMultiplier,
        selectedTier: selectedTier,
        promoApplied: isPromoApplied ? appliedPromoData?._id : null,
        discountAmount: discount,
        specialInstructions,
        customerPhotos: mergedPhotos
      };

      const response = await orderApi.createOrder(orderData);
      if (response._id) {
        // Clearing a confirmed cart must never trigger the empty-cart Home redirect.
        placedOrderRef.current = response._id;
        // 1. Thoroughly remove all cart, scheduling, and draft items from localStorage
        const keysToRemove = [
          'cart_quantities',
          'order_photos',
          'order_notes',
          'item_photos',
          'selected_tier',
          'is_express',
          'pickup_date',
          'pickup_time',
          'delivery_date',
          'delivery_time',
          'applied_promo',
          'cart_vendor_id'
        ];
        keysToRemove.forEach(key => localStorage.removeItem(key));

        // 2. Clear component state
        setQuantities({});
        setItemPhotos({});
        setSpecialInstructions('');

        // 3. Dispatch storage and custom events so Header, Home, & GlobalCartButton reset immediately
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new CustomEvent('cart-cleared'));

        // 4. Show vendor search immediately; draft cleanup must not delay this transition.
        navigate(`/user/tracking/${response._id}`, { replace: true, state: { order: response } });
        try {
          if (userId) await authApi.updateDraftCart(userId, {});
        } catch (_) {}
      } else {
        // The server rejected the order — most often a payment it could not verify.
        await appDialog.alert(response.message || 'Order could not be placed. Please try again.');
      }
    } catch (err) {
      await appDialog.alert('Error finalizing order');
    } finally {
      if (!placedOrderRef.current) setLoading(false);
    }
  };

  // ─── Upload Files to Server ─────────────────────────────────────────────
  const uploadFiles = async (files) => {
    if (!files || files.length === 0 || !activePhotoService) return null;
    
    setUploading(true);
    setUploadProgress(0);
    try {
      const uploadedUrls = [];
      let currentFileIndex = 0;

      for (const file of files) {
        const url = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          const formData = new FormData();
          formData.append('media', file);

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const fileProgress = Math.round((event.loaded / event.total) * 100);
              const overallProgress = Math.round(
                ((currentFileIndex * 100) + fileProgress) / files.length
              );
              setUploadProgress(overallProgress);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const res = JSON.parse(xhr.responseText);
                const fileUrl = res.url || res.fileUrl || res.path;
                if (fileUrl) {
                  resolve(fileUrl);
                } else {
                  reject(new Error('Server did not return a valid photo URL'));
                }
              } catch (e) {
                reject(new Error('Invalid response from server'));
              }
            } else {
              let errMsg = `Upload failed (${xhr.status})`;
              try {
                const errData = JSON.parse(xhr.responseText);
                if (errData.message) errMsg = errData.message;
              } catch (_) {}
              reject(new Error(errMsg));
            }
          };

          xhr.onerror = () => reject(new Error('Network error during upload'));
          
          const uploadEndpoint = `${BASE_URL}/media/upload`;
          xhr.open('POST', uploadEndpoint);
          
          const token = localStorage.getItem('token') || localStorage.getItem('user_auth_token') || localStorage.getItem('adminToken');
          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          }
          xhr.send(formData);
        });

        if (url) {
          uploadedUrls.push(url);
        }
        currentFileIndex++;
      }

      setItemPhotos(prev => {
        const updated = { 
          ...prev, 
          [activePhotoService.id]: [...(prev[activePhotoService.id] || []), ...uploadedUrls] 
        };
        localStorage.setItem('item_photos', JSON.stringify(updated));
        return updated;
      });
      
      toast.success('Photo uploaded successfully!');
      return uploadedUrls;
    } catch (error) {
      console.error('Upload Error:', error);
      toast.error(error.message || 'Failed to upload photo');
      return null;
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handlePhotoFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    await uploadFiles(files);
    if (e.target) e.target.value = ''; // Reset input
  };

  // ─── Camera Controls & Permission Flow ──────────────────────────────────
  const startCamera = async () => {
    setCameraError('');
    if (capturedPhoto?.previewUrl) {
      URL.revokeObjectURL(capturedPhoto.previewUrl);
    }
    setCapturedPhoto(null);

    // If mediaDevices is not supported in this browser/environment, fallback to native camera input
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (cameraInputRef.current) {
        cameraInputRef.current.click();
      } else {
        toast.error('Camera is not supported on this browser. Please use Upload Photo.');
      }
      return;
    }

    try {
      // Browser asks user for camera permission here
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      setCameraStream(stream);
      setShowCameraModal(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(e => console.warn('Video play error:', e));
        }
      }, 100);
    } catch (err) {
      console.error('Camera error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        toast.error('Camera permission was denied. Please allow camera in settings or use device camera.');
      }
      setCameraError(
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Camera access was denied. Please allow camera access in your browser settings, or use the device camera option below.'
          : err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError'
          ? 'No camera found on this device.'
          : 'Unable to start camera. Please use the device camera option below.'
      );
      setShowCameraModal(true);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }
    if (capturedPhoto?.previewUrl) {
      URL.revokeObjectURL(capturedPhoto.previewUrl);
    }
    setCapturedPhoto(null);
    setShowCameraModal(false);
    setCameraError('');
  };

  // Click / Snap photo from camera feed
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error('Failed to capture photo');
        return;
      }
      const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const previewUrl = URL.createObjectURL(blob);
      setCapturedPhoto({ file, previewUrl });

      // Pause video stream while in preview
      if (videoRef.current) {
        try { videoRef.current.pause(); } catch (_) {}
      }
    }, 'image/jpeg', 0.92);
  };

  // Retake photo: discard captured preview & resume camera stream
  const handleRetakePhoto = () => {
    if (capturedPhoto?.previewUrl) {
      URL.revokeObjectURL(capturedPhoto.previewUrl);
    }
    setCapturedPhoto(null);
    if (videoRef.current && cameraStream) {
      videoRef.current.play().catch(() => {});
    }
  };

  // Upload captured photo: automatically uploads and attaches to item
  const handleUploadCapturedPhoto = async () => {
    if (!capturedPhoto?.file) return;
    const fileToUpload = capturedPhoto.file;
    const uploaded = await uploadFiles([fileToUpload]);
    if (uploaded && uploaded.length > 0) {
      stopCamera();
    }
  };

  // Release the camera if the page unmounts while the modal is open
  useEffect(() => {
    return () => {
      if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
    };
  }, [cameraStream]);

  const handleDeletePhoto = (serviceId, photoUrl) => {
    setItemPhotos(prev => {
      const updated = {
        ...prev,
        [serviceId]: (prev[serviceId] || []).filter(url => url !== photoUrl)
      };
      localStorage.setItem('item_photos', JSON.stringify(updated));
      return updated;
    });
    toast.success('Photo removed');
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-background font-body text-on-background min-h-[100dvh] flex flex-col"
    >
      <header className="fixed top-0 left-0 right-0 z-[80] bg-background/80 backdrop-blur-xl border-b border-outline-variant/10 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-surface-container-low flex items-center justify-center text-primary shadow-sm"><span className="material-symbols-outlined font-black">arrow_back</span></motion.button>
          <h1 className="text-sm font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-60">Cart Details</h1>
          <div className="w-10" />
        </div>
      </header>

      <motion.main className="max-w-5xl mx-auto px-6 pb-36 w-full flex-1 overflow-y-auto hide-scrollbar">
        <div className="h-20 shrink-0" />
        <div className="flex flex-col gap-4">
          <div className="flex flex-col">
            {/* 1. CONCISE ORDER SUMMARY BOX */}
            <div className="bg-slate-950 text-white rounded-t-[2rem] p-5 shadow-2xl relative overflow-hidden group border-b border-white/5">
            <div className="absolute right-0 top-0 p-6 opacity-[0.03] rotate-12 pointer-events-none">
              <span className="material-symbols-outlined text-[80px]">receipt_long</span>
            </div>
            
            <div className="flex items-center justify-between mb-5 relative z-10">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tighter leading-none">Order Summary</h2>
              </div>
            </div>

            <div className="grid grid-cols-[1fr_1.15fr] gap-2 relative z-10">
              {/* Left Side: Tier & Mode */}
              <div className="space-y-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-white/60 text-[12px]">workspace_premium</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-[8px] font-black text-white/30 uppercase tracking-widest">Tier</p>
                    <p className="text-[10px] font-black text-white uppercase">{selectedTier}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-white/60 text-[12px]">bolt</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-[8px] font-black text-white/30 uppercase tracking-widest">Delivery Mode</p>
                    <p className="text-[10px] font-black text-white uppercase">{isExpress ? 'Express' : 'Normal'}</p>
                  </div>
                </div>
              </div>

              {/* Right Side: Pickup & Drop */}
              <div className="space-y-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-white/60 text-[12px]">calendar_today</span>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-[7px] font-black text-white/30 uppercase tracking-widest leading-none mb-1 whitespace-nowrap">Pickup Address & Time</p>
                    <div className="flex items-center gap-1 mt-1 whitespace-nowrap">
                      <span className="text-[7px] font-black text-white/40 uppercase px-1 py-0.5 bg-white/5 rounded border border-white/5 shrink-0">
                        {selectedPickupAddress?.type || 'NA'}
                      </span>
                      <p className="text-[9px] font-black text-white uppercase">{pickupTime}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-white/60 text-[12px]">local_shipping</span>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-[7px] font-black text-white/30 uppercase tracking-widest leading-none mb-1 whitespace-nowrap">Dropoff Address & Time</p>
                    <div className="flex items-center gap-1 mt-1 whitespace-nowrap">
                      <span className="text-[7px] font-black text-white/40 uppercase px-1 py-0.5 bg-white/5 rounded border border-white/5 shrink-0">
                        {(isSameAddress ? selectedPickupAddress?.type : selectedDropAddress?.type) || 'NA'}
                      </span>
                      <p className="text-[9px] font-black text-white uppercase">{deliveryTime}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

            {/* Read-only estimate from admin-configured service weights */}
            <div className="bg-slate-950 text-white px-6 pt-5 pb-1">
              <div className="flex items-center justify-between gap-4 rounded-xl bg-white/5 border border-white/10 px-4 py-3">
                <div>
                  <p className="text-[8px] font-black text-white/40 uppercase tracking-widest">Estimated total weight</p>
                  <p className="mt-1 text-[9px] font-semibold text-white/35">Calculated automatically from the selected items</p>
                </div>
                <span className="text-sm font-black text-white tabular-nums whitespace-nowrap">
                  {configuredWeight === null ? '—' : `~${configuredWeight} kg`}
                </span>
              </div>
            </div>

            {/* 2. PRICE BREAKDOWN / PAYMENT BOX */}
            <div className="bg-slate-950 text-white rounded-b-[2rem] p-6 shadow-2xl space-y-4 relative overflow-hidden group">
            <div className="absolute right-0 top-0 p-8 opacity-[0.02] rotate-12 pointer-events-none group-hover:opacity-[0.04] transition-opacity">
              <span className="material-symbols-outlined text-[100px]">payments</span>
            </div>

            <div className="space-y-4 relative z-10">

              <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 px-1">
                <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-white/40">
                  <span>Service Price</span>
                  <span className="text-white">₹{(priceBreakdown.baseWithArea + priceBreakdown.expressSurcharge).toFixed(0)}</span>
                </div>
                <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-white/40">
                  <span>Platform Fee</span>
                  <span className="text-white">₹{priceBreakdown.platformFee.toFixed(0)}</span>
                </div>
                <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-white/40">
                  <span>Logistic Fee</span>
                  <span className="text-white">₹{priceBreakdown.logisticsFee.toFixed(0)}</span>
                </div>
                <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-white/40">
                  <span>GST</span>
                  <span className="text-white">₹{priceBreakdown.gstAmount.toFixed(0)}</span>
                </div>
                {isPromoApplied && (
                  <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest text-emerald-400">
                    <span>Promo Discount</span>
                    <span>-₹{discount.toFixed(0)}</span>
                  </div>
                )}
              </div>

              {/* SIMPLIFIED PROMO CODE SECTION */}
              <div className="mt-4 relative z-[20]">
                <div className="relative flex items-center group/promo">
                    <input 
                      type="text" 
                      placeholder="ENTER PROMO CODE OR SELECT OFFER"
                      value={promoCode}
                      onChange={(e) => {
                        setPromoCode(e.target.value.toUpperCase());
                        setShowPromoDropdown(true);
                      }}
                      onFocus={() => setShowPromoDropdown(true)}
                      onFocus={() => {
                        setShowPromoDropdown(true);
                        if (applicablePromos.length === 0 && !promosLoading) {
                          fetchApplicablePromos();
                        }
                      }}
                      className="w-full bg-white/10 border border-white/10 rounded-2xl px-5 py-4 text-[10px] font-black uppercase tracking-widest outline-none focus:bg-white/20 transition-all text-white placeholder:text-white/30 pr-24 shadow-inner"
                    />
                    
                    <div className="absolute right-2 flex items-center gap-2">
                      {isPromoApplied && (
                        <button onClick={() => { setIsPromoApplied(false); setAppliedPromoData(null); setPromoCode(''); }} className="text-[8px] font-black text-rose-400 uppercase tracking-widest px-2">Clear</button>
                      )}
                      <button 
                        onClick={() => {
                          handleApplyPromo(promoCode);
                          setShowPromoDropdown(false);
                        }}
                        className={`px-5 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all ${isPromoApplied ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-white text-black'}`}
                      >
                        {isPromoApplied ? 'APPLIED' : 'APPLY'}
                      </button>
                    </div>
                </div>

                <AnimatePresence>
                  {showPromoDropdown && (
                    <>
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowPromoDropdown(false)}
                        className="fixed inset-0 z-[90]"
                      />
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute bottom-full mb-3 left-0 right-0 z-[100] bg-[#1a1f2b] border border-white/10 rounded-[1.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden backdrop-blur-xl"
                      >
                        <div className="px-4 py-3 border-b border-white/5 flex justify-between items-center">
                          <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">Available Offers</span>
                          <span className="text-[8px] font-black text-emerald-400 uppercase">
                            {promosLoading ? 'Loading...' : `${applicablePromos.length} Found`}
                          </span>
                        </div>
                        <div className="max-h-48 overflow-y-auto custom-scrollbar">
                          {promosLoading ? (
                            <div className="p-6 text-center text-white/40 text-[9px] font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                              <div className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                              Loading available offers...
                            </div>
                          ) : applicablePromos.length > 0 ? (
                            applicablePromos.map(p => (
                              <button
                                key={p._id}
                                onClick={() => {
                                  setPromoCode(p.code);
                                  handleApplyPromo(p.code);
                                  setShowPromoDropdown(false);
                                }}
                                className="w-full px-5 py-4 text-left hover:bg-white/5 transition-all border-b border-white/5 last:border-0 flex items-center justify-between group"
                              >
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black text-white group-hover:text-emerald-400 transition-colors tracking-wider">{p.code}</span>
                                    <span className="text-[7px] font-black bg-white/10 text-white/70 px-1.5 py-0.5 rounded tracking-widest uppercase">Admin Offer</span>
                                  </div>
                                  <p className="text-[8px] font-bold text-white/50 uppercase line-clamp-1">{p.title || p.description || 'Special Platform Offer'}</p>
                                  {(p.minOrderValue > 0 || p.min_order_value > 0) && (
                                    <span className="text-[7px] text-white/30 font-bold uppercase tracking-wider">
                                      Min Order ₹{p.minOrderValue || p.min_order_value}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[9px] font-black text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2.5 py-1 rounded-lg group-hover:bg-emerald-400 group-hover:text-white transition-all">
                                  {['Flat', 'FLAT_AMOUNT'].includes(p.discountType) ? `₹${p.discountValue}` : `${p.discountValue}%`} OFF
                                </span>
                              </button>
                            ))
                          ) : (
                            <div className="p-6 text-center text-white/40 text-[9px] font-bold uppercase tracking-widest">
                              No active platform offers available right now. You can still enter an admin promo code above.
                            </div>
                          )}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>

                {promoError && <p className="text-[8px] font-black text-rose-400 uppercase mt-2 ml-2 tracking-widest">{promoError}</p>}
                {isPromoApplied && (
                  <p className="text-[9px] font-black text-emerald-400 uppercase mt-2 ml-2 tracking-[0.1em] flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">celebration</span>
                    Promo applied! Saved ₹{discount.toFixed(0)}
                  </p>
                )}

                {walletBalance > 0 && (
                  <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-2xl p-4 mt-4 relative z-20">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-lg text-emerald-400">account_balance_wallet</span>
                      <div className="text-left">
                        <p className="text-[9px] font-black uppercase tracking-widest text-white">Use Wallet Balance</p>
                        <p className="text-[8px] font-bold text-white/40 uppercase tracking-wider">Available: ₹{walletBalance.toFixed(0)}</p>
                      </div>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={useWallet} 
                      onChange={(e) => setUseWallet(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-0 accent-blue-600 cursor-pointer"
                    />
                  </div>
                )}
              </div>
            </div>
            
            <div className="pt-3 border-t border-white/5 flex items-center justify-between relative z-10">
              <div className="flex flex-col">
                <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Total Payable Amount</p>
                <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-black tracking-tighter text-white">₹{remainingPayable.toFixed(0)}</p>
                    {useWallet && (
                      <span className="text-[7px] font-black text-emerald-400 uppercase tracking-widest">
                        (₹{Math.min(walletBalance, finalTotal).toFixed(0)} from wallet)
                      </span>
                    )}
                </div>
              </div>
              
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handlePlaceOrder}
                disabled={cartItems.length === 0 || loading}
                className="bg-white text-black px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl"
              >
                {loading ? 'WAIT...' : 'PAY NOW'}
              </motion.button>
            </div>
          </div>
        </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between px-2">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Services Review</p>
              <button 
                onClick={() => navigate('/user/home')}
                className="flex items-center gap-1 text-[8px] font-black text-slate-900 uppercase bg-slate-100 px-3 py-1.5 rounded-full hover:bg-slate-200 transition-all shadow-sm active:scale-95"
              >
                <span className="material-symbols-outlined text-[10px] font-bold">edit</span>
                EDIT
              </button>
            </div>
            {cartItems.map((item) => {
              const itemId = item._id || item.id;
              const qty = quantities[itemId];
              const unitPrice = getItemPrice(item);
              const totalPrice = unitPrice * qty;
              const isHeritageService = item.tier === 'Heritage' || (item.basePrice > 200);

              return (
                <div key={itemId} className="bg-white rounded-3xl p-4 flex items-center gap-4 border border-slate-100 shadow-sm relative overflow-hidden group">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-900 border border-slate-100 shrink-0">
                    <span className="material-symbols-outlined text-lg">{item.icon || 'local_laundry_service'}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="font-black text-[10px] text-slate-900 uppercase tracking-tight truncate">{item.name}</h3>
                        <span className="text-[6px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-widest bg-slate-100 text-slate-400 shrink-0">
                          {isHeritageService ? 'Heritage' : 'Essential'}
                        </span>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <p className="text-[11px] font-black text-slate-900 tracking-tighter">
                          ₹{Math.round(totalPrice + (totalPrice * ((selectedTier === 'Heritage' ? (item.heritageGst !== undefined && item.heritageGst !== null ? item.heritageGst : gstPercent) : (item.gst !== undefined && item.gst !== null ? item.gst : gstPercent)) / 100)))}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center bg-slate-100/50 rounded-xl px-3 py-1.5 border border-slate-200/20 shadow-inner">
                      <span className="text-[10px] font-black text-slate-900 text-center">Qty: {qty}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 4. AGGREGATED UPLOADED PHOTOS GALLERY */}
          {Object.values(itemPhotos).some(photos => photos.length > 0) && (
            <div className="space-y-3">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2">Uploaded Articles Photos</p>
              <div className="bg-white rounded-[2rem] p-4 border border-slate-100 shadow-sm">
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(itemPhotos).map(([itemId, photos]) => 
                    photos.map((photo, pIdx) => {
                      const serviceName = cartItems.find(i => (i._id || i.id) === itemId)?.name || 'Article';
                      return (
                        <div key={`${itemId}-${pIdx}`} className="flex flex-col gap-1.5">
                          <div 
                            onClick={() => setActivePhotoService({ id: itemId, name: serviceName })}
                            className="aspect-square rounded-2xl overflow-hidden border border-slate-100 bg-slate-50 relative group cursor-pointer active:scale-95 transition-transform"
                          >
                            <img src={photo} alt="" className="w-full h-full object-cover" />
                          </div>
                          <p className="text-[7px] font-black text-slate-900/60 uppercase truncate text-center px-1 tracking-tight">
                            {serviceName}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
          {/* Photo Upload & Management Modal */}
          <AnimatePresence>
            {activePhotoService && (
              <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  exit={{ opacity: 0 }} 
                  onClick={() => setActivePhotoService(null)} 
                  className="absolute inset-0 bg-black/70 backdrop-blur-sm" 
                />
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }} 
                  animate={{ scale: 1, opacity: 1 }} 
                  exit={{ scale: 0.9, opacity: 0 }} 
                  className="relative w-full max-w-[340px] bg-slate-950/80 backdrop-blur-md border border-white/10 text-white rounded-[2rem] p-6 shadow-2xl flex flex-col gap-4 max-h-[85vh] overflow-y-auto hide-scrollbar"
                >
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-black uppercase tracking-widest text-white/90">
                      Photos for {activePhotoService.name}
                    </h3>
                    <button 
                      onClick={() => setActivePhotoService(null)} 
                      className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white"
                    >
                      <span className="material-symbols-outlined text-base">close</span>
                    </button>
                  </div>

                  {uploading && (
                    <div className="w-full space-y-2 py-2">
                      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/50">
                        <span>Uploading...</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-white transition-all duration-300 rounded-full"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Existing Photos Grid */}
                  {itemPhotos[activePhotoService.id]?.length > 0 ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-2">
                        {itemPhotos[activePhotoService.id].map((photo, idx) => (
                          <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden border border-white/10 bg-slate-900">
                            <img src={photo} alt="" className="w-full h-full object-cover" />
                            <button
                              onClick={() => handleDeletePhoto(activePhotoService.id, photo)}
                              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-rose-500/80 backdrop-blur-sm text-white flex items-center justify-center shadow-lg active:scale-90 transition-transform"
                            >
                              <span className="material-symbols-outlined text-[12px] font-bold">delete</span>
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2">
                        <button 
                          type="button"
                          onClick={startCamera}
                          className="flex-1 bg-white text-black py-2.5 rounded-xl font-black text-[8.5px] uppercase tracking-widest flex items-center justify-center gap-1.5 active:scale-95 transition-transform shadow-sm"
                        >
                          <span className="material-symbols-outlined text-sm">photo_camera</span> Take Photo
                        </button>
                        <button 
                          type="button"
                          onClick={() => galleryInputRef.current.click()}
                          className="flex-1 bg-white/10 border border-white/10 text-white py-2.5 rounded-xl font-black text-[8.5px] uppercase tracking-widest flex items-center justify-center gap-1.5 active:scale-95 transition-transform hover:bg-white/20"
                        >
                          <span className="material-symbols-outlined text-sm">add_a_photo</span> Upload
                        </button>
                        <button 
                          type="button"
                          onClick={async () => {
                            if (await appDialog.confirm("Delete all photos for this item?")) {
                              setItemPhotos(prev => {
                                const { [activePhotoService.id]: _, ...rest } = prev;
                                localStorage.setItem('item_photos', JSON.stringify(rest));
                                return rest;
                              });
                              toast.success("Photos deleted");
                            }
                          }}
                          className="px-3 bg-rose-500/20 border border-rose-500/30 text-rose-300 py-2.5 rounded-xl font-black text-[8px] uppercase tracking-widest flex items-center justify-center active:scale-95 transition-transform hover:bg-rose-500/30"
                          title="Delete all photos"
                        >
                          <span className="material-symbols-outlined text-sm">delete_sweep</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* No Photos State */
                    <div className="grid grid-cols-2 gap-3 py-4">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        onClick={startCamera}
                        className="bg-white/5 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 border border-dashed border-white/10 hover:border-white/20 transition-all text-white/60 hover:text-white"
                      >
                        <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-white shadow-sm border border-white/10">
                          <span className="material-symbols-outlined text-2xl">photo_camera</span>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest">Take Photo</span>
                      </motion.button>
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        onClick={() => galleryInputRef.current.click()}
                        className="bg-white/5 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 border border-dashed border-white/10 hover:border-white/20 transition-all text-white/60 hover:text-white"
                      >
                        <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-white shadow-sm border border-white/10">
                          <span className="material-symbols-outlined text-2xl">add_a_photo</span>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest">Upload Photo</span>
                      </motion.button>
                    </div>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Camera capture */}
          <canvas ref={canvasRef} className="hidden" />
          <AnimatePresence>
            {showCameraModal && (
              <div className="fixed inset-0 z-[350] flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={stopCamera}
                  className="absolute inset-0 bg-black/85 backdrop-blur-md"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className="relative z-10 w-full max-w-md bg-[#0F0F0F] rounded-[2rem] border border-white/15 overflow-hidden flex flex-col shadow-2xl"
                >
                  <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/80">
                        {capturedPhoto ? 'Review Photo' : 'Take Photo'}
                      </span>
                      <p className="text-[8.5px] font-bold text-white/40 mt-0.5 truncate max-w-[220px]">
                        {activePhotoService?.name || 'Garment Photo'}
                      </p>
                    </div>
                    <button onClick={stopCamera} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/50 hover:text-white transition-colors">
                      <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                  </div>

                  {cameraError ? (
                    <div className="p-8 flex flex-col items-center gap-4 text-center">
                      <div className="w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                        <span className="material-symbols-outlined text-3xl">videocam_off</span>
                      </div>
                      <p className="text-[11px] font-bold text-white/70 leading-relaxed max-w-xs">{cameraError}</p>
                      <div className="flex flex-col w-full gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => { stopCamera(); cameraInputRef.current?.click(); }}
                          className="w-full py-3 rounded-xl bg-white text-black text-[10px] font-black uppercase tracking-widest hover:bg-white/90 transition-all flex items-center justify-center gap-2"
                        >
                          <span className="material-symbols-outlined text-sm">photo_camera</span> Open Device Camera
                        </button>
                        <button
                          type="button"
                          onClick={() => { stopCamera(); galleryInputRef.current?.click(); }}
                          className="w-full py-2.5 rounded-xl bg-white/10 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/80 hover:bg-white/20 transition-all flex items-center justify-center gap-2"
                        >
                          <span className="material-symbols-outlined text-sm">add_a_photo</span> Upload From Gallery
                        </button>
                      </div>
                    </div>
                  ) : capturedPhoto ? (
                    /* ── PREVIEW OF CLICKED PHOTO: RETAKE & UPLOAD ── */
                    <div className="flex flex-col">
                      <div className="relative bg-black aspect-[3/4] w-full overflow-hidden flex items-center justify-center">
                        <img 
                          src={capturedPhoto.previewUrl} 
                          alt="Captured" 
                          className="w-full h-full object-cover" 
                        />
                        <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 flex items-center gap-1.5 text-[9px] font-bold text-emerald-400">
                          <span className="material-symbols-outlined text-xs">check_circle</span>
                          Photo Ready
                        </div>
                      </div>

                      {uploading && (
                        <div className="px-5 pt-3 space-y-1.5">
                          <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-white/60">
                            <span>Uploading photo...</span>
                            <span>{uploadProgress}%</span>
                          </div>
                          <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-white transition-all duration-300 rounded-full" style={{ width: `${uploadProgress}%` }} />
                          </div>
                        </div>
                      )}

                      <div className="p-4 flex gap-3 border-t border-white/10 bg-black/40">
                        <button
                          type="button"
                          disabled={uploading}
                          onClick={handleRetakePhoto}
                          className="flex-1 py-3 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-sm">replay</span> Retake
                        </button>
                        <button
                          type="button"
                          disabled={uploading}
                          onClick={handleUploadCapturedPhoto}
                          className="flex-2 py-3 bg-white text-black hover:bg-white/90 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-lg shadow-white/10 disabled:opacity-50"
                        >
                          {uploading ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                              Uploading...
                            </>
                          ) : (
                            <>
                              <span className="material-symbols-outlined text-sm">cloud_upload</span> Upload Photo
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── LIVE CAMERA VIEWFINDER & SHUTTER BUTTON ── */
                    <div className="flex flex-col">
                      <div className="relative bg-black aspect-[3/4] w-full overflow-hidden">
                        <video ref={videoRef} playsInline autoPlay muted className="w-full h-full object-cover" />
                        <div className="absolute inset-6 pointer-events-none border border-white/20 rounded-2xl flex flex-col justify-between p-2">
                          <div className="flex justify-between">
                            <div className="w-4 h-4 border-t-2 border-l-2 border-white/60 rounded-tl-sm" />
                            <div className="w-4 h-4 border-t-2 border-r-2 border-white/60 rounded-tr-sm" />
                          </div>
                          <div className="flex justify-between">
                            <div className="w-4 h-4 border-b-2 border-l-2 border-white/60 rounded-bl-sm" />
                            <div className="w-4 h-4 border-b-2 border-r-2 border-white/60 rounded-br-sm" />
                          </div>
                        </div>
                      </div>
                      <div className="p-5 flex flex-col items-center gap-3 border-t border-white/10 bg-black/40">
                        <button
                          type="button"
                          onClick={capturePhoto}
                          className="w-16 h-16 rounded-full bg-white border-4 border-white/30 hover:border-white/60 transition-all active:scale-90 flex items-center justify-center shadow-xl cursor-pointer"
                          aria-label="Click Photo"
                        >
                          <span className="material-symbols-outlined text-slate-900 text-2xl">photo_camera</span>
                        </button>
                        <div className="flex items-center gap-2">
                          <span className="text-[8.5px] font-bold uppercase tracking-widest text-white/50">
                            Tap to capture
                          </span>
                          <span className="text-white/30">·</span>
                          <button
                            type="button"
                            onClick={() => { stopCamera(); cameraInputRef.current?.click(); }}
                            className="text-[8.5px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300 underline"
                          >
                            Device Camera
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Hidden inputs for file upload */}
          <input 
            ref={galleryInputRef} 
            type="file" 
            multiple 
            accept="image/*" 
            onChange={handlePhotoFileChange} 
            className="hidden" 
          />
          <input 
            ref={cameraInputRef} 
            type="file" 
            accept="image/*" 
            capture="environment" 
            onChange={handlePhotoFileChange} 
            className="hidden" 
          />
        </div>
      </motion.main>
    </motion.div>
  );
};

export default CartPage;
