import MultiSelectFilter from '../components/common/MultiSelectFilter';
import { appDialog } from '../../../shared/stores/appDialogStore';
import React, { useState, useEffect, useMemo } from 'react';
import { partnershipApi } from '../../../lib/api';
import toast from 'react-hot-toast';
import PageHeader from '../components/common/PageHeader';
import DataGrid from '../components/tables/DataGrid';
import * as XLSX from 'xlsx';
import FilterField from "../components/common/FilterLabel";


const PartnershipInquiries = () => {
    const [inquiries, setInquiries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const itemsPerPage = 10;

    const [selectedInquiry, setSelectedInquiry] = useState(null);
    const [noteText, setNoteText] = useState('');
    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);

    const [filters, setFilters] = useState({ companyName: '', email: '', phone: '', partnershipType: '', submitted: '' });
    const [filterOptions, setFilterOptions] = useState({ companyNames: [], emails: [], phones: [], partnershipTypes: [], dates: [] });

    const latestFilterRequest = React.useRef(0);
    const fetchInquiries = async (currentFilters = filters) => {
        const requestId = ++latestFilterRequest.current;
        try {
            setLoading(true);
            const data = await partnershipApi.getAll(currentFilters);
            if (requestId !== latestFilterRequest.current) return;
            setInquiries(data);
        } catch (error) {
            if (requestId !== latestFilterRequest.current) return;
            toast.error('Failed to fetch partnership inquiries');
        } finally {
            if (requestId === latestFilterRequest.current) setLoading(false);
        }
    };

    const fetchFilters = async () => {
        try {
            const data = await partnershipApi.getFilters();
            setFilterOptions(data || { companyNames: [], emails: [], phones: [], partnershipTypes: [], dates: [] });
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
        const reset = { companyName: '', email: '', phone: '', partnershipType: '', submitted: '' };
        setFilters(reset);
        setPage(1);
        fetchInquiries(reset);
    };

    const paginatedInquiries = useMemo(() => {
        return inquiries.slice((page - 1) * itemsPerPage, page * itemsPerPage);
    }, [inquiries, page]);

    const totalPages = Math.ceil(inquiries.length / itemsPerPage) || 1;

    const pagination = useMemo(() => ({
        page,
        totalPages,
        total: inquiries.length
    }), [page, totalPages, inquiries.length]);

    const handleDownload = () => {
        if (!inquiries || inquiries.length === 0) {
            toast.error('No inquiries available to download');
            return;
        }
        const headers = ['Company', 'Email', 'Contact', 'Location', 'Partnership Type', 'Status', 'Proposal', 'Website', 'Submitted At'];
        const rows = inquiries.map(item => [
            item.companyName || '',
            item.email || '',
            item.phone || '',
            item.location || '',
            item.partnershipType || '',
            item.status || 'Lead Received',
            item.proposal || '',
            item.website || '',
            new Date(item.createdAt).toLocaleString()
        ]);

        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Partnership Inquiries');
        XLSX.writeFile(wb, `Partnership_Inquiries_${new Date().toISOString().split('T')[0]}.xlsx`);
        toast.success('Excel downloaded successfully');
    };

    const handleDelete = async (id) => {
        if (!await appDialog.confirm('Are you sure you want to delete this partnership inquiry?')) return;
        try {
            await partnershipApi.delete(id);
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
            key: 'companyName',
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
            header: 'Type',
            key: 'partnershipType',
            render: (val) => (
                <span className="px-3 py-1 bg-slate-100 text-slate-600 text-[9px] font-black rounded-full uppercase tracking-widest border border-slate-200 whitespace-nowrap">
                    {val}
                </span>
            )
        },
        {
            header: 'Proposal Details',
            key: 'proposal',
            render: (val) => (
                <p className="text-xs text-slate-600 font-medium leading-relaxed max-w-xs whitespace-normal break-words">
                    "{val}"
                </p>
            )
        },
        {
            header: 'Website',
            key: 'website',
            render: (val) => val ? (
                <a href={val} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs font-bold">
                    Visit Site
                </a>
            ) : (
                <span className="text-[10px] text-slate-300 font-black uppercase tracking-widest">N/A</span>
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
            header: 'Notes',
            key: 'notes',
            render: (val, row) => (
                <button
                    onClick={() => {
                        setSelectedInquiry(row);
                        setNoteText(row.notes || '');
                        setIsNoteModalOpen(true);
                    }}
                    className={`px-3 py-1.5 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${
                        row.notes 
                        ? 'bg-slate-900 border-slate-900 text-white hover:bg-slate-800' 
                        : 'bg-white border-slate-200 text-slate-400 hover:text-slate-900 hover:border-slate-900'
                    }`}
                >
                    {row.notes ? 'View Notes' : 'Add Notes'}
                </button>
            )
        },
        {
            header: 'Status',
            key: 'status',
            render: (val) => {
                let status = val || 'Lead Received';
                if (status === 'New Application') status = 'Lead Received';
                else if (status === 'Requested More Info') status = 'Under Verification';
                else if (status === 'Scheduled Meeting') status = 'Proposal Sent';
                else if (status === 'Final Proposal') status = 'Contract Drafting';

                let colors = 'bg-amber-50 text-amber-700 border-amber-200'; // Default
                if (status === 'Under Verification') {
                    colors = 'bg-indigo-50 text-indigo-700 border-indigo-200';
                } else if (status === 'Proposal Sent') {
                    colors = 'bg-purple-50 text-purple-700 border-purple-200';
                } else if (status === 'Contract Drafting') {
                    colors = 'bg-cyan-50 text-cyan-700 border-cyan-200';
                } else if (status === 'Account Setup') {
                    colors = 'bg-blue-50 text-blue-700 border-blue-200';
                } else if (status === 'Active') {
                    colors = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                } else if (status === 'Suspended') {
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
            header: 'Actions',
            key: '_id',
            align: 'right',
            render: (val, row) => {
                let currentStatus = row.status || 'Lead Received';
                if (currentStatus === 'New Application') currentStatus = 'Lead Received';
                else if (currentStatus === 'Requested More Info') currentStatus = 'Under Verification';
                else if (currentStatus === 'Scheduled Meeting') currentStatus = 'Proposal Sent';
                else if (currentStatus === 'Final Proposal') currentStatus = 'Contract Drafting';

                return (
                    <select
                        value={currentStatus}
                    onChange={async (e) => {
                        const newStatus = e.target.value;
                        try {
                            await partnershipApi.updateStatus(val, newStatus);
                            toast.success('Stage updated successfully');
                            fetchInquiries();
                        } catch (error) {
                            toast.error('Failed to update stage');
                        }
                    }}
                    className="px-2 py-1 bg-white border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:border-slate-900 transition-all outline-none cursor-pointer uppercase tracking-wider"
                >
                    <option value="Lead Received">Lead Received</option>
                    <option value="Under Verification">Under Verification</option>
                    <option value="Proposal Sent">Proposal Sent</option>
                    <option value="Contract Drafting">Contract Drafting</option>
                    <option value="Account Setup">Account Setup</option>
                    <option value="Active">Active</option>
                    <option value="Suspended">Suspended</option>
                    <option value="Rejected">Rejected</option>
                </select>
                );
            }
        }
    ], [fetchInquiries]);

    return (
        <div className="flex flex-col min-h-screen bg-slate-50/50 pb-20">
            <PageHeader title="Partnership Inquiries" />

            <div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">
                <DataGrid 
                    title=""
                    showFilter={false}
                    showSearch={false}
                    actions={
                        <div className="flex items-end flex-wrap gap-2">
                            <FilterField label="Brand" info="Shows only inquiries from this company or brand.">
                            <MultiSelectFilter
                                value={filters.companyName}
                                onChange={(e) => handleFilterChange('companyName', e.target.value)}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-36 uppercase tracking-wider cursor-pointer"
                            >
                                <option value="">All Brands</option>
                                {filterOptions.companyNames.map(brand => (
                                    <option key={brand} value={brand}>{brand}</option>
                                ))}
                            </MultiSelectFilter>
                            </FilterField>
                            <FilterField label="Email" info="Shows only inquiries sent from this email address.">
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
                            </FilterField>
                            <FilterField label="Contact number" info="Shows only inquiries with this phone number.">
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
                            </FilterField>
                            <FilterField label="Partnership type" info="Shows only inquiries for this kind of partnership (as chosen on the partner form).">
                            <MultiSelectFilter
                                value={filters.partnershipType}
                                onChange={(e) => handleFilterChange('partnershipType', e.target.value)}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-32 uppercase tracking-wider cursor-pointer"
                            >
                                <option value="">All Types</option>
                                {filterOptions.partnershipTypes.map(type => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </MultiSelectFilter>
                            </FilterField>
                            <FilterField label="Submitted on" info="Shows only inquiries submitted on this date.">
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
                            </FilterField>
                            {(filters.companyName || filters.email || filters.phone || filters.partnershipType || filters.submitted) && (
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

            {/* Notes Editor Modal */}
            {isNoteModalOpen && selectedInquiry && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                    <div 
                        onClick={() => {
                            setIsNoteModalOpen(false);
                            setSelectedInquiry(null);
                        }}
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                    />
                    <div className="bg-white w-full max-w-md rounded-[2.5rem] p-6 shadow-2xl relative z-10 text-slate-900 border border-slate-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Notes</h3>
                        </div>
                        <textarea
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="Write internal notes/feedback here..."
                            rows={6}
                            className="w-full py-4 px-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-800 focus:bg-white focus:border-slate-900 outline-none resize-none"
                        />
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setIsNoteModalOpen(false);
                                    setSelectedInquiry(null);
                                }}
                                className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    try {
                                        await partnershipApi.updateNotes(selectedInquiry._id, noteText);
                                        toast.success('Notes updated successfully');
                                        setIsNoteModalOpen(false);
                                        setSelectedInquiry(null);
                                        fetchInquiries();
                                    } catch (err) {
                                        toast.error('Failed to update notes');
                                    }
                                }}
                                className="flex-1 py-3.5 bg-slate-950 hover:bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-lg shadow-slate-950/10"
                            >
                                Save Notes
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PartnershipInquiries;

