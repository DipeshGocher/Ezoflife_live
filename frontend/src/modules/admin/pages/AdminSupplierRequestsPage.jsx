import FilterSearchParams from '../../../lib/FilterSearchParams';
import MultiSelectFilter from '../components/common/MultiSelectFilter';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
    ShieldCheck, 
    UserPlus, 
    MapPin, 
    Briefcase,
    Clock,
    Eye,
    CheckCircle2,
    Factory,
    FileText,
    ChevronDown
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { BASE_URL } from '../../../lib/api';
import PageHeader from '../components/common/PageHeader';

const AdminSupplierRequestsPage = () => {
    const navigate = useNavigate();
    const [requests, setRequests] = useState([]);
    const [unfilteredRequests, setUnfilteredRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const itemsPerPage = 10;

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSupplier, setSelectedSupplier] = useState('');
    const [selectedBusiness, setSelectedBusiness] = useState('');
    const [selectedPhone, setSelectedPhone] = useState('');
    const [showExportDropdown, setShowExportDropdown] = useState(false);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    useEffect(() => {
        fetchUnfiltered();
    }, []);

    useEffect(() => {
        const filters = {};
        if (selectedSupplier) filters.supplierName = selectedSupplier;
        if (selectedBusiness) filters.businessName = selectedBusiness;
        if (selectedPhone) filters.phone = selectedPhone;

        fetchRequests(filters);
        setPage(1);
    }, [selectedSupplier, selectedBusiness, selectedPhone]);

    const fetchUnfiltered = async () => {
        try {
            const response = await fetch(`${BASE_URL}/supplier/requests`);
            const data = await response.json();
            if (Array.isArray(data)) {
                setUnfilteredRequests(data);
            }
        } catch (error) {
            console.error('Fetch Unfiltered Supplier Requests Error:', error);
        }
    };

    const latestFilterRequest = React.useRef(0);
    const fetchRequests = async (filters = {}) => {
        const requestId = ++latestFilterRequest.current;
        try {
            setLoading(true);
            const queryParams = new FilterSearchParams(filters).toString();
            const url = `${BASE_URL}/supplier/requests${queryParams ? `?${queryParams}` : ''}`;
            const response = await fetch(url);
            if (requestId !== latestFilterRequest.current) return;
            const data = await response.json();
            if (requestId !== latestFilterRequest.current) return;
            if (Array.isArray(data)) {
                setRequests(data);
            } else {
                setRequests([]);
            }
        } catch (error) {
            if (requestId !== latestFilterRequest.current) return;
            console.error('Fetch Supplier Requests Error:', error);
            setRequests([]);
        } finally {
            if (requestId === latestFilterRequest.current) setLoading(false);
        }
    };

    const uniqueSuppliers = React.useMemo(() => {
        const names = unfilteredRequests.map(item => item.contactPersonName).filter(Boolean);
        return [...new Set(names)].sort();
    }, [unfilteredRequests]);

    const uniqueBusinesses = React.useMemo(() => {
        const names = unfilteredRequests.map(item => item.registeredBusinessName).filter(Boolean);
        return [...new Set(names)].sort();
    }, [unfilteredRequests]);

    const uniquePhones = React.useMemo(() => {
        const phones = unfilteredRequests.map(item => item.user?.phone).filter(Boolean);
        return [...new Set(phones)].sort();
    }, [unfilteredRequests]);

    const getStageColor = (stage) => {
        switch (stage) {
            case 'Initial_Approval_Pending': return 'bg-amber-50 text-amber-600 border-amber-100';
            case 'Product_Selection_Phase': return 'bg-blue-50 text-blue-600 border-blue-100';
            case 'Final_Approval_Pending': return 'bg-purple-50 text-purple-600 border-purple-100';
            case 'Onboarded': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
            default: return 'bg-slate-50 text-slate-600 border-slate-100';
        }
    };

    useEffect(() => {
        setPage(1);
    }, [startDate, endDate]);

    const formatStageName = (stage) => {
        return stage?.replace(/_/g, ' ') || 'Unknown';
    };

    const filteredRequests = React.useMemo(() => {
        return requests.filter(req => {
            // 1. Text Search Filter
            if (searchQuery.trim()) {
                const query = searchQuery.toLowerCase();
                const matchesName = (req.contactPersonName || req.user?.name || '').toLowerCase().includes(query);
                const matchesPhone = (req.user?.phone || '').toLowerCase().includes(query);
                const matchesBusiness = (req.registeredBusinessName || '').toLowerCase().includes(query);
                const matchesAddress = (req.warehouseAddress || '').toLowerCase().includes(query);
                const matchesCity = (req.city || '').toLowerCase().includes(query);
                const matchesPincode = (req.pincode || '').toLowerCase().includes(query);
                if (!matchesName && !matchesPhone && !matchesBusiness && !matchesAddress && !matchesCity && !matchesPincode) {
                    return false;
                }
            }

            // 2. Date Filter
            if (!req.createdAt) return !startDate && !endDate;

            const reqDate = new Date(req.createdAt);
            reqDate.setHours(0, 0, 0, 0);

            if (startDate) {
                const start = new Date(startDate);
                start.setHours(0, 0, 0, 0);
                if (reqDate < start) return false;
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                if (reqDate > end) return false;
            }
            return true;
        });
    }, [requests, startDate, endDate, searchQuery]);

    const paginatedRequests = React.useMemo(() => {
        return filteredRequests.slice((page - 1) * itemsPerPage, page * itemsPerPage);
    }, [filteredRequests, page]);

    const totalPages = Math.ceil(filteredRequests.length / itemsPerPage) || 1;

    const handleExportFile = (format) => {
        try {
            const headers = [
                "Supplier Name", "Business Name", "Contact Number", 
                "Application Date", "Onboarding Status", "Current Phase"
            ];
            
            const rows = filteredRequests.map(req => [
                req.contactPersonName || req.user?.name || '—',
                req.registeredBusinessName || '—',
                req.user?.phone || 'No Phone',
                new Date(req.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                req.status || 'Pending',
                req.onboardingStage?.replace(/_/g, ' ') || 'Unknown'
            ]);

            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

            // Auto-fit column widths to prevent text clipping in Excel
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
            XLSX.utils.book_append_sheet(wb, ws, "Supplier Requests");

            if (format === 'excel') {
                XLSX.writeFile(wb, `Supplier_Requests_${new Date().getTime()}.xlsx`);
            } else if (format === 'csv') {
                XLSX.writeFile(wb, `Supplier_Requests_${new Date().getTime()}.csv`, { bookType: 'csv' });
            }
            alert(`${format.toUpperCase()} export downloaded successfully`);
        } catch (err) {
            console.error(`Export ${format} error:`, err);
            alert(`Error exporting to ${format}`);
        }
    };

    return (
        <div className="flex flex-col min-h-screen bg-slate-50/50 pb-20">
            <PageHeader 
                title="Supplier Registration Request" 
                actions={[
                    {
                        customComponent: (
                            <div className="relative">
                                <button
                                    onClick={() => setShowExportDropdown(!showExportDropdown)}
                                    className="px-3 py-1.5 rounded-sm font-bold text-[9px] uppercase tracking-[0.2em] transition-all flex items-center gap-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                                >
                                    <FileText size={13} />
                                    Export Supplier Requests
                                    <ChevronDown size={12} className={`transition-transform duration-200 ${showExportDropdown ? 'rotate-180' : ''}`} />
                                </button>
                                {showExportDropdown && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setShowExportDropdown(false)} />
                                        <div className="absolute right-0 mt-1.5 w-32 bg-white border border-slate-200 rounded-sm shadow-lg z-50 py-1 text-left">
                                            <button
                                                onClick={() => {
                                                    setShowExportDropdown(false);
                                                    handleExportFile('excel');
                                                }}
                                                className="w-full text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
                                            >
                                                Excel
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setShowExportDropdown(false);
                                                    handleExportFile('csv');
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

                {/* Table Container */}
                <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
                    {/* Grid Header Strip with Filters on the Right */}
                    <div className="px-8 py-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between bg-white gap-4">
                        {/* Date & Text Search Filters on the Left */}
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="relative">
                            <input 
                              type="text"
                              placeholder="Search Supplier..."
                              value={searchQuery}
                              onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setPage(1);
                              }}
                              className="bg-slate-50 border border-slate-200/80 rounded-sm px-3 py-1.5 pl-8 text-[10px] font-bold text-slate-800 focus:bg-white focus:border-slate-900 outline-none w-56 transition-all"
                            />
                            <svg className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                          </div>
                        </div>

                        {/* Dropdown Filters on the Right */}
                        <div className="flex flex-wrap items-center gap-2 justify-end">
                            <MultiSelectFilter
                                value={selectedSupplier}
                                onChange={(e) => setSelectedSupplier(e.target.value)}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-36 uppercase tracking-wider cursor-pointer"
                            >
                                <option value="">All Suppliers</option>
                                {uniqueSuppliers.map(name => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </MultiSelectFilter>
                            <MultiSelectFilter
                                value={selectedBusiness}
                                onChange={(e) => setSelectedBusiness(e.target.value)}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-36 uppercase tracking-wider cursor-pointer"
                            >
                                <option value="">All Businesses</option>
                                {uniqueBusinesses.map(name => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </MultiSelectFilter>
                            <MultiSelectFilter
                                value={selectedPhone}
                                onChange={(e) => setSelectedPhone(e.target.value)}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-28 uppercase tracking-wider cursor-pointer"
                            >
                                <option value="">All Numbers</option>
                                {uniquePhones.map(phone => (
                                    <option key={phone} value={phone}>{phone}</option>
                                ))}
                            </MultiSelectFilter>
                            {(selectedSupplier || selectedBusiness || selectedPhone || searchQuery) && (
                                <button
                                    onClick={() => {
                                        setSelectedSupplier('');
                                        setSelectedBusiness('');
                                        setSelectedPhone('');
                                        setSearchQuery('');
                                    }}
                                    className="px-3 py-1.5 border border-slate-200 text-slate-400 hover:text-slate-900 hover:border-slate-900 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all bg-white cursor-pointer"
                                >
                                    Reset
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="overflow-x-auto w-full">
                        <table className="w-full text-left border-collapse min-w-[950px]">
                            <thead>
                                <tr className="bg-slate-50/50 border-b border-slate-100">
                                    <th className="w-[18%] min-w-[130px] px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Supplier Name</th>
                                    <th className="w-[20%] min-w-[140px] px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Business Name</th>
                                    <th className="w-[12%] min-w-[110px] px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Contact Number</th>
                                    <th className="w-[13%] min-w-[110px] px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Application Date</th>
                                    <th className="w-[13%] min-w-[110px] px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Onboarding Status</th>
                                    <th className="w-[14%] min-w-[120px] px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Current Phase</th>
                                    <th className="w-[10%] min-w-[130px] px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={7} className="py-20 text-center">
                                            <div className="w-10 h-10 border-4 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Syncing Supplier Data...</p>
                                        </td>
                                    </tr>
                                ) : filteredRequests.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="py-32 text-center">
                                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-200 mx-auto mb-4">
                                                <Factory size={32} />
                                            </div>
                                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Pipeline Empty</h3>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">No active supplier requests found.</p>
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedRequests.map((req) => (
                                        <tr key={req._id} className="hover:bg-slate-50/50 transition-colors group">
                                            <td className="px-6 py-5">
                                                <span className="text-sm font-black text-slate-900 tracking-tight whitespace-nowrap">{req.contactPersonName || req.user?.name || '—'}</span>
                                            </td>
                                            <td className="px-6 py-5 whitespace-normal break-words">
                                                <span className="text-xs font-bold text-slate-600">{req.registeredBusinessName || '—'}</span>
                                            </td>
                                            <td className="px-6 py-5">
                                                <span className="text-xs font-bold text-slate-600 tabular-nums whitespace-nowrap">{req.user?.phone || 'No Phone'}</span>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-2 whitespace-nowrap">
                                                    <Clock size={14} className="text-slate-300" />
                                                    <span className="text-[11px] font-bold text-slate-600 tabular-nums">
                                                        {new Date(req.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border whitespace-nowrap ${req.status === 'Approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                                                    {req.status === 'Approved' ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                                                    {req.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex flex-col">
                                                    <span className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border w-fit whitespace-nowrap ${getStageColor(req.onboardingStage)}`}>
                                                        {formatStageName(req.onboardingStage)}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5 text-right">
                                                <button 
                                                    onClick={() => navigate(`/admin/supplier-requests/${req._id}`)}
                                                    className="h-10 px-6 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-primary transition-all shadow-lg active:scale-95 whitespace-nowrap cursor-pointer ml-auto"
                                                >
                                                    <Eye size={14} />
                                                    Process Phase
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    
                    {/* Pagination Controls */}
                    {filteredRequests.length > 0 && (
                        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end transition-colors hover:bg-slate-100/30">
                            <div className="flex items-center gap-1">
                                <button 
                                    disabled={page <= 1 || loading}
                                    onClick={() => setPage(p => p - 1)}
                                    className="p-1 px-3 border border-slate-200 text-[9px] font-bold uppercase tracking-widest rounded-sm bg-white hover:bg-slate-950 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    Prev
                                </button>
                                <span className="px-4 text-[9px] font-black text-slate-900 tracking-widest tabular-nums bg-slate-200/50 h-6 flex items-center rounded-sm whitespace-nowrap">
                                    PG {String(page).padStart(2, '0')} / {String(totalPages).padStart(2, '0')}
                                </span>
                                <button 
                                    disabled={page >= totalPages || loading}
                                    onClick={() => setPage(p => p + 1)}
                                    className="p-1 px-3 border border-slate-200 text-[9px] font-bold uppercase tracking-widest rounded-sm bg-white hover:bg-slate-950 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminSupplierRequestsPage;
