import { appDialog } from '../../../shared/stores/appDialogStore';
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { authApi } from '../../../lib/api';

const EditProfilePage = () => {
  const navigate = useNavigate();
  
  const [profile, setProfile] = useState({ name: '', email: '', phone: '' });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    setProfile({
      name: user.displayName || '',
      email: user.email || '',
      phone: user.phone || ''
    });
  }, []);

  const containerVariants = useMemo(() => ({
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  }), []);

  const itemVariants = useMemo(() => ({
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { duration: 0.5, ease: "easeOut" } }
  }), []);

  const handleSave = async (e) => {
    e.preventDefault();
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const userId = user.id || user._id;

    if (!userId) {
        await appDialog.alert('Authentication error. Please login again.');
        return;
    }

    try {
        setIsLoading(true);
        const updatedUser = await authApi.updateProfile(userId, {
            displayName: profile.name,
            email: profile.email,
            phone: profile.phone
        });

        // Update local storage
        localStorage.setItem('user', JSON.stringify({
            ...user,
            displayName: updatedUser.displayName,
            email: updatedUser.email,
            phone: updatedUser.phone
        }));

        navigate('/user/profile');
    } catch (error) {
        console.error('Update Profile Error:', error);
        await appDialog.alert('Failed to update profile: ' + error.message);
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="bg-background text-on-background min-h-[100dvh] pb-32 font-body"
    >
      <main className="max-w-2xl mx-auto px-6 pt-8">
        <motion.header 
          variants={itemVariants}
          className="mb-8"
        >
          <button 
            onClick={() => navigate('/user/profile')}
            className="flex items-center gap-2 text-primary font-black text-[10px] uppercase tracking-widest mb-4 opacity-60 hover:opacity-100 transition-opacity"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Back to Profile
          </button>
          <h1 className="text-4xl md:text-5xl font-black text-on-background leading-none tracking-tighter mb-4">
            Edit <br/><span className="text-primary tracking-tighter">Identity.</span>
          </h1>
          <p className="text-xs font-bold text-on-surface-variant opacity-60 leading-relaxed max-w-[280px]">
            Keep your personal details up to date for a seamless fresh flow.
          </p>
        </motion.header>

        <form onSubmit={handleSave} className="space-y-8">
          <motion.div variants={itemVariants} className="bg-white rounded-[2.5rem] p-10 shadow-sm border border-outline-variant/10 space-y-8">
            {/* Avatar Section */}
            <div className="flex flex-col items-center gap-6 pb-4 border-b border-outline-variant/5">
              <div className="relative group cursor-pointer">
                <div className="w-24 h-24 rounded-3xl bg-primary/10 flex items-center justify-center overflow-hidden border-2 border-primary/20">
                    <span className="material-symbols-outlined text-4xl text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
                </div>
                <div className="absolute -bottom-2 -right-2 bg-primary text-white p-2 rounded-xl shadow-lg border-2 border-white">
                  <span className="material-symbols-outlined text-sm">photo_camera</span>
                </div>
              </div>
              <p className="text-[10px] font-black text-primary uppercase tracking-widest leading-none">Change Photo</p>
            </div>

            {/* Form Fields */}
            <div className="space-y-6">
              <div className="group">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-4 mb-2 block opacity-40 group-focus-within:opacity-100 group-focus-within:text-primary transition-all">Full Name</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={profile.name}
                    onChange={(e) => setProfile({...profile, name: e.target.value})}
                    className="w-full bg-surface-container-low border-2 border-transparent rounded-2xl px-6 py-4 font-bold text-on-surface outline-none focus:border-primary/20 focus:bg-white transition-all shadow-inner"
                  />
                  <span className="material-symbols-outlined absolute right-6 top-1/2 -translate-y-1/2 text-outline-variant opacity-30 text-xl">edit</span>
                </div>
              </div>

              <div className="group">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-4 mb-2 block opacity-40 group-focus-within:opacity-100 group-focus-within:text-primary transition-all">Email Address</label>
                <div className="relative">
                  <input 
                    type="email" 
                    value={profile.email}
                    onChange={(e) => setProfile({...profile, email: e.target.value})}
                    className="w-full bg-surface-container-low border-2 border-transparent rounded-2xl px-6 py-4 font-bold text-on-surface outline-none focus:border-primary/20 focus:bg-white transition-all shadow-inner"
                  />
                  <span className="material-symbols-outlined absolute right-6 top-1/2 -translate-y-1/2 text-outline-variant opacity-30 text-xl">mail</span>
                </div>
              </div>

              <div className="group">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-4 mb-2 block opacity-40 group-focus-within:opacity-100 group-focus-within:text-primary transition-all">Phone Number</label>
                <div className="relative flex items-center gap-3">
                  <div className="bg-surface-container-low px-4 py-4 rounded-2xl font-black text-primary border-2 border-transparent shadow-inner">
                    +91
                  </div>
                  <input 
                    type="tel" 
                    value={profile.phone}
                    onChange={(e) => setProfile({...profile, phone: e.target.value})}
                    className="flex-1 bg-surface-container-low border-2 border-transparent rounded-2xl px-6 py-4 font-bold text-on-surface outline-none focus:border-primary/20 focus:bg-white transition-all shadow-inner"
                  />
                </div>
              </div>
            </div>
          </motion.div>

          <motion.button 
            variants={itemVariants}
            type="submit"
            disabled={isLoading}
            whileHover={!isLoading ? { scale: 1.02 } : {}}
            whileTap={!isLoading ? { scale: 0.98 } : {}}
            className={`w-full py-6 rounded-2xl text-on-primary font-headline font-black text-xl shadow-2xl uppercase tracking-widest flex items-center justify-center gap-3 transition-opacity ${
                isLoading ? 'opacity-70 bg-slate-400' : 'bg-primary-gradient shadow-primary/20'
            }`}
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
            {!isLoading && <span className="material-symbols-outlined text-2xl">check</span>}
          </motion.button>
        </form>
      </main>
    </motion.div>
  );
};

export default EditProfilePage;

