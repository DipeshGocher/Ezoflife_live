import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ticketApi, mediaApi } from '../../../lib/api';
import { createAuthenticatedSocket, subscribeSocketRooms } from '../../../lib/socket';
import toast from 'react-hot-toast';

const ChatPage = () => {
    const navigate = useNavigate();
    const { orderId } = useParams();
    const [message, setMessage] = useState('');
    const [ticket, setTicket] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [displayedWelcome, setDisplayedWelcome] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const scrollRef = useRef(null);
    const socketRef = useRef(null);
    const fileInputRef = useRef(null);

    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
    const userId = userData._id || userData.id;

    useEffect(() => {
        const initChat = async () => {
            try {
                // Fetch dynamic welcome message
                let welcomeMsg = 'Hello! How can we help you?';
                try {
                    const { adminApi } = await import('../../../lib/api');
                    const configs = await adminApi.getConfigs();
                    const chatConfig = configs.find(c => c.key === 'chat_welcome_message');
                    if (chatConfig) welcomeMsg = chatConfig.value;
                } catch (configErr) {
                    console.error('Failed to fetch chat config:', configErr);
                }

                const finalMsg = welcomeMsg.replace('{orderId}', orderId);
                const existingTicket = await ticketApi.getTicketByOrder(orderId);
                
                if (existingTicket) {
                    setTicket(existingTicket);
                    setLoading(false);
                } else {
                    // NEW: Typing simulation for first-time chat
                    setLoading(false); // Stop main loader early to show typing
                    setIsTyping(true);
                    
                    setTimeout(() => {
                        setIsTyping(false);
                        let i = 0;
                        const interval = setInterval(() => {
                            setDisplayedWelcome(finalMsg.slice(0, i + 1));
                            i++;
                            if (i >= finalMsg.length) {
                                clearInterval(interval);
                                setTicket({
                                    status: 'Open',
                                    messages: [{ 
                                        id: 'welcome', 
                                        senderRole: 'Admin', 
                                        message: finalMsg, 
                                        isAI: true,
                                        createdAt: new Date() 
                                    }]
                                });
                            }
                        }, 30);
                    }, 1500);

                    // Placeholder ticket while typing
                    setTicket({
                        status: 'Open',
                        messages: []
                    });
                }
            } catch (err) {
                console.error('Chat Init Error:', err);
                setLoading(false);
            } finally {
                // Don't set loading false here if we're doing the typing simulation
            }
        };

        initChat();
        socketRef.current = createAuthenticatedSocket();
        
        return () => {
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, [orderId]);

    useEffect(() => {
        const client = socketRef.current;
        const unsubscribeRooms = ticket && client ? subscribeSocketRooms(client, [`ticket_${ticket._id}`]) : () => {};
        if (ticket && client) {
            
            socketRef.current.on('new_message', (data) => {
                if (data.ticketId === ticket._id) {
                    setTicket(prev => ({
                        ...prev,
                        messages: [...prev.messages, data.message]
                    }));
                }
            });

            // Listen for status updates
            socketRef.current.on('status_updated', (data) => {
                if (data.ticketId === ticket._id) {
                    setTicket(prev => ({
                        ...prev,
                        status: data.status
                    }));
                }
            });
        }
        return () => {
            unsubscribeRooms();
            if (client) {
                client.off('new_message');
                client.off('status_updated');
            }
        };
    }, [ticket?._id]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [ticket?.messages]);

    const handleSendMessage = async (e, attachments = []) => {
        if (e) e.preventDefault();
        if (ticket?.status === 'Resolved') return;
        
        const msgText = message.trim();
        if (!msgText && attachments.length === 0) return;

        try {
            let currentTicket = ticket;

            // Create ticket first if it doesn't exist on server (no _id)
            if (!currentTicket._id) {
                const newTicket = await ticketApi.createTicket({
                    customer: userId,
                    orderId: orderId,
                    subject: `Dispute for Order ${orderId}`,
                    category: 'Missing Items',
                    description: msgText || 'Image attached for dispute',
                    attachments: attachments
                });
                setTicket(newTicket);
                setMessage('');
                return;
            }

            // Otherwise send message to existing ticket
            await ticketApi.sendMessage(currentTicket._id, {
                sender: userId,
                senderRole: 'Customer',
                message: msgText,
                attachments: attachments
            });
            setMessage('');
        } catch (err) {
            console.error('Failed to send message:', err);
            toast.error('Failed to send message');
        }
    };

    const handleImageUpload = async (e) => {
        if (ticket?.status === 'Resolved') return;
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
            console.error('Image upload failed:', err);
            toast.error('Image upload failed');
        } finally {
            setIsUploading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-surface flex items-center justify-center p-6">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-on-surface-variant font-bold text-xs uppercase tracking-[0.2em] animate-pulse">Initializing Secure Channel...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[100dvh] bg-surface font-body overflow-hidden">
            <header className="flex-shrink-0 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/30 px-6 py-5 flex items-center gap-5 z-20">
                <motion.button 
                    whileTap={{ scale: 0.9 }}
                    onClick={() => navigate(-1)}
                    className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface"
                >
                    <span className="material-symbols-outlined text-2xl">arrow_back</span>
                </motion.button>
                <div className="flex-1 min-w-0">
                    <h1 className="text-xl font-black text-on-surface truncate leading-tight uppercase tracking-tight">
                        Dispute Support
                    </h1>
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full animate-pulse ${ticket?.status === 'Resolved' ? 'bg-emerald-500' : 'bg-primary'}`} />
                        <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                            Order #{orderId?.slice(-8).toUpperCase()} · {ticket?.status || 'Active'}
                        </p>
                    </div>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.02),transparent)]">
                {ticket?.messages.map((msg, i) => (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={i} 
                        className={`flex ${msg.senderRole === 'Admin' ? 'justify-start' : 'justify-end'}`}
                    >
                        <div className={`max-w-[85%] space-y-2 ${msg.senderRole === 'Admin' ? '' : 'flex flex-col items-end'}`}>
                            {msg.isAI && (
                                <div className="flex items-center gap-1.5 px-1">
                                    <span className="material-symbols-outlined text-[10px] text-primary animate-pulse">auto_awesome</span>
                                    <span className="text-[8px] font-black text-primary uppercase tracking-widest">AI Assistant</span>
                                </div>
                            )}
                            <div className={`p-5 rounded-[2rem] text-[13px] font-bold leading-relaxed shadow-sm ${
                                msg.senderRole === 'Admin' 
                                    ? 'bg-surface-container-high text-on-surface rounded-tl-none border border-outline-variant/20' 
                                    : 'bg-primary text-on-primary rounded-tr-none shadow-primary/20'
                            }`}>
                                {msg.message}
                                {msg.attachments?.length > 0 && (
                                    <div className="mt-4 grid grid-cols-1 gap-2">
                                        {msg.attachments.map((at, j) => (
                                            <img key={j} src={at.url} alt="Evidence" className="rounded-2xl max-h-64 w-full object-cover border border-black/5" />
                                        ))}
                                    </div>
                                )}
                            </div>
                            <span className="text-[9px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em] px-2">
                                {msg.senderRole === 'Admin' ? (msg.isAI ? 'Spinzyt AI' : 'Admin Support') : 'You'} · {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    </motion.div>
                ))}

                {isTyping && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                        <div className="max-w-[85%] space-y-2">
                            <div className="flex items-center gap-1.5 px-1">
                                <span className="material-symbols-outlined text-[10px] text-primary animate-pulse">auto_awesome</span>
                                <span className="text-[8px] font-black text-primary uppercase tracking-widest">AI is thinking...</span>
                            </div>
                            <div className="p-5 rounded-[2rem] bg-surface-container-high text-on-surface rounded-tl-none border border-outline-variant/20">
                                <div className="flex gap-1">
                                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
                                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
                                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" />
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}

                {displayedWelcome && !ticket?.messages.some(m => m.id === 'welcome') && (
                    <div className="flex justify-start">
                        <div className="max-w-[85%] space-y-2">
                            <div className="flex items-center gap-1.5 px-1">
                                <span className="material-symbols-outlined text-[10px] text-primary">auto_awesome</span>
                                <span className="text-[8px] font-black text-primary uppercase tracking-widest">AI Assistant</span>
                            </div>
                            <div className="p-5 rounded-[2rem] bg-surface-container-high text-on-surface rounded-tl-none border border-outline-variant/20 shadow-sm">
                                {displayedWelcome}
                            </div>
                        </div>
                    </div>
                )}

                {ticket?.status === 'Resolved' && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-emerald-50 border border-emerald-100 p-8 rounded-[2.5rem] text-center space-y-4 my-10"
                    >
                        <div className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/30">
                            <span className="material-symbols-outlined text-3xl">check_circle</span>
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-emerald-900 uppercase tracking-tight">Issue Resolved</h3>
                            <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-widest leading-relaxed mt-2">
                                Your issue is resolved and chatting is closed.
                            </p>
                        </div>
                        <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => navigate('/user/orders')}
                            className="px-8 py-3 bg-emerald-900 text-white rounded-full text-[10px] font-black uppercase tracking-[0.2em]"
                        >
                            Back to Orders
                        </motion.button>
                    </motion.div>
                )}
                <div ref={scrollRef} />
            </div>

            <footer className="flex-shrink-0 p-6 bg-surface border-t border-outline-variant/30">
                {ticket?.status !== 'Resolved' ? (
                    <form onSubmit={handleSendMessage} className="flex gap-4 items-center max-w-[800px] mx-auto w-full">
                        <div className="flex-1 bg-surface-container-high rounded-[2.5rem] flex items-center px-6 py-2 border border-outline-variant/20 focus-within:border-primary/50 transition-all shadow-sm">
                            <input 
                                type="file" 
                                hidden 
                                ref={fileInputRef}
                                onChange={handleImageUpload}
                                accept="image/*"
                            />
                            <motion.button 
                                whileTap={{ scale: 0.9 }}
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading}
                                className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-highest transition-colors"
                            >
                                {isUploading ? <span className="material-symbols-outlined animate-spin">history</span> : <span className="material-symbols-outlined">image</span>}
                            </motion.button>
                            <input 
                                type="text" 
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-bold text-on-surface p-4 placeholder:text-on-surface-variant/40"
                                placeholder="Describe the issue..."
                            />
                        </div>
                        <motion.button 
                            whileTap={{ scale: 0.9 }}
                            type="submit"
                            disabled={!message.trim() && !isUploading}
                            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-xl ${
                                message.trim() 
                                    ? 'bg-primary text-on-primary shadow-primary/20' 
                                    : 'bg-surface-container-high text-on-surface-variant/20 shadow-none'
                            }`}
                        >
                            <span className="material-symbols-outlined text-2xl">send</span>
                        </motion.button>
                    </form>
                ) : (
                    <div className="text-center py-4">
                        <p className="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.3em]">Conversation Terminated</p>
                    </div>
                )}
            </footer>
        </div>
    );
};

export default ChatPage;
