import { appDialog } from '../../../shared/stores/appDialogStore';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { jobApi } from '../../../lib/api';
import PageHeader from '../components/common/PageHeader';
import DataGrid from '../components/tables/DataGrid';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { 
    Plus, Edit2, Trash2, Check, X, AlertCircle, FileText, BadgeCheck, ListOrdered
} from 'lucide-react';

export default function RoleDetails() {
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Modal states
    const [isCreating, setIsCreating] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);

    // Form states
    const [roleName, setRoleName] = useState('');
    const [description, setDescription] = useState('');
    const [responsibilities, setResponsibilities] = useState(['']); // Array of bullet points
    const [targetRole, setTargetRole] = useState('Vendor');

    useEffect(() => {
        fetchTemplates();
    }, []);

    const fetchTemplates = async () => {
        try {
            setLoading(true);
            const data = await jobApi.getRoleTemplates();
            setTemplates(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Fetch role templates error:', error);
            toast.error('Failed to load role templates.');
        } finally {
            setLoading(false);
        }
    };

    const getWordCount = (text) => {
        return text.trim().split(/\s+/).filter(w => w.length > 0).length;
    };

    const hasInvalidResponsibilities = () => {
        return responsibilities.some(resp => getWordCount(resp) > 50 || resp.trim() === '');
    };

    const handleAddResponsibilityField = () => {
        setResponsibilities([...responsibilities, '']);
    };

    const handleRemoveResponsibilityField = (index) => {
        if (responsibilities.length === 1) {
            setResponsibilities(['']);
            return;
        }
        const updated = responsibilities.filter((_, idx) => idx !== index);
        setResponsibilities(updated);
    };

    const handleResponsibilityChange = (index, value) => {
        const updated = [...responsibilities];
        updated[index] = value;
        setResponsibilities(updated);
    };

    const resetForm = () => {
        setRoleName('');
        setDescription('');
        setResponsibilities(['']);
        setTargetRole('Vendor');
    };

    const handleCreateTemplate = async (e) => {
        e.preventDefault();
        
        if (!roleName.trim() || !description.trim()) {
            toast.error('Please enter Role Name and Description.');
            return;
        }

        if (targetRole !== 'Admin' && hasInvalidResponsibilities()) {
            toast.error('Please ensure all responsibilities are filled and under 50 words.');
            return;
        }

        try {
            const cleanResponsibilities = targetRole === 'Admin' ? [] : responsibilities.map(r => r.trim()).filter(r => r !== '');
            const response = await jobApi.createRoleTemplate({
                name: roleName,
                description,
                responsibilities: cleanResponsibilities,
                targetRole
            });

            if (response.message) {
                toast.error(response.message);
                return;
            }

            toast.success('Role template created successfully!');
            setIsCreating(false);
            resetForm();
            fetchTemplates();
        } catch (error) {
            console.error('Create template error:', error);
            toast.error('Failed to create role template.');
        }
    };

    const handleEditClick = (template) => {
        setEditingTemplate(template);
        setRoleName(template.name);
        setDescription(template.description);
        setResponsibilities(template.responsibilities.length > 0 ? template.responsibilities : ['']);
        setTargetRole(template.targetRole || 'Vendor');
        setIsEditing(true);
    };

    const handleUpdateTemplate = async (e) => {
        e.preventDefault();

        if (!roleName.trim() || !description.trim()) {
            toast.error('Please enter Role Name and Description.');
            return;
        }

        if (targetRole !== 'Admin' && hasInvalidResponsibilities()) {
            toast.error('Please ensure all responsibilities are filled and under 50 words.');
            return;
        }

        try {
            const cleanResponsibilities = targetRole === 'Admin' ? [] : responsibilities.map(r => r.trim()).filter(r => r !== '');
            const response = await jobApi.updateRoleTemplate(editingTemplate._id, {
                name: roleName,
                description,
                responsibilities: cleanResponsibilities,
                targetRole
            });

            if (response.message) {
                toast.error(response.message);
                return;
            }

            toast.success('Role template updated successfully!');
            setIsEditing(false);
            setEditingTemplate(null);
            resetForm();
            fetchTemplates();
        } catch (error) {
            console.error('Update template error:', error);
            toast.error('Failed to update role template.');
        }
    };

    const handleDeleteTemplate = async (id) => {
        if (!await appDialog.confirm('Are you sure you want to delete this role template?')) return;

        try {
            const response = await jobApi.deleteRoleTemplate(id);
            if (response.message === 'Role template deleted successfully') {
                toast.success('Role template deleted successfully.');
                fetchTemplates();
            } else {
                toast.error(response.message || 'Failed to delete template.');
            }
        } catch (error) {
            console.error('Delete template error:', error);
            toast.error('Error deleting template.');
        }
    };

    const handleDownloadExcel = () => {
        const exportData = templates.map(t => ({
            'Role Name': t.name,
            'Target Role': t.targetRole || 'Vendor',
            'Description': t.description,
            'Responsibilities': t.responsibilities.join('; ')
        }));
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Role Templates');
        XLSX.writeFile(wb, 'Role_Templates_Master.xlsx');
    };

    const columns = [
        {
            header: 'Role Name',
            key: 'name',
            sortable: true,
            width: '15%',
            render: (val) => <span className="font-bold text-slate-900">{val}</span>
        },
        {
            header: 'Target Role',
            key: 'targetRole',
            width: '10%',
            render: (val) => (
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                    val === 'Supplier' 
                        ? 'bg-purple-50 text-purple-600 border border-purple-100' 
                        : val === 'Both' 
                        ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' 
                        : val === 'Admin' 
                        ? 'bg-rose-50 text-rose-600 border border-rose-100' 
                        : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                }`}>
                    {val || 'Vendor'}
                </span>
            )
        },
        {
            header: 'Description',
            key: 'description',
            width: '40%',
            render: (val) => (
                <p className="line-clamp-2 text-slate-500 font-medium leading-relaxed" title={val}>
                    {val}
                </p>
            )
        },
        {
            header: 'Responsibilities (Bullet Points)',
            key: 'responsibilities',
            width: '30%',
            render: (val) => (
                <div className="space-y-1 py-1">
                    {Array.isArray(val) && val.map((resp, i) => (
                        <div key={i} className="flex items-start gap-2">
                            <span className="w-1 h-1 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                            <span className="text-[11px] text-slate-600 font-medium leading-tight">{resp}</span>
                        </div>
                    ))}
                </div>
            )
        },
        {
            header: 'Actions',
            key: '_id',
            width: '10%',
            render: (val, row) => (
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => handleEditClick(row)}
                        className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-sm transition-all"
                        title="Edit Template"
                    >
                        <Edit2 size={13} />
                    </button>
                    <button
                        onClick={() => handleDeleteTemplate(val)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-sm transition-all"
                        title="Delete Template"
                    >
                        <Trash2 size={13} />
                    </button>
                </div>
            )
        }
    ];

    return (
        <div className="p-6 space-y-6">
            <PageHeader 
                title="Role Details Master" 
                subtitle="Configure predefined role templates, descriptions, and bullet-point responsibilities."
            />

            {/* Table Content */}
            <div className="space-y-4">
                <DataGrid 
                    title="Role Templates Directory"
                    columns={columns}
                    data={templates}
                    loading={loading}
                    onDownload={handleDownloadExcel}
                    showFilter={false}
                    showSearch={false}
                    actions={
                        <button
                            onClick={() => { resetForm(); setIsCreating(true); }}
                            className="flex items-center gap-2 px-3 py-1.5 bg-slate-950 text-white rounded-sm text-[10px] font-bold uppercase tracking-widest hover:bg-slate-800 transition-all shadow-sm"
                        >
                            <Plus size={12} />
                            Add Template
                        </button>
                    }
                />
            </div>

            {/* CREATE / EDIT MODAL */}
            <AnimatePresence>
                {(isCreating || isEditing) && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        {/* Backdrop */}
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => { setIsCreating(false); setIsEditing(false); setEditingTemplate(null); resetForm(); }}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        />

                        {/* Centered Modal */}
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="relative w-full max-w-xl bg-white shadow-2xl flex flex-col z-10 border border-slate-200 rounded-[2rem] max-h-[90vh] overflow-hidden"
                        >
                            {/* Drawer Header */}
                            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                <div>
                                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-[0.25em]">
                                        {isEditing ? 'Modify Role Template' : 'Configure New Role Template'}
                                    </h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                        Fill in role credentials, description, and responsibilities.
                                    </p>
                                </div>
                                <button 
                                    onClick={() => { setIsCreating(false); setIsEditing(false); setEditingTemplate(null); resetForm(); }}
                                    className="w-8 h-8 rounded-sm hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-900 transition-all"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Drawer Form Body */}
                            <form 
                                onSubmit={isEditing ? handleUpdateTemplate : handleCreateTemplate} 
                                className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar"
                            >
                                {/* Role Name */}
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-0.5">Role Name (Unique) *</label>
                                    <div className="relative">
                                        <input 
                                            type="text" 
                                            required
                                            value={roleName}
                                            onChange={(e) => setRoleName(e.target.value)}
                                            placeholder="e.g. Ironing Specialist"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-sm px-4 py-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-slate-400 transition-all outline-none"
                                        />
                                    </div>
                                </div>

                                {/* Target Role Selection */}
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-0.5">Target Role *</label>
                                    <select
                                        value={targetRole}
                                        onChange={(e) => setTargetRole(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-sm px-4 py-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-slate-400 transition-all outline-none cursor-pointer"
                                    >
                                        <option value="Vendor">Vendor Only</option>
                                        <option value="Supplier">Supplier Only</option>
                                        <option value="Admin">Admin Only</option>
                                        <option value="Both">Both (Vendor & Supplier)</option>
                                    </select>
                                </div>

                                {/* Description */}
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-0.5">Role Description *</label>
                                    <textarea 
                                        required
                                        rows="4"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="Describe the overall scope, expectations, and core mission of this role..."
                                        className="w-full bg-slate-50 border border-slate-200 rounded-sm px-4 py-3 text-xs font-bold text-slate-700 focus:bg-white focus:border-slate-400 transition-all outline-none resize-none leading-relaxed"
                                    />
                                </div>

                                {/* Responsibilities Bullet Points List (Only for Vendor/Supplier, not Admin) */}
                                {targetRole !== 'Admin' && (
                                    <div className="space-y-4 pt-2 border-t border-slate-100">
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                                <ListOrdered size={14} className="text-slate-900" />
                                                <label className="text-[9px] font-black text-slate-900 uppercase tracking-widest">Responsibilities (Bullet Points) *</label>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleAddResponsibilityField}
                                                className="flex items-center gap-1.5 text-[9px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-wider transition-all"
                                            >
                                                <Plus size={10} />
                                                Add Bullet
                                            </button>
                                        </div>

                                        <div className="space-y-3">
                                            {responsibilities.map((resp, index) => {
                                                const wordCount = getWordCount(resp);
                                                const isOverLimit = wordCount > 50;

                                                return (
                                                    <div key={index} className="space-y-1.5 p-3.5 bg-slate-50 border border-slate-100 rounded-sm relative">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Bullet Point #{index + 1}</span>
                                                            <div className="flex items-center gap-3">
                                                                <span className={`text-[8px] font-black uppercase tracking-wider ${isOverLimit ? 'text-red-500 font-black animate-pulse' : 'text-slate-400'}`}>
                                                                    {wordCount} / 50 Words
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRemoveResponsibilityField(index)}
                                                                    className="text-slate-400 hover:text-red-600 transition-colors"
                                                                    title="Delete Bullet"
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <textarea
                                                            required
                                                            rows="2"
                                                            value={resp}
                                                            onChange={(e) => handleResponsibilityChange(index, e.target.value)}
                                                            placeholder={`e.g. Clean and press all garments to quality specifications...`}
                                                            className={`w-full bg-white border rounded-sm px-3 py-2 text-xs font-bold text-slate-700 focus:border-slate-400 transition-all outline-none resize-none leading-relaxed ${isOverLimit ? 'border-red-300 focus:border-red-400' : 'border-slate-200'}`}
                                                        />
                                                        {isOverLimit && (
                                                            <div className="flex items-center gap-1.5 text-red-500 mt-1">
                                                                <AlertCircle size={10} />
                                                                <span className="text-[8px] font-bold uppercase tracking-wider">Warning: Exceeds maximum allowance of 50 words!</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </form>

                            {/* Drawer Footer Actions */}
                            <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => { setIsCreating(false); setIsEditing(false); setEditingTemplate(null); resetForm(); }}
                                    className="px-4 py-3 border border-slate-200 text-[10px] font-bold uppercase tracking-widest rounded-sm bg-white hover:bg-slate-100 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                     type="button"
                                     disabled={(!roleName.trim() || !description.trim()) || (targetRole !== 'Admin' && hasInvalidResponsibilities())}
                                     onClick={isEditing ? handleUpdateTemplate : handleCreateTemplate}
                                     className={`px-6 py-3 text-white rounded-sm text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                                         (roleName.trim() && description.trim() && (targetRole === 'Admin' || !hasInvalidResponsibilities()))
                                             ? 'bg-slate-950 hover:bg-slate-800 shadow-md shadow-slate-900/10 active:scale-95'
                                             : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                     }`}
                                >
                                    <Check size={12} />
                                    {isEditing ? 'Update Template' : 'Create Template'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
