import React, { useState, useEffect, useMemo } from 'react';
import { 
    Plus, Search, Filter, Download, Zap, Percent, 
    ShieldCheck, Map, Tag, RefreshCw, Save, X, Edit2,
    Layers, FileText
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import PageHeader from '../components/common/PageHeader';
import DataGrid from '../components/tables/DataGrid';
import { BASE_URL, adminApi } from '../../../lib/api';
import FilterField from "../components/common/FilterLabel";

const MasterPricingRegistry = () => {
    const [configuredGst, setConfiguredGst] = useState(0);
    useEffect(() => { adminApi.getConfig().then(rows => { const rate = rows.find(row => row.key === 'gst_percent')?.value; if (rate != null) setConfiguredGst(Number(rate)); }).catch(() => toast.error('Could not load configured GST rate')); }, []);
    const [pricingData, setPricingData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [areas, setAreas] = useState([]);
    const [selectedArea, setSelectedArea] = useState('all');
    const [searchCategory, setSearchCategory] = useState('');
    const [searchService, setSearchService] = useState('');
    const [searchSAC, setSearchSAC] = useState('');
    const [isSyncing, setIsSyncing] = useState(false);
    const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

    // Fetch Areas Once
    useEffect(() => {
        const fetchAreas = async () => {
            try {
                const res = await fetch(`${BASE_URL}/geofence/areas`);
                const data = await res.json();
                setAreas(data);
            } catch (err) {
                console.error('Failed to load areas');
            }
        };
        fetchAreas();
    }, []);

    // Fetch Pricing Data
    const fetchData = async (page = 1) => {
        try {
            setLoading(true);
            const queryParams = new URLSearchParams({
                page,
                limit: pagination.limit
            });
            if (selectedArea !== 'all') queryParams.append('fenceId', selectedArea);
            if (searchCategory) queryParams.append('searchCategory', searchCategory);
            if (searchService) queryParams.append('searchService', searchService);
            if (searchSAC) queryParams.append('searchSAC', searchSAC);

            const res = await fetch(`${BASE_URL}/master-pricing?${queryParams.toString()}`);
            const result = await res.json();
            
            // Handle both new paginated response and old flat array response gracefully
            if (result.data && result.pagination) {
                setPricingData(result.data);
                setPagination(result.pagination);
            } else {
                setPricingData(Array.isArray(result) ? result : []);
                setPagination({ page: 1, limit: 10, total: Array.isArray(result) ? result.length : 0, totalPages: 1 });
            }
        } catch (err) {
            toast.error('Failed to load pricing registry');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchData(1); // Reset to page 1 on search or area change
        }, 400);
        return () => clearTimeout(timer);
    }, [selectedArea, searchCategory, searchService, searchSAC]);

    const handleSync = async () => {
        try {
            setIsSyncing(true);
            const res = await fetch(`${BASE_URL}/master-pricing/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fenceId: selectedArea === 'all' ? null : selectedArea })
            });
            if (res.ok) {
                toast.success(selectedArea === 'all' ? 'All Areas Synchronized' : 'Area Pricing Synchronized');
                fetchData();
            }
        } catch (err) {
            toast.error('Sync failed');
        } finally {
            setIsSyncing(false);
        }
    };

    const handleExport = async () => {
        let exportToast = null;
        try {
            exportToast = toast.loading('Generating pricing CSV export...');
            // Fetch all data matching the current filters (without page limit)
            const queryParams = new URLSearchParams({
                page: 1,
                limit: 100000, // Large limit to get all entities
                fenceId: selectedArea,
                searchCategory,
                searchService,
                searchSAC
            });
            const res = await fetch(`${BASE_URL}/master-pricing?${queryParams}`);
            const result = await res.json();
            
            if (exportToast) toast.dismiss(exportToast);
            if (!res.ok || !result.data) {
                toast.error('Failed to download pricing dataset');
                return;
            }

            const dataToExport = result.data;
            if (dataToExport.length === 0) {
                toast.error('No data available to export');
                return;
            }

            const headers = [
                "Zone Name",
                "City",
                "Category",
                "Sub Category",
                "Service Name",
                "SKU ID",
                "SAC Code",
                "Base Price Normal (Excl. GST)",
                "Base Price Normal (with GST)",
                "Base Price Express (Excl. GST)",
                "Base Price Express (with GST)",
                "Heritage Price Normal (Excl. GST)",
                "Heritage Price Normal (with GST)",
                "Heritage Price Express (Excl. GST)",
                "Heritage Price Express (with GST)",
                "Discount Price Normal (Excl. GST)",
                "Discount Price Normal (with GST)",
                "Discount Price Express (Excl. GST)",
                "Discount Price Express (with GST)",
                "Disc. Heritage Price Normal (Excl. GST)",
                "Disc. Heritage Price Normal (with GST)",
                "Disc. Heritage Price Express (Excl. GST)",
                "Disc. Heritage Price Express (with GST)",
                "GST (%)",
                "Heritage GST (%)"
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

            for (const row of dataToExport) {
                const globalBase = row.basePrice || 0;
                const globalDiscounted = row.discountPrice || 0;
                const baseMult = row.fenceId?.basePriceMultiplier || 1.0;
                const expressMult = row.fenceId?.dynamicSurgeMultiplier || 1.0;
                const heritageMult = row.fenceId?.heritageMultiplier || 1.0;
                const discMult = row.fenceId?.allowDiscount !== false ? (row.fenceId?.discountPriceMultiplier || 1.0) : 1.0;
                const gst = row.serviceId?.gst ?? configuredGst;
                const hGst = row.serviceId?.heritageGst ?? configuredGst;

                const baseNormalExcl = Math.round(globalBase * baseMult);
                const baseNormalIncl = Math.round(globalBase * baseMult * (1 + gst / 100));
                const baseExpressExcl = Math.round(globalBase * baseMult * expressMult);
                const baseExpressIncl = Math.round(globalBase * baseMult * expressMult * (1 + gst / 100));
                const heritageNormalExcl = Math.round(globalBase * baseMult * heritageMult);
                const heritageNormalIncl = Math.round(globalBase * baseMult * heritageMult * (1 + hGst / 100));
                const heritageExpressExcl = Math.round(globalBase * baseMult * heritageMult * expressMult);
                const heritageExpressIncl = Math.round(globalBase * baseMult * heritageMult * expressMult * (1 + hGst / 100));

                const discNormalExcl = Math.round(globalDiscounted * baseMult * discMult);
                const discNormalIncl = Math.round(globalDiscounted * baseMult * discMult * (1 + gst / 100));
                const discExpressExcl = Math.round(globalDiscounted * baseMult * discMult * expressMult);
                const discExpressIncl = Math.round(globalDiscounted * baseMult * discMult * expressMult * (1 + gst / 100));
                const discHeritageNormalExcl = Math.round(globalDiscounted * baseMult * heritageMult * discMult);
                const discHeritageNormalIncl = Math.round(globalDiscounted * baseMult * heritageMult * discMult * (1 + hGst / 100));
                const discHeritageExpressExcl = Math.round(globalDiscounted * baseMult * heritageMult * discMult * expressMult);
                const discHeritageExpressIncl = Math.round(globalDiscounted * baseMult * heritageMult * discMult * expressMult * (1 + hGst / 100));

                const rowData = [
                    escapeCSV(row.fenceId?.areaName || "Global"),
                    escapeCSV(row.fenceId?.city || "N/A"),
                    escapeCSV(row.categoryId?.mainCategory || ""),
                    escapeCSV(row.categoryId?.subCategory || ""),
                    escapeCSV(row.serviceId?.itemName || ""),
                    escapeCSV(row.serviceId?.skuId || ""),
                    escapeCSV(row.serviceId?.sacCode || ""),
                    baseNormalExcl,
                    baseNormalIncl,
                    baseExpressExcl,
                    baseExpressIncl,
                    heritageNormalExcl,
                    heritageNormalIncl,
                    heritageExpressExcl,
                    heritageExpressIncl,
                    discNormalExcl,
                    discNormalIncl,
                    discExpressExcl,
                    discExpressIncl,
                    discHeritageNormalExcl,
                    discHeritageNormalIncl,
                    discHeritageExpressExcl,
                    discHeritageExpressIncl,
                    gst,
                    hGst
                ];

                csvRows.push(rowData.join(","));
            }

            const csvString = csvRows.join("\n");
            const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `master_pricing_export_${new Date().toISOString().slice(0,10)}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success('Pricing grid exported successfully!');
        } catch (err) {
            if (exportToast) toast.dismiss(exportToast);
            console.error(err);
            toast.error('Failed to export pricing');
        }
    };

    const columns = useMemo(() => [
        {
            header: 'Zone / Area',
            key: 'fenceId',
            render: (val) => (
                <div className="flex flex-col">
                    <span className="font-black text-slate-900 uppercase tracking-tight text-[10px]">{val?.areaName || 'Unknown'}</span>
                    <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">ID: {val?.excelFenceId || '—'}</span>
                </div>
            )
        },
        {
            header: 'Category',
            key: 'categoryId',
            render: (val) => (
                <span className="text-[9px] font-black text-slate-500 bg-slate-50 px-2 py-0.5 rounded-sm border border-slate-100 uppercase tracking-widest">
                    {val?.mainCategory || '—'}
                </span>
            )
        },
        {
            header: 'Sub-Category',
            key: 'categoryId',
            render: (val) => (
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                    {val?.subCategory || '—'}
                </span>
            )
        },
        {
            header: 'Service Name',
            key: 'serviceId',
            render: (val) => (
                <span className="font-bold text-slate-800 uppercase tracking-tight text-[10px]">{val?.itemName}</span>
            )
        },
        {
            header: 'SKU',
            key: 'serviceId',
            render: (val) => (
                <span className="text-[8px] text-slate-900 font-black tracking-widest uppercase">{val?.skuId || 'NO-SKU'}</span>
            )
        },
        {
            header: 'GST%',
            key: 'serviceId',
            render: (val) => (
                <span className="text-[9px] font-black text-slate-500 tabular-nums">
                    {val?.gst ?? configuredGst}%
                </span>
            )
        },
        {
            header: 'SAC',
            key: 'serviceId',
            render: (val) => (
                <span className="font-black text-slate-400 text-[10px] tracking-widest uppercase">
                    {val?.sacCode || '9994'}
                </span>
            )
        },
        {
            header: 'Global Base Price',
            key: 'basePrice',
            render: (val) => <span className="font-black text-slate-900 text-[11px]">₹{val}</span>
        },
        {
            header: 'Global Discount Price',
            key: 'discountPrice',
            render: (val) => <span className="font-black text-slate-900 text-[11px]">₹{val}</span>
        },
        {
            header: 'Base Mult.',
            key: 'fenceId',
            render: (val) => (
                <div className="flex items-center gap-1 text-slate-900 font-bold text-[9px]">
                    <Percent size={8} className="text-slate-500" />
                    <span>{val?.basePriceMultiplier || 1.0}x</span>
                </div>
            )
        },
        {
            header: 'Heritage Mult.',
            key: 'fenceId',
            render: (val) => (
                <div className="flex items-center gap-1 text-slate-900 font-bold text-[9px]">
                    <ShieldCheck size={8} className="text-slate-500" />
                    <span>{val?.heritageMultiplier || 1.0}x</span>
                </div>
            )
        },
        {
            header: 'Express Mult.',
            key: 'fenceId',
            render: (val) => (
                <div className="flex items-center gap-1 text-slate-900 font-bold text-[9px]">
                    <Zap size={8} className="text-slate-500" />
                    <span>{val?.dynamicSurgeMultiplier || 1.0}x</span>
                </div>
            )
        },
        {
            header: 'Disc. Mult.',
            key: 'fenceId',
            render: (val) => (
                <div className="flex items-center gap-1 text-slate-900 font-bold text-[9px]">
                    <Percent size={8} className="text-slate-500" />
                    <span>{val?.discountPriceMultiplier || 1.0}x</span>
                </div>
            )
        },
        {
            header: 'Base Price (Normal)',
            key: 'finalPrice',
            render: (_, row) => {
                const globalBase = row.basePrice || 0;
                const baseMult = row.fenceId?.basePriceMultiplier || 1.0;
                const priceBeforeTax = Math.round(globalBase * baseMult);
                return (
                    <div className="flex flex-col">
                        <span className="font-black text-slate-900 text-[11px]">₹{priceBeforeTax}</span>
                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Excl. GST</span>
                    </div>
                );
            }
        },
        {
            header: 'Base Price Normal (with GST)',
            key: 'finalPrice',
            render: (_, row) => {
                const globalBase = row.basePrice || 0;
                const baseMult = row.fenceId?.basePriceMultiplier || 1.0;
                const gst = row.serviceId?.gst ?? configuredGst;
                const priceBeforeTax = globalBase * baseMult;
                const final = Math.round(priceBeforeTax * (1 + gst / 100));
                return (
                    <div className="flex flex-col">
                        <span className="font-black text-slate-900 text-[11px]">₹{final}</span>
                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Incl. GST</span>
                    </div>
                );
            }
        },
        {
            header: 'Base Price (Express)',
            key: 'finalPrice',
            render: (_, row) => {
                const globalBase = row.basePrice || 0;
                const baseMult = row.fenceId?.basePriceMultiplier || 1.0;
                const expressMult = row.fenceId?.dynamicSurgeMultiplier || 1.0;
                const priceBeforeTax = Math.round(globalBase * baseMult * expressMult);
                return (
                    <div className="flex flex-col">
                        <span className="font-black text-slate-900 text-[11px]">₹{priceBeforeTax}</span>
                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Excl. GST</span>
                    </div>
                );
            }
        },
        {
            header: 'Base Price Express (with GST)',
            key: 'finalPrice',
            render: (_, row) => {
                const globalBase = row.basePrice || 0;
                const baseMult = row.fenceId?.basePriceMultiplier || 1.0;
                const expressMult = row.fenceId?.dynamicSurgeMultiplier || 1.0;
                const gst = row.serviceId?.gst ?? configuredGst;
                const priceBeforeTax = globalBase * baseMult * expressMult;
                const final = Math.round(priceBeforeTax * (1 + gst / 100));
                return (
                    <div className="flex flex-col">
                        <span className="font-black text-slate-900 text-[11px]">₹{final}</span>
                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Incl. GST</span>
                    </div>
                );
            }
        },
        {
            header: 'Heritage Price (Normal)',
            key: 'finalPrice',
            render: (_, row) => {
                const globalBase = row.basePrice || 0;
                const baseMult = row.fenceId?.basePriceMultiplier || 1.0;
                const heritageMult = row.fenceId?.heritageMultiplier || 1.0;
                const priceBeforeTax = Math.round(globalBase * baseMult * heritageMult);
                return (
                    <div className="flex flex-col">
                        <span className="font-black text-slate-900 text-[11px]">₹{priceBeforeTax}</span>
                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Excl. GST</span>
                    </div>
                );
            }
        },
        {
            header: 'Heritage Price Normal (with GST)',
            key: 'finalPrice',
            render: (_, row) => {
                const globalBase = row.basePrice || 0;
                const baseMult = row.fenceId?.basePriceMultiplier || 1.0;
                const heritageMult = row.fenceId?.heritageMultiplier || 1.0;
                const hGst = row.serviceId?.heritageGst ?? configuredGst;
                const priceBeforeTax = globalBase * baseMult * heritageMult;
                const final = Math.round(priceBeforeTax * (1 + hGst / 100));
                return (
                    <div className="flex flex-col">
                        <span className="font-black text-slate-900 text-[11px]">₹{final}</span>
                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Incl. GST</span>
                    </div>
                );
            }
        },
        {
            header: 'Heritage Price (Express)',
            key: 'finalPrice',
            render: (_, row) => {
                const globalBase = row.basePrice || 0;
                const baseMult = row.fenceId?.basePriceMultiplier || 1.0;
                const heritageMult = row.fenceId?.heritageMultiplier || 1.0;
                const expressMult = row.fenceId?.dynamicSurgeMultiplier || 1.0;
                const priceBeforeTax = Math.round(globalBase * baseMult * heritageMult * expressMult);
                return (
                    <div className="flex flex-col">
                        <span className="font-black text-slate-900 text-[11px]">₹{priceBeforeTax}</span>
                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Excl. GST</span>
                    </div>
                );
            }
        },
        {
            header: 'Heritage Price Express (with GST)',
            key: 'finalPrice',
            render: (_, row) => {
                const globalBase = row.basePrice || 0;
                const baseMult = row.fenceId?.basePriceMultiplier || 1.0;
                const heritageMult = row.fenceId?.heritageMultiplier || 1.0;
                const expressMult = row.fenceId?.dynamicSurgeMultiplier || 1.0;
                const hGst = row.serviceId?.heritageGst ?? configuredGst;
                const priceBeforeTax = globalBase * baseMult * heritageMult * expressMult;
                const final = Math.round(priceBeforeTax * (1 + hGst / 100));
                return (
                    <div className="flex flex-col">
                        <span className="font-black text-slate-900 text-[11px]">₹{final}</span>
                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Incl. GST</span>
                    </div>
                );
            }
        },
        {
            header: 'Discount Price (Normal)',
            key: 'finalPrice',
            render: (_, row) => {
                const globalDiscounted = row.discountPrice || 0;
                const baseMult = row.fenceId?.basePriceMultiplier || 1.0;
                const discMult = row.fenceId?.allowDiscount !== false ? (row.fenceId?.discountPriceMultiplier || 1.0) : 1.0;
                const priceBeforeTax = Math.round(globalDiscounted * baseMult * discMult);
                return (
                    <div className="flex flex-col">
                        <span className="font-black text-slate-900 text-[11px]">₹{priceBeforeTax}</span>
                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Excl. GST</span>
                    </div>
                );
            }
        },
        {
            header: 'Discount Price Normal (with GST)',
            key: 'finalPrice',
            render: (_, row) => {
                const globalDiscounted = row.discountPrice || 0;
                const baseMult = row.fenceId?.basePriceMultiplier || 1.0;
                const discMult = row.fenceId?.allowDiscount !== false ? (row.fenceId?.discountPriceMultiplier || 1.0) : 1.0;
                const gst = row.serviceId?.gst ?? configuredGst;
                const priceBeforeTax = globalDiscounted * baseMult * discMult;
                const final = Math.round(priceBeforeTax * (1 + gst / 100));
                return (
                    <div className="flex flex-col">
                        <span className="font-black text-slate-900 text-[11px]">₹{final}</span>
                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Incl. GST</span>
                    </div>
                );
            }
        },
        {
            header: 'Discount Price (Express)',
            key: 'finalPrice',
            render: (_, row) => {
                const globalDiscounted = row.discountPrice || 0;
                const baseMult = row.fenceId?.basePriceMultiplier || 1.0;
                const discMult = row.fenceId?.allowDiscount !== false ? (row.fenceId?.discountPriceMultiplier || 1.0) : 1.0;
                const expressMult = row.fenceId?.dynamicSurgeMultiplier || 1.0;
                const priceBeforeTax = Math.round(globalDiscounted * baseMult * discMult * expressMult);
                return (
                    <div className="flex flex-col">
                        <span className="font-black text-slate-900 text-[11px]">₹{priceBeforeTax}</span>
                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Excl. GST</span>
                    </div>
                );
            }
        },
        {
            header: 'Discount Price Express (with GST)',
            key: 'finalPrice',
            render: (_, row) => {
                const globalDiscounted = row.discountPrice || 0;
                const baseMult = row.fenceId?.basePriceMultiplier || 1.0;
                const discMult = row.fenceId?.allowDiscount !== false ? (row.fenceId?.discountPriceMultiplier || 1.0) : 1.0;
                const expressMult = row.fenceId?.dynamicSurgeMultiplier || 1.0;
                const gst = row.serviceId?.gst ?? configuredGst;
                const priceBeforeTax = globalDiscounted * baseMult * discMult * expressMult;
                const final = Math.round(priceBeforeTax * (1 + gst / 100));
                return (
                    <div className="flex flex-col">
                        <span className="font-black text-slate-900 text-[11px]">₹{final}</span>
                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Incl. GST</span>
                    </div>
                );
            }
        },
        {
            header: 'Disc. Heritage Price (Normal)',
            key: 'finalPrice',
            render: (_, row) => {
                const globalDiscounted = row.discountPrice || 0;
                const baseMult = row.fenceId?.basePriceMultiplier || 1.0;
                const heritageMult = row.fenceId?.heritageMultiplier || 1.0;
                const discMult = row.fenceId?.allowDiscount !== false ? (row.fenceId?.discountPriceMultiplier || 1.0) : 1.0;
                const priceBeforeTax = Math.round(globalDiscounted * baseMult * heritageMult * discMult);
                return (
                    <div className="flex flex-col">
                        <span className="font-black text-slate-900 text-[11px]">₹{priceBeforeTax}</span>
                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Excl. GST</span>
                    </div>
                );
            }
        },
        {
            header: 'Disc. Heritage Price Normal (with GST)',
            key: 'finalPrice',
            render: (_, row) => {
                const globalDiscounted = row.discountPrice || 0;
                const baseMult = row.fenceId?.basePriceMultiplier || 1.0;
                const heritageMult = row.fenceId?.heritageMultiplier || 1.0;
                const discMult = row.fenceId?.allowDiscount !== false ? (row.fenceId?.discountPriceMultiplier || 1.0) : 1.0;
                const hGst = row.serviceId?.heritageGst ?? configuredGst;
                const priceBeforeTax = globalDiscounted * baseMult * heritageMult * discMult;
                const final = Math.round(priceBeforeTax * (1 + hGst / 100));
                return (
                    <div className="flex flex-col">
                        <span className="font-black text-slate-900 text-[11px]">₹{final}</span>
                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Incl. GST</span>
                    </div>
                );
            }
        },
        {
            header: 'Disc. Heritage Price (Express)',
            key: 'finalPrice',
            render: (_, row) => {
                const globalDiscounted = row.discountPrice || 0;
                const baseMult = row.fenceId?.basePriceMultiplier || 1.0;
                const heritageMult = row.fenceId?.heritageMultiplier || 1.0;
                const discMult = row.fenceId?.allowDiscount !== false ? (row.fenceId?.discountPriceMultiplier || 1.0) : 1.0;
                const expressMult = row.fenceId?.dynamicSurgeMultiplier || 1.0;
                const priceBeforeTax = Math.round(globalDiscounted * baseMult * heritageMult * discMult * expressMult);
                return (
                    <div className="flex flex-col">
                        <span className="font-black text-slate-900 text-[11px]">₹{priceBeforeTax}</span>
                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Excl. GST</span>
                    </div>
                );
            }
        },
        {
            header: 'Disc. Heritage Price Express (with GST)',
            key: 'finalPrice',
            render: (_, row) => {
                const globalDiscounted = row.discountPrice || 0;
                const baseMult = row.fenceId?.basePriceMultiplier || 1.0;
                const heritageMult = row.fenceId?.heritageMultiplier || 1.0;
                const discMult = row.fenceId?.allowDiscount !== false ? (row.fenceId?.discountPriceMultiplier || 1.0) : 1.0;
                const expressMult = row.fenceId?.dynamicSurgeMultiplier || 1.0;
                const hGst = row.serviceId?.heritageGst ?? configuredGst;
                const priceBeforeTax = globalDiscounted * baseMult * heritageMult * discMult * expressMult;
                const final = Math.round(priceBeforeTax * (1 + hGst / 100));
                return (
                    <div className="flex flex-col">
                        <span className="font-black text-slate-900 text-[11px]">₹{final}</span>
                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Incl. GST</span>
                    </div>
                );
            }
        }
    ], [configuredGst]);

    return (
        <div className="flex flex-col min-h-screen bg-slate-50/50 pb-20">
            <PageHeader 
                title="Master Pricing Table"
                actions={[
                    {
                        label: isSyncing ? "Syncing..." : "Sync Area Pricing",
                        icon: RefreshCw,
                        onClick: handleSync,
                        variant: 'primary'
                    }
                ]}
            />

            <div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">
                {/* Master Table */}
                <DataGrid 
                    title=""
                    showFilter={false}
                    showSearch={false}
                    actions={
                        <div className="flex items-end gap-2 flex-wrap">
                            {/* Region Select */}
                            <FilterField label="Region" info="Shows the price rows for one service area. While an area is selected, Synchronize updates only that area; All regions covers every area.">
                            <select 
                                value={selectedArea}
                                onChange={(e) => setSelectedArea(e.target.value)}
                                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[9px] font-black uppercase tracking-tight outline-none focus:bg-white focus:border-slate-300 transition-all cursor-pointer text-slate-900"
                            >
                                <option value="all">ALL REGIONS</option>
                                {areas.map(area => (
                                    <option key={area._id} value={area._id}>{area.areaName}</option>
                                ))}
                            </select>
                            </FilterField>

                            {/* Category Input */}
                            <FilterField label="Category" info="Finds price rows whose service category contains this text.">
                            <input 
                                type="text"
                                value={searchCategory}
                                onChange={(e) => setSearchCategory(e.target.value)}
                                placeholder="CATEGORY..."
                                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[9px] font-black uppercase tracking-wider outline-none focus:bg-white focus:border-slate-300 transition-all w-28 placeholder:text-slate-300"
                            />
                            </FilterField>

                            {/* Service Input */}
                            <FilterField label="Service / SKU" info="Finds price rows by service name or SKU code.">
                            <input 
                                type="text"
                                value={searchService}
                                onChange={(e) => setSearchService(e.target.value)}
                                placeholder="SERVICE / SKU..."
                                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[9px] font-black uppercase tracking-wider outline-none focus:bg-white focus:border-slate-300 transition-all w-32 placeholder:text-slate-300"
                            />
                            </FilterField>

                            {/* SAC Input */}
                            <FilterField label="SAC code" info="Finds price rows with this SAC (GST service accounting) code.">
                            <input 
                                type="text"
                                value={searchSAC}
                                onChange={(e) => setSearchSAC(e.target.value)}
                                placeholder="SAC CODE..."
                                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[9px] font-black uppercase tracking-wider outline-none focus:bg-white focus:border-slate-300 transition-all w-24 placeholder:text-slate-300"
                            />
                            </FilterField>
                        </div>
                    }
                    columns={columns}
                    data={pricingData}
                    loading={loading}
                    pagination={pagination}
                    onPageChange={(newPage) => fetchData(newPage)}
                    onDownload={handleExport}
                />
            </div>
        </div>
    );
};

export default MasterPricingRegistry;
