import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { masterServiceApi, categoryApi, adminApi } from '../../../lib/api';
import { toast } from 'react-hot-toast';
import { 
    Plus, Edit2, Trash2, X, Download, Filter, Search, Settings, 
    MoreHorizontal, Layers, Tag, Clock, Weight, Percent, Zap, ChevronDown
} from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import DataGrid from '../components/tables/DataGrid';
import FilterField from "../components/common/FilterLabel";

const MasterServiceManagement = () => {
    const location = useLocation();
    const [configuredGst, setConfiguredGst] = useState('');
    useEffect(() => { adminApi.getConfig().then(rows => {
        const rate = rows.find(row => row.key === 'gst_percent')?.value;
        if (rate != null) { setConfiguredGst(Number(rate)); setFormData(previous => ({ ...previous, gst: previous.gst === '' ? Number(rate) : previous.gst, heritageGst: previous.heritageGst === '' ? Number(rate) : previous.heritageGst })); }
    }).catch(() => toast.error('Could not load configured GST rate')); }, []);
    const [services, setServices] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentService, setCurrentService] = useState(null);
    const [categories, setCategories] = useState([]);
    const [selectedMain, setSelectedMain] = useState('');

    const [filterCatId, setFilterCatId] = useState('');
    const [filterCurrInd, setFilterCurrInd] = useState('');
    const [filterItemName, setFilterItemName] = useState('');
    const [filterSkuId, setFilterSkuId] = useState('');

    const [formData, setFormData] = useState({
        itemName: '',
        categoryId: '',
        skuId: '',
        avgWeight: '0.5',
        seasonality: 'All Season',
        estimateTAT: '48 Hours',
        expressMultiplier: 2,
        gst: '',
        heritageGst: '',
        heritageMultiplier: 1.5,
        basePrice: 0,
        discountedPrice: 0,
        curr_ind: 'y',
        unit: 'per_item',
        isActive: true,
        serviceType: 'normal',
        excelCategoryId: '',
        sacCode: '9994',
        tier: 'Essential',
        allowDiscount: true,
        description: ''
    });

    useEffect(() => {
        fetchCategories();
        fetchServices();
    }, []);

    useEffect(() => {
        if (location.state?.openCreate) {
            setCurrentService(null);
            setFormData(prev => ({
                ...prev,
                itemName: location.state.itemName || '',
                basePrice: location.state.basePrice || 0,
                description: location.state.description || ''
            }));
            setIsModalOpen(true);
            if (location.state.itemName) {
                toast.success(`Pre-filled details for: ${location.state.itemName}`, { icon: '✨' });
            }
        }
    }, [location.state]);

    const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

    const fetchCategories = async () => {
        try {
            const data = await categoryApi.getAll();
            setCategories(data);
        } catch (error) {
            toast.error('Failed to load categories');
        }
    };

    const fetchServices = async (page = 1) => {
        try {
            setIsLoading(true);
            const data = await masterServiceApi.getAll({ page, limit: pagination.limit });
            if (data && data.pagination) {
                setServices(data.data);
                setPagination(data.pagination);
            } else {
                setServices(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            toast.error('Failed to fetch services');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDownload = () => {
        if (!services || services.length === 0) {
            toast.error('No services available to download');
            return;
        }
        const headers = ['SKU ID', 'Cat ID', 'SAC Code', 'Item Name', 'Avg Weight (KG)', 'Estimate TAT', 'GST (%)', 'Global Base Price', 'Global Discount Price', 'Status', 'Active'];
        const rows = services.map(svc => [
            svc.skuId || '—',
            svc.excelCategoryId || svc.categoryId?.excelCategoryId || '—',
            svc.sacCode || '9994',
            svc.itemName || '',
            svc.avgWeight || '0.5',
            svc.estimateTAT || '48 Hours',
            svc.gst ?? configuredGst,
            svc.basePrice || 0,
            svc.discountedPrice || 0,
            String(svc.curr_ind).toUpperCase(),
            svc.isActive ? 'Active' : 'Inactive'
        ]);

        const csvRows = [
            headers.join(','),
            ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Master_Services_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Excel/CSV downloaded successfully');
    };

    const mainCategoryList = useMemo(() => {
        return Array.from(new Set(categories.map(c => c.mainCategory)));
    }, [categories]);

    const subCategoryList = useMemo(() => {
        return categories.filter(c => c.mainCategory === selectedMain);
    }, [categories, selectedMain]);

    const catIdList = useMemo(() => {
        return Array.from(
            new Set(
                services
                    .map(s => s.excelCategoryId || s.categoryId?.excelCategoryId)
                    .filter(Boolean)
            )
        ).sort((a, b) => String(a).localeCompare(String(b), undefined, {numeric: true}));
    }, [services]);

    const itemNameList = useMemo(() => {
        return Array.from(
            new Set(
                services
                    .map(s => s.itemName)
                    .filter(Boolean)
            )
        ).sort((a, b) => String(a).localeCompare(String(b)));
    }, [services]);

    const skuIdList = useMemo(() => {
        return Array.from(
            new Set(
                services
                    .map(s => s.skuId)
                    .filter(Boolean)
            )
        ).sort((a, b) => String(a).localeCompare(String(b), undefined, {numeric: true}));
    }, [services]);

    const filteredServices = useMemo(() => {
        return services.filter(service => {
            const matchesCatId = !filterCatId || String(service.excelCategoryId) === String(filterCatId) || String(service.categoryId?.excelCategoryId) === String(filterCatId);
            const matchesCurrInd = !filterCurrInd || String(service.curr_ind).toLowerCase() === String(filterCurrInd).toLowerCase();
            const matchesItemName = !filterItemName || String(service.itemName).toLowerCase() === String(filterItemName).toLowerCase();
            const matchesSkuId = !filterSkuId || String(service.skuId).toLowerCase() === String(filterSkuId).toLowerCase();
            return matchesCatId && matchesCurrInd && matchesItemName && matchesSkuId;
        });
    }, [services, filterCatId, filterCurrInd, filterItemName, filterSkuId]);

    const handleOpenModal = (service = null) => {
        if (service) {
            setCurrentService(service);
            setSelectedMain(service.categoryId?.mainCategory || '');
            setFormData({
                itemName: service.itemName,
                categoryId: service.categoryId?._id || '',
                skuId: service.skuId || '',
                avgWeight: service.avgWeight || '0.5',
                seasonality: service.seasonality || 'All Season',
                estimateTAT: service.estimateTAT || '48 Hours',
                expressMultiplier: service.expressMultiplier || 2,
                gst: service.gst ?? configuredGst,
                heritageGst: service.heritageGst ?? configuredGst,
                heritageMultiplier: service.heritageMultiplier || 1.5,
                basePrice: service.basePrice,
                discountedPrice: service.discountedPrice,
                curr_ind: service.curr_ind || 'y',
                unit: service.unit || 'per_item',
                isActive: service.isActive !== undefined ? service.isActive : true,
                serviceType: service.serviceType || 'normal',
                excelCategoryId: service.excelCategoryId || '',
                sacCode: service.sacCode || '9994',
                tier: service.tier || 'Essential',
                allowDiscount: service.allowDiscount !== undefined ? service.allowDiscount : true,
                description: service.description || ''
            });
        } else {
            setCurrentService(null);
            setSelectedMain('');
            setFormData({
                itemName: '',
                categoryId: '',
                skuId: '',
                avgWeight: '0.5',
                seasonality: 'All Season',
                estimateTAT: '48 Hours',
                expressMultiplier: 2,
                gst: configuredGst,
                heritageGst: configuredGst,
                heritageMultiplier: 1.5,
                basePrice: 0,
                discountedPrice: 0,
                curr_ind: 'y',
                unit: 'per_item',
                isActive: true,
                serviceType: 'normal',
                excelCategoryId: '',
                sacCode: '9994',
                tier: 'Essential',
                allowDiscount: true,
                description: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (currentService) {
                await masterServiceApi.update(currentService._id, formData);
                toast.success('SKU updated');
            } else {
                await masterServiceApi.create(formData);
                toast.success('New SKU created');
            }
            fetchServices(pagination.page);
            setIsModalOpen(false);
        } catch (err) {
            toast.error(err.message || 'Operation failed');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this service?')) return;
        try {
            await masterServiceApi.delete(id);
            toast.success('Deleted');
            fetchServices(pagination.page);
        } catch (err) {
            toast.error('Failed');
        }
    };

    const columns = useMemo(() => [
        {
            header: 'SKU ID',
            key: 'skuId',
            render: (val) => (
                <span className="font-black text-slate-900 bg-slate-50 px-2 py-1 rounded-sm border border-slate-100 text-[10px]">
                    {val || '—'}
                </span>
            )
        },
        {
            header: 'Cat ID',
            key: 'excelCategoryId',
            render: (val) => (
                <span className="font-black text-slate-400 tabular-nums bg-slate-50 px-2 py-1 rounded-sm border border-slate-100 text-[9px]">
                    {val || '—'}
                </span>
            )
        },
        {
            header: 'SAC',
            key: 'sacCode',
            render: (val) => (
                <span className="font-bold text-slate-400 text-[10px] tracking-widest">
                    {val || '9994'}
                </span>
            )
        },
        {
            header: 'Item Name',
            key: 'itemName',
            render: (val) => <span className="font-bold text-slate-800 uppercase tracking-tight">{val}</span>
        },
        {
            header: 'Weight',
            key: 'avgWeight',
            render: (val) => (
                <div className="flex items-center gap-1.5 text-slate-500 font-bold">
                    <Weight size={10} className="text-slate-300" />
                    <span>{val || '0.5'} KG</span>
                </div>
            )
        },
        {
            header: 'Est. TAT',
            key: 'estimateTAT',
            render: (val) => {
                const formatTAT = (v) => {
                    if (!v) return '48 Hours';
                    const str = String(v).toLowerCase().trim();
                    if (str.includes('day')) {
                        const num = parseFloat(str);
                        if (!isNaN(num)) return `${num * 24} Hours`;
                    }
                    const num = parseFloat(str);
                    if (!isNaN(num) && !str.includes('hour')) {
                        if (num <= 10) return `${num * 24} Hours`;
                        return `${num} Hours`;
                    }
                    if (str.includes('hour')) {
                        const num = parseFloat(str);
                        if (!isNaN(num)) return `${num} Hours`;
                    }
                    return v;
                };
                return (
                    <div className="flex items-center gap-1.5 text-slate-500 font-bold">
                        <Clock size={10} className="text-slate-300" />
                        <span>{formatTAT(val)}</span>
                    </div>
                );
            }
        },
        {
            header: 'GST',
            key: 'gst',
            render: (val) => (
                <div className="flex items-center gap-1.5 text-slate-500 font-bold">
                    <Percent size={10} className="text-slate-300" />
                    <span>{val || '5'}%</span>
                </div>
            )
        },
        {
            header: 'Global Base Price',
            key: 'basePrice',
            render: (val) => <span className="font-bold text-slate-900">₹{val}</span>
        },
        {
            header: 'Global Discount Price',
            key: 'discountedPrice',
            render: (val) => <span className="font-black text-slate-900">₹{val}</span>
        },
        {
            header: 'Status',
            key: 'curr_ind',
            render: (val) => (
                <span className={`px-2 py-0.5 rounded-sm text-[9px] font-black uppercase tracking-widest ${val === 'y' ? 'bg-slate-900 text-white border border-slate-900' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>
                    {val || 'y'}
                </span>
            )
        },

        {
            header: 'Actions',
            key: 'actions',
            align: 'right',
            render: (val, row) => (
                <div className="flex items-center justify-end gap-2">
                    <button onClick={() => handleOpenModal(row)} className="p-2 hover:bg-slate-100 rounded-sm text-slate-400 hover:text-slate-900 transition-all">
                        <Edit2 size={14} />
                    </button>
                </div>
            )
        }
    ], [configuredGst]);

    return (
        <div className="flex flex-col min-h-screen bg-slate-50/50 pb-20">
            <PageHeader 
                title="Master Service" 
                actions={[
                    {
                        label: "Bulk Upload",
                        icon: Download,
                        onClick: () => toast.success('SKU Excel Mapping Tool Initiated'),
                        variant: 'primary'
                    },
                    {
                        label: "Add New Service",
                        icon: Plus,
                        onClick: () => handleOpenModal(),
                        variant: 'primary'
                    }
                ]}
            />

            <div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">
                <DataGrid 
                    title=""
                    showFilter={false}
                    showSearch={false}
                    actions={
                        <div className="flex items-end flex-wrap gap-2 w-full">
                            <FilterField label="Category ID" info="Shows only services in this category (by category ID).">
                            <select 
                                value={filterCatId}
                                onChange={e => setFilterCatId(e.target.value)}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-36 uppercase tracking-wider cursor-pointer"
                            >
                                <option value="">All Cat IDs</option>
                                {catIdList.map(id => <option key={id} value={id}>{id}</option>)}
                            </select>
                            </FilterField>

                            <FilterField label="Item" info="Shows only the service with this item name.">
                            <select 
                                value={filterItemName}
                                onChange={e => setFilterItemName(e.target.value)}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-36 uppercase tracking-wider cursor-pointer"
                            >
                                <option value="">All Items</option>
                                {itemNameList.map(name => <option key={name} value={name}>{name}</option>)}
                            </select>
                            </FilterField>

                            <FilterField label="SKU ID" info="Shows only the service with this SKU code.">
                            <select 
                                value={filterSkuId}
                                onChange={e => setFilterSkuId(e.target.value)}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-36 uppercase tracking-wider cursor-pointer"
                            >
                                <option value="">All SKU IDs</option>
                                {skuIdList.map(sku => <option key={sku} value={sku}>{sku}</option>)}
                            </select>
                            </FilterField>

                            <FilterField label="Current (Y/N)" info="Y = services currently offered to customers. N = services switched off (kept for history).">
                            <select 
                                value={filterCurrInd}
                                onChange={e => setFilterCurrInd(e.target.value)}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-36 uppercase tracking-wider cursor-pointer"
                            >
                                <option value="">All Status</option>
                                <option value="y">Y</option>
                                <option value="n">N</option>
                            </select>
                            </FilterField>

                            <button 
                                onClick={handleDownload}
                                className="p-2 hover:bg-slate-50 text-slate-400 hover:text-slate-900 rounded-sm border border-slate-200 bg-white flex items-center justify-center h-8 w-8 ml-auto"
                                title="Download Excel/CSV"
                            >
                                <Download size={14} />
                            </button>

                            {(filterCatId || filterCurrInd || filterItemName || filterSkuId) && (
                                <button 
                                    onClick={() => {
                                        setFilterCatId('');
                                        setFilterCurrInd('');
                                        setFilterItemName('');
                                        setFilterSkuId('');
                                    }}
                                    className="px-3 py-1.5 text-[9px] font-black text-rose-500 uppercase tracking-widest hover:bg-rose-50 rounded-sm transition-all flex items-center gap-1.5"
                                >
                                    <X size={10} /> Clear
                                </button>
                            )}
                        </div>
                    }
                    columns={columns}
                    data={filteredServices}
                    loading={isLoading}
                    pagination={pagination}
                    onPageChange={(newPage) => fetchServices(newPage)}
                />
            </div>

            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm">
                        <motion.form 
                            onSubmit={handleSubmit}
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white w-full max-w-2xl rounded-sm shadow-2xl relative border border-slate-200 max-h-[92vh] flex flex-col"
                        >
                            {/* Sticky Header */}
                            <div className="flex justify-between items-center p-5 sm:p-6 border-b border-slate-100 bg-white sticky top-0 z-10">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-slate-900 text-white flex items-center justify-center rounded-sm">
                                        <Settings size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-[12px] font-black text-slate-900 uppercase tracking-widest">{currentService ? 'Edit Service Details' : 'Register New Service'}</h3>
                                    </div>
                                </div>
                                <button type="button" onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-50 rounded-full text-slate-400">
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Scrollable Content */}
                            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 scrollbar-thin scrollbar-thumb-slate-200">
                                
                                {/* Section 1: General Information */}
                                <div className="space-y-4">
                                    <div className="border-b border-slate-100 pb-2">
                                        <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                            <Layers size={12} className="text-slate-400" />
                                            General Information
                                        </h4>
                                    </div>
                                    
                                    <div className="flex flex-col sm:flex-row gap-4 sm:gap-5">
                                        {/* Item Name */}
                                        <div className="space-y-1.5 flex-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Item Name</label>
                                            <input 
                                                required
                                                value={formData.itemName}
                                                onChange={e => setFormData({...formData, itemName: e.target.value})}
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-sm sm:text-xs font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                                placeholder="e.g. Cotton Saree"
                                            />
                                        </div>
                                        
                                        {/* SAC Code */}
                                        <div className="space-y-1.5 flex-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">SAC Code</label>
                                            <input 
                                                required
                                                value={formData.sacCode}
                                                onChange={e => setFormData({...formData, sacCode: e.target.value})}
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-sm sm:text-xs font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-col sm:flex-row gap-4 sm:gap-5">
                                        {/* Main Category */}
                                        <div className="space-y-1.5 flex-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Main Category</label>
                                            <div className="relative">
                                                <select 
                                                    required
                                                    className="w-full px-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-sm text-sm sm:text-xs font-bold text-slate-900 outline-none appearance-none cursor-pointer focus:bg-white focus:border-slate-900 transition-all"
                                                    value={selectedMain}
                                                    onChange={e => {
                                                        setSelectedMain(e.target.value);
                                                        setFormData({...formData, categoryId: ''});
                                                    }}
                                                >
                                                    <option value="">Select Category</option>
                                                    {mainCategoryList.map(m => <option key={m} value={m}>{m}</option>)}
                                                </select>
                                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                                    <ChevronDown size={14} />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Sub Category */}
                                        <div className="space-y-1.5 flex-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Sub Category</label>
                                            <div className="relative">
                                                <select 
                                                    required
                                                    disabled={!selectedMain}
                                                    className="w-full px-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-sm text-sm sm:text-xs font-bold text-slate-900 outline-none appearance-none disabled:opacity-50 cursor-pointer focus:bg-white focus:border-slate-900 transition-all"
                                                    value={formData.categoryId}
                                                    onChange={e => {
                                                        const catId = e.target.value;
                                                        const selectedCat = categories.find(c => c._id === catId);
                                                        setFormData({
                                                            ...formData, 
                                                            categoryId: catId,
                                                            excelCategoryId: selectedCat?.excelCategoryId || undefined
                                                        });
                                                    }}
                                                >
                                                    <option value="">Select Sub Category</option>
                                                    {subCategoryList.map(s => <option key={s._id} value={s._id}>{s.subCategory}</option>)}
                                                </select>
                                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                                    <ChevronDown size={14} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Section 2: Service Specifications */}
                                <div className="space-y-4 pt-2">
                                    <div className="border-b border-slate-100 pb-2">
                                        <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                            <Settings size={12} className="text-slate-400" />
                                            Service Specifications
                                        </h4>
                                    </div>

                                    <div className="flex flex-col sm:flex-row gap-4 sm:gap-5">
                                        {/* Avg Weight */}
                                        <div className="space-y-1.5 flex-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Avg Weight (KG)</label>
                                            <input 
                                                required
                                                value={formData.avgWeight}
                                                onChange={e => setFormData({...formData, avgWeight: e.target.value})}
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-sm sm:text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all"
                                            />
                                        </div>

                                        {/* Estimate TAT */}
                                        <div className="space-y-1.5 flex-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Estimate TAT</label>
                                            <input 
                                                required
                                                value={formData.estimateTAT}
                                                onChange={e => setFormData({...formData, estimateTAT: e.target.value})}
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-sm sm:text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1.5 w-full">
                                        {/* Seasonality */}
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Seasonality</label>
                                        <div className="relative">
                                            <select 
                                                required
                                                value={formData.seasonality}
                                                onChange={e => setFormData({...formData, seasonality: e.target.value})}
                                                className="w-full px-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-sm text-sm sm:text-xs font-bold text-slate-900 outline-none appearance-none cursor-pointer focus:bg-white focus:border-slate-900 transition-all"
                                            >
                                                <option value="All Season">All Season</option>
                                                <option value="Summer">Summer</option>
                                                <option value="Winter">Winter</option>
                                                <option value="Monsoon">Monsoon</option>
                                            </select>
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                                <ChevronDown size={14} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col sm:flex-row gap-4 sm:gap-5">
                                        {/* Pricing Unit */}
                                        <div className="space-y-1.5 flex-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Pricing Unit</label>
                                            <div className="flex gap-2">
                                                {[
                                                    { label: 'Per Item', value: 'per_item' },
                                                    { label: 'Per KG', value: 'per_kg' }
                                                ].map(u => (
                                                    <button 
                                                        key={u.value}
                                                        type="button"
                                                        onClick={() => setFormData({...formData, unit: u.value})}
                                                        className={`flex-1 py-3 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all border ${formData.unit === u.value ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
                                                    >
                                                        {u.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Status (Y/N) */}
                                        <div className="space-y-1.5 flex-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Status (Y/N)</label>
                                            <div className="flex gap-2">
                                                {['y', 'n'].map(opt => (
                                                    <button 
                                                        key={opt}
                                                        type="button"
                                                        onClick={() => setFormData({...formData, curr_ind: opt})}
                                                        className={`flex-1 py-3 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all border ${formData.curr_ind === opt ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
                                                    >
                                                        {opt.toUpperCase()}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Section 3: Pricing & Tax Rules */}
                                <div className="space-y-4 pt-2">
                                    <div className="border-b border-slate-100 pb-2">
                                        <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                            <Percent size={12} className="text-slate-400" />
                                            Pricing & Tax Rules
                                        </h4>
                                    </div>


                                    <div className="space-y-1.5 w-full">
                                        {/* GST (%) */}
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">GST (%)</label>
                                        <div className="relative">
                                            <select 
                                                required
                                                value={formData.gst}
                                                onChange={e => {
                                                    const val = parseFloat(e.target.value);
                                                    setFormData({ ...formData, gst: val, heritageGst: val });
                                                }}
                                                className="w-full px-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-sm text-sm sm:text-xs font-bold text-slate-900 outline-none appearance-none cursor-pointer focus:bg-white focus:border-slate-900 transition-all"
                                            >
                                                {[0, 5, 12, 18, 28].map(rate => (
                                                    <option key={rate} value={rate}>{rate}%</option>
                                                ))}
                                            </select>
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                                <ChevronDown size={14} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5 w-full">
                                        {/* Global Base Price */}
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Global Base Price</label>
                                        <input 
                                            type="number"
                                            required
                                            value={formData.basePrice}
                                            onChange={e => setFormData({...formData, basePrice: parseFloat(e.target.value)})}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-sm sm:text-xs font-bold text-slate-900 outline-none focus:border-slate-900 focus:bg-white transition-all"
                                        />
                                    </div>

                                    {/* Discounted Price - ONLY visible if curr_ind === 'y' */}
                                    {formData.curr_ind === 'y' && (
                                        <div className="space-y-1.5 w-full">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Global Discount Price</label>
                                            <input 
                                                type="number"
                                                required
                                                value={formData.discountedPrice}
                                                onChange={e => setFormData({...formData, discountedPrice: parseFloat(e.target.value) || 0})}
                                                className="w-full px-4 py-3 bg-slate-900 text-white rounded-sm text-sm sm:text-xs font-black outline-none focus:bg-slate-900/90 focus:border-slate-900 transition-all"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Sticky Footer */}
                            <div className="flex gap-4 p-5 sm:p-6 border-t border-slate-100 bg-white sticky bottom-0 z-10">
                                <button 
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="w-1/3 bg-slate-50 hover:bg-slate-100 text-slate-500 py-3.5 rounded-sm font-bold text-[10px] uppercase tracking-wider transition-all border border-slate-200"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    className="w-2/3 bg-slate-950 hover:bg-black text-white py-3.5 rounded-sm font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-slate-900/10 transition-all border border-slate-900"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </motion.form>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default MasterServiceManagement;
