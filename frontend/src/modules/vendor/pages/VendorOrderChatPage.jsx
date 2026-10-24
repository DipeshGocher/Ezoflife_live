import { socketAuth } from '../../../lib/socketAuth';
import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ticketApi, orderApi, mediaApi } from "../../../lib/api";
import io from "socket.io-client";
import toast from "react-hot-toast";

const ISSUE_CATEGORIES = [
  {
    label: "Missing / Damaged Articles",
    value: "Damaged Items",
    icon: "broken_image",
  },
  { label: "Rider Delayed / No-show", value: "Rider Delay", icon: "timer" },
  {
    label: "Customer Unreachable",
    value: "Customer Unreachable",
    icon: "phone_disabled",
  },
  {
    label: "Processing Issue",
    value: "Processing Issue",
    icon: "local_laundry_service",
  },
  { label: "Handshake / OTP Issue", value: "Order Dispute", icon: "pin" },
  { label: "Other Issue", value: "Others", icon: "help_outline" },
];

export default function VendorOrderChatPage() {
  const navigate = useNavigate();
  const { orderId } = useParams();

  const [order, setOrder] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Others");
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const scrollRef = useRef(null);
  const socketRef = useRef(null);
  const fileInputRef = useRef(null);

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

  // 1. Fetch Order and Existing Vendor Ticket for this order
  useEffect(() => {
    let isMounted = true;

    const initData = async () => {
      try {
        setLoading(true);
        // Fetch order details for context
        try {
          const ord = await orderApi.getById(orderId);
          if (isMounted) setOrder(ord);
        } catch (e) {
          console.warn("Could not fetch order details for chat:", e);
        }

        // Fetch vendor's ticket specifically for this order
        const existingTicket = await ticketApi.getTicketByOrder(
          orderId,
          "Vendor",
        );
        if (isMounted && existingTicket && existingTicket._id) {
          setTicket(existingTicket);
          if (existingTicket.category) {
            setSelectedCategory(existingTicket.category);
          }
        }
      } catch (err) {
        console.error("Vendor Chat Init Error:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initData();

    const socketUrl =
      import.meta.env.VITE_API_URL?.replace("/api", "") ||
      "http://localhost:5000";
    socketRef.current = io(socketUrl, { auth: socketAuth });

    return () => {
      isMounted = false;
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [orderId]);

  // 2. Real-time Socket Subscriptions when ticket is active
  useEffect(() => {
    if (ticket?._id && socketRef.current) {
      socketRef.current.emit("join_room", `ticket_${ticket._id}`);

      socketRef.current.on("new_message", (data) => {
        if (data.ticketId === ticket._id) {
          setTicket((prev) => ({
            ...prev,
            messages: [...(prev?.messages || []), data.message],
          }));
        }
      });

      socketRef.current.on("status_updated", (data) => {
        if (data.ticketId === ticket._id) {
          setTicket((prev) => ({
            ...prev,
            status: data.status,
          }));
          toast.success(`Ticket status updated: ${data.status}`);
        }
      });
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.off("new_message");
        socketRef.current.off("status_updated");
      }
    };
  }, [ticket?._id]);

  // 3. Scroll to bottom on message update
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ticket?.messages]);

  // 4. Send Message Handler
  const handleSendMessage = async (e, attachments = []) => {
    if (e) e.preventDefault();
    if (ticket?.status === "Resolved") {
      toast.error(
        "This issue is resolved. Please contact admin if you need to reopen.",
      );
      return;
    }

    const msgText = message.trim();
    if (!msgText && attachments.length === 0) return;

    try {
      setIsSending(true);
      const displayOrderId =
        order?.orderId || orderId?.slice(-6)?.toUpperCase();

      // Case A: Create ticket first if none exists yet
      if (!ticket?._id) {
        const newTicket = await ticketApi.createTicket({
          vendor: vendorId,
          userType: "Vendor",
          customer: order?.customer?._id || order?.customer || null,
          orderId: orderId,
          subject: `Vendor Issue: Order #${displayOrderId}`,
          category: selectedCategory,
          description: msgText || "Vendor sent an attachment regarding order",
          attachments,
        });
        setTicket(newTicket);
        setMessage("");
        toast.success("Issue submitted to Admin team!");
        return;
      }

      // Case B: Append message to existing ticket
      await ticketApi.sendMessage(ticket._id, {
        sender: vendorId,
        senderRole: "Vendor",
        message: msgText,
        attachments,
      });
      setMessage("");
    } catch (err) {
      console.error("Failed to send vendor issue message:", err);
      toast.error(err?.message || "Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  // 5. Image Attachment Upload
  const handleImageUpload = async (e) => {
    if (ticket?.status === "Resolved") return;
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("media", file);

    try {
      const res = await mediaApi.upload(formData);
      if (res.url) {
        await handleSendMessage(null, [{ type: "image", url: res.url }]);
      }
    } catch (err) {
      console.error("Image upload failed:", err);
      toast.error("Image upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const displayOrderId = order?.orderId || orderId?.slice(-8)?.toUpperCase();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 font-bold text-xs uppercase tracking-[0.2em] animate-pulse">
            Connecting to Support Channel...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-[#F8FAFC] font-sans text-slate-800 overflow-hidden">
      {/* ── HEADER ── */}
      <header className="flex-shrink-0 bg-white/90 backdrop-blur-xl border-b border-slate-200 px-6 py-4 flex items-center justify-between z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 hover:bg-slate-200 transition-colors">
            <span className="material-symbols-outlined text-xl">
              arrow_back
            </span>
          </motion.button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-slate-900 tracking-tight leading-none uppercase">
                Order Support Chat
              </h1>
              <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                Vendor
              </span>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              Order #{displayOrderId}
            </p>
          </div>
        </div>

        {/* Ticket Status Pill */}
        <div className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              ticket?.status === "Resolved"
                ? "bg-emerald-500"
                : ticket?._id
                  ? "bg-indigo-600 animate-pulse"
                  : "bg-amber-500"
            }`}
          />
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">
            {ticket?.status || "New Issue"}
          </span>
        </div>
      </header>

      {/* ── ORDER CONTEXT BANNER ── */}
      {order && (
        <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-indigo-600 text-lg">
              local_laundry_service
            </span>
            <div>
              <p className="text-[10px] font-black text-slate-800 uppercase tracking-tight">
                {order.customer?.displayName || "Customer"} · ₹
                {order.totalAmount || 0}
              </p>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                {order.items?.length || 0} Items · Status: {order.status}
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate(`/vendor/order/${order._id}`)}
            className="text-[9px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-800 underline underline-offset-2">
            View Order
          </button>
        </div>
      )}

      {/* ── CHAT MESSAGES BODY ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
        {/* If no ticket yet: Show category quick selection banner */}
        {!ticket?._id && (
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-indigo-600">
                report_problem
              </span>
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                Select Issue Category
              </h3>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              Select the primary issue category below and describe your problem
              to our Admin Support team:
            </p>
            <div className="grid grid-cols-2 gap-2">
              {ISSUE_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setSelectedCategory(cat.value)}
                  className={`p-3 rounded-2xl border text-left flex items-center gap-2.5 transition-all ${
                    selectedCategory === cat.value
                      ? "border-indigo-600 bg-indigo-50/60 text-indigo-900 font-bold shadow-xs"
                      : "border-slate-200 hover:border-slate-300 text-slate-600 font-medium bg-slate-50/50"
                  }`}>
                  <span className="material-symbols-outlined text-base text-indigo-600">
                    {cat.icon}
                  </span>
                  <span className="text-[10px] uppercase tracking-tight">
                    {cat.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Existing Messages */}
        {ticket?.messages && ticket.messages.length > 0 ? (
          ticket.messages.map((msg, idx) => {
            const isVendor =
              msg.senderRole === "Vendor" || msg.senderRole === "Customer";
            const isAdmin = msg.senderRole === "Admin";
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${isVendor ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] space-y-1 ${isVendor ? "flex flex-col items-end" : ""}`}>
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-2">
                    {isAdmin ? "Admin Support" : "You (Vendor)"} ·{" "}
                    {new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <div
                    className={`p-4 rounded-2xl text-[12px] font-medium leading-relaxed shadow-sm ${
                      isVendor
                        ? "bg-slate-900 text-white rounded-tr-none"
                        : "bg-white text-slate-800 border border-slate-200 rounded-tl-none"
                    }`}>
                    <p className="whitespace-pre-wrap">{msg.message}</p>
                    {msg.attachments?.length > 0 && (
                      <div className="mt-3 grid grid-cols-1 gap-2">
                        {msg.attachments.map((at, j) => (
                          <img
                            key={j}
                            src={at.url}
                            alt="Attachment"
                            className="rounded-xl max-h-60 w-full object-cover border border-black/10"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })
        ) : (
          <div className="text-center py-10 text-slate-400">
            <span className="material-symbols-outlined text-4xl mb-2 text-slate-300">
              chat_bubble_outline
            </span>
            <p className="text-xs font-bold uppercase tracking-wider">
              No messages yet
            </p>
            <p className="text-[10px] mt-1 text-slate-400">
              Type your concern below to connect directly with the Admin Support
              team.
            </p>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* ── FOOTER INPUT BAR ── */}
      <footer className="flex-shrink-0 bg-white border-t border-slate-200 p-4 z-20">
        {ticket?.status === "Resolved" ? (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-center">
            <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
              ✓ This issue has been marked Resolved by Admin Support
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSendMessage}
            className="flex items-center gap-3">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-11 h-11 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors disabled:opacity-50 shrink-0"
              title="Attach photo/evidence">
              {isUploading ? (
                <div className="w-4 h-4 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="material-symbols-outlined text-xl">
                  attach_file
                </span>
              )}
            </button>

            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your issue with this order to Admin..."
              className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-medium focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none transition-all placeholder:text-slate-400"
            />

            <button
              type="submit"
              disabled={isSending || (!message.trim() && !isUploading)}
              className="w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center hover:bg-indigo-600 transition-colors disabled:opacity-40 shrink-0 shadow-md shadow-slate-900/10">
              {isSending ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="material-symbols-outlined text-lg">send</span>
              )}
            </button>
          </form>
        )}
      </footer>
    </div>
  );
}
