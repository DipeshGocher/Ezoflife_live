import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { mediaApi } from '../../../lib/api';
import toast from 'react-hot-toast';

const MediaConfig = () => {
    const [history, setHistory] = useState([]);
    const [inquiries, setInquiries] = useState([]);
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [historyData, inquiryData] = await Promise.all([
                mediaApi.getHistory(),
                mediaApi.getAllInquiries()
            ]);
            setHistory(historyData);
            setInquiries(inquiryData);
        } catch (error) {
            toast.error('Failed to fetch data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile && selectedFile.type === 'application/pdf') {
            setFile(selectedFile);
        } else {
            toast.error('Please select a valid PDF file');
            e.target.value = null;
        }
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!file) {
            toast.error('Select a file first');
            return;
        }

        const formData = new FormData();
        formData.append('media', file);

        try {
            setUploading(true);
            await mediaApi.upload(formData);
            toast.success('Media Kit uploaded successfully!');
            setFile(null);
            const fileInput = document.getElementById('media-upload');
            if (fileInput) fileInput.value = null;
            await fetchData();
        } catch (error) {
            toast.error(error.message || 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="p-8 space-y-8 max-w-6xl mx-auto">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-black tracking-tighter text-slate-900 leading-none">Media Management</h1>
                    <p className="text-sm text-slate-500 font-medium mt-2">Manage customer media kits and promotional assets</p>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Upload Section */}
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="lg:col-span-1 bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 h-fit"
                >
                    <h3 className="text-lg font-black text-slate-900 mb-6">Upload New Media Kit</h3>
                    <form onSubmit={handleUpload} className="space-y-6">
                        <div className="relative group">
                            <input 
                                type="file" 
                                id="media-upload"
                                onChange={handleFileChange}
                                accept=".pdf"
                                className="hidden" 
                            />
                            <label 
                                htmlFor="media-upload"
                                className="w-full flex flex-col items-center justify-center gap-4 py-12 px-6 border-2 border-dashed border-slate-200 rounded-[2rem] bg-slate-50 hover:bg-primary/5 hover:border-primary/20 transition-all cursor-pointer group"
                            >
                                <div className="w-14 h-14 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-primary transition-colors">
                                    <span className="material-symbols-outlined text-[32px]">upload_file</span>
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-bold text-slate-700">{file ? file.name : 'Select PDF File'}</p>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Maximum 10MB allowed</p>
                                </div>
                            </label>
                        </div>

                        <button 
                            type="submit"
                            aria-label={uploading ? 'Uploading media kit' : 'Publish Media Kit'}
                            disabled={uploading || !file}
                            className={`w-full py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 transition-all ${
                                uploading || !file ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-primary text-white hover:scale-105 shadow-primary/20'
                            }`}
                        >
                            {uploading ? (
                                <>
                                    <span className="animate-spin material-symbols-outlined text-sm">sync</span>
                                    Uploading...
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-sm">publish</span>
                                    Publish Media Kit
                                </>
                            )}
                        </button>
                    </form>
                </motion.div>

                {/* History Section */}
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="lg:col-span-2 bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden min-h-[500px]"
                >
                    <div className="p-8 border-b border-slate-50 flex justify-between items-center">
                        <h3 className="text-lg font-black text-slate-900">Upload History</h3>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{history.length} Version(s)</span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Document</th>
                                    <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Upload Date</th>
                                    <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                                    <th className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Link</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                <AnimatePresence>
                                    {history.map((item, idx) => (
                                        <motion.tr 
                                            key={item._id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="hover:bg-slate-50/50 transition-colors"
                                        >
                                            <td className="px-8 py-6">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center">
                                                        <span className="material-symbols-outlined text-xl italic">picture_as_pdf</span>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-800 truncate max-w-[200px]">{item.fileName}</p>
                                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">PDF Document</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-6">
                                                <p className="text-xs font-bold text-slate-600">{new Date(item.uploadedAt).toLocaleDateString()}</p>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{new Date(item.uploadedAt).toLocaleTimeString()}</p>
                                            </td>
                                            <td className="px-8 py-6">
                                                {idx === 0 ? (
                                                    <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-black rounded-full uppercase tracking-widest border border-emerald-100">Live</span>
                                                ) : (
                                                    <span className="px-3 py-1 bg-slate-100 text-slate-400 text-[10px] font-black rounded-full uppercase tracking-widest">Archived</span>
                                                )}
                                            </td>
                                            <td className="px-8 py-6 text-right text-slate-800">
                                                <a 
                                                    href={item.fileUrl} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-primary hover:bg-primary/10 transition-colors"
                                                >
                                                    <span className="material-symbols-outlined">open_in_new</span>
                                                </a>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                                {history.length === 0 && !loading && (
                                    <tr>
                                        <td colSpan="4" className="px-8 py-32 text-center text-slate-300">
                                            <span className="material-symbols-outlined text-6xl mb-4">cloud_off</span>
                                            <p className="text-[11px] font-black uppercase tracking-widest">No documents uploaded yet</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </motion.div>
            </div>

            {/* Inquiries Section */}
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden"
            >
                <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-900">
                    <div>
                        <h3 className="text-lg font-black text-white">Campaign Inquiries</h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Direct leads from Advertise page</p>
                    </div>
                    <span className="px-3 py-1 bg-white/10 text-white text-[10px] font-black rounded-full uppercase tracking-widest">{inquiries.length} Lead(s)</span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Brand / Company</th>
                                <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact</th>
                                <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Budget</th>
                                <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Timeline</th>
                                <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Date Received</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {inquiries.map((inquiry) => (
                                <tr key={inquiry._id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-900 flex items-center justify-center font-black text-xs">
                                                {inquiry.brandName.charAt(0).toUpperCase()}
                                            </div>
                                            <p className="text-sm font-bold text-slate-800">{inquiry.brandName}</p>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-2 text-primary font-black text-xs">
                                            <span className="material-symbols-outlined text-sm">call</span>
                                            {inquiry.phone}
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-black text-slate-900">₹{inquiry.budget.toLocaleString()}</span>
                                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Monthly Spend</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <span className="px-3 py-1 bg-primary/5 text-primary text-[10px] font-black rounded-full uppercase tracking-widest border border-primary/10">
                                            {inquiry.timeline}
                                        </span>
                                    </td>
                                    <td className="px-8 py-6">
                                        <p className="text-xs font-bold text-slate-600">{new Date(inquiry.createdAt).toLocaleDateString()}</p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{new Date(inquiry.createdAt).toLocaleTimeString()}</p>
                                    </td>
                                </tr>
                            ))}
                            {inquiries.length === 0 && !loading && (
                                <tr>
                                    <td colSpan="4" className="px-8 py-32 text-center text-slate-300">
                                        <span className="material-symbols-outlined text-6xl mb-4">analytics</span>
                                        <p className="text-[11px] font-black uppercase tracking-widest">No advertisement inquiries yet</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </motion.div>
        </div>
    );
};

export default MediaConfig;
