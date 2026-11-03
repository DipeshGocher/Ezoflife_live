import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { authApi, geofenceApi } from '../../../lib/api';
import toast from 'react-hot-toast';
import { Autocomplete } from '@react-google-maps/api';
import { waitForGoogleMaps } from '../../../lib/googleMaps';
import { useLocationStore } from '../../../shared/stores/locationStore';
import { locationService } from '../../../lib/locationService';

const defaultCenter = { lat: 22.7196, lng: 75.8577 }; // Indore as default

const VendorAddressesPage = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(!!window.google);

  React.useEffect(() => {
    let cancelled = false;
    waitForGoogleMaps()
      .then(() => { if (!cancelled) setIsLoaded(true); })
      .catch((err) => console.error('Google Maps failed to load:', err.message));
    return () => { cancelled = true; };
  }, []);

  const [autocomplete, setAutocomplete] = useState(null);
  
  const initialAddresses = useMemo(() => {
    const user = JSON.parse(localStorage.getItem('vendorData') || localStorage.getItem('user') || '{}');
    return user.addresses || [];
  }, []);

  const addressTypes = useMemo(() => ['Facility'], []);

  const [addresses, setAddresses] = useState(initialAddresses);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  const [newType, setNewType] = useState('Facility');
  const [formData, setFormData] = useState({
    line1: '',
    line2: '',
    floor: '',
    landmark: '',
    pincode: '',
    city: '',
    state: '',
    location: null
  });

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

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const syncAddressToStoreAndGeofence = async (targetAddress) => {
    let finalLat = targetAddress.location?.lat || 0;
    let finalLng = targetAddress.location?.lng || 0;
    
    if (!finalLat && !finalLng && targetAddress.address) {
      try {
        const coords = await locationService.geocodeAddress(targetAddress.address);
        if (coords) {
          finalLat = coords.lat;
          finalLng = coords.lng;
        }
      } catch (e) {
        console.error('[Geocoding] Full address sync failed:', e);
      }
    }

    if (!finalLat && !finalLng && targetAddress.pincode) {
      try {
        const coords = await locationService.geocodeAddress(targetAddress.pincode + ", India");
        if (coords) {
          finalLat = coords.lat;
          finalLng = coords.lng;
        }
      } catch (e) {
        console.error('[Geocoding] Pincode sync failed:', e);
      }
    }

    if (!finalLat && !finalLng) {
      finalLat = defaultCenter.lat;
      finalLng = defaultCenter.lng;
    }

    useLocationStore.getState().setLocation({
      fullAddress: targetAddress.address,
      city: targetAddress.city || '',
      area: targetAddress.type || 'HOME',
      lat: finalLat,
      lng: finalLng
    });

    const pickupAddressObj = {
      id: targetAddress._id || targetAddress.id,
      type: (targetAddress.type || 'HOME').toUpperCase(),
      address: targetAddress.address,
      location: { lat: finalLat, lng: finalLng },
      isDefault: true
    };
    localStorage.setItem('pickup_address', JSON.stringify(pickupAddressObj));

    if (finalLat && finalLng) {
      try {
        const zoneInfo = await geofenceApi.checkAvailability(finalLat, finalLng);
        if (zoneInfo.available) {
          useLocationStore.getState().setZoneData({
            name: zoneInfo.name,
            pricingFactor: zoneInfo.pricingFactor,
            allowDiscount: zoneInfo.allowDiscount,
            platformMultiplier: zoneInfo.platformMultiplier,
            minPlatformFee: zoneInfo.minPlatformFee,
            maxPlatformFee: zoneInfo.maxPlatformFee,
            expressMultiplier: zoneInfo.expressMultiplier,
            heritageMultiplier: zoneInfo.heritageMultiplier
          });
        } else {
          useLocationStore.getState().setZoneData({ name: null, pricingFactor: 1, allowDiscount: false, platformMultiplier: 0, minPlatformFee: 0, maxPlatformFee: null, expressMultiplier: 1, heritageMultiplier: 1 });
        }
      } catch (zoneErr) {
        console.error('[Geofence] Error checking availability during sync:', zoneErr);
      }
    } else {
      useLocationStore.getState().setZoneData({ name: null, pricingFactor: 1, allowDiscount: false, platformMultiplier: 0, minPlatformFee: 0, maxPlatformFee: null, expressMultiplier: 1, heritageMultiplier: 1 });
    }
  };

  const handleSaveAddress = async () => {
    if (!formData.line1.trim() || !formData.pincode.trim()) return;

    const fullAddressString = `${formData.line1}${formData.line2 ? `, ${formData.line2}` : ''}${formData.floor ? `, Floor ${formData.floor}` : ''}${formData.landmark ? ` (Near ${formData.landmark})` : ''}, ${formData.city}, ${formData.state} - ${formData.pincode}`;

    try {
      setIsLoading(true);
      const user = JSON.parse(localStorage.getItem('vendorData') || localStorage.getItem('user') || '{}');
      const userId = user.id || user._id;

      if (!userId) {
        toast.error('Session expired. Please login again.');
        return;
      }

      // Filter out any existing addresses of the same type if it's Home or Office
      let updatedList = (user.addresses || [])
        .filter(a => typeof a === 'object' && a !== null)
        .filter(a => {
          if (newType === 'Home' || newType === 'Office') {
            return a.type !== newType;
          }
          if (editingAddress) {
            return (a._id || a.id) !== (editingAddress._id || editingAddress.id);
          }
          return true;
        });
      
      let finalLocation = (formData.location && formData.location.lat !== 0) ? formData.location : null;

      if (!finalLocation && fullAddressString) {
        try {
          const coords = await locationService.geocodeAddress(fullAddressString);
          if (coords) {
            finalLocation = coords;
          }
        } catch (e) {
          console.error('[Geocoding] Full address failed:', e);
        }
      }

      if (!finalLocation && formData.pincode) {
        try {
          const coords = await locationService.geocodeAddress(formData.pincode + ", India");
          if (coords) {
            finalLocation = coords;
          }
        } catch (e) {
          console.error('[Geocoding] Pincode fallback failed:', e);
        }
      }

      finalLocation = finalLocation || defaultCenter;

      const newAddrObj = {
        type: newType,
        address: fullAddressString,
        city: formData.city || '',
        pincode: formData.pincode || '',
        location: finalLocation,
        isDefault: editingAddress ? editingAddress.isDefault : updatedList.length === 0
      };

      if (editingAddress) {
        newAddrObj._id = editingAddress._id || editingAddress.id;
      }

      updatedList.push(newAddrObj);

      // Prepare sync to shopDetails if it's default
      const shopDetailsUpdates = newAddrObj.isDefault ? {
        shopDetails: {
          ...(user.shopDetails || {}),
          address: fullAddressString,
          city: formData.city || '',
          pincode: formData.pincode || ''
        },
        address: fullAddressString, 
        city: formData.city || '', 
        pincode: formData.pincode || '', 
        location: finalLocation
      } : {};

      // 3. Update Profile on Server
      const updatedUser = await authApi.updateProfile(userId, {
        addresses: updatedList,
        ...shopDetailsUpdates
      });

      // Update local storage cache keys
      const mergedUser = { ...user, ...updatedUser };
      localStorage.setItem('user', JSON.stringify(mergedUser));
      localStorage.setItem('vendorData', JSON.stringify(mergedUser));
      localStorage.setItem('userData', JSON.stringify(mergedUser));
      
      // Update UI list
      setAddresses(mergedUser.addresses || []);

      if (newAddrObj.isDefault) {
        await syncAddressToStoreAndGeofence(newAddrObj);
      }

      toast.success(`${newType} address updated!`);
      closeModal();
    } catch (err) {
      console.error('Save Address Error:', err);
      toast.error('Failed to save address to server');
    } finally {
      setIsLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingAddress(null);
    setNewType('Home');
    setFormData({ line1: '', line2: '', floor: '', landmark: '', pincode: '', city: '', state: '', location: null });
    setIsModalOpen(true);
  };

  const openEditModal = (addr) => {
    setEditingAddress(addr);
    setNewType(addr.type);
    setFormData(addr.raw || { line1: addr.address, line2: '', floor: '', landmark: '', pincode: '', city: '', state: '' });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingAddress(null);
  };

  const deleteAddress = async (addrId) => {
    try {
      setIsLoading(true);
      const user = JSON.parse(localStorage.getItem('vendorData') || localStorage.getItem('user') || '{}');
      const userId = user.id || user._id;

      if (!userId) {
        toast.error('Session expired. Please login again.');
        return;
      }

      const addressToDelete = user.addresses?.find(a => (a._id || a.id) === addrId);
      const updatedList = (user.addresses || [])
        .filter(a => typeof a === 'object' && a !== null)
        .filter(a => (a._id || a.id) !== addrId);

      // If the deleted address was default, make the first remaining address default
      if (addressToDelete?.isDefault && updatedList.length > 0) {
        updatedList[0].isDefault = true;
      }

      // Find the new default address to sync to shopDetails
      const newDefault = updatedList.find(a => a.isDefault);
      const shopDetailsUpdates = newDefault ? {
        shopDetails: {
          ...(user.shopDetails || {}),
          address: newDefault.address,
          city: newDefault.city || '',
          pincode: newDefault.pincode || ''
        },
        address: newDefault.address,
        city: newDefault.city || '',
        pincode: newDefault.pincode || '',
        location: newDefault.location
      } : {
        shopDetails: {
          ...(user.shopDetails || {}),
          address: '',
          city: '',
          pincode: ''
        },
        address: '',
        city: '',
        pincode: '',
        location: null
      };

      const updatedUser = await authApi.updateProfile(userId, {
        addresses: updatedList,
        ...shopDetailsUpdates
      });

      const mergedUser = { ...user, ...updatedUser };
      localStorage.setItem('user', JSON.stringify(mergedUser));
      localStorage.setItem('vendorData', JSON.stringify(mergedUser));
      localStorage.setItem('userData', JSON.stringify(mergedUser));
      
      setAddresses(mergedUser.addresses || []);

      if (newDefault) {
        await syncAddressToStoreAndGeofence(newDefault);
      }

      toast.success('Address deleted successfully');
    } catch (err) {
      console.error('Delete Address Error:', err);
      toast.error('Failed to delete address');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-[#F8FAFC] text-slate-900 min-h-[100dvh] pb-32 overflow-x-hidden"
    >
      <main className="max-w-2xl mx-auto px-6 pt-6 font-body">
        <motion.header 
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="mb-8 text-left"
        >
          <button 
            onClick={() => navigate('/vendor/profile')}
            className="flex items-center gap-2 text-slate-500 font-black text-[10px] uppercase tracking-widest mb-4 opacity-70 hover:opacity-100 transition-opacity"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Back
          </button>
          <div className="flex items-center justify-between">
            <h1 className="text-4xl font-black text-slate-950 leading-none tracking-tighter">
              Saved <span className="text-primary tracking-tighter">Address.</span>
            </h1>
            <motion.button 
              onClick={openAddModal}
              whileHover={{ scale: 1.1, rotate: 180 }}
              whileTap={{ scale: 0.9 }}
              className="w-14 h-14 bg-black text-white rounded-2xl flex items-center justify-center shadow-2xl shadow-black/10"
            >
              <span className="material-symbols-outlined text-3xl">add</span>
            </motion.button>
          </div>
        </motion.header>

        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-4"
        >
          <AnimatePresence mode="popLayout">
            {addresses.map((addr) => (
              <motion.div 
                key={addr._id || addr.id || addr.address}
                layout
                variants={itemVariants}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white p-6 rounded-[2.5rem] border border-slate-100 transition-all group relative overflow-hidden flex flex-col justify-between min-h-[160px] shadow-sm text-left"
              >
                <div className="flex justify-between items-start relative z-10">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-slate-50 text-slate-400">
                      <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                        store
                      </span>
                    </div>
                    <div>
                      <p className="font-black text-xl text-slate-950 tracking-tight leading-none mb-1">{addr.type}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <motion.button 
                      whileTap={{ scale: 0.9 }}
                      onClick={() => openEditModal(addr)}
                      className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-primary transition-colors bg-slate-50 rounded-xl"
                    >
                      <span className="material-symbols-outlined text-lg">edit</span>
                    </motion.button>
                    <motion.button 
                      whileTap={{ scale: 0.9 }}
                      onClick={() => deleteAddress(addr._id || addr.id)}
                      className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors bg-slate-50 rounded-xl"
                    >
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </motion.button>
                  </div>
                </div>

                <div className="mt-4 relative z-10 flex justify-between items-end gap-4">
                  <p className="text-sm font-bold text-slate-600 opacity-80 leading-tight">
                    {addr.address}
                    {addr.city && !addr.address.includes(addr.city) ? `, ${addr.city}` : ''}
                    {addr.pincode && !addr.address.includes(addr.pincode) ? ` - ${addr.pincode}` : ''}
                  </p>
                </div>

                <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-slate-500/5 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>

        {addresses.length === 0 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-24 flex flex-col items-center text-center opacity-30"
          >
            <span className="material-symbols-outlined text-7xl mb-4">wrong_location</span>
            <p className="font-black text-[10px] uppercase tracking-widest">No Address Saved</p>
          </motion.div>
        )}
      </main>

      {/* Structured Address Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center pointer-events-none md:items-center md:px-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="absolute inset-0 bg-black/60 backdrop-blur-md pointer-events-auto"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="bg-white w-full max-w-lg rounded-t-[3rem] p-8 pb-10 relative z-10 shadow-2xl pointer-events-auto md:rounded-[3rem] h-[90dvh] overflow-y-auto hide-scrollbar text-left"
            >
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-8 md:hidden" />
              
              <h3 className="text-4xl font-black tracking-tighter italic uppercase leading-none mb-2">
                {editingAddress ? 'Modify' : 'Locate'} <br/>
                <span className="text-primary tracking-tighter">Address.</span>
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest opacity-60 mb-10 text-center md:text-left">Details for accurate delivery</p>
              
              <div className="space-y-6">
                {/* Google Maps Search Bar */}
                <div className="space-y-1.5 px-1">
                  <p className="text-[9px] font-black uppercase tracking-widest text-primary ml-1">Search Your Location</p>
                  {isLoaded ? (
                    <Autocomplete
                      onLoad={ac => setAutocomplete(ac)}
                      onPlaceChanged={() => {
                        const place = autocomplete.getPlace();
                        if (place.geometry) {
                          const lat = place.geometry.location.lat();
                          const lng = place.geometry.location.lng();
                          
                          // Parse components
                          let city = '';
                          let state = '';
                          let pincode = '';
                          place.address_components.forEach(comp => {
                            if (comp.types.includes('locality')) city = comp.long_name;
                            if (comp.types.includes('administrative_area_level_1')) state = comp.long_name;
                            if (comp.types.includes('postal_code')) pincode = comp.long_name;
                          });

                          setFormData({
                            ...formData,
                            line1: place.name || '',
                            line2: place.formatted_address || '',
                            city,
                            state,
                            pincode,
                            location: { lat, lng }
                          });
                          toast.success('Location detected!');
                        }
                      }}
                    >
                      <input 
                        placeholder="Search for your house/building..."
                        className="w-full bg-slate-900 text-white placeholder:text-white/30 border-none rounded-2xl px-5 py-4 text-xs font-bold outline-none focus:ring-4 focus:ring-primary/20 transition-all shadow-xl" 
                      />
                    </Autocomplete>
                  ) : (
                    <div className="w-full h-14 bg-slate-50 rounded-2xl animate-pulse" />
                  )}
                </div>

                <div className="flex gap-3">
                  {addressTypes.map(type => {
                    const isTaken = !editingAddress && (type === 'Home' || type === 'Office') && addresses.some(a => a.type === type);
                    
                    return (
                      <button
                        key={type}
                        disabled={isTaken}
                        onClick={() => setNewType(type)}
                        className={`flex-1 py-4 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all ${
                          newType === type 
                            ? 'bg-black text-white shadow-xl shadow-black/20' 
                            : isTaken 
                              ? 'bg-slate-50 text-slate-200 border border-slate-100 cursor-not-allowed opacity-50' 
                              : 'bg-slate-50 text-slate-400 border border-black/5 hover:border-primary/30'
                        }`}
                      >
                        <div className="flex flex-col items-center gap-1">
                          {isTaken && <span className="material-symbols-outlined text-[10px]">lock</span>}
                          {type}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <AddressInput label="Address Line 1" placeholder="Flat/House No, Building Name" value={formData.line1} onChange={(v) => handleInputChange('line1', v)} />
                  <AddressInput label="Address Line 2" placeholder="Street, Area Name" value={formData.line2} onChange={(v) => handleInputChange('line2', v)} />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <AddressInput label="Floor / Apt" placeholder="e.g. 4th Floor" value={formData.floor} onChange={(v) => handleInputChange('floor', v)} />
                    <AddressInput label="Landmark" placeholder="Near Temple/Gym" value={formData.landmark} onChange={(v) => handleInputChange('landmark', v)} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <AddressInput label="Pincode" placeholder="6-digit ZIP" type="number" value={formData.pincode} onChange={(v) => handleInputChange('pincode', v)} />
                    <AddressInput label="City" placeholder="City Name" value={formData.city} onChange={(v) => handleInputChange('city', v)} />
                  </div>

                  <AddressInput label="State" placeholder="State Name" value={formData.state} onChange={(v) => handleInputChange('state', v)} />
                </div>

                <button 
                  onClick={handleSaveAddress}
                  className="w-full bg-black text-white py-5 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest shadow-xl shadow-black/20 hover:shadow-black/30 transition-all active:scale-[0.98] mt-2"
                >
                  {editingAddress ? 'Continue Updates' : 'Save Address'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const AddressInput = ({ label, placeholder, value, onChange, type = "text" }) => (
  <div className="space-y-1.5 px-1 text-left">
    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">{label}</p>
    <input 
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-slate-50 border border-black/5 rounded-2xl px-5 py-4 text-xs font-bold outline-none focus:ring-4 focus:ring-primary/10 transition-all"
    />
  </div>
);

export default VendorAddressesPage;
