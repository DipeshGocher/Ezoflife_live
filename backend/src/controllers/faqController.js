import FAQ from '../models/FAQ.js';

// Get all FAQs
export const getAllFAQs = async (req, res) => {
    try {
        // Public: hidden FAQs are never sent to the apps
        const faqs = await FAQ.find({ isActive: { $ne: false } }).sort({ order: 1, createdAt: -1 });
        res.status(200).json(faqs);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching FAQs', error: error.message });
    }
};

// Create a new FAQ
// Admin: every FAQ, including hidden ones
export const getAllFAQsAdmin = async (req, res) => {
    try {
        const faqs = await FAQ.find().sort({ order: 1, createdAt: -1 });
        res.status(200).json(faqs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const createFAQ = async (req, res) => {
    try {
        const { question, answer, category, order, targetRole, youtubeUrl } = req.body;
        const newFAQ = new FAQ({ question, answer, category, order, targetRole, youtubeUrl });
        await newFAQ.save();
        res.status(201).json(newFAQ);
    } catch (error) {
        res.status(500).json({ message: 'Error creating FAQ', error: error.message });
    }
};

// Update an FAQ
export const updateFAQ = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedFAQ = await FAQ.findByIdAndUpdate(id, req.body, { new: true });
        if (!updatedFAQ) return res.status(404).json({ message: 'FAQ not found' });
        res.status(200).json(updatedFAQ);
    } catch (error) {
        res.status(500).json({ message: 'Error updating FAQ', error: error.message });
    }
};

// Delete an FAQ
export const deleteFAQ = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedFAQ = await FAQ.findByIdAndDelete(id);
        if (!deletedFAQ) return res.status(404).json({ message: 'FAQ not found' });
        res.status(200).json({ message: 'FAQ deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting FAQ', error: error.message });
    }
};

// Reorder FAQs
export const reorderFAQs = async (req, res) => {
    try {
        const { orders } = req.body;
        if (!Array.isArray(orders)) {
            return res.status(400).json({ message: 'orders must be an array' });
        }
        await Promise.all(
            orders.map(item => 
                FAQ.findByIdAndUpdate(item.id, { order: item.order })
            )
        );
        res.status(200).json({ message: 'FAQs reordered successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error reordering FAQs', error: error.message });
    }
};
