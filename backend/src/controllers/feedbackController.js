import { filterCondition, dateFilter } from '../utils/queryFilters.js';
import Feedback from '../models/Feedback.js';
import User from '../models/User.js';
import { sendError } from '../utils/errorResponse.js';

// Submit new feedback
export const submitFeedback = async (req, res) => {
    try {
        const { userId, orderId, vendorId, rating, comment, category } = req.body;
        console.log('📝 Feedback Submission Attempt:', { userId, orderId, vendorId, rating, category });
        
        // Basic validation for ObjectIds to prevent 500 errors
        const isValidId = (id) => id && id.length === 24;

        const feedbackData = {
            user: userId,
            rating,
            comment,
            category
        };

        if (isValidId(orderId)) feedbackData.order = orderId;
        if (isValidId(vendorId)) feedbackData.vendor = vendorId;

        const newFeedback = new Feedback(feedbackData);
        await newFeedback.save();
        res.status(201).json({ message: 'Feedback submitted successfully', feedback: newFeedback });
    } catch (error) {
        sendError(res, error, 'Error submitting feedback');
    }
};

// Get feedbacks for a specific Vendor
export const getVendorFeedbacks = async (req, res) => {
    try {
        const { vendorId } = req.params;
        const feedbacks = await Feedback.find({ vendor: vendorId })
            .populate('user', 'displayName phoneNumber')
            .populate('order', 'orderId createdAt')
            .sort({ createdAt: -1 });
        res.status(200).json(feedbacks);
    } catch (error) {
        sendError(res, error, 'Error fetching vendor feedbacks');
    }
};

// Get all feedbacks for Admin with query filters
export const getAllFeedbacks = async (req, res) => {
    try {
        const { userName, email, category, rating, submitted } = req.query;
        const filter = {};

        if (category) {
            filter.category = filterCondition(category);
        }
        if (rating) {
            filter.rating = filterCondition(rating, Number);
        }
        if (submitted) {
            Object.assign(filter, dateFilter(submitted));
        }

        if (userName || email) {
            const userFilter = {};
            if (userName) userFilter.displayName = filterCondition(userName);
            if (email) userFilter.email = filterCondition(email);
            const users = await User.find(userFilter).select('_id');
            filter.user = { $in: users.map(u => u._id) };
        }

        const feedbacks = await Feedback.find(filter)
            .populate('user', 'displayName email phoneNumber')
            .populate('order', 'orderId status')
            .sort({ createdAt: -1 });
        res.status(200).json(feedbacks);
    } catch (error) {
        sendError(res, error, 'Error fetching feedbacks');
    }
};

// Get feedback filter options
export const getFeedbackFilters = async (req, res) => {
    try {
        const feedbacks = await Feedback.find().populate('user', 'displayName email');
        
        const userNamesSet = new Set();
        const emailsSet = new Set();
        const categoriesSet = new Set();
        const ratingsSet = new Set();
        const datesSet = new Set();

        feedbacks.forEach(fb => {
            if (fb.user) {
                if (fb.user.displayName) userNamesSet.add(fb.user.displayName);
                if (fb.user.email) emailsSet.add(fb.user.email);
            }
            if (fb.category) categoriesSet.add(fb.category);
            if (fb.rating) ratingsSet.add(fb.rating);
            if (fb.createdAt) {
                const dateStr = new Date(fb.createdAt).toISOString().split('T')[0];
                datesSet.add(dateStr);
            }
        });

        res.status(200).json({
            userNames: Array.from(userNamesSet).filter(Boolean).sort(),
            emails: Array.from(emailsSet).filter(Boolean).sort(),
            categories: Array.from(categoriesSet).filter(Boolean).sort(),
            ratings: Array.from(ratingsSet).filter(Boolean).sort((a, b) => b - a),
            dates: Array.from(datesSet).filter(Boolean).sort().reverse()
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Delete feedback (Admin only)
export const deleteFeedback = async (req, res) => {
    try {
        const { id } = req.params;
        await Feedback.findByIdAndDelete(id);
        res.status(200).json({ message: 'Feedback deleted' });
    } catch (error) {
        sendError(res, error, 'Error deleting feedback');
    }
};
