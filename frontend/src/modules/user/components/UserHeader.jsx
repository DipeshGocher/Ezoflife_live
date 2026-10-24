import BrandLogo from '../../../shared/components/BrandLogo.jsx';
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import useNotificationStore from "../../../shared/stores/notificationStore";
import { useLocationStore } from "../../../shared/stores/locationStore";

const UserHeader = () => {
  const navigate = useNavigate();
  const locationPath = useLocation();
  const isHomePage =
    locationPath.pathname === "/user/home" || locationPath.pathname === "/";

  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const { location, setPickerOpen } = useLocationStore();
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [addressType, setAddressType] = useState("HOME");

  const [addressData, setAddressData] = useState({
    line1: "",
    line2: "",
    floor: "",
    landmark: "",
    pincode: "",
    city: "",
    state: "",
  });

  const handleProfileClick = () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/user/auth");
    } else {
      navigate("/user/profile");
    }
  };

  const getSafeStorage = (key) => {
    try {
      const item = localStorage.getItem(key);
      if (!item) return {};
      return JSON.parse(item);
    } catch (e) {
      return {};
    }
  };

  const userData = getSafeStorage("user");

  const handleSaveAddress = () => {
    const fullAddr = `${addressData.line1}, ${addressData.line2}, ${addressData.city}`;
    localStorage.setItem("detected_address", fullAddr);
    setShowAddressModal(false);
    window.location.reload(); // Refresh to show updated address
  };

  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    const updateCount = () => {
      try {
        const saved = localStorage.getItem("cart_quantities");
        if (saved) {
          const quantities = JSON.parse(saved);
          const total = Object.values(quantities).reduce(
            (acc, q) => acc + (Number(q) || 0),
            0,
          );
          setCartCount(total);
        } else {
          setCartCount(0);
        }
      } catch (e) {
        setCartCount(0);
      }
    };

    updateCount();
    const interval = setInterval(updateCount, 1000); // Simple sync
    window.addEventListener("storage", updateCount);
    window.addEventListener("cart-cleared", updateCount);
    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", updateCount);
      window.removeEventListener("cart-cleared", updateCount);
    };
  }, []);

  return (
    <>
      <motion.header
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed top-0 z-[100] bg-white/80 backdrop-blur-xl w-full flex justify-between items-center px-4 md:px-6 py-1.5 border-b border-slate-100 min-h-[50px]">
        {/* 1. App Logo (Left) */}
        <div className="flex items-center gap-4">
          <div
            onClick={() => navigate("/user/home")}
            className="cursor-pointer">
            <BrandLogo className="h-10 w-auto" />
          </div>
          <div className="h-4 w-px bg-slate-200" /> {/* Divider */}
          {/* 2. Current Address (Home/Office) */}
          <div className="flex flex-col max-w-[150px] md:max-w-[200px] cursor-default">
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-black text-slate-900 uppercase tracking-widest bg-slate-100 px-1.5 py-0.5 rounded-md">
                {location && location.area
                  ? location.area.toUpperCase()
                  : "NONE"}
              </span>
            </div>
            <p className="text-[11px] font-black text-slate-950 truncate leading-tight mt-0.5">
              {location
                ? location.fullAddress || location.city
                : "Select Location"}
            </p>
          </div>
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center gap-3">
          {/* 3. Cart Icon (Show if items exist) */}
          {cartCount > 0 && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate("/user/cart")}
              className="relative w-8 h-8 flex items-center justify-center cursor-pointer group">
              <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center group-hover:bg-slate-950 group-hover:text-white transition-all border border-slate-100">
                <span className="material-symbols-outlined text-[18px]">
                  shopping_bag
                </span>
              </div>
              <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-rose-500 text-white text-[7px] font-black flex items-center justify-center rounded-full px-1 border-2 border-white shadow-sm">
                {cartCount}
              </span>
            </motion.div>
          )}

          {/* 4. Profile Icon */}
          <motion.div
            onClick={handleProfileClick}
            whileHover={{ scale: 1.05 }}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden cursor-pointer border border-slate-200">
            {userData.avatar ? (
              <img
                src={userData.avatar}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="material-symbols-outlined text-slate-500 text-[16px]">
                person
              </span>
            )}
          </motion.div>
        </div>
      </motion.header>

      {/* LOCATE ADDRESS MODAL */}
      <AnimatePresence>
        {showAddressModal && (
          <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center p-0 sm:p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddressModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Modal Content */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-lg bg-white rounded-t-[3rem] sm:rounded-[3rem] p-8 shadow-2xl flex flex-col gap-6 overflow-y-auto max-h-[90vh] hide-scrollbar">
              {/* Handle Bar */}
              <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-2 shrink-0 sm:hidden" />

              <div className="flex flex-col gap-1">
                <h2 className="text-3xl font-black tracking-tighter text-slate-900 leading-none">
                  ADD FULL <br />
                  ADDRESS.
                </h2>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mt-2">
                  Details for accurate delivery
                </p>
              </div>

              {/* Type Toggle */}
              <div className="flex gap-2 p-1.5 bg-slate-50 rounded-2xl border border-slate-100">
                {["HOME", "OFFICE", "OTHER"].map((type) => (
                  <button
                    key={type}
                    onClick={() => setAddressType(type)}
                    className={`flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${addressType === type ? "bg-black text-white shadow-lg shadow-black/20" : "text-slate-400"}`}>
                    {type}
                  </button>
                ))}
              </div>

              {/* Form Fields */}
              <div className="flex flex-col gap-5">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-900 ml-4">
                    Address Line 1
                  </label>
                  <input
                    type="text"
                    value={addressData.line1}
                    onChange={(e) =>
                      setAddressData({ ...addressData, line1: e.target.value })
                    }
                    placeholder="Flat/House No, Building Name"
                    className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 text-sm font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-black transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-900 ml-4">
                    Address Line 2
                  </label>
                  <input
                    type="text"
                    value={addressData.line2}
                    onChange={(e) =>
                      setAddressData({ ...addressData, line2: e.target.value })
                    }
                    placeholder="Street, Area Name"
                    className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 text-sm font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-black transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-900 ml-4">
                      Floor / Apt
                    </label>
                    <input
                      type="text"
                      value={addressData.floor}
                      onChange={(e) =>
                        setAddressData({
                          ...addressData,
                          floor: e.target.value,
                        })
                      }
                      placeholder="e.g. 4th Floor"
                      className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 text-sm font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-black transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-900 ml-4">
                      Landmark
                    </label>
                    <input
                      type="text"
                      value={addressData.landmark}
                      onChange={(e) =>
                        setAddressData({
                          ...addressData,
                          landmark: e.target.value,
                        })
                      }
                      placeholder="Near Temple/Gym"
                      className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 text-sm font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-black transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-900 ml-4">
                      Pincode
                    </label>
                    <input
                      type="text"
                      value={addressData.pincode}
                      onChange={(e) =>
                        setAddressData({
                          ...addressData,
                          pincode: e.target.value,
                        })
                      }
                      placeholder="6-digit ZIP"
                      className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 text-sm font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-black transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-900 ml-4">
                      City
                    </label>
                    <input
                      type="text"
                      value={addressData.city}
                      onChange={(e) =>
                        setAddressData({ ...addressData, city: e.target.value })
                      }
                      placeholder="City Name"
                      className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 text-sm font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-black transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 mb-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-900 ml-4">
                    State
                  </label>
                  <input
                    type="text"
                    value={addressData.state}
                    onChange={(e) =>
                      setAddressData({ ...addressData, state: e.target.value })
                    }
                    placeholder="State Name"
                    className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 text-sm font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-black transition-all"
                  />
                </div>
              </div>

              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleSaveAddress}
                className="w-full bg-black text-white py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-black/20 hover:shadow-black/30 transition-all mt-4">
                SAVE ADDRESS
              </motion.button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default UserHeader;
