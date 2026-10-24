import React, { useState, useEffect, useMemo } from 'react';
import { masterServiceApi, areaOverrideApi, categoryApi, BASE_URL } from '../../../lib/api';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    MapPin, Search, Save, X, RefreshCw, AlertCircle, Info, ChevronRight,
    TrendingUp, LayoutGrid, List, CheckCircle2, AlertOctagon, HelpCircle
} from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import { FilterLabel } from "../components/common/FilterLabel";

const AreaPricingOverrides = () => {
    const [areas, setAreas] = useState([]);
    const [services, setServices] = useState([]);
    const [overrides, setOverrides] = useState([]);
    const [selectedAreaId, setSelectedAreaId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(null);
    const [multiplierSaving, setMultiplierSaving] = useState(false);

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        try {
            const [areaRes, serviceRes] = await Promise.all([
                fetch(`${BASE_URL}/geofence/areas`).then(res => res.json()),
                masterServiceApi.getAll()
            ]);
            setAreas(areaRes);
            setServices(serviceRes);
        } catch (error) {
            toast.error('Failed to load initial data');
        }
    };

    const fetchOverrides = async (areaId) => {
        if (!areaId) {
            setOverrides([]);
            return;
        }
        setLoading(true);
        try {
            const data = await areaOverrideApi.getByArea(areaId);
            setOverrides(data);
        } catch (error) {
            toast.error('Failed to load overrides');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOverrides(selectedAreaId);
    }, [selectedAreaId]);

    const handleSaveOverride = async (serviceId, customPrice) => {
        setSaving(serviceId);
        try {
            await areaOverrideApi.save({
                areaId: selectedAreaId,
                serviceId,
                customPrice: customPrice === '' ? null : parseFloat(customPrice)
            });
            toast.success('Price updated');
            fetchOverrides(selectedAreaId);
        } catch (error) {
            toast.error('Failed to save price');
        } finally {
            setSaving(null);
        }
    };

    const handleUpdateMultiplier = async (newVal) => {
        if (!selectedAreaId) return;
        setMultiplierSaving(true);
        try {
            const res = await fetch(`${BASE_URL}/geofence/areas/${selectedAreaId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pricingFactor: parseFloat(newVal) })
            });
            if (res.ok) {
                toast.success('Multiplier updated');
                fetchInitialData(); // Refresh areas list
            }
        } catch (error) {
            toast.error('Failed to update multiplier');
        } finally {
            setMultiplierSaving(false);
        }
    };

    const filteredServices = useMemo(() => {
        return services.filter(s => 
            (s.itemName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
             s.categoryId?.mainCategory?.toLowerCase().includes(searchQuery.toLowerCase()))
        );
    }, [services, searchQuery]);

    const selectedArea = areas.find(a => a._id === selectedAreaId);

    // Numeric Safe Formatting
    const formatPrice = (val) => {
        if (val === undefined || val === null || isNaN(val)) return '—';
        return `₹${val.toLocaleString('en-IN')}`;
    };

    const calculateStandardPrice = (basePrice, multiplier) => {
        const factor = parseFloat(multiplier) || 1.0;
        const price = parseFloat(basePrice);
        if (isNaN(price)) return null;
        return Math.round(price * factor);
    };

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8 font-sans selection:bg-primary/10">
            <PageHeader 
                title="Area Pricing Engine" 
                subtitle="Configure granular service pricing for regional geofence clusters"
                className="mb-10 text-slate-900"
            />

            {/* Selection Hub */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
                <div className="lg:col-span-2 space-y-2">
                    <FilterLabel label="Service region" className="mb-1 ml-1" info="Choose the service area whose price overrides you want to view and edit. Overrides apply only to customers in that area." />
                    <div className="relative group">
                        <MapPin size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-primary group-hover:scale-110 transition-transform" />
                        <select 
                            value={selectedAreaId}
                            onChange={e => setSelectedAreaId(e.target.value)}
                            className="w-full pl-14 pr-10 py-5 bg-white border border-slate-200 rounded-[2rem] font-bold text-sm text-slate-900 outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all appearance-none cursor-pointer shadow-sm"
                        >
                            <option value="">Select Target Cluster...</option>
                            {areas.map(a => (
                                <option key={a._id} value={a._id}>{a.name} ({a.city || 'Regional'})</option>
                            ))}
                        </select>
                        <ChevronRight size={20} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none rotate-90" />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Quick Filter</label>
                    <div className="relative group">
                        <Search size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-primary transition-colors" />
                        <input 
                            type="text"
                            placeholder="Find services..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-14 pr-6 py-5 bg-white border border-slate-200 rounded-[2rem] font-bold text-sm text-slate-900 outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all placeholder:text-slate-300 shadow-sm"
                        />
                    </div>
                </div>
            </div>

            {selectedArea ? (
                <div className="space-y-8 animate-in fade-in duration-700">
                    {/* Area Intelligence Dashboard */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="md:col-span-2 bg-white border border-slate-200 rounded-[2.5rem] p-8 flex items-center gap-8 shadow-sm relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:scale-125 transition-transform duration-700">
                                <TrendingUp size={120} />
                            </div>
                            <div className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-lg relative z-10" style={{ backgroundColor: selectedArea.color }}>
                                <MapPin size={40} className="text-white drop-shadow-md" />
                            </div>
                            <div>
                                <h3 className="text-3xl font-black uppercase tracking-tighter text-slate-900 mb-1">{selectedArea.name}</h3>
                                <p className="text-[10px] font-bold text-primary uppercase tracking-[0.3em] flex items-center gap-2">
                                    <CheckCircle2 size={12} /> System Active
                                </p>
                            </div>
                        </div>

                        <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 flex flex-col justify-between shadow-sm">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Base Multiplier</p>
                            <div className="flex items-center gap-4">
                                <input 
                                    type="number" step="0.1"
                                    defaultValue={selectedArea.pricingFactor}
                                    onBlur={(e) => handleUpdateMultiplier(e.target.value)}
                                    className="w-20 bg-slate-50 border border-slate-200 p-2 rounded-xl text-xl font-black text-slate-900 text-center outline-none focus:border-primary transition-all"
                                />
                                <span className="text-2xl font-black text-slate-900">x</span>
                                {multiplierSaving && <RefreshCw size={16} className="animate-spin text-primary" />}
                            </div>
                        </div>

                        <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 flex flex-col justify-between shadow-sm relative overflow-hidden">
                            <div className="absolute inset-0 bg-primary/[0.02] rounded-full" />
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 relative z-10">Total Services</p>
                            <div className="flex items-baseline gap-2 relative z-10">
                                <span className="text-4xl font-black text-slate-900">{services.length}</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase">SKUs</span>
                            </div>
                        </div>
                    </div>

                    {/* Pricing Grid */}
                    <div className="space-y-4">
                        <div className="hidden lg:grid grid-cols-12 gap-6 px-10 py-4">
                            <div className="col-span-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Service Artifact</div>
                            <div className="col-span-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Global Price</div>
                            <div className="col-span-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Standard Adjusted</div>
                            <div className="col-span-2 text-[10px] font-black text-primary uppercase tracking-widest text-center">Custom Area Price</div>
                            <div className="col-span-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Context</div>
                        </div>

                        <AnimatePresence mode="popLayout">
                            {filteredServices.length > 0 ? (
                                filteredServices.map((service) => {
                                    const override = overrides.find(o => o.serviceId === service._id);
                                    const standardPrice = calculateStandardPrice(service.discountedPrice, selectedArea.pricingFactor);
                                    
                                    return (
                                        <motion.div 
                                            layout
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            key={service._id} 
                                            className="group bg-white border border-slate-200 hover:border-primary/30 rounded-[1.5rem] p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center shadow-sm hover:shadow-md hover:scale-[1.01] transition-all duration-300"
                                        >
                                            {/* Name & Meta */}
                                            <div className="lg:col-span-4 flex items-center gap-5">
                                                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100 text-slate-300 group-hover:text-primary transition-colors">
                                                    <LayoutGrid size={20} />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-black text-slate-900 uppercase tracking-tight group-hover:text-primary transition-colors">{service.itemName}</span>
                                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.1em] mt-1">
                                                        {service.categoryId?.mainCategory} / {service.categoryId?.subCategory}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Global Price */}
                                            <div className="lg:col-span-2 flex flex-col items-center lg:items-center">
                                                <span className="lg:hidden text-[9px] font-black text-slate-400 uppercase mb-1">Global Price</span>
                                                <span className="text-sm font-bold text-slate-400">{formatPrice(service.discountedPrice)}</span>
                                            </div>

                                            {/* Standard Adjusted */}
                                            <div className="lg:col-span-2 flex flex-col items-center lg:items-center">
                                                <span className="lg:hidden text-[9px] font-black text-slate-400 uppercase mb-1">Standard Adjusted</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-base font-black text-slate-900">{formatPrice(standardPrice)}</span>
                                                </div>
                                            </div>

                                            {/* Custom Price Input */}
                                            <div className="lg:col-span-2 flex flex-col items-center">
                                                <span className="lg:hidden text-[9px] font-black text-primary uppercase mb-1">Custom Area Price</span>
                                                <div className="relative w-full max-w-[140px]">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-primary/50 text-xs">₹</span>
                                                    <input 
                                                        type="number"
                                                        placeholder={standardPrice || "—"}
                                                        defaultValue={override ? override.customPrice : ''}
                                                        onBlur={(e) => {
                                                            const newVal = e.target.value;
                                                            if (override && newVal === '') {
                                                                handleSaveOverride(service._id, '');
                                                            } else if (newVal !== '' && (!override || parseFloat(newVal) !== override.customPrice)) {
                                                                handleSaveOverride(service._id, newVal);
                                                            }
                                                        }}
                                                        className={`w-full pl-8 pr-3 py-3 bg-slate-50 border ${override ? 'border-primary ring-2 ring-primary/5' : 'border-slate-200'} rounded-xl text-sm font-black text-slate-900 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-slate-200`}
                                                    />
                                                </div>
                                            </div>

                                            {/* Status Badge */}
                                            <div className="lg:col-span-2 flex justify-end items-center gap-4">
                                                {saving === service._id ? (
                                                    <RefreshCw size={18} className="animate-spin text-primary" />
                                                ) : override ? (
                                                    <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                        <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Custom Override</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 border border-blue-100 rounded-full">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                                        <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Standard Mode</span>
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    );
                                })
                            ) : (
                                <div className="p-20 text-center bg-white rounded-[3rem] border border-dashed border-slate-200 shadow-sm">
                                    <AlertOctagon size={48} className="mx-auto text-slate-200 mb-4" />
                                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">No Services Found</h3>
                                    <p className="text-sm font-medium text-slate-400 mt-2">Adjust your filter or check the master catalog.</p>
                                </div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center p-32 bg-white rounded-[4rem] border-2 border-dashed border-slate-200 space-y-8 shadow-sm">
                    <div className="w-32 h-32 bg-slate-50 rounded-[3rem] flex items-center justify-center border border-slate-100 shadow-xl group cursor-pointer hover:scale-110 transition-transform duration-500">
                        <MapPin size={60} className="text-slate-200 group-hover:text-primary transition-colors" />
                    </div>
                    <div className="text-center space-y-3">
                        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Initialize Area Radar</h3>
                        <p className="text-slate-400 text-sm font-medium max-w-md mx-auto">Select a regional cluster to start deploying area-specific pricing and overrides across your service network.</p>
                    </div>
                </div>
            )}

            {/* Tactical Intel Footnote */}
            <div className="mt-20 p-8 bg-primary/5 border border-primary/10 rounded-[3rem] flex gap-6 items-start">
                <HelpCircle size={24} className="text-primary shrink-0" />
                <div className="space-y-2">
                    <h4 className="text-xs font-black text-primary uppercase tracking-[0.2em]">Engine Logic Reference</h4>
                    <p className="text-[10px] font-bold text-slate-500 leading-relaxed uppercase tracking-widest max-w-4xl">
                        Custom Area Prices are absolute and bypass both Global Discounted Price and the Area Multiplier. Standard Adjusted prices are computed as <code className="text-primary bg-primary/10 px-2 py-0.5 rounded">Math.round(GlobalDiscounted * AreaMultiplier)</code>. If no area multiplier is set, 1.0 is assumed. Updates are persistent and affect real-time customer checkout.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AreaPricingOverrides;
