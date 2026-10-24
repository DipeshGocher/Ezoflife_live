import BrandLogo from '../../../shared/components/BrandLogo.jsx';
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { authApi } from '../../../lib/api';

const SupplierAuth = () => {
    const navigate = useNavigate();
    const [isLogin, setIsLogin] = useState(true);

    const [loginPhone, setLoginPhone] = useState('');
    const [registerCompany, setRegisterCompany] = useState('');
    const [registerPhone, setRegisterPhone] = useState('');
    const [apiError, setApiError] = useState('');

    const isLoginValid = loginPhone.length === 10 && /^\d+$/.test(loginPhone);
    const isRegisterValid = registerCompany.length >= 3 && registerPhone.length === 10 && /^\d+$/.test(registerPhone);

    const containerVariants = useMemo(() => ({
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.5, staggerChildren: 0.05 } },
        exit: { opacity: 0, y: -20, transition: { duration: 0.3 } }
    }), []);

    const itemVariants = useMemo(() => ({
        hidden: { opacity: 0, y: 15 },
        visible: { opacity: 1, y: 0 }
    }), []);

    const authTabs = useMemo(() => [
        { key: true, label: 'Login' }, 
        { key: false, label: 'Onboard' }
    ], []);

    return (
        <div className="bg-background font-body text-on-background min-h-[100dvh] flex flex-col overflow-x-hidden">
            {/* Hero */}
            <div className="relative h-[25dvh] min-h-[220px] w-full overflow-hidden flex items-center justify-center bg-white/30">
                <div className="absolute -top-20 -left-20 w-80 h-80 bg-primary/5 rounded-full blur-[80px]"></div>
                <div className="absolute top-40 -right-20 w-96 h-96 bg-primary/10 rounded-full blur-[100px]"></div>
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.8 }}
                    className="z-10 text-center px-8"
                >
                    <BrandLogo className="h-28 w-auto mx-auto mb-2" />
                    <h1 className="font-headline font-black text-3xl text-on-surface leading-none tracking-tighter mb-1 uppercase italic">B2B Core</h1>
                    <p className="font-label text-on-surface-variant uppercase tracking-[0.2em] text-[10px] font-black opacity-60 italic">Material Supplier Portal</p>
                </motion.div>
                <div className="absolute bottom-0 w-full h-20 bg-gradient-to-t from-background to-transparent"></div>
            </div>

            {/* Auth Container */}
            <main className="flex-grow px-6 -mt-8 relative z-20 pb-20">
                <div className="max-w-md mx-auto">
                    {/* Tabs */}
                    <div className="flex items-center justify-center gap-12 mb-10">
                        {authTabs.map(({ key, label }) => (
                            <button key={label} onClick={() => setIsLogin(key)} className="relative py-2 focus:outline-none">
                                <span className={`font-headline text-2xl font-black transition-all duration-300 ${isLogin === key ? 'text-on-surface' : 'text-on-surface/30 hover:text-on-surface uppercase italic'}`}>
                                    {label}
                                </span>
                                {isLogin === key && (
                                    <motion.div
                                        layoutId="supplierTabIndicator"
                                        className="absolute -bottom-1 left-0 right-0 h-1.5 bg-primary rounded-full shadow-[0_0_10px_rgba(0,0,0,0.1)]"
                                        transition={{ type: "spring", stiffness: 350, damping: 30 }}
                                    />
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Card */}
                    <motion.div className="bg-white rounded-[3rem] p-8 md:p-12 shadow-[0_50px_80px_rgba(47,50,58,0.08)] border border-outline-variant/10">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={isLogin ? 'login' : 'register'}
                                variants={containerVariants}
                                initial="hidden"
                                animate="visible"
                                exit="exit"
                            >
                                {isLogin ? (
                                    /* ── LOGIN ── */
                                    <div>
                                        <motion.div variants={itemVariants} className="mb-10">
                                            <h2 className="font-headline text-3xl font-black mb-2 text-on-surface tracking-tighter italic uppercase">Identity Check</h2>
                                            <p className="text-on-surface-variant text-[11px] font-bold uppercase tracking-widest opacity-50 italic">
                                                Verification required for secure B2B access.
                                            </p>
                                        </motion.div>

                                        <div className="space-y-8">
                                            <motion.div variants={itemVariants} className="relative group">
                                                <label className="block font-label text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] mb-3 ml-1 opacity-60">Registered Phone</label>
                                                <div className={`flex items-center bg-surface-container-low rounded-[1.5rem] p-1.5 border border-slate-300 transition-all focus-within:bg-white focus-within:ring-2 ${loginPhone.length > 0 && !isLoginValid ? 'focus-within:ring-error/20 ring-error/10' : 'focus-within:ring-primary/20'}`}>
                                                    <div className="px-5 font-black text-on-surface text-sm opacity-40">+91</div>
                                                    <input
                                                        className="w-full bg-transparent border-none focus:ring-0 py-4 px-2 text-on-surface font-black text-md placeholder:text-on-surface/20 placeholder:font-medium outline-none tracking-widest"
                                                        placeholder="00000 00000"
                                                        type="tel"
                                                        maxLength={10}
                                                        value={loginPhone}
                                                        onChange={(e) => setLoginPhone(e.target.value.replace(/\D/g, ''))}
                                                    />
                                                </div>
                                            </motion.div>

                                            <motion.button
                                                variants={itemVariants}
                                                whileTap={isLoginValid ? { scale: 0.98 } : {}}
                                                onClick={async () => {
                                                    if (isLoginValid) {
                                                        setApiError('');
                                                        try {
                                                            const response = await authApi.requestOtp(loginPhone, 'WhatsApp', 'login', 'Supplier');
                                                            if (response.message === 'OTP sent successfully') {
                                                                navigate('/supplier/otp', { state: { phone: loginPhone, channel: 'WhatsApp' } });
                                                            } else {
                                                                setApiError(response.message || 'Error');
                                                            }
                                                        } catch (err) {
                                                            setApiError('Server error');
                                                        }
                                                    }
                                                }}
                                                disabled={!isLoginValid}
                                                className={`w-full font-headline font-black py-6 rounded-2xl shadow-xl tracking-[0.2em] uppercase text-[10px] transition-all duration-300 ${isLoginValid ? 'bg-primary text-on-primary shadow-primary/20' : 'bg-surface-container-high text-on-surface/20 cursor-not-allowed opacity-40'}`}
                                            >
                                                Authenticate Source
                                            </motion.button>
                                            {apiError && isLogin && (
                                                <p className="text-[10px] text-error font-black text-center mt-2 animate-pulse">{apiError}</p>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    /* ── REGISTER ── */
                                    <div>
                                        <motion.div variants={itemVariants} className="mb-10">
                                            <h2 className="font-headline text-3xl font-black mb-2 text-on-surface tracking-tighter italic uppercase">Partner Onboarding</h2>
                                            <p className="text-on-surface-variant text-[11px] font-bold uppercase tracking-widest opacity-50 italic">
                                                Sign up as a material supply partner.
                                            </p>
                                        </motion.div>

                                        <div className="space-y-6">
                                            <motion.div variants={itemVariants}>
                                                <label className="block font-label text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] mb-3 ml-1 opacity-60">Company Legal Name</label>
                                                <input
                                                    className="w-full bg-surface-container-low border-none focus:ring-2 focus:ring-primary/20 rounded-2xl py-5 px-6 text-on-surface font-black placeholder:text-on-surface/20 placeholder:font-medium outline-none"
                                                    placeholder="e.g. Apex Industrial Supplies"
                                                    type="text"
                                                    value={registerCompany}
                                                    onChange={(e) => setRegisterCompany(e.target.value)}
                                                />
                                            </motion.div>

                                            <motion.div variants={itemVariants}>
                                                <label className="block font-label text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] mb-3 ml-1 opacity-60">Operations Contact</label>
                                                <div className={`flex items-center bg-surface-container-low rounded-[1.5rem] p-1.5 border border-slate-300 focus-within:bg-white focus-within:ring-2 ${registerPhone.length > 0 && registerPhone.length !== 10 ? 'focus-within:ring-error/20 ring-error/10' : 'focus-within:ring-primary/20'}`}>
                                                    <div className="px-5 font-black text-on-surface text-sm opacity-40">+91</div>
                                                    <input
                                                        className="w-full bg-transparent border-none focus:ring-0 py-4 px-2 text-on-surface font-black text-md placeholder:text-on-surface/20 placeholder:font-medium outline-none tracking-widest"
                                                        placeholder="00000 00000"
                                                        type="tel"
                                                        maxLength={10}
                                                        value={registerPhone}
                                                        onChange={(e) => setRegisterPhone(e.target.value.replace(/\D/g, ''))}
                                                    />
                                                </div>
                                            </motion.div>

                                            <motion.button
                                                variants={itemVariants}
                                                whileTap={isRegisterValid ? { scale: 0.98 } : {}}
                                                onClick={async () => {
                                                    if (isRegisterValid) {
                                                        setApiError('');
                                                        try {
                                                            const response = await authApi.requestOtp(registerPhone, 'WhatsApp', 'signup', 'Supplier');
                                                            if (response.message === 'OTP sent successfully') {
                                                                navigate('/supplier/otp', { state: { phone: registerPhone, channel: 'WhatsApp', company: registerCompany } });
                                                            } else {
                                                                setApiError(response.message || 'Error');
                                                            }
                                                        } catch (err) {
                                                            setApiError('Server error');
                                                        }
                                                    }
                                                }}
                                                disabled={!isRegisterValid}
                                                className={`w-full font-headline font-black py-6 rounded-2xl shadow-xl tracking-[0.2em] uppercase text-[10px] mt-4 transition-all duration-300 ${isRegisterValid ? 'bg-primary text-on-primary shadow-primary/20' : 'bg-surface-container-high text-on-surface/20 cursor-not-allowed opacity-40'}`}
                                            >
                                                Submit Partnership Request
                                            </motion.button>
                                            {apiError && !isLogin && (
                                                <p className="text-[10px] text-error font-black text-center mt-4 animate-pulse">{apiError}</p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </motion.div>

                    <div className="mt-12 flex flex-col items-center gap-4">
                        <p className="text-center text-[10px] text-on-surface-variant font-black tracking-widest opacity-30 uppercase">
                            Enterprise Tier Security Active
                        </p>
                        <button 
                            onClick={() => navigate('/vendor/auth')}
                            className="text-[10px] font-black text-primary uppercase tracking-widest border border-primary/20 px-6 py-2.5 rounded-full hover:bg-primary/5 transition-all"
                        >
                            Return to Laundry Portal
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default SupplierAuth;
