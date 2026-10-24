import User from '../models/User.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Inquiries belonging to the signed-in user: ones they submitted while signed
 * in, plus ones made with their account email. Internal admin notes are never
 * returned to the public side.
 */
export const findMyInquiries = async (Model, userId) => {
    const user = await User.findById(userId).select('email').lean();
    const or = [{ submittedBy: userId }];
    if (user?.email) {
        or.push({ email: new RegExp('^' + escapeRegex(user.email.trim()) + '$', 'i') });
    }
    return Model.find({ $or: or }).select('-notes').sort({ createdAt: -1 }).lean();
};
