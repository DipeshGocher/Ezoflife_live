import { appDialog } from '../../../shared/stores/appDialogStore';
import React, { useMemo, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, PlusCircle, Settings, IndianRupee, Layers, CheckCircle2, XCircle, RotateCw, Filter, Download, ArrowRight, Trash2, Info, TrendingUp, Award, ShieldCheck } from 'lucide-react';
import { serviceApi, BASE_URL } from '../../../lib/api';
import { shippingConfigApi } from '../../../lib/shippingApi';
import PageHeader from '../components/common/PageHeader';
import DataGrid from '../components/tables/DataGrid';
import StatusBadge from '../components/common/StatusBadge';
import MetricRow from '../components/cards/MetricRow';
import { FilterLabel } from "../components/common/FilterLabel";

export default function Services() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('All'); // 'All' or 'Pending'
  const [systemFees, setSystemFees] = useState({ essential: 20, heritage: 150 });
  const [viewingService, setViewingService] = useState(null);

  const fetchServices = async () => {
    try {
      setLoading(true);
      const [services, config] = await Promise.all([
        serviceApi.getAll(),
        shippingConfigApi.getConfig()
      ]);
      setData(services);

      const eFee = config.find(c => c.key === 'essential_fee')?.value || 20;
      const hFee = config.find(c => c.key === 'heritage_fee')?.value || 150;
      setSystemFees({ essential: Number(eFee), heritage: Number(hFee) });

    } catch (error) {
      console.error('Error fetching services:', error);
      await appDialog.alert('Failed to load services');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, []);

  // Derived from the loaded catalogue — no invented yield or pricing figures.
  const serviceStats = useMemo(() => {
    const priced = data.filter(s => Number(s.basePrice ?? s.price) > 0);
    const avgPrice = priced.length
      ? Math.round(priced.reduce((sum, s) => sum + Number(s.basePrice ?? s.price), 0) / priced.length)
      : 0;
    const active = data.filter(s => s.isActive !== false && s.isActive !== 'n').length;
    const dryClean = data.filter(s =>
      /dry\s*clean/i.test(s.category?.name || s.category || s.name || '')
    ).length;

    return [
      { label: 'Service Points', value: data.length.toString(), icon: Sparkles },
      { label: 'Active Services', value: active.toString(), icon: Layers },
      { label: 'Dry Clean Base', value: dryClean.toString(), icon: Layers },
      { label: 'Network Avg Price', value: `₹${avgPrice}`, icon: Settings, currency: 'INR' }
    ];
  }, [data]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    category: 'Laundry',
    basePrice: '',
    unit: 'kg',
    tier: 'Essential',
    status: 'Active',
    image: '',
    description: '',
    serviceType: 'normal'
  });

  const openModal = (service = null) => {
    if (service) {
      setEditingService(service);
      setFormData({
        name: service.name,
        category: service.category,
        basePrice: service.basePrice,
        unit: service.unit,
        tier: service.tier || 'Essential',
        status: service.status,
        image: service.image || '',
        description: service.description || '',
        serviceType: service.serviceType || 'normal'
      });
    } else {
      setEditingService(null);
      setFormData({
        name: '',
        category: 'Laundry',
        basePrice: '',
        unit: 'kg',
        tier: 'Essential',
        status: 'Active',
        image: '',
        description: '',
        serviceType: 'normal'
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
        const payload = { 
            ...formData, 
            basePrice: Number(formData.basePrice)
        };
        if (editingService) {
            await serviceApi.update(editingService._id, payload);
        } else {
            await serviceApi.create(payload);
        }
        await fetchServices();
        setIsModalOpen(false);
        await appDialog.alert(`Service ${editingService ? 'updated' : 'created'} successfully!`);
    } catch (error) {
        console.error('Error saving service:', error);
        await appDialog.alert('Failed to save service');
    }
  };

  const handleApprove = async (id) => {
    try {
        await serviceApi.update(id, { approvalStatus: 'Approved', status: 'Inactive' });
        await fetchServices();
        await appDialog.alert('Service approved successfully!');
    } catch (error) {
        console.error('Error approving service:', error);
        await appDialog.alert('Failed to approve service');
    }
  };

  const handleDelete = async (id) => {
    if (await appDialog.confirm('Are you sure you want to delete this service?')) {
        try {
            await serviceApi.delete(id);
            await fetchServices();
            await appDialog.alert('Service deleted successfully');
        } catch (error) {
            console.error('Error deleting service:', error);
            await appDialog.alert('Failed to delete service');
        }
    }
  };


  const handleClearAll = async () => {
    if (await appDialog.confirm('CRITICAL ACTION: This will delete ALL master and custom services. Are you absolutely sure?')) {
        try {
            setLoading(true);
            const response = await fetch(`${BASE_URL}/admin/services-clear-all`, {
                method: 'DELETE'
            });
            const result = await response.json();
            if (response.ok) {
                await appDialog.alert(result.message);
                fetchServices();
            } else {
                await appDialog.alert(result.message || 'Operation failed');
            }
        } catch (err) {
            console.error('Clear services error:', err);
            await appDialog.alert('Failed to clear services');
        } finally {
            setLoading(false);
        }
    }
  };

  const serviceColumns = useMemo(() => [
    { 
      header: 'Service Name', 
      key: 'name',
      render: (val, row) => (
        <div className="flex items-center gap-3 transition-transform">
          <div className="w-10 h-10 rounded-sm bg-slate-100 overflow-hidden border border-slate-200 flex items-center justify-center group-hover:border-slate-900 transition-all">
             {row.image ? (
               <img src={row.image} alt={val} className="w-full h-full object-cover" />
             ) : (
               <Sparkles size={14} className="text-slate-400" />
             )}
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-slate-900 text-[11px] uppercase tracking-tight leading-none">{val}</span>
                {!row.isMaster && <span className="px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded-sm text-[7px] font-black uppercase tracking-tighter border border-amber-100">Vendor</span>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] opacity-60 flex items-center gap-1.5 tabular-nums leading-none">
                <Layers size={10} className="text-slate-300" /> {row.category}
              </span>
            </div>
          </div>
        </div>
      )
    },

    { 
      header: 'Base Price', 
      key: 'basePrice',
      render: (val, row) => (
        <div className="flex flex-col">
          <span className="font-bold text-slate-900 tabular-nums text-xs tracking-widest leading-none mb-1">₹{val.toLocaleString()}</span>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] opacity-60 flex items-center gap-1.5 tabular-nums leading-none">
             PER {row.unit.toUpperCase()}
          </span>
        </div>
      )
    },
    { 
      header: 'Approval', 
      key: 'approvalStatus', 
      render: (val) => <StatusBadge status={val} /> 
    },
    { 
      header: 'Price Breakdown', 
      key: '_id',
      render: (val, row) => {
        const feePercent = row.tier === 'Heritage' ? systemFees.heritage : systemFees.essential;
        const feeAmount = (row.basePrice * feePercent) / 100;
        const totalPrice = row.basePrice + feeAmount;
        return (
          <div 
            onClick={(e) => { e.stopPropagation(); setViewingService(row); }}
            className="flex flex-col cursor-pointer group/tip"
          >
            <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] font-black text-slate-400 tabular-nums">₹{row.basePrice}</span>
                <span className="text-[8px] font-bold text-slate-300 tracking-tighter">+ {feePercent}%</span>
            </div>
            <span className="font-black text-slate-900 tabular-nums text-xs tracking-tight flex items-center gap-1.5">
                ₹{totalPrice.toLocaleString()}
                <Info size={10} className="text-slate-300 group-hover/tip:text-slate-900 transition-colors" />
            </span>
          </div>
        );
      }
    },
    { 
      header: 'Status', 
      key: 'status', 
      render: (val) => <StatusBadge status={val} /> 
    },
    { 
      header: 'Actions', 
      key: 'actions', 
      align: 'right',
      render: (val, row) => (
        <div className="flex items-center justify-end gap-2.5">
          {row.approvalStatus === 'Pending' && (
            <button 
              onClick={() => handleApprove(row._id)}
              className="px-4 py-2 bg-emerald-600 text-white rounded-sm text-[8px] font-bold uppercase tracking-[0.2em] hover:bg-emerald-700 transition-all flex items-center gap-2"
            >
              <CheckCircle2 size={11} /> APPROVE
            </button>
          )}
          <button 
            onClick={() => openModal(row)}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-500 rounded-sm text-[8px] font-bold uppercase tracking-[0.2em] hover:bg-slate-950 hover:text-white hover:border-slate-950 transition-all flex items-center gap-2 group"
          >
            <Settings size={11} className="group-hover:rotate-90 transition-transform duration-500" /> EDIT
          </button>
          <button 
            onClick={() => handleDelete(row._id)}
            className="px-4 py-2 bg-white border border-red-200 text-red-500 rounded-sm text-[8px] font-bold uppercase tracking-[0.2em] hover:bg-red-600 hover:text-white hover:border-red-600 transition-all flex items-center gap-2 group"
          >
            <Trash2 size={11} className="group-hover:scale-110 transition-transform" /> DELETE
          </button>
        </div>
      )
    }

  ], []);

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50 pb-20">
      <PageHeader 
        title="Services" 
        actions={[
          { label: 'Clear All', icon: Trash2, variant: 'rose', onClick: handleClearAll },
          { label: 'Create New', icon: PlusCircle, variant: 'primary', onClick: () => openModal() }
        ]}
      />

      {/* CRUD Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-xl rounded-sm shadow-2xl overflow-hidden border border-slate-200"
          >
            <form onSubmit={handleSave} className="flex flex-col">
              <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-900 text-white flex items-center justify-center rounded-sm">
                    <Settings size={18} />
                  </div>
                  <div>
                    <h3 className="text-[12px] font-black text-slate-900 uppercase tracking-widest">{editingService ? 'Edit Configuration' : 'Create Master Service'}</h3>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">Registry Update Protocol</p>
                  </div>
                </div>
                <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-900 transition-colors">
                  <XCircle size={20} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Service Name</label>
                    <input 
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Category</label>
                    <select 
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none cursor-pointer"
                    >
                      <option value="Laundry">Laundry</option>
                      <option value="Dry Cleaning">Dry Cleaning</option>
                      <option value="Ironing">Ironing</option>
                      <option value="Premium">Premium</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Base Price (₹)</label>
                    <input 
                      required
                      type="number"
                      value={formData.basePrice}
                      onChange={(e) => setFormData({ ...formData, basePrice: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Unit</label>
                    <input 
                      required
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Tier Assignment</label>
                    <div className="flex gap-2">
                      {['Essential', 'Heritage'].map(t => (
                        <button 
                          key={t}
                          type="button"
                          onClick={() => setFormData({ ...formData, tier: t })}
                          className={`flex-1 py-2.5 rounded-sm text-[9px] font-black uppercase tracking-widest border transition-all ${formData.tier === t ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400'}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Status</label>
                    <select 
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none cursor-pointer"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                      <option value="Suspended">Suspended</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Flow Type (Mode)</label>
                    <div className="flex gap-2">
                      {['normal', 'retail'].map(t => (
                        <button 
                          key={t}
                          type="button"
                          onClick={() => setFormData({ ...formData, serviceType: t })}
                          className={`flex-1 py-2.5 rounded-sm text-[9px] font-black uppercase tracking-widest border transition-all ${formData.serviceType === t ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400'}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Image URL (Live Preview)</label>
                  <input 
                    placeholder="https://images.unsplash.com/..."
                    value={formData.image}
                    onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none"
                  />
                  {formData.image && (
                    <div className="mt-2 w-20 h-20 rounded-sm border border-slate-200 overflow-hidden bg-slate-100">
                      <img src={formData.image} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                   )}
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Service Description</label>
                  <textarea 
                    rows={3}
                    placeholder="Describe the service details..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none resize-none"
                  />
                </div>
              </div>

              <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-4 text-slate-500 font-black text-[10px] uppercase tracking-[0.2em] bg-white border border-slate-200 rounded-sm hover:bg-slate-100 transition-all"
                >
                  Discard Changes
                </button>
                <button 
                  type="submit"
                  className="flex-[2] py-4 bg-slate-900 text-white font-black text-[10px] uppercase tracking-[0.2em] rounded-sm shadow-xl shadow-slate-900/10 hover:bg-black transition-all"
                >
                  {editingService ? 'Commit Configuration' : 'Register Service'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
        )}
      </AnimatePresence>

      {/* Price Audit Detail Modal */}
      <AnimatePresence>
        {viewingService && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 overflow-hidden">
                <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={() => setViewingService(null)}
                    className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
                />
                <motion.div 
                    initial={{ opacity: 0, scale: 0.98, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98, y: 20 }}
                    className="bg-white w-full max-w-2xl max-h-[85vh] rounded-[1.5rem] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] overflow-hidden border border-slate-100 relative z-10 flex flex-col"
                >
                    {/* Compact Header */}
                    <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-white">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-slate-900 text-white flex items-center justify-center rounded-xl">
                                <TrendingUp size={18} />
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight italic">Audit Detail</h3>
                                <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Transaction Breakdown</p>
                            </div>
                        </div>
                        <button onClick={() => setViewingService(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-50 text-slate-400 transition-colors">
                            <XCircle size={20} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
                        {/* Profile Section - More Slim */}
                        <div className="flex items-center justify-between pb-6 border-b border-slate-50">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-2xl border border-slate-100 overflow-hidden bg-slate-50 p-0.5 shadow-sm">
                                    <div className="w-full h-full rounded-[0.8rem] overflow-hidden">
                                        {viewingService.image ? <img src={viewingService.image} className="w-full h-full object-cover" /> : <Sparkles className="m-auto text-slate-200 mt-4" size={14} />}
                                    </div>
                                </div>
                                <div className="space-y-0.5">
                                    <h4 className="text-base font-black text-slate-900 tracking-tighter uppercase italic leading-none">{viewingService.name}</h4>
                                    <div className="flex gap-1.5 mt-1">
                                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[7px] font-black uppercase tracking-widest rounded-md">{viewingService.category}</span>
                                        <span className={`px-2 py-0.5 text-[7px] font-black uppercase tracking-widest rounded-md ${viewingService.tier === 'Heritage' ? 'bg-purple-50 text-purple-600' : 'bg-emerald-50 text-emerald-600'}`}>{viewingService.tier} Tier</span>
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">ID: {viewingService.vendorId?.slice(-8) || 'MASTER'}</p>
                                <span className="text-[7px] font-bold text-emerald-500 uppercase tracking-widest px-1.5 py-0.5 bg-emerald-50 rounded-full mt-1 inline-block">Verified</span>
                            </div>
                        </div>

                        {/* Calculations - Sleeker horizontal layout */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-4 bg-slate-50/50 border border-slate-100 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-white text-slate-400 flex items-center justify-center rounded-lg shadow-sm">
                                        <IndianRupee size={14} />
                                    </div>
                                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Vendor Net</span>
                                </div>
                                <span className="text-base font-black text-slate-900 tabular-nums tracking-tight">₹{viewingService.basePrice.toLocaleString()}</span>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-blue-50/30 border border-blue-100/50 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-white text-blue-500 flex items-center justify-center rounded-lg shadow-sm">
                                        <Settings size={14} />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest">Platform Fee</span>
                                        <span className="px-1.5 py-0.5 bg-blue-600 text-white text-[6px] font-black rounded-full">{viewingService.tier === 'Heritage' ? systemFees.heritage : systemFees.essential}%</span>
                                    </div>
                                </div>
                                <span className="text-base font-black text-blue-600 tabular-nums tracking-tight">+ ₹{((viewingService.basePrice * (viewingService.tier === 'Heritage' ? systemFees.heritage : systemFees.essential)) / 100).toLocaleString()}</span>
                            </div>

                            {/* Final Total - Highlighted but compact */}
                            <div className="mt-6 p-6 bg-slate-900 text-white rounded-[1.25rem] shadow-lg shadow-slate-900/10 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full -mr-16 -mt-16 blur-2xl" />
                                <div className="relative z-10 flex items-center justify-between">
                                    <div className="space-y-1">
                                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">Marketplace Value</p>
                                        <p className="text-[7px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                                            <Award size={10} /> FINAL CUSTOMER PRICE
                                        </p>
                                    </div>
                                    <p className="text-3xl font-black tabular-nums tracking-tighter italic">₹{(viewingService.basePrice + (viewingService.basePrice * (viewingService.tier === 'Heritage' ? systemFees.heritage : systemFees.essential)) / 100).toLocaleString()}</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-xl flex gap-3">
                            <Info size={14} className="text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-[8px] text-amber-700/70 font-bold leading-relaxed uppercase tracking-widest italic">
                                Pricing syncs with <span className="text-amber-700 underline underline-offset-2">Global Policies</span>. Last updated: Just now.
                            </p>
                        </div>
                    </div>

                    <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100 flex gap-4">
                        <button 
                            onClick={() => setViewingService(null)}
                            className="flex-1 py-3.5 bg-white border border-slate-200 text-slate-500 font-black text-[9px] uppercase tracking-widest rounded-xl hover:bg-slate-100 transition-all shadow-sm"
                        >
                            Close
                        </button>
                        {viewingService.approvalStatus === 'Pending' && (
                            <button 
                                onClick={() => { handleApprove(viewingService._id); setViewingService(null); }}
                                className="flex-[1.5] py-3.5 bg-slate-900 text-white font-black text-[9px] uppercase tracking-widest rounded-xl shadow-md shadow-slate-900/10 hover:bg-black transition-all flex items-center justify-center gap-2"
                            >
                                <CheckCircle2 size={14} />
                                Approve Price
                            </button>
                        )}
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>

      {/* Distribution Performance Index */}
      <div className="bg-white border-b border-slate-200 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 divide-x divide-slate-100 max-w-[1600px] mx-auto w-full">
            {serviceStats.map((stat, i) => (
                <MetricRow key={i} {...stat} />
            ))}
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">
        {/* Tabs for Filtering */}
        <FilterLabel label="Show" className="mb-2" info="All Services lists every service. Pending Approvals lists services vendors have submitted that still need your approval." />
        <div className="flex gap-8 border-b border-slate-200 mb-6 font-bold text-[10px] uppercase tracking-[0.2em]">
            <button 
                onClick={() => setActiveTab('All')}
                className={`pb-4 px-2 transition-all relative ${activeTab === 'All' ? 'text-slate-900 border-b-2 border-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
            >
                All Services ({data.length})
            </button>
            <button 
                onClick={() => setActiveTab('Pending')}
                className={`pb-4 px-2 transition-all relative ${activeTab === 'Pending' ? 'text-amber-600 border-b-2 border-amber-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
                Pending Approvals ({data.filter(s => s.approvalStatus === 'Pending').length})
                {data.filter(s => s.approvalStatus === 'Pending').length > 0 && (
                    <span className="ml-2 w-2 h-2 bg-amber-500 rounded-full inline-block animate-pulse" />
                )}
            </button>
        </div>

        {/* Service List */}
        {loading ? (
            <div className="p-20 flex items-center justify-center bg-white border border-slate-200 rounded-sm animate-pulse">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-4 border-slate-900 border-t-transparent rounded-full animate-spin" />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Synchronizing Registry...</span>
                </div>
            </div>
        ) : (
            <DataGrid 
                title={activeTab === 'Pending' ? "Approval Queue" : "Master Service Registry"}
                columns={serviceColumns}
                data={data.filter(s => activeTab === 'All' ? true : s.approvalStatus === 'Pending')}
                onAction={(row) => openModal(row)}
            />
        )}
      </div>

    </div>
  );
}
