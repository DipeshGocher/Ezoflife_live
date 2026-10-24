import BrandLogo from '../../../shared/components/BrandLogo.jsx';
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, Boxes, User, Grid, RefreshCw } from 'lucide-react';

const navItems = [
  { label: 'Home', icon: Home, path: '/supplier/dashboard' },
  { label: 'Supplies', icon: Boxes, path: '/supplier/supplies' },
  { label: 'Profile', icon: User, path: '/supplier/profile' },
  { label: 'More', icon: Grid, path: '/supplier/more' },
];

const SupplierHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  const user = JSON.parse(
    localStorage.getItem('supplierData') || 
    localStorage.getItem('userData') || 
    localStorage.getItem('user') || 
    '{}'
  );

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs min-h-[64px] flex items-center">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 w-full flex items-center justify-between">
        
        {/* Brand Logo & Portal Tag */}
        <div className="flex items-center gap-3">
          <div 
            onClick={() => navigate('/supplier/dashboard')}
            className="flex items-center gap-2 cursor-pointer group"
          >
            <BrandLogo className="h-10 w-auto" />
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold tracking-wider uppercase border border-slate-200/80">
              Supplier Hub
            </span>
          </div>
        </div>

        {/* Center Desktop Navigation Tabs (Laptop & Bigger Screens) */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-100/80 p-1 rounded-2xl border border-slate-200/60 shadow-2xs">
          {navItems.map((item) => {
            const isActive = currentPath === item.path;
            const IconComponent = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-xs transition-all cursor-pointer ${
                  isActive 
                    ? 'bg-white text-slate-950 font-bold shadow-xs' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50 font-medium'
                }`}
              >
                <IconComponent className={`w-3.5 h-3.5 ${isActive ? 'text-slate-950' : 'text-slate-400'}`} />
                <span>{item.label}</span>
                {isActive && (
                  <motion.div 
                    layoutId="supplierActiveTab"
                    className="absolute inset-0 border-2 border-slate-950/5 rounded-xl pointer-events-none"
                    transition={{ type: "spring", stiffness: 350, damping: 25 }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Right Side: Profile Button */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/supplier/profile')}
            className="flex items-center gap-2.5 p-1 sm:px-3 sm:py-1.5 rounded-full hover:bg-slate-100 transition-all cursor-pointer border border-slate-200/70 group"
          >
            <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs overflow-hidden shadow-2xs">
              {user.avatar || user.image ? (
                <img src={user.avatar || user.image} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                (user.displayName || user.name || 'S').charAt(0).toUpperCase()
              )}
            </div>
            <span className="hidden sm:inline text-xs font-semibold text-slate-800 group-hover:text-slate-950">
              {user.displayName || user.name || 'Supplier Profile'}
            </span>
          </button>
        </div>

      </div>
    </header>
  );
};

export default SupplierHeader;
