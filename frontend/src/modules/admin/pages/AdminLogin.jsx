import BrandLogo from '../../../shared/components/BrandLogo.jsx';
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { authApi } from '../../../lib/api';

const AdminLogin = () => {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastRequestedPhone, setLastRequestedPhone] = useState('');

  const isLoginValid = phone.length === 10 && /^\d+$/.test(phone);

  const handleRequestOtp = async (phoneVal) => {
    if (loading || lastRequestedPhone === phoneVal) return;
    setLoading(true);
    setApiError('');
    try {
      const response = await authApi.requestOtp(phoneVal, 'WhatsApp', 'login', { role: 'Admin' });
      
      // Always set lastRequestedPhone to prevent infinite loops on error
      setLastRequestedPhone(phoneVal);

      if (response.message === 'OTP sent successfully' || response.message === 'Admin OTP sent successfully') {
        navigate('/admin/otp', { state: { phone: phoneVal, channel: 'WhatsApp' } });
      } else {
        const errorMsg = response.message || 'Something went wrong';
        setApiError(errorMsg);
        toast.error(errorMsg, {
          icon: '🚫',
          style: { borderRadius: '20px', background: '#333', color: '#fff', fontSize: '12px', fontWeight: 'bold' }
        });
      }
    } catch (error) {
      setApiError('Server error. Please try again later.');
      setLastRequestedPhone(phoneVal); // Also set here to stop the loop
    } finally {
      setLoading(false);
    }
  };

  // Auto-trigger for Login
  useEffect(() => {
    if (isLoginValid && !loading && lastRequestedPhone !== phone) {
      handleRequestOtp(phone);
    }
  }, [phone, isLoginValid, loading, lastRequestedPhone]);

  const containerVariants = useMemo(() => ({
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { 
        duration: 0.5,
        staggerChildren: 0.05
      }
    },
    exit: {
      opacity: 0,
      y: -20,
      transition: { duration: 0.3 }
    }
  }), []);

  const itemVariants = useMemo(() => ({
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0 }
  }), []);

  return (
    <div className="bg-background font-body text-on-background min-h-[100dvh] flex flex-col overflow-x-hidden relative">
      {/* Refresh Button */}
      <motion.button 
        whileTap={{ scale: 0.9 }}
        onClick={() => window.location.reload()}
        className="absolute top-6 right-6 w-10 h-10 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center shadow-xl border border-white/20 text-slate-400 hover:text-slate-900 transition-all z-[60]"
      >
        <span className="material-symbols-outlined text-[20px]">refresh</span>
      </motion.button>

      {/* Hero Visual Section */}
      <div className="relative h-[25dvh] min-h-[220px] w-full overflow-hidden flex items-center justify-center">
        <div className="absolute -top-20 -left-20 w-80 h-80 bg-primary-container/30 rounded-full blur-[80px]"></div>
        <div className="absolute top-40 -right-20 w-96 h-96 bg-tertiary-container/20 rounded-full blur-[100px]"></div>
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8 }}
          className="z-10 text-center px-8"
        >
          <BrandLogo className="h-36 md:h-40 w-auto mx-auto mb-2" />
        </motion.div>
        <div className="absolute bottom-0 w-full h-24 bg-gradient-to-t from-background to-transparent"></div>
      </div>

      {/* Auth Container */}
      <main className="flex-grow px-6 -mt-6 relative z-20 pb-12">
        <div className="max-w-md mx-auto">
          {/* Active Tab Indicator for Admin */}
          <div className="flex items-center justify-center gap-10 mb-8">
            <button className="relative py-2 focus:outline-none">
              <span className="font-headline text-xl font-black text-on-background">
                Admin Login
              </span>
              <motion.div 
                layoutId="activeTabIndicator"
                className="absolute -bottom-1 left-0 right-0 h-1.5 bg-primary rounded-full"
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
              />
            </button>
          </div>

          {/* Auth Card */}
          <motion.div 
            className="bg-white rounded-[2.5rem] p-6 md:p-10 shadow-[0_40px_60px_rgba(47,50,58,0.08)] border border-outline-variant/5"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <div className="login-content">
              <motion.div variants={itemVariants} className="mb-8">
                <h2 className="font-headline text-2xl font-black mb-1.5 text-on-surface tracking-tighter">Welcome Back</h2>
                <p className="text-on-surface-variant text-sm font-semibold opacity-70">
                  Log in to administrative command hub.
                </p>
              </motion.div>

              <div className="space-y-6">
                <motion.div variants={itemVariants} className="relative group">
                  <label className="block font-label text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] mb-2.5 ml-1">Phone Number</label>
                  <div className={`flex items-center bg-surface-container-low rounded-2xl p-1 border border-slate-300 transition-all focus-within:bg-white focus-within:ring-2 ${phone.length > 0 && !isLoginValid ? 'focus-within:ring-error/20 ring-error/10' : 'focus-within:ring-primary/20'}`}>
                    <div className="px-4 font-black text-on-surface text-sm">+91</div>
                    <input 
                      className="w-full bg-transparent border-none focus:ring-0 py-4 px-2 text-on-surface font-black placeholder:text-on-surface/30 placeholder:font-medium outline-none" 
                      placeholder="000 000 0000" 
                      type="tel"
                      maxLength={10}
                      disabled={loading}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    />
                    {loading && (
                      <div className="pr-4">
                        <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  {phone.length > 0 && !isLoginValid && (
                      <p className="text-[9px] text-error font-bold mt-2 ml-1 animate-pulse">Enter a valid 10-digit number</p>
                  )}
                  <p className="text-[10px] text-emerald-600 font-black mt-2.5 ml-1 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>chat</span>
                    OTP will be sent to WhatsApp
                  </p>
                </motion.div>

                {apiError && (
                  <p className="text-[10px] text-error font-black text-center mt-2 animate-pulse">{apiError}</p>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Background Decorative Elements */}
      <div className="fixed bottom-12 right-12 w-16 h-16 bg-primary-container/20 rounded-full blur-xl pointer-events-none"></div>
      <div className="fixed top-1/2 -left-8 w-24 h-24 bg-tertiary-container/10 rounded-full blur-2xl pointer-events-none"></div>
    </div>
  );
};

export default AdminLogin;
