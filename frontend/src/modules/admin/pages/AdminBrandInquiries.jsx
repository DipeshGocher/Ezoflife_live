import MultiSelectFilter from '../components/common/MultiSelectFilter';
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { mediaApi } from '../../../lib/api';
import toast from 'react-hot-toast';
import PageHeader from '../components/common/PageHeader';
import DataGrid from '../components/tables/DataGrid';
import * as XLSX from 'xlsx';


const AdminBrandInquiries = () => {
    const [inquiries, setInquiries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const itemsPerPage = 10;

    // Notes Modal State
    const [editingNotesInquiry, setEditingNotesInquiry] = useState(null);
    const [tempNotes, setTempNotes] = useState('');

    const [filters, setFilters] = useState({ brandName: '', email: '', phone: '', budget: '' });
    const [filterOptions, setFilterOptions] = useState({ brands: [], emails: [], phones: [], budgets: [] });

    const latestFilterRequest = React.useRef(0);
    const fetchInquiries = async (currentFilters = filters) => {
        const requestId = ++latestFilterRequest.current;
        try {
            setLoading(true);
            const data = await mediaApi.getAllInquiries(currentFilters);
            if (requestId !== latestFilterRequest.current) return;
            setInquiries(Array.isArray(data) ? data : []);
        } catch (error) {
            if (requestId !== latestFilterRequest.current) return;
            toast.error('Failed to fetch inquiries');
            setInquiries([]);
        } finally {
            if (requestId === latestFilterRequest.current) setLoading(false);
        }
    };

    const fetchFilters = async () => {
        try {
            const data = await mediaApi.getInquiryFilters();
            setFilterOptions(data || { brands: [], emails: [], phones: [], budgets: [] });
        } catch (error) {
            console.error('Failed to fetch filters:', error);
        }
    };

    useEffect(() => {
        fetchInquiries();
        fetchFilters();
    }, []);

    const handleFilterChange = (key, value) => {
        const updatedFilters = { ...filters, [key]: value };
        setFilters(updatedFilters);
        setPage(1);
        fetchInquiries(updatedFilters);
    };

    const handleResetFilters = () => {
        const reset = { brandName: '', email: '', phone: '', budget: '' };
        setFilters(reset);
        setPage(1);
        fetchInquiries(reset);
    };

    const paginatedInquiries = useMemo(() => {
        const list = Array.isArray(inquiries) ? inquiries : [];
        return list.slice((page - 1) * itemsPerPage, page * itemsPerPage);
    }, [inquiries, page]);

    const totalPages = Math.ceil((Array.isArray(inquiries) ? inquiries.length : 0) / itemsPerPage) || 1;

    const pagination = useMemo(() => ({
        page,
        totalPages,
        total: Array.isArray(inquiries) ? inquiries.length : 0
    }), [page, totalPages, inquiries]);

    const handleDownload = () => {
        const list = Array.isArray(inquiries) ? inquiries : [];
        if (list.length === 0) {
            toast.error('No inquiries available to download');
            return;
        }
        const headers = ['Brand', 'Email', 'Contact', 'Location', 'Budget (INR)', 'Timeline', 'Status', 'Submitted At'];
        const rows = list.map(item => [
            item.brandName || '',
            item.email || '',
            item.phone || '',
            item.location || '',
            item.budget || '',
            item.timeline || '',
            item.status || 'New Application',
            new Date(item.createdAt).toLocaleString()
        ]);

        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Brand Inquiries');
        XLSX.writeFile(wb, `Brand_Inquiries_${new Date().toISOString().split('T')[0]}.xlsx`);
        toast.success('Excel downloaded successfully');
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this inquiry?')) return;
        try {
            await mediaApi.deleteInquiry(id);
            toast.success('Inquiry deleted successfully');
            fetchInquiries();
            fetchFilters();
        } catch (error) {
            toast.error('Failed to delete inquiry');
        }
    };

    const columns = useMemo(() => [
        {
            header: 'Brand',
            key: 'brandName',
            render: (val) => (
                <span className="font-bold text-slate-800 uppercase tracking-tight text-[11px]">{val}</span>
            )
        },
        {
            header: 'Email',
            key: 'email',
            render: (val) => (
                <span className="text-xs text-primary font-bold">{val}</span>
            )
        },
        {
            header: 'Contact',
            key: 'phone',
            render: (val) => (
                <span className="text-xs text-slate-700 font-bold">{val}</span>
            )
        },
        {
            header: 'Location',
            key: 'location',
            render: (val) => (
                <div className="flex items-center gap-2 text-slate-600">
                    <span className="material-symbols-outlined text-[14px]">location_on</span>
                    <span className="text-xs font-medium">{val}</span>
                </div>
            )
        },
        {
            header: 'Budget (₹)',
            key: 'budget',
            render: (val) => (
                <span className="text-xs font-bold text-slate-900">₹{val?.toLocaleString()}</span>
            )
        },
        {
            header: 'Timeline',
            key: 'timeline',
            render: (val) => (
                <span className="px-3 py-1 bg-slate-100 text-slate-600 text-[9px] font-black rounded-full uppercase tracking-widest border border-slate-200 whitespace-nowrap">
                    {val}
                </span>
            )
        },
        {
            header: 'Submitted',
            key: 'createdAt',
            render: (val) => (
                <div>
                    <p className="text-xs font-bold text-slate-600">{new Date(val).toLocaleDateString('en-GB')}</p>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{new Date(val).toLocaleTimeString()}</p>
                </div>
            )
        },
        {
            header: 'Status',
            key: 'status',
            render: (val) => {
                const status = val || 'Creative Pending Review';
                let colors = 'bg-amber-50 text-amber-700 border-amber-200'; // Default
                if (status === 'Content Review') {
                    colors = 'bg-indigo-50 text-indigo-700 border-indigo-200';
                } else if (status === 'Invoice Generated') {
                    colors = 'bg-purple-50 text-purple-700 border-purple-200';
                } else if (status === 'Scheduled') {
                    colors = 'bg-blue-50 text-blue-700 border-blue-200';
                } else if (status === 'Running') {
                    colors = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                } else if (status === 'Campaign Ended') {
                    colors = 'bg-slate-100 text-slate-800 border-slate-200';
                } else if (status === 'Paused by Admin') {
                    colors = 'bg-orange-50 text-orange-700 border-orange-200';
                } else if (status === 'Rejected') {
                    colors = 'bg-rose-50 text-rose-700 border-rose-200';
                }
                return (
                    <span className={`px-2.5 py-1 text-[9px] font-black rounded-full uppercase tracking-wider border whitespace-nowrap ${colors}`}>
                        {status}
                    </span>
                );
            }
        },
        {
            header: 'Notes',
            key: 'notes',
            render: (val, row) => (
                <button
                    onClick={() => {
                        setEditingNotesInquiry(row);
                        setTempNotes(row.notes || '');
                    }}
                    className={`px-3 py-1.5 rounded-sm text-[9px] font-black tracking-wider uppercase border text-left truncate max-w-[150px] transition-all cursor-pointer block ${
                        val 
                            ? 'bg-primary/5 text-primary border-primary/20 hover:bg-primary/10' 
                            : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100 hover:text-slate-600'
                    }`}
                    title={val || 'Add Notes'}
                >
                    {val || 'Add Notes'}
                </button>
            )
        },
        {
            header: 'Actions',
            key: '_id',
            align: 'right',
            render: (val, row) => (
                <select
                    value={row.status || 'Creative Pending Review'}
                    onChange={async (e) => {
                        const newStatus = e.target.value;
                        try {
                            await mediaApi.updateInquiryStatus(val, newStatus);
                            toast.success('Stage updated successfully');
                            fetchInquiries();
                        } catch (error) {
                            toast.error('Failed to update stage');
                        }
                    }}
                    className="px-2 py-1 bg-white border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:border-slate-900 transition-all outline-none cursor-pointer uppercase tracking-wider"
                >
                    <option value="Creative Pending Review">Creative Pending Review</option>
                    <option value="Content Review">Content Review</option>
                    <option value="Invoice Generated">Invoice Generated</option>
                    <option value="Scheduled">Scheduled</option>
                    <option value="Running">Running</option>
                    <option value="Campaign Ended">Campaign Ended</option>
                    <option value="Paused by Admin">Paused by Admin</option>
                    <option value="Rejected">Rejected</option>
                </select>
            )
        }
    ], [fetchInquiries]);

    return (
        <div className="flex flex-col min-h-screen bg-slate-50/50 pb-20">
            <PageHeader title="Advertise" />

            <div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">
                <DataGrid 
                    title=""
                    showFilter={false}
                    showSearch={false}
                    actions={
                        <div className="flex items-center flex-wrap gap-2">
                            <MultiSelectFilter
                                value={filters.brandName}
                                onChange={(e) => handleFilterChange('brandName', e.target.value)}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-36 uppercase tracking-wider cursor-pointer"
                            >
                                <option value="">All Brands</option>
                                {filterOptions.brands.map(brand => (
                                    <option key={brand} value={brand}>{brand}</option>
                                ))}
                            </MultiSelectFilter>
                            <MultiSelectFilter
                                value={filters.email}
                                onChange={(e) => handleFilterChange('email', e.target.value)}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-36 uppercase tracking-wider cursor-pointer"
                            >
                                <option value="">All Emails</option>
                                {filterOptions.emails.map(email => (
                                    <option key={email} value={email}>{email}</option>
                                ))}
                            </MultiSelectFilter>
                            <MultiSelectFilter
                                value={filters.phone}
                                onChange={(e) => handleFilterChange('phone', e.target.value)}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-36 uppercase tracking-wider cursor-pointer"
                            >
                                <option value="">All Contacts</option>
                                {filterOptions.phones.map(phone => (
                                    <option key={phone} value={phone}>{phone}</option>
                                ))}
                            </MultiSelectFilter>
                            <MultiSelectFilter
                                value={filters.budget}
                                onChange={(e) => handleFilterChange('budget', e.target.value)}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-32 uppercase tracking-wider cursor-pointer"
                            >
                                <option value="">All Budgets</option>
                                {filterOptions.budgets.map(budget => (
                                    <option key={budget} value={budget}>₹{budget.toLocaleString()}</option>
                                ))}
                            </MultiSelectFilter>
                            {(filters.brandName || filters.email || filters.phone || filters.budget) && (
                                <button 
                                    onClick={handleResetFilters}
                                    className="px-3 py-1.5 border border-slate-200 text-slate-400 hover:text-slate-900 hover:border-slate-900 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all bg-white cursor-pointer animate-fade-in"
                                >
                                    Reset
                                </button>
                            )}
                        </div>
                    }
                    columns={columns}
                    data={paginatedInquiries}
                    loading={loading}
                    pagination={pagination}
                    onPageChange={(newPage) => setPage(newPage)}
                    onDownload={handleDownload}
                />
            </div>

            <AnimatePresence>
                {editingNotesInquiry && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setEditingNotesInquiry(null)}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        />
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white w-full max-w-md rounded-[2rem] p-6 shadow-2xl relative z-10 text-slate-900 border border-slate-200"
                        >
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h2 className="font-black text-lg tracking-tight text-slate-950 leading-tight mt-1">
                                        Notes
                                    </h2>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <textarea
                                        value={tempNotes}
                                        onChange={(e) => setTempNotes(e.target.value)}
                                        placeholder="Add proposal feedback, custom rates, next steps, meeting logs, etc..."
                                        rows={5}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-primary/20 transition-all outline-none resize-none"
                                    />
                                </div>

                                <div className="flex gap-3 justify-end pt-2">
                                    <button 
                                        onClick={() => setEditingNotesInquiry(null)}
                                        className="px-4 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        onClick={async () => {
                                            try {
                                                await mediaApi.updateInquiryNotes(editingNotesInquiry._id, tempNotes);
                                                toast.success('Notes updated successfully');
                                                setEditingNotesInquiry(null);
                                                fetchInquiries();
                                            } catch (error) {
                                                toast.error('Failed to update notes');
                                            }
                                        }}
                                        className="px-5 py-2.5 bg-slate-950 hover:bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                                    >
                                        Save Notes
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AdminBrandInquiries;
