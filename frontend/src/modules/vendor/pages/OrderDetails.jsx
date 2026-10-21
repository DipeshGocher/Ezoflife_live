import { appDialog } from '../../../shared/stores/appDialogStore';
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { orderApi, logisticsApi } from "../../../lib/api";
import { getOrderWeight } from "../../../lib/orderWeight";

const WEIGHABLE_STATUSES = ["RECEIVED_BY_VENDOR", "PROCESSING", "READY_FOR_DISPATCH"];

/** Shows the order's weight and lets the vendor record the weighed weight. */
const OrderWeightCard = ({ order, onSaved }) => {
  const weight = getOrderWeight(order);
  const canRecord = WEIGHABLE_STATUSES.includes(order.status);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const num = Number(value);
  const valid = value !== "" && num > 0 && num <= 200;

  const save = async () => {
    if (!valid) {
      setError("Enter a weight between 0.1 and 200 kg");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await orderApi.recordWeight(order._id, num);
      onSaved(res.weight);
      setEditing(false);
      setValue("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      data-testid="order-weight-card"
      className="bg-white rounded-[2rem] p-5 border border-slate-100 shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-slate-50 text-slate-600 flex items-center justify-center shrink-0 border border-slate-100">
            <span className="material-symbols-outlined text-xl">scale</span>
          </div>
          <div>
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight">
              Weight
            </h4>
            <p className="text-sm font-black text-slate-900" data-testid="order-weight-value">
              {weight.text}
              {weight.label && (
                <span className="ml-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {weight.label}
                </span>
              )}
            </p>
            {order.customerWeight && weight.source === "weighed" && (
              <p className="text-[10px] text-slate-400 font-bold">
                Customer said ~{order.customerWeight} kg
              </p>
            )}
          </div>
        </div>
        {canRecord && !editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setValue(weight.exact ? String(weight.kg) : "");
            }}
            className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-black transition-colors shrink-0 shadow-sm">
            {weight.exact ? "Update" : "Record weight"}
          </button>
        )}
      </div>
      {canRecord && editing && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                id="record-weight"
                type="number"
                inputMode="decimal"
                min="0.1"
                max="200"
                step="0.1"
                autoFocus
                placeholder="Weighed weight"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && save()}
                aria-label="Weighed weight in kg"
                aria-invalid={!!error}
                className="w-full bg-slate-50 border border-slate-200 pl-3 pr-10 py-2.5 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-slate-400"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">
                kg
              </span>
            </div>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-wider disabled:opacity-50">
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError("");
              }}
              className="px-3 py-2.5 text-slate-500 text-[10px] font-black uppercase tracking-wider">
              Cancel
            </button>
          </div>
          {error && <p className="text-[11px] text-rose-500 font-medium">{error}</p>}
        </div>
      )}
    </section>
  );
};

const OrderDetails = () => {
  const navigate = useNavigate();
  const { id: order_Id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  const [isHandshakeModalOpen, setIsHandshakeModalOpen] = useState(false);
  const [activeHandshakePhase, setActiveHandshakePhase] = useState(null); // 'Inbound' or 'Reverse'
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [verifying, setVerifying] = useState(false);

  const activeOtp = useMemo(() => {
    if (!order) return null;
    if (
      order.orderType === "Walk-In" &&
      !order.riderDropOff &&
      activeHandshakePhase === "Reverse"
    ) {
      return order.deliveryOtp || null;
    }
    if (!order.logisticsHandshakes || !activeHandshakePhase) return null;
    const handshake = order.logisticsHandshakes.find(
      (h) => h.phase === activeHandshakePhase && !h.isVerified,
    );
    return handshake ? handshake.otp : null;
  }, [order, activeHandshakePhase]);

  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("");

  const [timeLeft, setTimeLeft] = useState("--h --m --s");
  const [isOverdue, setIsOverdue] = useState(false);
  const [targetDateStr, setTargetDateStr] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    if (!order) return;

    // Terminal statuses — do NOT run countdown; order is already done
    const terminalStatuses = [
      "DELIVERED",
      "SETTLED",
      "CANCELLED",
      "Delivered",
      "Settled",
      "Cancelled",
    ];
    if (terminalStatuses.includes(order.status)) {
      setIsOverdue(false);
      setTimeLeft(order.status === "CANCELLED" ? "Cancelled" : "Delivered ✓");
      return; // No interval needed
    }

    let baseTargetDate;
    if (order.deliveryTriggerTime) {
      baseTargetDate = new Date(order.deliveryTriggerTime);
    } else if (order.deliverySlot?.date) {
      let dateStr = order.deliverySlot.date;
      if (!/\d{4}/.test(dateStr)) {
        dateStr += `, ${new Date().getFullYear()}`;
      }
      baseTargetDate = new Date(dateStr);
      if (order.deliverySlot.time) {
        const timeStr = order.deliverySlot.time.split("-")[0].trim();
        const parts = timeStr.split(" ");
        if (parts.length === 2) {
          const [time, modifier] = parts;
          let [hours, minutes] = time.split(":");
          if (hours === "12") hours = "00";
          if (modifier === "PM") hours = parseInt(hours, 10) + 12;
          baseTargetDate.setHours(hours, minutes, 0, 0);
        } else {
          baseTargetDate.setHours(18, 0, 0, 0);
        }
      } else {
        baseTargetDate.setHours(18, 0, 0, 0);
      }
    } else {
      baseTargetDate = new Date(
        new Date(order.createdAt).getTime() + 48 * 60 * 60 * 1000,
      );
    }

    const targetDate = new Date(baseTargetDate.getTime() - 2 * 60 * 60 * 1000);

    setTargetDateStr(
      targetDate.toLocaleDateString("en-IN", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    );

    const updateCountdown = () => {
      const now = new Date();
      const diff = targetDate - now;

      if (diff <= 0) {
        setIsOverdue(true);
        const overdueDiff = Math.abs(diff);
        const hours = Math.floor(overdueDiff / (1000 * 60 * 60));
        const minutes = Math.floor(
          (overdueDiff % (1000 * 60 * 60)) / (1000 * 60),
        );
        const seconds = Math.floor((overdueDiff % (1000 * 60)) / 1000);
        setTimeLeft(`+${hours}h ${minutes}m ${seconds}s`);
      } else {
        setIsOverdue(false);
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [order]);

  const fetchOrder = async () => {
    try {
      const data = await orderApi.getById(order_Id);
      setOrder(data);
    } catch (err) {
      console.error("Error fetching order details:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, [order_Id]);

  const orderStages = useMemo(() => {
    if (!order) return [];
    const status = order.status;

    const stages = [
      { id: 1, label: "New Order", icon: "schedule", status: "pending" },
      { id: 2, label: "In Transit", icon: "local_shipping", status: "pending" },
      {
        id: 3,
        label: "In Progress",
        icon: "local_laundry_service",
        status: "pending",
      },
      {
        id: 4,
        label: "Ready to Ship",
        icon: "check_circle",
        status: "pending",
      },
      { id: 5, label: "Dispatched", icon: "verified", status: "pending" },
    ];

    const statusOrder = [
      "ORDER_PLACED",
      "PICKUP_ASSIGNED",
      "RIDER_ARRIVING",
      "IN_TRANSIT",
      "RECEIVED_BY_VENDOR",
      "PROCESSING",
      "READY_FOR_DISPATCH",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
    ];
    const currentIdx = statusOrder.indexOf(status);

    if (currentIdx >= 0)
      stages[0].status = currentIdx === 0 ? "active" : "completed";
    if (currentIdx >= 1)
      stages[1].status =
        currentIdx >= 1 && currentIdx <= 3 ? "active" : "completed";
    if (currentIdx >= 4)
      stages[2].status =
        currentIdx >= 4 && currentIdx <= 5 ? "active" : "completed";
    if (currentIdx >= 6)
      stages[3].status = currentIdx === 6 ? "active" : "completed";
    if (currentIdx >= 7)
      stages[4].status = currentIdx === 7 ? "active" : "completed";
    if (currentIdx >= 8) stages[4].status = "completed";

    if (status === "CANCELLED") stages.forEach((s) => (s.status = "pending"));

    return stages;
  }, [order]);

  const getFriendlyStatus = (status) => {
    if (status === "ORDER_PLACED") return "New Order";
    if (["PICKUP_ASSIGNED", "RIDER_ARRIVING"].includes(status))
      return "Awaiting Pickup";
    if (status === "IN_TRANSIT") return "In Transit";
    if (status === "RECEIVED_BY_VENDOR") return "Sorting";
    if (status === "PROCESSING") return "In Progress";
    if (status === "READY_FOR_DISPATCH") return "Ready to Ship";
    if (status === "OUT_FOR_DELIVERY") return "Dispatched";
    if (status === "DELIVERED") return "Completed";
    return status;
  };

  if (loading) {
    return (
      <div className="bg-[#F8FAFC] font-body min-h-screen flex flex-col overflow-x-hidden">
        <header className="bg-white/80 backdrop-blur-xl sticky top-0 z-50 flex justify-between items-center w-full px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-slate-100 rounded-full animate-pulse" />
            <div>
              <div className="w-32 h-6 bg-slate-200 rounded mb-1 animate-pulse" />
              <div className="w-20 h-3 bg-slate-100 rounded animate-pulse" />
            </div>
          </div>
          <div className="w-16 h-6 bg-slate-200 rounded-lg animate-pulse" />
        </header>

        <main className="flex-1 flex flex-col px-6 py-6 gap-6 overflow-y-auto pb-40">
          <div className="bg-white rounded-[2.5rem] p-6 border border-slate-100 shadow-sm animate-pulse">
            <div className="flex justify-between items-start">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="flex flex-col items-center gap-2 flex-1">
                  <div className="w-10 h-10 rounded-full bg-slate-100" />
                  <div className="w-16 h-2 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm animate-pulse">
              <div className="w-16 h-2 bg-slate-100 rounded mb-3" />
              <div className="w-24 h-4 bg-slate-200 rounded" />
            </div>
            <div className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm animate-pulse">
              <div className="w-20 h-2 bg-slate-100 rounded mb-3" />
              <div className="w-24 h-4 bg-slate-200 rounded" />
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden animate-pulse">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between">
              <div className="w-24 h-3 bg-slate-200 rounded" />
              <div className="w-16 h-4 bg-slate-200 rounded" />
            </div>
            <div className="p-6 space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-slate-100" />
                  <div className="flex-1">
                    <div className="w-32 h-4 bg-slate-200 rounded mb-2" />
                    <div className="w-24 h-2 bg-slate-100 rounded" />
                  </div>
                  <div className="w-12 h-4 bg-slate-200 rounded" />
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }
  if (!order)
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 text-center">
        <div>
          <h2 className="text-xl font-black mb-2">Order Not Found</h2>
          <button
            onClick={() => navigate(-1)}
            className="text-primary font-bold">
            Go Back
          </button>
        </div>
      </div>
    );

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 3) document.getElementById(`otp-${index + 1}`).focus();
  };

  const handleVerifyHandshake = async () => {
    const otpString = otp.join("");
    if (otpString.length !== 4) return await appDialog.alert("Please enter 4-digit OTP");

    try {
      setVerifying(true);
      if (activeHandshakePhase === "Inbound") {
        await logisticsApi.verifyHandshake(order._id, "Inbound", otpString);
      } else if (order.orderType === "Walk-In" && !order.riderDropOff) {
        await orderApi.verifyDeliveryOtp(order._id, otpString);
      } else {
        await orderApi.verifyHandshake(order._id, "Reverse", otpString);
      }
      window.location.reload();
    } catch (err) {
      await appDialog.alert(err.message || "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-transparent font-body text-slate-900 min-h-[100dvh] flex flex-col overflow-x-hidden">
      {/* Sticky Header Area with Timeline */}
      <div className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl">
        <header className="flex justify-between items-center w-full px-6 py-4">
          <div className="flex items-center gap-4">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-slate-50 rounded-full transition-colors">
              <span className="material-symbols-outlined text-slate-900">
                arrow_back
              </span>
            </motion.button>
            <div>
              <h1 className="font-headline font-black text-xl tracking-tight text-slate-900 leading-none mb-1">
                Order Details
              </h1>
            </div>
          </div>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate(`/vendor/order-chat/${order._id}`)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200/80 hover:bg-rose-100 transition-all font-black text-[10px] uppercase tracking-wider shadow-xs"
            title="Report Issue to Admin / Support">
            <span className="material-symbols-outlined text-sm">
              support_agent
            </span>
            Need Help?
          </motion.button>
        </header>

        {/* ORDER PROGRESS TIMELINE */}
        <section className="py-5 overflow-x-auto no-scrollbar pl-6">
          <div className="flex items-start relative min-w-max gap-8 pr-6">
            {/* Progress Line Background */}
            <div className="absolute top-5 left-5 right-10 h-0.5 bg-slate-100 -z-0" />

            {orderStages.map((stage, index) => (
              <div
                key={stage.id}
                className="relative z-10 flex flex-col items-center gap-2 w-16">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 ${
                    stage.status === "completed"
                      ? "bg-black text-white shadow-lg shadow-black/10"
                      : stage.status === "active"
                        ? "bg-black text-white shadow-lg shadow-black/20 scale-110"
                        : "bg-white border-2 border-slate-100 text-slate-300"
                  }`}>
                  <span className="material-symbols-outlined text-sm">
                    {stage.status === "completed" ? "check" : stage.icon}
                  </span>
                </div>
                <span
                  className={`text-[9px] font-black uppercase tracking-widest text-center leading-tight ${
                    stage.status === "active"
                      ? "text-black"
                      : stage.status === "completed"
                        ? "text-black"
                        : "text-slate-400"
                  }`}>
                  {stage.label}
                </span>

                {/* Connecting line for active/completed */}
                {index < orderStages.length - 1 && (
                  <div
                    className={`absolute top-5 left-[50%] w-full h-[3px] -z-10 transition-all duration-1000 ${
                      stage.status === "completed"
                        ? "bg-black"
                        : "bg-transparent"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </section>

        {/* 1. DROPOFF DEADLINE COUNTDOWN */}
        {(() => {
          const terminalStatuses = [
            "DELIVERED",
            "SETTLED",
            "CANCELLED",
            "Delivered",
            "Settled",
            "Cancelled",
          ];
          const isTerminal = terminalStatuses.includes(order?.status);
          const isCancelled = ["CANCELLED", "Cancelled"].includes(
            order?.status,
          );
          return (
            <div className="px-6 pb-4 pt-4 mt-2 flex flex-col gap-1 border-t border-slate-50">
              <p
                className={`text-[8px] font-black uppercase tracking-widest ${isOverdue ? "text-slate-900" : "text-slate-400"}`}>
                {isTerminal ? "Order Status" : "Remaining Time"}
              </p>

              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span
                    className={`material-symbols-outlined text-lg ${
                      isTerminal && !isCancelled
                        ? "text-emerald-600"
                        : isCancelled
                          ? "text-rose-500"
                          : isOverdue
                            ? "text-slate-900"
                            : "text-slate-900 animate-pulse"
                    }`}>
                    {isTerminal && !isCancelled
                      ? "check_circle"
                      : isCancelled
                        ? "cancel"
                        : "timer"}
                  </span>
                  <div className="flex items-center gap-2">
                    {isOverdue && !isTerminal && (
                      <span className="bg-slate-900 text-white px-1.5 py-0.5 rounded text-[8px] font-black tracking-widest">
                        OVERDUE
                      </span>
                    )}
                    <span
                      className={`text-xl font-black tracking-tighter ${
                        isTerminal && !isCancelled
                          ? "text-emerald-600"
                          : isCancelled
                            ? "text-rose-500"
                            : "text-slate-900"
                      }`}>
                      {timeLeft}
                    </span>
                  </div>
                </div>
                {!isTerminal && (
                  <div className="text-right">
                    <p className="text-[10px] font-black text-slate-700">
                      {order?.deliverySlot?.date || "N/A"}
                    </p>
                    <p className="text-[10px] font-black text-slate-400">
                      {order?.deliverySlot?.time || "Standard SLA"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* 1.5. CONCISE ORDER SUMMARY BOX IN DARK THEME */}
        <div className="px-6 pb-4">
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
        </div>

        <div className="px-6 pb-2 pt-2">
          <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">
            Article Detail
          </h3>
        </div>
      </div>

      <main className="flex-1 flex flex-col px-6 py-4 gap-6 overflow-y-auto pb-32 text-left">
        {/* 2. ORDER SUMMARY ITEMS */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-4">
            {order.items?.map((item, i) => {
              const itemImg =
                (order.customerPhotos && order.customerPhotos[i]) ||
                (order.customerPhotos && order.customerPhotos[0]) ||
                (item.photos && item.photos[0]);
              return (
                <div
                  key={i}
                  className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm flex flex-col gap-4">
                  {/* Service Name & Qty */}
                  <div className="flex justify-between items-center bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                    <p className="text-[11px] font-black text-slate-800 uppercase tracking-wide leading-none">
                      {item.name}
                    </p>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest bg-slate-200/60 px-2.5 py-1 rounded-md">
                      QTY: {item.quantity}
                    </span>
                  </div>
                  {/* Service Image */}
                  <div
                    className="w-full h-40 rounded-2xl bg-slate-50/50 border border-slate-200/40 flex items-center justify-center text-slate-300 overflow-hidden shadow-inner cursor-pointer"
                    onClick={() =>
                      itemImg && setSelectedImage(itemImg.url || itemImg)
                    }>
                    {itemImg ? (
                      <img
                        src={itemImg.url || itemImg}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1 opacity-40">
                        <span className="material-symbols-outlined text-4xl">
                          dry_cleaning
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-widest">
                          No Image Uploaded
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 4. RIDER LOGISTICS */}
        {order.rider && (
          <section className="bg-white rounded-[2.5rem] p-6 border border-slate-100 shadow-sm space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
              <span className="material-symbols-outlined text-slate-400 text-xl">
                delivery_dining
              </span>
              <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400">
                Assigned Rider
              </h3>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 overflow-hidden">
                  <img
                    src={
                      order.rider.photo ||
                      "https://api.dicebear.com/7.x/avataaars/svg?seed=Rider"
                    }
                    alt="Rider"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900">
                    {order.rider.displayName}
                  </h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    {order.rider.phone}
                  </p>
                </div>
              </div>
              <a
                href={`tel:${order.rider.phone}`}
                className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
                <span className="material-symbols-outlined">call</span>
              </a>
            </div>
          </section>
        )}

        {/* 5. BOTTOM ACTION & INFORMATION AREA */}
        {/* 5. ORDER ISSUE & SUPPORT CARD */}
        <section className="bg-white rounded-[2rem] p-5 border border-slate-100 shadow-sm flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
              <span className="material-symbols-outlined text-xl">
                report_problem
              </span>
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight">
                Report Issue to Admin
              </h4>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                Missing items, rider delays, or order concerns
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate(`/vendor/order-chat/${order._id}`)}
            className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-black transition-colors shrink-0 shadow-sm">
            Chat Support
          </button>
        </section>

        <OrderWeightCard
          order={order}
          onSaved={(w) => setOrder((prev) => ({ ...prev, ...w }))}
        />

        {/* 6. BOTTOM ACTION & INFORMATION AREA */}
        <section className="flex flex-col items-center gap-4 mt-2">
          {/* Read-Only Statuses */}
          {["PICKUP_ASSIGNED", "RIDER_ARRIVING"].includes(order.status) && (
            <div className="bg-slate-900 p-4 rounded-3xl flex items-start gap-3 w-full shadow-sm">
              <span className="material-symbols-outlined text-white/50 text-lg mt-0.5 animate-pulse">
                info
              </span>
              <p className="text-xs font-bold leading-relaxed text-white">
                Rider is on the way to pick up the clothes from the customer.
              </p>
            </div>
          )}
          {order.status === "OUT_FOR_DELIVERY" && (
            <div className="bg-emerald-950 p-4 rounded-3xl flex items-start gap-3 w-full shadow-sm">
              <span className="material-symbols-outlined text-emerald-400 text-lg mt-0.5">
                info
              </span>
              <p className="text-xs font-bold leading-relaxed text-emerald-50">
                Order has been dispatched and handed over to the delivery rider.
              </p>
            </div>
          )}

          {/* Actionable Buttons */}
          {["IN_TRANSIT", "RECEIVED_BY_VENDOR"].includes(order.status) && (
            <div className="w-full flex flex-col items-center mt-2">
              {!isHandshakeModalOpen ? (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={async () => {
                    try {
                      setVerifying(true);
                      await logisticsApi.requestHandshake(order._id, "Inbound");
                      await fetchOrder(); // Fetch latest order containing OTP!
                      setActiveHandshakePhase("Inbound");
                      setIsHandshakeModalOpen(true);
                    } catch (err) {
                      await appDialog.alert("Failed to request Inbound OTP. Please try again.");
                    } finally {
                      setVerifying(false);
                    }
                  }}
                  disabled={verifying}
                  className="bg-black text-white w-full py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.1em] flex items-center justify-center gap-3 shadow-xl shadow-black/20">
                  {verifying
                    ? "Requesting OTP..."
                    : "Verify & Start Processing"}
                  <span className="material-symbols-outlined text-lg">
                    play_circle
                  </span>
                </motion.button>
              ) : (
                <div className="w-full bg-slate-50 border border-slate-200 rounded-[2rem] p-5 flex flex-col gap-4 shadow-sm">
                  <p className="text-sm font-black text-slate-900 uppercase tracking-tight text-center">
                    Enter Rider Inbound OTP
                  </p>
                  {activeOtp && (
                    <div className="p-3 bg-blue-50 border border-blue-100 text-blue-700 rounded-xl text-center text-xs font-black uppercase tracking-wider animate-pulse">
                      [DEMO ONLY] OTP: {activeOtp}
                    </div>
                  )}
                  <div className="flex justify-center gap-3">
                    {otp.map((digit, index) => (
                      <input
                        key={index}
                        id={`otp-${index}`}
                        type="text"
                        value={digit}
                        autoFocus={index === 0 && !digit}
                        onChange={(e) => handleOtpChange(index, e.target.value)}
                        className="w-12 h-16 bg-white border-2 border-slate-100 rounded-xl text-center text-2xl font-black focus:border-slate-900 transition-all outline-none"
                        maxLength={1}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between gap-3 w-full mt-2">
                    <button
                      onClick={() => {
                        setIsHandshakeModalOpen(false);
                        setActiveHandshakePhase(null);
                        setOtp(["", "", "", ""]);
                      }}
                      className="flex-1 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors">
                      Cancel
                    </button>
                    <button
                      onClick={handleVerifyHandshake}
                      disabled={verifying || otp.join("").length < 4}
                      className={`flex-1 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
                        verifying || otp.join("").length < 4
                          ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                          : "bg-slate-900 text-white hover:bg-black shadow-lg shadow-slate-900/20"
                      }`}>
                      {verifying ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Verifying
                        </span>
                      ) : (
                        "Complete"
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {order.status === "PROCESSING" && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={async () => {
                try {
                  await orderApi.markOrderReady(order._id);
                  window.location.reload();
                } catch (err) {
                  await appDialog.alert("Error marking as ready");
                }
              }}
              className="bg-black text-white w-full py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.1em] flex items-center justify-center gap-3 shadow-xl shadow-black/20 mt-2">
              Mark Order Ready
              <span className="material-symbols-outlined text-lg">
                check_circle
              </span>
            </motion.button>
          )}
          {order.status === "READY_FOR_DISPATCH" && (
            <div className="w-full flex flex-col items-center mt-2">
              {!isHandshakeModalOpen ? (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={async () => {
                    await fetchOrder(); // Fetch latest order details to make sure we have the latest OTP
                    setActiveHandshakePhase("Reverse");
                    setIsHandshakeModalOpen(true);
                  }}
                  className="bg-black text-white w-full py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.1em] flex items-center justify-center gap-3 shadow-xl shadow-black/20">
                  {order.orderType === "Walk-In" && !order.riderDropOff
                    ? "Handover to Customer"
                    : "Verify & Handover"}
                  <span className="material-symbols-outlined text-lg">
                    {order.orderType === "Walk-In" && !order.riderDropOff
                      ? "handshake"
                      : "verified_user"}
                  </span>
                </motion.button>
              ) : (
                <div className="w-full bg-slate-50 border border-slate-200 rounded-[2rem] p-5 flex flex-col gap-4 shadow-sm">
                  <p className="text-sm font-black text-slate-900 uppercase tracking-tight text-center">
                    {order.orderType === "Walk-In" && !order.riderDropOff
                      ? "Enter Customer OTP"
                      : "Enter Rider OTP"}
                  </p>
                  {activeOtp && (
                    <div className="p-3 bg-blue-50 border border-blue-100 text-blue-700 rounded-xl text-center text-xs font-black uppercase tracking-wider animate-pulse">
                      [DEMO ONLY] OTP: {activeOtp}
                    </div>
                  )}
                  <div className="flex justify-center gap-3">
                    {otp.map((digit, index) => (
                      <input
                        key={index}
                        id={`otp-${index}`}
                        type="text"
                        value={digit}
                        autoFocus={index === 0 && !digit}
                        onChange={(e) => handleOtpChange(index, e.target.value)}
                        className="w-12 h-16 bg-white border-2 border-slate-100 rounded-xl text-center text-2xl font-black focus:border-slate-900 transition-all outline-none"
                        maxLength={1}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between gap-3 w-full mt-2">
                    <button
                      onClick={() => {
                        setIsHandshakeModalOpen(false);
                        setActiveHandshakePhase(null);
                        setOtp(["", "", "", ""]);
                      }}
                      className="flex-1 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors">
                      Cancel
                    </button>
                    <button
                      onClick={handleVerifyHandshake}
                      disabled={verifying || otp.join("").length < 4}
                      className={`flex-1 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
                        verifying || otp.join("").length < 4
                          ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                          : "bg-slate-900 text-white hover:bg-black shadow-lg shadow-slate-900/20"
                      }`}>
                      {verifying ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Verifying
                        </span>
                      ) : (
                        "Complete"
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      {/* Fullscreen Image Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setSelectedImage(null)}>
          <img
            src={selectedImage}
            alt="Full view"
            className="max-w-full max-h-[90vh] object-contain rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-6 right-6 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white hover:bg-white/30"
            onClick={() => setSelectedImage(null)}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      )}
    </motion.div>
  );
};

export default OrderDetails;
