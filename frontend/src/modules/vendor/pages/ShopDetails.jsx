import { appDialog } from '../../../shared/stores/appDialogStore';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GoogleMap, useLoadScript, Marker, Autocomplete } from '@react-google-maps/api';
import { GOOGLE_MAPS_LOADER_OPTIONS } from '../../../lib/googleMaps';
import { authApi, masterServiceApi, BASE_URL } from '../../../lib/api';
import { toast } from 'react-hot-toast';

const mapContainerStyle = {
    width: '100%',
    height: '100%'
};
const defaultCenter = {
    lat: 28.6139,
    lng: 77.2090 // New Delhi
};

const ShopDetails = () => {
    const navigate = useNavigate();
    const locationState = useLocation();
    const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
    const { phone = (storedUser.phone || '') } = locationState.state || {};

    const [shopName, setShopName] = useState('');
    const [gst, setGst] = useState('');
    const [pincode, setPincode] = useState('');
    const [city, setCity] = useState('');
    const [address, setAddress] = useState('');
    const [location, setLocation] = useState(defaultCenter);
    const [masterServices, setMasterServices] = useState([]);
    const [selectedServices, setSelectedServices] = useState([]); // [{id}]
    const [pricingMap, setPricingMap] = useState({});
    const [bankDetails, setBankDetails] = useState({
        accountHolderName: '',
        accountNumber: '',
        ifscCode: '',
        bankName: ''
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const fetchMaster = async () => {
            try {
                const data = await masterServiceApi.getAll();
                setMasterServices(data);
            } catch (err) {
                console.error('Failed to load master services');
            }
        };
        fetchMaster();
    }, []);

    const vendorDataRaw = localStorage.getItem('vendorData') || localStorage.getItem('user') || localStorage.getItem('userData') || '{}';
    const vendorData = JSON.parse(vendorDataRaw);
    
    // Smart ID Extraction: Check root, then check nested .user object
    const vendorId = vendorData._id || vendorData.id || vendorData.user?._id || vendorData.user?.id;
    
    // Diagnostic log to see what exactly is in localStorage
    console.log('📦 [DEBUG] ShopDetails Identity Context:', { 
        vendorId, 
        hasVendorData: !!localStorage.getItem('vendorData'),
        hasUser: !!localStorage.getItem('user'),
        dataKeys: Object.keys(vendorData)
    });

    const isProfileComplete = vendorData.isProfileComplete || vendorData.user?.isProfileComplete || storedUser.isProfileComplete;
    const isEditing = locationState.state?.isEditing || !!isProfileComplete;

    const toggleService = (service) => {
        setSelectedServices(prev => {
            const exists = prev.find(s => s.id === service._id);
            if (exists) return prev.filter(s => s.id !== service._id);
            return [...prev, { 
                id: service._id, 
                name: service.name, 
                icon: service.icon,
                status: 'pending'
            }];
        });
    };

    useEffect(() => {
        if (location && location.lat && location.lng) {
            const fetchPricing = async () => {
                try {
                    const geoRes = await fetch(`${BASE_URL}/geofence/check-availability?lat=${location.lat}&lng=${location.lng}`);
                    if (geoRes.ok) {
                        const geoData = await geoRes.json();
                        if (geoData.available && geoData.areaId) {
                            const pricingRes = await fetch(`${BASE_URL}/master-pricing?fenceId=${geoData.areaId}&limit=10000`);
                            if (pricingRes.ok) {
                                const pData = await pricingRes.json();
                                const pMap = {};
                                (pData.data || []).forEach(item => {
                                    if (item.serviceId) {
                                        pMap[item.serviceId._id] = {
                                            areaMultiplier: item.areaMultiplier || 1,
                                            surgeMultiplier: item.surgeMultiplier || 1,
                                            heritageMultiplier: item.heritageMultiplier || 1
                                        };
                                    }
                                });
                                setPricingMap(pMap);
                            }
                        } else {
                            setPricingMap({});
                        }
                    }
                } catch (e) {
                    console.error('Error fetching zone pricing', e);
                }
            };
            fetchPricing();
        }
    }, [location.lat, location.lng]);

    useEffect(() => {
        if (vendorId) {
            const loadProfile = async () => {
                try {
                    const profile = await authApi.getProfile(vendorId);
                    
                    // Pre-populate with existing data: Prefer shopDetails, fallback to root profile
                    if (profile.shopDetails) {
                        setShopName(profile.shopDetails.name || profile.displayName || '');
                        setAddress(profile.shopDetails.address || profile.address || '');
                        setCity(profile.shopDetails.city || '');
                        setPincode(profile.shopDetails.pincode || '');
                        setGst(profile.shopDetails.gst || '');
                        if (profile.location?.lat) setLocation(profile.location);
                        
                        // Map existing services back
                        if (profile.shopDetails.services && Array.isArray(profile.shopDetails.services)) {
                            setSelectedServices(profile.shopDetails.services.map(s => ({
                                id: s.id,
                                vendorRate: s.vendorRate,
                                normalTime: s.normalTime || '2-3 Days',
                                expressTime: s.expressTime || '24 Hours',
                                name: s.name,
                                icon: s.icon,
                                status: s.status || 'pending',
                                rejectionReason: s.rejectionReason || ''
                            })));
                        }
                    } else {
                        // Fallback to basic user info for new vendors
                        setShopName(profile.displayName || '');
                        setAddress(profile.address || '');
                        if (profile.location?.lat) setLocation(profile.location);
                    }

                    if (profile.bankDetails) {
                        setBankDetails({
                            accountHolderName: profile.bankDetails.accountHolderName || '',
                            accountNumber: profile.bankDetails.accountNumber || '',
                            ifscCode: profile.bankDetails.ifscCode || '',
                            bankName: profile.bankDetails.bankName || ''
                        });
                    }
                } catch (err) {
                    console.error('Error loading profile:', err);
                }
            };
            loadProfile();
        }
    }, [isEditing, vendorId]);

    const autocompleteRef = useRef(null);
    const mapRef = useRef(null);

    const { isLoaded, loadError } = useLoadScript(GOOGLE_MAPS_LOADER_OPTIONS);

    const reverseGeocode = useCallback((lat, lng) => {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
            if (status === 'OK' && results[0]) {
                setAddress(results[0].formatted_address);
                
                // Extract Pincode and City
                const addressComponents = results[0].address_components;
                const pin = addressComponents.find(c => c.types.includes('postal_code'))?.long_name;
                const cit = addressComponents.find(c => c.types.includes('locality'))?.long_name;
                
                if (pin) setPincode(pin);
                if (cit) setCity(cit);
            }
        });
    }, []);

    const onPlaceSelected = () => {
        const place = autocompleteRef.current.getPlace();
        if (place.geometry) {
            const newPos = {
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng()
            };
            setLocation(newPos);
            setAddress(place.formatted_address);
            if (mapRef.current) {
                mapRef.current.panTo(newPos);
            }
        }
    };

    const onMarkerDragEnd = (e) => {
        const newPos = {
            lat: e.latLng.lat(),
            lng: e.latLng.lng()
        };
        setLocation(newPos);
        reverseGeocode(newPos.lat, newPos.lng);
    };

    const handleNext = async () => {
        console.log('🚀 [DEBUG] handleNext clicked', { vendorId, isEditing, shopName, address, pincode });
        
        if (!vendorId) {
            console.error('❌ [DEBUG] vendorId is MISSING');
            toast.error('Session expired or Invalid User. Please login again.');
            return;
        }
        if (!shopName) return await appDialog.alert('Please enter shop name');
        if (!address) return await appDialog.alert('Please provide shop address');
        if (!pincode) return await appDialog.alert('Please provide area pincode');

        if (isEditing) {
            console.log('📝 [DEBUG] isEditing is TRUE - Attempting Profile Update API call...');
            try {
                setSaving(true);
                const updated = await authApi.updateProfile(vendorId, {
                    shopDetails: {
                        name: shopName,
                        address: address,
                        pincode: pincode,
                        city: city,
                        gst: gst,
                        services: selectedServices
                    },
                    bankDetails: bankDetails,
                    location: location
                });
                // Sync with localStorage
                if (updated && updated._id) {
                    localStorage.setItem('vendorData', JSON.stringify(updated));
                    localStorage.setItem('user', JSON.stringify(updated));
                    console.log('✅ [DEBUG] LocalStorage synced with updated profile:', updated.shopDetails?.pincode);
                }
                toast.success('Shop details updated!');
                navigate('/vendor/profile');
            } catch (err) {
                toast.error('Failed to update: ' + err.message);
            } finally {
                setSaving(false);
            }
            return;
        }

        navigate('/vendor/upload-documents', { 
            state: { 
                phone, 
                shopName, 
                gst, 
                address,
                pincode,
                city,
                location,
                services: selectedServices,
                bankDetails
            } 
        });
    };

    if (loadError) return <div className="p-10 text-center font-bold text-rose-500">Error loading maps. Check API Key.</div>;
    if (!isLoaded) return <div className="p-10 text-center font-black text-primary animate-pulse uppercase tracking-[0.3em]">Igniting Maps...</div>;

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-[#F8FAFC] text-[#1E293B] min-h-screen font-sans"
        >
            {/* Header */}
            <header className="bg-white px-6 py-4 flex items-center justify-between sticky top-0 z-50 border-b border-slate-100">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => navigate(-1)}
                        className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-50 transition-colors"
                    >
                        <span className="material-symbols-outlined text-slate-600">arrow_back</span>
                    </button>
                    <h1 className="text-lg font-bold tracking-tight">Shop Profile</h1>
                </div>
                <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden border-2 border-white shadow-sm">
                    <img 
                        src="https://lh3.googleusercontent.com/a/ACg8ocL_X_X_X_X_X_X_X_X_X_X_X=s96-c" 
                        alt="Profile" 
                        className="w-full h-full object-cover"
                    />
                </div>
            </header>

            <main className="max-w-xl mx-auto px-6 py-8 space-y-8">
                {/* Compact Stepper */}
                <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#3D5AFE] text-white flex items-center justify-center text-sm font-bold">1</div>
                        <span className="text-sm font-bold text-[#3D5AFE]">Shop Details</span>
                    </div>
                    <div className="flex-1 mx-4 h-[2px] bg-slate-200 relative">
                        <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: '50%' }}
                            className="absolute inset-y-0 bg-[#3D5AFE]"
                        />
                    </div>
                    <div className="flex items-center gap-3 opacity-40">
                        <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-sm font-bold">2</div>
                        <span className="text-sm font-medium text-slate-500">Verification</span>
                    </div>
                </div>

                {/* Form Progress Card */}
                <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 space-y-8">
                    <section className="space-y-6">
                        {/* Shop Name */}
                        <div className="space-y-2">
                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">Shop Name</label>
                            <input 
                                type="text"
                                shadow-sm
                                value={shopName}
                                onChange={(e) => setShopName(e.target.value)}
                                placeholder="e.g. Pristine Cleaners"
                                className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl focus:bg-white focus:border-[#3D5AFE]/30 focus:ring-4 focus:ring-[#3D5AFE]/5 outline-none transition-all font-semibold text-slate-800"
                            />
                        </div>

                        {/* GST Number */}
                        <div className="space-y-2">
                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">GST Number (Optional)</label>
                            <input 
                                type="text"
                                value={gst}
                                onChange={(e) => setGst(e.target.value)}
                                placeholder="15-digit GSTIN"
                                className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl focus:bg-white focus:border-[#3D5AFE]/30 focus:ring-4 focus:ring-[#3D5AFE]/5 outline-none transition-all font-semibold text-slate-800"
                            />
                        </div>

                        {/* Pincode & City */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">Pincode</label>
                                <input 
                                    type="text"
                                    value={pincode}
                                    onChange={(e) => setPincode(e.target.value)}
                                    placeholder="452001"
                                    className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl focus:bg-white focus:border-[#3D5AFE]/30 focus:ring-4 focus:ring-[#3D5AFE]/5 outline-none transition-all font-semibold text-slate-800"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">City</label>
                                <input 
                                    type="text"
                                    value={city}
                                    onChange={(e) => setCity(e.target.value)}
                                    placeholder="Indore"
                                    className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl focus:bg-white focus:border-[#3D5AFE]/30 focus:ring-4 focus:ring-[#3D5AFE]/5 outline-none transition-all font-semibold text-slate-800"
                                />
                            </div>
                        </div>

                        {/* Address Section */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between px-1">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Store Location</label>
                                <button 
                                    onClick={() => {
                                        navigator.geolocation.getCurrentPosition((pos) => {
                                            const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                                            setLocation(newPos);
                                            reverseGeocode(newPos.lat, newPos.lng);
                                            mapRef.current?.panTo(newPos);
                                        });
                                    }}
                                    className="text-[#3D5AFE] text-[11px] font-bold uppercase tracking-wider hover:underline flex items-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-sm">my_location</span>
                                    Current
                                </button>
                            </div>
                            
                            <div className="relative group">
                                <div className="w-full h-64 rounded-3xl bg-slate-200 overflow-hidden relative border border-slate-100 shadow-inner">
                                    <Autocomplete
                                        onLoad={(ref) => autocompleteRef.current = ref}
                                        onPlaceChanged={onPlaceSelected}
                                    >
                                        <input 
                                            type="text"
                                            placeholder="Search shop location..."
                                            className="absolute top-4 left-4 right-4 z-10 bg-white/90 backdrop-blur-md border border-slate-200 p-4 rounded-2xl shadow-xl outline-none focus:ring-4 focus:ring-primary/10 font-bold text-sm"
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </Autocomplete>
                                    
                                    <GoogleMap
                                        mapContainerStyle={mapContainerStyle}
                                        center={location}
                                        zoom={15}
                                        onLoad={(map) => mapRef.current = map}
                                        options={{
                                            disableDefaultUI: true,
                                            zoomControl: true,
                                            styles: [
                                                {
                                                    "featureType": "poi",
                                                    "elementType": "labels",
                                                    "stylers": [{ "visibility": "off" }]
                                                }
                                            ]
                                        }}
                                    >
                                        <Marker 
                                            position={location} 
                                            draggable={true}
                                            onDragEnd={onMarkerDragEnd}
                                            animation={window.google.maps.Animation.DROP}
                                        />
                                    </GoogleMap>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">Detailed Address</label>
                                <textarea 
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)}
                                    placeholder="House No, Building, Street, Area..."
                                    rows="3"
                                    className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl focus:bg-white focus:border-[#3D5AFE]/30 focus:ring-4 focus:ring-[#3D5AFE]/5 outline-none transition-all font-semibold text-slate-800 text-sm leading-relaxed resize-none"
                                />
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest px-1 italic">
                                    * You can refine the address manually after pinning on the map.
                                </p>
                            </div>
                        </div>

                        {/* Bank Details Section */}
                        <div className="pt-6 border-t border-slate-50 space-y-6">
                            <div className="flex items-center gap-3 px-1">
                                <div className="w-8 h-8 rounded-xl bg-[#3D5AFE]/10 flex items-center justify-center text-[#3D5AFE]">
                                    <span className="material-symbols-outlined text-sm">account_balance</span>
                                </div>
                                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Bank Settlement Info</label>
                            </div>
                            
                            <div className="grid grid-cols-1 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1">Account Holder Name</label>
                                    <input 
                                        type="text"
                                        value={bankDetails.accountHolderName}
                                        onChange={(e) => setBankDetails({...bankDetails, accountHolderName: e.target.value})}
                                        placeholder="Full name as per bank records"
                                        className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl focus:bg-white focus:border-[#3D5AFE]/30 focus:ring-4 focus:ring-[#3D5AFE]/5 outline-none transition-all font-semibold text-slate-800 text-sm"
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1">Account Number</label>
                                        <input 
                                            type="text"
                                            value={bankDetails.accountNumber}
                                            onChange={(e) => setBankDetails({...bankDetails, accountNumber: e.target.value})}
                                            placeholder="Bank account number"
                                            className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl focus:bg-white focus:border-[#3D5AFE]/30 focus:ring-4 focus:ring-[#3D5AFE]/5 outline-none transition-all font-semibold text-slate-800 text-sm"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1">IFSC Code</label>
                                        <input 
                                            type="text"
                                            value={bankDetails.ifscCode}
                                            onChange={(e) => setBankDetails({...bankDetails, ifscCode: e.target.value.toUpperCase()})}
                                            placeholder="e.g. SBIN0001234"
                                            className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl focus:bg-white focus:border-[#3D5AFE]/30 focus:ring-4 focus:ring-[#3D5AFE]/5 outline-none transition-all font-semibold text-slate-800 text-sm"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1">Bank Name</label>
                                    <input 
                                        type="text"
                                        value={bankDetails.bankName}
                                        onChange={(e) => setBankDetails({...bankDetails, bankName: e.target.value})}
                                        placeholder="e.g. HDFC Bank, ICICI Bank"
                                        className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl focus:bg-white focus:border-[#3D5AFE]/30 focus:ring-4 focus:ring-[#3D5AFE]/5 outline-none transition-all font-semibold text-slate-800 text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="space-y-6 pt-4 border-t border-slate-50">
                        <div className="flex items-center justify-between px-1">
                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Services & Pricing</label>
                            <span className="text-[10px] font-black text-primary bg-primary/5 px-3 py-1 rounded-full uppercase tracking-tighter">Set Custom Rates</span>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                            {masterServices.map((service) => {
                                const selected = selectedServices.find(s => s.id === service._id);
                                return (
                                    <div 
                                        key={service._id}
                                        className={`group relative p-5 rounded-3xl border transition-all ${
                                            selected?.status === 'rejected' ? 'border-rose-200 bg-rose-50/30' :
                                            selected?.status === 'approved' ? 'border-emerald-200 bg-emerald-50/20' :
                                            selected ? 'bg-primary/5 border-primary/20 shadow-md shadow-primary/5' : 
                                            'bg-white border-slate-100'
                                        }`}
                                    >
                                        <div className="flex items-center gap-5">
                                            <button 
                                                onClick={() => toggleService(service)}
                                                className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                                                    selected?.status === 'rejected' ? 'bg-rose-500 text-white' :
                                                    selected?.status === 'approved' ? 'bg-emerald-500 text-white' :
                                                    selected ? 'bg-primary text-white shadow-lg' : 
                                                    'bg-slate-50 text-slate-400'
                                                }`}
                                            >
                                                <span className="material-symbols-outlined text-2xl">
                                                    {selected?.status === 'approved' ? 'check_circle' : 
                                                     selected?.status === 'rejected' ? 'error' : 
                                                     service.icon}
                                                </span>
                                            </button>
                                            
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <h4 className={`font-black text-sm tracking-tight ${selected ? 'text-slate-900' : 'text-slate-500'}`}>{service.name}</h4>
                                                    {selected?.status && (
                                                        <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                                                            selected.status === 'approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                            selected.status === 'rejected' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                                            'bg-amber-50 text-amber-600 border-amber-100'
                                                        }`}>
                                                            {selected.status}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex flex-col gap-1 mt-2">
                                                    <div className="flex justify-between items-center bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100">
                                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Normal (Essential):</span>
                                                        <span className="text-[11px] font-black text-slate-700">₹{Math.round((service.basePrice || 0) * (pricingMap[service._id]?.areaMultiplier || 1))}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100">
                                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Express (Essential):</span>
                                                        <span className="text-[11px] font-black text-slate-700">₹{Math.round((service.basePrice || 0) * (pricingMap[service._id]?.areaMultiplier || 1) * (pricingMap[service._id]?.surgeMultiplier || 1))}</span>
                                                    </div>
                                                </div>
                                                
                                                {selected?.status === 'rejected' && selected.rejectionReason && (
                                                    <div className="mt-2 p-2 bg-white rounded-xl border border-rose-100 flex items-start gap-2 shadow-sm">
                                                        <span className="material-symbols-outlined text-rose-500 text-sm mt-0.5">info</span>
                                                        <p className="text-[10px] font-bold text-rose-600 leading-tight italic">
                                                            {selected.rejectionReason}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                            {selected && selected.status === 'approved' && (
                                                <div className="ml-4 w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-inner">
                                                    <span className="material-symbols-outlined text-sm">verified</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                </div>

                {/* Footer Action */}
                <div className="space-y-4">
                    <motion.button 
                        whileTap={{ scale: 0.98 }}
                        onClick={handleNext}
                        disabled={saving}
                        className={`w-full py-5 rounded-2xl bg-[#3D5AFE] text-white font-bold text-lg shadow-xl shadow-[#3D5AFE]/20 flex items-center justify-center gap-3 hover:bg-[#304FFE] transition-all ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <span>{isEditing ? (saving ? 'Saving...' : 'Save Changes') : 'Next Step'}</span>
                        <span className="material-symbols-outlined text-[20px]">{isEditing ? 'check' : 'arrow_forward'}</span>
                    </motion.button>
                    <p className="text-center text-[11px] font-bold text-slate-300 uppercase tracking-[0.2em]">
                        Standard verification: 24h
                    </p>
                </div>
            </main>
        </motion.div>
    );
};

export default ShopDetails;
