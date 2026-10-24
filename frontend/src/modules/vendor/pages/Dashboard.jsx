import { appDialog } from '../../../shared/stores/appDialogStore';
import React, { useState, useMemo, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import VendorHeader from "../components/VendorHeader";
import { ArrowUpRight, Clock3, Headset, Timer } from "lucide-react";
import { orderApi, authApi, vendorPaymentApi } from "../../../lib/api";
import useNotificationStore from "../../../shared/stores/notificationStore";
import socket, { subscribeSocketRooms } from "../../../lib/socket";
import { requestForToken } from "../../../lib/firebase";
import InvoicePreview from "../components/InvoicePreview";

const IncomingTimer = ({ duration, onExpire }) => {
  const [timeLeft, setTimeLeft] = useState(duration);
  useEffect(() => {
    if (timeLeft <= 0) {
      onExpire();
      return;
    }
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  return (
    <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest tabular-nums">
      00:{timeLeft.toString().padStart(2, "0")}
    </p>
  );
};

const PoolOrderCard = ({ order, onAccept, acceptingId }) => {
  // Determine Vendor Rate
  const platformFee = order.priceBreakdown?.platformFee || 0;
  const logisticsFee = order.priceBreakdown?.logisticsFee || 0;
  const approxEarnings = (
    order.totalAmount -
    platformFee -
    logisticsFee
  ).toFixed(0);

  const isDropoffSame =
    !order.dropAddress || order.dropAddress === order.pickupAddress;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, x: -100 }}
      className="w-[340px] bg-white text-slate-900 rounded-[2rem] p-4 border border-slate-200 shadow-sm shrink-0 flex flex-col gap-3">
      {/* Row 1: Accept Button (Left) | Order ID (Right) */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => onAccept(order._id)}
          disabled={acceptingId === order._id}
          className={`px-5 py-2.5 rounded-full font-black text-[9px] uppercase tracking-widest transition-all flex items-center gap-1.5 ${
            acceptingId === order._id
              ? "bg-slate-200 text-slate-500"
              : "bg-black text-white hover:bg-slate-800 shadow-md"
          }`}>
          {acceptingId === order._id ? (
            <>
              <span className="material-symbols-outlined text-[10px] animate-spin">
                refresh
              </span>
              Processing
            </>
          ) : (
            "Accept"
          )}
        </button>
        <span className="text-[10px] font-black bg-black text-white px-3 py-1 rounded-full uppercase tracking-widest shadow-sm">
          {order.orderId}
        </span>
      </div>

      {/* Concise Order Summary Box in Dark Theme (no address tags, only times & rate) */}
      <div className="bg-slate-950 text-white rounded-[1.8rem] p-4.5 shadow-xl relative overflow-hidden group border border-white/5">
        <div className="absolute right-0 top-0 p-4 opacity-[0.03] rotate-12 pointer-events-none">
          <span className="material-symbols-outlined text-[60px]">
            receipt_long
          </span>
        </div>

        <div className="grid grid-cols-[1.1fr_1.4fr] gap-3.5 relative z-10">
          {/* Left Side: Tier & Mode */}
          <div className="space-y-3.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-white/60 text-[12px]">
                  workspace_premium
                </span>
              </div>
              <div className="flex-1 text-left">
                <p className="text-[7px] font-black text-white/30 uppercase tracking-widest leading-none mb-0.5">
                  Tier
                </p>
                <p className="text-[10px] font-black text-white uppercase">
                  {order.tier || "Essential"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-white/60 text-[12px]">
                  bolt
                </span>
              </div>
              <div className="flex-1 text-left">
                <p className="text-[7px] font-black text-white/30 uppercase tracking-widest leading-none mb-0.5">
                  Delivery Mode
                </p>
                <p className="text-[10px] font-black text-white uppercase">
                  {order.deliveryMode || "Normal"}
                </p>
              </div>
            </div>
          </div>

          {/* Right Side: Pickup, Drop & Price */}
          <div className="space-y-3.5 flex flex-col justify-between">
            <div className="space-y-3.5">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-white/60 text-[12px]">
                    calendar_today
                  </span>
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-[7px] font-black text-white/30 uppercase tracking-widest leading-none mb-1.5 whitespace-nowrap">
                    Pickup Time
                  </p>
                  <p className="text-[9px] font-black text-white uppercase truncate mt-0.5">
                    {order.pickupSlot?.time || "07:00 AM - 09:00 AM"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-white/60 text-[12px]">
                    local_shipping
                  </span>
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-[7px] font-black text-white/30 uppercase tracking-widest leading-none mb-1.5 whitespace-nowrap">
                    Dropoff Time
                  </p>
                  <p className="text-[9px] font-black text-white uppercase truncate mt-0.5">
                    {order.deliverySlot?.time ||
                      order.pickupSlot?.time ||
                      "07:00 AM - 09:00 AM"}
                  </p>
                </div>
              </div>
            </div>
            {/* Price in the right corner, large font size, no icon/label */}
            <div className="flex justify-end items-end mt-auto">
              <span className="text-[18px] font-black text-white tracking-tight">
                ₹{order.totalAmount}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Article Details with Service Name & Images vertically stacked */}
      <div className="border-t border-slate-100 pt-3.5 px-1 space-y-4">
        <p className="text-[8px] font-black text-slate-900 uppercase tracking-[0.2em] text-left mb-1">
          Article Details
        </p>
        <div className="space-y-4 text-left">
          {order.items?.map((item, idx) => {
            const itemImg =
              (order.customerPhotos && order.customerPhotos[idx]) ||
              (order.customerPhotos && order.customerPhotos[0]) ||
              (item.photos && item.photos[0]);
            return (
              <div key={idx} className="space-y-2">
                {/* Service Name & Qty */}
                <div className="flex justify-between items-center bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                  <p className="text-[9.5px] font-black text-slate-800 uppercase tracking-wide leading-none">
                    {item.name}
                  </p>
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest bg-slate-200/60 px-2.5 py-1 rounded-md">
                    QTY: {item.quantity}
                  </span>
                </div>
                {/* Service Image */}
                <div className="w-full h-32 rounded-2xl bg-slate-50/50 border border-slate-200/40 flex items-center justify-center text-slate-300 overflow-hidden shadow-inner">
                  {itemImg ? (
                    <img
                      src={itemImg.url || itemImg}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-1 opacity-40">
                      <span className="material-symbols-outlined text-3xl">
                        dry_cleaning
                      </span>
                      <span className="text-[8px] font-bold uppercase tracking-widest">
                        No Image Uploaded
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
};

const isToday = (dateInput) => {
  if (!dateInput) return false;
  const d = new Date(dateInput);
  const today = new Date();
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  );
};

const isYesterday = (dateInput) => {
  if (!dateInput) return false;
  const d = new Date(dateInput);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return (
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear()
  );
};

const parsePickupSlotToDate = (dateStr, timeStr) => {
  try {
    if (!dateStr) return null;
    let dateObj = new Date();
    const upperDateStr = dateStr.toUpperCase();
    if (upperDateStr.includes("TODAY")) {
      // Already today
    } else if (upperDateStr.includes("TOMORROW")) {
      dateObj.setDate(dateObj.getDate() + 1);
    } else {
      const parts = dateStr.split(",");
      const datePart = parts[1] || parts[0];
      const parsed = new Date(datePart);
      if (!isNaN(parsed.getTime())) {
        dateObj = parsed;
        dateObj.setFullYear(new Date().getFullYear());
      }
    }

    if (timeStr) {
      const startTimeStr = timeStr.split("-")[0].trim();
      const match = startTimeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (match) {
        let hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const ampm = match[3].toUpperCase();
        if (ampm === "PM" && hours < 12) hours += 12;
        if (ampm === "AM" && hours === 12) hours = 0;
        dateObj.setHours(hours, minutes, 0, 0);
      } else {
        dateObj.setHours(12, 0, 0, 0);
      }
    } else {
      dateObj.setHours(12, 0, 0, 0);
    }
    return dateObj;
  } catch (e) {
    console.error("Error parsing pickup slot:", dateStr, timeStr, e);
    return null;
  }
};

const isUpcomingPickup = (dateStr, timeStr) => {
  const pickupDate = parsePickupSlotToDate(dateStr, timeStr);
  if (!pickupDate) return false;
  const now = new Date();
  const diffMs = pickupDate.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  return diffHours >= -1 && diffHours <= 8;
};

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(
    location.state?.initialTab || "Available",
  );
  const [isOnline, setIsOnline] = useState(true);
  const [allOrders, setAllOrders] = useState([]);
  const [poolOrders, setPoolOrders] = useState([]);
  const [ignoredOrders, setIgnoredOrders] = useState(() => {
    const saved = localStorage.getItem("ignored_orders");
    return saved ? JSON.parse(saved) : [];
  });
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState(null);
  const [summary, setSummary] = useState(null);
  const [payoutHistory, setPayoutHistory] = useState([]);
  const { fetchNotifications } = useNotificationStore();

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState(null);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [invoiceModalOrder, setInvoiceModalOrder] = useState(null);
  const vendorDataRaw =
    localStorage.getItem("vendorData") ||
    localStorage.getItem("user") ||
    localStorage.getItem("userData") ||
    "{}";
  const vendorData = JSON.parse(vendorDataRaw);
  const vendorId =
    vendorData._id ||
    vendorData.id ||
    vendorData.user?._id ||
    vendorData.user?.id;

  const handleIgnoreOrder = (orderId) => {
    const newList = [...ignoredOrders, orderId];
    setIgnoredOrders(newList);
    localStorage.setItem("ignored_orders", JSON.stringify(newList));
    setPoolOrders((prev) => prev.filter((o) => o._id !== orderId));
  };

  const fetchOrders = async () => {
    try {
      const res = await orderApi.getVendorOrders(vendorId);
      setAllOrders(res);
    } catch (err) {
      console.error("Fetch orders error:", err);
    }
  };

  const fetchPoolOrders = async () => {
    // SECURITY: If vendor is NOT approved, don't show pool orders
    if (vendorData?.status !== "approved") {
      setPoolOrders([]);
      setLoading(false);
      return;
    }
    try {
      const res = await orderApi.getPoolOrders(vendorId);
      const filtered = res.filter((o) => !ignoredOrders.includes(o._id));
      setPoolOrders(filtered);
    } catch (err) {
      console.error("Fetch pool orders error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllData = async () => {
    try {
      const [ordersRes, summaryRes, payoutsRes] = await Promise.all([
        orderApi.getVendorOrders(vendorId),
        vendorPaymentApi.getEarningsSummary(vendorId),
        vendorPaymentApi.getPayoutHistory(vendorId).catch((err) => {
          console.error("Fetch payouts error:", err);
          return [];
        }),
      ]);
      setAllOrders(ordersRes);
      setSummary(summaryRes);
      setPayoutHistory(Array.isArray(payoutsRes) ? payoutsRes : []);
      await Promise.all([
        fetchPoolOrders(),
        fetchNotifications(vendorId, "vendor"),
      ]);
    } catch (err) {
      console.error("Fetch error:", err);
    }
  };

  useEffect(() => {
    if (!vendorId) return;

    // --- FCM TOKEN REGISTRATION ---
    const setupNotifications = async () => {
      try {
        const token = await requestForToken();
        if (token) {
          await authApi.updateFcmToken(vendorId, token);
          console.log("✅ Vendor FCM Token Updated");
        }
      } catch (err) {
        console.error("❌ Vendor FCM Registration Error:", err);
      }
    };
    setupNotifications();

    fetchAllData();
    const unsubscribeRooms = subscribeSocketRooms(socket, ['vendors_pool', `user_${vendorId}`]);

    socket.on("pool_update", (data) => {
      console.log("📦 [SOCKET] Pool update received:", data);
      if (data.action === "removed") {
        setPoolOrders((prev) => prev.filter((o) => o._id !== data.orderId));
      } else {
        fetchPoolOrders();
      }
    });

    socket.on("new_order_available", (data) => {
      console.log("🔔 [SOCKET] New order received real-time:", data);
      fetchPoolOrders();
    });

    const interval = setInterval(fetchAllData, 1800000); // Polling as fallback (30 minutes)

    return () => {
      clearInterval(interval);
      unsubscribeRooms();
      socket.off("new_order_available");
      socket.off("pool_update");
      // socket handled by singleton
    };
  }, [vendorId]);

  const categorizedOrders = useMemo(() => {
    return {
      Available: [], // Pool orders are handled separately via poolOrders state
      "In Progress": allOrders.filter((o) =>
        [
          "PICKUP_ASSIGNED",
          "RIDER_ARRIVING",
          "IN_TRANSIT",
          "RECEIVED_BY_VENDOR",
          "PROCESSING",
          "READY_FOR_DISPATCH",
          "OUT_FOR_DELIVERY",
        ].includes(o.status),
      ),
      Ready: allOrders.filter((o) => ["DELIVERED"].includes(o.status)),
    };
  }, [allOrders]);

  const displayCompletedOrders = useMemo(() => {
    let list = categorizedOrders["Ready"] || [];
    if (startDate && endDate) {
      const start = new Date(startDate).setHours(0, 0, 0, 0);
      const end = new Date(endDate).setHours(23, 59, 59, 999);
      list = list.filter((o) => {
        const time = new Date(o.createdAt || o.updatedAt).getTime();
        return time >= start && time <= end;
      });
      list.sort(
        (a, b) =>
          new Date(b.createdAt || b.updatedAt) -
          new Date(a.createdAt || a.updatedAt),
      );
    } else {
      list = [...list]
        .sort(
          (a, b) =>
            new Date(b.createdAt || b.updatedAt) -
            new Date(a.createdAt || a.updatedAt),
        )
        .slice(0, 50);
    }
    return list;
  }, [categorizedOrders, startDate, endDate]);

  const newRequestsCount = useMemo(() => {
    return poolOrders.filter((o) => isToday(o.createdAt)).length;
  }, [poolOrders]);

  const upcomingPickupsCount = useMemo(() => {
    return allOrders.filter(
      (o) =>
        o.status === "PICKUP_ASSIGNED" &&
        isUpcomingPickup(o.pickupSlot?.date, o.pickupSlot?.time),
    ).length;
  }, [allOrders]);

  const activeOrdersCount = useMemo(() => {
    return allOrders.filter(
      (o) =>
        [
          "PICKUP_ASSIGNED",
          "RIDER_ARRIVING",
          "IN_TRANSIT",
          "RECEIVED_BY_VENDOR",
          "PROCESSING",
        ].includes(o.status) &&
        (isToday(o.updatedAt) || isToday(o.createdAt)),
    ).length;
  }, [allOrders]);

  const businessBookedToday = useMemo(() => {
    return allOrders
      .filter(
        (o) =>
          (isToday(o.updatedAt) || isToday(o.createdAt)) &&
          o.status !== "CANCELLED",
      )
      .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  }, [allOrders]);

  const totalPayoutsReceivedYesterday = useMemo(() => {
    const history = Array.isArray(payoutHistory) ? payoutHistory : [];
    return history
      .filter(
        (p) =>
          p && p.status === "Completed" && isYesterday(p.paidAt || p.createdAt),
      )
      .reduce((sum, p) => sum + (p.amount || 0), 0);
  }, [payoutHistory]);

  const readyForDeliveryCount = useMemo(() => {
    return allOrders.filter((o) => o.status === "READY_FOR_DISPATCH").length;
  }, [allOrders]);

  const [selectedOrderForReady, setSelectedOrderForReady] = useState(null);

  const markAsReady = async (order) => {
    try {
      await orderApi.updateOrderStatus(order._id, "READY_FOR_DISPATCH");
      fetchOrders(); // Refresh
      setSelectedOrderForReady(null);
      await appDialog.alert(`Order ${order.orderId} marked as READY. Return rider notified!`);
    } catch (err) {
      await appDialog.alert("Error updating status");
    }
  };

  const startProcessing = async (order) => {
    try {
      await orderApi.updateOrderStatus(order._id, "PROCESSING");
      fetchOrders();
    } catch (err) {
      await appDialog.alert("Error starting process");
    }
  };

  const handleVendorAccept = async (orderId) => {
    try {
      setAcceptingId(orderId);
      await orderApi.vendorAcceptOrder(orderId, vendorId);
      fetchAllData(); // Refresh everything
      await appDialog.alert("Order Accepted! Pickup requested from Shiprocket.", { title: "Order accepted", confirmLabel: "Done" });
    } catch (err) {
      console.error("Accept error:", err);
      await appDialog.alert(
        "Failed to accept order. It might have been taken by another vendor.",
      );
    } finally {
      setAcceptingId(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="text-on-background min-h-screen pb-32 font-body">
      {/* Confirmation Modal for Mark as Ready */}
      <AnimatePresence>
        {selectedOrderForReady && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white w-full max-w-xl rounded-[2.5rem] p-8 shadow-2xl space-y-8">
              <div className="space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary mb-4">
                  <span className="material-symbols-outlined text-[24px]">
                    task_alt
                  </span>
                </div>
                <h3 className="text-2xl font-black text-on-surface tracking-tighter">
                  Ready for Handover?
                </h3>
                <p className="text-xs text-on-surface-variant font-bold uppercase tracking-widest leading-loose">
                  Confirming order{" "}
                  <span className="text-primary">
                    #{selectedOrderForReady.id}
                  </span>{" "}
                  will notify the next available rider for immediate pickup.
                </p>
              </div>

              <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-slate-400">
                  <span className="material-symbols-outlined text-xl">
                    {selectedOrderForReady.icon}
                  </span>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-on-surface">
                    {selectedOrderForReady.title}
                  </h4>
                  <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
                    {selectedOrderForReady.desc}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setSelectedOrderForReady(null)}
                  className="flex-1 py-4 rounded-full bg-slate-100 text-slate-500 font-black text-[11px] uppercase tracking-[0.2em] hover:bg-slate-200 transition-all">
                  Cancel
                </button>
                <button
                  onClick={() => markAsReady(selectedOrderForReady)}
                  className="flex-[2] py-4 rounded-full bg-primary-gradient text-white font-black text-[11px] uppercase tracking-[0.2em] shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all">
                  Confirm & Dispatch
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedOrderForDetails && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-[2rem] p-6 shadow-2xl space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">
                  Order Details
                </h3>
                <button
                  onClick={() => setSelectedOrderForDetails(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                  <span className="material-symbols-outlined text-xl">
                    close
                  </span>
                </button>
              </div>

              <div className="space-y-4">
                {selectedOrderForDetails.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-300 overflow-hidden">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="material-symbols-outlined">image</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-[11px] font-black text-slate-900 uppercase">
                        {item.name}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400">
                        Quantity: {item.quantity || 1}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <VendorHeader />

      {/* 🚀 MAIN CONTENT AREA */}
      <main className="max-w-xl mx-auto px-6 pt-2 space-y-4 min-h-screen">
        {/* 0. DAYS SUMMARY (ULTRA COMPACT BLACK & WHITE) */}
        <section className="max-w-md mx-auto w-full">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative group cursor-default">
            <div className="relative bg-black text-white p-3 rounded-2xl shadow-lg border border-neutral-900">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-2.5 px-1">
                  <p className="text-[9px] font-black text-neutral-400 uppercase tracking-[0.2em] leading-none">
                    Days Summary
                  </p>
                  <div className="w-5 h-5 rounded bg-neutral-900 flex items-center justify-center text-neutral-400">
                    <span className="material-symbols-outlined text-sm">
                      analytics
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: "New Request", value: newRequestsCount },
                    {
                      label: "Upcoming Pickups (Next 6-8 hrs.)",
                      value: upcomingPickupsCount,
                      highlight: upcomingPickupsCount > 0,
                    },
                    { label: "Active orders", value: activeOrdersCount },
                    {
                      label: "Business booked today",
                      value: `₹${businessBookedToday.toLocaleString()}`,
                    },
                    {
                      label: "Total Payouts received",
                      value: `₹${totalPayoutsReceivedYesterday.toLocaleString()}`,
                    },
                    {
                      label: "Ready for delivery",
                      value: readyForDeliveryCount,
                    },
                  ].map((stat, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center justify-between p-1.5 px-2 rounded-xl border min-h-[36px] transition-colors ${stat.highlight ? "bg-red-500/20 border-red-500/50 hover:bg-red-500/30 animate-pulse" : "bg-neutral-900/60 border-neutral-800/40 hover:bg-neutral-800/50"}`}>
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span
                          className={`text-[8px] font-black uppercase tracking-tight leading-tight line-clamp-2 ${stat.highlight ? "text-red-400" : "text-neutral-300"}`}>
                          {stat.label}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-black shrink-0 ml-1.5 ${stat.highlight ? "text-red-500" : "text-white"}`}>
                        {stat.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* 1. ORDER WORKFLOW TABS */}
        <section className="space-y-2">
          <div className="flex flex-col gap-2">
            <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-inner w-full">
              {["Available", "In Progress", "Completed"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-3 px-1 rounded-[1.1rem] text-[9px] font-black uppercase tracking-tight transition-all flex items-center justify-center gap-1.5 ${activeTab === tab ? "bg-white text-primary shadow-lg scale-[1.02]" : "text-slate-400"}`}>
                  <span className="whitespace-nowrap">{tab}</span>
                  <span
                    className={`w-4 h-4 rounded-md flex items-center justify-center text-[7px] font-black tabular-nums transition-colors ${activeTab === tab ? "bg-primary text-white" : "bg-slate-200 text-slate-400"}`}>
                    {tab === "Available"
                      ? poolOrders.length
                      : tab === "Completed"
                        ? displayCompletedOrders.length
                        : (categorizedOrders[tab] || []).length}
                  </span>
                </button>
              ))}
            </div>

            <div className="space-y-4">
              <AnimatePresence mode="wait">
                {activeTab === "Available" ? (
                  // 1. AVAILABLE TAB: Nearby Orders
                  poolOrders.length > 0 ? (
                    <div className="flex flex-col gap-6">
                      {poolOrders.map((order) => (
                        <PoolOrderCard
                          key={order._id}
                          order={order}
                          onAccept={handleVendorAccept}
                          acceptingId={acceptingId}
                          onReject={handleIgnoreOrder}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="py-24 text-center opacity-30">
                      <span className="material-symbols-outlined text-6xl mb-4 animate-pulse">
                        radar
                      </span>
                      <p className="text-[11px] font-black uppercase tracking-[0.2em]">
                        Scanning for nearby orders...
                      </p>
                    </div>
                  )
                ) : (
                  // 2. IN PROGRESS & COMPLETED TABS
                  <>
                    {activeTab === "Completed" && (
                      <div className="mb-6">
                        <motion.button
                          onClick={() => setShowDateFilter(!showDateFilter)}
                          className={`w-full py-2.5 rounded-xl font-black text-[8px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all mb-3 ${
                            showDateFilter || startDate || endDate
                              ? "bg-primary text-white shadow-lg"
                              : "bg-white text-slate-900 border border-slate-200"
                          }`}>
                          <span className="material-symbols-outlined text-xs">
                            calendar_month
                          </span>
                          {startDate || endDate
                            ? "Date Filter Active"
                            : "Filter By Date"}
                          <span
                            className="material-symbols-outlined text-xs transition-transform duration-300"
                            style={{
                              transform: showDateFilter
                                ? "rotate(180deg)"
                                : "none",
                            }}>
                            expand_more
                          </span>
                        </motion.button>
                        <AnimatePresence>
                          {showDateFilter && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden">
                              <div className="flex gap-3 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm mt-2">
                                <div className="flex-1 space-y-1">
                                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">
                                    Start Date
                                  </label>
                                  <input
                                    type={startDate ? "date" : "text"}
                                    placeholder="DD/MM/YYYY"
                                    onFocus={(e) => (e.target.type = "date")}
                                    onBlur={(e) =>
                                      !startDate && (e.target.type = "text")
                                    }
                                    value={startDate}
                                    onChange={(e) =>
                                      setStartDate(e.target.value)
                                    }
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                                  />
                                </div>
                                <div className="flex-1 space-y-1">
                                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">
                                    End Date
                                  </label>
                                  <input
                                    type={endDate ? "date" : "text"}
                                    placeholder="DD/MM/YYYY"
                                    onFocus={(e) => (e.target.type = "date")}
                                    onBlur={(e) =>
                                      !endDate && (e.target.type = "text")
                                    }
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
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                    {(activeTab === "In Progress"
                      ? categorizedOrders["In Progress"] || []
                      : displayCompletedOrders
                    ).length > 0 ? (
                      (activeTab === "In Progress"
                        ? categorizedOrders["In Progress"] || []
                        : displayCompletedOrders
                      ).map((order) => {
                        const getFriendlyStatus = (status) => {
                          if (status === "ORDER_PLACED") return "New Order";
                          if (
                            ["PICKUP_ASSIGNED", "RIDER_ARRIVING"].includes(
                              status,
                            )
                          )
                            return "Awaiting Pickup";
                          if (status === "IN_TRANSIT") return "In Transit";
                          if (status === "RECEIVED_BY_VENDOR") return "Sorting";
                          if (status === "PROCESSING") return "In Progress";
                          if (status === "READY_FOR_DISPATCH")
                            return "Ready to Ship";
                          if (status === "OUT_FOR_DELIVERY")
                            return "Dispatched";
                          if (status === "DELIVERED") return "Completed";
                          return status;
                        };

                        return (
                          <motion.div
                            key={order._id}
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4 relative overflow-hidden group">
                            <div className="flex flex-wrap justify-between items-center gap-2">
                              <span className="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-black tracking-wide">
                                {order.orderId?.startsWith("#") ? order.orderId : `#${order.orderId}`}
                              </span>
                              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-600">
                                {getFriendlyStatus(order.status)}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="min-w-0 rounded-xl bg-slate-50 border border-slate-100 px-3 py-3">
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Date & Time Received</p>
                                <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-900">
                                  <Clock3 size={17} className="shrink-0 text-slate-400" aria-hidden="true" />
                                  <span>{new Date(order.createdAt).toLocaleString("en-IN", {
                                    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                                  })}</span>
                                </div>
                              </div>
                              <div className="min-w-0 rounded-xl bg-slate-50 border border-slate-100 px-3 py-3">
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">
                                  {activeTab === "Completed" ? "Time taken" : "Time elapsed"}
                                </p>
                                <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-900">
                                  <Timer size={17} className="shrink-0 text-slate-400" aria-hidden="true" />
                                  <span>{(() => {
                                    const end = ["DELIVERED", "READY_FOR_DISPATCH"].includes(order.status)
                                      ? new Date(order.updatedAt) : new Date();
                                    const minutes = Math.max(0, Math.floor((end - new Date(order.createdAt)) / 60000));
                                    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
                                  })()}</span>
                                </div>
                              </div>
                            </div>

                            {/* Total Amount (Right Aligned for Completed Tab only) */}
                            {activeTab === "Completed" && (
                              <div className="flex items-center justify-end mt-1">
                                <span className="text-[12px] font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                                  ₹{order.totalAmount || 0}
                                </span>
                              </div>
                            )}

                            {/* Actions for Completed Tab */}
                            {activeTab === "Completed" && (
                              <div className="flex flex-col gap-1.5 mt-2 pt-2 border-t border-slate-100">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setInvoiceModalOrder(order);
                                  }}
                                  className="w-full py-1.5 bg-black text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-colors flex items-center justify-center gap-2">
                                  <span className="material-symbols-outlined text-[14px]">
                                    receipt_long
                                  </span>
                                  View invoices
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedOrderId(
                                      expandedOrderId === order._id
                                        ? null
                                        : order._id,
                                    );
                                  }}
                                  className="w-full py-1.5 bg-white text-black border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 shadow-sm">
                                  <span
                                    className="material-symbols-outlined text-[14px] transition-transform duration-300"
                                    style={{
                                      transform:
                                        expandedOrderId === order._id
                                          ? "rotate(180deg)"
                                          : "none",
                                    }}>
                                    expand_more
                                  </span>
                                  Article Detail
                                </button>
                              </div>
                            )}

                            {/* Expanded Article Details */}
                            {activeTab === "Completed" &&
                              expandedOrderId === order._id && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden mt-1.5 bg-slate-50 p-2 rounded-2xl border border-slate-100 space-y-1.5">
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                                    Services / Items
                                  </p>
                                  {order.items?.map((item, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-center justify-between py-1 border-b border-slate-200/50 last:border-0">
                                      <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-slate-800">
                                          {item.name}
                                        </span>
                                      </div>
                                      <span className="text-[10px] font-black text-slate-600 bg-white px-2 py-0.5 rounded shadow-sm border border-slate-100">
                                        Qty: {item.quantity || 1}
                                      </span>
                                    </div>
                                  ))}
                                </motion.div>
                              )}

                            {/* Order total and a single, grouped set of actions. */}
                            {activeTab !== "Completed" && (
                              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
                                <div className="min-w-0">
                                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Order total</p>
                                  <p className="mt-1 text-lg font-black text-slate-900 tabular-nums">
                                    {Number(order.totalAmount || 0).toLocaleString("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 })}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/vendor/order-chat/${order._id}`)}
                                    className="h-11 w-11 flex shrink-0 items-center justify-center bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-colors border border-rose-100"
                                    aria-label="Contact support"
                                    title="Report issue / Chat support">
                                    <Headset size={19} aria-hidden="true" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/vendor/order/${order._id}`)}
                                    className="min-h-11 flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors">
                                    View order
                                    <ArrowUpRight size={16} aria-hidden="true" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </motion.div>
                        );
                      })
                    ) : (
                      <div className="py-24 text-center opacity-30">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <span className="material-symbols-outlined text-3xl">
                            inventory_2
                          </span>
                        </div>
                        <p className="text-[11px] font-black uppercase tracking-widest">
                          No active orders
                        </p>
                      </div>
                    )}
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </section>
      </main>

      {invoiceModalOrder && <InvoicePreview order={invoiceModalOrder} onClose={() => setInvoiceModalOrder(null)} />}

    </motion.div>
  );
};

export default Dashboard;
