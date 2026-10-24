import React, { useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
// eslint-disable-next-line no-unused-vars
import { motion } from "framer-motion";

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  const userRole = useMemo(() => {
    try {
      return (localStorage.getItem("userRole") || "customer").toLowerCase();
    } catch {
      return "customer";
    }
  }, []);

  const navItems = useMemo(() => {
    switch (userRole) {
      case "vendor":
        return [
          { label: "Dashboard", icon: "dashboard", path: "/vendor/dashboard" },
          {
            label: "My Services",
            icon: "local_laundry_service",
            path: "/vendor/services",
          },
          { label: "Profile", icon: "person", path: "/vendor/profile" },
          { label: "More", icon: "menu", path: "/user/more" },
        ];
      case "supplier":
        return [
          { label: "Home", icon: "home", path: "/supplier/dashboard" },
          {
            label: "Supplies",
            icon: "inventory_2",
            path: "/supplier/supplies",
          },
          { label: "Profile", icon: "person", path: "/user/profile" },
          { label: "More", icon: "menu", path: "/user/more" },
        ];
      default: // customer
        return [
          { label: "Home", icon: "home", path: "/user/home" },
          {
            label: "My Orders",
            icon: "local_laundry_service",
            path: "/user/orders",
          },
          { label: "Profile", icon: "person", path: "/user/profile" },
          { label: "More", icon: "menu", path: "/user/more" },
        ];
    }
  }, [userRole]);

  const handleNavClick = (path) => {
    // Public paths allowed without login
    const publicPaths = ["/user/home", "/user/more", "/user/land"];
    const getSafeToken = () => {
      try {
        return localStorage.getItem("token");
      } catch {
        return null;
      }
    };
    const token = getSafeToken();

    if (!token && !publicPaths.includes(path)) {
      navigate("/user/auth");
      return;
    }
    navigate(path);
  };

  return (
    <nav data-bottom-navigation className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-2xl border-t border-slate-100 pb-safe shadow-[0_-1px_10px_rgba(0,0,0,0.02)] h-16 flex justify-center">
      <motion.div className="flex justify-around items-center w-full h-full max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = currentPath === item.path;
          return (
            <motion.button
              key={item.path}
              id={`nav-${item.label.toLowerCase()}`}
              whileTap={{ scale: 0.9 }}
              onClick={() => handleNavClick(item.path)}
              className={`relative flex flex-col items-center justify-center flex-1 h-full transition-all duration-300 focus:outline-none touch-none no-underline overflow-hidden ${
                isActive ? "text-white" : "text-slate-400 hover:text-slate-600"
              }`}
              style={{ WebkitTapHighlightColor: "transparent" }}>
              {isActive && (
                <motion.div
                  layoutId="activeNavBubble"
                  className="absolute w-12 h-12 bg-black rounded-full shadow-lg shadow-black/20 z-0"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <div
                className={`relative z-10 flex flex-col items-center justify-center gap-0.5 pointer-events-none transition-transform duration-300`}>
                <span
                  className="material-symbols-outlined text-[20px]"
                  style={{
                    fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
                  }}>
                  {item.icon}
                </span>
                <span className="font-headline font-black text-[7px] uppercase tracking-widest">
                  {item.label}
                </span>
              </div>
            </motion.button>
          );
        })}
      </motion.div>
    </nav>
  );
};

export default BottomNav;
