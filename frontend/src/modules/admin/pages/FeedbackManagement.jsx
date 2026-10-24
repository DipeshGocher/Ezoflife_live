import MultiSelectFilter from '../components/common/MultiSelectFilter';
import React, { useState, useEffect, useMemo } from 'react';
import { feedbackApi } from '../../../lib/api';
import PageHeader from '../components/common/PageHeader';
import DataGrid from '../components/tables/DataGrid';
import { Trash2, Star, User } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

const FeedbackManagement = () => {
    const [feedbacks, setFeedbacks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const itemsPerPage = 10;

    const [filters, setFilters] = useState({ userName: '', email: '', category: '', rating: '', submitted: '' });
    const [filterOptions, setFilterOptions] = useState({ userNames: [], emails: [], categories: [], ratings: [], dates: [] });

    const latestFilterRequest = React.useRef(0);
    const fetchFeedbacks = async (currentFilters = filters) => {
        const requestId = ++latestFilterRequest.current;
        try {
            setLoading(true);
            const data = await feedbackApi.getAll(currentFilters);
            if (requestId !== latestFilterRequest.current) return;
            setFeedbacks(data);
        } catch (error) {
            if (requestId !== latestFilterRequest.current) return;
            toast.error('Failed to fetch feedbacks');
        } finally {
            if (requestId === latestFilterRequest.current) setLoading(false);
        }
    };

    const fetchFilters = async () => {
        try {
            const data = await feedbackApi.getFilters();
            setFilterOptions(data || { userNames: [], emails: [], categories: [], ratings: [], dates: [] });
        } catch (error) {
            console.error('Failed to fetch filters:', error);
        }
    };

    useEffect(() => {
        fetchFeedbacks();
        fetchFilters();
    }, []);

    const handleFilterChange = (key, value) => {
        const updatedFilters = { ...filters, [key]: value };
        setFilters(updatedFilters);
        setPage(1);
        fetchFeedbacks(updatedFilters);
    };

    const handleResetFilters = () => {
        const reset = { userName: '', email: '', category: '', rating: '', submitted: '' };
        setFilters(reset);
        setPage(1);
        fetchFeedbacks(reset);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this feedback?')) return;
        try {
            await feedbackApi.delete(id);
            toast.success('Feedback deleted successfully');
            fetchFeedbacks();
            fetchFilters();
        } catch (error) {
            toast.error('Failed to delete feedback');
            console.error('Delete Feedback Error:', error);
        }
    };

    const handleDownload = () => {
        if (!feedbacks || feedbacks.length === 0) {
            toast.error('No feedbacks available to download');
            return;
        }
        const headers = ['Customer Name', 'Email', 'Contact', 'Category', 'Rating', 'Comment', 'Submitted At'];
        const rows = feedbacks.map(item => [
            item.user?.displayName || 'Anonymous',
            item.user?.email || 'N/A',
            item.user?.phoneNumber || 'N/A',
            item.category || '',
            item.rating || '',
            item.comment || '',
            new Date(item.createdAt).toLocaleString()
        ]);

        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Customer Feedbacks');
        XLSX.writeFile(wb, `Customer_Feedbacks_${new Date().toISOString().split('T')[0]}.xlsx`);
        toast.success('Excel downloaded successfully');
    };

    const paginatedFeedbacks = useMemo(() => {
        return feedbacks.slice((page - 1) * itemsPerPage, page * itemsPerPage);
    }, [feedbacks, page]);

    const totalPages = Math.ceil(feedbacks.length / itemsPerPage) || 1;

    const pagination = useMemo(() => ({
        page,
        totalPages,
        total: feedbacks.length
    }), [page, totalPages, feedbacks.length]);

    const columns = useMemo(() => [
        {
            header: 'Customer',
            key: 'user',
            render: (user) => (
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                        <User size={12} />
                    </div>
                    <span className="font-bold text-slate-800 uppercase tracking-tight text-[11px]">
                        {user?.displayName || 'Anonymous'}
                    </span>
                </div>
            )
        },
        {
            header: 'Email',
            key: 'user',
            render: (user) => (
                <span className="text-xs text-primary font-bold">{user?.email || 'N/A'}</span>
            )
        },
        {
            header: 'Contact',
            key: 'user',
            render: (user) => (
                <span className="text-xs text-slate-700 font-bold">{user?.phoneNumber || 'N/A'}</span>
            )
        },
        {
            header: 'Category',
            key: 'category',
            render: (val) => (
                <span className="px-3 py-1 bg-slate-100 text-slate-600 text-[9px] font-black rounded-full uppercase tracking-widest border border-slate-200 whitespace-nowrap">
                    {val}
                </span>
            )
        },
        {
            header: 'Rating',
            key: 'rating',
            render: (rating) => (
                <div className="flex gap-0.5">
                    {[...Array(5)].map((_, i) => (
                        <Star key={i} size={12} className={i < rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'} />
                    ))}
                </div>
            )
        },
        {
            header: 'Comment/Feedback',
            key: 'comment',
            render: (val) => (
                <p className="text-xs text-slate-600 font-medium leading-relaxed max-w-xs whitespace-normal break-words">
                    "{val}"
                </p>
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
            header: 'Actions',
            key: '_id',
            render: (id) => (
                <button 
                    onClick={() => handleDelete(id)}
                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-all cursor-pointer"
                    title="Delete Feedback"
                >
                    <Trash2 size={14} />
                </button>
            )
        }
    ], []);

    return (
        <div className="flex flex-col min-h-screen bg-slate-50/50 pb-20">
            <PageHeader title="Customer Feedback" />

            <div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">
                <DataGrid 
                    title=""
                    showFilter={false}
                    showSearch={false}
                    actions={
                        <div className="flex items-center gap-2">
                            <MultiSelectFilter
                                value={filters.userName}
                                onChange={(e) => handleFilterChange('userName', e.target.value)}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-36 uppercase tracking-wider cursor-pointer"
                            >
                                <option value="">All Customers</option>
                                {filterOptions.userNames.map(name => (
                                    <option key={name} value={name}>{name}</option>
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
                                value={filters.category}
                                onChange={(e) => handleFilterChange('category', e.target.value)}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-32 uppercase tracking-wider cursor-pointer"
                            >
                                <option value="">All Categories</option>
                                {filterOptions.categories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </MultiSelectFilter>
                            <MultiSelectFilter
                                value={filters.rating}
                                onChange={(e) => handleFilterChange('rating', e.target.value)}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-32 uppercase tracking-wider cursor-pointer"
                            >
                                <option value="">All Ratings</option>
                                {filterOptions.ratings.map(rating => (
                                    <option key={rating} value={rating}>{rating} Star{rating > 1 ? 's' : ''}</option>
                                ))}
                            </MultiSelectFilter>
                            <MultiSelectFilter
                                value={filters.submitted}
                                onChange={(e) => handleFilterChange('submitted', e.target.value)}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-32 uppercase tracking-wider cursor-pointer"
                            >
                                <option value="">All Dates</option>
                                {filterOptions.dates.map(date => (
                                    <option key={date} value={date}>{new Date(date).toLocaleDateString('en-GB')}</option>
                                ))}
                            </MultiSelectFilter>
                            {(filters.userName || filters.email || filters.category || filters.rating || filters.submitted) && (
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
                    data={paginatedFeedbacks}
                    loading={loading}
                    pagination={pagination}
                    onPageChange={(newPage) => setPage(newPage)}
                    onDownload={handleDownload}
                />
            </div>
        </div>
    );
};

export default FeedbackManagement;
