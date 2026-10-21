import { appDialog } from '../../../shared/stores/appDialogStore';
import React, { useState } from 'react';
import { 
    Package, 
    Plus, 
    Search, 
    MoreVertical, 
    Trash2, 
    Edit2, 
    Layers,
    Tag,
    IndianRupee,
    Info,
    CheckCircle2,
    RefreshCcw,
    Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { materialApi } from '../../../lib/api';
import { useEffect } from 'react';
import FilterField from "../components/common/FilterLabel";

export default function MaterialConfig() {
    const [searchQuery, setSearchQuery] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [materials, setMaterials] = useState([]);
    const [newMaterial, setNewMaterial] = useState({ name: '', price: '', category: 'Cleaning', stock: '' });

    const fetchMaterials = async () => {
        try {
            const data = await materialApi.getAll();
            setMaterials(data);
        } catch (error) {
            console.error('Fetch Materials Error:', error);
        }
    };

    useEffect(() => {
        fetchMaterials();
    }, []);

    const handleAdd = async () => {
        if (!newMaterial.name || !newMaterial.price) return;
        try {
            await materialApi.create(newMaterial);
            fetchMaterials();
            setNewMaterial({ name: '', price: '', category: 'Cleaning', stock: '' });
            setShowAddModal(false);
        } catch (error) {
            console.error('Add Material Error:', error);
            await appDialog.alert('Failed to add material');
        }
    };

    const handleDelete = async (id) => {
        if (!await appDialog.confirm('Are you sure you want to delete this material?')) return;
        try {
            await materialApi.delete(id);
            fetchMaterials();
        } catch (error) {
            console.error('Delete Material Error:', error);
            await appDialog.alert('Failed to delete material');
        }
    };

    const filtered = materials.filter(m => 
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        m.category.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="p-8 space-y-8 max-w-7xl mx-auto">
            {/* Tactical Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Layers size={20} className="text-slate-900" />
                        <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">Material Management</h1>
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 ml-0.5">
                        Central Supply Catalog & B2B Inventory Pricing
                    </p>
                </div>
                
                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-sm text-slate-500 hover:bg-slate-50 transition-all font-bold text-[10px] uppercase tracking-widest group">
                        <RefreshCcw size={14} className="group-hover:rotate-180 transition-transform duration-500" />
                        Sync Inventory
                    </button>
                    <button 
                        onClick={() => setShowAddModal(true)}
                        className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-sm hover:shadow-xl hover:shadow-slate-900/10 transition-all font-bold text-[10px] uppercase tracking-widest"
                    >
                        <Plus size={16} />
                        New Material
                    </button>
                </div>
            </div>

            {/* Dashboard Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                    {
                        label: 'Total Categories',
                        value: String(new Set(materials.map(m => m.category).filter(Boolean)).size).padStart(2, '0'),
                        icon: Box, trend: 'Primary'
                    },
                    {
                        label: 'Live Items',
                        value: materials.length.toString().padStart(2, '0'),
                        icon: Tag, trend: 'Neutral'
                    },
                    {
                        label: 'Warehouse Stock',
                        value: String(materials.reduce((s, m) => s + (Number(m.stock ?? m.quantity) || 0), 0)),
                        icon: Package, trend: 'Success'
                    },
                    {
                        label: 'Asset Value',
                        value: `₹${materials
                            .reduce((s, m) => s + (Number(m.price ?? m.rate) || 0) * (Number(m.stock ?? m.quantity) || 0), 0)
                            .toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
                        icon: IndianRupee, trend: 'Warning'
                    },
                ].map((stat, i) => (
                    <div key={i} className="bg-white p-5 rounded-sm border border-slate-100 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-slate-50 rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-110" />
                        <div className="relative z-10 flex flex-col gap-1">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</span>
                            <h3 className="text-2xl font-black text-slate-900 tracking-tighter">{stat.value}</h3>
                        </div>
                    </div>
                ))}
            </div>

            {/* Search and Filters */}
            <div className="bg-white p-2 rounded-sm border border-slate-100 shadow-sm flex flex-col md:flex-row items-center gap-2">
                <FilterField label="Search catalog" info="Shows only materials whose name or category contains this text." className="flex-1 w-full px-2 pt-1">
                <div className="relative flex-1 group">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors" />
                    <input 
                        type="text" 
                        placeholder="Search catalog by name or category..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-12 pr-6 py-3 bg-transparent border-none focus:ring-0 text-[11px] font-bold text-slate-900 uppercase placeholder:text-slate-300"
                    />
                </div>
                </FilterField>
                <div className="h-6 w-px bg-slate-100 hidden md:block" />
                <button className="flex items-center gap-2 px-6 py-2 text-slate-500 hover:text-slate-900 transition-colors font-bold text-[10px] uppercase tracking-widest">
                    <Filter size={14} />
                    Filters
                </button>
            </div>

            {/* Content Table */}
            <div className="bg-white rounded-sm border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Item Detail</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">B2B Base Price</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Inventory</th>
                                <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            <AnimatePresence mode="popLayout">
                                {filtered.map((item) => (
                                    <motion.tr 
                                        layout
                                        key={item.id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0, scale: 0.98 }}
                                        className="group hover:bg-slate-50/50 transition-colors"
                                    >
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-sm bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-all">
                                                    <Package size={18} />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[11px] font-black text-slate-900 uppercase tracking-tight">{item.name}</span>
                                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{item._id}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <span className="px-3 py-1 bg-slate-100 rounded-full text-[9px] font-black text-slate-600 uppercase tracking-widest">
                                                {item.category}
                                            </span>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-black text-slate-900 tracking-tighter">₹{item.price.toLocaleString()}</span>
                                                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">Tax Exclusive</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{item.stock}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button className="p-2 text-slate-400 hover:text-slate-900 transition-colors">
                                                    <Edit2 size={14} />
                                                </button>
                                                <button 
                                                    onClick={() => handleDelete(item._id)}
                                                    className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Material Modal */}
            <AnimatePresence>
                {showAddModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white w-full max-w-lg rounded-sm shadow-2xl border border-slate-100 overflow-hidden"
                        >
                            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                                <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Add New Material</h2>
                                <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-900">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                            
                            <div className="p-8 space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Material Name</label>
                                    <input 
                                        type="text" 
                                        placeholder="Enter name (e.g. Hanger, Detergent)"
                                        value={newMaterial.name}
                                        onChange={(e) => setNewMaterial({...newMaterial, name: e.target.value})}
                                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 outline-none focus:border-slate-900 transition-all"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Price / Rate (₹)</label>
                                        <input 
                                            type="number" 
                                            placeholder="299"
                                            value={newMaterial.price}
                                            onChange={(e) => setNewMaterial({...newMaterial, price: e.target.value})}
                                            className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 outline-none focus:border-slate-900 transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Stock Units</label>
                                        <input 
                                            type="text" 
                                            placeholder="100 Units"
                                            value={newMaterial.stock}
                                            onChange={(e) => setNewMaterial({...newMaterial, stock: e.target.value})}
                                            className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 outline-none focus:border-slate-900 transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Category</label>
                                    <input 
                                        type="text"
                                        placeholder="e.g. Cleaning, Hardware"
                                        value={newMaterial.category}
                                        onChange={(e) => setNewMaterial({...newMaterial, category: e.target.value})}
                                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 outline-none focus:border-slate-900 transition-all"
                                    />
                                </div>
                            </div>

                            <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                                <button 
                                    onClick={() => setShowAddModal(false)}
                                    className="flex-1 py-4 border border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest rounded-sm hover:bg-white transition-all"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={handleAdd}
                                    className="flex-[2] py-4 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-sm shadow-xl shadow-slate-900/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                >
                                    Add Material
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

// Minimal Box icon replacement since lucide might not have all specific icons
const Box = ({ size, className }) => (
    <svg 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className={className}
    >
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.3 7 8.7 5 8.7-5" />
        <path d="M12 22V12" />
    </svg>
);
