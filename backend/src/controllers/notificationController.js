import { canAccessAccount } from '../utils/adminScope.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';

export const getNotifications = async (req, res) => {
    try {
        const { userId, role } = req.query;
        if (!userId) return res.status(400).json({ message: 'User ID required' });
        if (String(userId) !== String(req.user.id)) {
            if (req.user.role !== 'Admin') return res.status(403).json({ message: 'You cannot access these notifications.' });
            const target = await User.findById(userId);
            if (!target || !await canAccessAccount(req, target)) return res.status(403).json({ message: 'You cannot access these notifications.' });
        }
        const query = { recipient: userId };
        if (role) query.role = role.toLowerCase();

        const notifications = await Notification.find(query)
        .sort({ createdAt: -1 })
        .limit(20);

        res.status(200).json(notifications);
    } catch (err) {
        console.error('Fetch Notifications Error:', err);
        res.status(500).json({ message: 'Error fetching notifications' });
    }
};

export const markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const saved = await Notification.findOneAndUpdate({ _id: id, recipient: req.user.id }, { isRead: true });
        if (!saved) return res.status(404).json({ message: 'Notification not found.' });
        res.status(200).json({ message: 'Notification marked as read' });
    } catch (err) {
        res.status(500).json({ message: 'Error marking notification' });
    }
};

export const clearAll = async (req, res) => {
    try {
        const { userId, role } = req.query;

        // Without this, a missing role throws on .toLowerCase() and 500s. A
        // missing userId would also match nothing and delete nothing, so both
        // are required explicitly.
        if (!userId || !role) {
            return res.status(400).json({ message: 'userId and role are required' });
        }

        if (String(userId) !== String(req.user.id)) return res.status(403).json({ message: 'You can only clear your own notifications.' });
        await Notification.deleteMany({ recipient: req.user.id, role: role.toLowerCase() });
        res.status(200).json({ message: 'Notifications cleared' });
    } catch (err) {
        res.status(500).json({ message: 'Error clearing notifications' });
    }
};
