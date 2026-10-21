import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import useNotificationStore from '../../../shared/stores/notificationStore';

const NotificationsPage = () => {
  const navigate = useNavigate();
  const { notifications, markAsRead, clearAll, fetchNotifications } = useNotificationStore();
  const userId = useMemo(() => {
    const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('userData') || '{}');
    return user._id || user.id;
  }, []);

  // Saved customer notifications use 'user'; socket events use 'customer'.
  useEffect(() => {
    if (userId) fetchNotifications(userId, 'user');
  }, [userId, fetchNotifications]);
  
  // Filter for user-specific notifications
  const userNotifications = useMemo(() => 
    notifications.filter(n => ['customer', 'user'].includes(n.persona?.toLowerCase())),
    [notifications]
  );

  const unreadUserCount = useMemo(() => 
    userNotifications.filter(n => !n.read).length,
    [userNotifications]
  );

  const containerVariants = useMemo(() => ({
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  }), []);

  const itemVariants = useMemo(() => ({
    hidden: { y: 10, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { duration: 0.4 } }
  }), []);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-slate-50/50 text-on-background min-h-[100dvh] pb-32 font-body"
    >
      <main className="max-w-2xl mx-auto px-6 pt-8">
        <motion.header 
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="mb-12"
        >
          <button 
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-primary font-black text-[10px] uppercase tracking-widest mb-6 hover:opacity-100 transition-opacity"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Back to Flow
          </button>
          <div className="flex items-center justify-between">
            <h1 className="text-4xl md:text-5xl font-black text-on-background leading-none tracking-tighter mb-4 italic">
              Flow <br/><span className="text-primary tracking-tighter">Updates.</span>
            </h1>
            <span className="text-[10px] font-black text-primary bg-primary/10 px-4 py-2 rounded-full uppercase tracking-widest tabular-nums">
              {unreadUserCount} New Active
            </span>
          </div>
        </motion.header>

        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-4"
        >
          <AnimatePresence mode="popLayout">
            {userNotifications.length > 0 ? userNotifications.map((notif) => (
              <motion.div 
                key={notif.id}
                layout
                variants={itemVariants}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={() => markAsRead(notif.id)}
                className={`p-6 rounded-[2.5rem] flex items-start gap-5 border transition-all cursor-pointer ${
                  !notif.read ? 'bg-white border-primary/20 shadow-xl shadow-primary/5' : 'bg-slate-50 border-slate-100 opacity-60'
                }`}
              >
                <div className={`w-14 h-14 rounded-2xl shrink-0 flex items-center justify-center ${
                  !notif.read ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-400'
                }`}>
                  <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                    {notif.type.includes('order') ? 'local_shipping' : 
                     notif.type.includes('payment') ? 'payments' : 
                     'notifications_active'}
                  </span>
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between items-start">
                    <h4 className="font-black text-[15px] text-on-surface tracking-tight leading-none italic">{notif.title}</h4>
                    <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest tabular-nums opacity-60">{notif.timestamp}</span>
                  </div>
                  <p className="text-[11px] font-bold text-on-surface-variant leading-relaxed uppercase tracking-tight">
                    {notif.message}
                  </p>
                </div>
                {!notif.read && (
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 animate-pulse"></div>
                )}
              </motion.div>
            )) : (
                <div className="py-20 text-center space-y-4">
                    <span className="material-symbols-outlined text-5xl text-slate-200">notifications_off</span>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">No active signals detected.</p>
                </div>
            )}
          </AnimatePresence>
        </motion.div>

        {userNotifications.length > 0 && (
            <motion.button 
              whileTap={{ scale: 0.98 }}
              onClick={() => clearAll(userId, 'user')}
              className="w-full mt-10 py-5 rounded-3xl border border-slate-200 bg-white text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] hover:text-error hover:border-error/20 transition-all shadow-sm"
            >
              Clear Log Archive
            </motion.button>
        )}
      </main>
    </motion.div>
  );
};

export default NotificationsPage;

