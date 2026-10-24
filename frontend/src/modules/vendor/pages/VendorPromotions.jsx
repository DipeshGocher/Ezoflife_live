import { appDialog } from '../../../shared/stores/appDialogStore';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { promotionApi } from '../../../lib/api';

const VendorPromotions = () => {
    const navigate = useNavigate();
    const [promos, setPromos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [promoForm, setPromoForm] = useState({
        title: '', code: '', discountType: 'Percentage', discountValue: '', minOrderValue: '', usageLimit: 100, expiryDate: ''
    });

    const vendorDataRaw = localStorage.getItem('vendorData') || localStorage.getItem('user') || '{}';
    const vendorData = JSON.parse(vendorDataRaw);
    const vendorId = vendorData._id || vendorData.id;

    const fetchPromos = async () => {
        if (!vendorId) return;
        try {
            setLoading(true);
            const data = await promotionApi.getVendorPromos(vendorId);
            setPromos(data);
        } catch (err) { 
            console.error(err); 
        } finally {
            setLoading(false);
        }
    };

    const handleCreatePromo = async (e) => {
        e.preventDefault();
        try {
            await promotionApi.create({ ...promoForm, vendorId });
            setPromoForm({ title: '', code: '', discountType: 'Percentage', discountValue: '', minOrderValue: '', usageLimit: 100, expiryDate: '' });
            fetchPromos();
            await appDialog.alert('Promo Code Created Successfully!');
        } catch (err) { 
            await appDialog.alert(err.message || 'Failed to create promo');
        }
    };

    const togglePromo = async (id) => {
        try {
            await promotionApi.toggleStatus(id);
            fetchPromos();
        } catch (err) { console.error(err); }
    };

    const deletePromo = async (id) => {
        if (!await appDialog.confirm('Are you sure you want to delete this promo code?')) return;
        try {
            await promotionApi.delete(id);
            fetchPromos();
        } catch (err) { console.error(err); }
    };

    useEffect(() => {
        document.title = 'Promotion Hub | Spinzyt';
        if (vendorId) {
            fetchPromos();
        }
    }, [vendorId]);

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-[#F8FAFC] text-slate-900 min-h-screen pb-32 font-sans"
        >
            <main className="max-w-xl mx-auto px-6 pt-10 space-y-12">
                {/* PAGE HEADER */}
                <header className="flex items-center justify-between">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-black tracking-tighter text-slate-950 uppercase leading-none">Promotion Hub</h1>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] ml-1">Marketing & Offers</p>
                    </div>
                    <button 
                        onClick={() => navigate(-1)}
                        className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 shadow-sm border border-slate-100"
                    >
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                </header>

                <section className="space-y-8">
                    {/* Create Form */}
                    <div className="bg-white rounded-[2.5rem] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-slate-100 space-y-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary">
                                <span className="material-symbols-outlined">add_circle</span>
                            </div>
                            <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">Create New Offer</h3>
                        </div>

                        <form onSubmit={handleCreatePromo} className="space-y-4">
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Campaign Title</label>
                                    <input placeholder="e.g. Festive Diwali Discount" value={promoForm.title} onChange={e => setPromoForm({...promoForm, title: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:bg-white focus:ring-2 ring-primary/10 transition-all" required />
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Promo Code</label>
                                        <input placeholder="e.g. SAVE50" value={promoForm.code} onChange={e => setPromoForm({...promoForm, code: e.target.value.toUpperCase()})} className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:bg-white focus:ring-2 ring-primary/10 transition-all" required />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Discount Type</label>
                                        <select value={promoForm.discountType} onChange={e => setPromoForm({...promoForm, discountType: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:bg-white focus:ring-2 ring-primary/10 transition-all">
                                            <option value="Percentage">% Percentage Off</option>
                                            <option value="Flat">Flat ₹ Amount Off</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Value ({promoForm.discountType === 'Percentage' ? '%' : '₹'})</label>
                                        <input placeholder="0" type="number" value={promoForm.discountValue} onChange={e => setPromoForm({...promoForm, discountValue: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:bg-white focus:ring-2 ring-primary/10 transition-all" required />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Min Order ₹</label>
                                        <input placeholder="500" type="number" value={promoForm.minOrderValue} onChange={e => setPromoForm({...promoForm, minOrderValue: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:bg-white focus:ring-2 ring-primary/10 transition-all" required />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Expiry Date</label>
                                    <input type="date" value={promoForm.expiryDate} onChange={e => setPromoForm({...promoForm, expiryDate: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:bg-white focus:ring-2 ring-primary/10 transition-all" required />
                                </div>
                            </div>
                            
                            <button className="w-full py-5 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-primary transition-all active:scale-[0.98] mt-4">
                                Generate Promotion
                            </button>
                        </form>
                    </div>

                    {/* Active List */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-2">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Promotions</h3>
                            <span className="text-[10px] font-black text-primary uppercase tracking-widest">{promos.length} Codes</span>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            <AnimatePresence>
                                {promos.map(p => (
                                    <motion.div 
                                        key={p._id}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between group"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-100 group-hover:bg-primary/5 group-hover:text-primary transition-colors">
                                                <span className="material-symbols-outlined text-2xl">confirmation_number</span>
                                            </div>
                                            <div>
                                                <h4 className="font-black text-sm text-slate-900 tracking-tight">{p.code}</h4>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">
                                                    {p.discountValue}{p.discountType === 'Percentage' ? '%' : '₹'} Off • Min ₹{p.minOrderValue}
                                                </p>
                                                <p className="text-[8px] font-black text-rose-400 uppercase mt-1">Expires: {new Date(p.expiryDate).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={() => togglePromo(p._id)}
                                                className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${p.status === 'Active' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}
                                            >
                                                {p.status}
                                            </button>

                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>

                            {promos.length === 0 && !loading && (
                                <div className="py-20 text-center opacity-20">
                                    <span className="material-symbols-outlined text-5xl mb-2">confirmation_number</span>
                                    <p className="text-[10px] font-black uppercase tracking-widest">No promotions created yet</p>
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            </main>
        </motion.div>
    );
};

export default VendorPromotions;
