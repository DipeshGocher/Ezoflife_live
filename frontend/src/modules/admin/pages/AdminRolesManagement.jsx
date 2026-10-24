import MultiSelectFilter from '../components/common/MultiSelectFilter';
import React, { useState, useEffect } from 'react';
import { motion, motion as Motion, AnimatePresence } from 'framer-motion';
import { Plus, X, UserPlus, MapPin, RotateCw } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import { toast } from 'react-hot-toast';
import { BASE_URL } from '../../../lib/api';
import { ADMIN_MODULES, ROLE_PRESETS, FORCED_ACCESS_TYPE, CUSTOM_ROLE } from '../config/adminAccess';

const EMPTY_FORM = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    role: 'Master Admin',
    accessType: 'Read/Write',
    geofences: [],
    permissions: []
};

const formatDate = (value) => value
    ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

export default function AdminRolesManagement() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [submitting, setSubmitting] = useState(false);
    const [resendingId, setResendingId] = useState(null);

    const [admins, setAdmins] = useState([]);
    const [geofences, setGeofences] = useState([]);

    const fetchAdmins = async () => {
        try {
            const token = localStorage.getItem('adminToken');
            const res = await fetch(`${BASE_URL}/admin/sub-admins`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await res.json();
            if (res.ok) {
                const mapped = data.map(adm => ({
                    id: adm._id,
                    name: adm.displayName,
                    email: adm.email,
                    phone: adm.phone,
                    role: adm.adminRole || 'Master Admin',
                    accessType: adm.adminAccessType || 'Read/Write',
                    geofences: adm.geofenceRestrictions?.length > 0 ? adm.geofenceRestrictions : ['All Zones'],
                    inviteStatus: adm.inviteStatus,
                    inviteSentAt: adm.inviteSentAt,
                    inviteAcceptedAt: adm.inviteAcceptedAt,
                    needsResend: adm.needsResend
                }));
                setAdmins(mapped);
            }
        } catch (err) {
            console.error('Error fetching admins:', err);
        }
    };

    const fetchGeofences = async () => {
        try {
            const res = await fetch(`${BASE_URL}/geofence/areas`);
            const data = await res.json();
            setGeofences(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Fetch geofences error:', err);
        }
    };

    useEffect(() => {
        fetchAdmins();
        fetchGeofences();
    }, []);

    const handleGeofenceToggle = (zone) => {
        setFormData(prev => {
            const current = prev.geofences;
            if (current.includes(zone)) {
                return { ...prev, geofences: current.filter(z => z !== zone) };
            } else {
                return { ...prev, geofences: [...current, zone] };
            }
        });
    };

    const handleRoleChange = (role) => {
        setFormData(prev => ({
            ...prev,
            role,
            accessType: FORCED_ACCESS_TYPE[role] || prev.accessType
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (formData.phone.length !== 10) {
            toast.error('Enter a valid 10-digit mobile number');
            return;
        }
        if (formData.role === CUSTOM_ROLE && formData.permissions.length === 0) {
            toast.error('Select at least one module for a custom role');
            return;
        }

        setSubmitting(true);
        try {
            const token = localStorage.getItem('adminToken');
            const res = await fetch(`${BASE_URL}/admin/invite-sub-admin`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || 'Failed to generate invitation');
            }

            await fetchAdmins();
            setIsModalOpen(false);
            setFormData(EMPTY_FORM);

            if (data.emailSent) {
                toast.success(data.message || 'Invitation sent');
            } else {
                toast.error(data.message || 'Invitation saved, but the email could not be sent.');
            }
        } catch (err) {
            toast.error(err.message || 'Something went wrong');
        } finally {
            setSubmitting(false);
        }
    };

    const handleResend = async (adm) => {
        setResendingId(adm.id);
        try {
            const token = localStorage.getItem('adminToken');
            const res = await fetch(`${BASE_URL}/admin/sub-admins/${adm.id}/resend-invite`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || 'Could not resend the invitation');
            toast.success(data.message || 'Invitation re-sent');
            await fetchAdmins();
        } catch (err) {
            toast.error(err.message);
        } finally {
            setResendingId(null);
        }
    };

    const presetModules = ROLE_PRESETS[formData.role];

    return (
        <div className="flex flex-col min-h-[100dvh] bg-slate-50/50 pb-20">
            <PageHeader 
                title="User Roles & Access Control" 
                actions={[
                    {
                        label: "Add New Role",
                        icon: Plus,
                        onClick: () => setIsModalOpen(true),
                        variant: 'primary'
                    }
                ]}
            />

            <div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">
                {/* Admin Roles Grid */}
                <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
                    <div className="px-8 py-6 border-b border-slate-100 bg-white flex justify-between items-center">
                        <div>
                            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Administrative Directory</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Invite admins to a role, set their permissions and geofence scope, and track their invitations.</p>
                        </div>
                    </div>
                    
                    <div className="overflow-x-auto w-full">
                        <table className="w-full text-left border-collapse min-w-[950px]">
                            <thead>
                                <tr className="bg-slate-50/50 border-b border-slate-100">
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Admin Profile</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Assigned Role</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Access Type</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Geofence Scope</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap text-center">Invite Status</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {admins.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-8 py-16 text-center text-xs font-black text-slate-400 uppercase tracking-widest bg-slate-50/10">
                                            No Admins Configured
                                        </td>
                                    </tr>
                                ) : (
                                    admins.map((adm) => (
                                        <tr key={adm.id} className="hover:bg-slate-50/50 transition-colors group">
                                            <td className="px-8 py-5">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 border border-slate-100">
                                                        <span className="material-symbols-outlined text-base">person</span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-black text-slate-900 tracking-tight">{adm.name}</span>
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{adm.email} · {adm.phone}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-5">
                                                <span className="text-xs font-black text-slate-800 tracking-tight">{adm.role}</span>
                                            </td>
                                            <td className="px-8 py-5">
                                                <span className={`inline-flex px-2 py-0.5 rounded-sm text-[8px] font-black uppercase tracking-widest ${adm.accessType === 'Read/Write' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>
                                                    {adm.accessType}
                                                </span>
                                            </td>
                                            <td className="px-8 py-5">
                                                <div className="flex flex-wrap gap-1">
                                                    {adm.geofences.map((gf, idx) => (
                                                        <span key={idx} className="inline-flex px-2 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wider bg-slate-50 text-slate-500 border border-slate-100">
                                                            {gf}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-8 py-5 text-center">
                                                <InviteStatusBadge admin={adm} />
                                            </td>
                                            <td className="px-8 py-5 text-center">
                                                {adm.inviteStatus === 'Invite Pending' ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleResend(adm)}
                                                        disabled={resendingId === adm.id}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-700 cursor-pointer disabled:opacity-50"
                                                    >
                                                        <RotateCw size={12} className={resendingId === adm.id ? 'animate-spin' : ''} />
                                                        {resendingId === adm.id ? 'Sending…' : 'Resend Invite'}
                                                    </button>
                                                ) : (
                                                    <span className="text-[10px] font-bold text-slate-300">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Add New Role Modal */}
            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                        <Motion.form
                            onSubmit={handleSubmit}
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl relative border border-slate-200 max-h-[92vh] flex flex-col overflow-hidden text-left"
                        >
                            {/* Header */}
                            <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/50">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-slate-900 text-white flex items-center justify-center rounded-2xl border border-slate-800 shadow-md">
                                        <UserPlus size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Add New Role</h3>
                                        <p className="text-[8px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">They get an email invite and can log in once they accept.</p>
                                    </div>
                                </div>
                                <button type="button" onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full border border-slate-200 shadow-sm bg-white cursor-pointer">
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Form Fields */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">First Name</label>
                                        <input 
                                            required
                                            type="text"
                                            value={formData.firstName}
                                            onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                                            placeholder="e.g. John"
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs font-bold text-slate-900 focus:bg-white focus:border-slate-900 outline-none transition-all"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Last Name</label>
                                        <input 
                                            required
                                            type="text"
                                            value={formData.lastName}
                                            onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                                            placeholder="e.g. Doe"
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs font-bold text-slate-900 focus:bg-white focus:border-slate-900 outline-none transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Corporate Email</label>
                                    <input 
                                        required
                                        type="email"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="john.doe@company.com"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs font-bold text-slate-900 focus:bg-white focus:border-slate-900 outline-none transition-all"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Mobile Number</label>
                                    <input 
                                        required
                                        type="tel"
                                        maxLength={10}
                                        value={formData.phone}
                                        onChange={e => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '') })}
                                        placeholder="9999999999"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs font-bold text-slate-900 focus:bg-white focus:border-slate-900 outline-none transition-all tracking-widest"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Assigned Role</label>
                                        <select 
                                            value={formData.role}
                                            onChange={e => handleRoleChange(e.target.value)}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs font-bold text-slate-900 outline-none cursor-pointer focus:bg-white focus:border-slate-900 transition-all appearance-none"
                                        >
                                            <option value="Master Admin">Master Admin</option>
                                            <option value="Global Auditor / Developer">Global Auditor / Developer</option>
                                            <option value="Operations & Pricing Lead">Operations & Pricing Lead</option>
                                            <option value="Customer Support Executive">Customer Support Executive</option>
                                            <option value="Logistics & Shipping Coordinator">Logistics & Shipping Coordinator</option>
                                            <option value="Growth & Marketing Admin">Growth & Marketing Admin</option>
                                            <option value="HR">HR</option>
                                            <option value={CUSTOM_ROLE}>Custom Role</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Access Type</label>
                                        <select 
                                            value={formData.accessType}
                                            disabled={!!FORCED_ACCESS_TYPE[formData.role]}
                                            onChange={e => setFormData({ ...formData, accessType: e.target.value })}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs font-bold text-slate-900 outline-none cursor-pointer focus:bg-white focus:border-slate-900 transition-all appearance-none"
                                        >
                                            <option value="Read/Write">Read/Write Access</option>
                                            <option value="Read-Only">Read-Only Access</option>
                                        </select>
                                    </div>
                                </div>

                                {formData.role !== CUSTOM_ROLE && (
                                    <div className="space-y-2 bg-slate-50 p-4 rounded-3xl border border-slate-100">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Permitted Modules for this Role</label>
                                        <div className="flex flex-wrap gap-1.5 mt-1">
                                            {(presetModules || [formData.role === 'Master Admin' ? 'All Modules + Admin Roles' : 'All Modules']).map(perm => (
                                                <span key={perm} className="px-2.5 py-1 bg-white border border-slate-200/80 rounded-xl text-[9px] font-bold text-slate-800 uppercase tracking-wider shadow-sm">
                                                    {perm}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {formData.role === CUSTOM_ROLE && (
                                    <div className="space-y-3">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Custom Module Permissions</label>
                                        <div className="grid grid-cols-2 gap-2 bg-slate-50 p-4 rounded-3xl border border-slate-100 max-h-48 overflow-y-auto">
                                            {ADMIN_MODULES.map(module => (
                                                <label key={module} className="flex items-center gap-2 cursor-pointer p-2 hover:bg-white rounded-xl transition-all">
                                                    <input 
                                                        type="checkbox"
                                                        checked={formData.permissions?.includes(module)}
                                                        onChange={() => {
                                                            setFormData(prev => {
                                                                const current = prev.permissions || [];
                                                                if (current.includes(module)) {
                                                                    return { ...prev, permissions: current.filter(m => m !== module) };
                                                                } else {
                                                                    return { ...prev, permissions: [...current, module] };
                                                                }
                                                            });
                                                        }}
                                                        className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/20 cursor-pointer"
                                                    />
                                                    <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">{module}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-3">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Geofence Restrictions (Scoping)</label>
                                    <MultiSelectFilter
                                        aria-label="Geofence restrictions"
                                        emptyLabel="All locations (no restrictions)"
                                        value={formData.geofences}
                                        onChange={event => setFormData(prev => ({ ...prev, geofences: Array.isArray(event.target.value) ? event.target.value : [] }))}
                                        disabled={geofences.length === 0}
                                        className="w-full bg-slate-50 px-4 py-3.5 rounded-2xl border border-slate-100 text-[11px] font-bold text-slate-800 outline-none focus:border-slate-300 transition-all"
                                    >
                                        <option value="">All locations (no restrictions)</option>
                                        {geofences.map(gf => {
                                            const zoneName = gf.areaName || gf.name;
                                            return zoneName ? <option key={gf._id || zoneName} value={zoneName}>{zoneName}</option> : null;
                                        })}
                                    </MultiSelectFilter>
                                    <p className="text-[10px] text-slate-400 ml-1">{geofences.length ? 'Search and select multiple locations. Leave empty for access to all locations.' : 'No geofences available.'}</p>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="flex gap-4 p-6 border-t border-slate-100 bg-slate-50 sticky bottom-0 z-10">
                                <button 
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="w-1/3 bg-white hover:bg-slate-50 text-slate-500 py-3.5 rounded-2xl font-bold text-[10px] uppercase tracking-wider transition-all border border-slate-200 cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    disabled={submitting}
                                    className="w-2/3 disabled:opacity-50 bg-slate-950 hover:bg-black text-white py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-slate-900/10 transition-all border border-slate-900 cursor-pointer"
                                >
                                    {submitting ? 'Sending Invitation…' : 'Generate Invitation'}
                                </button>
                            </div>
                        </Motion.form>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

function InviteStatusBadge({ admin }) {
    const styles = {
        'Invite Pending': { box: 'bg-amber-50 text-amber-600 border-amber-100', dot: 'bg-amber-500' },
        'Accepted': { box: 'bg-emerald-50 text-emerald-600 border-emerald-100', dot: 'bg-emerald-500' },
        'Active': { box: 'bg-emerald-50 text-emerald-600 border-emerald-100', dot: 'bg-emerald-500' }
    };
    const style = styles[admin.inviteStatus] || styles['Invite Pending'];
    const detail = admin.inviteStatus === 'Invite Pending'
        ? (admin.needsResend ? 'Old link no longer works — resend' : admin.inviteSentAt && `Sent ${formatDate(admin.inviteSentAt)}`)
        : admin.inviteAcceptedAt && `Accepted ${formatDate(admin.inviteAcceptedAt)}`;

    return (
        <div className="flex flex-col items-center gap-1">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border whitespace-nowrap ${style.box}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                {admin.inviteStatus}
            </span>
            {detail && <span className="text-[9px] font-bold text-slate-400 whitespace-nowrap">{detail}</span>}
        </div>
    );
}
