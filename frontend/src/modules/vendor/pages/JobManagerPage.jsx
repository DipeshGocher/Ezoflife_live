import { appDialog } from '../../../shared/stores/appDialogStore';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { jobApi, UPLOADS_URL } from '../../../lib/api';
import toast from 'react-hot-toast';
import VendorHeader from '../components/VendorHeader';

const JobManagerPage = () => {
    const navigate = useNavigate();
    const [jobs, setJobs] = useState([]);
    const [applications, setApplications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [viewMode, setViewMode] = useState('Jobs'); // 'Jobs' or 'Applications'
    
    // Form State
    const [form, setForm] = useState({
        title: '',
        description: '',
        requirements: '',
        location: '',
        type: 'Full-time',
        salary: ''
    });

    const vendorData = JSON.parse(localStorage.getItem('vendorData') || localStorage.getItem('user') || '{}');
    const vendorId = vendorData?._id || vendorData?.id || vendorData?.user?._id || vendorData?.user?.id;

    useEffect(() => {
        fetchData();
    }, [viewMode]);

    const fetchData = async () => {
        setLoading(true);
        if (viewMode === 'Jobs') {
            await fetchJobs();
        } else {
            await fetchApplications();
        }
        setLoading(false);
    };

    const fetchJobs = async () => {
        try {
            const data = await jobApi.getVendorJobs(vendorId);
            setJobs(data);
        } catch (error) {
            console.error('Fetch jobs error:', error);
        }
    };

    const fetchApplications = async () => {
        try {
            const data = await jobApi.getVendorApplications(vendorId);
            setApplications(data);
        } catch (error) {
            console.error('Fetch applications error:', error);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            const requirementsArray = form.requirements.split(',').map(r => r.trim()).filter(r => r !== '');
            const jobData = {
                ...form,
                requirements: requirementsArray,
                companyName: vendorData.shopDetails?.shopName || 'Vendor Laundry',
                vendorId: vendorId,
                creatorRole: 'Vendor'
            };
            await jobApi.create(jobData);
            fetchJobs();
            setIsCreating(false);
            toast.success('Job Posted Successfully!');
            setForm({ title: '', description: '', requirements: '', location: '', type: 'Full-time', salary: '' });
        } catch (error) {
            toast.error('Error creating job');
        }
    };

    const handleUpdateAppStatus = async (id, status) => {
        try {
            await jobApi.updateApplicationStatus(id, status);
            fetchApplications();
            toast.success(`Application ${status} Successfully`);
        } catch (error) {
            toast.error('Status update failed');
        }
    };

    const getStatusStyle = (status) => {
        switch(status) {
            case 'Submitted': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
            case 'Shortlisted': return 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20';
            case 'Interview Scheduled': return 'bg-violet-500/10 text-violet-600 border-violet-500/20';
            case 'Post-Interview Review': return 'bg-sky-500/10 text-sky-600 border-sky-500/20';
            case 'Background Check': return 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20';
            case 'Offer Generation': return 'bg-fuchsia-500/10 text-fuchsia-600 border-fuchsia-500/20';
            case 'Offer Extended': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
            case 'Pre-onboarding': return 'bg-teal-500/10 text-teal-600 border-teal-500/20';
            case 'Rejected': return 'bg-rose-500/10 text-rose-600 border-rose-500/20';
            case 'Candidate Withdrew': return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
            default: return 'bg-slate-100 text-slate-500 border-slate-200';
        }
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-background min-h-screen pb-32">

            <main className="max-w-xl mx-auto px-6 pt-8 space-y-8">
                <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-3xl font-black tracking-tighter text-slate-900 uppercase">Recruitment</h2>
                            <p className="text-[10px] font-black text-slate-400 tracking-[0.3em] uppercase mt-1">
                                {viewMode === 'Jobs' ? 'Manage Your Team Growth' : 'Candidate Interests'}
                            </p>
                        </div>
                        {viewMode === 'Jobs' && (
                            <motion.button 
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setIsCreating(true)}
                                className="w-12 h-12 bg-primary text-white rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20"
                            >
                                <span className="material-symbols-outlined">add</span>
                            </motion.button>
                        )}
                    </div>

                    {/* View Switcher */}
                    <div className="bg-slate-100 p-1.5 rounded-2xl flex w-full">
                        <button 
                            onClick={() => setViewMode('Jobs')}
                            className={`flex-1 py-3 items-center justify-center gap-2 flex rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'Jobs' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
                        >
                            <span className="material-symbols-outlined text-[16px]">work</span>
                            Active Jobs
                        </button>
                        <button 
                            onClick={() => setViewMode('Applications')}
                            className={`flex-1 py-3 items-center justify-center gap-2 flex rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'Applications' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
                        >
                            <span className="material-symbols-outlined text-[16px]">how_to_reg</span>
                            Applications
                            {applications.length > 0 && <span className="w-2 h-2 bg-red-500 rounded-full ml-1" />}
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="py-20 flex flex-col items-center justify-center text-slate-300">
                        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="text-[10px] font-black uppercase tracking-widest tracking-tighter">Syncing Pipeline...</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {viewMode === 'Jobs' ? (
                            <AnimatePresence>
                                {(Array.isArray(jobs) ? jobs : []).map((job) => (
                                    <motion.div 
                                        key={job._id}
                                        layout
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4"
                                    >
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                 <div className="flex items-center gap-2">
                                                     <h3 className="text-lg font-black text-slate-900 leading-none">{job.title}</h3>
                                                     <span className="font-bold text-indigo-600 font-mono text-[9px] bg-indigo-50 px-1.5 py-0.5 rounded shrink-0">
                                                         {job.jobCode || `JOB-${job._id.slice(-4).toUpperCase()}`}
                                                     </span>
                                                 </div>
                                                 <div className="flex items-center gap-2 mt-2">
                                                     <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase border ${getStatusStyle(job.status)}`}>
                                                         {job.status}
                                                     </span>
                                                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{job.type}</span>
                                                 </div>
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 text-slate-500">
                                                <span className="material-symbols-outlined text-sm">location_on</span>
                                                <span className="text-xs font-bold">{job.location}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-slate-500">
                                                <span className="material-symbols-outlined text-sm">payments</span>
                                                <span className="text-xs font-bold">{job.salary}</span>
                                            </div>
                                        </div>

                                        <div className="pt-4 border-t border-slate-50 flex gap-2">
                                            <button 
                                                onClick={async () => {
                                                    if(await appDialog.confirm('Delete this job?')) {
                                                        await jobApi.delete(job._id);
                                                        fetchJobs();
                                                    }
                                                }}
                                                className="px-6 py-3 rounded-xl bg-rose-50 text-rose-500 font-black text-[9px] uppercase tracking-widest"
                                            >
                                                Remove
                                            </button>
                                            <button className="flex-1 py-3 rounded-xl bg-slate-50 text-slate-900 font-black text-[9px] uppercase tracking-widest">
                                                View Details
                                            </button>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        ) : (
                            <AnimatePresence>
                                {(Array.isArray(applications) ? applications : []).map((app) => (
                                    <motion.div 
                                        key={app._id}
                                        layout
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-5"
                                    >
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h4 className="text-lg font-black text-slate-900 tracking-tight leading-none mb-1">{app.applicantName || app.applicant?.displayName}</h4>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                    Interested in <span className="text-primary">{app.job?.title || 'Unknown Role'}</span>
                                                </p>
                                            </div>
                                            <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase border ${getStatusStyle(app.status)}`}>
                                                {app.status}
                                            </span>
                                        </div>

                                        <div className="bg-slate-50 p-4 rounded-3xl grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">Contact</p>
                                                <p className="text-[11px] font-bold text-slate-700">{app.contactNumber}</p>
                                            </div>
                                            <div>
                                                <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">Email</p>
                                                <p className="text-[11px] font-bold text-slate-700 truncate">{app.applicantEmail}</p>
                                            </div>
                                            <div>
                                                <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">Experience</p>
                                                <p className="text-[11px] font-bold text-slate-700 truncate">{app.experience || 'Not specified'}</p>
                                            </div>
                                            <div>
                                                <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">Status</p>
                                                <p className="text-[11px] font-bold text-slate-700 truncate">{app.status}</p>
                                            </div>
                                        </div>

                                        {app.coverLetter && (
                                            <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10">
                                                <p className="text-[8px] font-black text-primary uppercase tracking-widest mb-2 flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-[12px]">chat_bubble</span>
                                                    Cover Note
                                                </p>
                                                <p className="text-[11px] font-medium text-slate-600 leading-relaxed italic">
                                                    "{app.coverLetter}"
                                                </p>
                                            </div>
                                        )}

                                        <div className="flex gap-2">
                                            <a 
                                                href={`${UPLOADS_URL}${app.resumeLink}`} 
                                                target="_blank" 
                                                rel="noreferrer"
                                                className="flex-1 py-3.5 bg-slate-900 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest text-center shadow-lg shadow-slate-900/10 flex items-center justify-center"
                                            >
                                                View Resume
                                            </a>
                                            <div className="flex-1 flex gap-1.5 items-center">
                                                <select
                                                    value={app.status || 'Submitted'}
                                                    onChange={(e) => handleUpdateAppStatus(app._id, e.target.value)}
                                                    className="w-full py-4 px-3 bg-slate-100 text-slate-900 rounded-2xl text-[9px] font-black uppercase tracking-widest border border-transparent focus:bg-white focus:border-slate-900/10 outline-none cursor-pointer text-center"
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
                                            {app.status !== 'Rejected' && app.status !== 'Candidate Withdrew' && (
                                                <button 
                                                    onClick={() => handleUpdateAppStatus(app._id, 'Rejected')}
                                                    className="w-14 h-14 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all shadow-sm shrink-0"
                                                    title="Reject Candidate"
                                                >
                                                    <span className="material-symbols-outlined text-[20px]">close</span>
                                                </button>
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        )}

                        {((viewMode === 'Jobs' && jobs.length === 0) || (viewMode === 'Applications' && applications.length === 0)) && (
                            <div className="py-20 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-100">
                                <span className="material-symbols-outlined text-5xl text-slate-200 mb-4 font-thin">
                                    {viewMode === 'Jobs' ? 'work_outline' : 'groups'}
                                </span>
                                <p className="text-sm font-black text-slate-400 uppercase tracking-widest leading-relaxed">
                                    {viewMode === 'Jobs' ? "No active listings.\nGrow your workforce today." : "No candidates yet.\nYour next hire is coming soon."}
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Create Job Modal */}
            <AnimatePresence>
                {isCreating && (
                    <div className="fixed inset-0 z-[100] flex items-end justify-center">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsCreating(false)}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                        />
                        <motion.div 
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            className="bg-white w-full max-w-xl rounded-t-[3rem] p-8 pb-40 relative z-10 shadow-2xl max-h-[90vh] overflow-y-auto hide-scrollbar"
                        >
                            <div className="flex justify-between items-center mb-8">
                                <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">New Job Post</h3>
                                <button onClick={() => setIsCreating(false)} className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>

                            <form onSubmit={handleCreate} className="space-y-6">
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-2 block">Position Title</label>
                                        <input 
                                            required
                                            value={form.title}
                                            onChange={e => setForm({...form, title: e.target.value})}
                                            className="w-full bg-slate-50 border-transparent focus:bg-white focus:border-primary/20 rounded-[1.5rem] p-5 text-sm font-bold transition-all"
                                            placeholder="e.g. Laundry Associate"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-2 block">Description</label>
                                        <textarea 
                                            required
                                            value={form.description}
                                            onChange={e => setForm({...form, description: e.target.value})}
                                            className="w-full bg-slate-50 border-transparent focus:bg-white focus:border-primary/20 rounded-[1.5rem] p-5 text-sm font-bold transition-all min-h-[120px]"
                                            placeholder="Describe the role and day-to-day tasks..."
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-2 block">Job Type</label>
                                            <select 
                                                value={form.type}
                                                onChange={e => setForm({...form, type: e.target.value})}
                                                className="w-full bg-slate-50 border-transparent rounded-[1.5rem] p-5 text-sm font-bold"
                                            >
                                                <option>Full-time</option>
                                                <option>Part-time</option>
                                                <option>Contract</option>
                                                <option>Internship</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-2 block">Salary</label>
                                            <input 
                                                value={form.salary}
                                                onChange={e => setForm({...form, salary: e.target.value})}
                                                className="w-full bg-slate-50 border-transparent focus:bg-white focus:border-primary/20 rounded-[1.5rem] p-5 text-sm font-bold transition-all"
                                                placeholder="e.g. 15k - 20k"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-2 block">Location</label>
                                        <input 
                                            required
                                            value={form.location}
                                            onChange={e => setForm({...form, location: e.target.value})}
                                            className="w-full bg-slate-50 border-transparent focus:bg-white focus:border-primary/20 rounded-[1.5rem] p-5 text-sm font-bold transition-all"
                                            placeholder="e.g. Sector 43, Gurgaon"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-2 block">Requirements (Comma separated)</label>
                                        <input 
                                            value={form.requirements}
                                            onChange={e => setForm({...form, requirements: e.target.value})}
                                            className="w-full bg-slate-50 border-transparent focus:bg-white focus:border-primary/20 rounded-[1.5rem] p-5 text-sm font-bold transition-all"
                                            placeholder="Experience, Driving, ID Proof"
                                        />
                                    </div>
                                </div>

                                <button 
                                    type="submit"
                                    className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-slate-200 mt-4 active:scale-95 transition-all"
                                >
                                    Broadcast Listing
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default JobManagerPage;
