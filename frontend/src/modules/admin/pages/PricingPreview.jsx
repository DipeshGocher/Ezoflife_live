import React, { useState, useEffect } from 'react';
import { masterServiceApi, categoryApi, BASE_URL } from '../../../lib/api';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    MapPin, Search, RefreshCw, Info, LayoutGrid, CheckCircle2, 
    Filter, ArrowUpRight, ShieldCheck, Zap
} from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import { FilterLabel } from "../components/common/FilterLabel";

const PricingPreview = () => {
    const [areas, setAreas] = useState([]);
    const [categories, setCategories] = useState([]);
    const [selectedArea, setSelectedArea] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [previewData, setPreviewData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        try {
            const [areaData, catData] = await Promise.all([
                fetch(`${BASE_URL}/geofence/areas`).then(res => res.json()),
                categoryApi.getAll()
            ]);
            setAreas(areaData);
            setCategories(catData);
        } catch (error) {
            toast.error('Failed to load filters');
        }
    };

    const fetchPreview = async () => {
        if (!selectedArea) {
            setPreviewData([]);
            return;
        }
        setIsLoading(true);
        try {
            const data = await masterServiceApi.getPricingPreview(selectedArea, selectedCategory);
            setPreviewData(Array.isArray(data) ? data : []);
        } catch (error) {
            toast.error('Failed to fetch preview');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchPreview();
    }, [selectedArea, selectedCategory]);

    const activeArea = areas.find(a => a._id === selectedArea);

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8 font-sans">
            <PageHeader 
                title="Pricing Intelligence Preview" 
                subtitle="Simulate and verify dynamic pricing calculations across all service regions"
                className="mb-10"
            />

            {/* Simulation Controls */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-12">
                <div className="lg:col-span-2 space-y-2">
                    <FilterLabel label="Simulate zone" className="mb-1 ml-1" info="Pick a service area to preview the prices customers there would see, using that area's price multipliers." />
                    <div className="relative group">
                        <MapPin size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-primary group-hover:scale-110 transition-transform" />
                        <select 
                            value={selectedArea}
                            onChange={e => setSelectedArea(e.target.value)}
                            className="w-full pl-14 pr-10 py-5 bg-white border border-slate-200 rounded-[2rem] font-bold text-sm text-slate-900 outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all appearance-none cursor-pointer shadow-sm"
                        >
                            <option value="">Select Target Region...</option>
                            {areas.map(a => (
                                <option key={a._id} value={a._id}>{a.areaName} ({a.city || 'Nashik'})</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="space-y-2">
                    <FilterLabel label="Category" className="mb-1 ml-1" info="Limits the price preview to services in this category." />
                    <div className="relative group">
                        <Filter size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-primary transition-colors" />
                        <select 
                            value={selectedCategory}
                            onChange={e => setSelectedCategory(e.target.value)}
                            className="w-full pl-14 pr-10 py-5 bg-white border border-slate-200 rounded-[2rem] font-bold text-sm text-slate-900 outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all appearance-none cursor-pointer shadow-sm"
                        >
                            <option value="">All Service Sectors</option>
                            {Array.from(new Set(categories.map(c => c.mainCategory))).map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {activeArea && (
                    <div className="bg-white border border-slate-200 rounded-[2.5rem] p-5 flex items-center gap-5 shadow-sm animate-in zoom-in-95 duration-300">
                        <div className="w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center shadow-inner">
                            <Zap size={28} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Zone Multiplier</p>
                            <h3 className="text-xl font-black text-slate-900">{activeArea.multiplier}x</h3>
                        </div>
                    </div>
                )}
            </div>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center h-96 space-y-4">
                    <RefreshCw size={48} className="animate-spin text-primary/20" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Calculating Unit Economics...</p>
                </div>
            ) : selectedArea ? (
                <div className="space-y-6">
                    <div className="flex items-center justify-between px-6">
                        <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
                            <ArrowUpRight size={14} className="text-primary" /> Active Pricing Sheet
                        </h4>
                        <span className="px-3 py-1 bg-slate-100 text-slate-400 rounded-lg text-[9px] font-black uppercase tracking-widest">
                            {previewData.length} Items · One-item Normal orders, including GST and checkout fees
                        </span>
                    </div>

                    <div className="bg-white rounded-[3rem] border border-slate-100 shadow-xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/50 border-b border-slate-100">
                                        <th className="px-10 py-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Service Catalog Item</th>
                                        <th className="px-10 py-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-center">Global Base</th>
                                        <th className="px-10 py-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-center">Factor</th>
                                        <th className="px-10 py-8 text-[10px] font-black text-primary uppercase tracking-[0.2em] text-center">Finalized Pricing</th>
                                        <th className="px-10 py-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-center">Logic</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    <AnimatePresence>
                                        {previewData.map((item, idx) => (
                                            <motion.tr 
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: idx * 0.01 }}
                                                key={item.serviceId} 
                                                className="group hover:bg-slate-50/50 transition-colors"
                                            >
                                                <td className="px-10 py-6">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 group-hover:text-primary transition-colors">
                                                            <LayoutGrid size={18} />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-black text-slate-800 uppercase tracking-tight">{item.itemName}</span>
                                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{item.category}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-10 py-6 text-center font-bold text-slate-400">₹{item.discountedPrice}</td>
                                                <td className="px-10 py-6 text-center font-black text-slate-900 opacity-40">x{item.multiplier}</td>
                                                <td className="px-10 py-6 text-center">
                                                    <span className="px-6 py-3 bg-primary/5 text-primary rounded-2xl font-black text-lg shadow-sm border border-primary/5">
                                                        ₹{item.finalPrice} <span className="text-[10px] font-bold text-slate-300 ml-1">/{item.unit?.replace('per_', '')}</span>
                                                    </span>
                                                </td>
                                                <td className="px-10 py-6 text-center">
                                                    {item.isOverride ? (
                                                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-600 border border-amber-100 rounded-full">
                                                            <ShieldCheck size={12} />
                                                            <span className="text-[9px] font-black uppercase tracking-widest">Manual Override</span>
                                                        </div>
                                                    ) : (
                                                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-400 rounded-full">
                                                            <CheckCircle2 size={12} />
                                                            <span className="text-[9px] font-black uppercase tracking-widest">System Calibrated</span>
                                                        </div>
                                                    )}
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </AnimatePresence>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center p-32 bg-white rounded-[4rem] border-2 border-dashed border-slate-200 space-y-8 shadow-sm">
                    <div className="w-32 h-32 bg-slate-50 rounded-[3rem] flex items-center justify-center border border-slate-100 shadow-xl group cursor-pointer hover:scale-110 transition-transform duration-500">
                        <LayoutGrid size={60} className="text-slate-200 group-hover:text-primary transition-colors" />
                    </div>
                    <div className="text-center space-y-3">
                        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Pricing Simulation Engine</h3>
                        <p className="text-slate-400 text-sm font-medium max-w-md mx-auto">Select a zone and category above to preview how dynamic factors and overrides combine to form the final customer pricing.</p>
                    </div>
                </div>
            )}

            {/* Intelligence Footer */}
            <div className="mt-20 p-8 bg-slate-900 text-white rounded-[3rem] shadow-2xl flex gap-8 items-center overflow-hidden relative">
                <div className="absolute top-0 right-0 p-12 opacity-5 rotate-12 scale-150">
                    <Zap size={150} />
                </div>
                <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center shrink-0">
                    <Info size={32} className="text-primary" />
                </div>
                <div className="space-y-1 relative z-10">
                    <h4 className="text-xs font-black uppercase tracking-[0.2em]">Simulation Logic Information</h4>
                    <p className="text-[10px] font-bold text-white/40 leading-relaxed uppercase tracking-widest max-w-3xl">
                        This preview reflects the exact math used during the customer checkout process. <span className="text-white">System Calibrated</span> items use the Global Discounted Price multiplied by the Area Factor, while <span className="text-amber-400">Manual Overrides</span> bypass all automation to use your specifically defined regional rates.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PricingPreview;
