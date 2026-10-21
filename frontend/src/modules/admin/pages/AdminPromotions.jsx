import { appDialog } from '../../../shared/stores/appDialogStore';
import React, { useState, useEffect, useMemo } from 'react';
import { Tag, Check, X, FileText, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import { promotionApi, masterServiceApi, serviceApi } from '../../../lib/api';
import PageHeader from '../components/common/PageHeader';
import DataGrid from '../components/tables/DataGrid';
import toast from 'react-hot-toast';
import FilterField from "../components/common/FilterLabel";

const AdminPromotions = () => {
    const [promotions, setPromotions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [page, setPage] = useState(1);
    const itemsPerPage = 10;
    const [showExportDropdown, setShowExportDropdown] = useState(false);
    const [rejectionModal, setRejectionModal] = useState(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const [serviceMap, setServiceMap] = useState({});
    const [selectedPromoServices, setSelectedPromoServices] = useState(null);

    const fetchPromotions = async () => {
        try {
            setLoading(true);
            const data = await promotionApi.adminList();
            const vendorOnlyPromos = (data || []).filter(promo => promo.owner_type === 'VENDOR');
            setPromotions(vendorOnlyPromos);
        } catch (error) {
            console.error('Fetch Admin Promotions Error:', error);
            toast.error('Failed to load promotions');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPromotions();
        
        const fetchServicesMap = async () => {
            try {
                const [masterRes, customRes] = await Promise.all([
                    masterServiceApi.getAll(),
                    serviceApi.getAll()
                ]);
                const map = {};
                if (Array.isArray(masterRes)) {
                    masterRes.forEach(s => {
                        const id = s._id || s.id;
                        map[id] = s.itemName || s.name;
                    });
                }
                if (Array.isArray(customRes)) {
                    customRes.forEach(s => {
                        const id = s._id || s.id;
                        map[id] = s.name || s.itemName;
                    });
                }
                setServiceMap(map);
            } catch (err) {
                console.error('Error fetching services map for admin:', err);
            }
        };
        fetchServicesMap();
    }, []);

    const handleApprove = async (id) => {
        if (!await appDialog.confirm('Are you sure you want to approve this promotion?')) return;
        try {
            await promotionApi.adminApprove(id);
            toast.success('Promotion approved successfully!');
            fetchPromotions();
        } catch (error) {
            toast.error(error.message || 'Failed to approve promotion');
        }
    };

    const handleReject = (id) => {
        setRejectionModal(id);
        setRejectionReason('');
    };

    const submitRejection = async () => {
        if (!rejectionModal || !rejectionReason.trim()) return;
        try {
            await promotionApi.adminReject(rejectionModal, rejectionReason);
            toast.success('Promotion rejected successfully!');
            setRejectionModal(null);
            setRejectionReason('');
            fetchPromotions();
        } catch (error) {
            toast.error(error.message || 'Failed to reject promotion');
        }
    };

    const filteredPromotions = useMemo(() => {
        return promotions.filter(promo => {
            let matchesDate = true;
            if (promo.createdAt) {
                const promoDate = new Date(promo.createdAt);
                promoDate.setHours(0, 0, 0, 0);

                if (startDate) {
                    const start = new Date(startDate);
                    start.setHours(0, 0, 0, 0);
                    if (promoDate < start) matchesDate = false;
                }
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    if (promoDate > end) matchesDate = false;
                }
            } else if (startDate || endDate) {
                matchesDate = false;
            }

            return matchesDate;
        });
    }, [promotions, startDate, endDate]);

    const paginatedPromotions = useMemo(() => {
        return filteredPromotions.slice((page - 1) * itemsPerPage, page * itemsPerPage);
    }, [filteredPromotions, page]);

    const columns = useMemo(() => [
        {
            header: 'Vendor Name',
            key: 'vendorName',
            render: (_, row) => (
                <span className="font-black text-slate-900 text-[11px] uppercase tracking-tight">
                    {row.vendorId?.shopDetails?.name || row.vendorId?.shopDetails?.shopName || row.vendorId?.displayName || row.vendorId?.name || 'Platform'}
                </span>
            )
        },
        {
            header: 'Contact Number',
            key: 'vendorPhone',
            render: (_, row) => (
                <span className="text-[10px] font-bold text-slate-900 tracking-wider font-mono">
                    {row.vendorId?.phone || 'N/A'}
                </span>
            )
        },
        {
            header: 'Discount Code',
            key: 'code',
            render: (val) => (
                <span className="text-[10px] text-slate-900 font-mono font-black uppercase tracking-widest bg-slate-50 border border-slate-200 px-2 py-1 rounded">
                    {val}
                </span>
            )
        },
        {
            header: 'Discount Value',
            key: 'discountValue',
            render: (_, row) => {
                const discount = row.discountValue || row.discount_value || 0;
                const type = row.discountType || row.discount_type || 'Percentage';
                return (
                    <span className="text-[11px] font-black text-emerald-600">
                        {type === 'Flat' || type === 'FLAT_AMOUNT' ? `₹${discount}` : `${discount}%`} OFF
                    </span>
                );
            }
        },
        {
            header: 'Geofence',
            key: 'geofence',
            render: (_, row) => (
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">
                    {row.geofence_id?.areaName || row.geofence_id?.name || 'Global (All Areas)'}
                </span>
            )
        },
        {
            header: 'Services',
            key: 'services',
            render: (_, row) => {
                if (row.scope_type === 'GLOBAL_ORDER' || !row.selected_services || row.selected_services.length === 0) {
                    return (
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">
                            All Services
                        </span>
                    );
                }
                
                const getServiceName = (svc) => {
                    if (typeof svc === 'object' && svc !== null) {
                        return svc.name || svc.itemName;
                    }
                    return serviceMap[svc] || `Service ${svc.slice(-4)}`;
                };

                const serviceNames = row.selected_services.map(svc => getServiceName(svc));

                if (serviceNames.length <= 2) {
                    return (
                        <span className="text-[10px] text-slate-900 font-bold uppercase tracking-tight">
                            {serviceNames.join(', ')}
                        </span>
                    );
                }

                return (
                    <button 
                        onClick={() => setSelectedPromoServices(serviceNames)}
                        className="text-blue-600 hover:text-blue-800 font-black text-[10px] uppercase tracking-wide underline focus:outline-none"
                    >
                        {serviceNames.length} Services
                    </button>
                );
            }
        },
        {
            header: 'Min. Order',
            key: 'minOrderValue',
            render: (_, row) => (
                <span className="text-[10px] font-bold text-slate-900 uppercase tracking-widest tabular-nums">
                    ₹{row.minOrderValue || row.min_order_value || 0}
                </span>
            )
        },
        {
            header: 'Start Date',
            key: 'start_date',
            render: (_, row) => (
                <span className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">
                    {new Date(row.start_date || row.createdAt).toLocaleDateString()}
                </span>
            )
        },
        {
            header: 'End Date',
            key: 'expiryDate',
            render: (_, row) => (
                <span className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">
                    {new Date(row.expiryDate).toLocaleDateString()}
                </span>
            )
        },
        {
            header: 'Early Access',
            key: 'is_exclusive_window_eligible',
            render: (val) => (
                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
                    val ? 'bg-purple-50 text-purple-600 border border-purple-100' : 'bg-slate-50 text-slate-400 border border-slate-100'
                }`}>
                    {val ? 'Priority (120s)' : 'Standard'}
                </span>
            )
        },
        {
            header: 'Status',
            key: 'approval_status',
            render: (val) => (
                <span className={`px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-widest ${
                    val === 'APPROVED' 
                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                        : val === 'REJECTED'
                        ? 'bg-rose-50 text-rose-600 border border-rose-100'
                        : 'bg-amber-50 text-amber-600 border border-amber-100'
                }`}>
                    {val || 'PENDING'}
                </span>
            )
        },
        {
            header: 'Actions',
            key: 'actions',
            align: 'right',
            render: (_, row) => (
                <div className="flex items-center justify-end gap-2">
                    {row.approval_status === 'PENDING' ? (
                        <>
                            <button 
                                onClick={() => handleReject(row._id)}
                                title="Reject Promotion"
                                className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-rose-500 hover:bg-rose-600 hover:text-white hover:border-rose-600 transition-all shadow-sm"
                            >
                                <X size={13} />
                            </button>
                            <button 
                                onClick={() => handleApprove(row._id)}
                                title="Approve Promotion"
                                className="p-2 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-500 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all shadow-sm"
                            >
                                <Check size={13} />
                            </button>
                        </>
                    ) : (
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                            Processed
                        </span>
                    )}
                </div>
            )
        }
    ], [promotions, serviceMap]);

    const handleExport = (format) => {
        try {
            const headers = [
                "Vendor Name", "Contact Number", "Discount Code", "Value", "Type", "Geofence", "Min Order (₹)", "Limit", "Start Date", "Expiry Date", "Status"
            ];
            
            const rows = filteredPromotions.map(promo => [
                promo.vendorId?.shopDetails?.name || promo.vendorId?.shopDetails?.shopName || promo.vendorId?.displayName || promo.vendorId?.name || 'Platform',
                promo.vendorId?.phone || 'N/A',
                promo.code || '',
                promo.discountValue || promo.discount_value || 0,
                promo.discountType || 'Percentage',
                promo.geofence_id?.areaName || promo.geofence_id?.name || 'Global (All Areas)',
                promo.minOrderValue || promo.min_order_value || 0,
                promo.usageLimit || 100,
                new Date(promo.start_date || promo.createdAt).toLocaleDateString(),
                new Date(promo.expiryDate).toLocaleDateString(),
                promo.approval_status || 'PENDING'
            ]);

            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

            // Auto-fit column widths
            ws['!cols'] = headers.map((header, colIndex) => {
                let maxLen = header.length;
                rows.forEach(row => {
                    const val = row[colIndex];
                    if (val !== undefined && val !== null) {
                        const strVal = String(val);
                        if (strVal.length > maxLen) {
                            maxLen = strVal.length;
                        }
                    }
                });
                return { wch: Math.min(Math.max(maxLen + 3, 12), 50) };
            });

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Promotions");

            if (format === 'excel') {
                XLSX.writeFile(wb, `Promotions_Export_${new Date().getTime()}.xlsx`);
            } else if (format === 'csv') {
                XLSX.writeFile(wb, `Promotions_Export_${new Date().getTime()}.csv`, { bookType: 'csv' });
            }
            toast.success(`${format.toUpperCase()} export downloaded successfully`);
        } catch (err) {
            console.error(`Export ${format} error:`, err);
            toast.error(`Error exporting to ${format}`);
        }
    };

    return (
        <div className="flex flex-col min-h-screen bg-slate-50/50 pb-20 animate-fade-in">
            <PageHeader 
                title="" 
                actions={[
                    {
                        customComponent: (
                            <div className="relative">
                                <button
                                    onClick={() => setShowExportDropdown(!showExportDropdown)}
                                    className="px-3 py-1.5 rounded-sm font-bold text-[9px] uppercase tracking-[0.2em] transition-all flex items-center gap-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                                >
                                    <FileText size={13} />
                                    Export Promotions List
                                    <ChevronDown size={12} className={`transition-transform duration-200 ${showExportDropdown ? 'rotate-180' : ''}`} />
                                </button>
                                {showExportDropdown && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setShowExportDropdown(false)} />
                                        <div className="absolute right-0 mt-1.5 w-32 bg-white border border-slate-200 rounded-sm shadow-lg z-50 py-1 text-left">
                                            <button
                                                onClick={() => {
                                                    setShowExportDropdown(false);
                                                    handleExport('excel');
                                                }}
                                                className="w-full text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
                                            >
                                                Excel
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setShowExportDropdown(false);
                                                    handleExport('csv');
                                                }}
                                                className="w-full text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
                                            >
                                                CSV
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )
                    }
                ]}
            />

            <div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">
                <DataGrid 
                    title=""
                    showTotalEntities={false}
                    leftContent={
                        <div className="flex items-end gap-2">
                            <FilterField label="Created from" info="Shows only promotions created on or after this date.">
                            <input 
                                type="date"
                                value={startDate}
                                onChange={(e) => {
                                    setStartDate(e.target.value);
                                    setPage(1);
                                }}
                                className="bg-slate-50 border border-slate-200/80 rounded-sm px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-800 hover:bg-slate-100/50 focus:border-slate-300 outline-none cursor-pointer transition-all h-[32px]"
                            />
                            </FilterField>
                            <FilterField label="Created to" info="Shows only promotions created on or before this date (whole day included).">
                            <input 
                                type="date"
                                value={endDate}
                                onChange={(e) => {
                                    setEndDate(e.target.value);
                                    setPage(1);
                                }}
                                className="bg-slate-50 border border-slate-200/80 rounded-sm px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-800 hover:bg-slate-100/50 focus:border-slate-300 outline-none cursor-pointer transition-all h-[32px]"
                            />
                            </FilterField>
                            {(startDate || endDate) && (
                                <button
                                    onClick={() => {
                                        setStartDate('');
                                        setEndDate('');
                                        setPage(1);
                                    }}
                                    className="px-3 py-1.5 bg-rose-50 border border-rose-100 text-rose-500 hover:bg-rose-600 hover:text-white hover:border-rose-600 rounded-sm transition-all text-[9px] font-black uppercase tracking-wider h-[32px] flex items-center justify-center"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                    }
                    columns={columns}
                    data={paginatedPromotions}
                    loading={loading}
                    showSearch={false}
                    showFilter={false}
                    pagination={{
                        page,
                        totalPages: Math.ceil(filteredPromotions.length / itemsPerPage) || 1,
                        total: filteredPromotions.length
                    }}
                    onPageChange={setPage}
                />
            </div>

            {/* Rejection Modal */}
            <AnimatePresence>
                {rejectionModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setRejectionModal(null)}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl relative z-10 flex flex-col overflow-hidden p-8 space-y-6"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
                                        <X size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Reject Promotion</h3>
                                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Please provide a reason</p>
                                    </div>
                                </div>
                                <button onClick={() => setRejectionModal(null)} className="p-2 hover:bg-slate-50 rounded-full transition-colors border border-slate-200">
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Rejection Reason</label>
                                <textarea
                                    value={rejectionReason}
                                    onChange={(e) => setRejectionReason(e.target.value)}
                                    placeholder="Enter the reason why this B2B promotion is being rejected..."
                                    rows={4}
                                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:border-slate-900 focus:bg-white transition-all resize-none placeholder:text-slate-300"
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setRejectionModal(null)}
                                    className="flex-1 py-3 border border-slate-200 hover:bg-slate-50 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={submitRejection}
                                    disabled={!rejectionReason.trim()}
                                    className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-slate-900/10"
                                >
                                    Submit Rejection
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Selected Services Modal */}
            <AnimatePresence>
                {selectedPromoServices && (
                    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedPromoServices(null)}
                            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-[2rem] shadow-2xl p-8 max-w-sm w-full relative z-10 border border-slate-100 text-left"
                        >
                            <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 mb-4">Target Services</h3>
                            <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                                {selectedPromoServices.map((name, index) => (
                                    <div key={index} className="flex items-center gap-2 py-2 px-3 bg-slate-50 rounded-xl border border-slate-100">
                                        <span className="material-symbols-outlined text-sm text-slate-400">check_circle</span>
                                        <span className="text-xs font-bold text-slate-700">{name}</span>
                                    </div>
                                ))}
                            </div>
                            <button 
                                onClick={() => setSelectedPromoServices(null)}
                                className="w-full mt-6 py-3.5 bg-slate-950 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-900 transition-colors"
                            >
                                Close
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AdminPromotions;
