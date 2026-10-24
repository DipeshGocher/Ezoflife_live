import BrandLogo from '../../../shared/components/BrandLogo.jsx';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { jobApi, UPLOADS_URL } from '../../../lib/api';
import toast from 'react-hot-toast';

const LaborRequestPage = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('Jobs');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [viewingApplication, setViewingApplication] = useState(null);
    const [selectedJobFilter, setSelectedJobFilter] = useState(null);

    // Live Data States
    const [myJobs, setMyJobs] = useState([]);
    const [applications, setApplications] = useState([]);
    
    // Form States
    const [formData, setFormData] = useState({
        title: '',
        category: 'Ironing',
        jobType: 'Full Time',
        description: '',
        experience: 'Fresher',
        salary: '',
        location: '',
        skills: ['Punctual', 'Steam Iron Exp']
    });

    const vendorDataRaw = localStorage.getItem('vendorData') || localStorage.getItem('user') || localStorage.getItem('userData') || '{}';
    const vendorData = JSON.parse(vendorDataRaw);
    const vendorId = vendorData._id || vendorData.id || vendorData.user?._id || vendorData.user?.id;

    const fetchLiveHub = async () => {
        if (!vendorId) {
            setLoading(false);
            return;
        }
        try {
            setLoading(true);
            const [jobsRes, appsRes] = await Promise.all([
                jobApi.getVendorJobs(vendorId),
                jobApi.getVendorApplications(vendorId)
            ]);
            setMyJobs(Array.isArray(jobsRes) ? jobsRes : []);
            setApplications(Array.isArray(appsRes) ? appsRes : []);
        } catch (err) {
            console.error('Hub load error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLiveHub();
    }, [vendorId]);

    const handlePostJob = async () => {
        try {
            await jobApi.create({ ...formData, vendorId });
            setShowCreateModal(false);
            fetchLiveHub();
            toast.success('Job Posted & Broadcasted Successfully!');
        } catch (err) {
            toast.error('Failed to post job');
        }
    };

    return (
        <div className="bg-[#F8FAFC] min-h-screen pb-32 font-body">
            <AnimatePresence mode="wait">
                {loading ? (
                    <motion.div 
                        key="spinzyt-loader-jobhub"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, scale: 1.1 }}
                        className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center gap-8"
                    >
                        <motion.div 
                            animate={{ scale: [1, 1.1, 1], opacity: [0.8, 1, 0.8] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="flex flex-col items-center"
                        >
                            <BrandLogo className="h-36 w-auto" />
                            <div className="flex items-center gap-2 mt-4 bg-indigo-50 px-4 py-2 rounded-full border border-indigo-100">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping"></span>
                                <span className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em]">Staffing Hub Online</span>
                            </div>
                        </motion.div>
                        <div className="w-48 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div 
                                initial={{ x: '-100%' }}
                                animate={{ x: '100%' }}
                                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                                className="w-1/2 h-full bg-indigo-500 rounded-full"
                            />
                        </div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Scanning Talent Pool...</p>
                    </motion.div>
                ) : (
                    <motion.div key="hub-content" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        {/* Header */}
                        <header className="bg-white/80 backdrop-blur-xl sticky top-0 z-50 px-6 py-6 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)} className="p-2 hover:bg-slate-50 rounded-full">
                                    <span className="material-symbols-outlined text-slate-950">arrow_back</span>
                                </motion.button>
                                <div>
                                    <h1 className="text-xl font-black tracking-tight text-slate-900 leading-none">Staffing Hub</h1>
                                </div>
                            </div>
                            <button onClick={() => navigate('/vendor/labor-request/create')} className="w-10 h-10 bg-slate-950 text-white rounded-full flex items-center justify-center shadow-lg shadow-slate-950/20 active:scale-90 transition-all">
                                <span className="material-symbols-outlined">add</span>
                            </button>
                        </header>

                        {/* Tabs */}
                        <div className="px-6 mt-6">
                            <div className="bg-white p-1 rounded-2xl border border-slate-100 flex shadow-sm">
                                {['Jobs', 'Applications'].map((tab) => (
                                    <button 
                                        key={tab}
                                        onClick={() => {
                                            setActiveTab(tab);
                                            if (tab === 'Applications') {
                                                setSelectedJobFilter(null);
                                            }
                                        }}
                                        className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        {tab}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <main className="max-w-xl mx-auto px-6 pt-6 space-y-4">
                            {activeTab === 'Jobs' ? (
                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">My Posted Jobs</h3>
                                    {myJobs.map(job => (
                                        <div key={job._id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm hover:border-slate-200 transition-all group">
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${job.status === 'Active' ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-100 text-slate-500'}`}>
                                                        {job.status}
                                                    </span>
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <h4 className="text-base font-black text-slate-900 tracking-tight">{job.title}</h4>
                                                        <span className="font-bold text-slate-900 font-mono text-[9px] bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                                                            {job.jobCode || `JOB-${job._id.slice(-4).toUpperCase()}`}
                                                        </span>
                                                    </div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{job.category} • Posted on {new Date(job.createdAt).toLocaleDateString()}</p>
                                                </div>
                                                <button className="material-symbols-outlined text-slate-300 hover:text-slate-900">more_vert</button>
                                            </div>
                                            <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                                                <div 
                                                    className="flex items-center gap-2 cursor-pointer"
                                                    onClick={() => {
                                                        setSelectedJobFilter(job._id);
                                                        setActiveTab('Applications');
                                                    }}
                                                >
                                                    <div className="flex -space-x-2">
                                                        {[1,2,3].map(i => <div key={i} className="w-6 h-6 rounded-full border-2 border-white bg-slate-200"></div>)}
                                                    </div>
                                                    <p className="text-[9px] font-black text-slate-900 uppercase tracking-widest hover:underline">{job.applicantsCount || 0} Applicants</p>
                                                </div>
                                                <button 
                                                    onClick={() => {
                                                        setSelectedJobFilter(job._id);
                                                        setActiveTab('Applications');
                                                    }} 
                                                    className="text-[9px] font-black text-slate-900 uppercase tracking-widest hover:underline"
                                                >
                                                    View All
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {selectedJobFilter && (
                                        <div className="flex justify-between items-center bg-slate-100/50 p-4 rounded-[1.5rem] border border-slate-200/50 mb-2">
                                            <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">
                                                {myJobs.find(j => j._id === selectedJobFilter)?.title || 'Selected Job'}
                                            </p>
                                            <button 
                                                onClick={() => setSelectedJobFilter(null)}
                                                className="w-7 h-7 bg-slate-200/60 hover:bg-slate-200 text-slate-600 rounded-full flex items-center justify-center transition-all"
                                                title="Clear Filter"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">close</span>
                                            </button>
                                        </div>
                                    )}

                                    {(() => {
                                        const filteredApps = selectedJobFilter 
                                            ? applications.filter(app => {
                                                const jId = app.job?._id || app.job || app.jobId?._id || app.jobId;
                                                return jId === selectedJobFilter;
                                            })
                                            : applications;

                                        if (filteredApps.length === 0) {
                                            return (
                                                <div className="bg-white p-12 rounded-[2.2rem] border border-slate-100 shadow-sm text-center opacity-40">
                                                    <span className="material-symbols-outlined text-4xl mb-2">inbox</span>
                                                    <p className="text-[10px] font-black uppercase tracking-widest">No applications found</p>
                                                </div>
                                            );
                                        }

                                        return filteredApps.map(app => (
                                            <div 
                                                key={app._id} 
                                                onClick={() => setViewingApplication(app)}
                                                className="bg-white p-5 rounded-[2.2rem] border border-slate-100 shadow-sm flex items-center justify-between group hover:border-slate-200 transition-all cursor-pointer"
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-900 shadow-inner overflow-hidden">
                                                        {app.applicant?.profileImage ? (
                                                            <img src={app.applicant.profileImage} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <span className="material-symbols-outlined">person</span>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-black text-slate-900 tracking-tight">{app.applicantName || app.applicant?.displayName || 'Candidate'}</h4>
                                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest line-clamp-1">For: {app.job?.title || 'Job Posting'}</p>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="text-[8px] font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded-full">{app.experience} Exp</span>
                                                            <span className="text-[8px] font-black text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full flex items-center gap-1 uppercase">
                                                                {app.status}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <button className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-all">
                                                    <span className="material-symbols-outlined text-lg">arrow_forward</span>
                                                </button>
                                            </div>
                                        ));
                                    })()}
                                </div>
                            )}
                        </main>

                        {/* Create Job Modal Overlay (Detailed Form) */}
                        <AnimatePresence>
                            {showCreateModal && (
                                <motion.div 
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                    className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md p-4 sm:p-6 flex items-center justify-center"
                                >
                                    <motion.div 
                                        initial={{ scale: 0.9, y: 50 }} animate={{ scale: 1, y: 0 }}
                                        className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-[0_50px_100px_rgba(0,0,0,0.3)] flex flex-col max-h-[90vh] overflow-hidden"
                                    >
                                        {/* Modal Header */}
                                        <div className="p-8 pb-4 flex justify-between items-center bg-white border-b border-slate-50 relative z-10">
                                            <div>
                                                <h3 className="text-2xl font-black text-slate-900 tracking-tight">Post New Job</h3>
                                                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-1">Fill in the details to find staff</p>
                                            </div>
                                            <button onClick={() => setShowCreateModal(false)} className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-colors">
                                                <span className="material-symbols-outlined">close</span>
                                            </button>
                                        </div>

                                        {/* Scrollable Form Body */}
                                        <div className="flex-1 overflow-y-auto p-8 space-y-6 hide-scrollbar">
                                            {/* Basic Info Section */}
                                            <div className="space-y-4">
                                                <div className="grid grid-cols-1 gap-4">
                                                    <div className="space-y-2">
                                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Job Title</label>
                                                        <div className="relative group">
                                                            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors">work</span>
                                                            <input 
                                                                type="text" 
                                                                value={formData.title}
                                                                onChange={(e) => setFormData({...formData, title: e.target.value})}
                                                                placeholder="e.g. Master Pressman / Ironer" 
                                                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all outline-none" 
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Category</label>
                                                        <select 
                                                            value={formData.category}
                                                            onChange={(e) => setFormData({...formData, category: e.target.value})}
                                                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 focus:bg-white outline-none appearance-none cursor-pointer"
                                                        >
                                                            <option>Ironing</option>
                                                            <option>Washing</option>
                                                            <option>Helper</option>
                                                            <option>Delivery</option>
                                                            <option>Manager</option>
                                                        </select>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Job Type</label>
                                                        <select 
                                                            value={formData.jobType}
                                                            onChange={(e) => setFormData({...formData, jobType: e.target.value})}
                                                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 focus:bg-white outline-none appearance-none cursor-pointer"
                                                        >
                                                            <option>Full Time</option>
                                                            <option>Part Time</option>
                                                            <option>Contract</option>
                                                            <option>Urgent Basis</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Details Section */}
                                            <div className="space-y-4">
                                                <div className="space-y-2">
                                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Job Description</label>
                                                    <textarea 
                                                        rows="4" 
                                                        value={formData.description}
                                                        onChange={(e) => setFormData({...formData, description: e.target.value})}
                                                        placeholder="Describe the responsibilities, working hours, and shop culture..."
                                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all outline-none resize-none"
                                                    ></textarea>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Experience Required</label>
                                                        <select 
                                                            value={formData.experience}
                                                            onChange={(e) => setFormData({...formData, experience: e.target.value})}
                                                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 focus:bg-white outline-none"
                                                        >
                                                            <option>Fresher</option>
                                                            <option>1-2 Years</option>
                                                            <option>3-5 Years</option>
                                                            <option>5+ Years</option>
                                                        </select>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Salary Range (Monthly)</label>
                                                        <div className="relative group">
                                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">₹</span>
                                                            <input 
                                                                type="text" 
                                                                value={formData.salary}
                                                                onChange={(e) => setFormData({...formData, salary: e.target.value})}
                                                                placeholder="15k - 20k" 
                                                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-10 pr-4 text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all outline-none" 
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Location & Requirements Section */}
                                            <div className="space-y-4">
                                                <div className="space-y-2">
                                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Work Location / Shop Address</label>
                                                    <div className="relative group">
                                                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">location_on</span>
                                                        <input 
                                                            type="text" 
                                                            value={formData.location}
                                                            onChange={(e) => setFormData({...formData, location: e.target.value})}
                                                            placeholder="Confirm your shop address" 
                                                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 focus:bg-white outline-none" 
                                                        />
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Key Requirements (Skills)</label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {['Punctual', 'Steam Iron Exp', 'Good Communication', 'Quick Learner'].map(skill => (
                                                            <button key={skill} className="px-3 py-1.5 bg-indigo-50 text-indigo-500 rounded-lg text-[9px] font-black uppercase tracking-tight border border-indigo-100 hover:bg-indigo-500 hover:text-white transition-all">
                                                                {skill}
                                                            </button>
                                                        ))}
                                                        <button className="px-3 py-1.5 bg-slate-100 text-slate-400 rounded-lg text-[9px] font-black uppercase tracking-tight border border-slate-200 border-dashed">
                                                            + Add
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Disclaimer */}
                                            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex gap-3">
                                                <span className="material-symbols-outlined text-amber-500">info</span>
                                                <p className="text-[10px] font-bold text-amber-800 leading-relaxed">
                                                    Your job posting will be broadcasted to the local worker network within 5km of your shop.
                                                </p>
                                            </div>
                                        </div>

                                        {/* Modal Footer */}
                                        <div className="p-8 bg-white border-t border-slate-50 flex gap-4">
                                            <button 
                                                onClick={() => setShowCreateModal(false)} 
                                                className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-slate-200 transition-all"
                                            >
                                                Cancel
                                            </button>
                                            <button 
                                                onClick={handlePostJob} 
                                                className="flex-[1.5] py-4 bg-indigo-500 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl shadow-indigo-500/30 hover:bg-indigo-600 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                            >
                                                Post & Broadcast
                                            </button>
                                        </div>
                                    </motion.div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* View Application Details Modal */}
            <AnimatePresence>
                {viewingApplication && (
                    <div className="fixed inset-0 z-[110] flex items-end justify-center">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setViewingApplication(null)}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
                        />
                        <motion.div 
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            className="bg-white w-full max-w-xl rounded-t-[3.5rem] relative z-10 shadow-2xl max-h-[85vh] overflow-y-auto no-scrollbar"
                        >
                            <div className="p-8 pb-32">
                                <div className="flex justify-between items-start mb-8">
                                    <div className="flex items-center gap-4">
                                        <div className="w-16 h-16 bg-slate-100 rounded-[2rem] flex items-center justify-center text-slate-900 overflow-hidden shadow-inner">
                                            {viewingApplication.applicant?.profileImage ? (
                                                <img src={viewingApplication.applicant.profileImage} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="material-symbols-outlined text-3xl">person</span>
                                            )}
                                        </div>
                                        <div>
                                            <h3 className="text-2xl font-black text-slate-900 tracking-tighter leading-none">{viewingApplication.applicantName || viewingApplication.applicant?.displayName}</h3>
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-2">Candidate Details</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setViewingApplication(null)} className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors">
                                        <span className="material-symbols-outlined">close</span>
                                    </button>
                                </div>

                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-slate-50 p-5 rounded-[2rem] border border-slate-100">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Phone Number</p>
                                            <p className="text-sm font-black text-slate-900">{viewingApplication.contactNumber || 'N/A'}</p>
                                        </div>
                                        <div className="bg-slate-50 p-5 rounded-[2rem] border border-slate-100">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Email Address</p>
                                            <p className="text-sm font-black text-slate-900 truncate">{viewingApplication.applicantEmail || viewingApplication.applicant?.email || 'N/A'}</p>
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 p-6 rounded-[2.5rem] border border-slate-100">
                                        <div className="flex items-center justify-between mb-4">
                                            <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Experience & Profile</p>
                                            <span className="px-3 py-1 bg-slate-950 text-white rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg shadow-slate-950/10">{viewingApplication.experience || 'Fresher'} Exp</span>
                                        </div>
                                        <p className="text-xs text-slate-500 font-bold leading-relaxed italic">
                                            "This candidate is interested in the <span className="text-slate-950 font-black underline">{viewingApplication.job?.title}</span> role. Please review their attached documents before making a decision."
                                        </p>
                                    </div>

                                    {viewingApplication.resumeLink && (
                                        <div className="space-y-3">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Shared Documents</p>
                                            <a 
                                                href={`${UPLOADS_URL}${viewingApplication.resumeLink}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center justify-between bg-slate-950 p-5 rounded-[2rem] text-white group hover:bg-slate-900 transition-all shadow-xl shadow-slate-950/10"
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center">
                                                        <span className="material-symbols-outlined text-white">description</span>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-black uppercase tracking-widest">View Attached Document</p>
                                                        <p className="text-[9px] font-bold text-white/60 mt-0.5 uppercase tracking-widest">Resume / ID Proof</p>
                                                    </div>
                                                </div>
                                                <span className="material-symbols-outlined text-2xl group-hover:translate-x-1 transition-transform">open_in_new</span>
                                            </a>
                                        </div>
                                    )}

                                    {/* Action Select for Vendor (Job Tracking) */}
                                    <div className="space-y-3 pt-4 border-t border-slate-100">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Update Application Status (Job Tracking)</p>
                                        <select
                                            value={viewingApplication.status || 'Submitted'}
                                            onChange={async (e) => {
                                                const val = e.target.value;
                                                try {
                                                    await jobApi.updateApplicationStatus(viewingApplication._id, val);
                                                    toast.success(`Status updated to ${val}`);
                                                    setViewingApplication(null);
                                                    fetchLiveHub();
                                                } catch (err) {
                                                    toast.error('Failed to update status');
                                                }
                                            }}
                                            className="w-full py-4 px-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-800 focus:bg-white outline-none cursor-pointer"
                                        >
                                            <option value="Submitted">Submitted</option>
                                            <option value="Shortlisted">Shortlisted</option>
                                            <option value="Interview Scheduled">Interview Scheduled</option>
                                            <option value="Post-Interview Review">Post-Interview Review</option>
                                            <option value="Background Check">Background Check</option>
                                            <option value="Offer Generation">Offer Generation</option>
                                            <option value="Offer Extended">Offer Extended</option>
                                            <option value="Pre-onboarding">Pre-onboarding</option>
                                            <option value="Rejected">Rejected</option>
                                            <option value="Candidate Withdrew">Candidate Withdrew</option>
                                        </select>
                                    </div>

                                    {/* Candidate Notes for Vendor */}
                                    <div className="space-y-3 pt-4 border-t border-slate-100">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Candidate Notes / Feedback</p>
                                        <textarea
                                            defaultValue={viewingApplication.notes || ''}
                                            onBlur={async (e) => {
                                                const val = e.target.value;
                                                if (val !== (viewingApplication.notes || '')) {
                                                    try {
                                                        await jobApi.updateApplicationNotes(viewingApplication._id, val);
                                                        toast.success('Notes updated successfully');
                                                        // Update the local state
                                                        setViewingApplication(prev => ({ ...prev, notes: val }));
                                                        fetchLiveHub();
                                                    } catch (err) {
                                                        toast.error('Failed to update notes');
                                                    }
                                                }
                                            }}
                                            placeholder="Write notes here (saves automatically on blur)..."
                                            rows={3}
                                            className="w-full py-3 px-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-semibold text-slate-800 focus:bg-white outline-none resize-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default LaborRequestPage;
