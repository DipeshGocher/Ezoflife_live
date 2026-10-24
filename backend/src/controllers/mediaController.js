import { filterCondition } from '../utils/queryFilters.js';
import Media from '../models/Media.js';
import AdInquiry from '../models/AdInquiry.js';
import { findMyInquiries } from '../utils/myInquiries.js';
import { sendInquiryConfirmation, sendAdminInquiryNotification } from '../utils/emailHelper.js';
import { sendWhatsAppMessage, sendSMSMessage } from '../utils/communicationHelper.js';
import { httpStatusForError } from '../utils/errorResponse.js';

/**
 * Real media kits. Records made before `purpose` existed are kits only if they
 * are PDFs hosted on Cloudinary (legal PDFs are stored locally, chat/product
 * uploads are images).
 */
const MEDIA_KIT_QUERY = {
    $or: [
        { purpose: 'media-kit' },
        { purpose: { $in: [null, undefined] }, fileType: 'PDF', fileUrl: /^https?:\/\// }
    ]
};

export const uploadMedia = async (req, res) => {
    console.log('--- POST Upload Media Kit Requested (Cloudinary) ---');
    try {
        if (!req.file) {
            console.log('Upload failed: No file provided.');
            return res.status(400).json({ message: 'No file uploaded' });
        }

        console.log(`File uploaded to Cloudinary: ${req.file.originalname} at ${req.file.path}`);
        
        // Cloudinary path is the URL (or the local path for PDF documents)
        const fileUrl = req.file.path;
        const fileType = req.file.mimetype && req.file.mimetype.includes('pdf') ? 'PDF' : 'IMAGE';

        // Only an admin uploading from the Media Kit page creates a media-kit entry;
        // chat photos, product images and legal PDFs share this endpoint and must
        // not appear in the media kit history.
        if (req.body?.purpose === 'media-kit' && req.user?.role === 'Admin') {
            const newMedia = new Media({ fileName: req.file.originalname, fileUrl, fileType, purpose: 'media-kit' });
            await newMedia.save();
            return res.status(201).json({ ...newMedia.toObject(), url: fileUrl, fileUrl });
        }

        // Return BOTH fileUrl (backend model structure) and url (frontend expectations)
        res.status(201).json({ fileName: req.file.originalname, fileType, url: fileUrl, fileUrl });
    } catch (err) {
        console.error('Upload Error in controller:', err);
        const errStr = String(err.message || err.stack || err);
        if (errStr.toLowerCase().includes('limit') || errStr.toLowerCase().includes('quota') || errStr.toLowerCase().includes('capacity') || errStr.toLowerCase().includes('storage') || errStr.toLowerCase().includes('full')) {
            console.error('🚨 [CRITICAL] Cloudinary limit reached or account is out of storage capacity during database save/processing!');
        }
        res.status(httpStatusForError(err)).json({ message: err.message });
    }
};

export const uploadMultipleMedia = async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No files uploaded' });
        }

        const fileUrls = req.files.map(file => file.path);
        res.status(201).json({ urls: fileUrls });
    } catch (err) {
        res.status(httpStatusForError(err)).json({ message: err.message });
    }
};

export const getMediaHistory = async (req, res) => {
    try {
        const history = await Media.find(MEDIA_KIT_QUERY).sort({ uploadedAt: -1 });
        res.status(200).json(history);
    } catch (err) {
        res.status(httpStatusForError(err)).json({ message: err.message });
    }
};

export const getLatestMedia = async (req, res) => {
    console.log('--- GET Latest Media Kit Requested ---');
    try {
        // Explicitly sort by createdAt to get the absolute newest entry
        const latest = await Media.findOne(MEDIA_KIT_QUERY).sort({ uploadedAt: -1 });
        if (!latest) {
            console.log('No Media Kit found in database.');
            return res.status(404).json({ message: 'No media kit found' });
        }
        res.status(200).json(latest);
    } catch (err) {
        console.error('Error in getLatestMedia:', err);
        res.status(httpStatusForError(err)).json({ message: err.message });
    }
};

export const submitInquiry = async (req, res) => {
    try {
        const { brandName, email, phone, location, budget, timeline } = req.body;
        const inquiry = new AdInquiry({ brandName, email, phone, location, budget, timeline, submittedBy: req.user?.id || null });
        await inquiry.save();

        // Send confirmation email to Customer (with PDF)
        sendInquiryConfirmation(inquiry).catch(err => {
            console.error('Customer Email Failed:', err);
        });

        // Send notification email to Admin (No PDF, direct details)
        sendAdminInquiryNotification(inquiry).catch(err => {
            console.error('Admin Notification Failed:', err);
        });

        // WhatsApp & SMS Notifications (Simulation mode)
        const notificationText = `Thank you for submitting your details to Spinzyt! We have received your inquiry and our team is looking over it. We will get back to you ASAP to discuss the next steps! – The Spinzyt Team`;
        
        sendWhatsAppMessage(phone, notificationText);
        sendSMSMessage(phone, notificationText);

        res.status(201).json(inquiry);
    } catch (err) {
        res.status(httpStatusForError(err)).json({ message: err.message });
    }
};

export const getAllInquiries = async (req, res) => {
    try {
        const { brandName, email, phone, budget } = req.query;
        const filter = {};
        if (brandName) {
            filter.brandName = filterCondition(brandName);
        }
        if (email) {
            filter.email = filterCondition(email);
        }
        if (phone) {
            filter.phone = filterCondition(phone);
        }
        if (budget) {
            filter.budget = filterCondition(budget, Number);
        }

        const inquiries = await AdInquiry.find(filter).sort({ createdAt: -1 });
        res.status(200).json(inquiries);
    } catch (err) {
        res.status(httpStatusForError(err)).json({ message: err.message });
    }
};

export const getInquiryFilters = async (req, res) => {
    try {
        const brands = await AdInquiry.distinct('brandName');
        const emails = await AdInquiry.distinct('email');
        const phones = await AdInquiry.distinct('phone');
        const budgets = await AdInquiry.distinct('budget');

        res.status(200).json({
            brands: brands.filter(Boolean).sort(),
            emails: emails.filter(Boolean).sort(),
            phones: phones.filter(Boolean).sort(),
            budgets: budgets.filter(v => v !== null && v !== undefined).sort((a, b) => a - b)
        });
    } catch (err) {
        res.status(httpStatusForError(err)).json({ message: err.message });
    }
};

export const deleteInquiry = async (req, res) => {
    try {
        const { id } = req.params;
        const inquiry = await AdInquiry.findByIdAndDelete(id);
        if (!inquiry) return res.status(404).json({ message: 'Inquiry not found' });
        res.status(200).json({ message: 'Inquiry deleted successfully' });
    } catch (err) {
        res.status(httpStatusForError(err)).json({ message: err.message });
    }
};

export const updateInquiryStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = [
            'Creative Pending Review',
            'Content Review',
            'Invoice Generated',
            'Scheduled',
            'Running',
            'Campaign Ended',
            'Paused by Admin',
            'Rejected'
        ];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid status value' });
        }

        const inquiry = await AdInquiry.findByIdAndUpdate(
            id,
            { status },
            { new: true }
        );

        if (!inquiry) return res.status(404).json({ message: 'Inquiry not found' });
        res.status(200).json(inquiry);
    } catch (err) {
        res.status(httpStatusForError(err)).json({ message: err.message });
    }
};

export const updateInquiryNotes = async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;

        const inquiry = await AdInquiry.findByIdAndUpdate(
            id,
            { notes },
            { new: true }
        );

        if (!inquiry) return res.status(404).json({ message: 'Inquiry not found' });
        res.status(200).json(inquiry);
    } catch (err) {
        res.status(httpStatusForError(err)).json({ message: err.message });
    }
};

export const getMyInquiries = async (req, res) => {
    try {
        // Signed-in user's own inquiries only; previously any email could be looked up.
        const inquiries = await findMyInquiries(AdInquiry, req.user.id);
        res.status(200).json(inquiries);
    } catch (err) {
        res.status(httpStatusForError(err)).json({ message: err.message });
    }
};


