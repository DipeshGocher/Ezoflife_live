import BrandLogo from '../../../shared/components/BrandLogo.jsx';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { jobApi, UPLOADS_URL } from '../../../lib/api';
import toast from 'react-hot-toast';

const SupplierLaborRequestPage = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('Jobs');
    const [viewingApplication, setViewingApplication] = useState(null);
    const [selectedJobFilter, setSelectedJobFilter] = useState(null);

    // Live Data States
    const [myJobs, setMyJobs] = useState([]);
    const [applications, setApplications] = useState([]);

    const supplierDataRaw = localStorage.getItem('supplierData') || localStorage.getItem('user') || localStorage.getItem('userData') || '{}';
    const supplierData = JSON.parse(supplierDataRaw);
    const supplierId = supplierData._id || supplierData.id || supplierData.user?._id || supplierData.user?.id;

    const fetchLiveHub = async () => {
        if (!supplierId) {
            setLoading(false);
            return;
        }
        try {
            setLoading(true);
            const [jobsRes, appsRes] = await Promise.all([
                jobApi.getVendorJobs(supplierId),
                jobApi.getVendorApplications(supplierId)
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
    }, [supplierId]);

    return (
        <div className="bg-[#F8FAFC] min-h-screen pb-32 font-body text-slate-900">
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
                             <div className="flex items-center gap-2 mt-4 bg-slate-100 px-4 py-2 rounded-full border border-slate-200">
                                 <span className="w-1.5 h-1.5 rounded-full bg-slate-900 animate-ping"></span>
                                 <span className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">Staffing Hub Online</span>
                             </div>
                         </motion.div>
                         <div className="w-48 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                             <motion.div 
                                 initial={{ x: '-100%' }}
                                 animate={{ x: '100%' }}
                                 transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                                 className="w-1/2 h-full bg-slate-900 rounded-full"
                             />
                         </div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Scanning Talent Pool...</p>
                    </motion.div>
                ) : (
                    <motion.div key="hub-content" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        {/* Header */}
                        <header className="bg-white/80 backdrop-blur-xl sticky top-0 z-40 px-6 py-6 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)} className="p-2 hover:bg-slate-50 rounded-full flex items-center justify-center">
                                    <span className="material-symbols-outlined text-slate-950">arrow_back</span>
                                </motion.button>
                                <div>
                                    <h1 className="text-xl font-black tracking-tight text-slate-900 leading-none">Staffing Hub</h1>
                                </div>
                            </div>
                            <button onClick={() => navigate('/supplier/labor-request/create')} className="w-10 h-10 bg-slate-950 text-white rounded-full flex items-center justify-center shadow-lg shadow-slate-950/20 active:scale-90 transition-all">
                                <span className="material-symbols-outlined">add</span>
                            </button>
                        </header>

                        {/* Tabs */}
                        <div className="px-6 mt-6 max-w-xl mx-auto">
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
                                    {myJobs.length > 0 ? (
                                        myJobs.map(job => (
                                            <div key={job._id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm hover:border-slate-200 transition-all group">
                                                <div className="flex justify-between items-start mb-4">
                                                    <div>
                                                        <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${job.status === 'Active' || job.status === 'Open' ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-100 text-slate-500'}`}>
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
                                        ))
                                    ) : (
                                        <div className="bg-white p-8 rounded-[2rem] border border-slate-100 text-center">
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No jobs posted yet</p>
                                            <button 
                                                onClick={() => navigate('/supplier/labor-request/create')}
                                                className="mt-4 px-5 py-2.5 bg-slate-950 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-black transition-colors shadow-lg shadow-slate-950/20"
                                            >
                                                Post A Requisition
                                            </button>
                                        </div>
                                    )}
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
                                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest line-clamp-1">For: {app.job?.title || app.jobId?.title || 'Job Posting'}</p>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="text-[8px] font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded-full">{app.experience} Exp</span>
                                                            <span className="text-[8px] font-black text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full flex items-center gap-1 uppercase">
                                                                {app.status || 'Submitted'}
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
                    </motion.div>
                )}
            </AnimatePresence>

            {/* View Application Details Modal */}
            <AnimatePresence>
                {viewingApplication && (
                    <div className="fixed inset-0 z-50 flex items-end justify-center">
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
                                            "This candidate is interested in the <span className="text-slate-950 font-black underline">{viewingApplication.job?.title || viewingApplication.jobId?.title}</span> role. Please review their attached documents before making a decision."
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

                                    {/* Action Select for Supplier / Job Tracking */}
                                     <div className="space-y-4 mt-6 pt-6 border-t border-slate-100">
                                         <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Update Application Status (Job Tracking)</p>
                                         <select
                                             value={viewingApplication.status || 'Submitted'}
                                             onChange={async (e) => {
                                                 const val = e.target.value;
                                                 try {
                                                     await jobApi.updateApplicationStatus(viewingApplication._id, val);
                                                     toast.success(`Status updated to ${val}`);
                                                     setViewingApplication({ ...viewingApplication, status: val });
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

                                     {/* Candidate Notes for Supplier */}
                                     <div className="space-y-3 pt-4 border-t border-slate-100">
                                         <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Candidate Notes / Feedback</p>
                                         <textarea
                                             defaultValue={viewingApplication.notes || ''}
                                             onBlur={async (e) => {
                                                 const val = e.target.value;
                                                 if (val !== (viewingApplication.notes || '')) {
                                                     try {
                                                         await jobApi.updateApplicationNotes(viewingApplication._id, val);
                                                         toast.success('Notes updated successfully');
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

export default SupplierLaborRequestPage;
