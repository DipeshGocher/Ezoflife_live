import MultiSelectFilter from '../components/common/MultiSelectFilter';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { vendorMasterSupplyApi, vendorSupplyCategoryApi, mediaApi } from '../../../lib/api';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import { 
    Plus, Edit2, X, Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, PlusCircle
} from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import DataGrid from '../components/tables/DataGrid';

const VendorProductTableManagement = () => {
    const [supplies, setSupplies] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [editingSupply, setEditingSupply] = useState(null);

    const [formData, setFormData] = useState({
        materialName: '',
        categoryId: '',
        hsnCode: '2800',
        gst: '18',
        brand: 'Generic',
        quantity: '1 Unit',
        wholesaleRate: '',
        bulkDiscount: '0',
        bulkThreshold: '0',
        isActive: 'y',
        deliveryFrequency: 'Weekly',
        movFreeDelivery: '0',
        supplierId: 'SUP-001',
        supplierFacilityName: 'Main Facility',
        description: '',
        images: []
    });

    const [filters, setFilters] = useState({
        materialName: '',
        categoryId: '',
        isActive: ''
    });

    const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

    // Bulk upload state
    const [bulkFile, setBulkFile] = useState(null);
    const [bulkPreview, setBulkPreview] = useState([]);
    const [bulkUploading, setBulkUploading] = useState(false);
    const [bulkResult, setBulkResult] = useState(null);
    const [bulkError, setBulkError] = useState('');
    const fileInputRef = useRef(null);

    const fetchCategories = async () => {
        try {
            const list = await vendorSupplyCategoryApi.getAll();
            setCategories(Array.isArray(list) ? list : []);
        } catch (err) {
            console.error('Failed to load categories', err);
        }
    };

    const latestFilterRequest = React.useRef(0);
    const fetchSupplies = async (page = 1, activeFilters = filters) => {
        const requestId = ++latestFilterRequest.current;
        try {
            setLoading(true);
            const result = await vendorMasterSupplyApi.getPaginated(page, pagination.limit, {
                ...activeFilters,
                isTemplate: 'y'
            });
            if (requestId !== latestFilterRequest.current) return;
            
            if (result.data && result.pagination) {
                setSupplies(result.data);
                setPagination(result.pagination);
            } else {
                setSupplies(Array.isArray(result) ? result : []);
            }
        } catch (error) {
            if (requestId !== latestFilterRequest.current) return;
            toast.error('Failed to fetch supplies');
        } finally {
            if (requestId === latestFilterRequest.current) setLoading(false);
        }
    };

    useEffect(() => {
        fetchCategories();
        fetchSupplies(1);
    }, []);

    const handleFilterChange = (key, value) => {
        const updatedFilters = { ...filters, [key]: value };
        setFilters(updatedFilters);
        fetchSupplies(1, updatedFilters);
    };

    const handleDownload = () => {
        if (!supplies || supplies.length === 0) {
            toast.error('No supplies available to download');
            return;
        }
        const headers = [
            'SKU ID', 'Category ID', 'HSN Code', 'GST (%)', 'Brand', 
            'Material Name', 'Quantity', 'Wholesale Rate (INR)', 
            'Bulk Discount (%)', 'Bulk Threshold', 'Active', 
            'Delivery Frequency', 'MOV for Free Delivery', 
            'Supplier ID', 'Supplier Facility Name'
        ];
        const rows = supplies.map(item => [
            item.skuId || '—',
            item.categoryId?.excelCategoryId || '—',
            item.hsnCode || '',
            item.gst || 0,
            item.brand || '',
            item.materialName || '',
            item.quantity || '',
            item.wholesaleRate || 0,
            item.bulkDiscount || 0,
            item.bulkThreshold || 0,
            item.isActive || 'y',
            item.deliveryFrequency || '',
            item.movFreeDelivery || 0,
            item.supplierId || '',
            item.supplierFacilityName || ''
        ]);

        const csvRows = [
            headers.join(','),
            ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Vendor_Supplies_Registry_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('CSV downloaded successfully');
    };

    const handleDownloadTemplate = () => {
        const headers = [
            'materialName', 'mainCategory', 'subCategory', 'hsnCode', 'gst', 
            'brand', 'quantity', 'wholesaleRate', 'bulkDiscount', 'bulkThreshold', 
            'isActive', 'deliveryFrequency', 'movFreeDelivery', 'supplierId', 'supplierFacilityName'
        ];
        const sample = [
            ['Ultra Clean Liquid Soap', 'Supplier Category A', 'Item Type X', '2800', '18', 'Generic', '10 Litres', '450', '5', '10', 'y', 'Weekly', '2000', 'SUP-001', 'Main Facility'],
            ['Specialist Spray Solvent', 'Supplier Category B', 'Item Type Y', '2800', '18', 'Brand Y', '5 Litres', '320', '8', '20', 'y', 'Bi-weekly', '1500', 'SUP-002', 'North Facility'],
            ['Soft Fiber Dryer Sheets', 'Supplier Category C', 'Item Type Z', '2800', '18', 'Brand Z', '100 Pcs', '120', '0', '0', 'n', 'Monthly', '0', 'SUP-001', 'Main Facility']
        ];
        const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Supplies');
        XLSX.writeFile(wb, 'Vendor_Supplies_Bulk_Upload_Template.xlsx');
        toast.success('Template downloaded!');
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setBulkFile(file);
        setBulkResult(null);
        setBulkError('');
        setBulkPreview([]);

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = evt.target.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

                if (jsonData.length === 0) {
                    setBulkError('The file appears to be empty or has no readable rows.');
                    return;
                }

                const normalised = jsonData.map((row, idx) => {
                    const materialName = row['materialName'] || row['Material Name'] || row['name'] || row['Name'] || '';
                    const mainCat = row['mainCategory'] || row['Main Category'] || row['category'] || row['Category'] || '';
                    const subCat = row['subCategory'] || row['Sub Category'] || row['subcategory'] || '';
                    const hsnCode = row['hsnCode'] || row['HSN Code'] || row['hsn'] || '-';
                    const gst = row['gst'] || row['GST'] || 18;
                    const brand = row['brand'] || row['Brand'] || 'Generic';
                    const quantity = row['quantity'] || row['Quantity'] || '-';
                    const wholesaleRate = row['wholesaleRate'] || row['Wholesale Rate'] || row['price'] || row['Price'] || 0;
                    const bulkDiscount = row['bulkDiscount'] || row['Bulk Discount'] || 0;
                    const bulkThreshold = row['bulkThreshold'] || row['Bulk Threshold'] || 0;
                    const isActive = String(row['isActive'] || row['Active'] || 'y').toLowerCase().trim();
                    const deliveryFrequency = row['deliveryFrequency'] || row['Delivery Frequency'] || '-';
                    const movFreeDelivery = row['movFreeDelivery'] || row['MOV for Free Delivery'] || 0;
                    const supplierId = row['supplierId'] || row['Supplier ID'] || '-';
                    const supplierFacilityName = row['supplierFacilityName'] || row['Supplier Facility Name'] || '-';

                    const matchingCatObj = categories.find(c => 
                        String(c.mainCategory).trim().toLowerCase() === String(mainCat).trim().toLowerCase() &&
                        String(c.subCategory).trim().toLowerCase() === String(subCat).trim().toLowerCase()
                    );

                    return {
                        _rowIndex: idx + 2,
                        materialName: String(materialName).trim(),
                        mainCategory: String(mainCat).trim(),
                        subCategory: String(subCat).trim(),
                        hsnCode: String(hsnCode).trim(),
                        gst: Number(gst) || 18,
                        brand: String(brand).trim(),
                        quantity: String(quantity).trim(),
                        wholesaleRate: Number(wholesaleRate) || 0,
                        bulkDiscount: Number(bulkDiscount) || 0,
                        bulkThreshold: Number(bulkThreshold) || 0,
                        isActive: (isActive === 'n' || isActive === 'no' || isActive === 'false') ? 'n' : 'y',
                        deliveryFrequency: String(deliveryFrequency).trim(),
                        movFreeDelivery: Number(movFreeDelivery) || 0,
                        supplierId: String(supplierId).trim(),
                        supplierFacilityName: String(supplierFacilityName).trim(),
                        _valid: !!String(materialName).trim() && !!matchingCatObj,
                        _missingCategory: !matchingCatObj
                    };
                });

                const invalid = normalised.filter(r => !r._valid).length;
                const missingCats = normalised.filter(r => r._missingCategory).length;
                if (missingCats > 0) {
                    setBulkError(`${missingCats} row(s) references a category name/subcategory combination that doesn't exist in Category Management and will fail.`);
                } else if (invalid > 0) {
                    setBulkError(`${invalid} row(s) are missing required fields and will be skipped.`);
                }
                setBulkPreview(normalised);
            } catch (err) {
                console.error(err);
                setBulkError('Could not parse the file. Please upload a valid .xlsx, .xls, or .csv file.');
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleBulkUpload = async () => {
        const validRows = bulkPreview.filter(r => r._valid).map(({ _rowIndex, _valid, _missingCategory, ...rest }) => rest);
        if (validRows.length === 0) {
            toast.error('No valid rows to upload.');
            return;
        }

        setBulkUploading(true);
        setBulkResult(null);
        try {
            const result = await vendorMasterSupplyApi.bulkUpload(validRows);
            setBulkResult(result);
            toast.success(`Upload done! Created: ${result.results?.created ?? '?'}, Skipped: ${result.results?.skipped ?? '?'}`);
            fetchSupplies(1);
        } catch (err) {
            toast.error(err.message || 'Bulk upload failed');
        } finally {
            setBulkUploading(false);
        }
    };

    const resetBulkModal = () => {
        setBulkFile(null);
        setBulkPreview([]);
        setBulkResult(null);
        setBulkError('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleOpenModal = (supply = null) => {
        if (supply) {
            setEditingSupply(supply);
            setFormData({
                materialName: supply.materialName || '',
                categoryId: supply.categoryId?._id || '',
                hsnCode: supply.hsnCode || '2800',
                gst: supply.gst || '18',
                brand: supply.brand || 'Generic',
                quantity: supply.quantity || '1 Unit',
                wholesaleRate: supply.wholesaleRate || '',
                bulkDiscount: supply.bulkDiscount || '0',
                bulkThreshold: supply.bulkThreshold || '0',
                isActive: supply.isActive || 'y',
                deliveryFrequency: supply.deliveryFrequency || 'Weekly',
                movFreeDelivery: supply.movFreeDelivery || '0',
                supplierId: supply.supplierId || 'SUP-001',
                supplierFacilityName: supply.supplierFacilityName || 'Main Facility',
                description: supply.description || '',
                images: supply.images || []
            });
        } else {
            setEditingSupply(null);
            setFormData({
                materialName: '',
                categoryId: categories[0]?._id || '',
                hsnCode: '-',
                gst: '18',
                brand: 'Generic',
                quantity: '-',
                wholesaleRate: '',
                bulkDiscount: '0',
                bulkThreshold: '0',
                isActive: 'y',
                deliveryFrequency: '-',
                movFreeDelivery: '0',
                supplierId: '-',
                supplierFacilityName: '-',
                description: '',
                images: []
            });
        }
        setIsModalOpen(true);
    };

    const [uploadingImages, setUploadingImages] = useState(false);

    const handleImageUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        
        setUploadingImages(true);
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
            setFormData(prev => ({
                ...prev,
                images: [...(prev.images || []), ...uploadedUrls]
            }));
            toast.success('Images uploaded successfully!');
        } catch (error) {
            console.error('Upload Error:', error);
            toast.error('Failed to upload images');
        } finally {
            setUploadingImages(false);
            e.target.value = ''; // Reset file input
        }
    };

    const handleRemoveImage = (indexToRemove) => {
        setFormData(prev => ({
            ...prev,
            images: (prev.images || []).filter((_, idx) => idx !== indexToRemove)
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...formData,
                gst: Number(formData.gst) || 18,
                wholesaleRate: Number(formData.wholesaleRate) || 0,
                bulkDiscount: Number(formData.bulkDiscount) || 0,
                bulkThreshold: Number(formData.bulkThreshold) || 0,
                movFreeDelivery: Number(formData.movFreeDelivery) || 0
            };
            if (editingSupply) {
                await vendorMasterSupplyApi.update(editingSupply._id, payload);
                toast.success('Supply item updated');
            } else {
                await vendorMasterSupplyApi.create(payload);
                toast.success('Supply item created');
            }
            setIsModalOpen(false);
            fetchSupplies(pagination.page);
        } catch (error) {
            toast.error(error.message || 'Operation failed');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this supply item?')) {
            try {
                await vendorMasterSupplyApi.delete(id);
                toast.success('Supply item deleted');
                fetchSupplies(pagination.page);
            } catch (error) {
                toast.error(error.message || 'Failed to delete');
            }
        }
    };

    const skuPreviewStr = useMemo(() => {
        const cat = categories.find(c => c._id === formData.categoryId);
        if (!cat) return 'SPZ-SUP-[CAT]-[SUB]-[SER]';
        
        const prefix1 = "spz";
        const prefix2 = "sup";
        
        let catPart = cat.mainCategory ? cat.mainCategory.trim().replace(/[^a-zA-Z\s]/g, '').slice(0, 3).toLowerCase() : "cat";
        if (!catPart) catPart = "cat";

        let subPart = "sub";
        if (cat.subCategory) {
            const words = cat.subCategory.trim().replace(/[^a-zA-Z\s]/g, '').split(/\s+/).filter(Boolean);
            if (words.length >= 2) {
                subPart = (words[0][0] + words[1][0]).toLowerCase();
            } else if (words.length === 1) {
                subPart = words[0].slice(0, 2).toLowerCase();
            }
            if (!subPart) subPart = "sub";
        }
        
        return `${prefix1}-${prefix2}-${catPart}-${subPart}-[AUTO]`.toUpperCase();
    }, [formData.categoryId, categories]);

    const columns = useMemo(() => [
        {
            header: 'SKU ID (PK)',
            key: 'skuId',
            render: (val) => (
                <span className="font-black text-slate-900 tabular-nums bg-slate-100/70 px-2 py-0.5 rounded-sm border border-slate-200 uppercase tracking-widest text-[9px] whitespace-nowrap">
                    {val || '—'}
                </span>
            )
        },
        {
            header: 'Category_Subcat_ID (FK)',
            key: 'categoryId.excelCategoryId',
            render: (val, row) => (
                <span className="font-bold text-slate-700 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-sm tabular-nums text-[9px]">
                    {row.categoryId?.excelCategoryId || '—'}
                </span>
            )
        },
        {
            header: 'Brand',
            key: 'brand',
            render: (val) => (
                <span className="text-slate-600 font-black uppercase tracking-wider text-[9px]">{val || 'Generic'}</span>
            )
        },
        {
            header: 'HSN Code',
            key: 'hsnCode',
            render: (val) => (
                <span className="text-slate-600 font-bold tabular-nums text-[10px] bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-sm">
                    {!val || val === '-' ? '—' : val}
                </span>
            )
        },
        {
            header: 'GST',
            key: 'gst',
            render: (val) => (
                <span className="text-slate-500 font-bold tabular-nums text-[10px]">{val || 18}%</span>
            )
        },
        {
            header: 'Material Name',
            key: 'materialName',
            render: (val) => (
                <span className="font-bold uppercase tracking-tight text-slate-800 whitespace-nowrap">{val}</span>
            )
        },
        {
            header: 'Images',
            key: 'images',
            render: (val) => {
                if (!val || val.length === 0) {
                    return <span className="text-slate-400 text-[10px] italic">No images</span>;
                }
                return (
                    <div className="flex items-center gap-1 max-w-[120px] overflow-x-auto py-1">
                        {val.map((url, idx) => (
                            <img 
                                key={idx} 
                                src={url} 
                                alt="supply preview" 
                                className="w-8 h-8 rounded border border-slate-200 object-cover flex-shrink-0"
                            />
                        ))}
                    </div>
                );
            }
        },
        {
            header: 'Description',
            key: 'description',
            render: (val) => (
                <span className="text-[10px] text-slate-500 font-medium line-clamp-2 max-w-[200px]" title={val}>
                    {val || '—'}
                </span>
            )
        },
        {
            header: 'Active',
            key: 'isActive',
            render: (val) => (
                <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase ${val === 'y' ? 'bg-slate-900 text-white border border-slate-900' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>
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
                        <Edit2 size={13} />
                    </button>
                    <button onClick={() => handleDelete(row._id)} className="p-2 hover:bg-red-50 rounded-sm text-slate-400 hover:text-red-600 transition-all">
                        <X size={13} />
                    </button>
                </div>
            )
        }
    ], [categories]);

    const validCount = bulkPreview.filter(r => r._valid).length;
    const invalidCount = bulkPreview.filter(r => !r._valid).length;

    return (
        <div className="flex flex-col min-h-screen bg-slate-50/50 pb-20">
            <PageHeader 
                title="Product Table" 
                actions={[
                    {
                        label: "Bulk Upload",
                        icon: Upload,
                        onClick: () => { resetBulkModal(); setIsBulkModalOpen(true); },
                        variant: 'primary'
                    },
                    {
                        label: "Add Supply Item",
                        icon: Plus,
                        onClick: () => handleOpenModal(),
                        variant: 'primary'
                    }
                ]}
            />

            <div className="p-6 space-y-6 max-w-[1800px] mx-auto w-full overflow-x-auto">
                <DataGrid 
                    title=""
                    showFilter={false}
                    showSearch={false}
                    actions={
                        <div className="flex flex-col sm:flex-row w-full sm:w-auto gap-2">
                            <div className="w-full sm:w-auto">
                                <MultiSelectFilter
                                    value={filters.categoryId}
                                    onChange={(e) => handleFilterChange('categoryId', e.target.value)}
                                    className="w-full sm:w-52 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none uppercase tracking-wider cursor-pointer"
                                >
                                    <option value="">All Categories & Sub Cats</option>
                                    {categories.map(cat => (
                                        <option key={cat._id} value={cat._id}>
                                            {cat.mainCategory} — {cat.subCategory}
                                        </option>
                                    ))}
                                </MultiSelectFilter>
                            </div>
                            <div className="flex w-full sm:w-auto items-center justify-between sm:justify-start gap-2">
                                <MultiSelectFilter
                                    value={filters.isActive}
                                    onChange={(e) => handleFilterChange('isActive', e.target.value)}
                                    className="w-auto sm:w-28 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none uppercase tracking-wider cursor-pointer"
                                >
                                    <option value="">All Status</option>
                                    <option value="y">Active (Y)</option>
                                    <option value="n">Inactive (N)</option>
                                </MultiSelectFilter>
                                
                                <div className="flex items-center gap-2">
                                    {(filters.categoryId || filters.isActive !== '') && (
                                        <button 
                                            onClick={() => {
                                                const cleared = { categoryId: '', isActive: '' };
                                                setFilters(cleared);
                                                fetchSupplies(1, cleared);
                                            }}
                                            className="px-3 py-1.5 border border-slate-200 text-slate-400 hover:text-slate-900 hover:border-slate-900 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all bg-white"
                                        >
                                            Reset
                                        </button>
                                    )}
                                    <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />
                                    <button 
                                        onClick={handleDownload} 
                                        className="p-1.5 sm:p-2 bg-slate-50 border border-slate-200 sm:border-transparent sm:bg-transparent text-slate-400 hover:text-slate-900 rounded-sm" 
                                        title="Download Excel/CSV"
                                    >
                                        <Download size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    }
                    columns={columns}
                    data={supplies}
                    loading={loading}
                    pagination={pagination}
                    onPageChange={(newPage) => fetchSupplies(newPage)}
                />
            </div>

            {/* ─── Single Item Modal ─────────────────────────────────────────── */}
            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setIsModalOpen(false)}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                        />
                        <motion.form 
                            onSubmit={handleSubmit}
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="relative w-full max-w-2xl bg-white rounded-sm p-10 shadow-2xl space-y-6 border border-slate-200 overflow-y-auto max-h-[90vh]"
                        >
                            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-slate-900 text-white flex items-center justify-center rounded-sm">
                                        <PlusCircle size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-[12px] font-black text-slate-900 uppercase tracking-widest">{editingSupply ? 'Update Supply Item' : 'New Supply Item'}</h3>
                                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">SKU auto-generated on save</p>
                                    </div>
                                </div>
                                <button type="button" onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-50 rounded-full text-slate-400">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-1.5 col-span-2">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Material Name *</label>
                                    <input 
                                        type="text" required
                                        value={formData.materialName}
                                        onChange={(e) => setFormData({ ...formData, materialName: e.target.value })}
                                        placeholder="E.g. Caustic Soda Flakes"
                                        className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-sm text-xs font-bold text-slate-800 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5 col-span-2">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Category & Sub Category *</label>
                                    <select required
                                        value={formData.categoryId}
                                        onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                                        className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-sm text-xs font-bold text-slate-800 focus:bg-white focus:border-slate-900 transition-all outline-none uppercase tracking-widest"
                                    >
                                        {categories.map(cat => (
                                            <option key={cat._id} value={cat._id}>
                                                {cat.mainCategory} — {cat.subCategory}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Brand Name</label>
                                    <input 
                                        type="text"
                                        value={formData.brand}
                                        onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                                        className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-sm text-xs font-bold text-slate-800 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">HSN Code</label>
                                    <input 
                                        type="text"
                                        value={formData.hsnCode}
                                        onChange={(e) => setFormData({ ...formData, hsnCode: e.target.value })}
                                        placeholder="E.g. 2801, 3402"
                                        className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-sm text-xs font-bold text-slate-800 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">GST (%)</label>
                                    <input 
                                        type="number"
                                        value={formData.gst}
                                        onChange={(e) => setFormData({ ...formData, gst: e.target.value })}
                                        className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-sm text-xs font-bold text-slate-800 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Wholesale Rate (₹) *</label>
                                    <input 
                                        type="number" required min="0"
                                        value={formData.wholesaleRate}
                                        onChange={(e) => setFormData({ ...formData, wholesaleRate: e.target.value })}
                                        placeholder="E.g. 500"
                                        className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-sm text-xs font-bold text-slate-800 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Quantity / Stock Unit *</label>
                                    <input 
                                        type="text" required
                                        value={formData.quantity}
                                        onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                                        placeholder="E.g. 25 Kg Bag, 100 Units"
                                        className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-sm text-xs font-bold text-slate-800 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Supplier ID</label>
                                    <input 
                                        type="text"
                                        value={formData.supplierId}
                                        onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                                        placeholder="E.g. SUP-001"
                                        className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-sm text-xs font-bold text-slate-800 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Supplier Facility Name</label>
                                    <input 
                                        type="text"
                                        value={formData.supplierFacilityName}
                                        onChange={(e) => setFormData({ ...formData, supplierFacilityName: e.target.value })}
                                        placeholder="E.g. Central Warehouse"
                                        className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-sm text-xs font-bold text-slate-800 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Bulk Discount (%)</label>
                                    <input 
                                        type="number" min="0" max="100"
                                        value={formData.bulkDiscount}
                                        onChange={(e) => setFormData({ ...formData, bulkDiscount: e.target.value })}
                                        placeholder="0"
                                        className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-sm text-xs font-bold text-slate-800 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Bulk Threshold (Units)</label>
                                    <input 
                                        type="number" min="0"
                                        value={formData.bulkThreshold}
                                        onChange={(e) => setFormData({ ...formData, bulkThreshold: e.target.value })}
                                        placeholder="0"
                                        className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-sm text-xs font-bold text-slate-800 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5 col-span-2">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Active Status</label>
                                    <select
                                        value={formData.isActive}
                                        onChange={(e) => setFormData({ ...formData, isActive: e.target.value })}
                                        className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-sm text-xs font-bold text-slate-800 focus:bg-white focus:border-slate-900 transition-all outline-none uppercase tracking-widest"
                                    >
                                        <option value="y">Active (Y)</option>
                                        <option value="n">Inactive (N)</option>
                                    </select>
                                </div>

                                <div className="space-y-1.5 col-span-2">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Product Description</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        placeholder="Enter detailed description of the supply product..."
                                        rows={3}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-xs font-bold text-slate-800 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                    />
                                </div>

                                <div className="space-y-2 col-span-2">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Product Images</label>
                                    <div className="flex flex-wrap gap-3 p-4 border border-dashed border-slate-200 rounded-sm bg-slate-50/50">
                                        {formData.images && formData.images.map((url, idx) => (
                                            <div key={idx} className="relative w-20 h-20 group border border-slate-200 rounded-sm bg-white overflow-hidden shadow-sm">
                                                <img src={url} alt="product" className="w-full h-full object-cover" />
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveImage(idx)}
                                                    className="absolute -top-1.5 -right-1.5 bg-red-500 hover:bg-red-650 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                                                    title="Remove Image"
                                                >
                                                    <X size={10} />
                                                </button>
                                            </div>
                                        ))}
                                        <label className={`w-20 h-20 flex flex-col items-center justify-center border border-dashed border-slate-300 rounded-sm cursor-pointer hover:bg-white hover:border-slate-900 transition-all relative ${uploadingImages ? 'pointer-events-none opacity-50' : ''}`}>
                                            <input
                                                type="file"
                                                multiple
                                                accept="image/*"
                                                onChange={handleImageUpload}
                                                className="hidden"
                                            />
                                            {uploadingImages ? (
                                                <Loader2 size={16} className="animate-spin text-slate-400" />
                                            ) : (
                                                <>
                                                    <Plus size={16} className="text-slate-400" />
                                                    <span className="text-[8px] font-black text-slate-400 uppercase mt-1">Upload</span>
                                                </>
                                            )}
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-4 border-t border-slate-100 pt-6">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 border border-slate-200 text-slate-400 hover:text-slate-950 font-black text-[10px] uppercase tracking-widest hover:border-slate-950 transition-all rounded-sm">
                                    Cancel
                                </button>
                                <button type="submit" className="flex-1 py-4 bg-slate-950 text-white font-black text-[10px] uppercase tracking-widest shadow-xl shadow-slate-900/10 active:scale-95 transition-all rounded-sm">
                                    {editingSupply ? 'Update Supply' : 'Save Supply'}
                                </button>
                            </div>
                        </motion.form>
                    </div>
                )}
            </AnimatePresence>

            {/* ─── Bulk Upload Modal ─────────────────────────────────────────── */}
            <AnimatePresence>
                {isBulkModalOpen && (
                    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setIsBulkModalOpen(false)}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                        />
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="relative w-full max-w-4xl bg-white rounded-sm p-10 shadow-2xl space-y-6 border border-slate-200 max-h-[90vh] flex flex-col"
                        >
                            <div className="flex justify-between items-center border-b border-slate-100 pb-4 flex-shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-slate-900 text-white flex items-center justify-center rounded-sm">
                                        <Upload size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-[12px] font-black text-slate-900 uppercase tracking-widest">Bulk Supplies Upload</h3>
                                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">Upload excel sheets containing supplies data</p>
                                    </div>
                                </div>
                                <button type="button" onClick={() => setIsBulkModalOpen(false)} className="p-2 hover:bg-slate-50 rounded-full text-slate-400">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto space-y-6 custom-scrollbar pr-2">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="border border-dashed border-slate-200 rounded-sm p-8 flex flex-col items-center justify-center bg-slate-50/50 hover:bg-slate-50 transition-all relative">
                                        <input 
                                            type="file" ref={fileInputRef}
                                            onChange={handleFileChange}
                                            accept=".xlsx,.xls,.csv"
                                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                        />
                                        <FileSpreadsheet className="text-slate-400 mb-2" size={28} />
                                        <p className="text-[9px] font-black uppercase tracking-wider text-slate-600">
                                            {bulkFile ? bulkFile.name : 'Choose Excel / CSV File'}
                                        </p>
                                        <p className="text-[8px] font-bold text-slate-400 mt-1 uppercase tracking-widest">drag and drop works too</p>
                                    </div>

                                    <div className="border border-slate-100 p-6 rounded-sm bg-slate-50/30 flex flex-col justify-between">
                                        <div className="space-y-1.5">
                                            <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-wider">Instructions</h4>
                                            <p className="text-[9px] font-bold text-slate-400 leading-relaxed uppercase">
                                                Download the excel template, fill in all columns, and re-upload. Category name combinations must exist in category config, and materialName is mandatory.
                                            </p>
                                        </div>
                                        <button 
                                            onClick={handleDownloadTemplate}
                                            className="w-full mt-4 py-3 border border-slate-950 text-slate-950 font-black text-[9px] uppercase tracking-widest hover:bg-slate-950 hover:text-white transition-all rounded-sm flex items-center justify-center gap-2"
                                        >
                                            <Download size={13} />
                                            Download Template
                                        </button>
                                    </div>
                                </div>

                                {bulkError && (
                                    <div className="p-4 bg-amber-50 border border-amber-100 text-amber-800 text-[10px] font-bold rounded-sm uppercase tracking-wide flex gap-2 items-center">
                                        <AlertTriangle size={15} className="flex-shrink-0" />
                                        <span>{bulkError}</span>
                                    </div>
                                )}

                                {bulkResult && (
                                    <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 text-[10px] font-bold rounded-sm uppercase tracking-wide flex gap-2 items-center">
                                        <CheckCircle2 size={15} className="flex-shrink-0" />
                                        <span>
                                            Successfully imported {bulkResult.results?.created ?? 0} supply records. Skipped: {bulkResult.results?.skipped ?? 0}.
                                        </span>
                                    </div>
                                )}

                                {bulkPreview.length > 0 && (
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-wider">Preview ({bulkPreview.length} items parsed)</h4>
                                            <div className="flex gap-2">
                                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded text-[8px] font-black uppercase tracking-wider">{validCount} Valid</span>
                                                {invalidCount > 0 && (
                                                    <span className="px-2 py-0.5 bg-red-50 text-red-600 border border-red-100 rounded text-[8px] font-black uppercase tracking-wider">{invalidCount} Invalid / Skipped</span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="border border-slate-100 rounded-sm overflow-hidden">
                                            <div className="overflow-x-auto max-h-60 custom-scrollbar">
                                                <table className="w-full text-left border-collapse text-[10px]">
                                                    <thead>
                                                        <tr className="bg-slate-50 border-b border-slate-150">
                                                            <th className="p-2.5 font-bold uppercase text-[8px] tracking-widest text-slate-400 w-10 text-center">Row</th>
                                                            <th className="p-2.5 font-bold uppercase text-[8px] tracking-widest text-slate-400">Material Name</th>
                                                            <th className="p-2.5 font-bold uppercase text-[8px] tracking-widest text-slate-400">Category (Main - Sub)</th>
                                                            <th className="p-2.5 font-bold uppercase text-[8px] tracking-widest text-slate-400">Brand</th>
                                                            <th className="p-2.5 font-bold uppercase text-[8px] tracking-widest text-slate-400">Wholesale Rate</th>
                                                            <th className="p-2.5 font-bold uppercase text-[8px] tracking-widest text-slate-400">Status</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {bulkPreview.map((row, idx) => (
                                                            <tr key={idx} className={`border-b border-slate-50 ${row._valid ? 'hover:bg-slate-50/50' : 'bg-red-50/30'}`}>
                                                                <td className="p-2.5 text-center text-slate-400 font-bold tabular-nums">{row._rowIndex}</td>
                                                                <td className="p-2.5 font-bold text-slate-900">{row.materialName || <span className="text-red-500 italic">Missing Name</span>}</td>
                                                                <td className="p-2.5 font-medium text-slate-700">
                                                                    {row.mainCategory} — {row.subCategory}
                                                                    {row._missingCategory && <span className="block text-[8px] text-red-500 font-bold mt-0.5">Category not found</span>}
                                                                </td>
                                                                <td className="p-2.5 text-slate-500">{row.brand}</td>
                                                                <td className="p-2.5 font-bold text-slate-800 tabular-nums">₹{row.wholesaleRate}</td>
                                                                <td className="p-2.5">
                                                                    <span className={`px-1.5 py-0.2 rounded text-[8px] font-black uppercase ${row._valid ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                                                                        {row._valid ? 'Valid' : 'Invalid'}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-4 border-t border-slate-100 pt-6 flex-shrink-0">
                                <button 
                                    onClick={resetBulkModal}
                                    className="flex-1 py-4 border border-slate-200 text-slate-400 hover:text-slate-955 font-black text-[10px] uppercase tracking-widest hover:border-slate-950 transition-all rounded-sm"
                                >
                                    Reset
                                </button>
                                <button 
                                    onClick={handleBulkUpload}
                                    disabled={validCount === 0 || bulkUploading}
                                    className="flex-1 py-4 bg-slate-950 hover:bg-slate-900 disabled:bg-slate-100 text-white disabled:text-slate-400 font-black text-[10px] uppercase tracking-widest shadow-xl shadow-slate-900/10 transition-all rounded-sm flex items-center justify-center gap-2"
                                >
                                    {bulkUploading ? (
                                        <>
                                            <Loader2 size={13} className="animate-spin" />
                                            Uploading...
                                        </>
                                    ) : (
                                        `Import ${validCount} Items`
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default VendorProductTableManagement;
