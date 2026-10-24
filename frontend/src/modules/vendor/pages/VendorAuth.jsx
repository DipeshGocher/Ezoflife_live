import BrandLogo from '../../../shared/components/BrandLogo.jsx';
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { authApi } from '../../../lib/api';

const VendorAuth = () => {
    const navigate = useNavigate();
    const [isLogin, setIsLogin] = useState(true);

    const [loginPhone, setLoginPhone] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [registerShop, setRegisterShop] = useState('');
    const [registerPhone, setRegisterPhone] = useState('');
    const [apiError, setApiError] = useState('');
    const authTabs = [
        { key: true, label: 'Login' },
        { key: false, label: 'Register' }
    ];

    const isLoginValid = loginPhone.length === 10 && /^\d+$/.test(loginPhone);
    const isRegisterValid = registerShop.length >= 3 && registerPhone.length === 10 && /^\d+$/.test(registerPhone);

    const containerVariants = useMemo(() => ({
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.5, staggerChildren: 0.05 } },
        exit: { opacity: 0, y: -20, transition: { duration: 0.3 } }
    }), []);

    const itemVariants = useMemo(() => ({
        hidden: { opacity: 0, y: 15 },
        visible: { opacity: 1, y: 0 }
    }), []);

    return (
        <div className="bg-background font-body text-on-background min-h-[100dvh] flex flex-col overflow-x-hidden">
            {/* Hero */}
            <div className="relative h-[25dvh] min-h-[200px] w-full overflow-hidden flex items-center justify-center">
                <div className="absolute -top-20 -left-20 w-80 h-80 bg-primary-container/30 rounded-full blur-[80px]"></div>
                <div className="absolute top-40 -right-20 w-96 h-96 bg-primary/10 rounded-full blur-[100px]"></div>
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.8 }}
                    className="z-10 text-center px-8"
                >
                    <div className="w-14 h-14 vendor-gradient rounded-[1.2rem] flex items-center justify-center mx-auto mb-3 shadow-2xl shadow-primary/30">
                        <span className="material-symbols-outlined text-white text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>local_laundry_service</span>
                    </div>
                    <BrandLogo className="h-28 w-auto mx-auto mb-1" />

                </motion.div>
                <div className="absolute bottom-0 w-full h-20 bg-gradient-to-t from-background to-transparent"></div>
            </div>

            {/* Auth Container */}
            <main className="flex-grow px-6 -mt-4 relative z-20 pb-12">
                <div className="max-w-md mx-auto">
                    {/* Tabs */}
                    <div className="flex items-center justify-center gap-10 mb-8">
                        {authTabs.map(({ key, label }) => (
                            <button key={label} onClick={() => setIsLogin(key)} className="relative py-2 focus:outline-none">
                                <span className={`font-headline text-xl font-black transition-colors duration-300 ${isLogin === key ? 'text-on-surface' : 'text-outline-variant hover:text-outline'}`}>
                                    {label}
                                </span>
                                {isLogin === key && (
                                    <motion.div
                                        layoutId="vendorTabIndicator"
                                        className="absolute -bottom-1 left-0 right-0 h-1.5 vendor-gradient rounded-full"
                                        transition={{ type: "spring", stiffness: 350, damping: 30 }}
                                    />
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Card */}
                    <motion.div className="bg-white rounded-[2.5rem] p-6 md:p-10 shadow-[0_40px_60px_rgba(47,50,58,0.08)] border border-outline-variant/5">
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
                                        <motion.div variants={itemVariants} className="mb-8">
                                            <h2 className="font-headline text-2xl font-black mb-1.5 text-on-surface tracking-tighter">Welcome Back</h2>
                                            <p className="text-on-surface-variant text-sm font-semibold opacity-70">
                                                Enter your registered mobile number to receive a verification code.
                                            </p>
                                        </motion.div>

                                        <div className="space-y-6">
                                            <motion.div variants={itemVariants} className="relative group">
                                                <label className="block font-label text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] mb-2.5 ml-1">Mobile Number</label>
                                                <div className={`flex items-center bg-surface-container-low rounded-2xl p-1 border border-slate-300 transition-all focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/20 ${loginPhone.length > 0 && loginPhone.length !== 10 ? 'focus-within:ring-error/20 ring-error/10' : ''}`}>
                                                    <div className="px-4 font-black text-on-surface text-sm">+91</div>
                                                    <input
                                                        className="w-full bg-transparent border-none focus:ring-0 py-4 px-2 text-on-surface font-black placeholder:text-on-surface/30 placeholder:font-medium outline-none"
                                                        placeholder="98765 43210"
                                                        type="tel"
                                                        maxLength={10}
                                                        value={loginPhone}
                                                        onChange={(e) => setLoginPhone(e.target.value.replace(/\D/g, ''))}
                                                    />
                                                </div>
                                                {loginPhone.length > 0 && loginPhone.length !== 10 && (
                                                    <p className="text-[9px] text-error font-bold mt-2 ml-1 animate-pulse">Enter a valid 10-digit number</p>
                                                )}
                                                <p className="text-[10px] text-emerald-600 font-black mt-2.5 ml-1 flex items-center gap-1.5">
                                                    <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>chat</span>
                                                    OTP will be sent to WhatsApp
                                                </p>
                                            </motion.div>

                                            <motion.button
                                                variants={itemVariants}
                                                whileTap={loginPhone.length === 10 ? { scale: 0.98 } : {}}
                                                onClick={async () => {
                                                    if (loginPhone.length === 10) {
                                                        setApiError('');
                                                        try {
                                                            const response = await authApi.requestOtp(loginPhone, 'WhatsApp', 'login', 'Vendor');
                                                            if (response.message === 'OTP sent successfully') {
                                                                navigate('/vendor/otp', { state: { phone: loginPhone, channel: 'WhatsApp' } });
                                                            } else {
                                                                setApiError(response.message || 'Something went wrong');
                                                            }
                                                        } catch (error) {
                                                            setApiError('Server error. Please try again.');
                                                        }
                                                    }
                                                }}
                                                disabled={loginPhone.length !== 10}
                                                className={`w-full font-headline font-black py-5 rounded-2xl shadow-xl tracking-widest uppercase text-xs transition-all duration-300 ${loginPhone.length === 10 ? 'vendor-gradient text-on-primary shadow-primary/20' : 'bg-surface-container-high text-outline-variant cursor-not-allowed opacity-50'}`}
                                            >
                                                Request OTP
                                            </motion.button>
                                            {apiError && isLogin && (
                                                <p className="text-[10px] text-error font-black text-center mt-2 animate-pulse">{apiError}</p>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    /* ── REGISTER ── */
                                    <div>
                                        <motion.div variants={itemVariants} className="mb-8">
                                            <h2 className="font-headline text-2xl font-black mb-1.5 text-on-surface tracking-tighter">Register Your Shop</h2>
                                            <p className="text-on-surface-variant text-sm font-semibold opacity-70">
                                                Join SPINZYT as a vendor partner today.
                                            </p>
                                        </motion.div>

                                        <div className="space-y-4">
                                            <motion.div variants={itemVariants}>
                                                <label className="block font-label text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] mb-2.5 ml-1">Shop Name</label>
                                                <input
                                                    className="w-full bg-surface-container-low border-none focus:ring-2 focus:ring-primary/20 rounded-2xl py-4 px-5 text-on-surface font-black placeholder:text-on-surface/30 placeholder:font-medium outline-none"
                                                    placeholder="e.g. Pristine Cleaners"
                                                    type="text"
                                                    value={registerShop}
                                                    onChange={(e) => setRegisterShop(e.target.value)}
                                                />
                                                {registerShop.length > 0 && registerShop.length < 3 && (
                                                    <p className="text-[9px] text-error font-bold mt-2 ml-1">Shop name must be at least 3 characters</p>
                                                )}
                                            </motion.div>

                                            <motion.div variants={itemVariants}>
                                                <label className="block font-label text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] mb-2.5 ml-1">Phone Number</label>
                                                <div className={`flex items-center bg-surface-container-low rounded-2xl p-1 border border-slate-300 focus-within:bg-white focus-within:ring-2 ${registerPhone.length > 0 && registerPhone.length !== 10 ? 'focus-within:ring-error/20 ring-error/10' : 'focus-within:ring-primary/20'}`}>
                                                    <div className="px-4 font-black text-on-surface text-sm">+91</div>
                                                    <input
                                                        className="w-full bg-transparent border-none focus:ring-0 py-4 px-2 text-on-surface font-black placeholder:text-on-surface/30 placeholder:font-medium outline-none"
                                                        placeholder="98765 43210"
                                                        type="tel"
                                                        maxLength={10}
                                                        value={registerPhone}
                                                        onChange={(e) => setRegisterPhone(e.target.value.replace(/\D/g, ''))}
                                                    />
                                                </div>
                                                {registerPhone.length > 0 && registerPhone.length !== 10 && (
                                                    <p className="text-[9px] text-error font-bold mt-2 ml-1">Enter a valid 10-digit number</p>
                                                )}
                                                <p className="text-[10px] text-emerald-600 font-black mt-2.5 ml-1 flex items-center gap-1.5">
                                                    <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>chat</span>
                                                    OTP will be sent to WhatsApp
                                                </p>
                                            </motion.div>

                                            <motion.button
                                                variants={itemVariants}
                                                whileTap={isRegisterValid ? { scale: 0.98 } : {}}
                                                onClick={async () => {
                                                    if (isRegisterValid) {
                                                        setApiError('');
                                                        try {
                                                            const response = await authApi.requestOtp(registerPhone, 'WhatsApp', 'signup', 'Vendor');
                                                            if (response.message === 'OTP sent successfully') {
                                                                // Note: we can also save shop name here or pass it to next step
                                                                navigate('/vendor/otp', { state: { phone: registerPhone, channel: 'WhatsApp', shopName: registerShop } });
                                                            } else {
                                                                setApiError(response.message || 'Something went wrong');
                                                            }
                                                        } catch (error) {
                                                            setApiError('Server error. Please try again.');
                                                        }
                                                    }
                                                }}
                                                disabled={!isRegisterValid}
                                                className={`w-full font-headline font-black py-5 rounded-2xl shadow-xl tracking-widest uppercase text-xs mt-2 transition-all duration-300 ${isRegisterValid ? 'vendor-gradient text-on-primary shadow-primary/20' : 'bg-surface-container-high text-outline-variant cursor-not-allowed opacity-50'}`}
                                            >
                                                Send OTP
                                            </motion.button>
                                            {apiError && !isLogin && (
                                                <p className="text-[10px] text-error font-black text-center mt-2 animate-pulse">{apiError}</p>
                                            )}
                                        </div>
                                    </div>
                                )}


                            </motion.div>
                        </AnimatePresence>
                    </motion.div>

                    <p className="mt-8 text-center text-[11px] text-on-surface-variant font-semibold tracking-wide px-4 opacity-50 underline underline-offset-4 cursor-pointer">
                        Trouble registering? Contact SPINZYT Support
                    </p>
                </div>
            </main>

            {/* Decorative blobs */}
            <div className="fixed bottom-12 right-12 w-16 h-16 bg-primary-container/20 rounded-full blur-xl pointer-events-none"></div>
            <div className="fixed top-1/2 -left-8 w-24 h-24 bg-primary/10 rounded-full blur-2xl pointer-events-none"></div>
        </div>
    );
};

export default VendorAuth;

