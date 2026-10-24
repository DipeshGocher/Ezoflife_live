import { servicePricing } from '../../../lib/servicePricing';
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { authApi, serviceApi, promotionApi, BASE_URL } from '../../../lib/api';
import VendorHeader from '../components/VendorHeader';

const VendorMyServices = () => {
    const navigate = useNavigate();
    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [creating, setCreating] = useState(false);
    const [activeTab, setActiveTab] = useState('active'); // 'active' | 'pending'
    const [showEditServiceModal, setShowEditServiceModal] = useState(false);
    const [editingService, setEditingService] = useState(null);
    const [editingPrice, setEditingPrice] = useState('');
    const [editingActive, setEditingActive] = useState(true);

    const filteredServices = useMemo(() => {
        return services.filter(service => {
            if (activeTab === 'active') {
                return service.approvalStatus === 'Approved' || service.approvalStatus === null || service.approvalStatus === undefined;
            } else {
                return service.approvalStatus === 'Pending' || service.approvalStatus === 'Rejected' || service.approvalStatus === 'Offered';
            }
        });
    }, [services, activeTab]);
    const [newService, setNewService] = useState({
        name: '',
        category: '',
        subCategory: '',
        price: '',
        description: '',
        unit: 'Per Kg'
    });

    const getVendorId = () => {
        const keys = ['user', 'vendorData', 'userData', 'auth_user', 'vendor'];
        for (const key of keys) {
            try {
                const raw = localStorage.getItem(key);
                if (!raw) continue;
                const data = JSON.parse(raw);
                const id = data?._id || data?.id || data?.user?._id || data?.user?.id || data?.uid;
                if (id) return id;
            } catch (e) { continue; }
        }
        return null;
    };

    const vendorId = getVendorId();

    const fetchConfig = async () => {
        if (!vendorId) return;
        try {
            setLoading(true);
            const masterRes = await serviceApi.getAll({ vendorId });
            const profileRes = await authApi.getProfile(vendorId);
            const registrationServices = profileRes.shopDetails?.services || [];
            
            const mappedRegistrationServices = registrationServices.map(s => {
                let mappedStatus = 'Pending';
                if (s.status === 'approved') mappedStatus = 'Approved';
                else if (s.status === 'rejected') mappedStatus = 'Rejected';
                else if (s.status === 'offered') mappedStatus = 'Offered';
                
                return {
                    ...s,
                    approvalStatus: mappedStatus
                };
            });
            
            // 1. Fetch all Master Services to map names, categories, and subcategories
            let masterServicesMap = {};
            try {
                const masterServicesRes = await fetch(`${BASE_URL}/master-services`);
                if (masterServicesRes.ok) {
                    const masterServicesList = await masterServicesRes.json();
                    masterServicesList.forEach(ms => {
                        masterServicesMap[ms._id] = {
                            itemName: ms.itemName,
                            category: ms.categoryId?.mainCategory || 'Laundry',
                            subCategory: ms.categoryId?.subCategory || 'General',
                            icon: ms.icon || 'local_laundry_service',
                            basePrice: ms.basePrice,
                            discountedPrice: ms.discountedPrice,
                            showDiscountPrice: ms.showDiscountPrice
                        };
                    });
                }
            } catch (err) {
                console.error('Error fetching master services for fallback:', err);
            }

            const lat = profileRes?.location?.lat;
            const lng = profileRes?.location?.lng;
            let pricingMap = {};
            let regionalPricing = { areaMultiplier: 1, surgeMultiplier: 1, heritageMultiplier: 1, allowDiscount: false };
            
            if (lat && lng && lat !== 0 && lng !== 0) {
                try {
                    const geoRes = await fetch(`${BASE_URL}/geofence/check-availability?lat=${lat}&lng=${lng}`);
                    if (geoRes.ok) {
                        const geoData = await geoRes.json();
                        if (geoData.available) {
                            regionalPricing = {
                                areaMultiplier: geoData.pricingFactor ?? 1,
                                surgeMultiplier: geoData.expressMultiplier ?? 1,
                                heritageMultiplier: geoData.heritageMultiplier ?? 1,
                                allowDiscount: geoData.allowDiscount !== false
                            };
                        }
                        if (geoData.available && geoData.areaId) {
                            const pricingRes = await fetch(`${BASE_URL}/master-pricing?fenceId=${geoData.areaId}&limit=10000`);
                            if (pricingRes.ok) {
                                const pricingData = await pricingRes.json();
                                (pricingData.data || []).forEach(item => {
                                    if (item.serviceId) {
                                        pricingMap[item.serviceId._id] = {
                                            areaMultiplier: item.areaMultiplier !== undefined ? item.areaMultiplier : 1,
                                            surgeMultiplier: item.surgeMultiplier !== undefined ? item.surgeMultiplier : 1,
                                            heritageMultiplier: item.heritageMultiplier !== undefined ? item.heritageMultiplier : 1,
                                            category: item.categoryId?.mainCategory || '',
                                            subCategory: item.categoryId?.subCategory || '',
                                            itemName: item.serviceId.itemName,
                                            skuId: item.serviceId.skuId,
                                            icon: item.serviceId.icon
                                        };
                                    }
                                });
                            }
                        }
                    }
                } catch (err) {
                    console.error('Error fetching regional pricing configurations:', err);
                }
            }

            const mergedMap = new Map();

            mappedRegistrationServices.forEach(s => {
                const id = s.id || s._id;
                const pricingInfo = { ...(pricingMap[id] || {}), ...regionalPricing };
                const msInfo = masterServicesMap[id] || {};

                const resolvedName = msInfo.itemName || pricingInfo.itemName || s.name || `Service ${id.slice(-4)}`;
                const resolvedCategory = msInfo.category || pricingInfo.category || 'Laundry';
                const resolvedSubCategory = msInfo.subCategory || pricingInfo.subCategory || 'General';
                const resolvedIcon = s.icon || msInfo.icon || pricingInfo.icon || 'local_laundry_service';

                mergedMap.set(id, {
                    ...s,
                    id: id,
                    _id: id,
                    isFromRegistration: true,
                    approvalStatus: s.approvalStatus,
                    active: s.active ?? true,
                    basePrice: msInfo.basePrice || s.basePrice || s.vendorRate || 0,
                    discountedPrice: msInfo.discountedPrice ?? s.discountedPrice,
                    showDiscountPrice: msInfo.showDiscountPrice ?? s.showDiscountPrice,
                    name: resolvedName,
                    category: resolvedCategory,
                    subCategory: resolvedSubCategory,
                    icon: resolvedIcon,
                    pricingInfo
                });
            });

            masterRes.forEach(s => {
                const id = s._id || s.id;
                const pricingInfo = { ...(pricingMap[id] || {}), ...regionalPricing };
                const msInfo = masterServicesMap[id] || {};

                const resolvedName = s.name || msInfo.itemName || pricingInfo.itemName || `Service ${id.slice(-4)}`;
                const resolvedCategory = s.category || msInfo.category || pricingInfo.category || 'Laundry';
                const resolvedSubCategory = s.subCategory || msInfo.subCategory || pricingInfo.subCategory || 'General';
                const resolvedIcon = s.icon || msInfo.icon || pricingInfo.icon || 'local_laundry_service';

                mergedMap.set(id, {
                    ...s,
                    id: id,
                    _id: id,
                    isFromRegistration: false,
                    approvalStatus: s.approvalStatus || 'Pending',
                    adminMessage: s.adminMessage || '',
                    active: s.status === 'Active',
                    basePrice: msInfo.basePrice || s.basePrice || 0,
                    discountedPrice: msInfo.discountedPrice ?? s.discountedPrice,
                    showDiscountPrice: msInfo.showDiscountPrice ?? s.showDiscountPrice,
                    name: resolvedName,
                    category: resolvedCategory,
                    subCategory: resolvedSubCategory,
                    icon: resolvedIcon,
                    pricingInfo
                });
            });
            
            setServices(Array.from(mergedMap.values()));
        } catch (error) {
            console.error('Error fetching services:', error);
        } finally {
            setTimeout(() => {
                setLoading(false);
            }, 5000);
        }
    };

    useEffect(() => {
        document.title = 'Manage My Services | Spinzyt';
        if (vendorId) {
            fetchConfig();
        }
    }, [vendorId]);

    const toggleServiceDirectly = async (serviceId) => {
        const targetService = services.find(s => (s._id || s.id) === serviceId);
        if (!targetService) return;

        if (targetService.approvalStatus !== 'Approved' && targetService.approvalStatus !== undefined) {
            if (targetService.approvalStatus === 'Rejected') {
                toast.error('This service was rejected by the Admin.');
            } else {
                toast.error('This service is waiting for Admin approval.');
            }
            return;
        }

        const newActiveState = !targetService.active;

        setServices(prev => prev.map(item => {
            if ((item._id || item.id) === serviceId) {
                return { ...item, active: newActiveState, status: newActiveState ? 'Active' : 'Inactive' };
            }
            return item;
        }));

        try {
            if (!vendorId) return;
            const profile = await authApi.getProfile(vendorId);
            let currentServices = profile.shopDetails?.services || [];
            
            const sId = serviceId;
            const existingIdx = currentServices.findIndex(s => (s.id === sId || s._id === sId));

            if (existingIdx !== -1) {
                currentServices[existingIdx].active = newActiveState;
            } else {
                currentServices.push({
                    id: sId,
                    name: targetService.name,
                    vendorRate: Number(targetService.basePrice),
                    adminRate: Number(targetService.basePrice),
                    status: 'approved',
                    icon: targetService.icon,
                    active: newActiveState,
                    normalTime: '',
                    expressTime: ''
                });
            }

            const updatedShopDetails = {
                ...(profile.shopDetails || {}),
                services: currentServices
            };

            await authApi.updateProfile(vendorId, { shopDetails: updatedShopDetails });

            try {
                await serviceApi.update(sId, { 
                    status: newActiveState ? 'Active' : 'Inactive',
                    basePrice: Number(targetService.basePrice || 0)
                });
            } catch (e) {
                console.log('Skipped direct Service.update for master service');
            }

            toast.success(`Service "${targetService.name}" is now ${newActiveState ? 'Active' : 'Inactive'}!`, {
                icon: newActiveState ? '⚡' : '⏸️'
            });
        } catch (err) {
            console.error('Toggle service error:', err);
            toast.error('Failed to update service status');
            setServices(prev => prev.map(item => {
                if ((item._id || item.id) === serviceId) {
                    return { ...item, active: !newActiveState };
                }
                return item;
            }));
        }
    };

    const handleOpenServiceEditModal = (service) => {
        setEditingService(service);
        setEditingPrice(service.basePrice || 0);
        setEditingActive(service.active ?? true);
        setShowEditServiceModal(true);
    };

    const handleSaveServiceEdit = () => {
        if (!editingService) return;
        const targetId = editingService._id || editingService.id;

        setServices(prev => prev.map(item => {
            if ((item._id || item.id) === targetId) {
                const isApproved = item.approvalStatus === 'Approved';
                return { 
                    ...item, 
                    basePrice: Number(editingPrice),
                    active: editingActive,
                    status: isApproved ? item.status : 'offered',
                    approvalStatus: isApproved ? item.approvalStatus : 'Offered'
                };
            }
            return item;
        }));

        setShowEditServiceModal(false);
        toast.success(`Updated locally! Click "Save" in the header to save changes to the database.`, {
            icon: '📝',
            duration: 4000
        });
    };

    const handleAcceptService = async (serviceId) => {
        if (!vendorId) return;
        try {
            setLoading(true);
            const profile = await authApi.getProfile(vendorId);
            let currentServices = profile.shopDetails?.services || [];
            
            const idx = currentServices.findIndex(s => (s.id === serviceId || s._id === serviceId));
            if (idx !== -1) {
                currentServices[idx].status = 'pending'; // Change status to pending admin approval
                currentServices[idx].active = false;
            } else {
                const targetService = services.find(s => (s._id || s.id) === serviceId);
                if (targetService) {
                    currentServices.push({
                        id: serviceId,
                        name: targetService.name,
                        vendorRate: Number(targetService.basePrice),
                        adminRate: Number(targetService.basePrice),
                        status: 'pending',
                        icon: targetService.icon,
                        active: false,
                        normalTime: '',
                        expressTime: ''
                    });
                }
            }
            
            const updatedShopDetails = {
                ...(profile.shopDetails || {}),
                services: currentServices
            };

            await authApi.updateProfile(vendorId, { shopDetails: updatedShopDetails });
            toast.success('Service request submitted to Admin for approval!');
            fetchConfig();
        } catch (error) {
            console.error('Accept Service Error:', error);
            toast.error('Failed to submit service request');
            setLoading(false);
        }
    };

    const handleCreateService = async (e) => {
        e.preventDefault();
        if (!newService.name || !newService.category || !newService.subCategory || !newService.price) {
            toast.error('Please fill all required fields');
            return;
        }

        try {
            setCreating(true);
            await serviceApi.create({
                name: newService.name,
                category: newService.category,
                subCategory: newService.subCategory,
                basePrice: Number(newService.price),
                description: newService.description,
                unit: newService.unit,
                vendorId: vendorId,
                status: 'Inactive',
                approvalStatus: 'Pending',
                isMaster: false
            });

            toast.success('Custom service created and submitted to Admin for approval!');
            setShowAddModal(false);
            setNewService({
                name: '',
                category: '',
                subCategory: '',
                price: '',
                description: '',
                unit: 'Per Kg'
            });
            fetchConfig(); // Refresh services
        } catch (err) {
            console.error('Failed to create custom service:', err);
            toast.error('Error creating custom service');
        } finally {
            setCreating(false);
        }
    };

    const updatePrice = (serviceId, price) => {
        setServices(prev => prev.map(item => {
            if ((item._id || item.id) === serviceId) {
                return { ...item, basePrice: Number(price) };
            }
            return item;
        }));
    };

    const handleGlobalSave = async () => {
        if (!vendorId) return;
        
        try {
            setLoading(true);
            const profile = await authApi.getProfile(vendorId);
            
            let currentServices = profile.shopDetails?.services || [];
            const customServiceUpdates = [];

            services.forEach(targetService => {
                const sId = targetService._id || targetService.id;
                const existingIdx = currentServices.findIndex(s => (s.id === sId || s._id === sId));
                
                const updatedServiceForProfile = {
                    id: sId,
                    name: targetService.name,
                    vendorRate: Number(targetService.basePrice),
                    adminRate: Number(targetService.basePrice),
                    status: targetService.approvalStatus === 'Approved' ? 'approved' : 
                            targetService.approvalStatus === 'Rejected' ? 'rejected' :
                            targetService.approvalStatus === 'Offered' ? 'offered' : 'pending',
                    icon: targetService.icon,
                    active: targetService.active,
                    normalTime: targetService.normalTime || '',
                    expressTime: targetService.expressTime || ''
                };

                if (existingIdx !== -1) {
                    currentServices[existingIdx] = updatedServiceForProfile;
                } else {
                    currentServices.push(updatedServiceForProfile);
                }

                if (targetService.vendorId || targetService.isMaster === false) {
                    customServiceUpdates.push(
                        serviceApi.update(sId, { 
                            status: targetService.active ? 'Active' : 'Inactive',
                            basePrice: Number(targetService.basePrice)
                        })
                    );
                }
            });

            const updatedShopDetails = {
                ...(profile.shopDetails || {}),
                services: currentServices
            };

            await authApi.updateProfile(vendorId, { shopDetails: updatedShopDetails });

            if (customServiceUpdates.length > 0) {
                await Promise.all(customServiceUpdates);
            }

            toast.success('Services updated successfully!');
            setEditMode(false);
            fetchConfig();
        } catch (error) {
            console.error('Update Services Error:', error);
            toast.error('Failed to update services');
        } finally {
            setLoading(false);
        }
    };

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-slate-900 min-h-screen pb-40 font-sans"
        >
            <main className="max-w-6xl mx-auto px-6 pt-2 space-y-6">
                {loading ? (
                    <>
                        <header className="flex items-center justify-between">
                            <div className="w-10 h-10 rounded-full bg-slate-200 animate-pulse"></div>
                            <div className="flex items-center gap-3">
                                <div className="w-[80px] h-10 rounded-xl bg-slate-200 animate-pulse"></div>
                                <div className="w-[80px] h-10 rounded-xl bg-slate-200 animate-pulse"></div>
                            </div>
                        </header>
                        <section className="space-y-6">
                            <p className="text-xs font-medium text-slate-500">
                                Base price is the catalogue rate. Tier prices include applicable discounts and your shop region’s multipliers, before GST and checkout fees.
                            </p>
                            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse min-w-[950px]">
                                        <thead>
                                            <tr className="border-b border-slate-100 bg-slate-50/50">
                                                <th className="p-4 w-28"><div className="h-3 w-16 bg-slate-200 rounded mx-auto"></div></th>
                                                <th className="p-4"><div className="h-3 w-24 bg-slate-200 rounded"></div></th>
                                                <th className="p-4"><div className="h-3 w-20 bg-slate-200 rounded"></div></th>
                                                <th className="p-4"><div className="h-3 w-20 bg-slate-200 rounded"></div></th>
                                                <th className="p-4 w-28"><div className="h-3 w-20 bg-slate-200 rounded"></div></th>
                                                <th className="p-4"><div className="h-3 w-24 bg-slate-200 rounded ml-auto"></div></th>
                                                <th className="p-4"><div className="h-3 w-24 bg-slate-200 rounded ml-auto"></div></th>
                                                <th className="p-4"><div className="h-3 w-24 bg-slate-200 rounded ml-auto"></div></th>
                                                <th className="p-4"><div className="h-3 w-24 bg-slate-200 rounded ml-auto"></div></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {[...Array(6)].map((_, i) => (
                                                <tr key={i} className="animate-pulse">
                                                    <td className="p-4">
                                                        <div className="w-10 h-5 rounded-full bg-slate-200 mx-auto"></div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="flex flex-col gap-2">
                                                            <div className="w-32 h-3 bg-slate-200 rounded"></div>
                                                            <div className="w-20 h-2 bg-slate-100 rounded"></div>
                                                        </div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="w-24 h-3 bg-slate-100 rounded"></div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="w-24 h-3 bg-slate-100 rounded"></div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="w-full h-8 bg-slate-100 rounded-xl"></div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="w-12 h-3 bg-slate-100 rounded ml-auto"></div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="w-12 h-3 bg-slate-100 rounded ml-auto"></div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="w-12 h-3 bg-slate-100 rounded ml-auto"></div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="w-12 h-3 bg-slate-100 rounded ml-auto"></div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </section>
                    </>
                ) : (
                    <>
                        <header className="flex items-center justify-between">
                            <button onClick={() => navigate(-1)} className="flex items-center justify-center w-10 h-10 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-900 hover:border-slate-900 shadow-sm transition-all">
                                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                            </button>
                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={() => setShowAddModal(true)}
                                    className="px-4 py-2.5 bg-slate-900 text-white rounded-xl flex items-center justify-center min-w-[80px] shadow-md shadow-slate-900/20 hover:scale-105 transition-all text-[10px] font-black uppercase tracking-widest"
                                >
                                    Create
                                </button>
                                <button 
                                    onClick={() => editMode ? handleGlobalSave() : setEditMode(true)}
                                    className="px-4 py-2.5 bg-slate-900 text-white rounded-xl flex items-center justify-center min-w-[80px] shadow-md shadow-slate-900/20 hover:scale-105 transition-all text-[10px] font-black uppercase tracking-widest"
                                >
                                    {editMode ? 'Save' : 'Edit'}
                                </button>
                            </div>
                        </header>

                        {/* Tabs */}
                        <div className="flex gap-6 border-b border-slate-100 pb-0.5 mt-2">
                            <button
                                onClick={() => {
                                    setActiveTab('active');
                                    setEditMode(false);
                                }}
                                className={`text-xs font-black uppercase tracking-widest pb-3 px-1 relative transition-colors ${
                                    activeTab === 'active' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-800'
                                }`}
                            >
                                Active Services
                                {activeTab === 'active' && (
                                    <motion.div layoutId="activeTabUnderline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-900" />
                                )}
                            </button>
                            <button
                                onClick={() => {
                                    setActiveTab('pending');
                                    setEditMode(false);
                                }}
                                className={`text-xs font-black uppercase tracking-widest pb-3 px-1 relative transition-colors ${
                                    activeTab === 'pending' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-800'
                                }`}
                            >
                                Service Requests
                                {activeTab === 'pending' && (
                                    <motion.div layoutId="activeTabUnderline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-900" />
                                )}
                            </button>
                        </div>
 
                        <section className="space-y-6">
                            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse min-w-[950px]">
                                        <thead>
                                            <tr className="border-b border-slate-100 bg-slate-50/50">
                                                {editMode && (
                                                    <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400 text-center w-20">Edit</th>
                                                )}
                                                <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400 text-center w-28">Status</th>
                                                <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400">Service Name</th>
                                                <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400">Category</th>
                                                <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400">Sub Category</th>
                                                <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400 w-28">Base Price (₹)</th>
                                                <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right">Essential Normal</th>
                                                <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right">Essential Express</th>
                                                <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right">Heritage Normal</th>
                                                <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right">Heritage Express</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {filteredServices.map((service) => {
                                                const pricingInfo = service.pricingInfo || {};
                                                const areaMultiplier = pricingInfo.areaMultiplier !== undefined ? pricingInfo.areaMultiplier : 1;
                                                const surgeMultiplier = pricingInfo.surgeMultiplier !== undefined ? pricingInfo.surgeMultiplier : 1;
                                                const heritageMultiplier = pricingInfo.heritageMultiplier !== undefined ? pricingInfo.heritageMultiplier : 1;
 
                                                const priceOptions = { pricingFactor: areaMultiplier,
                                                    allowDiscount: pricingInfo.allowDiscount, expressMultiplier: surgeMultiplier, heritageMultiplier };
                                                const baseNormal = servicePricing(service, priceOptions).price;
                                                const baseExpress = servicePricing(service, { ...priceOptions, isExpress: true }).price;
                                                const heritageNormal = servicePricing(service, { ...priceOptions, isHeritage: true }).price;
                                                const heritageExpress = servicePricing(service, { ...priceOptions, isHeritage: true, isExpress: true }).price;

                                                const isPending = service.approvalStatus === 'Pending';
                                                const isRejected = service.approvalStatus === 'Rejected';
 
                                                return (
                                                    <tr key={service.id || service._id} className="hover:bg-slate-50/50 transition-colors">
                                                        {editMode && (
                                                            <td className="p-4 text-center">
                                                                <button 
                                                                    onClick={() => handleOpenServiceEditModal(service)}
                                                                    className="px-3 py-1.5 bg-slate-900 text-white rounded-xl flex items-center justify-center min-w-[60px] shadow-sm hover:scale-105 active:scale-95 transition-all text-[8px] font-black uppercase tracking-widest mx-auto"
                                                                >
                                                                    Edit
                                                                </button>
                                                            </td>
                                                        )}
                                                        <td className="p-4">
                                                            <div className="flex items-center justify-center gap-2">
                                                                {isPending ? (
                                                                    <span className="text-[8px] font-black text-amber-500 bg-amber-50 px-2 py-1 rounded uppercase tracking-wider">Awaiting Approval</span>
                                                                ) : isRejected ? (
                                                                    <span className="text-[8px] font-black text-rose-500 bg-rose-50 px-2 py-1 rounded uppercase tracking-wider border border-rose-100">Rejected</span>
                                                                ) : service.approvalStatus === 'Offered' ? (
                                                                    <button 
                                                                        onClick={() => handleAcceptService(service._id || service.id)}
                                                                        className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-[8px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-sm shadow-emerald-600/10"
                                                                    >
                                                                        Accept
                                                                    </button>
                                                                ) : (
                                                                    <button 
                                                                        type="button"
                                                                        onClick={() => toggleServiceDirectly(service._id || service.id)}
                                                                        className={`w-10 h-5 rounded-full relative transition-all duration-300 opacity-90 cursor-pointer hover:scale-105 active:scale-95 ${service.active ? 'bg-slate-900' : 'bg-slate-200'}`}
                                                                        title={service.active ? "Click to deactivate" : "Click to activate"}
                                                                    >
                                                                        <motion.div 
                                                                            animate={{ x: service.active ? 22 : 2 }}
                                                                            className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow"
                                                                        />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="flex flex-col gap-1">
                                                                <div className="flex items-center gap-3">
                                                                    <span className="text-xs font-black text-slate-900 uppercase tracking-tight">{service.name}</span>
                                                                </div>
                                                                {service.adminMessage && (
                                                                    <div className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-sm w-fit mt-1 border ${
                                                                        isRejected 
                                                                            ? 'bg-rose-50 text-rose-500 border-rose-100' 
                                                                            : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                                                    }`}>
                                                                        Msg: {service.adminMessage}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wide">
                                                            {service.category}
                                                        </td>
                                                        <td className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wide">
                                                            {service.subCategory}
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="text-xs font-black text-slate-900 bg-slate-50 px-3 py-2 rounded-xl inline-block border border-slate-100">
                                                                ₹{service.basePrice || 0}
                                                            </div>
                                                        </td>
                                                        <td className="p-4 text-xs font-bold text-slate-700 text-right">₹{baseNormal}</td>
                                                        <td className="p-4 text-xs font-bold text-slate-700 text-right">₹{baseExpress}</td>
                                                        <td className="p-4 text-xs font-bold text-slate-700 text-right">₹{heritageNormal}</td>
                                                        <td className="p-4 text-xs font-bold text-slate-700 text-right">₹{heritageExpress}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </section>
                    </>
                )}

            </main>

            <AnimatePresence>
                {showAddModal && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
                    >
                        <motion.div 
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            className="bg-white text-slate-900 rounded-[2.5rem] p-8 max-w-lg w-full shadow-2xl border border-slate-100 flex flex-col space-y-6 overflow-hidden relative"
                        >
                            {/* Close Button */}
                            <button 
                                onClick={() => setShowAddModal(false)}
                                className="absolute right-6 top-6 w-10 h-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-900 transition-colors hover:scale-105 active:scale-95"
                            >
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>

                            <div className="space-y-1">
                                <h3 className="text-2xl font-black uppercase tracking-tighter text-slate-950 leading-none">Add Service</h3>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Submit custom service for admin approval</p>
                            </div>

                            <form onSubmit={handleCreateService} className="space-y-4 text-left">
                                {/* Item Name */}
                                <div className="space-y-1.5 text-left">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Item Name</label>
                                    <input 
                                        type="text"
                                        required
                                        value={newService.name}
                                        onChange={e => setNewService({ ...newService, name: e.target.value })}
                                        placeholder="e.g. Premium Silk Coat"
                                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-primary/20 transition-all placeholder:text-slate-300"
                                    />
                                </div>

                                {/* Category & Subcategory Row */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Category</label>
                                        <input 
                                            type="text"
                                            required
                                            value={newService.category}
                                            onChange={e => setNewService({ ...newService, category: e.target.value })}
                                            placeholder="e.g. Dry Cleaning"
                                            className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-primary/20 transition-all placeholder:text-slate-300"
                                        />
                                    </div>
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Sub Category</label>
                                        <input 
                                            type="text"
                                            required
                                            value={newService.subCategory}
                                            onChange={e => setNewService({ ...newService, subCategory: e.target.value })}
                                            placeholder="e.g. Winter Wear"
                                            className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-primary/20 transition-all placeholder:text-slate-300"
                                        />
                                    </div>
                                </div>

                                {/* Price & Unit Row */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Price (₹)</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-300">₹</span>
                                            <input 
                                                type="number"
                                                required
                                                min="0"
                                                value={newService.price}
                                                onChange={e => setNewService({ ...newService, price: e.target.value })}
                                                placeholder="0.00"
                                                className="w-full pl-8 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-primary/20 transition-all placeholder:text-slate-300"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Unit</label>
                                        <div className="flex bg-slate-50 border border-slate-100 p-1 rounded-2xl gap-1 h-[48px]">
                                            <button 
                                                type="button"
                                                onClick={() => setNewService({ ...newService, unit: 'Per Kg' })}
                                                className={`flex-1 rounded-xl font-bold text-[9px] uppercase tracking-widest transition-all ${newService.unit === 'Per Kg' ? 'bg-primary text-white shadow-sm' : 'text-slate-400'}`}
                                            >
                                                Per Kg
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={() => setNewService({ ...newService, unit: 'Per Piece' })}
                                                className={`flex-1 rounded-xl font-bold text-[9px] uppercase tracking-widest transition-all ${newService.unit === 'Per Piece' ? 'bg-primary text-white shadow-sm' : 'text-slate-400'}`}
                                            >
                                                Per Piece
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Description */}
                                <div className="space-y-1.5 text-left">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Description</label>
                                    <textarea 
                                        rows="2"
                                        value={newService.description}
                                        onChange={e => setNewService({ ...newService, description: e.target.value })}
                                        placeholder="Enter service details, care instructions, etc."
                                        className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-primary/20 transition-all placeholder:text-slate-300 resize-none"
                                    />
                                </div>

                                {/* Submit Button */}
                                <div className="pt-4">
                                    <button 
                                        type="submit"
                                        disabled={creating}
                                        className="w-full py-4 bg-slate-950 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-900 transition-all shadow-xl shadow-slate-950/15 disabled:opacity-50 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95"
                                    >
                                        {creating ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                <span>Submitting...</span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined text-[16px]">add</span>
                                                <span>Create & Submit Service</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showEditServiceModal && editingService && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
                    >
                        <motion.div 
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            className="bg-white text-slate-900 rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl border border-slate-100 flex flex-col space-y-6 overflow-hidden relative"
                        >
                            {/* Close Button */}
                            <button 
                                onClick={() => setShowEditServiceModal(false)}
                                className="absolute right-6 top-6 w-10 h-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-900 transition-colors hover:scale-105 active:scale-95"
                            >
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>

                            <div className="space-y-1">
                                <h3 className="text-2xl font-black uppercase tracking-tighter text-slate-950 leading-none">Edit Service</h3>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Update Price and Status for this service</p>
                            </div>

                            <div className="space-y-4 text-left">
                                {/* Service Info (Readonly) */}
                                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-2">
                                    <div>
                                        <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block">Service Name</label>
                                        <span className="text-xs font-bold text-slate-800">{editingService.name}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block">Category</label>
                                            <span className="text-xs font-bold text-slate-600">{editingService.category}</span>
                                        </div>
                                        <div>
                                            <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block">Sub Category</label>
                                            <span className="text-xs font-bold text-slate-600">{editingService.subCategory}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Price Field */}
                                <div className="space-y-1.5 text-left">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Base Price (₹)</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-300">₹</span>
                                        <input 
                                            type="number"
                                            required
                                            min="0"
                                            value={editingPrice}
                                            onChange={e => setEditingPrice(e.target.value)}
                                            placeholder="0.00"
                                            className="w-full pl-8 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-primary/20 transition-all placeholder:text-slate-300"
                                        />
                                    </div>
                                </div>

                                {/* Status Switch */}
                                {editingService.approvalStatus === 'Approved' && (
                                    <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                                        <div className="space-y-0.5">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">Service Status</span>
                                            <span className="text-xs font-bold text-slate-800">{editingActive ? 'Active' : 'Inactive'}</span>
                                        </div>
                                        <div 
                                            onClick={() => setEditingActive(!editingActive)}
                                            className={`w-12 h-6 rounded-full relative cursor-pointer transition-all duration-300 ${editingActive ? 'bg-slate-900' : 'bg-slate-200'}`}
                                        >
                                            <motion.div 
                                                animate={{ x: editingActive ? 26 : 2 }}
                                                className="absolute top-1 w-4 h-4 rounded-full bg-white shadow"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Save Button */}
                                <div className="pt-4">
                                    <button 
                                        onClick={handleSaveServiceEdit}
                                        className="w-full py-4 bg-slate-950 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-900 transition-all shadow-xl shadow-slate-950/15 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">check</span>
                                        <span>Update Service</span>
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default VendorMyServices;
