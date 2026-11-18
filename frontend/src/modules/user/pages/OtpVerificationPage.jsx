import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { authApi } from '../../../lib/api';
import { safeStorage } from '@/lib/safeStorage';
import { useLocationStore } from '../../../shared/stores/locationStore';

const OtpVerificationPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { phone, channel } = location.state || { phone: '98765 43210', channel: 'WhatsApp' };
  
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [timer, setTimer] = useState(60);
  const [error, setError] = useState('');
  const inputRefs = useRef([]);

  useEffect(() => {
    // Auto-focus first input on mount
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  useEffect(() => {
    let interval;
    if (timer > 0) {
      interval = setInterval(() => setTimer(prev => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const handleChange = (index, value) => {
    if (isNaN(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.substring(value.length - 1);
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1].focus();
    }

    // Auto-verify if all digits are filled
    if (newOtp.every(digit => digit !== '')) {
      handleVerify(newOtp);
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1].focus();
    }
  };

  const [isVerifying, setIsVerifying] = useState(false);

  const handleVerify = async (providedOtp) => {
    const otpToVerify = providedOtp || otp;
    if (otpToVerify.every(digit => digit !== '')) {
      setError('');
      setIsVerifying(true);
      try {
        const fullOtp = otpToVerify.join('');
        const response = await authApi.verifyOtp(phone, fullOtp);
        
        if (response.token) {
          const user = response.user;
          const role = (user.role || 'customer').toLowerCase();
          const status = (user.status || 'pending').toLowerCase();

          console.log(`🔑 [AUTH_DEBUG] Raw Role: ${user.role}, Raw Status: ${user.status}`);
          console.log(`🔄 [AUTH_DEBUG] Normalized Role: ${role}, Normalized Status: ${status}`);

          // Decide the "Session Role" 
          // A vendor/supplier is only active if their status is 'approved'
          let actingRole = role;
          if ((role === 'vendor' || role === 'supplier') && status !== 'approved') {
            actingRole = 'customer';
          }

          console.log(`🎯 [AUTH_DEBUG] Final Acting Role: ${actingRole}`);

          // Drop any address left over from a previous user/session so the header
          // never shows a stale address before this user's default address loads.
          useLocationStore.getState().clearLocation();

          safeStorage.setItem('token', response.token);
          safeStorage.setItem('user_auth_token', response.token);
          safeStorage.setItem('user', JSON.stringify(user));
          safeStorage.setItem('userData', JSON.stringify(user));
          safeStorage.setItem('userId', user._id || user.id);
          safeStorage.setItem('userRole', actingRole);
          safeStorage.setItem('userType', user.customerType || 'individual');

          // Force Page Refresh or specific redirect
          if (actingRole === 'vendor') {
            window.location.href = '/vendor/dashboard';
          } else if (actingRole === 'supplier') {
            window.location.href = '/supplier/dashboard';
          } else if (actingRole === 'admin') {
            window.location.href = '/admin/dashboard';
          } else {
            const hasDetails = user.displayName && user.address;
            if (!user.isProfileComplete && !hasDetails) {
              window.location.href = '/user/profile/create';
            } else {
              window.location.href = '/user/home';
            }
          }
        } else {
          setError(response.message || 'Invalid OTP');
          setIsVerifying(false);
          setOtp(['', '', '', '', '', '']);
          inputRefs.current[0].focus();
        }
      } catch (err) {
        setError('Verification failed. Try again.');
        setIsVerifying(false);
      }
    }
  };

  const isOtpComplete = useMemo(() => otp.every(digit => digit !== ''), [otp]);

  const containerVariants = useMemo(() => ({
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.5 } }
  }), []);

  const cardVariants = useMemo(() => ({
    hidden: { scale: 0.9, opacity: 0, y: 20 },
    visible: { scale: 1, opacity: 1, y: 0, transition: { type: "spring", damping: 25, stiffness: 200 } }
  }), []);

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="bg-background text-on-background min-h-[100dvh] flex flex-col items-center justify-center px-6 relative overflow-hidden"
    >
      {/* Refresh Button */}
      <motion.button 
        whileTap={{ scale: 0.9 }}
        onClick={() => window.location.reload()}
        className="absolute top-6 right-6 w-10 h-10 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center shadow-xl border border-white/20 text-slate-400 hover:text-slate-900 transition-all z-[60]"
      >
        <span className="material-symbols-outlined text-[20px]">refresh</span>
      </motion.button>

      {/* Decorative Background */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none -z-10">
        <div className="absolute top-20 right-[-10%] w-80 h-80 bg-primary/5 rounded-full blur-[80px]" />
        <div className="absolute bottom-20 left-[-10%] w-80 h-80 bg-tertiary/5 rounded-full blur-[80px]" />
      </div>

      <motion.main 
        variants={cardVariants}
        className="max-w-md w-full bg-white rounded-[3rem] p-8 md:p-10 shadow-[0_40px_80px_rgba(47,50,58,0.1)] border border-outline-variant/10"
      >
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-primary-container/30 rounded-3xl flex items-center justify-center text-primary mx-auto mb-6 shadow-inner">
            {isVerifying ? (
              <motion.span 
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="material-symbols-outlined text-4xl"
              >
                sync
              </motion.span>
            ) : (
              <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>mark_email_read</span>
            )}
          </div>
          <h1 className="text-3xl font-black tracking-tighter text-on-surface mb-3 leading-tight">Verification Code</h1>
          <p className="text-xs font-bold text-on-surface-variant opacity-60 uppercase tracking-widest leading-none">We've sent a 6-digit code to</p>
          <div className="flex items-center justify-center gap-2 mt-2 group">
            <p className="text-sm font-black text-primary tracking-tight">+91 {phone}</p>
            <motion.button 
              whileTap={{ scale: 0.9 }}
              onClick={() => navigate('/user/auth')}
              className="w-6 h-6 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-primary/10 hover:text-primary transition-all"
            >
              <span className="material-symbols-outlined text-[14px]">edit</span>
            </motion.button>
          </div>
          {error && <p className="text-[10px] text-error font-black mt-3 animate-pulse uppercase tracking-widest">{error}</p>}
        </div>

        {/* OTP Inputs */}
        <div className={`flex justify-center gap-2 md:gap-3 mb-10 transition-opacity ${isVerifying ? 'opacity-50 pointer-events-none' : ''}`}>
          {otp.map((digit, index) => (
            <input
              key={index}
              ref={(el) => (inputRefs.current[index] = el)}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              className="w-11 h-14 md:w-14 md:h-16 bg-surface-container-low border-2 border-slate-200 rounded-xl text-center text-2xl font-black text-on-surface focus:bg-white focus:border-primary/40 focus:ring-4 focus:ring-primary/10 transition-all outline-none shadow-sm"
            />
          ))}
        </div>

        {/* Resend Logic */}
        <div className="text-center mb-2">
          {timer > 0 ? (
            <p className="text-xs font-bold text-on-surface-variant opacity-60 uppercase tracking-widest">
              Resend code in <span className="text-primary font-black ml-1">{timer}s</span>
            </p>
          ) : (
            <motion.button 
              whileHover={{ scale: 1.05 }}
              onClick={() => setTimer(60)}
              className="text-xs font-black text-primary uppercase tracking-widest underline decoration-2 underline-offset-4"
            >
              Resend Code Now
            </motion.button>
          )}
        </div>

        <div className="h-10 flex items-center justify-center">
          {isVerifying && (
             <div className="flex items-center gap-2">
               <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
               <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
               <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"></div>
               <span className="text-[10px] font-black uppercase tracking-widest text-primary ml-2">Verifying...</span>
             </div>
          )}
        </div>
      </motion.main>

      {/* Floating Decorative Elements */}
      <motion.div 
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 4, repeat: Infinity }}
        className="fixed top-1/2 right-[5%] w-12 h-12 bg-primary/10 rounded-full blur-xl pointer-events-none"
      />
      <motion.div 
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 5, repeat: Infinity }}
        className="fixed bottom-[15%] left-[5%] w-16 h-16 bg-tertiary/10 rounded-full blur-xl pointer-events-none"
      />
    </motion.div>
  );
};

export default OtpVerificationPage;

