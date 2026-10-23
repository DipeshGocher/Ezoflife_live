import { servicePricing } from '../../../lib/servicePricing';
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLocationStore } from '../../../shared/stores/locationStore';
import UserHeader from '../components/UserHeader';
import BottomNav from '../components/BottomNav';

const ServiceInfoPage = () => {
  const { pricingFactor, allowDiscount, expressMultiplier, heritageMultiplier } = useLocationStore();
  const isExpress = localStorage.getItem('is_express') === 'true';
  const selectedTier = localStorage.getItem('selected_tier') || 'Essential';
  const isHeritage = selectedTier === 'Heritage';
  const navigate = useNavigate();
  const location = useLocation();
  const service = location.state?.selectedService;

  const [quantity, setQuantity] = useState(service?.id?.includes('wash') ? 5 : 1);
  const [unit, setUnit] = useState(service?.id?.includes('wash') || service?.id?.includes('carpet') ? 'kg' : 'pc');

  // If no service is passed, redirect back to home
  useEffect(() => {
    if (!service) {
      navigate('/user/home');
    }
  }, [service, navigate]);

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

  const benefits = useMemo(() => [
    { icon: 'verified', title: 'Quality Assurance', desc: 'Premium detergents & multi-step inspection' },
    { icon: 'schedule', title: '24h Turnaround', desc: 'Express pickup and delivery options' },
    { icon: 'eco', title: 'Eco Friendly', desc: 'Safe for your skin and the environment' },
  ], []);

  const handleAddToCart = () => {
    navigate('/user/cart', { 
      state: { 
        selectedService: { ...service, initialQuantity: quantity, initialUnit: unit } 
      } 
    });
  };

  if (!service) return null;

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      className="bg-background font-body text-on-background min-h-[100dvh] flex flex-col"
    >
      <UserHeader />
      
      <motion.main 
        variants={containerVariants}
        className="max-w-5xl mx-auto px-6 pt-32 pb-36 w-full flex-1"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
          {/* Left: Visual Asset */}
          <motion.div variants={itemVariants} className="space-y-6">
            <div className={`w-24 h-24 rounded-3xl bg-${service.color}-container flex items-center justify-center text-${service.color} shadow-xl shadow-${service.color}/10 mb-8`}>
              <span className="material-symbols-outlined text-5xl">{service.icon}</span>
            </div>
            <h1 className="font-headline text-5xl font-black tracking-tighter leading-none text-on-surface">
              {service.title}
            </h1>
            <p className="text-on-surface-variant text-lg font-bold opacity-60 leading-relaxed max-w-md">
              {service.desc || "Experience the ultimate care for your fabrics with our signature service."}
            </p>
            
            <div className="flex gap-4 mt-8">
              <div className="bg-surface-container-low border border-outline-variant/10 px-6 py-4 rounded-[2rem] flex items-center gap-4">
                <div className="flex flex-col">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-40 mb-1">Starting Rate</p>
                  <div className="flex items-center gap-3">
                    {servicePricing(service, { pricingFactor, allowDiscount, isExpress, expressMultiplier, isHeritage, heritageMultiplier }).hasDiscount && (
                      <span className="text-sm font-bold text-slate-400 line-through">
                        ₹{servicePricing(service, { pricingFactor, allowDiscount, isExpress, expressMultiplier, isHeritage, heritageMultiplier }).originalPrice}
                      </span>
                    )}
                    <p className="text-2xl font-black text-primary">
                      ₹{servicePricing(service, { pricingFactor, allowDiscount, isExpress, expressMultiplier, isHeritage, heritageMultiplier }).price}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-surface-container-low border border-outline-variant/10 px-5 py-3 rounded-2xl">
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-40 mb-1">Method</p>
                <p className="text-xl font-black text-on-surface">Steam Wash</p>
              </div>
            </div>
          </motion.div>

          {/* Right: Actions & Benefits */}
          <motion.div variants={itemVariants} className="space-y-10">
            {/* Selection controls */}
            <section className="bg-white rounded-[2.5rem] p-8 shadow-xl shadow-on-surface/5 border border-outline-variant/5">
              <h3 className="font-black text-xs uppercase tracking-widest text-on-surface-variant opacity-40 mb-6">Customize Order</h3>
              
              <div className="space-y-8">
               {/* Unit Toggle */}
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm">Billing Unit</span>
                  <div className="flex bg-surface-container-low p-1.5 rounded-2xl">
                    <button 
                      onClick={() => setUnit('kg')}
                      className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${unit === 'kg' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant'}`}
                    >Kg</button>
                    <button 
                      onClick={() => setUnit('pc')}
                      className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${unit === 'pc' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant'}`}
                    >Cloth</button>
                  </div>
                </div>

                {/* Quantity */}
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm">Initial Quantity</span>
                  <div className="flex items-center gap-6">
                    <motion.button 
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setQuantity(q => Math.max(1, q - 1))}
                      className="w-12 h-12 bg-surface-container-low rounded-2xl flex items-center justify-center text-primary"
                    >
                      <span className="material-symbols-outlined">remove</span>
                    </motion.button>
                    <span className="text-2xl font-black w-12 text-center">{quantity}</span>
                    <motion.button 
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setQuantity(q => q + 1)}
                      className="w-12 h-12 bg-surface-container-low rounded-2xl flex items-center justify-center text-primary"
                    >
                      <span className="material-symbols-outlined">add</span>
                    </motion.button>
                  </div>
                </div>
              </div>

              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleAddToCart}
                className="w-full mt-10 bg-primary-gradient text-on-primary font-black py-5.5 rounded-3xl text-sm uppercase tracking-[0.2em] shadow-2xl shadow-primary/30 flex items-center justify-center gap-3"
              >
                Proceed to Cart
                <span className="material-symbols-outlined text-2xl">arrow_forward</span>
              </motion.button>
            </section>

            {/* Benefits list */}
            <div className="grid grid-cols-1 gap-6 px-4">
              {benefits.map((b, i) => (
                <div key={i} className="flex gap-5 items-start">
                  <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary shrink-0">
                    <span className="material-symbols-outlined text-xl">{b.icon}</span>
                  </div>
                  <div>
                    <h4 className="font-black text-sm text-on-surface mb-1">{b.title}</h4>
                    <p className="text-xs font-bold text-on-surface-variant opacity-50 leading-relaxed">{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </motion.main>
      
      <BottomNav />
    </motion.div>
  );
};

export default ServiceInfoPage;

