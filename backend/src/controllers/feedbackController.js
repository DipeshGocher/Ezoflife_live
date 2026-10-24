import { filterCondition, dateFilter } from '../utils/queryFilters.js';
import mongoose from 'mongoose';
import Feedback from '../models/Feedback.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import { sendError } from '../utils/errorResponse.js';

const CATEGORIES = ['Service', 'App Experience', 'Rider', 'Pricing', 'Other'];

/** Map what the app screens send onto the stored categories. */
const normalizeCategory = (category, hasOrder) => {
    if (CATEGORIES.includes(category)) return category;
    const c = String(category || '').toLowerCase();
    if (c === 'order' || c === 'service') return 'Service';
    // General "tell us about your experience" feedback
    if (c === 'detailed feedback' || c === 'app' || c === 'app experience') return hasOrder ? 'Service' : 'App Experience';
    return hasOrder ? 'Service' : 'Other';
};

// Submit new feedback (customer). One review per order: submitting again updates it.
export const submitFeedback = async (req, res) => {
    try {
        const { orderId, rating, comment, category } = req.body;
        // Identity comes from the login token, never from the request body.
        const userId = req.user.id;

        const stars = Number(rating);
        if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
            return res.status(400).json({ message: 'rating must be a whole number from 1 to 5' });
        }

        const feedbackData = {
            user: userId,
            rating: stars,
            comment: typeof comment === 'string' ? comment.trim().slice(0, 2000) : '',
            category: normalizeCategory(category, Boolean(orderId))
        };

        // Order feedback: the order must be this customer's, and the vendor being
        // rated is the one who handled it (not whatever vendorId the client sends).
        if (orderId) {
            if (!mongoose.isValidObjectId(orderId)) {
                return res.status(400).json({ message: 'Invalid order' });
            }
            const order = await Order.findById(orderId).select('customer vendor').lean();
            if (!order) return res.status(404).json({ message: 'Order not found' });
            if (String(order.customer) !== String(userId)) {
                return res.status(403).json({ message: 'You can only review your own orders' });
            }
            feedbackData.order = order._id;
            if (order.vendor) feedbackData.vendor = order.vendor;

            const existing = await Feedback.findOne({ user: userId, order: order._id });
            if (existing) {
                Object.assign(existing, feedbackData);
                await existing.save();
                return res.status(200).json({ message: 'Feedback updated', feedback: existing });
            }
        }

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
