import MultiSelectFilter from '../components/common/MultiSelectFilter';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supplierServiceZoneApi, adminApi } from '../../../lib/api';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import { 
    Plus, Edit2, X, Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, PlusCircle
} from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import DataGrid from '../components/tables/DataGrid';

const SupplierServiceZoneManagement = () => {
    const [zones, setZones] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [editingZone, setEditingZone] = useState(null);
    const [formData, setFormData] = useState({
        zoneName: '',
        supplierId: 'SUP-001',
        pincodes: '',
        deliveryCharges: '0',
        minOrderValue: '0',
        supplierPlatformMultiplier: '1.0',
        minSupplierPlatformFee: '0',
        maxSupplierPlatformFee: '',
        isActive: true
    });

    const [supplierMap, setSupplierMap] = useState({});

    const [filters, setFilters] = useState({
        zoneName: '',
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

    const latestFilterRequest = React.useRef(0);
    const fetchZones = async (page = 1, activeFilters = filters) => {
        const requestId = ++latestFilterRequest.current;
        try {
            setLoading(true);
            const result = await supplierServiceZoneApi.getPaginated(page, pagination.limit, activeFilters);
            if (requestId !== latestFilterRequest.current) return;
            
            if (result.data && result.pagination) {
                setZones(result.data);
                setPagination(result.pagination);
            } else {
                setZones(Array.isArray(result) ? result : []);
            }
        } catch (error) {
            if (requestId !== latestFilterRequest.current) return;
            toast.error('Failed to fetch supplier service zones');
        } finally {
            if (requestId === latestFilterRequest.current) setLoading(false);
        }
    };

    const handleFilterChange = (key, value) => {
        const updatedFilters = { ...filters, [key]: value };
        setFilters(updatedFilters);
        fetchZones(1, updatedFilters);
    };

    const handleDownload = () => {
        if (!zones || zones.length === 0) {
            toast.error('No service zones available to download');
            return;
        }
        const headers = ['Zone ID', 'Zone Name', 'Supplier ID', 'Pincodes', 'Delivery Charges (INR)', 'Min Order Value (INR)', 'Platform Aggregator (x)', 'Min Platform Fee', 'Max Platform Fee', 'Status'];
        const rows = zones.map(z => [
            z.zoneId || '—',
            z.zoneName || '',
            z.supplierId || 'SUP-001',
            Array.isArray(z.pincodes) ? z.pincodes.join('; ') : '',
            z.deliveryCharges || 0,
            z.minOrderValue || 0,
            z.supplierPlatformMultiplier || 1.0,
            z.minSupplierPlatformFee || 0,
            z.maxSupplierPlatformFee || '',
            z.isActive ? 'Active' : 'Inactive'
        ]);

        const csvRows = [
            headers.join(','),
            ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Supplier_Service_Zones_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('CSV downloaded successfully');
    };

    // Download a sample template the user can fill and re-upload
    const handleDownloadTemplate = () => {
        const headers = ['zoneName', 'supplierId', 'pincodes', 'deliveryCharges', 'minOrderValue', 'supplierPlatformMultiplier', 'minSupplierPlatformFee', 'maxSupplierPlatformFee', 'isActive'];
        const sample = [
            ['North Zone', 'SUP-001', '452001,452010', '50', '300', '1.0', '10', '50', 'TRUE'],
            ['South Zone', 'SUP-002', '452005,452015', '40', '250', '1.05', '0', '', 'TRUE'],
            ['West Zone', 'SUP-001', '452020', '0', '500', '1.1', '5', '100', 'FALSE']
        ];
        const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'ServiceZones');
        XLSX.writeFile(wb, 'Supplier_Service_Zones_Bulk_Upload_Template.xlsx');
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
                    const zoneName = row['zoneName'] || row['Zone Name'] || row['zone'] || row['Zone'] || '';
                    const supplierId = row['supplierId'] || row['Supplier ID'] || row['supplier'] || 'SUP-001';
                    const pincodesRaw = row['pincodes'] || row['Pincodes'] || row['pincode'] || '';
                    const deliveryCharges = row['deliveryCharges'] || row['Delivery Charges'] || 0;
                    const minOrderValue = row['minOrderValue'] || row['Min Order Value'] || 0;
                    const supplierPlatformMultiplier = row['supplierPlatformMultiplier'] || row['Platform Aggregator'] || 1.0;
                    const minSupplierPlatformFee = row['minSupplierPlatformFee'] || row['Min Platform Fee'] || 0;
                    const maxSupplierPlatformFee = row['maxSupplierPlatformFee'] || row['Max Platform Fee'] || '';
                    const activeRaw = row['isActive'] ?? row['Is Active'] ?? row['status'] ?? row['Status'] ?? 'TRUE';
                    const isActive = typeof activeRaw === 'boolean'
                        ? activeRaw
                        : String(activeRaw).toLowerCase() !== 'false' &&
                          String(activeRaw).toLowerCase() !== '0' &&
                          String(activeRaw).toLowerCase() !== 'inactive';

                    return {
                        _rowIndex: idx + 2, // 1-indexed row for error messages
                        zoneName: String(zoneName).trim(),
                        supplierId: String(supplierId).trim(),
                        pincodes: String(pincodesRaw).split(',').map(p => p.trim()).filter(Boolean),
                        deliveryCharges: Number(deliveryCharges) || 0,
                        minOrderValue: Number(minOrderValue) || 0,
                        supplierPlatformMultiplier: Number(supplierPlatformMultiplier) || 1.0,
                        minSupplierPlatformFee: Number(minSupplierPlatformFee) || 0,
                        maxSupplierPlatformFee: maxSupplierPlatformFee ? Number(maxSupplierPlatformFee) : null,
                        isActive,
                        _valid: !!String(zoneName).trim() && String(pincodesRaw).trim().length > 0
                    };
                });

                const invalid = normalised.filter(r => !r._valid).length;
                if (invalid > 0) {
                    setBulkError(`${invalid} row(s) are missing zoneName or pincodes and will be skipped.`);
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
            const result = await supplierServiceZoneApi.bulkUpload(validRows);
            setBulkResult(result);
            toast.success(`Upload done! Created: ${result.results?.created ?? '?'}, Skipped: ${result.results?.skipped ?? '?'}`);
            fetchZones(1);
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

    const fetchSuppliers = async () => {
        try {
            const suppliersList = await adminApi.getAllSuppliers();
            const map = {};
            if (Array.isArray(suppliersList)) {
                suppliersList.forEach(s => {
                    const phone = s.phone || '';
                    const id = `SUP-${phone ? phone.slice(-4) : '001'}`;
                    map[id] = s.supplierDetails?.businessName || s.displayName || s.ownerName || 'SUPPLIER';
                });
            }
            setSupplierMap(map);
        } catch (err) {
            console.error('Error fetching suppliers:', err);
        }
    };

    useEffect(() => {
        fetchSuppliers();
        fetchZones(1);
    }, []);

    const handleOpenModal = (zone = null) => {
        if (zone) {
            setEditingZone(zone);
            setFormData({
                zoneName: zone.zoneName || '',
                supplierId: zone.supplierId || 'SUP-001',
                pincodes: Array.isArray(zone.pincodes) ? zone.pincodes.join(', ') : '',
                deliveryCharges: String(zone.deliveryCharges || 0),
                minOrderValue: String(zone.minOrderValue || 0),
                supplierPlatformMultiplier: String(zone.supplierPlatformMultiplier || 1.0),
                minSupplierPlatformFee: String(zone.minSupplierPlatformFee || 0),
                maxSupplierPlatformFee: zone.maxSupplierPlatformFee !== null && zone.maxSupplierPlatformFee !== undefined ? String(zone.maxSupplierPlatformFee) : '',
                isActive: zone.isActive !== undefined ? zone.isActive : true
            });
        } else {
            setEditingZone(null);
            setFormData({
                zoneName: '',
                supplierId: 'SUP-001',
                pincodes: '',
                deliveryCharges: '0',
                minOrderValue: '0',
                supplierPlatformMultiplier: '0',
                minSupplierPlatformFee: '0',
                maxSupplierPlatformFee: '',
                isActive: true
            });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const pincodesArr = formData.pincodes.split(',').map(p => p.trim()).filter(Boolean);
            const payload = {
                ...formData,
                pincodes: pincodesArr,
                deliveryCharges: Number(formData.deliveryCharges) || 0,
                minOrderValue: Number(formData.minOrderValue) || 0,
                supplierPlatformMultiplier: Number(formData.supplierPlatformMultiplier) || 0,
                minSupplierPlatformFee: Number(formData.minSupplierPlatformFee) || 0,
                maxSupplierPlatformFee: formData.maxSupplierPlatformFee ? Number(formData.maxSupplierPlatformFee) : null
            };
            if (editingZone) {
                await supplierServiceZoneApi.update(editingZone._id, payload);
                toast.success('Service zone updated');
            } else {
                await supplierServiceZoneApi.create(payload);
                toast.success('Service zone created');
            }
            setIsModalOpen(false);
            fetchZones(pagination.page);
        } catch (error) {
            toast.error(error.message || 'Operation failed');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this service zone?')) {
            try {
                await supplierServiceZoneApi.delete(id);
                toast.success('Service zone deleted');
                fetchZones(pagination.page);
            } catch (error) {
                toast.error(error.message || 'Failed to delete');
            }
        }
    };

    const columns = useMemo(() => [
        {
            header: 'Supplier Name',
            key: 'supplierId',
            render: (val) => {
                const name = supplierMap[val] || val || 'SUP-001';
                return (
                    <span className="font-black text-slate-800 uppercase tracking-tight">
                        {name}
                    </span>
                );
            }
        },
        {
            header: 'Zone Name',
            key: 'zoneName',
            render: (val) => (
                <span className="font-bold uppercase tracking-tight text-slate-800">{val}</span>
            )
        },
        {
            header: 'Pincode',
            key: 'pincodes',
            render: (val) => (
                <div className="flex flex-wrap gap-1 max-w-xs">
                    {Array.isArray(val) && val.map(p => (
                        <span key={p} className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-sm font-bold text-[9px] tabular-nums">
                            {p}
                        </span>
                    ))}
                </div>
            )
        },
        {
            header: 'Platform Aggregator',
            key: 'supplierPlatformMultiplier',
            render: (val) => (
                <span className="font-bold text-slate-900 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-sm tabular-nums text-[11px] whitespace-nowrap">
                    {val ? `${val}` : '0'}
                </span>
            )
        },
        {
            header: 'Min Fee',
            key: 'minSupplierPlatformFee',
            render: (val) => (
                <span className="font-bold text-slate-600 tabular-nums text-[11px]">
                    ₹{val || 0}
                </span>
            )
        },
        {
            header: 'Max Fee',
            key: 'maxSupplierPlatformFee',
            render: (val) => (
                <span className="font-bold text-slate-600 tabular-nums text-[11px]">
                    {val !== null && val !== undefined && val !== '' ? `₹${val}` : 'No Limit'}
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
    ], [supplierMap]);

    const validCount = bulkPreview.filter(r => r._valid).length;
    const invalidCount = bulkPreview.filter(r => !r._valid).length;

    return (
        <div className="flex flex-col min-h-screen bg-slate-50/50 pb-20">
            <PageHeader 
                title="Service Zone" 
                actions={[
                    {
                        label: "Bulk Upload",
                        icon: Upload,
                        onClick: () => { resetBulkModal(); setIsBulkModalOpen(true); },
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
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
                            <div className="flex items-center w-full sm:w-auto">
                                <input
                                    type="text"
                                    placeholder="Search Zone Name"
                                    value={filters.zoneName}
                                    onChange={(e) => handleFilterChange('zoneName', e.target.value)}
                                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-full sm:w-48 placeholder-slate-400 uppercase tracking-wider"
                                />
                            </div>
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                <MultiSelectFilter
                                    value={filters.isActive}
                                    onChange={(e) => handleFilterChange('isActive', e.target.value)}
                                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-28 sm:w-36 uppercase tracking-wider cursor-pointer"
                                >
                                    <option value="">All Status</option>
                                    <option value="true">Active</option>
                                    <option value="false">Inactive</option>
                                </MultiSelectFilter>
                                {(filters.zoneName || filters.isActive !== '') && (
                                    <button 
                                        onClick={() => {
                                            const cleared = { zoneName: '', isActive: '' };
                                            setFilters(cleared);
                                            fetchZones(1, cleared);
                                        }}
                                        className="px-3 py-1.5 border border-slate-200 text-slate-400 hover:text-slate-900 hover:border-slate-900 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all bg-white"
                                    >
                                        Reset
                                    </button>
                                )}
                                <button 
                                    onClick={handleDownload}
                                    className="p-2 hover:bg-slate-50 text-slate-400 hover:text-slate-900 rounded-sm border border-slate-200 bg-white flex items-center justify-center h-8 w-8 ml-auto sm:ml-0"
                                    title="Download Excel/CSV"
                                >
                                    <Download size={14} />
                                </button>
                            </div>
                        </div>
                    }
                    columns={columns}
                    data={zones}
                    loading={loading}
                    pagination={pagination}
                    onPageChange={(newPage) => fetchZones(newPage)}
                />
            </div>

            {/* ─── Single Zone Modal ─────────────────────────────────────── */}
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
                            className="relative w-full max-w-2xl bg-white rounded-sm p-8 shadow-2xl flex flex-col max-h-[90vh] border border-slate-200"
                        >
                            <div className="flex justify-between items-center mb-6 shrink-0 border-b border-slate-100 pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-slate-900 text-white flex items-center justify-center rounded-sm shadow-md">
                                        <PlusCircle size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-[14px] font-black text-slate-900 uppercase tracking-widest">{editingZone ? 'Update Details' : 'New Service Zone'}</h3>
                                        {!editingZone && (
                                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">ID auto-generated on save</p>
                                        )}
                                    </div>
                                </div>
                                <button type="button" onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-sm text-slate-400 transition-colors">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="overflow-y-auto pr-2 pb-4 space-y-4 custom-scrollbar flex-1">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {editingZone && (
                                        <div className="space-y-1.5 md:col-span-2">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Zone ID (Auto-generated)</label>
                                            <div className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-sm text-[11px] font-bold text-slate-400">
                                                {formData.zoneId || 'Auto-generated'}
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-800 uppercase tracking-widest block ml-1">Zone Name</label>
                                        <input 
                                            required
                                            value={formData.zoneName}
                                            onChange={e => setFormData({...formData, zoneName: e.target.value})}
                                            className="w-full px-4 py-3 bg-white border border-slate-200 hover:border-slate-300 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all outline-none"
                                            placeholder="e.g. North Zone"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-800 uppercase tracking-widest block ml-1">Supplier ID</label>
                                        <input 
                                            required
                                            value={formData.supplierId}
                                            onChange={e => setFormData({...formData, supplierId: e.target.value})}
                                            className="w-full px-4 py-3 bg-white border border-slate-200 hover:border-slate-300 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all outline-none"
                                            placeholder="e.g. SUP-001"
                                        />
                                    </div>

                                    <div className="space-y-1.5 md:col-span-2">
                                        <label className="text-[9px] font-black text-slate-800 uppercase tracking-widest block ml-1">Pincodes (Comma separated)</label>
                                        <input 
                                            required
                                            value={formData.pincodes}
                                            onChange={e => setFormData({...formData, pincodes: e.target.value})}
                                            className="w-full px-4 py-3 bg-white border border-slate-200 hover:border-slate-300 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all outline-none"
                                            placeholder="e.g. 452001, 452010"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-800 uppercase tracking-widest block ml-1">Delivery Charges (₹)</label>
                                        <input 
                                            required
                                            type="number"
                                            min="0"
                                            value={formData.deliveryCharges}
                                            onChange={e => setFormData({...formData, deliveryCharges: e.target.value})}
                                            className="w-full px-4 py-3 bg-white border border-slate-200 hover:border-slate-300 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all outline-none"
                                            placeholder="e.g. 50"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-800 uppercase tracking-widest block ml-1">Min Order Value (₹)</label>
                                        <input 
                                            required
                                            type="number"
                                            min="0"
                                            value={formData.minOrderValue}
                                            onChange={e => setFormData({...formData, minOrderValue: e.target.value})}
                                            className="w-full px-4 py-3 bg-white border border-slate-200 hover:border-slate-300 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all outline-none"
                                            placeholder="e.g. 200"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-800 uppercase tracking-widest block ml-1">Platform Aggregator (Multiplier)</label>
                                        <input 
                                            required
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={formData.supplierPlatformMultiplier}
                                            onChange={e => setFormData({...formData, supplierPlatformMultiplier: e.target.value})}
                                            className="w-full px-4 py-3 bg-white border border-slate-200 hover:border-slate-300 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all outline-none"
                                            placeholder="e.g. 1.0 or 1.05"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-800 uppercase tracking-widest block ml-1">Min Platform Fee (₹)</label>
                                        <input 
                                            type="number"
                                            min="0"
                                            value={formData.minSupplierPlatformFee}
                                            onChange={e => setFormData({...formData, minSupplierPlatformFee: e.target.value})}
                                            className="w-full px-4 py-3 bg-white border border-slate-200 hover:border-slate-300 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all outline-none"
                                            placeholder="e.g. 10"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-800 uppercase tracking-widest block ml-1">Max Platform Fee (₹)</label>
                                        <input 
                                            type="number"
                                            min="0"
                                            value={formData.maxSupplierPlatformFee}
                                            onChange={e => setFormData({...formData, maxSupplierPlatformFee: e.target.value})}
                                            className="w-full px-4 py-3 bg-white border border-slate-200 hover:border-slate-300 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all outline-none"
                                            placeholder="Leave empty for No Limit"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-800 uppercase tracking-widest block ml-1">Status</label>
                                        <select
                                            value={formData.isActive}
                                            onChange={e => setFormData({...formData, isActive: e.target.value === 'true'})}
                                            className="w-full px-4 py-3 bg-white border border-slate-200 hover:border-slate-300 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all outline-none uppercase tracking-wider cursor-pointer"
                                        >
                                            <option value="true">Active</option>
                                            <option value="false">Inactive</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-100 mt-2 shrink-0">
                                <button className="w-full bg-slate-900 text-white py-4 rounded-sm font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-slate-900/10 hover:bg-black transition-all">
                                    Save Changes
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
                                        <h3 className="text-[13px] font-black text-slate-900 uppercase tracking-widest">Bulk Upload Service Zones</h3>
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
                                        <p className="text-[9px] text-slate-400 font-bold mt-0.5">Fill columns: zoneName, supplierId, pincodes, deliveryCharges, minOrderValue, supplierPlatformMultiplier, isActive</p>
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
                                                            <th className="px-4 py-2.5 uppercase tracking-widest font-black text-[8px]">Zone ID</th>
                                                            <th className="px-4 py-2.5 uppercase tracking-widest font-black text-[8px]">Zone Name</th>
                                                            <th className="px-4 py-2.5 uppercase tracking-widest font-black text-[8px]">Supplier ID</th>
                                                            <th className="px-4 py-2.5 uppercase tracking-widest font-black text-[8px]">Pincodes</th>
                                                            <th className="px-4 py-2.5 uppercase tracking-widest font-black text-[8px]">Delivery Charges</th>
                                                            <th className="px-4 py-2.5 uppercase tracking-widest font-black text-[8px]">Min Order Value</th>
                                                            <th className="px-4 py-2.5 uppercase tracking-widest font-black text-[8px]">Platform Agg.</th>
                                                            <th className="px-4 py-2.5 uppercase tracking-widest font-black text-[8px]">Min Fee</th>
                                                            <th className="px-4 py-2.5 uppercase tracking-widest font-black text-[8px]">Max Fee</th>
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
                                                                <td className="px-4 py-2 text-slate-900 uppercase">{row.zoneName || <span className="text-rose-400">—</span>}</td>
                                                                <td className="px-4 py-2 text-slate-500">{row.supplierId}</td>
                                                                <td className="px-4 py-2 text-slate-500">{row.pincodes.join(', ') || <span className="text-rose-400">—</span>}</td>
                                                                <td className="px-4 py-2 text-slate-500">₹{row.deliveryCharges}</td>
                                                                <td className="px-4 py-2 text-slate-500">₹{row.minOrderValue}</td>
                                                                <td className="px-4 py-2 text-slate-500">{row.supplierPlatformMultiplier}x</td>
                                                                <td className="px-4 py-2 text-slate-500">₹{row.minSupplierPlatformFee}</td>
                                                                <td className="px-4 py-2 text-slate-500">{row.maxSupplierPlatformFee !== null ? `₹${row.maxSupplierPlatformFee}` : 'No Limit'}</td>
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

export default SupplierServiceZoneManagement;
