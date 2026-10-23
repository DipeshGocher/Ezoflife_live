import { servicePricing } from '../../../lib/servicePricing';
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { serviceApi, masterServiceApi, BASE_URL } from '../../../lib/api';
import { useLocationStore } from '../../../shared/stores/locationStore';

const SearchResultsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const initialQuery = useMemo(() => new URLSearchParams(location.search).get('q') || '', [location.search]);
  const [query, setQuery] = useState(initialQuery);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const { location: userLocation, zone, pricingFactor, allowDiscount, expressMultiplier, heritageMultiplier } = useLocationStore();
  
  const isExpress = localStorage.getItem('is_express') === 'true';
  const isHeritage = localStorage.getItem('selected_tier') === 'Heritage';

  useEffect(() => {
    const fetchServices = async () => {
      try {

        // All customers use the standard catalogue, including GST-registered businesses.
        const [masterRes, vendorRes] = await Promise.all([
            masterServiceApi.getAll({ serviceType: 'individual', activeOnly: true }),
            serviceApi.getAll({ approvedOnly: true, serviceType: 'individual' })
        ]);
        
        // Combine and filter: Only show Approved or Master services
        const combined = [
            ...masterRes.map(s => ({ ...s, isMaster: true })),
            ...vendorRes.map(s => ({ ...s, isMaster: false }))
        ].filter(s => (s.status === 'Active' || s.isActive === true || s.active === true) && (s.isMaster || s.approvalStatus === 'Approved'));

        setServices(combined);
      } catch (err) {
        console.error('Search fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchServices();
  }, []);

  const results = useMemo(() => {
    // if (userLocation && !zone) return [];
    
    return services.filter(item => {
      const q = query.toLowerCase();
      const nameMatch = (item.name || '').toLowerCase().includes(q);
      const descMatch = (item.description || '').toLowerCase().includes(q);
      const tagsMatch = item.tags && item.tags.some(tag => tag.toLowerCase().includes(q));
      
      return nameMatch || descMatch || tagsMatch;
    });
  }, [services, query, userLocation, zone]);

  const containerVariants = useMemo(() => ({
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  }), []);

  const itemVariants = useMemo(() => ({
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { duration: 0.4, ease: "easeOut" } }
  }), []);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-background text-on-background min-h-[100dvh] flex flex-col"
    >
      <header className="fixed top-0 z-50 bg-white/70 backdrop-blur-xl w-full px-6 py-4 border-b border-outline-variant/10">
        <div className="max-w-5xl mx-auto w-full flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="material-symbols-outlined text-outline">arrow_back</button>
            <div className="flex-1 relative flex items-center bg-surface-container-low rounded-2xl px-4 py-2 border border-outline-variant/5">
                <span className="material-symbols-outlined text-outline text-sm mr-2">search</span>
                <input 
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search services..."
                    className="bg-transparent border-none focus:ring-0 p-0 text-sm font-bold w-full placeholder:text-outline-variant/40"
                    autoFocus
                />
            </div>
        </div>
      </header>

      <motion.main 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-2xl mx-auto px-6 pt-16 pb-36 w-full"
      >
        <motion.div variants={itemVariants} className="mb-8">
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-4 opacity-60">
                {results.length} results for "{query}"
            </h2>
        </motion.div>

        <div className="space-y-4">
            <AnimatePresence mode="popLayout">
                {results.map((item) => (
                    <motion.div 
                        key={item._id || item.id}
                        layout
                        variants={itemVariants}
                        initial="hidden"
                        animate="visible"
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-white p-6 rounded-[2rem] border border-outline-variant/10 shadow-sm flex items-center justify-between group"
                    >
                        <div className="flex items-center gap-5">
                            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                                {item.image ? (
                                    <img src={item.image} alt={item.name} className="w-full h-full object-cover rounded-2xl" />
                                ) : (
                                    <span className="material-symbols-outlined text-2xl">{item.icon || 'local_laundry_service'}</span>
                                )}
                            </div>
                            <div>
                                <h3 className="font-headline font-black text-lg text-on-surface">{item.name}</h3>
                                <p className="text-[11px] font-bold text-on-surface-variant opacity-60">{item.description}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="font-headline font-black text-primary text-sm">₹{servicePricing(item, { pricingFactor, allowDiscount, isExpress, expressMultiplier, isHeritage, heritageMultiplier }).price}</p>
                            <span className="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors text-lg">chevron_right</span>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>

            {results.length === 0 && (
                <div className="py-20 text-center opacity-40">
                    <span className="material-symbols-outlined text-6xl mb-4">search_off</span>
                    <p className="font-black text-xs uppercase tracking-widest leading-relaxed">No services found matching<br/>your criteria.</p>
                </div>
            )}
        </div>
      </motion.main>
    </motion.div>
  );
};

export default SearchResultsPage;

