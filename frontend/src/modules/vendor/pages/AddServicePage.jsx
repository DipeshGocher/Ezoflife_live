import { appDialog } from '../../../shared/stores/appDialogStore';
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import VendorHeader from '../components/VendorHeader';
import { serviceApi } from '../../../lib/api';

const AddServicePage = () => {
    const navigate = useNavigate();
    const [serviceName, setServiceName] = useState('');
    const [price, setPrice] = useState('');
    const [unit, setUnit] = useState('Per Kg');
    const [tier, setTier] = useState('Essential'); // 'Essential' or 'Heritage'
    const [tags, setTags] = useState('');
    const [loading, setLoading] = useState(false);

    const getVendorId = () => {
        const keys = ['user', 'vendorData', 'userData', 'auth_user', 'vendor'];
        for (const key of keys) {
            try {
                const raw = localStorage.getItem(key);
                if (!raw) continue;
                const data = JSON.parse(raw);
                const id = data?._id || data?.id || data?.user?._id || data?.user?.id || data?.uid;
                if (id) return id;
            } catch (e) { continue; }
        }
        return null;
    };

    const icons = useMemo(() => [
        'local_laundry_service', 'dry_cleaning', 'iron', 'bed', 'checkroom', 'opacity', 'sanitizer', 'soap'
    ], []);
    const [selectedIcon, setSelectedIcon] = useState(icons[0]);

    const handleAdd = async () => {
        if (!serviceName || !price) {
            await appDialog.alert('Please fill all fields');
            return;
        }

        setLoading(true);
        try {
            const vendorId = getVendorId();

            await serviceApi.create({
                name: serviceName,
                basePrice: Number(price),
                unit: unit,
                category: 'Premium', 
                tier: tier,
                icon: selectedIcon,
                vendorId: vendorId,
                tags: tags.split(',').map(t => t.trim()).filter(Boolean)
            });

            await appDialog.alert('Service created and submitted to Admin for approval!');
            navigate('/vendor/services');
        } catch (error) {
            console.error('Add Service Error:', error);
            await appDialog.alert('Failed to submit service');
        } finally {
            setLoading(false);
        }
    };

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-background text-on-background min-h-screen pb-32 font-body"
        >
            <main className="max-w-xl mx-auto px-6 pt-8 space-y-8">
                <header className="flex items-center justify-between">
                    <div className="space-y-1">
                        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-slate-400 hover:text-slate-950 transition-colors mb-4 group">
                            <span className="material-symbols-outlined text-[20px] transition-transform group-hover:-translate-x-1">arrow_back</span>
                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Go Back</span>
                        </button>
                        <h1 className="text-3xl font-black tracking-tighter text-slate-950 uppercase leading-none">New Service.</h1>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] ml-1">Expanding your catalog</p>
                    </div>
                </header>

                <section className="bg-white p-8 rounded-[2.5rem] border border-outline-variant/10 shadow-sm space-y-8">
                    <div className="space-y-6">
                        {/* Tier Selection */}
                        <div className="space-y-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface ml-1">SERVICE TIER</p>
                            <div className="flex bg-surface-container p-1 rounded-2xl gap-1">
                                <button 
                                    onClick={() => setTier('Essential')}
                                    className={`flex-1 py-3 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all ${tier === 'Essential' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-on-surface-variant/40'}`}
                                >
                                    Essential
                                </button>
                                <button 
                                    onClick={() => setTier('Heritage')}
                                    className={`flex-1 py-3 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all ${tier === 'Heritage' ? 'bg-[#996515] text-white shadow-lg shadow-[#996515]/20' : 'text-on-surface-variant/40'}`}
                                >
                                    Heritage
                                </button>
                            </div>
                        </div>

                        {/* Icon Selection */}
                        <div className="space-y-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface ml-1">SELECT ICON</p>
                            <div className="grid grid-cols-4 gap-4">
                                {icons.map((icon) => (
                                    <button 
                                        key={icon}
                                        onClick={() => setSelectedIcon(icon)}
                                        className={`w-full aspect-square rounded-2xl flex items-center justify-center transition-all ${selectedIcon === icon ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-surface-container text-on-surface-variant/30 border border-outline-variant/5'}`}
                                    >
                                        <span className="material-symbols-outlined text-[24px]">{icon}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Name Input */}
                        <div className="space-y-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface ml-1">SERVICE NAME</p>
                            <input 
                                type="text"
                                value={serviceName}
                                onChange={(e) => setServiceName(e.target.value)}
                                placeholder="e.g. Premium Silk Clean"
                                className="w-full px-6 py-4 bg-surface-container border-2 border-transparent rounded-[1.5rem] text-sm font-bold text-on-surface outline-none focus:bg-white focus:border-primary/20 transition-all placeholder:text-on-surface-variant/20 shadow-sm"
                            />
                        </div>

                        {/* Price & Unit Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface ml-1">PRICE (₹)</p>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-on-surface-variant/40">₹</span>
                                    <input 
                                        type="number"
                                        value={price}
                                        onChange={(e) => setPrice(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full pl-8 pr-4 py-4 bg-surface-container border-2 border-transparent rounded-[1.5rem] text-sm font-bold text-on-surface outline-none focus:bg-white focus:border-primary/20 transition-all placeholder:text-on-surface-variant/20 shadow-sm"
                                    />
                                </div>
                            </div>
                            <div className="space-y-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface ml-1">UNIT</p>
                                <select 
                                    value={unit}
                                    onChange={(e) => setUnit(e.target.value)}
                                    className="w-full px-6 py-4 bg-surface-container border-2 border-transparent rounded-[1.5rem] text-sm font-bold text-on-surface outline-none focus:border-primary/20 transition-all shadow-sm appearance-none"
                                >
                                    <option>Per Kg</option>
                                    <option>Per Piece</option>
                                    <option>Per Set</option>
                                    <option>Per Pair</option>
                                </select>
                            </div>
                        </div>

                        {/* Search Tags Input */}
                        <div className="space-y-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface ml-1">SEARCH TAGS (COMMA SEPARATED)</p>
                            <input 
                                type="text"
                                value={tags}
                                onChange={(e) => setTags(e.target.value)}
                                placeholder="e.g. shirt, pant, jeans, formal"
                                className="w-full px-6 py-4 bg-surface-container border-2 border-transparent rounded-[1.5rem] text-sm font-bold text-on-surface outline-none focus:bg-white focus:border-primary/20 transition-all placeholder:text-on-surface-variant/20 shadow-sm"
                            />
                        </div>
                    </div>

                    <div className="pt-4 border-t border-outline-variant/5">
                        <button 
                            onClick={handleAdd}
                            className="w-full py-5 rounded-[2rem] vendor-gradient text-white font-bold text-lg shadow-xl shadow-primary/20 hover:opacity-90 transition-all flex items-center justify-center gap-3"
                        >
                            <span className="material-symbols-outlined text-[20px]">add</span>
                            Create Service
                        </button>
                    </div>
                </section>

                {/* Aesthetic Info Tip */}
                <div className="bg-primary/5 p-6 rounded-3xl border border-primary/10 flex items-start gap-4">
                    <span className="material-symbols-outlined text-primary text-[20px] mt-1">info</span>
                    <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider leading-relaxed opacity-60">
                        NEW SERVICES WILL BE VISIBLE TO CUSTOMERS IMMEDIATELY AFTER CREATION. ENSURE PRICING IS ACCURATE FOR YOUR REGION.
                    </p>
                </div>
            </main>
        </motion.div>
    );
};

export default AddServicePage;
