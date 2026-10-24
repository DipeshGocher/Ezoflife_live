import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { feedbackApi } from '../../../lib/api';
import { Star, Send, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';

const FeedbackForm = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const orderId = searchParams.get('orderId');

    const [ratings, setRatings] = useState({
        'Service': 5,
        'App Experience': 5,
        'Rider': 5,
        'Pricing': 5
    });
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);


    const handleRatingChange = (cat, val) => {
        setRatings(prev => ({ ...prev, [cat]: val }));
    };

    const handleSubmit = async () => {
        if (!comment) {
            toast.error('Please add a comment');
            return;
        }
        setSubmitting(true);
        
        // Calculate average rating for backend compatibility
        const avgRating = Math.round(Object.values(ratings).reduce((a, b) => a + b, 0) / 4);

        try {
            await feedbackApi.submit({
                orderId: orderId || undefined,
                rating: avgRating,
                comment: `[Ratings: ${JSON.stringify(ratings)}] ${comment}`,
                category: orderId ? 'Service' : 'App Experience'
            });
            setSuccess(true);
            setTimeout(() => navigate(-1), 2000);
        } catch (error) {
            console.error('Submit Feedback Error:', error);
            toast.error(error.message || 'Failed to submit feedback');
        } finally {
            setSubmitting(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
                <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6 animate-bounce">
                    <span className="material-symbols-outlined text-4xl">check_circle</span>
                </div>
                <h2 className="text-2xl font-black tracking-tighter mb-2 italic uppercase">Thank You!</h2>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Your feedback helps us grow.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50/50 flex flex-col font-sans pb-32">
            {/* Safe area for global header */}
            <div className="h-20" />

            <div className="px-6 py-4 flex items-center gap-4">
                <button onClick={() => navigate(-1)} className="w-10 h-10 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center text-slate-900 active:scale-90 transition-transform">
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-sm font-black uppercase tracking-widest text-slate-900">Platform Feedback</h1>
            </div>

            <main className="p-6 space-y-8 flex-1 overflow-y-auto">
                <div className="text-center space-y-2">
                    <h2 className="text-2xl font-black tracking-tighter uppercase italic">{orderId ? 'Rate your service' : 'Share your experience'}</h2>
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary">{orderId ? `Order #${orderId.slice(-6)}` : "We're listening to our users"}</p>
                </div>

                {/* Multi-Category Ratings */}
                <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-xl shadow-slate-200/40 space-y-5">
                    {Object.entries(ratings).map(([cat, val]) => (
                        <div key={cat} className="flex items-center justify-between py-1">
                            <span className="text-[11px] font-black uppercase tracking-widest text-slate-900 pr-2">{cat}</span>
                            <div className="flex gap-1.5">
                                {[1, 2, 3, 4, 5].map((s) => (
                                    <button 
                                        key={s} 
                                        onClick={() => handleRatingChange(cat, s)}
                                        className="transition-all active:scale-90"
                                    >
                                        <Star 
                                            size={20} 
                                            className={s <= val ? 'fill-amber-400 text-amber-400' : 'text-slate-100 fill-slate-50'} 
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Comment */}
                <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">
                        {orderId ? 'How was the service?' : 'What could be better?'}
                    </label>
                    <textarea 
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder={orderId ? "Tell us about the wash quality, packing, etc." : "Tell us what you loved or what we can improve..."}
                        className="w-full h-40 bg-white border border-slate-200 rounded-[2rem] p-6 text-sm font-bold outline-none focus:border-primary/30 transition-all resize-none shadow-sm"
                    />
                </div>
            </main>

            <div className="p-6 bg-white/80 backdrop-blur-md border-t border-slate-50 fixed bottom-20 left-0 right-0 max-w-md mx-auto z-20">
                <button
                    onClick={handleSubmit}
                    disabled={submitting || !comment}
                    className="w-full py-5 rounded-[1.5rem] bg-primary text-on-primary font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-primary/20 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
                >
                    {submitting ? 'Submitting...' : (
                        <>
                            <Send size={16} />
                            Send Feedback
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default FeedbackForm;
