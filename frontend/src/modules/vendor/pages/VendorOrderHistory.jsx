import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import VendorHeader from "../components/VendorHeader";
import { orderApi } from "../../../lib/api";

const VendorOrderHistory = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState("active");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const vendorData = JSON.parse(localStorage.getItem("vendorData") || "{}");
  const vendorId = vendorData?._id || vendorData?.id;

  useEffect(() => {
    const fetchOrders = async () => {
      if (!vendorId) return;
      try {
        setLoading(true);
        const data = await orderApi.getVendorOrders(vendorId);
        setOrders(data);
      } catch (err) {
        console.error("Error fetching order history:", err);
      } finally {
        setTimeout(() => {
          setLoading(false);
        }, 5000);
      }
    };
    fetchOrders();
  }, [vendorId]);

  const activeOrders = useMemo(() => {
    return orders.filter((o) => !["DELIVERED", "CANCELLED"].includes(o.status));
  }, [orders]);

  const completedOrders = useMemo(() => {
    let list = orders.filter((o) =>
      ["DELIVERED", "CANCELLED"].includes(o.status),
    );
    if (startDate && endDate) {
      const start = new Date(startDate).setHours(0, 0, 0, 0);
      const end = new Date(endDate).setHours(23, 59, 59, 999);
      list = list.filter((o) => {
        const time = new Date(o.createdAt).getTime();
        return time >= start && time <= end;
      });
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else {
      list = [...list]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 50);
    }
    return list;
  }, [orders, startDate, endDate]);

  const getFriendlyStatus = (status) => {
    if (status === "ORDER_PLACED") return "New Order";
    if (["PICKUP_ASSIGNED", "PICKUP_IN_PROGRESS"].includes(status))
      return "Awaiting Pickup";
    if (["COLLECTED", "TRANSIT_TO_VENDOR"].includes(status))
      return "In Transit";
    if (status === "RECEIVED_BY_VENDOR") return "Sorting";
    if (status === "PROCESSING") return "In Progress";
    if (status === "READY_FOR_DISPATCH") return "Ready to Ship";
    if (status === "DELIVERY_IN_PROGRESS") return "Dispatched";
    if (status === "DELIVERED") return "Completed";
    return status;
  };

  if (loading) {
    return (
      <div className="text-[#1E293B] min-h-screen pb-32 font-sans bg-[#F8FAFC]">
        <main className="max-w-xl mx-auto px-6 py-8">
          {/* Tabs skeleton */}
          <div className="flex bg-slate-100 p-1.5 rounded-full w-fit mb-10 border border-slate-200 ml-auto mr-auto animate-pulse">
            <div className="w-[100px] h-10 bg-white rounded-full"></div>
            <div className="w-[100px] h-10 bg-transparent rounded-full"></div>
          </div>

          {/* Cards skeleton */}
          <div className="space-y-6">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 relative overflow-hidden animate-pulse">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <div className="w-16 h-3 bg-slate-200 rounded mb-4"></div>
                    <div className="w-40 h-6 bg-slate-200 rounded mb-2"></div>
                    <div className="w-24 h-3 bg-slate-100 rounded"></div>
                  </div>
                  <div className="w-20 h-6 bg-slate-200 rounded"></div>
                </div>
                <div className="w-full h-12 bg-slate-50 border border-slate-100 rounded-2xl"></div>
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="text-[#1E293B] min-h-screen pb-32 font-sans">
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="max-w-xl mx-auto px-6 py-8">
        <div className="flex bg-slate-100 p-1.5 rounded-full w-fit mb-10 border border-slate-200 ml-auto mr-auto">
          {[
            { key: "active", label: "Active" },
            { key: "completed", label: "Completed" },
          ].map(({ key, label }) => (
            <motion.button
              key={key}
              onClick={() => setTab(key)}
              whileTap={{ scale: 0.95 }}
              className={`px-10 py-3 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${tab === key ? "bg-white text-[#3D5AFE] shadow-sm" : "text-slate-400 opacity-60 hover:opacity-100"}`}>
              {label}
            </motion.button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {tab === "active" ? (
            <motion.div
              key="active"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-6">
              {activeOrders.map((order) => (
                <motion.div
                  key={order._id}
                  whileHover={{ y: -5 }}
                  className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 relative overflow-hidden group cursor-pointer"
                  onClick={() => navigate(`/vendor/order/${order._id}`)}>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#3D5AFE]/5 rounded-full -mr-16 -mt-16 blur-2xl"></div>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <motion.span
                          animate={{
                            scale: [1, 1.3, 1],
                            opacity: [0.5, 1, 0.5],
                          }}
                          transition={{ duration: 2, repeat: Infinity }}
                          className="w-2 h-2 rounded-full bg-[#3D5AFE]"></motion.span>
                        <span className="text-[#3D5AFE] font-bold text-[10px] tracking-widest uppercase">
                          {getFriendlyStatus(order.status)}
                        </span>
                      </div>
                      <h3 className="text-xl font-bold text-slate-800 tracking-tight">
                        {order.orderId}
                      </h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 opacity-60">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-slate-800 tracking-tighter">
                      ₹{order.totalAmount}
                    </p>
                  </div>
                  <button className="w-full py-4 text-[#3D5AFE] font-bold text-xs uppercase tracking-widest border border-[#3D5AFE]/10 rounded-2xl flex items-center justify-center gap-3 hover:bg-[#3D5AFE]/5 transition-all">
                    Details
                  </button>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/vendor/order/${order._id}`);
                      }}
                      className="flex-1 py-3.5 text-[#3D5AFE] font-bold text-xs uppercase tracking-widest border border-[#3D5AFE]/20 rounded-2xl flex items-center justify-center gap-2 hover:bg-[#3D5AFE]/5 transition-all">
                      Details
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/vendor/order-chat/${order._id}`);
                      }}
                      className="px-4 py-3.5 bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 rounded-2xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all shadow-xs"
                      title="Report Issue to Admin / Support">
                      <span className="material-symbols-outlined text-sm">
                        support_agent
                      </span>
                      Issue
                    </button>
                  </div>
                </motion.div>
              ))}
              {activeOrders.length === 0 && (
                <p className="text-center text-slate-400 py-10">
                  No active orders
                </p>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="completed"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-6">
              <div className="flex gap-3 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
                <div className="flex-1 space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
                {(startDate || endDate) && (
                  <div className="flex items-end">
                    <button
                      onClick={() => {
                        setStartDate("");
                        setEndDate("");
                      }}
                      className="h-[42px] px-4 bg-rose-50 text-rose-500 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-rose-100 hover:bg-rose-100 transition-all">
                      Clear
                    </button>
                  </div>
                )}
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300 px-2 text-center">
                {completedOrders.length} completed orders
              </p>
              {completedOrders.map((order, i) => (
                <motion.div
                  key={order._id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  whileHover={{ y: -3 }}
                  className="bg-white rounded-3xl p-8 border border-slate-50 shadow-sm opacity-90">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="material-symbols-outlined text-[18px] text-slate-300">
                          check_circle
                        </span>
                        <span className="text-slate-400 font-bold text-[10px] tracking-widest uppercase">
                          {getFriendlyStatus(order.status)}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-slate-800 tracking-tight">
                        {order.orderId}
                      </h3>
                      <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-1">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <p className="text-xl font-bold text-slate-300 tracking-tighter">
                      ₹{order.totalAmount}
                    </p>
                  </div>
                  <p className="text-xs font-medium text-slate-400 bg-slate-50 p-4 rounded-xl leading-relaxed italic">
                    {order.items
                      .map((item) => `${item.quantity}x ${item.name}`)
                      .join(", ")}
                  </p>
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100">
                    <button
                      onClick={() => navigate(`/vendor/order/${order._id}`)}
                      className="text-[10px] font-bold text-slate-500 hover:text-slate-800 uppercase tracking-wider">
                      View Order
                    </button>
                    <button
                      onClick={() =>
                        navigate(`/vendor/order-chat/${order._id}`)
                      }
                      className="flex items-center gap-1 text-[10px] font-bold text-rose-500 hover:text-rose-700 uppercase tracking-wider">
                      <span className="material-symbols-outlined text-xs">
                        support_agent
                      </span>
                      Support
                    </button>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.main>
    </div>
  );
};

export default VendorOrderHistory;
