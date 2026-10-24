import FilterSearchParams from '../../../lib/FilterSearchParams';
import MultiSelectFilter from '../components/common/MultiSelectFilter';
import { appDialog } from '../../../shared/stores/appDialogStore';
import React, { useState, useEffect, useMemo } from 'react';
import { BASE_URL } from '../../../lib/api';
import { toast } from 'react-hot-toast';
import {
    Download, MapPin, Globe, Zap, Percent, ShieldCheck,
    ChevronRight, Info, Settings, MoreHorizontal, Map, Trash2, X, Save, Edit2, TrendingUp, Truck
} from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import DataGrid from '../components/tables/DataGrid';
import FilterField from "../components/common/FilterLabel";

const ServiceGeofenceTable = () => {
    const [areas, setAreas] = useState([]);
    const [uniqueAreaNames, setUniqueAreaNames] = useState([]);
    const [uniqueBaseMultipliers, setUniqueBaseMultipliers] = useState([]);
    const [uniqueExpressMultipliers, setUniqueExpressMultipliers] = useState([]);
    const [uniqueHeritageMultipliers, setUniqueHeritageMultipliers] = useState([]);
    const [uniqueDiscountMultipliers, setUniqueDiscountMultipliers] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filter states
    const [selectedAreaName, setSelectedAreaName] = useState('');
    const [searchAreaNameInput, setSearchAreaNameInput] = useState('');
    const [searchBaseMultiplier, setSearchBaseMultiplier] = useState('');
    const [searchExpressMultiplier, setSearchExpressMultiplier] = useState('');
    const [searchHeritageMultiplier, setSearchHeritageMultiplier] = useState('');
    const [searchDiscountMultiplier, setSearchDiscountMultiplier] = useState('');

    const latestFilterRequest = React.useRef(0);
    const fetchAreas = async () => {
        const requestId = ++latestFilterRequest.current;
        try {
            setLoading(true);
            const queryParams = new FilterSearchParams();
            
            const activeAreaName = selectedAreaName || searchAreaNameInput;
            if (activeAreaName) {
                queryParams.append('areaName', activeAreaName);
            }
            if (searchBaseMultiplier) {
                queryParams.append('basePriceMultiplier', searchBaseMultiplier);
            }
            if (searchExpressMultiplier) {
                queryParams.append('dynamicSurgeMultiplier', searchExpressMultiplier);
            }
            if (searchHeritageMultiplier) {
                queryParams.append('heritageMultiplier', searchHeritageMultiplier);
            }
            if (searchDiscountMultiplier) {
                queryParams.append('discountPriceMultiplier', searchDiscountMultiplier);
            }

            const res = await fetch(`${BASE_URL}/geofence/areas?${queryParams.toString()}`);
            if (requestId !== latestFilterRequest.current) return;
            const data = await res.json();
            if (requestId !== latestFilterRequest.current) return;
            setAreas(data);
        } catch (err) {
            if (requestId !== latestFilterRequest.current) return;
            toast.error('Failed to load geofence data');
        } finally {
            if (requestId === latestFilterRequest.current) setLoading(false);
        }
    };

    const handleDownload = () => {
        if (!areas || areas.length === 0) {
            toast.error('No service geofence areas available to download');
            return;
        }

        const headers = [
            'Fence ID',
            'Area Name',
            'City',
            'Pincodes',
            'Base Multiplier',
            'Express Multiplier',
            'Heritage Multiplier',
            'Discount Multiplier',
            'Platform Multiplier',
            'Min Platform Fee',
            'Max Platform Fee',
            'Free Delivery Threshold',
            'Minimum Order Value',
            'Show Discount',
            'Status'
        ];

        const escapeCSV = (str) => {
            if (str === null || str === undefined) return "";
            const stringified = String(str);
            if (stringified.includes(",") || stringified.includes('"') || stringified.includes("\n")) {
                return `"${stringified.replace(/"/g, '""')}"`;
            }
            return stringified;
        };

        const csvRows = [headers.join(",")];

        for (const area of areas) {
            const pincodesList = (area.pincodes || []).join('; ');
            const rowData = [
                area.excelFenceId || '—',
                area.areaName || '',
                area.city || '—',
                pincodesList,
                `${area.basePriceMultiplier || 1.0}x`,
                `${area.dynamicSurgeMultiplier || 1.0}x`,
                `${area.heritageMultiplier || 1.0}x`,
                `${area.discountPriceMultiplier || 1.0}x`,
                `${area.platformMultiplier || 1.0}x`,
                `₹${area.minPlatformFee || 0}`,
                area.maxPlatformFee ? `₹${area.maxPlatformFee}` : 'No Limit',
                `₹${area.freeDeliveryThreshold || 0}`,
                `₹${area.minimumOrderValue || 0}`,
                area.allowDiscount !== false ? 'Yes' : 'No',
                area.isActive ? 'Active' : 'Inactive'
            ];
            csvRows.push(rowData.map(escapeCSV).join(","));
        }

        const csvString = csvRows.join("\n");
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `service_geofence_export_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Geofence registry exported successfully!');
    };

    // Load initial unique names and multipliers for dropdowns
    const loadInitialNames = async () => {
        try {
            const res = await fetch(`${BASE_URL}/geofence/areas`);
            const data = await res.json();
            
            const names = Array.from(new Set(data.map(a => a.areaName).filter(Boolean))).sort();
            setUniqueAreaNames(names);

            const baseMults = Array.from(new Set(data.map(a => a.basePriceMultiplier).filter(val => val !== undefined && val !== null))).sort((a, b) => a - b);
            setUniqueBaseMultipliers(baseMults);

            const expressMults = Array.from(new Set(data.map(a => a.dynamicSurgeMultiplier).filter(val => val !== undefined && val !== null))).sort((a, b) => a - b);
            setUniqueExpressMultipliers(expressMults);

            const heritageMults = Array.from(new Set(data.map(a => a.heritageMultiplier).filter(val => val !== undefined && val !== null))).sort((a, b) => a - b);
            setUniqueHeritageMultipliers(heritageMults);

            const discountMults = Array.from(new Set(data.map(a => a.discountPriceMultiplier).filter(val => val !== undefined && val !== null))).sort((a, b) => a - b);
            setUniqueDiscountMultipliers(discountMults);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        loadInitialNames();
    }, []);

    // Refetch when filters change
    useEffect(() => {
        fetchAreas();
    }, [selectedAreaName, searchAreaNameInput, searchBaseMultiplier, searchExpressMultiplier, searchHeritageMultiplier, searchDiscountMultiplier]);

    const handleDeleteArea = async (id) => {
        if (!await appDialog.confirm('Delete this service zone?')) return;
        try {
            const res = await fetch(`${BASE_URL}/geofence/areas/${id}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success('Zone deleted');
                fetchAreas();
                loadInitialNames();
            }
        } catch (err) {
            toast.error('Delete failed');
        }
    };

    const [editingArea, setEditingArea] = useState(null);
    const handleUpdateArea = async () => {
        try {
            const res = await fetch(`${BASE_URL}/geofence/areas/${editingArea._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    areaName: editingArea.areaName,
                    dynamicSurgeMultiplier: editingArea.dynamicSurgeMultiplier === '' ? 1.0 : Number(editingArea.dynamicSurgeMultiplier),
                    basePriceMultiplier: editingArea.basePriceMultiplier === '' ? 1.0 : Number(editingArea.basePriceMultiplier),
                    discountPriceMultiplier: editingArea.discountPriceMultiplier === '' ? 1.0 : Number(editingArea.discountPriceMultiplier),
                    heritageMultiplier: editingArea.heritageMultiplier === '' ? 1.0 : Number(editingArea.heritageMultiplier),
                    allowDiscount: editingArea.allowDiscount !== false,
                    platformMultiplier: editingArea.platformMultiplier === '' ? 1.0 : Number(editingArea.platformMultiplier),
                    minPlatformFee: editingArea.minPlatformFee === '' ? 0 : Number(editingArea.minPlatformFee),
                    maxPlatformFee: editingArea.maxPlatformFee === '' || editingArea.maxPlatformFee === null ? null : Number(editingArea.maxPlatformFee),
                    freeDeliveryThreshold: editingArea.freeDeliveryThreshold === '' ? 0 : Number(editingArea.freeDeliveryThreshold)
                })
            });
            if (res.ok) {
                toast.success('Multipliers updated');
                setEditingArea(null);
                fetchAreas();
                loadInitialNames();
            }
        } catch (err) {
            toast.error('Update failed');
        }
    };

    const columns = useMemo(() => [
        {
            header: 'Fence ID',
            key: 'excelFenceId',
            render: (val) => (
                <span className="font-black text-slate-900 bg-slate-50 px-2 py-1 rounded-sm border border-slate-100 text-[10px]">
                    {val || '—'}
                </span>
            )
        },
        {
            header: 'Area Name',
            key: 'areaName',
            render: (val, row) => (
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-sm" style={{ backgroundColor: row.color || '#3b82f6' }}>
                        <Map size={14} />
                    </div>
                    <div className="flex flex-col">
                        <span className="font-bold text-slate-800 uppercase tracking-tight">{val}</span>
                    </div>
                </div>
            )
        },
        {
            header: 'Boundary',
            key: 'boundary',
            render: (val) => (
                <div className="flex items-center gap-1.5 text-slate-500 font-bold">
                    <span className="text-[10px] bg-slate-50 px-2 py-0.5 rounded-sm border border-slate-100 uppercase tracking-tighter">
                        Polygon [{val?.coordinates[0]?.length || 0} Points]
                    </span>
                </div>
            )
        },
        {
            header: 'Pincodes',
            key: 'pincodes',
            render: (val) => (
                <div className="flex flex-wrap gap-1 max-w-[200px]">
                    {val?.map(p => (
                        <span key={p} className="text-[9px] font-black text-slate-500 bg-white border border-slate-100 px-1.5 py-0.5 rounded-sm">
                            {p}
                        </span>
                    ))}
                </div>
            )
        },
        {
            header: 'Base Mult.',
            key: 'basePriceMultiplier',
            render: (val) => (
                <div className="flex items-center gap-1.5 text-slate-900 font-bold">
                    <span>{val || 1.0}x</span>
                </div>
            )
        },
        {
            header: 'Express Mult.',
            key: 'dynamicSurgeMultiplier',
            render: (val) => (
                <div className="flex items-center gap-1.5 text-slate-900 font-bold">
                    <span>{val || 1.0}x</span>
                </div>
            )
        },
        {
            header: 'Heritage Mult.',
            key: 'heritageMultiplier',
            render: (val) => (
                <div className="flex items-center gap-1.5 text-slate-900 font-bold">
                    <span>{val || 1.0}x</span>
                </div>
            )
        },
        {
            header: 'Disc. Mult.',
            key: 'discountPriceMultiplier',
            render: (val) => (
                <div className="flex items-center gap-1.5 text-slate-900 font-bold">
                    <span>{val || 1.0}x</span>
                </div>
            )
        },
        {
            header: 'Show Discount',
            key: 'allowDiscount',
            render: (val) => {
                const displayVal = val !== false;
                return (
                    <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${displayVal ? 'bg-slate-900 text-white border border-slate-900' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>
                        {displayVal ? 'Y' : 'N'}
                    </span>
                );
            }
        },
        {
            header: 'Status',
            key: 'isActive',
            render: (val) => (
                <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${val ? 'bg-slate-900 text-white border border-slate-900' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>
                    {val ? 'Active' : 'Inactive'}
                </span>
            )
        },
        {
            header: 'Platform Mult.',
            key: 'platformMultiplier',
            render: (val) => (
                <div className="flex items-center gap-1.5 text-slate-900 font-bold">
                    <span>{val || 1.0}x</span>
                </div>
            )
        },
        {
            header: 'Min Plat. Fee',
            key: 'minPlatformFee',
            render: (val) => (
                <div className="flex items-center gap-1.5 text-slate-900 font-bold">
                    <span>₹{val || 0}</span>
                </div>
            )
        },
        {
            header: 'Max Plat. Fee',
            key: 'maxPlatformFee',
            render: (val) => (
                <div className="flex items-center gap-1.5 text-slate-900 font-bold">
                    <span>{val ? `₹${val}` : 'No Limit'}</span>
                </div>
            )
        },
        {
            header: 'Free Delivery Threshold',
            key: 'freeDeliveryThreshold',
            render: (val) => (
                <div className="flex items-center gap-1.5 text-slate-900 font-bold">
                    <span>₹{val || 0}</span>
                </div>
            )
        },
        {
            header: 'Actions',
            key: 'actions',
            align: 'right',
            render: (val, row) => (
                <div className="flex items-center justify-end gap-2">
                    <button
                        onClick={() => setEditingArea(row)}
                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-900 transition-all"
                    >
                        <Edit2 size={14} />
                    </button>
                </div>
            )
        }
    ], []);

    return (
        <div className="flex flex-col min-h-screen bg-slate-50/50 pb-20">
            <PageHeader
                title="Service Geofences"
            />

            <div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">
                <DataGrid
                    title=""
                    showFilter={false}
                    showSearch={false}
                    actions={
                        <div className="flex items-end gap-1.5 flex-nowrap overflow-x-auto max-w-[280px] sm:max-w-[380px] md:max-w-[520px] lg:max-w-[650px] xl:max-w-[850px] 2xl:max-w-[1100px] py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                            {/* Area Name Dropdown */}
                            <FilterField label="Area" info="Shows only this service area. Choosing one clears the typed search next to it.">
                            <MultiSelectFilter
                                value={selectedAreaName}
                                onChange={(e) => {
                                    setSelectedAreaName(e.target.value);
                                    if (e.target.value !== '') {
                                        setSearchAreaNameInput('');
                                    }
                                }}
                                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[9px] font-black uppercase tracking-tight outline-none focus:bg-white focus:border-slate-300 transition-all cursor-pointer text-slate-900 shrink-0 min-w-[120px]"
                            >
                                <option value="">ALL AREAS</option>
                                {uniqueAreaNames.map(name => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </MultiSelectFilter>
                            </FilterField>

                            {/* Area Name Input */}
                            <FilterField label="Search area name" info="Finds service areas by name as you type. Typing clears the Area dropdown.">
                            <input
                                type="text"
                                value={searchAreaNameInput}
                                onChange={(e) => {
                                    setSearchAreaNameInput(e.target.value);
                                    if (e.target.value !== '') {
                                        setSelectedAreaName('');
                                    }
                                }}
                                placeholder="TYPE AREA NAME..."
                                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[9px] font-black uppercase tracking-wider outline-none focus:bg-white focus:border-slate-300 transition-all w-28 placeholder:text-slate-300 shrink-0"
                            />
                            </FilterField>

                            {/* Base Multiplier Dropdown */}
                            <FilterField label="Base multiplier" info="Shows only areas whose service prices are multiplied by this factor (1x = standard price).">
                            <MultiSelectFilter
                                value={searchBaseMultiplier}
                                onChange={(e) => setSearchBaseMultiplier(e.target.value)}
                                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[9px] font-black uppercase tracking-tight outline-none focus:bg-white focus:border-slate-300 transition-all cursor-pointer text-slate-900 w-28 shrink-0"
                            >
                                <option value="">ANY</option>
                                {uniqueBaseMultipliers.map(mult => (
                                    <option key={mult} value={String(mult)}>{mult}x</option>
                                ))}
                            </MultiSelectFilter>
                            </FilterField>

                            {/* Express Multiplier Dropdown */}
                            <FilterField label="Express multiplier" info="Shows only areas with this express-delivery price factor.">
                            <MultiSelectFilter
                                value={searchExpressMultiplier}
                                onChange={(e) => setSearchExpressMultiplier(e.target.value)}
                                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[9px] font-black uppercase tracking-tight outline-none focus:bg-white focus:border-slate-300 transition-all cursor-pointer text-slate-900 w-32 shrink-0"
                            >
                                <option value="">ANY</option>
                                {uniqueExpressMultipliers.map(mult => (
                                    <option key={mult} value={String(mult)}>{mult}x</option>
                                ))}
                            </MultiSelectFilter>
                            </FilterField>

                            {/* Heritage Multiplier Dropdown */}
                            <FilterField label="Heritage multiplier" info="Shows only areas with this price factor for Heritage (premium care) orders.">
                            <MultiSelectFilter
                                value={searchHeritageMultiplier}
                                onChange={(e) => setSearchHeritageMultiplier(e.target.value)}
                                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[9px] font-black uppercase tracking-tight outline-none focus:bg-white focus:border-slate-300 transition-all cursor-pointer text-slate-900 w-32 shrink-0"
                            >
                                <option value="">ANY</option>
                                {uniqueHeritageMultipliers.map(mult => (
                                    <option key={mult} value={String(mult)}>{mult}x</option>
                                ))}
                            </MultiSelectFilter>
                            </FilterField>

                            {/* Discount Multiplier Dropdown */}
                            <FilterField label="Discount multiplier" info="Shows only areas with this discounted-price factor.">
                            <MultiSelectFilter
                                value={searchDiscountMultiplier}
                                onChange={(e) => setSearchDiscountMultiplier(e.target.value)}
                                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[9px] font-black uppercase tracking-tight outline-none focus:bg-white focus:border-slate-300 transition-all cursor-pointer text-slate-900 w-32 shrink-0"
                            >
                                <option value="">ANY</option>
                                {uniqueDiscountMultipliers.map(mult => (
                                    <option key={mult} value={String(mult)}>{mult}x</option>
                                ))}
                            </MultiSelectFilter>
                            </FilterField>
                        </div>
                    }
                    columns={columns}
                    data={areas}
                    loading={loading}
                    onDownload={handleDownload}
                />
            </div>

            {/* Edit Multipliers Modal */}
            {editingArea && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-2xl rounded-sm border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-8 duration-300">
                        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div>
                                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Edit Zone Parameters</h3>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Fence ID: {editingArea.excelFenceId}</p>
                            </div>
                            <button onClick={() => setEditingArea(null)} className="p-2 hover:bg-slate-100 rounded-sm transition-all"><X size={16} /></button>
                        </div>

                        <div className="p-8 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                                {/* Area Name */}
                                <div className="space-y-1.5 md:col-span-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Area Name</label>
                                    <input
                                        value={editingArea.areaName}
                                        onChange={(e) => setEditingArea({ ...editingArea, areaName: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all"
                                    />
                                </div>

                                {/* Express Multiplier */}
                                <div className="space-y-1.5 col-span-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1 flex items-center gap-1.5">
                                        <Zap size={10} className="text-amber-500" /> Express Multiplier
                                    </label>
                                    <input
                                        type="number" step="0.1"
                                        value={editingArea.dynamicSurgeMultiplier ?? ''}
                                        onChange={(e) => setEditingArea({ ...editingArea, dynamicSurgeMultiplier: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all"
                                    />
                                </div>

                                {/* Base Price Multiplier */}
                                <div className="space-y-1.5 col-span-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1 flex items-center gap-1.5">
                                        <Percent size={10} className="text-blue-500" /> Base Price Multiplier
                                    </label>
                                    <input
                                        type="number" step="0.1"
                                        value={editingArea.basePriceMultiplier ?? ''}
                                        onChange={(e) => setEditingArea({ ...editingArea, basePriceMultiplier: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all"
                                    />
                                </div>

                                {/* Discount Price Multiplier */}
                                <div className="space-y-1.5 col-span-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1 flex items-center gap-1.5">
                                        <Percent size={10} className="text-emerald-500" /> Discount Price Multiplier
                                    </label>
                                    <input
                                        type="number" step="0.1"
                                        value={editingArea.discountPriceMultiplier ?? ''}
                                        onChange={(e) => setEditingArea({ ...editingArea, discountPriceMultiplier: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all"
                                    />
                                </div>

                                {/* Show Discount Price */}
                                <div className="space-y-1.5 col-span-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1 flex items-center gap-1.5">
                                        <Percent size={10} className="text-amber-500" /> Show Discount Price (Y/N)
                                    </label>
                                    <div className="flex gap-2">
                                        {[true, false].map(opt => {
                                            const isSelected = editingArea.allowDiscount !== false ? opt === true : opt === false;
                                            return (
                                                <button
                                                    key={opt.toString()}
                                                    type="button"
                                                    onClick={() => setEditingArea({ ...editingArea, allowDiscount: opt })}
                                                    className={`flex-1 py-3 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all border ${isSelected ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
                                                >
                                                    {opt ? 'Y' : 'N'}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Heritage Multiplier */}
                                <div className="space-y-1.5 col-span-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1 flex items-center gap-1.5">
                                        <ShieldCheck size={10} className="text-purple-500" /> Heritage Multiplier
                                    </label>
                                    <input
                                        type="number" step="0.1"
                                        value={editingArea.heritageMultiplier ?? ''}
                                        onChange={(e) => setEditingArea({ ...editingArea, heritageMultiplier: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all"
                                    />
                                </div>

                                {/* Platform Multiplier */}
                                <div className="space-y-1.5 col-span-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1 flex items-center gap-1.5">
                                        <TrendingUp size={10} className="text-blue-500" /> Platform Multiplier (x)
                                    </label>
                                    <input
                                        type="number" step="0.1"
                                        value={editingArea.platformMultiplier ?? ''}
                                        onChange={(e) => setEditingArea({ ...editingArea, platformMultiplier: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all"
                                    />
                                </div>

                                {/* Min Platform Fee */}
                                <div className="space-y-1.5 col-span-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1 flex items-center gap-1.5">
                                        <TrendingUp size={10} className="text-indigo-500" /> Min Platform Fee (₹)
                                    </label>
                                    <input
                                        type="number"
                                        value={editingArea.minPlatformFee ?? ''}
                                        onChange={(e) => setEditingArea({ ...editingArea, minPlatformFee: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all"
                                    />
                                </div>

                                {/* Max Platform Fee */}
                                <div className="space-y-1.5 col-span-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1 flex items-center gap-1.5">
                                        <TrendingUp size={10} className="text-rose-500" /> Max Platform Fee (₹)
                                    </label>
                                    <input
                                        type="number"
                                        value={editingArea.maxPlatformFee ?? ''}
                                        onChange={(e) => setEditingArea({ ...editingArea, maxPlatformFee: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all"
                                    />
                                </div>

                                {/* Free Delivery Threshold */}
                                <div className="space-y-1.5 md:col-span-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1 flex items-center gap-1.5">
                                        <Truck size={10} className="text-rose-500" /> Free Delivery Threshold (₹)
                                    </label>
                                    <input
                                        type="number"
                                        value={editingArea.freeDeliveryThreshold ?? ''}
                                        onChange={(e) => setEditingArea({ ...editingArea, freeDeliveryThreshold: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={handleUpdateArea}
                                className="w-full py-4 bg-slate-950 text-white rounded-sm font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all flex items-center justify-center gap-2 mt-6 border border-slate-900"
                            >
                                <Save size={14} /> Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ServiceGeofenceTable;
