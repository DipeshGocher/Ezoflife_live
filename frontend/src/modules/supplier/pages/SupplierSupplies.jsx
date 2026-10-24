import BrandLogo from '../../../shared/components/BrandLogo.jsx';
import React from "react";
import { useNavigate } from "react-router-dom";
// eslint-disable-next-line no-unused-vars
import { motion } from "framer-motion";

const SupplierSupplies = () => {
  const navigate = useNavigate();
  const user = JSON.parse(
    localStorage.getItem("supplierData") ||
      localStorage.getItem("userData") ||
      localStorage.getItem("user") ||
      "{}",
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="text-slate-900 pb-2 font-sans">
      {/* Header */}
      <header className="px-6 pt-2 flex items-center justify-between mb-6 max-w-md mx-auto">
        <div className="flex items-center gap-2">
          <BrandLogo className="h-10 w-auto" />
          <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1 animate-pulse"></div>
        </div>

        {/* Profile Icon */}
        <motion.div
          onClick={() => navigate("/supplier/profile")}
          whileHover={{ scale: 1.05 }}
          className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden cursor-pointer border border-slate-200">
          {user.avatar ? (
            <img
              src={user.avatar}
              alt="Profile"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="material-symbols-outlined text-slate-500 text-[20px]">
              person
            </span>
          )}
        </motion.div>
      </header>

      <main className="px-6 space-y-6 max-w-md mx-auto">
        <div className="grid grid-cols-2 gap-4">
          {/* Row 1: My Supplies */}
          <motion.div
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/supplier/my-supplies")}
            className="col-span-2 bg-white rounded-[1.8rem] p-5 shadow-[0_15px_40px_rgba(0,0,0,0.04)] relative overflow-hidden group cursor-pointer border border-slate-100">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-[60px] -mr-10 -mt-10 group-hover:scale-150 transition-transform duration-700"></div>
            <div className="relative z-10 flex items-center justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    Inventory Control
                  </p>
                </div>
                <h2 className="text-lg font-black text-slate-950 tracking-tight uppercase">
                  My Supplies
                </h2>
                <p className="text-[8px] text-slate-400 font-black uppercase leading-relaxed max-w-[240px] tracking-widest">
                  Manage your supplies registry, update wholesale rates, bulk
                  discounts, and active status instantly.
                </p>
              </div>
              <div className="w-12 h-12 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center text-slate-900 group-hover:bg-slate-900 group-hover:text-white transition-all duration-500">
                <span className="material-symbols-outlined text-xl">
                  inventory_2
                </span>
              </div>
            </div>
          </motion.div>

          {/* Row 2: Hire Talent */}
          <motion.div
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/supplier/labor-request")}
            className="col-span-2 bg-white rounded-[1.8rem] p-5 shadow-[0_15px_40px_rgba(0,0,0,0.04)] relative overflow-hidden group cursor-pointer border border-slate-100">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50/40 rounded-full blur-[60px] -mr-10 -mt-10 group-hover:scale-150 transition-transform duration-700"></div>
            <div className="relative z-10 flex items-center justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    Staffing Solutions
                  </p>
                </div>
                <h2 className="text-lg font-black text-slate-950 tracking-tight uppercase">
                  Hire Talent
                </h2>
                <p className="text-[8px] text-slate-400 font-black uppercase leading-relaxed max-w-[240px] tracking-widest">
                  Submit labor requests and hire skilled helpers for your
                  facility.
                </p>
              </div>
              <div className="w-12 h-12 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center text-slate-900 group-hover:bg-slate-900 group-hover:text-white transition-all duration-500">
                <span className="material-symbols-outlined text-xl">
                  groups
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </main>
    </motion.div>
  );
};

export default SupplierSupplies;
