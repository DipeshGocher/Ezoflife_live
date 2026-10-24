import { appDialog } from '../../../shared/stores/appDialogStore';
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ticketApi } from '../../../lib/api';
import toast from 'react-hot-toast';

const SupportTicketsPage = () => {
    const navigate = useNavigate();
    const userData = JSON.parse(
        localStorage.getItem('user') || 
        localStorage.getItem('userData') || 
        localStorage.getItem('vendorData') || 
        localStorage.getItem('supplierData') || 
        '{}'
    );
    const userId = userData._id || userData.id;
    const userRole = userData.role || 'Customer';

    const { ticketId } = useParams();
    const location = useLocation();

    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newTicket, setNewTicket] = useState({ 
        subject: '', 
        category: 'Others', 
        description: '',
        orderId: ''
    });
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [chatMessage, setChatMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    
    // Edit/Delete States
    const [editingTicket, setEditingTicket] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    
    const chatEndRef = useRef(null);

    const fetchTickets = async () => {
        try {
            setLoading(true);
            const data = await ticketApi.getCustomerTickets(userId);
            setTickets(data);
        } catch (err) {
            console.error('Error fetching tickets:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchTicketDetails = async (tid) => {
        try {
            const data = await ticketApi.getTicketDetails(tid);
            setSelectedTicket(data);
        } catch (err) {
            console.error('Error fetching ticket details:', err);
        }
    };

    useEffect(() => {
        if (userId) fetchTickets();
    }, [userId]);

    useEffect(() => {
        if (ticketId && userId) {
            fetchTicketDetails(ticketId);
        } else {
            setSelectedTicket(null);
        }
    }, [ticketId, userId]);

    useEffect(() => {
        if (location.state?.preFill) {
            setNewTicket({
                subject: location.state.preFill.subject || '',
                category: location.state.preFill.category || 'Others',
                description: location.state.preFill.description || '',
                orderId: location.state.preFill.orderId || ''
            });
            setShowCreateModal(true);
        }
    }, [location.state]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [selectedTicket?.messages]);

    const handleCreateTicket = async () => {
        if (!newTicket.subject || !newTicket.description) return;
        try {
            setIsSending(true);
            if (editingTicket) {
                // Update Logic
                const res = await ticketApi.updateTicket(editingTicket._id, newTicket);
                setTickets(tickets.map(t => t._id === editingTicket._id ? { ...t, ...res } : t));
                toast.success('Ticket updated successfully!');
            } else {
                // Create Logic
                const res = await ticketApi.createTicket({ 
                    customer: userId, 
                    ...newTicket 
                });
                toast.success('Ticket created successfully!');
                setTickets([res, ...tickets]);
            }
            setShowCreateModal(false);
            setEditingTicket(null);
            setNewTicket({ subject: '', category: 'Others', description: '', orderId: '' });
        } catch (err) {
            toast.error(editingTicket ? 'Failed to update ticket' : 'Ticket not created. Please try again.');
        } finally {
            setIsSending(false);
        }
    };

    const handleDeleteTicket = async (tid, e) => {
        e.stopPropagation();
        if (!await appDialog.confirm('Are you sure you want to delete this ticket?')) return;
        try {
            setIsDeleting(true);
            await ticketApi.deleteTicket(tid);
            setTickets(tickets.filter(t => t._id !== tid));
            toast.success('Ticket deleted');
            if (selectedTicket?._id === tid) setSelectedTicket(null);
        } catch (err) {
            toast.error('Failed to delete ticket');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleSendChatMessage = async () => {
        if (!chatMessage.trim()) return;
        try {
            setIsSending(true);
            const res = await ticketApi.sendMessage(selectedTicket._id, {
                sender: userId,
                senderRole: 'Customer',
                message: chatMessage
            });
            setSelectedTicket(res);
            setChatMessage('');
            // Refresh main list to update "lastMessage" preview
            fetchTickets();
        } catch (err) {
            toast.error('Failed to send message');
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="bg-background text-on-surface min-h-[100dvh] font-body flex flex-col">
            <header className="fixed top-0 z-50 bg-white/80 backdrop-blur-xl w-full flex items-center justify-between px-6 py-4 border-b border-outline-variant/10">
                <div className="flex items-center">
                    <button 
                        onClick={() => {
                            if (ticketId) {
                                navigate('/user/support/tickets');
                            } else {
                                if (userRole === 'Vendor') navigate('/vendor/dashboard');
                                else if (userRole === 'Supplier') navigate('/supplier/dashboard');
                                else navigate('/user/more');
                            }
                        }} 
                        className="material-symbols-outlined text-on-surface mr-4"
                    >
                        {ticketId ? 'close' : 'arrow_back'}
                    </button>
                    <h1 className="font-headline font-black text-xl text-primary tracking-tighter">
                        {userRole === 'Vendor' ? 'Vendor Support' : userRole === 'Supplier' ? 'Supplier Support' : 'Support Pulse'}
                    </h1>
                </div>
                {!ticketId && (
                    <button 
                        onClick={() => setShowCreateModal(true)}
                        className="w-10 h-10 bg-primary text-on-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20"
                    >
                        <span className="material-symbols-outlined">add</span>
                    </button>
                )}
            </header>

            <main className="flex-grow pt-16 pb-32 px-6 max-w-2xl mx-auto w-full">
                {selectedTicket ? (
                    /* Chat Interface */
                    <div className="flex flex-col h-full">
                        <div className="mb-6 bg-primary/5 p-4 rounded-3xl border border-primary/10">
                            <div className="flex justify-between items-center mb-1">
                                <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                                    selectedTicket.status === 'Resolved' ? 'bg-green-500/10 text-green-600' : 
                                    selectedTicket.status === 'Open' ? 'bg-amber-500/10 text-amber-600' : 
                                    selectedTicket.status === 'In Progress' ? 'bg-blue-500/10 text-blue-600' : 
                                    'bg-slate-200 text-slate-500'
                                }`}>
                                    {selectedTicket.status}
                                </span>
                                <span className="text-[9px] font-bold text-on-surface-variant opacity-40">Ticket ID: {selectedTicket?._id?.slice(-6).toUpperCase() || 'NEW'}</span>
                            </div>
                            <h2 className="text-xl font-black tracking-tight leading-tight">{selectedTicket.subject}</h2>
                        </div>

                        <div className="space-y-4 mb-24">
                            {selectedTicket.messages.map((msg, i) => (
                                <div key={i} className={`flex ${msg.senderRole === 'Customer' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] p-4 rounded-3xl ${
                                        msg.senderRole === 'Customer' 
                                            ? 'bg-slate-900 text-white rounded-tr-none' 
                                            : 'bg-white text-on-surface border border-slate-100 rounded-tl-none shadow-sm'
                                    }`}>
                                        <p className="text-sm font-medium leading-relaxed">{msg.message}</p>
                                        <div className={`text-[8px] mt-2 font-black uppercase tracking-widest opacity-40 ${msg.senderRole === 'Customer' ? 'text-white' : 'text-on-surface'}`}>
                                            {msg.senderRole} • {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <div ref={chatEndRef} />
                        </div>

                        <div className="fixed bottom-0 left-0 right-0 p-6 bg-white border-t border-slate-100 z-50">
                            <div className="max-w-2xl mx-auto flex gap-3">
                                <input 
                                    className="flex-grow bg-slate-50 border-none rounded-2xl px-5 py-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                                    placeholder="Type your message..."
                                    value={chatMessage}
                                    onChange={(e) => setChatMessage(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handleSendChatMessage()}
                                />
                                <button 
                                    onClick={handleSendChatMessage}
                                    disabled={isSending || !chatMessage.trim()}
                                    className="w-14 h-14 bg-primary text-on-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-50"
                                >
                                    <span className="material-symbols-outlined">send</span>
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Ticket List */
                    <div>
                        <div className="mb-10 ml-2">
                            <h2 className="text-3xl font-black tracking-tighter uppercase leading-none mb-2">My Assistance Requests</h2>
                            <p className="text-[11px] font-bold text-on-surface-variant opacity-50 uppercase tracking-widest">Tracking your active & resolved inquiries</p>
                        </div>

                        {loading ? (
                            <div className="py-20 text-center">
                                <motion.div animate={{ rotate: 360 }} transition={{ duration:1, repeat: Infinity, ease: "linear" }} className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Polling system records...</p>
                            </div>
                        ) : tickets.length > 0 ? (
                            <div className="space-y-4">
                                {tickets.map(ticket => (
                                    <motion.button 
                                        key={ticket._id}
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => navigate(`/user/support/tickets/${ticket._id}`)}
                                        className="w-full bg-white rounded-[2.5rem] p-6 border border-outline-variant/5 shadow-lg shadow-primary/5 text-left flex justify-between items-center"
                                    >
                                        <div className="flex-grow">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                                                    ticket.status === 'Resolved' ? 'bg-green-500/10 text-green-600' : 
                                                    ticket.status === 'Open' ? 'bg-amber-500/10 text-amber-600' : 
                                                    ticket.status === 'In Progress' ? 'bg-blue-500/10 text-blue-600' : 
                                                    'bg-slate-200 text-slate-500'
                                                }`}>
                                                    {ticket.status}
                                                </span>
                                                <span className="text-[8px] font-black text-on-surface-variant opacity-30 uppercase tracking-widest">{ticket.category}</span>
                                            </div>
                                            <h3 className="text-lg font-black tracking-tight text-on-surface mb-1">{ticket.subject}</h3>
                                            <p className="text-[10px] font-bold text-on-surface-variant opacity-60 truncate max-w-[200px]">
                                                {ticket.messages && ticket.messages.length > 0 ? ticket.messages[ticket.messages.length - 1]?.message : 'No messages yet'}
                                            </p>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            {ticket.status !== 'Resolved' && (
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditingTicket(ticket);
                                                        setNewTicket({
                                                            subject: ticket.subject,
                                                            category: ticket.category,
                                                            description: ticket.description
                                                        });
                                                        setShowCreateModal(true);
                                                    }}
                                                    className="w-8 h-8 bg-slate-100 text-slate-400 rounded-lg flex items-center justify-center hover:bg-slate-900 hover:text-white transition-all"
                                                >
                                                    <span className="material-symbols-outlined text-sm">edit</span>
                                                </button>
                                            )}
                                            <button 
                                                onClick={(e) => handleDeleteTicket(ticket._id, e)}
                                                className="w-8 h-8 bg-red-50 text-red-400 rounded-lg flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"
                                            >
                                                <span className="material-symbols-outlined text-sm">delete</span>
                                            </button>
                                        </div>
                                    </motion.button>
                                ))}
                            </div>
                        ) : (
                            <div className="py-24 text-center">
                                <span className="material-symbols-outlined text-5xl mb-4 opacity-20">support_agent</span>
                                <p className="text-xs font-black uppercase tracking-widest opacity-30 mb-8">No active tickets</p>
                                <button 
                                    onClick={() => setShowCreateModal(true)}
                                    className="bg-primary text-on-primary px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20 transition-all active:scale-95"
                                >
                                    Raise Your First Ticket
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Create Ticket Modal */}
            <AnimatePresence>
                {showCreateModal && (
                    <motion.div 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-end md:items-center justify-center p-6"
                    >
                        <motion.div 
                            initial={{ y: 50 }} animate={{ y: 0 }} exit={{ y: 50 }}
                            className="bg-white w-full max-w-md rounded-[3rem] p-8 shadow-2xl"
                        >
                            <h3 className="text-2xl font-black tracking-tighter mb-6 uppercase">
                                {editingTicket ? 'Edit Concern' : 'Raise Concern'}
                            </h3>
                            <div className="space-y-5">
                                <div>
                                    <label className="block text-[9px] font-black uppercase tracking-widest text-on-surface-variant mb-2 ml-1">Issue Subject</label>
                                    <input 
                                        className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                                        placeholder="e.g. Payment not success"
                                        value={newTicket.subject}
                                        onChange={(e) => setNewTicket({...newTicket, subject: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[9px] font-black uppercase tracking-widest text-on-surface-variant mb-2 ml-1">Category</label>
                                    <input 
                                        className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                                        placeholder="e.g. Broken Button, Delay, etc."
                                        value={newTicket.category}
                                        onChange={(e) => setNewTicket({...newTicket, category: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[9px] font-black uppercase tracking-widest text-on-surface-variant mb-2 ml-1">Detailed Description</label>
                                    <textarea 
                                        rows={4}
                                        className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none resize-none"
                                        placeholder="Explain your problem in detail..."
                                        value={newTicket.description}
                                        onChange={(e) => setNewTicket({...newTicket, description: e.target.value})}
                                    />
                                </div>
                                <div className="flex gap-4 pt-4">
                                    <button onClick={() => {
                                        setShowCreateModal(false);
                                        setEditingTicket(null);
                                        setNewTicket({ subject: '', category: 'Others', description: '' });
                                    }} className="flex-1 py-4 font-black text-[10px] uppercase tracking-widest text-on-surface-variant">Cancel</button>
                                    <button 
                                        onClick={handleCreateTicket}
                                        disabled={isSending || !newTicket.subject || !newTicket.description}
                                        className="flex-1 bg-primary text-on-primary py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-95 transition-all"
                                    >
                                        {editingTicket ? 'Update Ticket' : 'Submit Ticket'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default SupportTicketsPage;
