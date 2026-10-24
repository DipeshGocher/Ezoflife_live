import React, { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { feedbackApi } from '../../../lib/api';
import toast from 'react-hot-toast';

const RateAndReviewPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // The order being reviewed is passed through from the tracking/orders screen.
  const { orderId } = location.state || {};

  const handleReview = async () => {
    if (isSubmitting) return;
    try {
      setIsSubmitting(true);
      // Who is reviewing and which vendor is rated are decided by the server
      // from the login and the order; only the review itself is sent.
      await feedbackApi.submit({
        orderId,
        rating,
        // Tags are appended so they are not lost — the API stores a single comment.
        comment: [comment, selectedTags.join(', ')].filter(Boolean).join(' — '),
        category: 'Service'
      });
      setIsSubmitted(true);
      setTimeout(() => navigate('/user/home'), 2000);
    } catch (err) {
      console.error('Failed to submit review:', err);
      toast.error(err.message || 'Could not submit your review');
    } finally {
      setIsSubmitting(false);
    }
  };

  const containerVariants = useMemo(() => ({
    hidden: { scale: 0.9, opacity: 0 },
    visible: { scale: 1, opacity: 1, transition: { type: "spring", damping: 25, stiffness: 200 } }
  }), []);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-background text-on-background min-h-[100dvh] flex flex-col font-body"
    >
      <header className="fixed top-0 z-50 bg-white/70 backdrop-blur-xl w-full flex items-center px-6 py-4 border-b border-outline-variant/10">
        <button onClick={() => navigate(-1)} className="material-symbols-outlined text-on-surface-variant mr-4">arrow_back</button>
        <h1 className="font-headline font-black text-xl text-primary tracking-tighter">Rate & Review</h1>
      </header>

      <main className="max-w-2xl mx-auto px-6 pt-16 pb-36 w-full flex-1 flex flex-col items-center">
        {!isSubmitted ? (
            <motion.div 
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="w-full flex flex-col items-center"
            >
                <div className="mb-12 text-center">
                    <span className="text-[10px] uppercase tracking-[0.3em] text-primary font-black mb-1 block opacity-60">Experience Feedback</span>
                    <h2 className="text-3xl font-black tracking-tighter leading-none mb-3">Rate Your Freshness</h2>
                    <p className="text-xs font-bold text-on-surface-variant opacity-60">How was your cleaning with Spinzyt?</p>
                </div>

                {/* Rating Interaction */}
                <div className="flex gap-4 mb-12">
                    {[1, 2, 3, 4, 5].map((star) => (
                        <motion.button 
                            key={star}
                            whileHover={{ scale: 1.2, rotate: 10 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => {
                                setRating(star);
                                setSelectedTags([]);
                            }}
                            className={`material-symbols-outlined text-5xl transition-colors ${rating >= star ? 'text-amber-500' : 'text-slate-200'}`}
                            style={{ fontVariationSettings: rating >= star ? "'FILL' 1" : "'FILL' 0" }}
                        >
                            star
                        </motion.button>
                    ))}
                </div>

                {/* Selectable Feedback Tags */}
                <div className="w-full mb-10">
                  <p className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50 mb-3">
                    {rating >= 4 ? 'What did you love?' : 'What can we improve?'}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2.5">
                    {(rating >= 4 
                      ? ['Crisp Folding', 'Fresh Fragrance', 'On-Time Delivery', 'Friendly Rider']
                      : ['Late Pickup', 'Damp Clothes', 'Improper Crease', 'Rude Rider']
                    ).map((tag) => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <button
                          type="button"
                          key={tag}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedTags(selectedTags.filter(t => t !== tag));
                            } else {
                              setSelectedTags([...selectedTags, tag]);
                            }
                          }}
                          className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider transition-all border ${
                            isSelected 
                              ? 'bg-primary text-on-primary border-primary shadow-md' 
                              : 'bg-white border-outline-variant/10 text-on-surface-variant hover:bg-slate-50'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Comment Section */}
                <div className="w-full mb-12">
                    <textarea 
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Share your thoughts... (optional)"
                        className="w-full bg-white rounded-[2rem] p-8 border border-outline-variant/10 focus:ring-2 focus:ring-primary/10 transition-all text-sm font-bold min-h-[160px] placeholder:text-outline-variant/40"
                    />
                </div>

                <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleReview}
                    className="w-full bg-primary-gradient py-6 rounded-2xl text-on-primary font-headline font-black text-xl shadow-2xl shadow-primary/20 tracking-[0.2em] uppercase"
                >
                    Submit Review
                </motion.button>
            </motion.div>
        ) : (
            <motion.div 
               initial={{ scale: 0.8, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               className="flex-1 flex flex-col items-center justify-center text-center"
            >
                <div className="w-24 h-24 bg-primary text-on-primary rounded-full flex items-center justify-center shadow-2xl shadow-primary/30 mb-8 overflow-hidden relative">
                    <motion.span 
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 1, repeat: Infinity }}
                        className="material-symbols-outlined text-5xl font-black"
                    >
                        check
                    </motion.span>
                </div>
                <h2 className="text-4xl font-black tracking-tighter mb-3 leading-none italic">Thank You!</h2>
                <p className="text-xs font-bold text-on-surface-variant opacity-60 leading-relaxed tracking-widest uppercase px-12">
                    Your feedback flows into our perfection cycle. Heading back home...
                </p>
            </motion.div>
        )}
      </main>
    </motion.div>
  );
};

export default RateAndReviewPage;

