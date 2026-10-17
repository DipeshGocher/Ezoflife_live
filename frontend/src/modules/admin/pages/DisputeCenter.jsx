import { socketAuth } from '../../../lib/socketAuth';
import React, { useState, useEffect, useRef } from 'react';
import { ShieldAlert, IndianRupee, Image, History, ArrowRight, User, CheckCircle2, XCircle, AlertCircle, Search, ExternalLink, Send, Clock } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import StatusBadge from '../components/common/StatusBadge';
import { ticketApi, mediaApi } from '../../../lib/api';
import io from 'socket.io-client';
import toast from 'react-hot-toast';

export default function DisputeCenter() {
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const scrollRef = useRef(null);
  const socketRef = useRef(null);
  const fileInputRef = useRef(null);

  const adminData = JSON.parse(localStorage.getItem('adminData') || '{}');
  const adminId = adminData.id || adminData._id;

  useEffect(() => {
    fetchTickets();
    socketRef.current = io(import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000', { auth: socketAuth });
    
    socketRef.current.on('new_ticket', (data) => {
      // Refresh list if it's a dispute category
      fetchTickets();
      toast.success('New dispute received!');
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  const fetchTickets = async () => {
    try {
      const data = await ticketApi.getAllTickets();
      // Filter for dispute related categories
      const disputeTickets = data.filter(t => ['Missing Items', 'Damaged Items', 'Wrong Items'].includes(t.category));
      setTickets(disputeTickets);
      if (disputeTickets.length > 0 && !selectedTicket) {
        setSelectedTicket(disputeTickets[0]);
      }
    } catch (err) {
      toast.error('Failed to load disputes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedTicket && socketRef.current) {
      socketRef.current.emit('join_room', `ticket_${selectedTicket._id}`);
      
      socketRef.current.on('new_message', (data) => {
        if (data.ticketId === selectedTicket._id) {
          setSelectedTicket(prev => ({
            ...prev,
            messages: [...prev.messages, data.message]
          }));
        }
      });
    }
    return () => {
      if (socketRef.current) socketRef.current.off('new_message');
    };
  }, [selectedTicket?._id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedTicket?.messages]);

  const handleSendMessage = async (e, attachments = []) => {
    if (e) e.preventDefault();
    if (!message.trim() && attachments.length === 0) return;

    try {
      await ticketApi.sendMessage(selectedTicket._id, {
        sender: adminId,
        senderRole: 'Admin',
        message: message,
        attachments: attachments
      });
      setMessage('');
    } catch (err) {
      toast.error('Failed to send message');
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('media', file);

    try {
      const res = await mediaApi.upload(formData);
      if (res.url) {
        await handleSendMessage(null, [{ type: 'image', url: res.url }]);
      }
    } catch (err) {
      toast.error('Image upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleResolveDispute = async () => {
    if (!selectedTicket) return;
    try {
      await ticketApi.updateTicketStatus(selectedTicket._id, 'Resolved');
      // Send a closing message
      await ticketApi.sendMessage(selectedTicket._id, {
        sender: adminId,
        senderRole: 'Admin',
        message: 'Your issue is resolved and chatting is closed.',
        attachments: []
      });
      toast.success('Dispute resolved successfully');
      fetchTickets();
    } catch (err) {
      toast.error('Failed to resolve dispute');
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50 pb-20 font-body">
      <PageHeader 
        title="Dispute Center" 
        actions={[
          { label: 'Settlement Policy', icon: IndianRupee, variant: 'secondary' }
        ]}
      />

      <div className="p-6 grid grid-cols-1 xl:grid-cols-4 gap-6 max-w-[1600px] mx-auto w-full flex-1">
        {/* List of Disputes */}
        <div className="xl:col-span-1 space-y-4 max-h-[calc(100vh-250px)] overflow-y-auto pr-2 custom-scrollbar">
           <div className="flex items-center justify-between px-2 mb-2 sticky top-0 bg-slate-50/50 py-2 z-10">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Investigation Queue</span>
              <span className="text-[9px] font-bold text-slate-900 uppercase tracking-[0.2em]">{tickets.length} CASES</span>
           </div>
           
           {loading ? (
             <div className="p-10 text-center animate-pulse text-slate-400 font-black uppercase text-[10px]">Loading Cases...</div>
           ) : tickets.map(ticket => (
             <div 
               key={ticket._id} 
               onClick={() => setSelectedTicket(ticket)}
               className={`p-6 bg-white border border-slate-200 rounded-sm cursor-pointer transition-all hover:translate-y-[-2px] relative overflow-hidden group ${selectedTicket?._id === ticket._id ? 'border-slate-900 bg-slate-50 shadow-xl' : 'hover:border-slate-400'}`}
             >
                <div className="flex justify-between items-start mb-4">
                   <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-black text-slate-400 tabular-nums uppercase leading-none">{ticket._id.slice(-8).toUpperCase()}</span>
                      <h4 className="text-[12px] font-black text-slate-900 uppercase tracking-tight line-clamp-1">{ticket.subject}</h4>
                   </div>
                   <StatusBadge status={ticket.status} />
                </div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.1em] mb-4 line-clamp-2">{ticket.description}</p>
                <div className="flex justify-between items-center pt-4 border-t border-slate-50">
                   <span className="text-[9px] font-black text-slate-950 uppercase tracking-widest">{ticket.customer?.displayName || 'Customer'}</span>
                   <button className="text-[9px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 group-hover:gap-3 transition-all underline underline-offset-4">
                     Review Evidence <ArrowRight size={10} />
                   </button>
                </div>
             </div>
           ))}
        </div>

        {/* Chat & Investigation Details */}
        <div className="xl:col-span-2 space-y-6 flex flex-col h-[calc(100vh-250px)]">
           {selectedTicket ? (
             <div className="bg-white border border-slate-200 rounded-sm overflow-hidden shadow-sm flex flex-col flex-1">
                {/* Chat Header */}
                <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row gap-4 justify-between sm:items-center bg-slate-50/50">
                   <div className="flex items-start sm:items-center gap-4 min-w-0">
                      <div className="w-12 h-12 bg-slate-900 text-white flex items-center justify-center rounded-sm flex-shrink-0">
                         <ShieldAlert size={20} />
                      </div>
                      <div className="min-w-0">
                         <h2 className="text-sm font-black text-slate-900 tracking-tighter uppercase leading-tight mb-1 break-words whitespace-normal">{selectedTicket.subject}</h2>
                         <div className="flex items-center gap-3">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] break-all">{selectedTicket.customer?.displayName} · {selectedTicket.customer?.phone}</span>
                         </div>
                      </div>
                   </div>
                   <div className="flex gap-2 flex-shrink-0">
                      {selectedTicket.status !== 'Resolved' && (
                        <button 
                          onClick={handleResolveDispute}
                          className="w-full sm:w-auto px-4 py-2 bg-slate-950 text-white text-[9px] font-black uppercase tracking-widest rounded-sm shadow-lg shadow-slate-950/20 hover:bg-black whitespace-nowrap"
                        >
                          Resolve Dispute
                        </button>
                      )}
                   </div>
                </div>

                {/* Chat Window */}
                <div 
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto p-8 space-y-6 bg-slate-50/30 custom-scrollbar"
                >
                   {selectedTicket.messages.map((msg, i) => (
                     <div key={i} className={`flex ${msg.senderRole === 'Admin' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] space-y-2 ${msg.senderRole === 'Admin' ? 'items-end flex flex-col' : ''}`}>
                           <div className={`p-4 rounded-sm text-[11px] font-bold uppercase tracking-widest shadow-sm ${
                             msg.senderRole === 'Admin' ? 'bg-slate-900 text-white' : 'bg-white text-slate-900 border border-slate-200'
                           }`}>
                              {msg.message}
                              {msg.attachments?.length > 0 && (
                                <div className="mt-3 grid grid-cols-1 gap-2">
                                  {msg.attachments.map((at, j) => (
                                    <img key={j} src={at.url} alt="Evidence" className="rounded-sm max-h-48 w-full object-cover border border-slate-100/10 cursor-pointer hover:opacity-90 transition-opacity" />
                                  ))}
                                </div>
                              )}
                           </div>
                           <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">
                              {msg.senderRole === 'Admin' ? 'System Admin' : (selectedTicket.customer?.displayName || 'Customer')} · {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                           </span>
                        </div>
                     </div>
                   ))}
                </div>

                {/* Chat Input */}
                {selectedTicket.status !== 'Resolved' && (
                  <div className="p-6 bg-white border-t border-slate-100">
                    <form onSubmit={handleSendMessage} className="flex gap-4">
                        <div className="flex-1 bg-slate-50 border border-slate-200 rounded-sm flex items-center px-4 py-1 focus-within:border-slate-400 transition-all">
                          <input 
                              type="file" 
                              hidden 
                              ref={fileInputRef}
                              onChange={handleImageUpload}
                              accept="image/*"
                          />
                          <button 
                            type="button" 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            className="text-slate-400 hover:text-slate-900 transition-colors"
                          >
                            {isUploading ? <History size={18} className="animate-spin" /> : <Image size={18} />}
                          </button>
                          <input 
                              type="text" 
                              value={message}
                              onChange={(e) => setMessage(e.target.value)}
                              className="flex-1 bg-transparent border-none focus:ring-0 text-[11px] font-bold uppercase tracking-widest p-4 placeholder:text-slate-300"
                              placeholder="Type investigation response..."
                          />
                        </div>
                        <button 
                          type="submit"
                          disabled={!message.trim() && !isUploading}
                          className="w-14 bg-slate-900 text-white flex items-center justify-center rounded-sm shadow-xl shadow-slate-900/20 hover:bg-black transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <Send size={18} />
                        </button>
                    </form>
                  </div>
                )}
             </div>
           ) : (
             <div className="flex-1 flex flex-col items-center justify-center opacity-10 bg-white border border-slate-200 border-dashed rounded-sm">
                <ShieldAlert size={128} className="mb-8" />
                <p className="text-2xl font-black uppercase tracking-[0.5em]">Select Case</p>
             </div>
           )}
        </div>

        {/* Order Details Panel */}
        <div className="xl:col-span-1 space-y-6">
           {selectedTicket && selectedTicket.order ? (
             <div className="bg-white border border-slate-200 rounded-sm p-6 space-y-6 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Order Evidence</span>
                   <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">#{selectedTicket.order._id.slice(-8).toUpperCase()}</span>
                </div>
                
                <div className="space-y-4">
                   <div className="flex justify-between items-center p-4 bg-slate-50 rounded-sm border border-slate-100">
                      <div>
                         <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Amount</p>
                         <p className="text-lg font-black text-slate-900">₹{selectedTicket.order.totalAmount}</p>
                      </div>
                      <div className="text-right">
                         <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1">Order Status</p>
                         <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">{selectedTicket.order.status}</span>
                      </div>
                   </div>

                   <div className="space-y-3">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Items list</p>
                      <div className="space-y-2">
                         {selectedTicket.order.items.map((item, idx) => (
                           <div key={idx} className="flex justify-between items-center py-2 border-b border-slate-50">
                              <span className="text-[10px] font-bold text-slate-700 uppercase tracking-tight">{item.name} x {item.quantity}</span>
                              <span className="text-[10px] font-black text-slate-900">₹{item.price * item.quantity}</span>
                           </div>
                         ))}
                      </div>
                   </div>

                   <div className="pt-4 space-y-2">
                      <div className="flex items-center gap-2 text-slate-400">
                         <Clock size={12} />
                         <span className="text-[9px] font-bold uppercase tracking-widest">Order Date: {new Date(selectedTicket.order.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400">
                         <User size={12} />
                         <span className="text-[9px] font-bold uppercase tracking-widest">Vendor: {selectedTicket.order.vendor?.name || 'Assigned Vendor'}</span>
                      </div>
                   </div>
                </div>

                <button className="w-full py-4 bg-slate-50 text-slate-900 text-[10px] font-black uppercase tracking-[0.2em] rounded-sm border border-slate-200 hover:bg-slate-100 transition-all flex items-center justify-center gap-2">
                   View Full Order <ExternalLink size={12} />
                </button>
             </div>
           ) : (
             <div className="p-10 text-center opacity-40 border border-slate-200 border-dashed rounded-sm bg-white">
                <AlertCircle size={32} className="mx-auto mb-4" />
                <p className="text-[9px] font-black uppercase tracking-widest">No order context linked</p>
             </div>
           )}

           <div className="bg-slate-900 text-white rounded-sm p-6 space-y-4 shadow-xl shadow-slate-900/20">
              <h3 className="text-[11px] font-black uppercase tracking-[0.2em]">Investigation Policy</h3>
              <p className="text-[9px] font-bold text-slate-400 uppercase leading-relaxed tracking-wider">
                1. Verify item weight from pickup log.<br/>
                2. Check vendor dispatch photo.<br/>
                3. Compare with delivery partner photo.<br/>
                4. Match with customer provided image.
              </p>
           </div>
        </div>
      </div>
    </div>
  );
}
