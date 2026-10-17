import { socketAuth } from '../../../lib/socketAuth';
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageSquare, Search, User, Send, Loader2, ArrowLeft, Package } from 'lucide-react';
import io from 'socket.io-client';
import PageHeader from '../components/common/PageHeader';
import { ticketApi, adminApi } from '../../../lib/api';
import toast from 'react-hot-toast';
import { FilterLabel } from "../components/common/FilterLabel";

export default function HelpDesk() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [adminMessage, setAdminMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('activeTab') || 'Customer';
  
  // Filtering States
  const [nameFilter, setNameFilter] = useState('All');
  const [chatIdFilter, setChatIdFilter] = useState('All');
  const [timeFilter, setTimeFilter] = useState('All');
  
  const chatEndRef = useRef(null);
  const socketRef = useRef(null);

  // Initialize socket
  useEffect(() => {
    const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';
    const s = io(SOCKET_URL, { auth: socketAuth, autoConnect: true, reconnection: true });
    socketRef.current = s;

    s.on('new_ticket', (newTicket) => {
      setTickets(prev => {
        if (prev.some(t => t._id === newTicket._id)) return prev;
        return [newTicket, ...prev];
      });
    });

    return () => {
      s.disconnect();
    };
  }, []);

  // Listen to messages for the selected ticket room
  useEffect(() => {
    if (selectedTicket && socketRef.current) {
      socketRef.current.emit('join_room', `ticket_${selectedTicket._id}`);

      const handleNewMessage = (data) => {
        if (data.ticketId === selectedTicket._id) {
          setSelectedTicket(prev => {
            if (!prev || prev._id !== data.ticketId) return prev;
            const exists = prev.messages?.some(m => m._id && data.message?._id && m._id === data.message._id);
            if (exists) return prev;
            return {
              ...prev,
              messages: [...(prev.messages || []), data.message]
            };
          });
        }
      };

      socketRef.current.on('new_message', handleNewMessage);
      return () => {
        socketRef.current.off('new_message', handleNewMessage);
      };
    }
  }, [selectedTicket?._id]);

  // Reset filters on tab change
  useEffect(() => {
    setNameFilter('All');
    setChatIdFilter('All');
    setTimeFilter('All');
    setIsMobileChatOpen(false);
  }, [activeTab]);

  const getTicketRole = (t) => {
    if (t?.userType) return t.userType;
    if (t?.vendor && !t?.customer) return 'Vendor';
    return t?.customer?.role || 'Customer';
  };

  const getTicketPartyName = (t) => {
    if (!t) return 'User';
    const role = getTicketRole(t);
    if (role === 'Vendor') {
      return t.vendor?.shopDetails?.name || t.vendor?.displayName || t.customer?.displayName || 'Vendor';
    }
    return t.customer?.displayName || t.customer?.ownerName || t.customer?.phone || 'Customer';
  };

  const getTicketPartyPhone = (t) => {
    if (!t) return '';
    const role = getTicketRole(t);
    if (role === 'Vendor') {
      return t.vendor?.phone || t.customer?.phone || '';
    }
    return t.customer?.phone || '';
  };

  const fetchAllTickets = async () => {
    try {
      setLoading(true);
      const data = await ticketApi.getAllTickets();
      setTickets(data);
      
      // Auto-select first ticket of the active tab (excluding disputes)
      const filtered = data.filter(t => 
        (t.customer?.role || 'Customer') === activeTab &&
        getTicketRole(t) === activeTab &&
        !['Missing Items', 'Damaged Items', 'Wrong Items'].includes(t.category)
      );
      if (filtered.length > 0) {
        const detailedTicket = await ticketApi.getTicketDetails(filtered[0]._id);
        setSelectedTicket(detailedTicket);
      } else {
        setSelectedTicket(null);
      }
    } catch (err) {
      console.error('Error fetching admin tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllTickets();
  }, [activeTab]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedTicket?.messages]);

  const handleSelectTicket = async (ticket) => {
    try {
      const detailed = await ticketApi.getTicketDetails(ticket._id);
      setSelectedTicket(detailed);
      setIsMobileChatOpen(true);
    } catch (err) {
      console.error('Error fetching ticket details:', err);
    }
  };

  const handleSendAdminReply = async () => {
    if (!adminMessage.trim() || !selectedTicket) return;
    try {
      setIsSending(true);
      // Using a hardcoded admin ID for now or from auth if available
      const adminId = '673966843120ade7183e719b'; // Fallback to current user ID
      const res = await ticketApi.sendMessage(selectedTicket._id, {
        sender: adminId,
        senderRole: 'Admin',
        message: adminMessage
      });
      
      // Update local state
      const updatedDetailed = await ticketApi.getTicketDetails(selectedTicket._id);
      setSelectedTicket(updatedDetailed);
      setAdminMessage('');
      
      // Refresh list to update status/last message
      const listData = await ticketApi.getAllTickets();
      setTickets(listData);
    } catch (err) {
      alert('Failed to send reply');
    } finally {
      setIsSending(false);
    }
  };

  const handleResolveTicket = async () => {
    if (!selectedTicket) return;
    try {
      await ticketApi.updateTicketStatus(selectedTicket._id, 'Resolved');
      const detailed = await ticketApi.getTicketDetails(selectedTicket._id);
      setSelectedTicket(detailed);
      const listData = await ticketApi.getAllTickets();
      setTickets(listData);
    } catch (err) {
      alert('Failed to resolve ticket');
    }
  };
  // Time checking helpers
  const isToday = (dateString) => {
    const today = new Date();
    const date = new Date(dateString);
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  };

  const isYesterday = (dateString) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const date = new Date(dateString);
    return date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();
  };

  const isWithinLast7Days = (dateString) => {
    const date = new Date(dateString);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return date >= sevenDaysAgo;
  };

  const uniqueNames = useMemo(() => {
    const names = tickets
      .filter(t => getTicketRole(t) === activeTab)
      .filter(t => !['Missing Items', 'Damaged Items', 'Wrong Items'].includes(t.category))
      .map(t => getTicketPartyName(t));
    return ['All', ...new Set(names)].sort();
  }, [tickets, activeTab]);

  const uniqueChatIds = useMemo(() => {
    const ids = tickets
      .filter(t => getTicketRole(t) === activeTab)
      .filter(t => !['Missing Items', 'Damaged Items', 'Wrong Items'].includes(t.category))
      .map(t => t._id);
    return ['All', ...new Set(ids)];
  }, [tickets, activeTab]);

  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      const matchesRole = getTicketRole(t) === activeTab;
      const isDispute = ['Missing Items', 'Damaged Items', 'Wrong Items'].includes(t.category);
      if (isDispute) return false;
      
      const ticketName = getTicketPartyName(t);
      const matchesName = nameFilter === 'All' || ticketName === nameFilter;
      
      const matchesChatId = chatIdFilter === 'All' || t._id === chatIdFilter;
      
      let matchesTime = true;
      const ticketDate = t.updatedAt || t.createdAt;
      if (timeFilter === 'Today') {
        matchesTime = isToday(ticketDate);
      } else if (timeFilter === 'Yesterday') {
        matchesTime = isYesterday(ticketDate);
      } else if (timeFilter === 'Last 7 Days') {
        matchesTime = isWithinLast7Days(ticketDate);
      }

      return matchesRole && matchesName && matchesChatId && matchesTime;
    });
  }, [tickets, activeTab, nameFilter, chatIdFilter, timeFilter]);

  const customerCount = useMemo(() => {
    return tickets.filter(t => 
      getTicketRole(t) === 'Customer' &&
      !['Missing Items', 'Damaged Items', 'Wrong Items'].includes(t.category)
    ).length;
  }, [tickets]);

  const vendorCount = useMemo(() => {
    return tickets.filter(t => 
      getTicketRole(t) === 'Vendor' &&
      !['Missing Items', 'Damaged Items', 'Wrong Items'].includes(t.category)
    ).length;
  }, [tickets]);

  const supplierCount = useMemo(() => {
    return tickets.filter(t => 
      getTicketRole(t) === 'Supplier' &&
      !['Missing Items', 'Damaged Items', 'Wrong Items'].includes(t.category)
    ).length;
  }, [tickets]);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-50/50 overflow-hidden">
      <div className="flex-shrink-0">
        <PageHeader 
          title="Help Desk" 
          title={activeTab === 'Vendor' ? 'Help Desk - Vendor Issues' : activeTab === 'Supplier' ? 'Help Desk - Supplier Issues' : 'Help Desk - Customer Issues'} 
        />
      </div>

      <div className="flex flex-1 overflow-hidden divide-x divide-slate-200 bg-white border-t border-slate-200">
        
        {/* Ticket List Sidebar */}
        <div className={`w-full lg:w-[450px] flex flex-col bg-white overflow-hidden ${isMobileChatOpen ? 'hidden lg:flex' : 'flex'}`}>
          {/* Issue Type Tabs */}
          <FilterLabel label="Raised by" className="px-3 pt-2 bg-slate-50/70" info="Switches between tickets raised by customers, vendors and suppliers. The number is how many tickets each group has." />
          <div className="flex border-b border-slate-200 bg-slate-50/70 p-2 gap-1.5">
            {[
              { id: 'Customer', label: 'Customer Issues', count: customerCount },
              { id: 'Vendor', label: 'Vendor Issues', count: vendorCount },
              { id: 'Supplier', label: 'Supplier Issues', count: supplierCount },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSearchParams({ activeTab: tab.id })}
                className={`flex-1 py-2 px-2 rounded-sm text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === tab.id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <span className="truncate">{tab.label}</span>
                <span className={`text-[8px] px-1.5 py-0.2 rounded-full ${
                  activeTab === tab.id ? 'bg-slate-800 text-slate-200' : 'bg-slate-200 text-slate-600'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="p-6 border-b border-slate-100">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <FilterLabel label="Name" className="mb-1 ml-1" info="Shows only tickets from this person." />
                <select
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-sm text-[9px] font-black uppercase tracking-wider outline-none focus:bg-white focus:border-slate-900 transition-all cursor-pointer text-slate-800"
                >
                  {uniqueNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <FilterLabel label="Chat ID" className="mb-1 ml-1" info="Shows only one ticket conversation, by its ID (last 6 characters shown)." />
                <select
                  value={chatIdFilter}
                  onChange={(e) => setChatIdFilter(e.target.value)}
                  className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-sm text-[9px] font-black uppercase tracking-wider outline-none focus:bg-white focus:border-slate-900 transition-all cursor-pointer text-slate-800"
                >
                  {uniqueChatIds.map((id) => (
                    <option key={id} value={id}>
                      {id === 'All' ? 'ALL' : `#${id.slice(-6).toUpperCase()}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <FilterLabel label="Last activity" className="mb-1 ml-1" info="Shows tickets by when they were last updated (or created, if never updated): today, yesterday or the last 7 days." />
                <select
                  value={timeFilter}
                  onChange={(e) => setTimeFilter(e.target.value)}
                  className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-sm text-[9px] font-black uppercase tracking-wider outline-none focus:bg-white focus:border-slate-900 transition-all cursor-pointer text-slate-800"
                >
                  <option value="All">ALL</option>
                  <option value="Today">TODAY</option>
                  <option value="Yesterday">YESTERDAY</option>
                  <option value="Last 7 Days">LAST 7 DAYS</option>
                </select>
              </div>
            </div>
          </div>



          <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
            {loading ? (
              <div className="p-20 text-center opacity-40">
                <Loader2 size={32} className="animate-spin mx-auto mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest">Polling Database...</p>
              </div>
            ) : filteredTickets.length > 0 ? (
              filteredTickets.map(ticket => (
                <div 
                  key={ticket._id}
                  onClick={() => handleSelectTicket(ticket)}
                  className={`p-6 cursor-pointer hover:bg-slate-50 transition-all relative group ${selectedTicket?._id === ticket._id ? 'bg-slate-50' : ''}`}
                >
                  {selectedTicket?._id === ticket._id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-slate-900"></div>}
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-slate-900 tabular-nums">#{ticket?._id?.slice(-6).toUpperCase() || '...'}</span>
                      <span className={`px-1.5 py-0.5 rounded-sm text-[8px] font-black uppercase tracking-widest ${
                        ticket.status === 'Resolved' ? 'bg-emerald-50 text-emerald-600' : 
                        ticket.status === 'Open' ? 'bg-amber-50 text-amber-600' : 
                        'bg-blue-50 text-blue-600'
                      }`}>
                        {ticket.status}
                      </span>
                    </div>
                    <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">
                      {new Date(ticket.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-tight mb-2 group-hover:translate-x-1 transition-transform">{ticket.subject}</h4>
                  <div className="flex flex-wrap items-center gap-2.5">
                     <div className="flex items-center gap-1.5 opacity-70">
                      <User size={10} className="text-slate-400" />
                      <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">
                        {getTicketPartyName(ticket)}
                        <span className={`ml-1.5 px-1.5 py-0.5 rounded-sm text-[7px] font-black uppercase tracking-widest ${
                          getTicketRole(ticket) === 'Vendor' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {getTicketRole(ticket)}
                        </span>
                      </span>
                     </div>
                     <div className="flex items-center gap-1.5 opacity-60">
                        <MessageSquare size={10} className="text-slate-400" />
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{ticket.category}</span>
                     </div>
                     {ticket.order && (
                       <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-700 text-[8px] font-black tracking-wide">
                         <Package size={9} className="text-slate-500" />
                         ORD #{ticket.order.orderId || ticket.order._id?.slice(-6).toUpperCase()}
                       </span>
                     )}
                  </div>
                </div>
              ))
            ) : (
                <div className="p-20 text-center opacity-20">
                  <p className="text-[10px] font-black uppercase tracking-widest">No Active Tickets</p>
                </div>
            )}
          </div>
        </div>

        {/* Conversation View */}
        <div className={`flex-1 flex-col bg-slate-50 relative ${isMobileChatOpen ? 'flex' : 'hidden lg:flex'}`}>
          {selectedTicket ? (
            <>
              {/* Context Header */}
              <div className="p-8 bg-white border-b border-slate-100 flex justify-between items-start">
                 <div className="flex items-center gap-5">
                     <button 
                       onClick={() => setIsMobileChatOpen(false)}
                       className="lg:hidden p-1 -ml-2 text-slate-500 hover:text-slate-900 rounded-full hover:bg-slate-100 transition-colors"
                     >
                       <ArrowLeft size={20} />
                     </button>
                     <div>
                       <h2 className="text-xl font-black text-slate-900 tracking-tighter uppercase">{selectedTicket.customer?.displayName || selectedTicket.customer?.ownerName || selectedTicket.customer?.phone || 'Unknown User'}</h2>
                        {selectedTicket.customer?.phone && (
                          <div className="flex items-center gap-3 mt-1.5">
                             <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">{selectedTicket.customer?.phone}</span>
                          </div>
                        )}
                       <div className="flex items-center gap-2">
                         <h2 className="text-xl font-black text-slate-900 tracking-tighter uppercase">{getTicketPartyName(selectedTicket)}</h2>
                         <span className={`px-2 py-0.5 rounded-sm text-[8px] font-black uppercase tracking-widest ${
                           getTicketRole(selectedTicket) === 'Vendor' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'
                         }`}>
                           {getTicketRole(selectedTicket)}
                         </span>
                       </div>
                       <div className="flex flex-wrap items-center gap-3 mt-1.5">
                         {getTicketPartyPhone(selectedTicket) && (
                           <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">{getTicketPartyPhone(selectedTicket)}</span>
                         )}
                         {selectedTicket.order && (
                           <span className="flex items-center gap-1 px-2 py-0.5 rounded-sm bg-slate-100 text-slate-800 text-[9px] font-black tracking-wider">
                             <Package size={10} className="text-slate-500" />
                             ORDER #{selectedTicket.order.orderId || selectedTicket.order._id?.slice(-6).toUpperCase()}
                             {selectedTicket.order.status && (
                               <span className="ml-1 text-[8px] text-slate-500 font-bold uppercase">({selectedTicket.order.status})</span>
                             )}
                           </span>
                         )}
                         <span className="px-2 py-0.5 rounded-sm bg-slate-100 text-slate-500 text-[9px] font-bold uppercase">
                           Category: {selectedTicket.category}
                         </span>
                       </div>
                     </div>
                 </div>
                 <div className="flex gap-2.5">
                    {selectedTicket.status !== 'Resolved' && (
                      <button 
                        onClick={handleResolveTicket}
                        className="px-4 py-2 bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest transition-all rounded-sm flex items-center gap-2"
                        className="px-4 py-2 bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest transition-all rounded-sm flex items-center gap-2 hover:bg-emerald-700"
                      >
                         Resolve Ticket
                      </button>
                    )}
                 </div>
              </div>

              {/* Chat Thread */}
              <div className="flex-1 overflow-y-auto p-10 space-y-8">
                 <div className="flex flex-col items-center">
                    <span className="px-3 py-1 bg-slate-200 text-slate-500 rounded-full text-[8px] font-black uppercase tracking-[0.2em] mb-4">Ticket Lifecycle Initialized</span>
                 </div>
                 
                 {selectedTicket.messages.map((chat, idx) => (
                    <div key={idx} className={`flex gap-4 max-w-[80%] ${chat.senderRole === 'Admin' ? 'ml-auto flex-row-reverse' : ''}`}>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest self-center flex-shrink-0">
                          {chat.senderRole === 'Admin' ? 'Admin' : (selectedTicket.customer?.displayName || selectedTicket.customer?.ownerName || selectedTicket.customer?.phone || 'User')}
                          {chat.senderRole === 'Admin' ? 'Admin' : (chat.senderRole === 'Vendor' ? (selectedTicket.vendor?.shopDetails?.name || selectedTicket.vendor?.displayName || 'Vendor') : (selectedTicket.customer?.displayName || selectedTicket.customer?.ownerName || selectedTicket.customer?.phone || 'Customer'))}
                        </span>
                       <div className={`space-y-2 ${chat.senderRole === 'Admin' ? 'items-end flex flex-col' : ''}`}>
                          <div className={`p-5 rounded-sm shadow-sm ${chat.senderRole === 'Admin' ? 'bg-slate-900 text-white shadow-xl' : 'bg-white border border-slate-100 text-slate-800'}`}>
                             <p className="text-[11px] font-bold leading-relaxed uppercase tracking-tight">
                               {chat.message}
                             </p>
                             {chat.attachments && chat.attachments.length > 0 && (
                               <div className="flex flex-wrap gap-2 mt-3 pt-2 border-t border-slate-100/20">
                                 {chat.attachments.map((att, i) => (
                                   <a key={i} href={att} target="_blank" rel="noopener noreferrer" className="block group">
                                     <img 
                                       src={att} 
                                       alt="Attachment" 
                                       className="w-24 h-24 object-cover rounded border border-slate-200 group-hover:opacity-80 transition-opacity" 
                                     />
                                   </a>
                                 ))}
                               </div>
                             )}
                          </div>
                          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                            {new Date(chat.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                       </div>
                    </div>
                 ))}
                 <div ref={chatEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-6 bg-white border-t border-slate-100">
                 <div className="relative">
                    <textarea 
                      placeholder="ENTER MESSAGE..." 
                      className="w-full h-20 p-5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-black uppercase tracking-widest outline-none focus:bg-white focus:border-slate-900 transition-all resize-none"
                      value={adminMessage}
                      onChange={(e) => setAdminMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendAdminReply()}
                    />
                    <div className="absolute bottom-3 right-3 flex gap-2">
                       <button 
                        onClick={handleSendAdminReply}
                        disabled={isSending || !adminMessage.trim()}
                        className="px-5 py-1.5 bg-slate-900 text-white rounded-[1px] text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-slate-900/20 flex items-center gap-2 disabled:opacity-50 transition-all"
                       >
                          {isSending ? 'Sending...' : 'Send'} <Send size={11} />
                       </button>
                    </div>
                 </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center opacity-20">
               <MessageSquare size={64} className="mb-6" />
               <p className="text-[12px] font-black uppercase tracking-[0.4em]">Awaiting Selection</p>
            </div>
          )}
        </div>
      </div>


    </div>
  );
}
