import { servicePricing } from '../../../lib/servicePricing';
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { serviceApi, masterServiceApi, BASE_URL } from '../../../lib/api';
import { useLocationStore } from '../../../shared/stores/locationStore';

const AllServicesPage = () => {
  const navigate = useNavigate();
  const { location, zone, pricingFactor, allowDiscount, expressMultiplier, heritageMultiplier } = useLocationStore();
  const isExpress = localStorage.getItem('is_express') === 'true';
  const selectedTier = localStorage.getItem('selected_tier') || 'Essential';
  const isHeritage = selectedTier === 'Heritage';
  const [searchQuery, setSearchQuery] = useState('');
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchServices = async () => {
    try {
      setLoading(true);

      // All customers use the standard catalogue, including GST-registered businesses.
      const [masterRes, customRes] = await Promise.all([
        masterServiceApi.getAll({ serviceType: 'individual', activeOnly: true }),
        serviceApi.getAll({ approvedOnly: true, serviceType: 'individual' })
      ]);

      const combined = [
        ...(Array.isArray(masterRes) ? masterRes.map(s => ({ ...s, isMaster: true })) : []),
        ...(Array.isArray(customRes) ? customRes.map(s => ({ ...s, isMaster: false })) : [])
      ];

      setServices(combined.filter(s => (s.status === 'Active' || s.isActive === true || s.active === true) && (s.isMaster || s.approvalStatus === 'Approved')));
    } catch (error) {
      console.error('Error fetching services:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, []);

  const filteredServices = useMemo(() => {
    // if (location && !zone) return [];
    return services.filter(service => 
      service.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (service.description && service.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [services, searchQuery, location, zone]);


  const containerVariants = useMemo(() => ({
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  }), []);

  const itemVariants = useMemo(() => ({
    hidden: { y: 15, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { duration: 0.4, ease: "easeOut" } }
  }), []);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-background text-on-background min-h-[100dvh] pb-32"
    >
      <main className="max-w-4xl mx-auto px-6 pt-8">
        <motion.header 
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="mb-10"
        >
          <button 
            onClick={() => navigate('/user/home')}
            className="flex items-center gap-2 text-primary font-black text-[10px] uppercase tracking-widest mb-6 opacity-60 hover:opacity-100 transition-opacity"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Back to Home
          </button>
          <h1 className="text-4xl md:text-5xl font-black text-on-background leading-none tracking-tighter mb-4">
            Curated <br/><span className="text-primary tracking-tighter">Services.</span>
          </h1>
          <p className="text-xs font-bold text-on-surface-variant opacity-60 leading-relaxed max-w-[280px]">
            Every garment deserves a specialized touch. Browse our full suite.
          </p>
        </motion.header>

        {/* Search & Filter */}
        <motion.div variants={itemVariants} className="mb-10">
          <div className="relative flex items-center bg-white rounded-3xl px-6 py-4 shadow-sm border border-outline-variant/10 focus-within:ring-2 focus-within:ring-primary/10 transition-all">
            <span className="material-symbols-outlined text-outline mr-3">search</span>
            <input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none focus:ring-0 p-0 text-md w-full placeholder:text-outline-variant font-semibold" 
              placeholder="Search for a specific care..." 
              type="text"
            />
          </div>
        </motion.div>

        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-12"
        >
          <AnimatePresence mode="popLayout">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-32 bg-white rounded-[2.5rem] p-7 border border-outline-variant/10 shadow-sm animate-pulse flex items-center gap-6">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100" />
                    <div className="flex-1 space-y-3">
                      <div className="h-4 bg-slate-100 rounded w-1/2" />
                      <div className="h-3 bg-slate-100 rounded w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // Grouped Render
              Object.entries(
                filteredServices.reduce((acc, service) => {
                  const catName = service.categoryId?.mainCategory || 'Uncategorized';
                  if (!acc[catName]) acc[catName] = [];
                  acc[catName].push(service);
                  return acc;
                }, {})
              ).map(([categoryName, catServices]) => (
                <div key={categoryName} className="space-y-6">
                  <div className="flex items-center gap-4">
                    <h2 className="text-sm font-black uppercase tracking-[0.3em] text-primary whitespace-nowrap">{categoryName}</h2>
                    <div className="h-px w-full bg-slate-100" />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {catServices.map((service) => (
                      <motion.div 
                        key={service._id}
                        layout
                        variants={itemVariants}
                        initial="hidden"
                        animate="visible"
                        exit={{ opacity: 0, scale: 0.95 }}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        className="bg-white rounded-[2.5rem] p-7 border border-outline-variant/10 shadow-sm flex items-center justify-between group hover:shadow-xl hover:shadow-primary/5 transition-all"
                      >
                        <div className="flex items-center gap-6">
                          <div className={`w-16 h-16 rounded-2xl bg-primary-container/20 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors overflow-hidden`}>
                            {service.image || service.icon ? (
                                <img src={service.image || service.icon} alt={service.name} className="w-full h-full object-cover" />
                            ) : (
                                <span className="material-symbols-outlined text-3xl">local_laundry_service</span>
                            )}
                          </div>
                          <div>
                            <h3 className="font-headline font-black text-lg text-on-surface leading-tight mb-1">{service.itemName || service.name}</h3>
                            <p className="text-on-surface-variant text-[11px] font-bold opacity-60 leading-relaxed line-clamp-1">
                              {service.categoryId?.subCategory} • {service.description}
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                              {servicePricing(service, { pricingFactor, allowDiscount, isExpress, expressMultiplier, isHeritage, heritageMultiplier }).hasDiscount && (
                                <span className="text-[10px] font-bold text-slate-400 line-through">
                                  ₹{servicePricing(service, { pricingFactor, allowDiscount, isExpress, expressMultiplier, isHeritage, heritageMultiplier }).originalPrice}
                                </span>
                              )}
                              <span className="text-[12px] font-black text-primary uppercase tracking-widest">
                                ₹{servicePricing(service, { pricingFactor, allowDiscount, isExpress, expressMultiplier, isHeritage, heritageMultiplier }).price}/{service.unit?.replace('_', ' ')}
                              </span>
                            </div>
                          </div>
                        </div>
                        <span className="material-symbols-outlined text-outline-variant group-hover:text-primary transition-all opacity-0 group-hover:opacity-100 translate-x-[-10px] group-hover:translate-x-0">chevron_right</span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </AnimatePresence>
        </motion.div>


        {filteredServices.length === 0 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-20 flex flex-col items-center text-center opacity-40"
          >
            <span className="material-symbols-outlined text-6xl mb-4">search_off</span>
            <p className="font-black text-xs uppercase tracking-widest leading-relaxed">No services found matching <br/>"{searchQuery}"</p>
          </motion.div>
        )}
      </main>
    </motion.div>
  );
};

export default AllServicesPage;
