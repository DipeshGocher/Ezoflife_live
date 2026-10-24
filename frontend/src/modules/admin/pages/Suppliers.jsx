import { appDialog } from '../../../shared/stores/appDialogStore';
import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, XCircle, MapPin, FileText, CheckCircle2, RotateCw, Factory, Eye, ExternalLink, UserCheck, ShieldX, Trash2 } from 'lucide-react';
import { adminApi, UPLOADS_URL } from '../../../lib/api';
import PageHeader from '../components/common/PageHeader';
import toast from 'react-hot-toast';

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewingSupplier, setViewingSupplier] = useState(null);
  const [isProcessing, setIsProcessing] = useState(null);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getAllSuppliers();
      setSuppliers(data);
    } catch (err) {
      console.error('Fetch Suppliers Error:', err);
      toast.error('Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id, status) => {
    if(!await appDialog.confirm(`Are you sure you want to ${status} this supplier?`)) return;
    
    setIsProcessing(id);
    try {
      if (status === 'approved') {
        await adminApi.approveSupplier(id);
        toast.success('Supplier approved successfully');
      } else {
        await adminApi.rejectSupplier(id);
        toast.error('Supplier rejected');
      }
      fetchSuppliers(); // Refresh list
    } catch (err) {
      toast.error('Action failed');
    } finally {
      setIsProcessing(null);
    }
  };

  const handleDelete = async (id) => {
    if(!await appDialog.confirm('CRITICAL: Are you sure you want to PERMANENTLY DELETE this supplier? This action cannot be undone.')) return;
    try {
        await adminApi.deleteSupplier(id);
        toast.success('Supplier removed from ecosystem');
        fetchSuppliers();
    } catch (err) {
        toast.error('Deletion failed');
    }
  };

  const handleEditInit = (s) => {
    setEditingSupplier(s);
    setEditForm({
        displayName: s.displayName,
        businessName: s.supplierDetails?.businessName || '',
        gst: s.supplierDetails?.gst || '',
        city: s.supplierDetails?.city || '',
        pincode: s.supplierDetails?.pincode || '',
        bankName: s.bankDetails?.bankName || '',
        accountNumber: s.bankDetails?.accountNumber || ''
    });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setIsProcessing(editingSupplier._id);
    try {
        const payload = {
            displayName: editForm.displayName,
            supplierDetails: {
                ...editingSupplier.supplierDetails,
                businessName: editForm.businessName,
                gst: editForm.gst,
                city: editForm.city,
                pincode: editForm.pincode
            },
            bankDetails: {
                ...editingSupplier.bankDetails,
                bankName: editForm.bankName,
                accountNumber: editForm.accountNumber
            }
        };
        await adminApi.updateSupplier(editingSupplier._id, payload);
        toast.success('Supplier credentials updated');
        setEditingSupplier(null);
        fetchSuppliers();
    } catch (err) {
        toast.error('Update failed');
    } finally {
        setIsProcessing(null);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50 pb-20">
      <PageHeader 
        title="Industrial Suppliers" 
        desc="Manage and verify B2B material providers"
      />

      {/* Edit Modal */}
      <AnimatePresence>
        {editingSupplier && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md overflow-y-auto">
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white w-full max-w-lg rounded-sm shadow-2xl p-8 space-y-6">
                    <div className="flex justify-between items-center pb-4 border-b">
                        <h3 className="text-[11px] font-black uppercase tracking-widest">Modifier Supplier: {editingSupplier.phone}</h3>
                        <button onClick={() => setEditingSupplier(null)}><XCircle size={18} /></button>
                    </div>
                    <form onSubmit={handleUpdate} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase text-slate-400">Business Name</label>
                                <input className="w-full bg-slate-50 border p-3 text-xs font-bold" value={editForm.businessName} onChange={e => setEditForm({...editForm, businessName: e.target.value})} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase text-slate-400">Owner Name</label>
                                <input className="w-full bg-slate-50 border p-3 text-xs font-bold" value={editForm.displayName} onChange={e => setEditForm({...editForm, displayName: e.target.value})} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase text-slate-400">City</label>
                                <input className="w-full bg-slate-50 border p-3 text-xs font-bold" value={editForm.city} onChange={e => setEditForm({...editForm, city: e.target.value})} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase text-slate-400">Pincode</label>
                                <input className="w-full bg-slate-50 border p-3 text-xs font-bold" value={editForm.pincode} onChange={e => setEditForm({...editForm, pincode: e.target.value})} />
                            </div>
                        </div>
                        <div className="p-4 bg-slate-50 space-y-3">
                            <p className="text-[9px] font-black uppercase text-slate-400">Banking Override</p>
                            <input className="w-full bg-white border p-3 text-xs font-bold" placeholder="Bank Name" value={editForm.bankName} onChange={e => setEditForm({...editForm, bankName: e.target.value})} />
                            <input className="w-full bg-white border p-3 text-xs font-bold" placeholder="Account Number" value={editForm.accountNumber} onChange={e => setEditForm({...editForm, accountNumber: e.target.value})} />
                        </div>
                        <div className="flex gap-3 pt-4">
                            <button type="button" onClick={() => setEditingSupplier(null)} className="flex-1 px-4 py-3 text-[9px] font-black uppercase tracking-widest border border-slate-200">Cancel</button>
                            <button type="submit" disabled={isProcessing} className="flex-1 px-4 py-3 text-[9px] font-black uppercase tracking-widest bg-slate-900 text-white">
                                {isProcessing ? 'Updating...' : 'Save Changes'}
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        )}
      </AnimatePresence>

      {/* Supplier Detail Modal */}
      <AnimatePresence>
        {viewingSupplier && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md overflow-y-auto">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white w-full max-w-2xl rounded-sm shadow-2xl overflow-hidden my-auto mt-20">
              <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-3">
                    <Factory size={16} className="text-slate-400" />
                    <h3 className="text-[11px] font-black uppercase tracking-widest">Supplier Profile: {viewingSupplier.supplierDetails?.businessName}</h3>
                </div>
                <button onClick={() => setViewingSupplier(null)}><XCircle size={18} /></button>
              </div>
              
              <div className="p-8 space-y-10 max-h-[80vh] overflow-y-auto">
                {/* Business Info */}
                <div className="space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Business Registration</h4>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                        <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Owner Name</p>
                            <p className="text-xs font-bold text-slate-900">{viewingSupplier.displayName}</p>
                        </div>
                        <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Phone</p>
                            <p className="text-xs font-bold text-slate-900">{viewingSupplier.phone}</p>
                        </div>
                        <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">GSTIN</p>
                            <p className="text-xs font-bold text-slate-900 uppercase">{viewingSupplier.supplierDetails?.gst || 'N/A'}</p>
                        </div>
                        <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Location</p>
                            <p className="text-xs font-bold text-slate-900 capitalize">{viewingSupplier.supplierDetails?.city}, {viewingSupplier.supplierDetails?.pincode}</p>
                        </div>
                    </div>
                </div>

                {/* Bank Details */}
                <div className="bg-emerald-50/50 p-6 rounded-sm border border-emerald-100/50 space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Settlement Info (Escrow Ready)</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest mb-1">Bank Name</p>
                            <p className="text-xs font-black text-emerald-900">{viewingSupplier.bankDetails?.bankName}</p>
                        </div>
                        <div>
                            <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest mb-1">Acc Number</p>
                            <p className="text-xs font-black text-emerald-900">{viewingSupplier.bankDetails?.accountNumber}</p>
                        </div>
                        <div>
                            <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest mb-1">IFSC Code</p>
                            <p className="text-xs font-black text-emerald-900 uppercase">{viewingSupplier.bankDetails?.ifscCode}</p>
                        </div>
                    </div>
                </div>

                {/* Proofs */}
                <div className="space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Legal Documents</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {viewingSupplier.documents?.map((doc, idx) => (
                                <a 
                                    key={idx} 
                                    href={doc.url.startsWith('http') ? doc.url : `${UPLOADS_URL}${doc.url}`} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-sm hover:bg-slate-900 hover:text-white transition-all group"
                                >
                                <div className="flex items-center gap-3">
                                    <FileText size={14} className="text-slate-300 group-hover:text-white" />
                                    <span className="text-[9px] font-black uppercase tracking-widest">{doc.type}</span>
                                </div>
                                <ExternalLink size={12} className="opacity-40 group-hover:opacity-100" />
                            </a>
                        ))}
                        {(!viewingSupplier.documents || viewingSupplier.documents.length === 0) && (
                            <p className="text-[10px] font-bold text-slate-400 italic">No documents uploaded</p>
                        )}
                    </div>
                </div>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
                <button onClick={() => setViewingSupplier(null)} className="px-6 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors">Close Profile</button>
                {viewingSupplier.status === 'pending' && (
                    <div className="flex items-center gap-2">
                        <button onClick={() => handleAction(viewingSupplier._id, 'rejected')} className="px-6 py-3 text-[9px] font-black uppercase bg-white border border-slate-200">Reject</button>
                        <button onClick={() => handleAction(viewingSupplier._id, 'approved')} className="px-6 py-3 text-[9px] font-black uppercase bg-slate-900 text-white border border-slate-900">Approve Supplier</button>
                    </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="p-6 space-y-8 max-w-[1600px] mx-auto w-full">
        {/* Statistics Bar */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
                { label: 'Total Suppliers', val: suppliers.length, icon: Factory, color: 'slate' },
                { label: 'Active Partners', val: suppliers.filter(s => s.status === 'approved').length, icon: UserCheck, color: 'emerald' },
                { label: 'Pending Review', val: suppliers.filter(s => s.status === 'pending').length, icon: RotateCw, color: 'blue' },
                { label: 'Blacklisted', val: suppliers.filter(s => s.status === 'rejected').length, icon: ShieldX, color: 'rose' }
            ].map((stat, i) => (
                <div key={i} className="bg-white p-6 rounded-sm border border-slate-200 flex items-center gap-5">
                    <div className={`w-12 h-12 rounded-sm bg-${stat.color}-50 text-${stat.color}-600 flex items-center justify-center border border-${stat.color}-100`}>
                        <stat.icon size={20} />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                        <h4 className="text-2xl font-black text-slate-900">{stat.val}</h4>
                    </div>
                </div>
            ))}
        </div>

        {/* List Section */}
        <div className="bg-white rounded-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-[11px] font-black uppercase tracking-widest">Supplier Directory</h3>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 border border-slate-100 rounded-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] animate-pulse" />
                        <span className="text-[9px] font-black uppercase text-slate-900 tracking-widest">Live Updates</span>
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50/50 border-b border-slate-100">
                        <tr>
                            <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Business Identity</th>
                            <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Owner</th>
                            <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Location</th>
                            <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
                            <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {suppliers.map((s) => (
                            <tr key={s._id} className="border-b border-slate-50 hover:bg-slate-50/30 transition-colors group">
                                <td className="p-5">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-sm bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400">
                                            <Factory size={16} />
                                        </div>
                                        <div className="flex flex-col">
                                            <h4 className="text-[13px] font-bold text-slate-900 uppercase tracking-tight">{s.supplierDetails?.businessName}</h4>
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{s.supplierDetails?.gst || 'UNREGISTERED'}</span>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-5">
                                    <div className="flex flex-col">
                                        <p className="text-xs font-bold text-slate-900">{s.displayName}</p>
                                        <p className="text-[10px] text-slate-400 font-bold">{s.phone}</p>
                                    </div>
                                </td>
                                <td className="p-5">
                                    <div className="flex items-center gap-2 text-slate-500">
                                        <MapPin size={12} />
                                        <span className="text-xs font-bold capitalize">{s.supplierDetails?.city}</span>
                                    </div>
                                </td>
                                <td className="p-5">
                                    <span className={`px-3 py-1 rounded-sm text-[8px] font-black uppercase tracking-widest inline-flex items-center gap-1.5 ${
                                        s.status === 'approved' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                                        s.status === 'pending' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                                        'bg-rose-50 text-rose-600 border border-rose-100'
                                    }`}>
                                        <div className={`w-1 h-1 rounded-full ${
                                            s.status === 'approved' ? 'bg-emerald-500' :
                                            s.status === 'pending' ? 'bg-blue-500 animate-pulse' :
                                            'bg-rose-500'
                                        }`} />
                                        {s.status}
                                    </span>
                                </td>
                                <td className="p-5 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <button 
                                            onClick={() => setViewingSupplier(s)}
                                            className="p-3 bg-slate-100 text-slate-400 rounded-sm hover:bg-slate-900 hover:text-white transition-all shadow-sm"
                                            title="View Detail"
                                        >
                                            <Eye size={14} />
                                        </button>
                                        <button 
                                            onClick={() => handleEditInit(s)}
                                            className="p-3 bg-slate-100 text-slate-400 rounded-sm hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                                            title="Edit"
                                        >
                                            <RotateCw size={14} />
                                        </button>
                                        <button 
                                            onClick={() => handleDelete(s._id)}
                                            className="p-3 bg-slate-100 text-slate-400 rounded-sm hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                                            title="Delete"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {suppliers.length === 0 && !loading && (
                            <tr>
                                <td colSpan="5" className="p-20 text-center">
                                    <div className="max-w-xs mx-auto">
                                        <Factory size={40} className="mx-auto mb-4 text-slate-200" />
                                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">No Suppliers Onboarded</h4>
                                        <p className="text-[10px] font-bold text-slate-300 uppercase mt-2">Active supplier registrations will appear here for verification.</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      </div>
    </div>
  );
}
