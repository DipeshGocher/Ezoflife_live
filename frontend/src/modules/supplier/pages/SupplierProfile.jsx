import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import toast from 'react-hot-toast';
import { authApi } from '../../../lib/api';


const formatSupplierAddress = (address) => {
    if (!address) return 'N/A';
    const pincodeRegex = /^(\d{6})(?:\s*\(Pincode\))?\s*,\s*(.*)$/i;
    const match = address.match(pincodeRegex);
    if (match) {
        const pincode = match[1];
        const restOfAddress = match[2];
        return `${restOfAddress} - ${pincode}`;
    }
    return address;
};

const SupplierProfile = () => {
    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({
        businessName: '',
        email: '',
        phone: '',
        accountHolderName: '',
        accountNumber: '',
        ifscCode: '',
        bankName: ''
    });

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const storedUser = JSON.parse(localStorage.getItem('user') || localStorage.getItem('supplierData') || localStorage.getItem('userData') || '{}');
                const userId = storedUser.id || storedUser._id;

                if (!userId) {
                    navigate('/user/auth');
                    return;
                }

                const data = await authApi.getProfile(userId);
                setUser(data);
                setFormData({
                    businessName: data.supplierDetails?.businessName || '',
                    email: data.email || '',
                    phone: data.phone || '',
                    accountHolderName: data.bankDetails?.accountHolderName || '',
                    accountNumber: data.bankDetails?.accountNumber || '',
                    ifscCode: data.bankDetails?.ifscCode || '',
                    bankName: data.bankDetails?.bankName || ''
                });
            } catch (err) {
                console.error('Profile fetch error:', err);
                toast.error('Failed to load profile');
            } finally {
                setIsLoading(false);
            }
        };

        fetchProfile();
    }, [navigate]);

    const handleSave = async () => {
        const loadingToast = toast.loading('Saving changes...');
        try {
            const userId = user.id || user._id;
            const payload = {
                phone: formData.phone,
                email: formData.email,
                supplierDetails: {
                    ...(user.supplierDetails || {}),
                    businessName: formData.businessName
                },
                bankDetails: {
                    accountHolderName: formData.accountHolderName,
                    accountNumber: formData.accountNumber,
                    ifscCode: formData.ifscCode,
                    bankName: formData.bankName
                }
            };

            const updatedUser = await authApi.updateProfile(userId, payload);
            setUser(updatedUser);

            // Sync updatedUser back to local storage cache to keep it fresh across pages
            const rawStored = localStorage.getItem('user') || localStorage.getItem('supplierData') || localStorage.getItem('userData');
            if (rawStored) {
                try {
                    const parsed = JSON.parse(rawStored);
                    let merged;
                    if (parsed.user) {
                        merged = { ...parsed, user: { ...parsed.user, ...updatedUser } };
                    } else {
                        merged = { ...parsed, ...updatedUser };
                    }
                    localStorage.setItem('user', JSON.stringify(merged));
                    localStorage.setItem('supplierData', JSON.stringify(merged));
                    localStorage.setItem('userData', JSON.stringify(merged));
                } catch (e) {
                    console.error('LocalStorage sync error:', e);
                }
            }

            setIsEditing(false);
            toast.success('Profile updated successfully', { id: loadingToast });
        } catch (err) {
            console.error('Save error:', err);
            toast.error('Failed to save changes', { id: loadingToast });
        }
    };

    const handleSignOut = () => {
        localStorage.clear();
        navigate('/user/auth');
        toast.success('Signed out successfully');
    };

    const handleDocumentUpdate = async (type, file) => {
        if (!file) return;

        const loadingToast = toast.loading(`Updating ${type}...`);
        try {
            const formDataObj = new FormData();
            formDataObj.append('document', file);
            formDataObj.append('type', type);

            const userId = user.id || user._id;
            const updatedUser = await authApi.updateDocuments(userId, formDataObj);

            setUser(updatedUser);
            toast.success(`${type} updated successfully`, { id: loadingToast });
        } catch (err) {
            console.error('Document update error:', err);
            toast.error(`Failed to update ${type}`, { id: loadingToast });
        }
    };

    const handleImageChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const loadingToast = toast.loading('Updating profile image...');
        try {
            const formDataObj = new FormData();
            formDataObj.append('image', file);

            const userId = user.id || user._id;
            const updatedUser = await authApi.updateProfileImage(userId, formDataObj);

            setUser(updatedUser);
            toast.success('Profile image updated', { id: loadingToast });
        } catch (err) {
            console.error('Image upload error:', err);
            toast.error('Failed to update image', { id: loadingToast });
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="w-10 h-10 border-4 border-slate-900 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!user) return null;

    return (
        <div className="text-slate-900 min-h-screen pb-40 font-sans">
            <main className="max-w-md mx-auto px-6 pt-2 space-y-6">

                {/* UNIFIED PROFILE BOX - everything in one card */}
                <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden relative">

                    {!isEditing ? (
                        <div className="absolute top-5 right-5 z-10">
                            <button
                                onClick={() => setIsEditing(true)}
                                className="bg-slate-950 text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-lg hover:bg-slate-900 transition-all"
                            >
                                MANAGE PROFILE
                            </button>
                        </div>
                    ) : (
                        <div className="absolute top-5 right-5 z-10 flex items-center gap-2">
                            <button 
                                onClick={() => {
                                    setIsEditing(false);
                                    setFormData({
                                        businessName: user.supplierDetails?.businessName || '',
                                        email: user.email || '',
                                        phone: user.phone || '',
                                        accountHolderName: user.bankDetails?.accountHolderName || '',
                                        accountNumber: user.bankDetails?.accountNumber || '',
                                        ifscCode: user.bankDetails?.ifscCode || '',
                                        bankName: user.bankDetails?.bankName || ''
                                    });
                                }} 
                                className="text-[8px] font-black text-slate-400 uppercase"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleSave} 
                                className="text-[8px] font-black text-white bg-slate-950 border border-slate-950 px-2 py-1 rounded-lg"
                            >
                                SAVE
                            </button>
                        </div>
                    )}

                    {/* TOP SECTION: Image + Name + Email + Phone */}
                    <section className="p-7 border-b border-slate-50">
                        {/* Profile Image */}
                        <div className="relative group w-fit mb-5">
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleImageChange}
                                accept="image/*"
                                className="hidden"
                            />
                            <div
                                onClick={() => isEditing && fileInputRef.current?.click()}
                                className={`w-20 h-20 rounded-[1.8rem] bg-slate-100 border-2 border-white shadow-lg overflow-hidden relative ${isEditing ? 'cursor-pointer' : ''}`}
                            >
                                <img
                                    src={user.image || "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=200"}
                                    alt="Profile"
                                    className="w-full h-full object-cover"
                                
                                />
                                {isEditing && (
                                    <div className="absolute inset-0 bg-black/25 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="material-symbols-outlined text-white text-xl">photo_camera</span>
                                    </div>
                                )}
                            </div>
                            <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-slate-900 text-white rounded-xl flex items-center justify-center border-2 border-white shadow-lg z-20">
                                <span className="material-symbols-outlined text-[12px]">{user.status === 'approved' ? 'verified' : 'pending'}</span>
                            </div>
                        </div>

                        {/* Name */}
                        <div className="space-y-1 mb-4">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Supplier / Business Name</p>
                            {isEditing ? (
                                <input 
                                    type="text" 
                                    value={formData.businessName} 
                                    onChange={(e) => setFormData({...formData, businessName: e.target.value})} 
                                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3.5 text-xs font-black text-slate-900 outline-none focus:bg-white focus:border-slate-950 transition-all mt-1" 
                                />
                            ) : (
                                <>
                                    <h2 className="text-xl font-black tracking-tight text-slate-950 leading-tight">
                                        {user.supplierDetails?.businessName || user.displayName || 'Supplier Partner'}
                                    </h2>
                                    <span className={`inline-block mt-1 px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border ${user.status === 'approved' ? 'bg-slate-950 text-white border-slate-950' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                        {user.status}
                                    </span>
                                </>
                            )}
                        </div>

                        {/* Email */}
                        <div className="space-y-1 mb-4">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Email Address</p>
                            {isEditing ? (
                                <input 
                                    type="email" 
                                    value={formData.email} 
                                    onChange={(e) => setFormData({...formData, email: e.target.value})} 
                                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3.5 text-xs font-black text-slate-900 outline-none focus:bg-white focus:border-slate-950 transition-all mt-1" 
                                />
                            ) : (
                                <p className="text-[11px] font-black text-slate-950 lowercase">{user.email || 'partner@ezoflife.in'}</p>
                            )}
                        </div>

                        {/* Phone */}
                        <div className="space-y-1">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Mobile Number</p>
                            {isEditing ? (
                                <input 
                                    type="tel" 
                                    value={formData.phone} 
                                    readOnly
                                    title="Your login number can't be changed here"
                                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3.5 text-xs font-black text-slate-400 outline-none cursor-not-allowed mt-1"
                                />
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[14px] text-slate-950" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                                    <p className="text-[11px] font-black text-slate-950">{user.phone}</p>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* SAVED ADDRESS (BUSINESS DETAILS) */}
                    <section className="p-7 border-b border-slate-50 space-y-5">
                        <div className="flex items-center justify-between">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.25em] flex items-center gap-2">
                                <span className="material-symbols-outlined text-[14px]">store</span>
                                Saved Address
                            </p>
                            <button
                                onClick={() => navigate('/supplier/addresses')}
                                className="text-[8px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-950 transition-colors flex items-center gap-1"
                            >
                                Manage Address
                            </button>
                        </div>
                        <div className="grid grid-cols-1 gap-4 pl-1">
                            <div className="space-y-1">
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Shop Name</p>
                                <p className="text-sm font-black text-slate-900 tracking-tight">{user.supplierDetails?.businessName || 'N/A'}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Shop Address</p>
                                <p className="text-xs font-bold text-slate-600 leading-relaxed">{formatSupplierAddress(user.supplierDetails?.address)}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">GST Number</p>
                                    <p className="text-xs font-black text-slate-900 tracking-tight">{user.supplierDetails?.gst || 'Individual'}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Partner Role</p>
                                    <p className="text-xs font-black text-slate-950 tracking-tight flex items-center gap-1 uppercase">
                                        <span className="material-symbols-outlined text-[14px]">check_circle</span> {user.role || 'Supplier'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* BANK DETAILS */}
                    <section className="p-7 bg-slate-50/40 space-y-5">
                        <div className="flex items-center justify-between">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.25em] flex items-center gap-2">
                                <span className="material-symbols-outlined text-[14px]">account_balance</span>
                                Bank Details
                            </p>
                        </div>
                        {isEditing ? (
                            <div className="space-y-4 pl-1">
                                <div className="space-y-1">
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Account Holder</p>
                                    <input 
                                        type="text" 
                                        value={formData.accountHolderName} 
                                        onChange={(e) => setFormData({...formData, accountHolderName: e.target.value})} 
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-xs font-black text-slate-900 outline-none focus:border-slate-950 transition-all mt-1" 
                                    />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Bank Name</p>
                                    <input 
                                        type="text" 
                                        value={formData.bankName} 
                                        onChange={(e) => setFormData({...formData, bankName: e.target.value})} 
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-xs font-black text-slate-900 outline-none focus:border-slate-950 transition-all mt-1" 
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">IFSC Code</p>
                                        <input 
                                            type="text" 
                                            value={formData.ifscCode} 
                                            onChange={(e) => setFormData({...formData, ifscCode: e.target.value})} 
                                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-xs font-black text-slate-900 outline-none focus:border-slate-950 transition-all mt-1" 
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Account Number</p>
                                        <input 
                                            type="text" 
                                            value={formData.accountNumber} 
                                            onChange={(e) => setFormData({...formData, accountNumber: e.target.value})} 
                                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-xs font-black text-slate-900 outline-none focus:border-slate-950 transition-all mt-1" 
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4 pl-1">
                                <div className="space-y-1">
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Account Holder</p>
                                    <p className="text-sm font-black text-slate-900 tracking-tight">{user.bankDetails?.accountHolderName || 'N/A'}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Bank Name</p>
                                        <p className="text-xs font-black text-slate-900 tracking-tight">{user.bankDetails?.bankName || 'N/A'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">IFSC Code</p>
                                        <p className="text-xs font-black text-slate-900 tracking-tight uppercase">{user.bankDetails?.ifscCode || 'N/A'}</p>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Account Number</p>
                                    <p className="text-xs font-black text-slate-900 tracking-[0.15em]">
                                        {user.bankDetails?.accountNumber ? `**** **** ${user.bankDetails.accountNumber.slice(-4)}` : 'N/A'}
                                    </p>
                                </div>
                            </div>
                        )}
                    </section>

                    {/* APP SETTINGS SECTION */}
                    <section className="divide-y divide-slate-50 bg-slate-50/20 border-t border-slate-50">
                        {[
                            { label: 'Privacy Policy', icon: 'security', path: '/user/privacy?role=supplier' },
                            { label: 'Terms & Conditions', icon: 'description', path: '/user/terms?role=supplier' }
                        ].map((link, i) => (
                            <div key={i} onClick={() => navigate(link.path)} className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-all group">
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-slate-400 text-lg group-hover:text-slate-950 transition-colors">{link.icon}</span>
                                    <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{link.label}</span>
                                </div>
                                <span className="material-symbols-outlined text-slate-300 text-sm">arrow_forward_ios</span>
                            </div>
                        ))}
                    </section>
                </div>

                {/* DOCUMENTS SECTION */}
                <section className="space-y-3 mt-16">
                    <div className="flex items-center justify-between px-1">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Verification Documents</h3>
                        <span className="material-symbols-outlined text-slate-200 text-lg">folder_shared</span>
                    </div>

                    <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm space-y-3">
                        {(user.documents && user.documents.length > 0) ? (
                            user.documents.map((doc, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-slate-400">
                                            <span className="material-symbols-outlined text-lg">description</span>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black text-slate-900 uppercase tracking-tight leading-none mb-1">{doc.type}</p>
                                            <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-[7px] font-black text-slate-950 uppercase tracking-widest">View File</a>
                                        </div>
                                    </div>
                                    <label className="cursor-pointer">
                                        <input
                                            type="file"
                                            className="hidden"
                                            onChange={(e) => handleDocumentUpdate(doc.type, e.target.files[0])}
                                        />
                                        <span className="material-symbols-outlined text-slate-300 hover:text-slate-950 transition-colors text-lg">upload_file</span>
                                    </label>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-4">
                                <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">No documents uploaded</p>
                            </div>
                        )}

                        {(!user.documents || user.documents.length < 2) && (
                            <div className="pt-2 border-t border-slate-50 mt-2">
                                <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-3 text-center">Add Missing Documents</p>
                                <div className="flex gap-2">
                                    {['GST Document', 'MSME Document'].filter(t => !user.documents?.some(d => d.type === t)).map(type => (
                                        <label key={type} className="flex-1 cursor-pointer">
                                            <input type="file" className="hidden" onChange={(e) => handleDocumentUpdate(type, e.target.files[0])} />
                                            <div className="py-3 px-2 border-2 border-dashed border-slate-100 rounded-2xl text-center hover:border-slate-950/30 transition-colors">
                                                <p className="text-[7px] font-black text-slate-400 uppercase tracking-tighter">{type}</p>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </section>


                {/* Action Footer */}
                <div className="flex flex-col gap-4 pt-4">
                    <button
                        onClick={handleSignOut}
                        className="w-full py-5 bg-rose-50 border border-rose-100 rounded-[2rem] text-[10px] font-black text-rose-500 uppercase tracking-[0.2em] flex items-center justify-center gap-3 active:scale-95 transition-all"
                    >
                        <span className="material-symbols-outlined text-lg">logout</span>
                        Logout
                    </button>
                </div>

                <div className="text-center pb-12">
                    <p className="text-[8px] font-black text-slate-200 uppercase tracking-[0.6em]">EZ OF LIFE PARTNER • v3.0.0</p>
                </div>
            </main>


        </div>
    );
};

export default SupplierProfile;
