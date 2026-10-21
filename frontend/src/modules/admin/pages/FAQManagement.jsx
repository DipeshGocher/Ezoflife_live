import { appDialog } from '../../../shared/stores/appDialogStore';
import React, { useState, useEffect } from 'react';
import { faqApi } from '../../../lib/api';
import PageHeader from '../components/common/PageHeader';
import { PlusCircle, HelpCircle, Save, Video, Edit2, GripVertical } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import StatusBadge from '../components/common/StatusBadge';

const FAQManagement = () => {
    const [faqs, setFaqs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newFaq, setNewFaq] = useState({ question: '', answer: '', category: 'General', targetRole: 'All', youtubeUrl: '' });
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [draggedIndex, setDraggedIndex] = useState(null);

    const handleDragStart = (e, index) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        // HTML5 drag standard setup
        e.dataTransfer.setData('text/html', e.currentTarget);
        e.currentTarget.classList.add('opacity-40', 'border-primary/50', 'scale-[0.98]');
    };

    const handleDragOver = (e, index) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;

        const updatedFaqs = [...faqs];
        const draggedItem = updatedFaqs[draggedIndex];
        updatedFaqs.splice(draggedIndex, 1);
        updatedFaqs.splice(index, 0, draggedItem);
        
        setDraggedIndex(index);
        setFaqs(updatedFaqs);
    };

    const handleDragEnd = async (e) => {
        e.currentTarget.classList.remove('opacity-40', 'border-primary/50', 'scale-[0.98]');
        setDraggedIndex(null);
        
        try {
            const orderPayload = faqs.map((faq, index) => ({
                id: faq._id,
                order: index
            }));
            await faqApi.reorder(orderPayload);
        } catch (error) {
            console.error('Save FAQ order error:', error);
        }
    };

    const fetchFaqs = async () => {
        try {
            setLoading(true);
            const data = await faqApi.getAllAdmin();
            setFaqs(data);
        } catch (error) {
            console.error('Fetch FAQs Error:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFaqs();
    }, []);

    const handleSave = async () => {
        if (!newFaq.question || !newFaq.answer) return;
        try {
            if (editingId) {
                await faqApi.update(editingId, newFaq);
                setEditingId(null);
            } else {
                await faqApi.create(newFaq);
            }
            setNewFaq({ question: '', answer: '', category: 'General', targetRole: 'All', youtubeUrl: '' });
            setIsAdding(false);
            fetchFaqs();
        } catch (error) {
            console.error('Save FAQ Error:', error);
        }
    };

    const handleEdit = (faq) => {
        setNewFaq({
            question: faq.question,
            answer: faq.answer,
            category: faq.category || 'General',
            targetRole: faq.targetRole || 'All',
            youtubeUrl: faq.youtubeUrl || ''
        });
        setEditingId(faq._id);
        setIsAdding(true);
    };

    const handleToggleStatus = async (id, newStatus) => {
        try {
            await faqApi.update(id, { isActive: newStatus });
            fetchFaqs();
        } catch (error) {
            console.error('Toggle FAQ Status Error:', error);
        }
    };

    const handleDelete = async (id) => {
        if (!await appDialog.confirm('Delete this FAQ?')) return;
        try {
            await faqApi.delete(id);
            fetchFaqs();
        } catch (error) {
            console.error('Delete FAQ Error:', error);
        }
    };

    return (
        <div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">
            <PageHeader 
                title="FAQ Management" 
                actions={[
                    { 
                        label: isAdding ? 'Cancel' : 'Add New FAQ', 
                        icon: PlusCircle, 
                        variant: isAdding ? 'secondary' : 'primary',
                        onClick: () => {
                            if (isAdding) {
                                setEditingId(null);
                                setNewFaq({ question: '', answer: '', category: 'General', targetRole: 'All', youtubeUrl: '' });
                            }
                            setIsAdding(!isAdding);
                        }
                    }
                ]}
            />

            {/* Add FAQ Form */}
            {isAdding && (
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4 animate-in fade-in slide-in-from-top-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-2 space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Question</label>
                            <input 
                                type="text"
                                value={newFaq.question}
                                onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 focus:border-primary/30 outline-none text-sm font-bold"
                                placeholder="Enter question..."
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Category</label>
                            <select 
                                value={newFaq.category}
                                onChange={(e) => setNewFaq({ ...newFaq, category: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 focus:border-primary/30 outline-none text-sm font-bold"
                            >
                                <option value="General">General</option>
                                <option value="Orders">Orders</option>
                                <option value="Payment">Payment</option>
                                <option value="Shipping">Shipping</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Target Audience</label>
                            <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl w-full">
                                {['All', 'Customer', 'Vendor', 'Supplier'].map((role) => (
                                    <button
                                        key={role}
                                        type="button"
                                        onClick={() => setNewFaq({ ...newFaq, targetRole: role })}
                                        className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${newFaq.targetRole === role ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        {role}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Answer (Rich Text)</label>
                            <div className="quill-wrapper bg-slate-50 rounded-2xl overflow-hidden border border-slate-100 focus-within:border-primary/30 transition-all">
                                <ReactQuill 
                                    theme="snow"
                                    value={newFaq.answer}
                                    onChange={(content) => setNewFaq({ ...newFaq, answer: content })}
                                    placeholder="Type your answer here... (Bold, Lists, Links supported)"
                                    modules={{
                                        toolbar: [
                                            ['bold', 'italic', 'underline'],
                                            [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                                            ['link'],
                                            ['clean']
                                        ],
                                    }}
                                    className="bg-slate-50 border-none"
                                />
                            </div>
                            <style>{`
                                .quill-wrapper .ql-toolbar.ql-snow {
                                    border: none !important;
                                    background: white !important;
                                    border-bottom: 1px solid #f1f5f9 !important;
                                }
                                .quill-wrapper .ql-container.ql-snow {
                                    border: none !important;
                                    min-height: 120px;
                                    font-family: inherit;
                                    font-size: 14px;
                                }
                                .quill-wrapper .ql-editor {
                                    min-height: 120px;
                                }
                            `}</style>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">YouTube Video URL (Optional)</label>
                            <input 
                                type="text"
                                value={newFaq.youtubeUrl}
                                onChange={(e) => setNewFaq({ ...newFaq, youtubeUrl: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 focus:border-primary/30 outline-none text-sm font-bold"
                                placeholder="https://www.youtube.com/watch?v=..."
                            />
                            <p className="text-[8px] text-slate-400 italic">Provide a visual tutorial for this FAQ</p>
                        </div>
                    </div>
                    <button 
                        onClick={handleSave}
                        className="bg-primary text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-primary/20"
                    >
                        <Save size={14} />
                        {editingId ? 'Update FAQ' : 'Save FAQ'}
                    </button>
                </div>
            )}

            {/* FAQ List */}
            <div className="grid gap-4">
                {loading ? (
                    <div className="h-40 flex items-center justify-center text-slate-400 italic">Loading FAQs...</div>
                ) : (
                    faqs.map((faq, index) => (
                        <div 
                            key={faq._id} 
                            draggable={true}
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragOver={(e) => handleDragOver(e, index)}
                            onDragEnd={handleDragEnd}
                            className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-start gap-4 group hover:border-primary/20 transition-all w-full max-w-full overflow-hidden cursor-grab active:cursor-grabbing"
                        >
                            <div className="text-slate-300 hover:text-slate-600 transition-colors cursor-grab active:cursor-grabbing shrink-0 pt-2.5">
                                <GripVertical size={18} />
                            </div>
                            <div className="flex-1 space-y-1 min-w-0">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b border-slate-100 pb-3 mb-3">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">{faq.category}</span>
                                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md ${faq.targetRole === 'Customer' ? 'bg-blue-50 text-blue-600' : faq.targetRole === 'Vendor' ? 'bg-orange-50 text-orange-600' : faq.targetRole === 'Supplier' ? 'bg-purple-50 text-purple-600' : 'bg-slate-50 text-slate-500'}`}>
                                            {faq.targetRole || 'All'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 self-end sm:self-auto">
                                        {faq.isActive !== false ? (
                                            <button 
                                                onClick={() => handleToggleStatus(faq._id, false)}
                                                className="px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors border border-rose-100 cursor-pointer"
                                            >
                                                Deactivate
                                            </button>
                                        ) : (
                                            <button 
                                                onClick={() => handleToggleStatus(faq._id, true)}
                                                className="px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors border border-emerald-100 cursor-pointer"
                                            >
                                                Activate
                                            </button>
                                        )}
                                        <button 
                                            onClick={() => handleEdit(faq)}
                                            className="text-slate-400 hover:text-blue-500 transition-colors p-1.5 hover:bg-slate-50 rounded-lg cursor-pointer"
                                            title="Edit FAQ"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                    </div>
                                </div>
                                <h4 className="text-base font-black text-slate-900 tracking-tight leading-snug">{faq.question}</h4>
                                <div 
                                    className="text-[13px] text-slate-600 font-medium leading-relaxed break-words whitespace-pre-wrap"
                                    dangerouslySetInnerHTML={{ __html: faq.answer }}
                                />
                                {faq.youtubeUrl && (
                                    <div className="flex items-center gap-1.5 mt-2 text-[9px] font-black text-red-500 uppercase tracking-widest">
                                        <span className="material-symbols-outlined text-sm">play_circle</span>
                                        Video Linked
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
                {!loading && faqs.length === 0 && (
                    <div className="h-40 flex flex-col items-center justify-center text-slate-400 gap-2">
                        <HelpCircle size={32} className="opacity-20" />
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-40">No FAQs found. Add one to get started.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FAQManagement;
