import BrandLogo from '../../../shared/components/BrandLogo.jsx';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import useNotificationStore from '../../../shared/stores/notificationStore';

const VendorHeader = () => {
  const navigate = useNavigate();
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const [showAddressModal, setShowAddressModal] = useState(false);
  
  const userData = JSON.parse(localStorage.getItem('user') || '{}');
  // For vendor, we'll show their shop name/address or current operational area
  const shopAddress = userData.shopAddress || 'Select Shop Location';

  const handleProfileClick = () => {
    navigate('/vendor/profile');
  };

  return (
    <>
      <motion.header 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed top-0 z-[100] bg-white/80 backdrop-blur-xl w-full flex justify-between items-center px-4 md:px-6 py-2.5 border-b border-slate-100 min-h-[64px]"
      >
        {/* 1. App Logo (Left) */}
        <div className="flex items-center gap-4">
          <div onClick={() => navigate('/vendor/dashboard')} className="cursor-pointer">
            <BrandLogo className="h-10 w-auto" />
          </div>
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center gap-3">

          <div id="vendor-header-cart-portal"></div>

          {/* 4. Profile Icon */}
          <motion.div 
            onClick={handleProfileClick}
            whileHover={{ scale: 1.05 }}
            className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden cursor-pointer border border-slate-200"
          >
            {userData.avatar ? (
              <img src={userData.avatar} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <span className="material-symbols-outlined text-slate-500 text-[20px]">person</span>
            )}
          </motion.div>
        </div>
      </motion.header>
    </>
  );
};

export default VendorHeader;
