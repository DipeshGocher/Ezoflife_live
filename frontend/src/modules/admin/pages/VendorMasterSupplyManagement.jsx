import MultiSelectFilter from '../components/common/MultiSelectFilter';
import { appDialog } from '../../../shared/stores/appDialogStore';
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
import FilterField from "../components/common/FilterLabel";

const VendorMasterSupplyManagement = () => {
    const [supplies, setSupplies] = useState([]);
    const [categories, setCategories] = useState([]);
    const [uniqueSuppliers, setUniqueSuppliers] = useState([]);
    const [uniqueFrequencies, setUniqueFrequencies] = useState([]);
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
        isActive: '',
        supplierId: '',
        deliveryFrequency: '',
        wholesaleRate: ''
    });

    const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

    // Bulk upload state
    const [bulkFile, setBulkFile] = useState(null);
    const [bulkPreview, setBulkPreview] = useState([]);
    const [bulkUploading, setBulkUploading] = useState(false);
    const [bulkResult, setBulkResult] = useState(null);
    const [bulkError, setBulkError] = useState('');
    const fileInputRef = useRef(null);

    // Fetch all category helper list
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
                isTemplate: 'n'
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
            toast.error('Failed to fetch master supplies');
        } finally {
            if (requestId === latestFilterRequest.current) setLoading(false);
        }
    };

    const handleFilterChange = (key, value) => {
        const updatedFilters = { ...filters, [key]: value };
        setFilters(updatedFilters);
        fetchSupplies(1, updatedFilters);
    };

    const handleDownload = () => {
        if (!supplies || supplies.length === 0) {
            toast.error('No master supplies available to download');
            return;
        }
        const headers = ['Zone', 'SKU ID', 'Category ID', 'HSN Code', 'GST', 'Brand', 'Material Name', 'Quantity', 'Wholesale Rate', 'Bulk Discount (%)', 'Bulk Threshold', 'Active', 'Delivery Frequency', 'MOV Free Delivery', 'Supplier ID', 'Supplier Facility Name', 'Platform Fee Rule', 'Platform Fee / Unit (est.)'];
        const rows = supplies.map(s => [
            s.zoneName || '—',
            s.skuId || '—',
            s.categoryId?.excelCategoryId || '—',
            s.hsnCode || '-',
            s.gst || 18,
            s.brand || 'Generic',
            s.materialName || '',
            s.quantity || '',
            s.wholesaleRate || 0,
            s.bulkDiscount || 0,
            s.bulkThreshold || 0,
            s.isActive || 'y',
            s.deliveryFrequency || '-',
            s.movFreeDelivery || 0,
            s.supplierId || '-',
            s.supplierFacilityName || '-',
            s.platformFeeLabel || 'No fee',
            s.platformFeeRule?.type === 'PERCENTAGE'
                ? ((s.wholesaleRate || 0) * (s.platformFeeRule.value || 0) / 100).toFixed(2)
                : ''
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

    // Download a sample template the user can fill and re-upload
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

    // Parse uploaded file (Excel or CSV) into a preview array
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

                // Normalise column names
                const normalised = jsonData.map((row, idx) => {
                    const materialName = row['materialName'] || row['Material Name'] || row['name'] || row['Name'] || '';
                    const mainCat = row['mainCategory'] || row['Main Category'] || row['category'] || row['Category'] || '';
                    const subCat = row['subCategory'] || row['Sub Category'] || row['subcategory'] || row['SubCategory'] || '';
                    const hsnCode = row['hsnCode'] || row['HSN Code'] || row['hsn'] || '2800';
                    const gst = row['gst'] || row['GST'] || 18;
                    const brand = row['brand'] || row['Brand'] || 'Generic';
                    const quantity = row['quantity'] || row['Quantity'] || '1 Unit';
                    const wholesaleRate = row['wholesaleRate'] || row['Wholesale Rate'] || row['price'] || row['Price'] || 0;
                    const bulkDiscount = row['bulkDiscount'] || row['Bulk Discount'] || 0;
                    const bulkThreshold = row['bulkThreshold'] || row['Bulk Threshold'] || 0;
                    const isActive = String(row['isActive'] || row['Active'] || 'y').toLowerCase().trim();
                    const deliveryFrequency = row['deliveryFrequency'] || row['Delivery Frequency'] || 'Weekly';
                    const movFreeDelivery = row['movFreeDelivery'] || row['MOV for Free Delivery'] || 0;
                    const supplierId = row['supplierId'] || row['Supplier ID'] || 'SUP-001';
                    const supplierFacilityName = row['supplierFacilityName'] || row['Supplier Facility Name'] || 'Main Facility';

                    const matchingCatObj = categories.find(c => 
                        String(c.mainCategory).trim().toLowerCase() === String(mainCat).trim().toLowerCase() &&
                        String(c.subCategory).trim().toLowerCase() === String(subCat).trim().toLowerCase()
                    );

                    return {
                        _rowIndex: idx + 2, // 1-indexed row for error messages
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

    useEffect(() => {
        fetchCategories();
        fetchUniqueFilters();
        fetchSupplies(1);
    }, []);

    const fetchUniqueFilters = async () => {
        try {
            const data = await vendorMasterSupplyApi.getUniqueFilters();
            if (data) {
                setUniqueSuppliers(data.supplierIds || []);
                setUniqueFrequencies(data.deliveryFrequencies || []);
            }
        } catch (err) {
            console.error('Failed to load unique filters', err);
            toast.error('Filter data load failed. Please refresh the page.');
        }
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
        if (await appDialog.confirm('Are you sure you want to delete this supply item?')) {
            try {
                await vendorMasterSupplyApi.delete(id);
                toast.success('Supply item deleted');
                fetchSupplies(pagination.page);
            } catch (error) {
                toast.error(error.message || 'Failed to delete');
            }
        }
    };

    // Calculate SKU Preview
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
            header: 'Zone',
            key: 'zoneName',
            render: (val) => (
                <span className="font-bold text-slate-700 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-sm tabular-nums text-[10px] whitespace-nowrap">
                    {val || '—'}
                </span>
            )
        },
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
            header: 'HSN Code',
            key: 'hsnCode',
            render: (val) => (
                <span className="text-slate-500 font-bold tabular-nums text-[10px]">{!val || val === '-' ? '—' : val}</span>
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
            header: 'Brand',
            key: 'brand',
            render: (val) => (
                <span className="text-slate-600 font-black uppercase tracking-wider text-[9px]">{!val || val === '-' ? '—' : val}</span>
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
            header: 'Pack Size / Quality',
            key: 'quantity',
            render: (val) => (
                <span className="text-slate-500 font-black uppercase tracking-widest text-[9px] whitespace-nowrap">{!val || val === '-' ? '—' : val}</span>
            )
        },
        {
            header: 'Wholesale Rate (₹)',
            key: 'wholesaleRate',
            render: (val) => (
                <span className="font-bold tabular-nums text-slate-800">
                    {val === 0 || val === '-' || val === undefined || val === null ? '—' : `₹${val}`}
                </span>
            )
        },
        {
            header: 'Bulk Discount & Threshold',
            key: 'bulkDiscount',
            render: (val, row) => {
                const discount = row.bulkDiscount || 0;
                const threshold = row.bulkThreshold || 0;
                if (discount === 0 && threshold === 0) {
                    return <span className="text-slate-300 font-bold">—</span>;
                }
                return (
                    <div className="flex flex-col">
                        <span className="font-bold text-slate-800 tabular-nums text-[10px]">{discount}% Off</span>
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Min: {threshold} Units</span>
                    </div>
                );
            }
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
            header: 'Delivery Frequency',
            key: 'deliveryFrequency',
            render: (val) => (
                <span className="text-slate-400 font-bold uppercase tracking-widest text-[9px] whitespace-nowrap">{!val || val === '-' ? '—' : val}</span>
            )
        },
        {
            header: 'MOV for Free Delivery',
            key: 'movFreeDelivery',
            render: (val) => (
                <span className="text-slate-500 font-bold tabular-nums text-[10px]">
                    {val === 0 || val === '-' || val === undefined || val === null ? '—' : `₹${val}`}
                </span>
            )
        },
        {
            header: 'SUPPLIER ID',
            key: 'supplierId',
            render: (val) => (
                <span className="font-black text-slate-700 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-sm text-[9px] whitespace-nowrap">{!val || val === '-' ? '—' : val}</span>
            )
        },
        {
            header: 'SUPPLIER FACILITY NAME',
            key: 'supplierFacilityName',
            render: (val) => (
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px] whitespace-nowrap">{!val || val === '-' ? '—' : val}</span>
            )
        },
        {
            header: 'Platform Fee',
            key: 'platformFeeLabel',
            render: (val) => (
                <span className="font-bold text-slate-900 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-sm text-[10px] whitespace-nowrap">
                    {val || 'No fee'}
                </span>
            )
        },
        {
            header: 'Fee / Unit (est.)',
            key: 'calculatedFee',
            render: (val, row) => {
                // Charged once per supplier order on goods value (excl. GST); min/max apply per order.
                const rule = row.platformFeeRule;
                if (!rule || rule.type === 'NONE') {
                    return <span className="text-slate-400 font-bold text-[10px]">—</span>;
                }
                if (rule.type === 'FLAT') {
                    return <span className="font-black text-slate-900 tabular-nums text-[11px]">₹{rule.value} / order</span>;
                }
                const rate = parseFloat(row.wholesaleRate) || 0;
                return (
                    <div className="flex flex-col">
                        <span className="font-black text-slate-900 tabular-nums text-[11px]">
                            ₹{(rate * (rule.value || 0) / 100).toFixed(2)}
                        </span>
                        <span className="text-slate-400 font-bold text-[8px]">
                            (₹{rate.toFixed(2)} × {rule.value}%)
                        </span>
                    </div>
                );
            }
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
                </div>
            )
        }
    ], [categories]);

    const validCount = bulkPreview.filter(r => r._valid).length;
    const invalidCount = bulkPreview.filter(r => !r._valid).length;

    return (
        <div className="flex flex-col min-h-screen bg-slate-50/50 pb-20">
            <PageHeader 
                title="Master Supplies Table" 
                actions={[]}
            />

            <div className="p-6 space-y-6 max-w-[1800px] mx-auto w-full overflow-x-auto">
                <DataGrid 
                    title=""
                    showFilter={false}
                    showSearch={false}
                    actions={
                        <div className="flex flex-col md:flex-row md:items-end gap-2 w-full ml-auto flex-wrap justify-end">
                            <div className="flex items-center w-full md:w-auto">
                                <FilterField label="Category" info="Shows only supply products in this category (main category — sub category).">
                                <MultiSelectFilter
                                    value={filters.categoryId}
                                    onChange={(e) => handleFilterChange('categoryId', e.target.value)}
                                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-full md:w-48 uppercase tracking-wider cursor-pointer"
                                >
                                    <option value="">All Categories</option>
                                    {categories.map(cat => (
                                        <option key={cat._id} value={cat._id}>
                                            {cat.mainCategory} — {cat.subCategory}
                                        </option>
                                    ))}
                                </MultiSelectFilter>
                                </FilterField>
                            </div>
                            <div className="flex items-center w-full md:w-auto">
                                <FilterField label="Supplier" info="Shows only products listed by this supplier (supplier code, e.g. SUP-1234).">
                                <MultiSelectFilter
                                    value={filters.supplierId}
                                    onChange={(e) => handleFilterChange('supplierId', e.target.value)}
                                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-full md:w-32 uppercase tracking-wider cursor-pointer"
                                >
                                    <option value="">All Suppliers</option>
                                    {uniqueSuppliers.map(sup => (
                                        <option key={sup} value={sup}>{sup}</option>
                                    ))}
                                </MultiSelectFilter>
                                </FilterField>
                            </div>
                            <div className="flex items-center w-full md:w-auto">
                                <FilterField label="Delivery frequency" info="Shows only products the supplier delivers on this schedule (e.g. Daily, Weekly, On-Demand).">
                                <MultiSelectFilter
                                    value={filters.deliveryFrequency}
                                    onChange={(e) => handleFilterChange('deliveryFrequency', e.target.value)}
                                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-full md:w-36 uppercase tracking-wider cursor-pointer"
                                >
                                    <option value="">All Frequencies</option>
                                    {uniqueFrequencies.map(freq => (
                                        <option key={freq} value={freq}>{freq}</option>
                                    ))}
                                </MultiSelectFilter>
                                </FilterField>
                            </div>
                            <div className="flex items-center w-full md:w-auto">
                                <FilterField label="Wholesale rate" info="Shows only products whose wholesale price per unit (before GST) is in this range.">
                                <MultiSelectFilter
                                    value={filters.wholesaleRate}
                                    onChange={(e) => handleFilterChange('wholesaleRate', e.target.value)}
                                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-full md:w-32 uppercase tracking-wider cursor-pointer"
                                >
                                    <option value="">All Rates</option>
                                    <option value="0-500">₹0 - ₹500</option>
                                    <option value="500-1000">₹500 - ₹1000</option>
                                    <option value="1000-5000">₹1000 - ₹5000</option>
                                    <option value="5000+">₹5000+</option>
                                </MultiSelectFilter>
                                </FilterField>
                            </div>
                            <div className="flex items-center gap-2 w-full md:w-auto">
                                <FilterField label="Status" info="Active = visible to vendors for ordering. Inactive = hidden from the vendor catalog.">
                                <MultiSelectFilter
                                    value={filters.isActive}
                                    onChange={(e) => handleFilterChange('isActive', e.target.value)}
                                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-full md:w-28 uppercase tracking-wider cursor-pointer flex-1 md:flex-none"
                                >
                                    <option value="">All Status</option>
                                    <option value="y">Active (Y)</option>
                                    <option value="n">Inactive (N)</option>
                                </MultiSelectFilter>
                                </FilterField>
                                {(filters.categoryId || filters.isActive !== '' || filters.supplierId !== '' || filters.deliveryFrequency !== '' || filters.wholesaleRate !== '') && (
                                    <button 
                                        onClick={() => {
                                            const cleared = { categoryId: '', isActive: '', supplierId: '', deliveryFrequency: '', wholesaleRate: '' };
                                            setFilters(cleared);
                                            fetchSupplies(1, cleared);
                                        }}
                                        className="px-3 py-1.5 border border-slate-200 text-slate-400 hover:text-slate-900 hover:border-slate-900 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all bg-white shrink-0"
                                    >
                                        Reset
                                    </button>
                                )}
                                <button 
                                    onClick={handleDownload}
                                    className="p-1.5 hover:bg-slate-50 text-slate-400 hover:text-slate-900 rounded-sm border border-slate-200 bg-white flex items-center justify-center h-[28px] w-[28px] ml-auto md:ml-0 shrink-0"
                                    title="Download Excel/CSV"
                                >
                                    <Download size={14} />
                                </button>
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

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-1.5 md:col-span-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">SKU ID Preview</label>
                                    <div className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-black tracking-widest text-slate-900 uppercase">
                                        {editingSupply ? editingSupply.skuId : skuPreviewStr}
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Category & Sub Category</label>
                                    <select
                                        required
                                        value={formData.categoryId}
                                        onChange={e => setFormData({...formData, categoryId: e.target.value})}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none uppercase tracking-wider cursor-pointer"
                                    >
                                        <option value="" disabled>Select Category</option>
                                        {categories.map(cat => (
                                            <option key={cat._id} value={cat._id}>
                                                {cat.mainCategory} — {cat.subCategory}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Material Name</label>
                                    <input 
                                        required
                                        value={formData.materialName}
                                        onChange={e => setFormData({...formData, materialName: e.target.value})}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                        placeholder="e.g. Ultra Clean Soap"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">HSN Code</label>
                                    <input 
                                        required
                                        value={formData.hsnCode}
                                        onChange={e => setFormData({...formData, hsnCode: e.target.value})}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                        placeholder="e.g. 2800"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">GST Percentage (%)</label>
                                    <select
                                        required
                                        value={formData.gst}
                                        onChange={e => setFormData({...formData, gst: e.target.value})}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none uppercase tracking-wider cursor-pointer"
                                    >
                                        <option value="0">0%</option>
                                        <option value="5">5%</option>
                                        <option value="12">12%</option>
                                        <option value="18">18%</option>
                                        <option value="28">28%</option>
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Brand</label>
                                    <input 
                                        required
                                        value={formData.brand}
                                        onChange={e => setFormData({...formData, brand: e.target.value})}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                        placeholder="e.g. Generic"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Quantity / Unit</label>
                                    <input 
                                        required
                                        value={formData.quantity}
                                        onChange={e => setFormData({...formData, quantity: e.target.value})}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                        placeholder="e.g. 10 Litres, 5 Kg"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Wholesale Rate (₹)</label>
                                    <input 
                                        required
                                        type="number"
                                        min="0"
                                        value={formData.wholesaleRate}
                                        onChange={e => setFormData({...formData, wholesaleRate: e.target.value})}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                        placeholder="e.g. 450"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Bulk Discount (%)</label>
                                    <input 
                                        required
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={formData.bulkDiscount}
                                        onChange={e => setFormData({...formData, bulkDiscount: e.target.value})}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Bulk Threshold (Units)</label>
                                    <input 
                                        required
                                        type="number"
                                        min="0"
                                        value={formData.bulkThreshold}
                                        onChange={e => setFormData({...formData, bulkThreshold: e.target.value})}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Active</label>
                                    <select
                                        value={formData.isActive}
                                        onChange={e => setFormData({...formData, isActive: e.target.value})}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none uppercase tracking-wider cursor-pointer"
                                    >
                                        <option value="y">y (Active)</option>
                                        <option value="n">n (Inactive)</option>
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Delivery Frequency</label>
                                    <input 
                                        required
                                        value={formData.deliveryFrequency}
                                        onChange={e => setFormData({...formData, deliveryFrequency: e.target.value})}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                        placeholder="e.g. Weekly, Daily"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">MOV for Free Delivery (₹)</label>
                                    <input 
                                        required
                                        type="number"
                                        min="0"
                                        value={formData.movFreeDelivery}
                                        onChange={e => setFormData({...formData, movFreeDelivery: e.target.value})}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Supplier ID</label>
                                    <input 
                                        required
                                        value={formData.supplierId}
                                        onChange={e => setFormData({...formData, supplierId: e.target.value})}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                        placeholder="e.g. SUP-001"
                                    />
                                </div>

                                <div className="space-y-1.5 md:col-span-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Supplier Facility Name</label>
                                    <input 
                                        required
                                        value={formData.supplierFacilityName}
                                        onChange={e => setFormData({...formData, supplierFacilityName: e.target.value})}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                        placeholder="e.g. North Facility"
                                    />
                                </div>

                                <div className="space-y-1.5 md:col-span-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Product Description</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        placeholder="Enter detailed description of the supply product..."
                                        rows={3}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                    />
                                </div>

                                <div className="space-y-2 md:col-span-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Product Images</label>
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

                            <button className="w-full bg-slate-900 text-white py-4 rounded-sm font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-slate-900/10 hover:bg-black transition-all">
                                Save
                            </button>
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
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="relative w-full max-w-3xl bg-white rounded-sm shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-slate-900 text-white flex items-center justify-center rounded-sm">
                                        <FileSpreadsheet size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-[13px] font-black text-slate-900 uppercase tracking-widest">Bulk Upload Master Supplies</h3>
                                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-0.5">
                                            Upload .xlsx, .xls or .csv — SKUs are generated automatically
                                        </p>
                                    </div>
                                </div>
                                <button onClick={() => setIsBulkModalOpen(false)} className="p-2 hover:bg-slate-50 rounded-full text-slate-400">
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Body — scrollable */}
                            <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">

                                {/* Template Download */}
                                <div className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-sm px-5 py-4">
                                    <div>
                                        <p className="text-[11px] font-black text-slate-900 uppercase tracking-widest">Download Template</p>
                                        <p className="text-[9px] text-slate-400 font-bold mt-0.5">Fill columns: materialName, mainCategory, subCategory, hsnCode, gst, brand, quantity, wholesaleRate, bulkDiscount, bulkThreshold, isActive, deliveryFrequency, movFreeDelivery, supplierId, supplierFacilityName</p>
                                    </div>
                                    <button
                                        onClick={handleDownloadTemplate}
                                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-widest rounded-sm hover:border-slate-900 hover:text-slate-900 transition-all"
                                    >
                                        <Download size={14} />
                                        Template
                                    </button>
                                </div>

                                {/* File Drop Zone */}
                                <div>
                                    <label
                                        htmlFor="bulk-file-input"
                                        className="group flex flex-col items-center justify-center w-full border-2 border-dashed border-slate-200 rounded-sm py-10 cursor-pointer hover:border-slate-900 hover:bg-slate-50 transition-all"
                                    >
                                        <Upload size={28} className="text-slate-300 group-hover:text-slate-600 mb-3 transition-colors" />
                                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest group-hover:text-slate-700 transition-colors">
                                            {bulkFile ? bulkFile.name : 'Click or drop file here'}
                                        </p>
                                        <p className="text-[9px] text-slate-300 font-bold mt-1">.xlsx · .xls · .csv</p>
                                        <input
                                            id="bulk-file-input"
                                            ref={fileInputRef}
                                            type="file"
                                            accept=".xlsx,.xls,.csv"
                                            onChange={handleFileChange}
                                            className="hidden"
                                        />
                                    </label>
                                </div>

                                {/* Parse error */}
                                {bulkError && (
                                    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-sm px-4 py-3">
                                        <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                                        <p className="text-[10px] font-bold text-amber-700">{bulkError}</p>
                                    </div>
                                )}

                                {/* Preview */}
                                {bulkPreview.length > 0 && !bulkResult && (
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">
                                                Preview — {bulkPreview.length} rows detected
                                            </p>
                                            <div className="flex items-center gap-3">
                                                <span className="text-[9px] font-black text-emerald-600 uppercase">✓ {validCount} valid</span>
                                                {invalidCount > 0 && <span className="text-[9px] font-black text-rose-500 uppercase">✗ {invalidCount} invalid</span>}
                                            </div>
                                        </div>
                                        <div className="border border-slate-100 rounded-sm overflow-hidden">
                                            <div className="overflow-x-auto max-h-64 overflow-y-auto">
                                                <table className="w-full text-left text-[10px] font-bold">
                                                    <thead className="bg-slate-900 text-white sticky top-0">
                                                        <tr>
                                                            <th className="px-4 py-2.5 uppercase tracking-widest font-black text-[8px]">Row</th>
                                                            <th className="px-4 py-2.5 uppercase tracking-widest font-black text-[8px]">Material Name</th>
                                                            <th className="px-4 py-2.5 uppercase tracking-widest font-black text-[8px]">Main Category</th>
                                                            <th className="px-4 py-2.5 uppercase tracking-widest font-black text-[8px]">Sub Category</th>
                                                            <th className="px-4 py-2.5 uppercase tracking-widest font-black text-[8px]">Wholesale Rate</th>
                                                            <th className="px-4 py-2.5 uppercase tracking-widest font-black text-[8px]">Active</th>
                                                            <th className="px-4 py-2.5 uppercase tracking-widest font-black text-[8px]">Status</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-50">
                                                        {bulkPreview.map((row, idx) => (
                                                            <tr key={idx} className={row._valid ? 'bg-white hover:bg-slate-50' : 'bg-rose-50'}>
                                                                <td className="px-4 py-2 text-slate-400 tabular-nums">{row._rowIndex}</td>
                                                                <td className="px-4 py-2 text-slate-900 uppercase">{row.materialName || <span className="text-rose-400">—</span>}</td>
                                                                <td className="px-4 py-2 text-slate-900 uppercase">{row.mainCategory || <span className="text-rose-400">—</span>}</td>
                                                                <td className="px-4 py-2 text-slate-500">{row.subCategory || <span className="text-rose-400">—</span>}</td>
                                                                <td className="px-4 py-2 text-slate-500">₹{row.wholesaleRate}</td>
                                                                <td className="px-4 py-2">
                                                                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${row.isActive === 'y' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                                                        {row.isActive}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-2">
                                                                    {row._valid
                                                                        ? <CheckCircle2 size={14} className="text-emerald-500" />
                                                                        : <AlertTriangle size={14} className="text-rose-400" />
                                                                    }
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Upload result */}
                                {bulkResult && (
                                    <div className="flex flex-col items-center justify-center py-8 gap-4">
                                        <CheckCircle2 size={48} className="text-emerald-500" />
                                        <div className="text-center">
                                            <p className="text-[13px] font-black text-slate-900 uppercase tracking-widest">Upload Complete</p>
                                            <p className="text-[10px] text-slate-500 font-bold mt-1">{bulkResult.message}</p>
                                        </div>
                                        <div className="flex gap-6 mt-2">
                                            <div className="text-center">
                                                <p className="text-2xl font-black text-emerald-600">{bulkResult.results?.created ?? 0}</p>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Created</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-2xl font-black text-amber-500">{bulkResult.results?.skipped ?? 0}</p>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Skipped</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-2xl font-black text-rose-500">{bulkResult.results?.errors ?? 0}</p>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Errors</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={resetBulkModal}
                                            className="px-8 py-3 bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest rounded-sm hover:bg-slate-900 hover:text-white transition-all mt-2"
                                        >
                                            Upload Another File
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            {!bulkResult && (
                                <div className="px-8 py-5 border-t border-slate-100 flex items-center justify-between bg-white">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                        {bulkPreview.length > 0 ? `${validCount} of ${bulkPreview.length} rows will be uploaded` : 'Select a file to preview'}
                                    </p>
                                    <button
                                        onClick={handleBulkUpload}
                                        disabled={validCount === 0 || bulkUploading}
                                        className="flex items-center gap-2 px-8 py-3 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-sm hover:bg-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        {bulkUploading ? (
                                            <>
                                                <Loader2 size={14} className="animate-spin" />
                                                Uploading...
                                            </>
                                        ) : (
                                            <>
                                                <Upload size={14} />
                                                Upload {validCount > 0 ? `(${validCount} rows)` : ''}
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default VendorMasterSupplyManagement;
