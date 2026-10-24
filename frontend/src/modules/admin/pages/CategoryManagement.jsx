import { matchesFilter } from '../utils/filters';
import MultiSelectFilter from '../components/common/MultiSelectFilter';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { categoryApi } from '../../../lib/api';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import { 
    Plus, Edit2, X, Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, PlusCircle
} from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import DataGrid from '../components/tables/DataGrid';

const CategoryManagement = () => {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState(null);
    const [formData, setFormData] = useState({
        excelCategoryId: '',
        mainCategory: '',
        subCategory: '',
        isActive: true
    });

    const [filters, setFilters] = useState({
        mainCategory: '',
        subCategory: '',
        isActive: ''
    });

    const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
    const [allCategoriesList, setAllCategoriesList] = useState([]);

    // Bulk upload state
    const [bulkFile, setBulkFile] = useState(null);
    const [bulkPreview, setBulkPreview] = useState([]);
    const [bulkUploading, setBulkUploading] = useState(false);
    const [bulkResult, setBulkResult] = useState(null);
    const [bulkError, setBulkError] = useState('');
    const fileInputRef = useRef(null);

    const fetchAllCategoriesList = async () => {
        try {
            const list = await categoryApi.getAll();
            setAllCategoriesList(Array.isArray(list) ? list : []);
        } catch (err) {
            console.error('Failed to load full category list', err);
        }
    };

    const uniqueMainCategories = useMemo(() => {
        return Array.from(new Set(allCategoriesList.map(c => c.mainCategory))).filter(Boolean).sort();
    }, [allCategoriesList]);

    const uniqueSubCategories = useMemo(() => {
        const filtered = filters.mainCategory 
            ? allCategoriesList.filter(c => matchesFilter(filters.mainCategory, c.mainCategory))
            : allCategoriesList;
        return Array.from(new Set(filtered.map(c => c.subCategory))).filter(Boolean).sort();
    }, [allCategoriesList, filters.mainCategory]);

    const latestFilterRequest = React.useRef(0);
    const fetchCategories = async (page = 1, activeFilters = filters) => {
        const requestId = ++latestFilterRequest.current;
        try {
            setLoading(true);
            const result = await categoryApi.getPaginated(page, pagination.limit, activeFilters);
            if (requestId !== latestFilterRequest.current) return;
            
            if (result.data && result.pagination) {
                setCategories(result.data);
                setPagination(result.pagination);
            } else {
                setCategories(Array.isArray(result) ? result : []);
            }
            fetchAllCategoriesList();
        } catch (error) {
            if (requestId !== latestFilterRequest.current) return;
            toast.error('Failed to fetch categories');
        } finally {
            if (requestId === latestFilterRequest.current) setLoading(false);
        }
    };

    const handleFilterChange = (key, value) => {
        const updatedFilters = { ...filters, [key]: value, ...(key === 'mainCategory' ? { subCategory: '' } : {}) };
        setFilters(updatedFilters);
        fetchCategories(1, updatedFilters);
    };

    const handleDownload = () => {
        if (!categories || categories.length === 0) {
            toast.error('No categories available to download');
            return;
        }
        const headers = ['Category ID', 'Category Name', 'Sub Category Name', 'Status'];
        const rows = categories.map(cat => [
            cat.excelCategoryId || '—',
            cat.mainCategory || '',
            cat.subCategory || '',
            cat.isActive ? 'Active' : 'Inactive'
        ]);

        const csvRows = [
            headers.join(','),
            ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Category_Registry_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('CSV downloaded successfully');
    };

    // Download a sample template the user can fill and re-upload
    const handleDownloadTemplate = () => {
        const headers = ['mainCategory', 'subCategory', 'isActive'];
        const sample = [
            ['Dry Cleaning', 'Shirts', 'TRUE'],
            ['Laundry', 'Household', 'TRUE'],
            ['Steam Iron', 'Casuals', 'TRUE']
        ];
        const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Categories');
        XLSX.writeFile(wb, 'Category_Bulk_Upload_Template.xlsx');
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

                // Normalise column names to camelCase-friendly versions
                const normalised = jsonData.map((row, idx) => {
                    const mainCat =
                        row['mainCategory'] || row['Main Category'] || row['category'] ||
                        row['Category'] || row['main_category'] || '';
                    const subCat =
                        row['subCategory'] || row['Sub Category'] || row['subcategory'] ||
                        row['SubCategory'] || row['sub_category'] || '';
                    const activeRaw =
                        row['isActive'] ?? row['Is Active'] ?? row['status'] ?? row['Status'] ?? 'TRUE';
                    const isActive =
                        typeof activeRaw === 'boolean'
                            ? activeRaw
                            : String(activeRaw).toLowerCase() !== 'false' &&
                              String(activeRaw).toLowerCase() !== '0' &&
                              String(activeRaw).toLowerCase() !== 'inactive';

                    return {
                        _rowIndex: idx + 2, // 1-indexed row for error messages
                        mainCategory: String(mainCat).trim(),
                        subCategory: String(subCat).trim(),
                        isActive,
                        _valid: !!String(mainCat).trim() && !!String(subCat).trim()
                    };
                });

                const invalid = normalised.filter(r => !r._valid).length;
                if (invalid > 0) {
                    setBulkError(`${invalid} row(s) are missing mainCategory or subCategory and will be skipped.`);
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
        const validRows = bulkPreview.filter(r => r._valid).map(({ _rowIndex, _valid, ...rest }) => rest);
        if (validRows.length === 0) {
            toast.error('No valid rows to upload.');
            return;
        }

        setBulkUploading(true);
        setBulkResult(null);
        try {
            const result = await categoryApi.bulkUpload(validRows);
            setBulkResult(result);
            toast.success(`Upload done! Created: ${result.results?.created ?? '?'}, Skipped: ${result.results?.skipped ?? '?'}`);
            fetchCategories(1);
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
        fetchCategories(1);
    }, []);

    const handleOpenModal = (category = null) => {
        if (category) {
            setEditingCategory(category);
            setFormData({
                excelCategoryId: category.excelCategoryId || '',
                mainCategory: category.mainCategory || '',
                subCategory: category.subCategory || '',
                isActive: category.isActive !== undefined ? category.isActive : true
            });
        } else {
            setEditingCategory(null);
            setFormData({
                excelCategoryId: '',
                mainCategory: '',
                subCategory: '',
                isActive: true
            });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...formData,
                excelCategoryId: formData.excelCategoryId ? Number(formData.excelCategoryId) : undefined
            };
            if (editingCategory) {
                await categoryApi.update(editingCategory._id, payload);
                toast.success('Category updated');
            } else {
                await categoryApi.create(payload);
                toast.success('Category created');
            }
            setIsModalOpen(false);
            fetchCategories(pagination.page);
        } catch (error) {
            toast.error(error.message || 'Operation failed');
        }
    };

    const columns = useMemo(() => [
        {
            header: 'Category ID',
            key: 'excelCategoryId',
            render: (val) => (
                <span className="font-black text-slate-900 tabular-nums bg-slate-50 px-2 py-1 rounded-sm border border-slate-100">
                    {val || '—'}
                </span>
            )
        },
        {
            header: 'Category Name',
            key: 'mainCategory',
            render: (val) => (
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <span className="font-bold uppercase tracking-tight text-slate-800">{val}</span>
                </div>
            )
        },
        {
            header: 'Sub Category Name',
            key: 'subCategory',
            render: (val) => (
                <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">{val}</span>
            )
        },
        {
            header: 'Status',
            key: 'isActive',
            render: (val) => (
                <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${val ? 'bg-slate-900 text-white border border-slate-900' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>
                    {val ? 'Active' : 'Inactive'}
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
    ], []);

    const validCount = bulkPreview.filter(r => r._valid).length;
    const invalidCount = bulkPreview.filter(r => !r._valid).length;

    return (
        <div className="flex flex-col min-h-screen bg-slate-50/50 pb-20">
            <PageHeader 
                title="Category Management" 
                actions={[
                    {
                        label: "Bulk Upload",
                        icon: Upload,
                        onClick: () => { resetBulkModal(); setIsBulkModalOpen(true); },
                        variant: 'primary'
                    },
                    {
                        label: "Add Category",
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
                        <div className="flex items-center flex-wrap gap-2 w-full">
                            <MultiSelectFilter
                                value={filters.mainCategory}
                                onChange={(e) => handleFilterChange('mainCategory', e.target.value)}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-36 uppercase tracking-wider cursor-pointer"
                            >
                                <option value="">All Categories</option>
                                {uniqueMainCategories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </MultiSelectFilter>
                            <MultiSelectFilter
                                value={filters.subCategory}
                                onChange={(e) => handleFilterChange('subCategory', e.target.value)}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-36 uppercase tracking-wider cursor-pointer"
                            >
                                <option value="">All Sub Cats</option>
                                {uniqueSubCategories.map(sub => (
                                    <option key={sub} value={sub}>{sub}</option>
                                ))}
                            </MultiSelectFilter>
                            <MultiSelectFilter
                                value={filters.isActive}
                                onChange={(e) => handleFilterChange('isActive', e.target.value)}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-28 uppercase tracking-wider cursor-pointer"
                            >
                                <option value="">All Status</option>
                                <option value="true">Active</option>
                                <option value="false">Inactive</option>
                            </MultiSelectFilter>

                            <button 
                                onClick={handleDownload}
                                className="p-2 hover:bg-slate-50 text-slate-400 hover:text-slate-900 rounded-sm border border-slate-200 bg-white flex items-center justify-center h-8 w-8 ml-auto"
                                title="Download Excel/CSV"
                            >
                                <Download size={14} />
                            </button>

                            {(filters.mainCategory || filters.subCategory || filters.isActive !== '') && (
                                <button 
                                    onClick={() => {
                                        const cleared = { mainCategory: '', subCategory: '', isActive: '' };
                                        setFilters(cleared);
                                        fetchCategories(1, cleared);
                                    }}
                                    className="px-3 py-1.5 border border-slate-200 text-slate-400 hover:text-slate-900 hover:border-slate-900 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all bg-white"
                                >
                                    Reset
                                </button>
                            )}
                        </div>
                    }
                    columns={columns}
                    data={categories}
                    loading={loading}
                    pagination={pagination}
                    onPageChange={(newPage) => fetchCategories(newPage)}
                />
            </div>

            {/* ─── Single Category Modal ─────────────────────────────────────── */}
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
                            className="relative w-full max-w-md bg-white rounded-sm p-10 shadow-2xl space-y-6 border border-slate-200"
                        >
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-slate-900 text-white flex items-center justify-center rounded-sm">
                                        <PlusCircle size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-[12px] font-black text-slate-900 uppercase tracking-widest">{editingCategory ? 'Update Details' : 'New Category'}</h3>
                                        {!editingCategory && (
                                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">ID auto-generated on save</p>
                                        )}
                                    </div>
                                </div>
                                <button type="button" onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-50 rounded-full text-slate-400">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="space-y-4">
                                {editingCategory && (
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Category ID (Auto-generated)</label>
                                        <div className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-sm text-[11px] font-bold text-slate-400">
                                            {formData.excelCategoryId || 'Auto-generated'}
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Category Name</label>
                                    <input 
                                        required
                                        value={formData.mainCategory}
                                        onChange={e => setFormData({...formData, mainCategory: e.target.value})}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                        placeholder="e.g. Dry Cleaning"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Sub Category Name</label>
                                    <input 
                                        required
                                        value={formData.subCategory}
                                        onChange={e => setFormData({...formData, subCategory: e.target.value})}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                        placeholder="e.g. Household"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Status</label>
                                    <select
                                        value={formData.isActive}
                                        onChange={e => setFormData({...formData, isActive: e.target.value === 'true'})}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none uppercase tracking-wider cursor-pointer"
                                    >
                                        <option value="true">Active</option>
                                        <option value="false">Inactive</option>
                                    </select>
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
                                        <h3 className="text-[13px] font-black text-slate-900 uppercase tracking-widest">Bulk Upload Categories</h3>
                                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-0.5">
                                            Upload .xlsx, .xls or .csv — IDs are auto-generated
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
                                        <p className="text-[9px] text-slate-400 font-bold mt-0.5">Fill columns: mainCategory, subCategory, isActive</p>
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
                                                            <th className="px-4 py-2.5 uppercase tracking-widest font-black text-[8px]">Category ID</th>
                                                            <th className="px-4 py-2.5 uppercase tracking-widest font-black text-[8px]">Main Category</th>
                                                            <th className="px-4 py-2.5 uppercase tracking-widest font-black text-[8px]">Sub Category</th>
                                                            <th className="px-4 py-2.5 uppercase tracking-widest font-black text-[8px]">Active</th>
                                                            <th className="px-4 py-2.5 uppercase tracking-widest font-black text-[8px]">Status</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-50">
                                                        {bulkPreview.map((row, idx) => (
                                                            <tr key={idx} className={row._valid ? 'bg-white hover:bg-slate-50' : 'bg-rose-50'}>
                                                                <td className="px-4 py-2 text-slate-400 tabular-nums">{row._rowIndex}</td>
                                                                <td className="px-4 py-2">
                                                                    <span className="text-slate-400 italic text-[9px]">auto</span>
                                                                </td>
                                                                <td className="px-4 py-2 text-slate-900 uppercase">{row.mainCategory || <span className="text-rose-400">—</span>}</td>
                                                                <td className="px-4 py-2 text-slate-500">{row.subCategory || <span className="text-rose-400">—</span>}</td>
                                                                <td className="px-4 py-2">
                                                                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${row.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                                                        {row.isActive ? 'Yes' : 'No'}
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

export default CategoryManagement;
