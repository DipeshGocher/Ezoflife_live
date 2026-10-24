import { matchesFilter } from '../utils/filters';
import MultiSelectFilter from '../components/common/MultiSelectFilter';
import { appDialog } from '../../../shared/stores/appDialogStore';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { promotionApi, BASE_URL } from '../../../lib/api';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import { 
    Plus, Edit2, X, Download, Upload, CheckCircle2, AlertTriangle, Loader2, PlusCircle
} from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import DataGrid from '../components/tables/DataGrid';
import FilterField from "../components/common/FilterLabel";

const AdminPromotionTable = () => {
    const [promotions, setPromotions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [editingPromo, setEditingPromo] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        code: '',
        discountType: 'Percentage',
        discountValue: '',
        minOrderValue: '',
        start_date: new Date().toISOString().split('T')[0],
        expiryDate: '',
        status: 'Active'
    });

    const [filters, setFilters] = useState({
        status: ''
    });

    const [page, setPage] = useState(1);
    const itemsPerPage = 10;

    // Bulk upload state
    const [bulkFile, setBulkFile] = useState(null);
    const [bulkPreview, setBulkPreview] = useState([]);
    const [bulkUploading, setBulkUploading] = useState(false);
    const [bulkResult, setBulkResult] = useState(null);
    const [bulkError, setBulkError] = useState('');
    const fileInputRef = useRef(null);
    const validCount = bulkPreview.filter(row => row._valid).length;
    const invalidCount = bulkPreview.length - validCount;

    const fetchPromotions = async () => {
        try {
            setLoading(true);
            const data = await promotionApi.adminList();
            // Filter only platform owner type promotions
            const platformPromos = (data || []).filter(p => p.owner_type === 'PLATFORM');
            setPromotions(platformPromos);
        } catch (error) {
            console.error('Failed to fetch promotions:', error);
            toast.error('Failed to load promotions');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPromotions();
    }, []);

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPage(1);
    };

    const filteredPromotions = useMemo(() => {
        return promotions.filter(promo => {
            let matchesStatus = true;
            if (filters.status) {
                matchesStatus = matchesFilter(filters.status, promo.status);
            }
            return matchesStatus;
        });
    }, [promotions, filters]);

    const paginatedPromotions = useMemo(() => {
        return filteredPromotions.slice((page - 1) * itemsPerPage, page * itemsPerPage);
    }, [filteredPromotions, page]);

    const handleDownload = () => {
        if (!filteredPromotions || filteredPromotions.length === 0) {
            toast.error('No promotions available to download');
            return;
        }
        const headers = [
            'Promotion ID', 'Code', 'Discount Type', 'Value', 
            'Start Date', 'Expiry Date', 'Status'
        ];
        const rows = filteredPromotions.map(item => [
            item._id || '—',
            item.code || '',
            item.discountType || item.discount_type || 'Percentage',
            item.discountValue || item.discount_value || 0,
            item.start_date || '',
            item.expiryDate || '',
            item.status || 'Active'
        ]);

        const csvRows = [
            headers.join(','),
            ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Platform_Promotions_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('CSV downloaded successfully');
    };

    const handleDownloadTemplate = () => {
        const headers = [
            'code', 'discountType', 'discountValue', 'start_date', 'expiryDate', 'status'
        ];
        const sample = [
            ['MONSOON50', 'Percentage', '10', '2026-07-01', '2026-07-31', 'Active'],
            ['FLAT100', 'Flat', '100', '2026-07-01', '2026-12-31', 'Active'],
            ['WINTER20', 'Percentage', '20', '2026-11-01', '2027-02-28', 'Paused']
        ];
        const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Promotions');
        XLSX.writeFile(wb, 'Promotions_Bulk_Upload_Template.xlsx');
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
                    const code = row['code'] || row['Code'] || '';
                    const discountType = row['discountType'] || row['Discount Type'] || 'Percentage';
                    const discountValue = row['discountValue'] || row['Discount Value'] || 0;
                    const start_date = row['start_date'] || row['Start Date'] || new Date().toISOString().split('T')[0];
                    const expiryDate = row['expiryDate'] || row['Expiry Date'] || '';
                    const status = row['status'] || row['Status'] || 'Active';

                    return {
                        _rowIndex: idx + 2,
                        code: String(code).trim().toUpperCase(),
                        discountType: String(discountType).trim(),
                        discountValue: Number(discountValue) || 0,
                        start_date: String(start_date).trim(),
                        expiryDate: String(expiryDate).trim(),
                        status: String(status).trim() === 'Inactive' || String(status).trim() === 'Paused' ? 'Paused' : 'Active',
                        _valid: !!String(code).trim() && !!String(expiryDate).trim()
                    };
                });

                const invalid = normalised.filter(r => !r._valid).length;
                if (invalid > 0) {
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
        const validRows = bulkPreview.filter(r => r._valid).map(({ _rowIndex, _valid, ...rest }) => ({
            ...rest,
            title: rest.code,
            usageLimit: 999999,
            is_exclusive_window_eligible: false,
            owner_type: 'PLATFORM'
        }));
        if (validRows.length === 0) {
            toast.error('No valid rows to upload.');
            return;
        }

        setBulkUploading(true);
        setBulkResult(null);
        try {
            let created = 0;
            for (const row of validRows) {
                // Delete existing first to avoid duplicate key error
                const existing = promotions.find(p => p.code === row.code);
                if (existing) {
                    await fetch(`${BASE_URL}/promotions/${existing._id}`, { method: 'DELETE' });
                }
                await promotionApi.create(row);
                created++;
            }
            setBulkResult({
                message: 'Promotions bulk upload processed successfully',
                results: { created, skipped: 0, errors: 0 }
            });
            toast.success(`Upload done! Created: ${created}`);
            fetchPromotions();
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

    const handleOpenModal = (promo = null) => {
        if (promo) {
            setEditingPromo(promo);
            setFormData({
                code: promo.code || '',
                discountType: promo.discountType || promo.discount_type || 'Percentage',
                discountValue: promo.discountValue || promo.discount_value || '',
                minOrderValue: promo.minOrderValue || promo.min_order_value || '',
                start_date: new Date(promo.start_date || promo.createdAt).toISOString().split('T')[0],
                expiryDate: new Date(promo.expiryDate).toISOString().split('T')[0],
                status: promo.status || 'Active'
            });
        } else {
            setEditingPromo(null);
            setFormData({
                code: promotions[0]?.code || '',
                discountType: 'Percentage',
                discountValue: '',
                minOrderValue: '',
                start_date: new Date().toISOString().split('T')[0],
                expiryDate: '',
                status: 'Active'
            });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (!formData.code || !formData.discountValue || !formData.expiryDate) {
                toast.error('Please fill all required fields');
                return;
            }

            setSubmitting(true);
            const payload = {
                title: formData.code,
                code: formData.code.toUpperCase().trim(),
                discountType: formData.discountType,
                discountValue: Number(formData.discountValue),
                minOrderValue: Number(formData.minOrderValue || 0),
                usageLimit: 999999,
                start_date: formData.start_date,
                expiryDate: formData.expiryDate,
                is_exclusive_window_eligible: false,
                owner_type: 'PLATFORM',
                status: formData.status
            };

            const existing = promotions.find(p => p.code === payload.code);
            if (existing) {
                await fetch(`${BASE_URL}/promotions/${existing._id}`, {
                    method: 'DELETE'
                });
            }

            await promotionApi.create(payload);
            toast.success('Promotion details updated successfully');

            setIsModalOpen(false);
            fetchPromotions();
        } catch (error) {
            toast.error(error.message || 'Operation failed');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        if (await appDialog.confirm('Are you sure you want to delete this promotion?')) {
            try {
                await promotionApi.delete(id);
                toast.success('Promotion deleted successfully');
                fetchPromotions();
            } catch (error) {
                toast.error(error.message || 'Failed to delete');
            }
        }
    };

    const columns = useMemo(() => [
        {
            header: 'Promotion ID',
            key: '_id',
            render: (val) => (
                <span className="font-black text-slate-900 tabular-nums bg-slate-100/70 px-2 py-0.5 rounded-sm border border-slate-200 uppercase tracking-widest text-[9px] whitespace-nowrap">
                    {val || '—'}
                </span>
            )
        },
        {
            header: 'Promotion Code',
            key: 'code',
            render: (val) => (
                <span className="text-[10px] text-slate-900 font-mono font-black uppercase tracking-widest bg-slate-50 border border-slate-200 px-2.5 py-1 rounded">
                    {val}
                </span>
            )
        },
        {
            header: 'Promotion Type',
            key: 'discountType',
            render: (val) => (
                <span className="text-slate-600 font-black uppercase tracking-wider text-[9px]">{val || 'Percentage'}</span>
            )
        },
        {
            header: 'Value',
            key: 'discountValue',
            render: (_, row) => {
                const discount = row.discountValue || row.discount_value || 0;
                const type = row.discountType || row.discount_type || 'Percentage';
                return (
                    <span className="text-[10px] font-bold text-slate-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-sm tabular-nums">
                        {type === 'Flat' || type === 'FLAT_AMOUNT' ? `₹${discount}` : `${discount}%`} OFF
                    </span>
                );
            }
        },
        {
            header: 'Min. Amount',
            key: 'minOrderValue',
            render: (_, row) => (
                <span className="text-[10px] font-bold text-slate-600 tabular-nums">
                    ₹{row.minOrderValue || row.min_order_value || 0}
                </span>
            )
        },
        {
            header: 'Start Date',
            key: 'start_date',
            render: (_, row) => (
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    {new Date(row.start_date || row.createdAt).toLocaleDateString()}
                </span>
            )
        },
        {
            header: 'Expiry Date',
            key: 'expiryDate',
            render: (val) => (
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    {new Date(val).toLocaleDateString()}
                </span>
            )
        },
        {
            header: 'Status',
            key: 'status',
            render: (val) => (
                <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase ${
                    val === 'Active' ? 'bg-slate-900 text-white border border-slate-900' : 'bg-slate-100 text-slate-400 border border-slate-200'
                }`}>
                    {val === 'Active' ? 'Active' : 'Inactive'}
                </span>
            )
        },
        {
            header: 'Actions',
            key: 'actions',
            align: 'right',
            render: (_, row) => (
                <div className="flex items-center justify-end gap-2">
                    <button onClick={() => handleOpenModal(row)} className="p-2 hover:bg-slate-100 rounded-sm text-slate-400 hover:text-slate-900 transition-all" title="Edit Details">
                        <Edit2 size={13} />
                    </button>
                    <button onClick={() => handleDelete(row._id)} className="p-2 hover:bg-red-50 rounded-sm text-slate-400 hover:text-red-600 transition-all" title="Delete Promotion">
                        <X size={13} />
                    </button>
                </div>
            )
        }
    ], [promotions]);

    return (
        <div className="flex flex-col min-h-screen bg-slate-50/50 pb-20">
            <PageHeader 
                title="Promotion Table" 
                actions={[
                    {
                        label: "Bulk Upload",
                        icon: Upload,
                        onClick: () => { resetBulkModal(); setIsBulkModalOpen(true); },
                        variant: 'primary'
                    },
                    {
                        label: "Add Promotion",
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
                            <div className="flex w-full sm:w-auto items-end justify-between sm:justify-start gap-2">
                                <FilterField label="Promotion status" info="Active = the promotion is currently offered. Inactive = paused, so customers can't use it.">
                                <MultiSelectFilter
                                    value={filters.status}
                                    onChange={(e) => handleFilterChange('status', e.target.value)}
                                    className="w-auto sm:w-28 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none uppercase tracking-wider cursor-pointer"
                                >
                                    <option value="">All Status</option>
                                    <option value="Active">Active</option>
                                    <option value="Paused">Inactive</option>
                                </MultiSelectFilter>
                                </FilterField>
                                
                                <div className="flex items-center gap-2">
                                    {filters.status && (
                                        <button 
                                            onClick={() => {
                                                const cleared = { status: '' };
                                                setFilters(cleared);
                                                fetchPromotions();
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
                    data={filteredPromotions}
                    loading={loading}
                    pagination={{
                        page,
                        totalPages: Math.ceil(filteredPromotions.length / itemsPerPage) || 1,
                        total: filteredPromotions.length
                    }}
                    onPageChange={setPage}
                />
            </div>

            {/* ─── Single Promotion Modal ─────────────────────────────────────── */}
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
                            className="relative w-full max-w-lg bg-white rounded-sm p-10 shadow-2xl space-y-6 border border-slate-200"
                        >
                            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-slate-900 text-white flex items-center justify-center rounded-sm">
                                        <PlusCircle size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-[12px] font-black text-slate-900 uppercase tracking-widest">
                                            {editingPromo ? 'Update Promotion' : 'New Promotion'}
                                        </h3>
                                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">Configure campaign parameters</p>
                                    </div>
                                </div>
                                <button type="button" onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-50 rounded-full text-slate-400">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="space-y-4">
                                {/* Promotion Code (Dropdown) */}
                                <div className="space-y-1.5">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Promotion Code *</label>
                                    <select
                                        required
                                        value={formData.code}
                                        onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                        className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-sm text-xs font-bold text-slate-800 focus:bg-white focus:border-slate-900 transition-all outline-none cursor-pointer uppercase font-mono tracking-widest"
                                    >
                                        <option value="">Select Code</option>
                                        {promotions.map(promo => (
                                            <option key={promo._id} value={promo.code}>{promo.code}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Discount Type */}
                                <div className="space-y-1.5">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Promotion Type *</label>
                                    <select
                                        value={formData.discountType}
                                        onChange={(e) => setFormData({ ...formData, discountType: e.target.value })}
                                        className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-sm text-xs font-bold text-slate-800 focus:bg-white focus:border-slate-900 transition-all outline-none cursor-pointer uppercase tracking-wider"
                                    >
                                        <option value="Percentage">Percentage</option>
                                        <option value="Flat">Flat</option>
                                    </select>
                                </div>

                                {/* Discount Value */}
                                <div className="space-y-1.5">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Promotion Value *</label>
                                    <input 
                                        type="number" required
                                        value={formData.discountValue}
                                        onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                                        placeholder="E.g. 10"
                                        className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-sm text-xs font-bold text-slate-800 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                    />
                                </div>

                                {/* Minimum Amount */}
                                <div className="space-y-1.5">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Minimum Amount *</label>
                                    <input 
                                        type="number" required
                                        value={formData.minOrderValue}
                                        onChange={(e) => setFormData({ ...formData, minOrderValue: e.target.value })}
                                        placeholder="E.g. 299"
                                        className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-sm text-xs font-bold text-slate-800 focus:bg-white focus:border-slate-900 transition-all outline-none"
                                    />
                                </div>

                                {/* Start Date */}
                                <div className="space-y-1.5">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Start Date *</label>
                                    <input 
                                        type="date" required
                                        value={formData.start_date}
                                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                                        className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-sm text-xs font-bold text-slate-800 focus:bg-white focus:border-slate-900 transition-all outline-none cursor-pointer"
                                    />
                                </div>

                                {/* Expiry Date */}
                                <div className="space-y-1.5">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">End Date *</label>
                                    <input 
                                        type="date" required
                                        value={formData.expiryDate}
                                        onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                                        className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-sm text-xs font-bold text-slate-800 focus:bg-white focus:border-slate-900 transition-all outline-none cursor-pointer"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-4 border-t border-slate-100 pt-6">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 border border-slate-200 text-slate-400 hover:text-slate-950 font-black text-[10px] uppercase tracking-widest hover:border-slate-950 transition-all rounded-sm">
                                    Cancel
                                </button>
                                <button type="submit" className="flex-1 py-4 bg-slate-950 text-white font-black text-[10px] uppercase tracking-widest shadow-xl shadow-slate-900/10 active:scale-95 transition-all rounded-sm">
                                    {editingPromo ? 'Update Promotion' : 'Save Promotion'}
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
                                        <h3 className="text-[12px] font-black text-slate-900 uppercase tracking-widest">Bulk Promotions Upload</h3>
                                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">Upload excel sheets containing promotions data</p>
                                    </div>
                                </div>
                                <button type="button" onClick={() => setIsBulkModalOpen(false)} className="p-2 hover:bg-slate-50 rounded-full text-slate-400">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto space-y-6 pr-2">
                                <div className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-sm px-5 py-4">
                                    <div>
                                        <p className="text-[11px] font-black text-slate-900 uppercase tracking-widest">Download Template</p>
                                        <p className="text-[9px] text-slate-400 font-bold mt-0.5">Fill columns: code, discountType, discountValue, start_date, expiryDate, status</p>
                                    </div>
                                    <button
                                        onClick={handleDownloadTemplate}
                                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-widest rounded-sm hover:border-slate-900 hover:text-slate-900 transition-all"
                                    >
                                        <Download size={14} />
                                        Template
                                    </button>
                                </div>

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

                                {bulkError && (
                                    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-sm px-4 py-3">
                                        <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                                        <p className="text-[10px] font-bold text-amber-700">{bulkError}</p>
                                    </div>
                                )}

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
                                                            <th className="px-4 py-2.5 uppercase tracking-widest font-black text-[8px]">Code</th>
                                                            <th className="px-4 py-2.5 uppercase tracking-widest font-black text-[8px]">Type</th>
                                                            <th className="px-4 py-2.5 uppercase tracking-widest font-black text-[8px]">Value</th>
                                                            <th className="px-4 py-2.5 uppercase tracking-widest font-black text-[8px]">Expiry</th>
                                                            <th className="px-4 py-2.5 uppercase tracking-widest font-black text-[8px]">Status</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-50">
                                                        {bulkPreview.map((row, idx) => (
                                                            <tr key={idx} className={row._valid ? 'bg-white hover:bg-slate-50' : 'bg-rose-50'}>
                                                                <td className="px-4 py-2 text-slate-400 tabular-nums">{row._rowIndex}</td>
                                                                <td className="px-4 py-2 text-slate-900 uppercase">{row.code || <span className="text-rose-400">—</span>}</td>
                                                                <td className="px-4 py-2 text-slate-500">{row.discountType}</td>
                                                                <td className="px-4 py-2 text-slate-900">{row.discountValue}</td>
                                                                <td className="px-4 py-2 text-slate-500">{row.expiryDate || <span className="text-rose-400">—</span>}</td>
                                                                <td className="px-4 py-2">
                                                                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${row.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                                                        {row.status}
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

                            {!bulkResult && (
                                <div className="px-8 py-5 border-t border-slate-100 flex items-center justify-between bg-white flex-shrink-0">
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

export default AdminPromotionTable;
