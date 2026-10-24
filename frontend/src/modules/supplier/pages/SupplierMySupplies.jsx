import BrandLogo from '../../../shared/components/BrandLogo.jsx';
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { vendorMasterSupplyApi, vendorSupplyCategoryApi, mediaApi, supplierServiceZoneApi } from '../../../lib/api';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

const SupplierMySupplies = () => {
    const navigate = useNavigate();

    // Retrieve logged-in supplier user
    const user = useMemo(() => {
        try {
            return JSON.parse(
                localStorage.getItem('supplierData') || 
                localStorage.getItem('userData') || 
                localStorage.getItem('user') || 
                '{}'
            );
        } catch (e) {
            return {};
        }
    }, []);

    // Suffix-based supplier ID generation
    const supplierCode = useMemo(() => {
        const phone = user.phone || '';
        return `SUP-${phone ? phone.slice(-4) : '001'}`;
    }, [user]);

    const [supplies, setSupplies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editMode, setEditMode] = useState(false);
    const [originalSupplies, setOriginalSupplies] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'active', 'inactive'
    const [selectedSupply, setSelectedSupply] = useState(null);
    const [activeTab, setActiveTab] = useState('catalog'); // 'catalog' | 'requests'
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [editingSupply, setEditingSupply] = useState(null);
    const [categories, setCategories] = useState([]);
    
    // States and helper functions for custom category/subcategory creation
    const [selectedCategoryOption, setSelectedCategoryOption] = useState('');
    const [customCategoryName, setCustomCategoryName] = useState('');
    const [selectedSubCategoryOption, setSelectedSubCategoryOption] = useState('');
    const [customSubCategoryName, setCustomSubCategoryName] = useState('');

    const [adminTemplates, setAdminTemplates] = useState([]);
    const [selectedProductOption, setSelectedProductOption] = useState('');
    const [customProductName, setCustomProductName] = useState('');
    const [zones, setZones] = useState([]);
    const [allSuppliesList, setAllSuppliesList] = useState([]);

    const myZoneName = useMemo(() => {
        const myZoneRecord = zones.find(z => z.supplierId === supplierCode);
        return myZoneRecord ? myZoneRecord.zoneName : '';
    }, [zones, supplierCode]);

    const zoneSupplierIds = useMemo(() => {
        if (!myZoneName) return [];
        return zones
            .filter(z => z.zoneName && z.zoneName.toLowerCase() === myZoneName.toLowerCase())
            .map(z => z.supplierId);
    }, [zones, myZoneName]);

    const zoneProductNames = useMemo(() => {
        if (zoneSupplierIds.length === 0) return [];
        const filtered = allSuppliesList.filter(s => 
            zoneSupplierIds.includes(s.supplierId) && 
            (s.approvalStatus === 'Approved' || !s.approvalStatus) && 
            s.isActive === 'y'
        );
        return Array.from(new Set(filtered.map(s => s.materialName)));
    }, [allSuppliesList, zoneSupplierIds]);

    const uniqueTemplateNames = useMemo(() => {
        const set = new Set();
        const lowerZoneProductNames = zoneProductNames.map(name => name.toLowerCase());
        adminTemplates.forEach(t => {
            if (t.materialName) {
                // Only show templates active in the supplier's zone. Fallback to all if zone is new.
                if (zoneProductNames.length === 0 || lowerZoneProductNames.includes(t.materialName.toLowerCase())) {
                    set.add(t.materialName);
                }
            }
        });
        return Array.from(set).sort();
    }, [adminTemplates, zoneProductNames]);

    const handleProductSelect = (val) => {
        setSelectedProductOption(val);
        if (val && val !== 'Other') {
            const matched = adminTemplates.find(t => t.materialName?.toLowerCase() === val.toLowerCase());
            if (matched) {
                setCreateForm(prev => ({
                    ...prev,
                    materialName: val,
                    brand: matched.brand || 'Generic',
                    hsnCode: matched.hsnCode || '-',
                    gst: matched.gst || 18,
                    quantity: matched.quantity || '-',
                    wholesaleRate: matched.wholesaleRate || 0,
                    costPrice: matched.costPrice || 0,
                    bulkDiscount: matched.bulkDiscount || 0,
                    bulkThreshold: matched.bulkThreshold || 0,
                    movFreeDelivery: matched.movFreeDelivery || 0,
                    deliveryFrequency: matched.deliveryFrequency || '-',
                    description: matched.description || '',
                    images: matched.images || [],
                    isActive: matched.isActive || 'y'
                }));
                setSelectedCategoryOption(matched.categoryId?.mainCategory || 'Generic');
                setSelectedSubCategoryOption(matched.categoryId?.subCategory || 'General');
            }
        } else {
            setCreateForm(prev => ({
                ...prev,
                materialName: '',
                brand: 'Generic',
                hsnCode: '-',
                gst: 18,
                quantity: '-',
                wholesaleRate: 0,
                costPrice: 0,
                bulkDiscount: 0,
                bulkThreshold: 0,
                movFreeDelivery: 0,
                deliveryFrequency: '-',
                description: '',
                images: [],
                isActive: 'y'
            }));
            setSelectedCategoryOption('');
            setCustomCategoryName('');
            setSelectedSubCategoryOption('');
            setCustomSubCategoryName('');
            setCustomProductName('');
        }
    };

    const uniqueMainCategories = useMemo(() => {
        const set = new Set();
        categories.forEach(c => {
            if (c.mainCategory) set.add(c.mainCategory);
        });
        return Array.from(set).sort();
    }, [categories]);

    const subCategoriesForSelectedMain = useMemo(() => {
        if (!selectedCategoryOption || selectedCategoryOption === 'Other') return [];
        const subs = categories
            .filter(c => c.mainCategory === selectedCategoryOption && c.subCategory)
            .map(c => c.subCategory);
        return Array.from(new Set(subs)).sort();
    }, [categories, selectedCategoryOption]);
    const [editForm, setEditForm] = useState({
        wholesaleRate: 0,
        costPrice: 0,
        bulkDiscount: 0,
        bulkThreshold: 0,
        movFreeDelivery: 0,
        brand: 'Generic',
        hsnCode: '-',
        gst: 18,
        quantity: '-',
        deliveryFrequency: '-',
        description: '',
        images: [],
        isActive: 'y',
        categoryId: ''
    });

    const handleOpenEditModal = (supply) => {
        setEditingSupply(supply);
        setEditForm({
            wholesaleRate: supply.wholesaleRate || 0,
            costPrice: supply.costPrice || 0,
            bulkDiscount: supply.bulkDiscount || 0,
            bulkThreshold: supply.bulkThreshold || 0,
            movFreeDelivery: supply.movFreeDelivery || 0,
            brand: supply.brand || 'Generic',
            hsnCode: supply.hsnCode || '-',
            gst: supply.gst || 18,
            quantity: supply.quantity || '-',
            deliveryFrequency: supply.deliveryFrequency || '-',
            description: supply.description || '',
            images: supply.images || [],
            isActive: supply.isActive || 'y',
            categoryId: supply.categoryId?._id || supply.categoryId || ''
        });
    };

    const [uploadingEditImages, setUploadingEditImages] = useState(false);
    
    // Create Product Form States
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [uploadingCreateImages, setUploadingCreateImages] = useState(false);
    const [creatingSupply, setCreatingSupply] = useState(false);

    const [createForm, setCreateForm] = useState({
        materialName: '',
        categoryId: '',
        categoryName: '',
        subCategoryName: '',
        brand: 'Generic',
        hsnCode: '-',
        gst: 18,
        quantity: '-',
        wholesaleRate: 0,
        costPrice: 0,
        bulkDiscount: 0,
        bulkThreshold: 0,
        movFreeDelivery: 0,
        deliveryFrequency: '-',
        description: '',
        images: [],
        isActive: 'y'
    });

    const handleCreateImageUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        
        setUploadingCreateImages(true);
        try {
            const uploadedUrls = [];
            for (const file of files) {
                const formDataPayload = new FormData();
                formDataPayload.append('media', file);
                const res = await mediaApi.upload(formDataPayload);
                if (res.url) {
                    uploadedUrls.push(res.url);
                }
            }
            setCreateForm(prev => ({
                ...prev,
                images: [...(prev.images || []), ...uploadedUrls]
            }));
            toast.success('Images uploaded successfully!');
        } catch (error) {
            console.error('Upload Error:', error);
            toast.error('Failed to upload images');
        } finally {
            setUploadingCreateImages(false);
            e.target.value = ''; // Reset file input
        }
    };

    const handleRemoveCreateImage = (indexToRemove) => {
        setCreateForm(prev => ({
            ...prev,
            images: (prev.images || []).filter((_, idx) => idx !== indexToRemove)
        }));
    };

    const handleCreateSubmit = async (e) => {
        e.preventDefault();
        
        const finalProductName = selectedProductOption === 'Other' ? customProductName : selectedProductOption;
        const finalCategory = selectedProductOption === 'Other' 
            ? customCategoryName 
            : (selectedCategoryOption === 'Other' ? customCategoryName : selectedCategoryOption);
        const finalSubCategory = selectedProductOption === 'Other' 
            ? customSubCategoryName 
            : ((selectedCategoryOption === 'Other' || selectedSubCategoryOption === 'Other') ? customSubCategoryName : selectedSubCategoryOption);

        if (!finalProductName || !finalCategory || !finalSubCategory || !createForm.wholesaleRate) {
            toast.error('Please fill all required fields');
            return;
        }

        try {
            setCreatingSupply(true);
            const userObj = JSON.parse(localStorage.getItem('supplierData') || localStorage.getItem('userData') || localStorage.getItem('user') || '{}');
            const phone = userObj.phone || '';
            const supplierCode = `SUP-${phone ? phone.slice(-4) : '001'}`;
            const supplierFacilityName = userObj.supplierDetails?.businessName || userObj.displayName || '-';
            
            const payload = {
                skuId: `SKU-${Math.floor(100000 + Math.random() * 900000)}`,
                materialName: finalProductName,
                categoryName: finalCategory,
                subCategoryName: finalSubCategory,
                wholesaleRate: Number(createForm.wholesaleRate) || 0,
                costPrice: Number(createForm.costPrice) || 0,
                bulkDiscount: Number(createForm.bulkDiscount) || 0,
                bulkThreshold: Number(createForm.bulkThreshold) || 0,
                movFreeDelivery: Number(createForm.movFreeDelivery) || 0,
                brand: createForm.brand,
                hsnCode: createForm.hsnCode,
                gst: Number(createForm.gst) || 18,
                quantity: createForm.quantity,
                deliveryFrequency: createForm.deliveryFrequency,
                description: createForm.description,
                images: createForm.images,
                isActive: createForm.isActive,
                supplierId: supplierCode,
                supplierFacilityName: supplierFacilityName,
                serialNumber: Date.now()
            };

            const response = await vendorMasterSupplyApi.create(payload);
            if (response && response._id) {
                toast.success('Product created and submitted successfully!');
                setShowCreateModal(false);
                setCreateForm({
                    materialName: '',
                    categoryId: '',
                    categoryName: '',
                    subCategoryName: '',
                    brand: 'Generic',
                    hsnCode: '-',
                    gst: 18,
                    quantity: '-',
                    wholesaleRate: 0,
                    costPrice: 0,
                    bulkDiscount: 0,
                    bulkThreshold: 0,
                    movFreeDelivery: 0,
                    deliveryFrequency: '-',
                    description: '',
                    images: [],
                    isActive: 'y'
                });
                setSelectedProductOption('');
                setCustomProductName('');
                setSelectedCategoryOption('');
                setCustomCategoryName('');
                setSelectedSubCategoryOption('');
                setCustomSubCategoryName('');
                fetchSupplies();
                setActiveTab('requests');
            } else {
                toast.error('Failed to create product');
            }
        } catch (error) {
            console.error('Create product error:', error);
            toast.error('Failed to create product');
        } finally {
            setCreatingSupply(false);
        }
    };

    const handleEditImageUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        
        setUploadingEditImages(true);
        try {
            const uploadedUrls = [];
            for (const file of files) {
                const formDataPayload = new FormData();
                formDataPayload.append('media', file);
                const res = await mediaApi.upload(formDataPayload);
                if (res.url) {
                    uploadedUrls.push(res.url);
                }
            }
            setEditForm(prev => ({
                ...prev,
                images: [...(prev.images || []), ...uploadedUrls]
            }));
            toast.success('Images uploaded successfully!');
        } catch (error) {
            console.error('Upload Error:', error);
            toast.error('Failed to upload images');
        } finally {
            setUploadingEditImages(false);
            e.target.value = ''; // Reset file input
        }
    };

    const handleRemoveEditImage = (indexToRemove) => {
        setEditForm(prev => ({
            ...prev,
            images: (prev.images || []).filter((_, idx) => idx !== indexToRemove)
        }));
    };

    const handleSaveEdit = async () => {
        try {
            const payload = {
                ...editingSupply,
                wholesaleRate: Number(editForm.wholesaleRate) || 0,
                costPrice: Number(editForm.costPrice) || 0,
                bulkDiscount: Number(editForm.bulkDiscount) || 0,
                bulkThreshold: Number(editForm.bulkThreshold) || 0,
                movFreeDelivery: Number(editForm.movFreeDelivery) || 0,
                brand: editForm.brand,
                hsnCode: editForm.hsnCode,
                gst: Number(editForm.gst) || 18,
                quantity: editForm.quantity,
                deliveryFrequency: editForm.deliveryFrequency,
                description: editForm.description,
                images: editForm.images,
                isActive: editForm.isActive,
                categoryId: editForm.categoryId,
                approvalStatus: 'Pending'
            };
            
            const response = await vendorMasterSupplyApi.update(editingSupply._id, payload);
            if (response && (response._id || response.success !== false)) {
                toast.success('Supply item updated successfully!');
                setEditingSupply(null);
                fetchSupplies();
            } else {
                toast.error(response?.message || 'Failed to update supply item');
            }
        } catch (error) {
            console.error('Update supply error:', error);
            toast.error(error.message || 'Failed to update supply item');
        }
    };

    const toggleSupplyStatusLocal = (id) => {
        if (!editMode) return;
        setSupplies(prev => prev.map(item => {
            if (item._id === id) {
                const currentActive = item.isActive || 'y';
                const nextActive = currentActive === 'y' ? 'n' : 'y';
                return { ...item, isActive: nextActive };
            }
            return item;
        }));
    };

    const handleInlineChange = (id, field, value) => {
        if (!editMode) return;
        setSupplies(prev => prev.map(item => {
            if (item._id === id) {
                return { ...item, [field]: value };
            }
            return item;
        }));
    };

    const handleGlobalSave = async () => {
        try {
            setLoading(true);
            const updates = [];
            for (const item of supplies) {
                const original = originalSupplies.find(o => o._id === item._id);
                if (original) {
                    const hasChanged = 
                        original.isActive !== item.isActive ||
                        original.brand !== item.brand ||
                        original.description !== item.description ||
                        original.quantity !== item.quantity ||
                        original.wholesaleRate !== item.wholesaleRate ||
                        original.costPrice !== item.costPrice ||
                        original.gst !== item.gst ||
                        original.hsnCode !== item.hsnCode ||
                        original.bulkDiscount !== item.bulkDiscount ||
                        original.bulkThreshold !== item.bulkThreshold ||
                        original.deliveryFrequency !== item.deliveryFrequency ||
                        original.movFreeDelivery !== item.movFreeDelivery ||
                        (original.categoryId?._id || original.categoryId) !== (item.categoryId?._id || item.categoryId);

                    if (hasChanged) {
                        const payload = {
                            ...item,
                            wholesaleRate: Number(item.wholesaleRate) || 0,
                            costPrice: Number(item.costPrice) || 0,
                            bulkDiscount: Number(item.bulkDiscount) || 0,
                            bulkThreshold: Number(item.bulkThreshold) || 0,
                            movFreeDelivery: Number(item.movFreeDelivery) || 0,
                            gst: Number(item.gst) || 18,
                            categoryId: item.categoryId?._id || item.categoryId,
                            approvalStatus: 'Pending'
                        };
                        updates.push(vendorMasterSupplyApi.update(item._id, payload));
                    }
                }
            }

            if (updates.length > 0) {
                await Promise.all(updates);
                toast.success('Supply items updated successfully!');
            } else {
                toast('No changes to save.', { icon: 'ℹ️' });
            }
            setEditMode(false);
            fetchSupplies();
        } catch (error) {
            console.error('Global save error:', error);
            toast.error('Failed to save changes');
        } finally {
            setLoading(false);
        }
    };



    const fetchCategories = async () => {
        try {
            const list = await vendorSupplyCategoryApi.getAll();
            setCategories(Array.isArray(list) ? list : []);
        } catch (err) {
            console.error('Failed to fetch categories:', err);
        }
    };

    const fetchSupplies = async () => {
        try {
            setLoading(true);
            const [data, costs] = await Promise.all([
                vendorMasterSupplyApi.getAll({ supplierId: supplierCode }),
                vendorMasterSupplyApi.getMyCosts()
            ]);
            const costById = new Map((Array.isArray(costs) ? costs : []).map(row => [String(row._id), row.costPrice]));
            const list = (Array.isArray(data) ? data : []).map(item => ({
                ...item,
                costPrice: costById.get(String(item._id)) || 0
            }));
            setSupplies(list);
            setOriginalSupplies(JSON.parse(JSON.stringify(list)));
        } catch (err) {
            console.error('Failed to fetch supplies:', err);
            toast.error('Failed to load supplies registry');
        } finally {
            setLoading(false);
        }
    };

    const fetchAdminTemplates = async () => {
        try {
            const data = await vendorMasterSupplyApi.getAll({ supplierId: '-' });
            setAdminTemplates(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to fetch admin templates:', err);
        }
    };

    const fetchZones = async () => {
        try {
            const list = await supplierServiceZoneApi.getAll();
            setZones(Array.isArray(list) ? list : []);
        } catch (err) {
            console.error('Failed to fetch zones:', err);
        }
    };

    const fetchAllSuppliesList = async () => {
        try {
            const list = await vendorMasterSupplyApi.getAll({ isTemplate: 'n' });
            setAllSuppliesList(Array.isArray(list) ? list : []);
        } catch (err) {
            console.error('Failed to fetch all supplies:', err);
        }
    };

    useEffect(() => {
        if (supplierCode) {
            fetchSupplies();
            fetchCategories();
            fetchAdminTemplates();
            fetchZones();
            fetchAllSuppliesList();
        }
    }, [supplierCode]);

    const filteredSupplies = useMemo(() => {
        return supplies.filter(item => {
            // Tab filtering
            if (activeTab === 'catalog') {
                const isApproved = item.approvalStatus === 'Approved' || item.approvalStatus === null || item.approvalStatus === undefined;
                if (!isApproved) return false;
            } else {
                const isPendingOrRejected = item.approvalStatus === 'Pending' || item.approvalStatus === 'Rejected';
                if (!isPendingOrRejected) return false;
            }

            const matchesSearch = 
                (item.materialName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.brand || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.skuId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.categoryId?.mainCategory || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.categoryId?.subCategory || '').toLowerCase().includes(searchTerm.toLowerCase());

            const isActiveVal = item.isActive || 'y';
            const matchesStatus = 
                statusFilter === 'all' ||
                (statusFilter === 'active' && isActiveVal === 'y') ||
                (statusFilter === 'inactive' && isActiveVal === 'n');

            return matchesSearch && matchesStatus;
        });
    }, [supplies, searchTerm, statusFilter, activeTab]);

    // Icon selector helper based on main category name
    const getCategoryIcon = (categoryName) => {
        const cat = (categoryName || '').toLowerCase();
        if (cat.includes('chemical') || cat.includes('solvent')) return 'science';
        if (cat.includes('detergent') || cat.includes('soap')) return 'wash';
        if (cat.includes('package') || cat.includes('bag') || cat.includes('box')) return 'inventory_2';
        if (cat.includes('hanger') || cat.includes('tag')) return 'label';
        if (cat.includes('machine') || cat.includes('spare')) return 'settings';
        return 'package';
    };

    const DetailModal = ({ supply, onClose }) => {
        if (!supply) return null;
        return (
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/60 backdrop-blur-sm"
                onClick={onClose}
            >
                <motion.div 
                    initial={{ scale: 0.9, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.9, y: 20 }}
                    className="bg-white w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl border border-slate-100 max-h-[85vh] flex flex-col"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Modal Header */}
                    <div className="p-8 border-b border-slate-100 flex justify-between items-start shrink-0">
                        <div>
                            <span className="bg-primary/5 text-primary text-[8px] font-black uppercase tracking-[0.2em] px-2.5 py-1 rounded-md border border-primary/10">
                                {supply.skuId || 'NO SKU'}
                            </span>
                            <h3 className="text-xl font-black text-slate-900 tracking-tight mt-2 uppercase">{supply.materialName}</h3>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">By {supply.brand || 'Generic'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => {
                                    onClose();
                                    handleOpenEditModal(supply);
                                }} 
                                className="w-10 h-10 rounded-2xl bg-slate-900 text-white hover:bg-primary flex items-center justify-center transition-colors"
                            >
                                <span className="material-symbols-outlined text-[18px]">edit</span>
                            </button>
                            <button onClick={onClose} className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors">
                                <span className="material-symbols-outlined text-xl">close</span>
                            </button>
                        </div>
                    </div>

                    {/* Modal Body */}
                    <div className="p-8 overflow-y-auto space-y-6 flex-1 custom-scrollbar text-xs font-bold text-slate-600">
                        {/* Status & Basic details */}
                        <div className="grid grid-cols-2 gap-4 bg-slate-50 p-5 rounded-3xl">
                            <div>
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                                <span className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase border ${
                                    (supply.isActive || 'y') === 'y' 
                                        ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                                        : 'bg-slate-100 text-slate-400 border-slate-200'
                                }`}>
                                    {(supply.isActive || 'y') === 'y' ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                            <div>
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Category Code</p>
                                <span className="bg-slate-200/50 text-slate-700 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                                    {supply.categoryId?.excelCategoryId || 'N/A'}
                                </span>
                            </div>
                            <div className="col-span-2">
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Category Hierarchy</p>
                                <p className="text-slate-800 text-[11px]">
                                    {supply.categoryId?.mainCategory || 'N/A'} <span className="text-slate-300 mx-1">→</span> {supply.categoryId?.subCategory || 'N/A'}
                                </p>
                            </div>
                            {supply.approvalStatus && supply.approvalStatus !== 'Approved' && (
                                <div className="col-span-2 mt-2 pt-2 border-t border-slate-100/50 space-y-2">
                                    <div>
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Approval Moderation</p>
                                        <span className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase border ${
                                            supply.approvalStatus === 'Pending' 
                                                ? 'bg-amber-50 text-amber-600 border-amber-100' 
                                                : 'bg-rose-50 text-rose-600 border-rose-100'
                                        }`}>
                                            {supply.approvalStatus}
                                        </span>
                                    </div>
                                    {supply.adminMessage && (
                                        <div>
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Feedback from Admin</p>
                                            <p className="text-slate-800 text-[10px] bg-slate-100/50 p-2.5 rounded-lg border border-slate-200/50 leading-relaxed font-bold break-words whitespace-pre-line">
                                                {supply.adminMessage}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Pricing Columns */}
                        <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Pricing & Taxation</p>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="border border-slate-100 p-4 rounded-2xl flex flex-col justify-center">
                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Wholesale Rate</span>
                                    <span className="text-lg font-black text-slate-900">₹{supply.wholesaleRate || 0} <span className="text-[10px] text-slate-400 font-bold uppercase">(Stock: {supply.quantity})</span></span>
                                </div>
                                <div className="border border-slate-100 p-4 rounded-2xl flex flex-col justify-center">
                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">GST & HSN</span>
                                    <span className="text-sm font-black text-slate-900">{supply.gst || 18}% <span className="text-[10px] text-slate-400 font-bold">({supply.hsnCode || '2800'})</span></span>
                                </div>
                                <div className="border border-slate-100 p-4 rounded-2xl col-span-2 flex justify-between items-center">
                                    <div>
                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Bulk Discount</span>
                                        <span className="text-sm font-black text-indigo-600">{supply.bulkDiscount || 0}% Off</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Bulk Threshold</span>
                                        <span className="text-xs font-black text-slate-800">{supply.bulkThreshold || 0} Units</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Logistics & Delivery */}
                        <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Logistics & Supply Chain</p>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="border border-slate-100 p-4 rounded-2xl flex flex-col justify-center">
                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Delivery Frequency</span>
                                    <span className="text-xs font-black text-slate-800 uppercase tracking-wider">{supply.deliveryFrequency || 'Weekly'}</span>
                                </div>
                                <div className="border border-slate-100 p-4 rounded-2xl flex flex-col justify-center">
                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">MOV for Free Delivery</span>
                                    <span className="text-xs font-black text-slate-800">₹{supply.movFreeDelivery || 0}</span>
                                </div>
                            </div>
                        </div>

                        {/* Supplier Info */}
                        <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Assigned Vendor Details</p>
                            <div className="bg-slate-50 p-4 rounded-2xl space-y-2.5">
                                <div className="flex justify-between text-[11px]">
                                    <span className="text-slate-400">Supplier Code:</span>
                                    <span className="text-slate-900 font-black">{supply.supplierId || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between text-[11px]">
                                    <span className="text-slate-400">Supplier Facility Name:</span>
                                    <span className="text-slate-900 font-black uppercase">{supply.supplierFacilityName || 'Main Facility'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        );
    };

    return (
        <div className="text-slate-900 min-h-screen pb-48 font-sans">
            <AnimatePresence>
                {showDetailModal && (
                    <DetailModal 
                        supply={selectedSupply} 
                        onClose={() => {
                            setShowDetailModal(false);
                            setSelectedSupply(null);
                        }} 
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {editingSupply && (
                    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6">
                        <motion.div 
                          initial={{ opacity: 0 }} 
                          animate={{ opacity: 1 }} 
                          exit={{ opacity: 0 }} 
                          onClick={() => setEditingSupply(null)}
                          className="absolute inset-0 bg-black/60 backdrop-blur-md" 
                        />
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95, y: 20 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: 20 }}
                          className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl border border-slate-100 flex flex-col space-y-6 overflow-hidden relative text-left"
                        >
                            {/* Close Button */}
                            <button 
                                onClick={() => setEditingSupply(null)}
                                className="absolute right-6 top-6 w-10 h-10 rounded-full bg-slate-55 border border-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-950 transition-colors hover:scale-105 active:scale-95"
                            >
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>

                            <div className="space-y-1">
                                <h3 className="text-2xl font-black uppercase tracking-tighter text-slate-950 leading-none">EDIT PRODUCT</h3>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">MODIFY YOUR PRODUCT CONFIGURATIONS</p>
                            </div>
                           
                            <div className="space-y-4 text-left max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
                                <div className="space-y-1.5 text-left">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">PRODUCT NAME (NON-EDITABLE)</label>
                                    <input 
                                        type="text" 
                                        disabled 
                                        value={editingSupply.materialName} 
                                        className="w-full px-5 py-3.5 bg-slate-100 border border-slate-200 rounded-2xl text-xs font-bold text-slate-500 outline-none cursor-not-allowed"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">CATEGORY</label>
                                        <select
                                          value={editForm.categoryId}
                                          onChange={(e) => setEditForm({...editForm, categoryId: e.target.value})}
                                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all cursor-pointer"
                                        >
                                            <option value="">Select Category</option>
                                            {categories.map((cat) => (
                                                <option key={cat._id} value={cat._id}>
                                                    {cat.mainCategory}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">SUB CATEGORY</label>
                                        <input 
                                            type="text" 
                                            disabled 
                                            value={(() => {
                                                const selectedCat = categories.find(c => c._id === editForm.categoryId);
                                                return selectedCat ? selectedCat.subCategory : '-';
                                            })()} 
                                            className="w-full px-5 py-3.5 bg-slate-100 border border-slate-200 rounded-2xl text-xs font-bold text-slate-500 outline-none cursor-not-allowed"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">BRAND</label>
                                        <input 
                                          type="text"
                                          value={editForm.brand}
                                          onChange={(e) => setEditForm({...editForm, brand: e.target.value})}
                                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all"
                                        />
                                    </div>
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">HSN CODE</label>
                                        <input 
                                          type="text"
                                          value={editForm.hsnCode}
                                          onChange={(e) => setEditForm({...editForm, hsnCode: e.target.value})}
                                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">GST PERCENTAGE (%)</label>
                                        <select
                                          value={editForm.gst}
                                          onChange={(e) => setEditForm({...editForm, gst: e.target.value})}
                                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all cursor-pointer"
                                        >
                                            <option value="0">0%</option>
                                            <option value="5">5%</option>
                                            <option value="12">12%</option>
                                            <option value="18">18%</option>
                                            <option value="28">28%</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">AVAILABLE STOCK</label>
                                        <input 
                                          type="text"
                                          value={editForm.quantity}
                                          onChange={(e) => setEditForm({...editForm, quantity: e.target.value})}
                                          placeholder="e.g. 500"
                                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">WHOLESALE RATE (₹)</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-300">₹</span>
                                            <input 
                                              type="number"
                                              value={editForm.wholesaleRate}
                                              onChange={(e) => setEditForm({...editForm, wholesaleRate: e.target.value})}
                                              className="w-full pl-8 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">UNIT COST FOR PROFIT (₹)</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-300">₹</span>
                                            <input
                                              type="number"
                                              min="0"
                                              value={editForm.costPrice}
                                              onChange={(e) => setEditForm({...editForm, costPrice: e.target.value})}
                                              className="w-full pl-8 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">BULK DISCOUNT (%)</label>
                                        <input 
                                          type="number"
                                          value={editForm.bulkDiscount}
                                          onChange={(e) => setEditForm({...editForm, bulkDiscount: e.target.value})}
                                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">MIN BULK QTY</label>
                                        <input 
                                          type="number"
                                          value={editForm.bulkThreshold}
                                          onChange={(e) => setEditForm({...editForm, bulkThreshold: e.target.value})}
                                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all"
                                        />
                                    </div>
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">MOV FOR FREE DELIVERY (₹)</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-300">₹</span>
                                            <input 
                                              type="number"
                                              value={editForm.movFreeDelivery}
                                              onChange={(e) => setEditForm({...editForm, movFreeDelivery: e.target.value})}
                                              className="w-full pl-8 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">DELIVERY FREQUENCY</label>
                                        <input 
                                          type="text"
                                          value={editForm.deliveryFrequency}
                                          onChange={(e) => setEditForm({...editForm, deliveryFrequency: e.target.value})}
                                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all"
                                        />
                                    </div>
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">STATUS</label>
                                        <select
                                          value={editForm.isActive}
                                          onChange={(e) => setEditForm({...editForm, isActive: e.target.value})}
                                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all cursor-pointer"
                                        >
                                            <option value="y">Active</option>
                                            <option value="n">Inactive</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-1.5 text-left">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">PRODUCT DESCRIPTION</label>
                                    <textarea 
                                      value={editForm.description}
                                      onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                                      rows={2}
                                      placeholder="Enter detailed description..."
                                      className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all resize-none"
                                    />
                                </div>

                                <div className="space-y-1.5 text-left">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">PRODUCT IMAGES</label>
                                    <div className="flex flex-wrap gap-3 p-4 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                                        {editForm.images && editForm.images.map((url, idx) => (
                                            <div key={idx} className="relative w-16 h-16 group border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
                                                <img src={url} alt="product" className="w-full h-full object-cover" />
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveEditImage(idx)}
                                                    className="absolute -top-1 -right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-all shadow-sm flex items-center justify-center"
                                                    title="Remove Image"
                                                >
                                                    <span className="material-symbols-outlined text-[12px] font-bold">close</span>
                                                </button>
                                            </div>
                                        ))}
                                        <label className={`w-16 h-16 flex flex-col items-center justify-center border border-dashed border-slate-300 rounded-xl cursor-pointer hover:bg-white hover:border-slate-900 transition-all relative ${uploadingEditImages ? 'pointer-events-none opacity-50' : ''}`}>
                                            <input
                                                type="file"
                                                multiple
                                                accept="image/*"
                                                onChange={handleEditImageUpload}
                                                className="hidden"
                                            />
                                            {uploadingEditImages ? (
                                                <Loader2 size={16} className="animate-spin text-slate-400" />
                                            ) : (
                                                <>
                                                    <span className="material-symbols-outlined text-slate-400 text-[18px]">add</span>
                                                    <span className="text-[7px] font-black text-slate-400 uppercase mt-0.5">Upload</span>
                                                </>
                                            )}
                                        </label>
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-4">
                                    <button 
                                      type="button"
                                      onClick={() => setEditingSupply(null)}
                                      className="flex-1 py-4 bg-slate-50 text-slate-450 border border-slate-200 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all hover:scale-[1.02] active:scale-95"
                                    >
                                      Cancel
                                    </button>
                                    <button 
                                      type="button"
                                      onClick={handleSaveEdit}
                                      className="flex-1 py-4 bg-slate-950 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-slate-900/20 hover:scale-[1.02] active:scale-95 transition-all"
                                    >
                                      Save Changes
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showCreateModal && (
                    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6">
                        <motion.div 
                          initial={{ opacity: 0 }} 
                          animate={{ opacity: 1 }} 
                          exit={{ opacity: 0 }} 
                          onClick={() => setShowCreateModal(false)}
                          className="absolute inset-0 bg-black/60 backdrop-blur-md" 
                        />
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95, y: 20 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: 20 }}
                          className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl border border-slate-100 flex flex-col space-y-6 overflow-hidden relative text-left"
                        >
                            {/* Close Button */}
                            <button 
                                onClick={() => setShowCreateModal(false)}
                                className="absolute right-6 top-6 w-10 h-10 rounded-full bg-slate-55 border border-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-900 transition-colors hover:scale-105 active:scale-95"
                            >
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>

                            <div className="space-y-1">
                                <h3 className="text-2xl font-black uppercase tracking-tighter text-slate-950 leading-none">ADD PRODUCT</h3>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">SUBMIT CUSTOM PRODUCT FOR ADMIN APPROVAL</p>
                            </div>
                          
                            <form onSubmit={handleCreateSubmit} className="space-y-4 text-left max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
                                <div className="space-y-1.5 text-left font-sans">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">PRODUCT NAME</label>
                                    <select 
                                        required
                                        value={selectedProductOption}
                                        onChange={(e) => handleProductSelect(e.target.value)}
                                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all cursor-pointer"
                                    >
                                        <option value="">Select Product</option>
                                        {uniqueTemplateNames.map((name, idx) => (
                                            <option key={idx} value={name}>
                                                {name}
                                            </option>
                                        ))}
                                        <option value="Other">Other</option>
                                    </select>
                                    {selectedProductOption === 'Other' && (
                                        <input 
                                            type="text"
                                            required
                                            value={customProductName}
                                            onChange={(e) => setCustomProductName(e.target.value)}
                                            placeholder="Write Custom Product Name"
                                            className="w-full px-5 py-3.5 mt-2 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all placeholder:text-slate-300"
                                        />
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5 text-left font-sans">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">CATEGORY</label>
                                        <select
                                            required
                                            value={selectedCategoryOption}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setSelectedCategoryOption(val);
                                                setSelectedSubCategoryOption('');
                                                setCustomSubCategoryName('');
                                            }}
                                            className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all cursor-pointer"
                                        >
                                            <option value="">Select Category</option>
                                            {uniqueMainCategories.map((cat, idx) => (
                                                <option key={idx} value={cat}>
                                                    {cat}
                                                </option>
                                            ))}
                                            <option value="Other">Other (Create New Category)</option>
                                        </select>
                                        {selectedCategoryOption === 'Other' && (
                                            <input 
                                                type="text"
                                                required
                                                value={customCategoryName}
                                                onChange={(e) => setCustomCategoryName(e.target.value)}
                                                placeholder="Write Category Name"
                                                className="w-full px-5 py-3.5 mt-2 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all placeholder:text-slate-300"
                                            />
                                        )}
                                    </div>
                                    <div className="space-y-1.5 text-left font-sans">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">SUB CATEGORY</label>
                                        <select
                                            required
                                            value={selectedSubCategoryOption}
                                            disabled={!selectedCategoryOption}
                                            onChange={(e) => setSelectedSubCategoryOption(e.target.value)}
                                            className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <option value="">Select Sub Category</option>
                                            {subCategoriesForSelectedMain.map((sub, idx) => (
                                                <option key={idx} value={sub}>
                                                    {sub}
                                                </option>
                                            ))}
                                            {selectedCategoryOption && (
                                                <option value="Other">Other (Create New Sub Category)</option>
                                            )}
                                        </select>
                                        {selectedSubCategoryOption === 'Other' && (
                                            <input 
                                                type="text"
                                                required
                                                value={customSubCategoryName}
                                                onChange={(e) => setCustomSubCategoryName(e.target.value)}
                                                placeholder="Write Sub Category Name"
                                                className="w-full px-5 py-3.5 mt-2 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all placeholder:text-slate-300"
                                            />
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">BRAND</label>
                                        <input 
                                            type="text"
                                            value={createForm.brand}
                                            onChange={(e) => setCreateForm({...createForm, brand: e.target.value})}
                                            placeholder="e.g. Spinzyt / Generic"
                                            className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all placeholder:text-slate-300"
                                        />
                                    </div>
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">HSN CODE</label>
                                        <input 
                                            type="text"
                                            value={createForm.hsnCode}
                                            onChange={(e) => setCreateForm({...createForm, hsnCode: e.target.value})}
                                            placeholder="e.g. 3402"
                                            className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all placeholder:text-slate-300"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">GST PERCENTAGE (%)</label>
                                        <select
                                            value={createForm.gst}
                                            onChange={(e) => setCreateForm({...createForm, gst: e.target.value})}
                                            className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all cursor-pointer"
                                        >
                                            <option value="0">0%</option>
                                            <option value="5">5%</option>
                                            <option value="12">12%</option>
                                            <option value="18">18%</option>
                                            <option value="28">28%</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">AVAILABLE STOCK</label>
                                        <input 
                                            type="text"
                                            value={createForm.quantity}
                                            onChange={(e) => setCreateForm({...createForm, quantity: e.target.value})}
                                            placeholder="e.g. 500"
                                            className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all placeholder:text-slate-300"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">WHOLESALE RATE (₹)</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-300">₹</span>
                                            <input 
                                                type="number"
                                                required
                                                min="0"
                                                value={createForm.wholesaleRate}
                                                onChange={(e) => setCreateForm({...createForm, wholesaleRate: e.target.value})}
                                                placeholder="0.00"
                                                className="w-full pl-8 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all placeholder:text-slate-300"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">UNIT COST FOR PROFIT (₹)</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-300">₹</span>
                                            <input
                                                type="number"
                                                min="0"
                                                value={createForm.costPrice}
                                                onChange={(e) => setCreateForm({...createForm, costPrice: e.target.value})}
                                                placeholder="Optional"
                                                className="w-full pl-8 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all placeholder:text-slate-300"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">BULK DISCOUNT (%)</label>
                                        <input 
                                            type="number"
                                            min="0"
                                            value={createForm.bulkDiscount}
                                            onChange={(e) => setCreateForm({...createForm, bulkDiscount: e.target.value})}
                                            placeholder="0.00"
                                            className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all placeholder:text-slate-300"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">MIN BULK QTY</label>
                                        <input 
                                            type="number"
                                            min="0"
                                            value={createForm.bulkThreshold}
                                            onChange={(e) => setCreateForm({...createForm, bulkThreshold: e.target.value})}
                                            placeholder="0.00"
                                            className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all placeholder:text-slate-300"
                                        />
                                    </div>
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">MOV FOR FREE DELIVERY (₹)</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-300">₹</span>
                                            <input 
                                                type="number"
                                                min="0"
                                                value={createForm.movFreeDelivery}
                                                onChange={(e) => setCreateForm({...createForm, movFreeDelivery: e.target.value})}
                                                placeholder="0.00"
                                                className="w-full pl-8 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all placeholder:text-slate-300"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">DELIVERY FREQUENCY</label>
                                        <input 
                                            type="text"
                                            value={createForm.deliveryFrequency}
                                            onChange={(e) => setCreateForm({...createForm, deliveryFrequency: e.target.value})}
                                            placeholder="e.g. Weekly"
                                            className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all placeholder:text-slate-300"
                                        />
                                    </div>
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">STATUS</label>
                                        <select
                                            value={createForm.isActive}
                                            onChange={(e) => setCreateForm({...createForm, isActive: e.target.value})}
                                            className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all cursor-pointer"
                                        >
                                            <option value="y">Active</option>
                                            <option value="n">Inactive</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-1.5 text-left">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">PRODUCT DESCRIPTION</label>
                                    <textarea 
                                        value={createForm.description}
                                        onChange={(e) => setCreateForm({...createForm, description: e.target.value})}
                                        rows={2}
                                        placeholder="Enter product specifications, features, etc."
                                        className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all placeholder:text-slate-300 resize-none"
                                    />
                                </div>

                                <div className="space-y-1.5 text-left">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">PRODUCT IMAGES</label>
                                    <div className="flex flex-wrap gap-3 p-4 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                                        {createForm.images && createForm.images.map((url, idx) => (
                                            <div key={idx} className="relative w-16 h-16 group border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
                                                <img src={url} alt="product" className="w-full h-full object-cover" />
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveCreateImage(idx)}
                                                    className="absolute -top-1 -right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-all shadow-sm flex items-center justify-center"
                                                    title="Remove Image"
                                                >
                                                    <span className="material-symbols-outlined text-[12px] font-bold">close</span>
                                                </button>
                                            </div>
                                        ))}
                                        <label className={`w-16 h-16 flex flex-col items-center justify-center border border-dashed border-slate-300 rounded-xl cursor-pointer hover:bg-white hover:border-slate-900 transition-all relative ${uploadingCreateImages ? 'pointer-events-none opacity-50' : ''}`}>
                                            <input
                                                type="file"
                                                multiple
                                                accept="image/*"
                                                onChange={handleCreateImageUpload}
                                                className="hidden"
                                            />
                                            {uploadingCreateImages ? (
                                                <Loader2 size={16} className="animate-spin text-slate-400" />
                                            ) : (
                                                <>
                                                    <span className="material-symbols-outlined text-slate-400 text-[18px]">add</span>
                                                    <span className="text-[7px] font-black text-slate-400 uppercase mt-0.5">Upload</span>
                                                </>
                                            )}
                                        </label>
                                    </div>
                                </div>

                                <div className="pt-4">
                                    <button 
                                        type="submit"
                                        disabled={creatingSupply}
                                        className="w-full py-4 bg-slate-950 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-900 transition-all shadow-xl shadow-slate-955/15 disabled:opacity-50 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95"
                                    >
                                        {creatingSupply ? (
                                            <>
                                                <Loader2 size={14} className="animate-spin text-white" />
                                                <span>Submitting...</span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined text-[16px]">add</span>
                                                <span>Create & Submit Product</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            
            {/* Header */}
            <header className="px-6 pt-2 flex items-center justify-between mb-6 max-w-5xl mx-auto">
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

            <main className="px-6 space-y-8 max-w-5xl mx-auto">
                {/* Action Row */}
                <div className="flex items-center justify-between">
                    <button onClick={() => navigate(-1)} className="flex items-center justify-center w-10 h-10 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-900 hover:border-slate-900 shadow-sm transition-all">
                        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                    </button>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => setShowCreateModal(true)}
                            className="px-4 py-2.5 bg-slate-900 text-white rounded-xl flex items-center justify-center min-w-[80px] shadow-md shadow-slate-900/20 hover:scale-105 transition-all text-[10px] font-black uppercase tracking-widest"
                        >
                            Create
                        </button>
                        {activeTab === 'catalog' && (
                            <button 
                                onClick={() => setEditMode(!editMode)}
                                className="px-4 py-2.5 bg-slate-900 text-white rounded-xl flex items-center justify-center min-w-[80px] shadow-md shadow-slate-900/20 hover:scale-105 transition-all text-[10px] font-black uppercase tracking-widest"
                            >
                                {editMode ? 'Save' : 'Edit'}
                            </button>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-6 border-b border-slate-100 pb-0.5 mt-2">
                    <button
                        onClick={() => {
                            setActiveTab('catalog');
                            setEditMode(false);
                        }}
                        className={`text-xs font-black uppercase tracking-widest pb-3 px-1 relative transition-colors ${
                            activeTab === 'catalog' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-800'
                        }`}
                    >
                        Active Catalog
                        {activeTab === 'catalog' && (
                            <motion.div layoutId="activeTabUnderline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-900" />
                        )}
                    </button>
                    <button
                        onClick={() => {
                            setActiveTab('requests');
                            setEditMode(false);
                        }}
                        className={`text-xs font-black uppercase tracking-widest pb-3 px-1 relative transition-colors ${
                            activeTab === 'requests' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-800'
                        }`}
                    >
                        Product Requests
                        {activeTab === 'requests' && (
                            <motion.div layoutId="activeTabUnderline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-900" />
                        )}
                    </button>
                </div>
                {/* 2. INVENTORY RATE CARD */}
                <section className="space-y-4">
                    {/* SUPPLY ITEMS LIST */}
                    <div className="space-y-4">
                        {loading ? (
                            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse min-w-[1450px]">
                                        <thead>
                                            <tr className="border-b border-slate-100 bg-slate-50/50">
                                                <th className="p-4 w-24"><div className="h-3 w-16 bg-slate-200 rounded mx-auto"></div></th>
                                                <th className="p-4 w-28"><div className="h-3 w-16 bg-slate-200 rounded"></div></th>
                                                <th className="p-4"><div className="h-3 w-24 bg-slate-200 rounded"></div></th>
                                                <th className="p-4 w-44"><div className="h-3 w-32 bg-slate-200 rounded"></div></th>
                                                <th className="p-4"><div className="h-3 w-20 bg-slate-200 rounded"></div></th>
                                                <th className="p-4"><div className="h-3 w-20 bg-slate-200 rounded"></div></th>
                                                <th className="p-4"><div className="h-3 w-20 bg-slate-200 rounded"></div></th>
                                                <th className="p-4 w-28"><div className="h-3 w-16 bg-slate-200 rounded"></div></th>
                                                <th className="p-4 w-32"><div className="h-3 w-20 bg-slate-200 rounded"></div></th>
                                                <th className="p-4 w-24"><div className="h-3 w-16 bg-slate-200 rounded"></div></th>
                                                <th className="p-4 w-24"><div className="h-3 w-16 bg-slate-200 rounded"></div></th>
                                                <th className="p-4 w-36"><div className="h-3 w-24 bg-slate-200 rounded"></div></th>
                                                <th className="p-4 w-28"><div className="h-3 w-20 bg-slate-200 rounded"></div></th>
                                                <th className="p-4 w-24"><div className="h-3 w-16 bg-slate-200 rounded"></div></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {[...Array(6)].map((_, i) => (
                                                <tr key={i} className="animate-pulse">
                                                    <td className="p-4">
                                                        <div className="w-10 h-5 rounded-full bg-slate-200 mx-auto"></div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="w-12 h-12 bg-slate-200 rounded"></div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="flex flex-col gap-2">
                                                            <div className="w-32 h-3 bg-slate-200 rounded"></div>
                                                            <div className="w-20 h-2 bg-slate-100 rounded"></div>
                                                        </div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="w-36 h-3 bg-slate-100 rounded"></div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="w-20 h-3 bg-slate-100 rounded"></div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="w-24 h-3 bg-slate-100 rounded"></div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="w-24 h-3 bg-slate-100 rounded"></div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="w-16 h-3 bg-slate-100 rounded"></div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="w-24 h-8 bg-slate-100 rounded-xl"></div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="w-16 h-3 bg-slate-100 rounded"></div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="w-24 h-3 bg-slate-100 rounded"></div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="w-20 h-3 bg-slate-100 rounded"></div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="w-16 h-3 bg-slate-100 rounded"></div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="w-16 h-3 bg-slate-100 rounded"></div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : filteredSupplies.length === 0 ? (
                            <div className="text-center py-16 bg-white border border-slate-100 rounded-[2.5rem] p-6 shadow-sm">
                                <span className="material-symbols-outlined text-slate-200 text-4xl mb-3">folder_open</span>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No supplies found</p>
                                <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest mt-1">Check search query or status filter</p>
                            </div>
                        ) : (
                            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse min-w-[1450px]">
                                        <thead>
                                            <tr className="border-b border-slate-100 bg-slate-50/50">
                                                {activeTab === 'catalog' ? (
                                                    <>
                                                        {editMode && (
                                                            <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400 text-center w-20">Edit</th>
                                                        )}
                                                        <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400 text-center w-24">Status</th>
                                                    </>
                                                ) : (
                                                    <>
                                                        <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400 text-center w-28">Request Status</th>
                                                        <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400 w-60">Admin Feedback</th>
                                                    </>
                                                )}
                                                <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400 w-28">Images</th>
                                                <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400">Product Name</th>
                                                <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400 w-44">Description</th>
                                                <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400">Brand</th>
                                                <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400">Category</th>
                                                <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400">Sub Category</th>
                                                <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400 w-28">Available Stock</th>
                                                <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400 w-32">Wholesale Rate</th>
                                                <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400 w-24">GST</th>
                                                <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400 w-24">HSN</th>
                                                <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400 w-36">Bulk Discount</th>
                                                <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400 w-28">Frequency</th>
                                                <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400 w-24">MOV</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {filteredSupplies.map((item) => {
                                                const isActiveVal = item.isActive || 'y';
                                                const isActive = isActiveVal === 'y';
                                                return (
                                                    <tr 
                                                        key={item._id} 
                                                        onClick={() => {
                                                            if (editMode) return;
                                                            setSelectedSupply(item);
                                                            setShowDetailModal(true);
                                                        }}
                                                        className={`hover:bg-slate-50/50 transition-colors ${editMode ? 'cursor-default' : 'cursor-pointer'}`}
                                                    >
                                                        {activeTab === 'catalog' ? (
                                                            <>
                                                                {editMode && (
                                                                    <td className="p-4 text-center">
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleOpenEditModal(item);
                                                                            }}
                                                                            className="px-4 py-1.5 bg-slate-900 hover:bg-primary text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-md shadow-slate-900/10 inline-block mx-auto"
                                                                        >
                                                                            Edit
                                                                        </button>
                                                                    </td>
                                                                )}
                                                                <td className="p-4">
                                                                    <div className="flex items-center justify-center gap-2">
                                                                        <div 
                                                                            className={`w-10 h-5 rounded-full relative transition-all duration-300 opacity-50 cursor-not-allowed ${isActive ? 'bg-slate-900' : 'bg-slate-200'}`}
                                                                        >
                                                                            <motion.div 
                                                                                animate={{ x: isActive ? 22 : 2 }}
                                                                                className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <td className="p-4 text-center">
                                                                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase border ${
                                                                        item.approvalStatus === 'Pending' 
                                                                            ? 'bg-amber-50 text-amber-600 border-amber-100' 
                                                                            : item.approvalStatus === 'Rejected'
                                                                                ? 'bg-rose-50 text-rose-600 border-rose-100'
                                                                                : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                                                    }`}>
                                                                        {item.approvalStatus || 'Pending'}
                                                                    </span>
                                                                </td>
                                                                <td className="p-4">
                                                                    <span className="text-[10px] font-bold text-slate-500 max-w-[200px] block truncate" title={item.adminMessage}>
                                                                        {item.adminMessage || 'Awaiting review...'}
                                                                    </span>
                                                                </td>
                                                            </>
                                                        )}
                                                        <td className="p-4">
                                                            <div className="flex items-center gap-1 max-w-[120px] overflow-x-auto py-1">
                                                                {item.images && item.images.length > 0 ? (
                                                                    item.images.map((url, idx) => (
                                                                        <img 
                                                                            key={idx} 
                                                                            src={url} 
                                                                            alt="preview" 
                                                                            className="w-8 h-8 rounded border border-slate-200 object-cover flex-shrink-0"
                                                                        />
                                                                    ))
                                                                ) : (
                                                                    <span className="text-slate-400 text-[10px] italic">No images</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="flex flex-col gap-1">
                                                                <div className="flex items-center gap-3">
                                                                    <span className="text-xs font-black text-slate-900 uppercase tracking-tight">{item.materialName}</span>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="p-4">
                                                            <span className="text-[10px] text-slate-500 font-medium line-clamp-2 max-w-[200px]" title={item.description}>
                                                                {item.description || '—'}
                                                            </span>
                                                        </td>
                                                        <td className="p-4">
                                                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                                                                {item.brand || 'Generic'}
                                                            </span>
                                                        </td>
                                                        <td className="p-4">
                                                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                                                                {item.categoryId?.mainCategory || 'Generic'}
                                                            </span>
                                                        </td>
                                                        <td className="p-4">
                                                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                                                                {item.categoryId?.subCategory || 'General'}
                                                            </span>
                                                        </td>
                                                        <td className="p-4">
                                                            <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                                                                {item.quantity || '—'}
                                                            </span>
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="text-xs font-black text-slate-900 bg-slate-50 px-3 py-2 rounded-xl inline-block border border-slate-100">
                                                                ₹{item.wholesaleRate || 0}
                                                            </div>
                                                        </td>
                                                        <td className="p-4">
                                                            <span className="text-xs font-bold text-slate-700">
                                                                {item.gst || 18}%
                                                            </span>
                                                        </td>
                                                        <td className="p-4">
                                                            <span className="text-xs font-bold text-slate-700">
                                                                {item.hsnCode && item.hsnCode !== '-' ? item.hsnCode : '—'}
                                                            </span>
                                                        </td>
                                                        <td className="p-4">
                                                            {item.bulkDiscount || item.bulkThreshold ? (
                                                                <div className="flex flex-col">
                                                                    <span className="text-xs font-black text-slate-900">{item.bulkDiscount || 0}% Off</span>
                                                                    <span className="text-[9px] text-slate-400 font-bold">Min: {item.bulkThreshold || 0} Units</span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-xs font-bold text-slate-400">—</span>
                                                            )}
                                                        </td>
                                                        <td className="p-4">
                                                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                                                                {item.deliveryFrequency || 'Weekly'}
                                                            </span>
                                                        </td>
                                                        <td className="p-4">
                                                            <span className="text-xs font-bold text-slate-900 tabular-nums">
                                                                {item.movFreeDelivery ? `₹${item.movFreeDelivery}` : '—'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            </main>
        </div>
    );
};

export default SupplierMySupplies;
