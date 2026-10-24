import { filterCondition, dateFilter } from '../utils/queryFilters.js';
import PartnershipInquiry from '../models/PartnershipInquiry.js';
import { sendPartnershipConfirmation, sendAdminPartnershipNotification } from '../utils/emailHelper.js';
import { httpStatusForError } from '../utils/errorResponse.js';

export const submitPartnershipInquiry = async (req, res) => {
    try {
        const { companyName, email, phone, location, website, partnershipType, proposal } = req.body;
        const inquiry = new PartnershipInquiry({ companyName, email, phone, location, website, partnershipType, proposal });
        await inquiry.save();

        // Send confirmation email to partner
        sendPartnershipConfirmation(inquiry).catch(err => {
            console.error('Partnership Confirmation Email Failed:', err);
        });

        // Send notification email to Admin
        sendAdminPartnershipNotification(inquiry).catch(err => {
            console.error('Admin Partnership Notification Failed:', err);
        });

        res.status(201).json(inquiry);
    } catch (err) {
        res.status(httpStatusForError(err)).json({ message: err.message });
    }
};

export const getAllPartnershipInquiries = async (req, res) => {
    try {
        const { companyName, email, phone, partnershipType, submitted } = req.query;
        const filter = {};

        if (companyName) {
            filter.companyName = filterCondition(companyName);
        }
        if (email) {
            filter.email = filterCondition(email);
        }
        if (phone) {
            filter.phone = filterCondition(phone);
        }
        if (partnershipType) {
            filter.partnershipType = filterCondition(partnershipType);
        }
        if (submitted) {
            Object.assign(filter, dateFilter(submitted));
        }

        const inquiries = await PartnershipInquiry.find(filter).sort({ createdAt: -1 });
        res.status(200).json(inquiries);
    } catch (err) {
        res.status(httpStatusForError(err)).json({ message: err.message });
    }
};

export const getPartnershipFilters = async (req, res) => {
    try {
        const companyNames = await PartnershipInquiry.distinct('companyName');
        const emails = await PartnershipInquiry.distinct('email');
        const phones = await PartnershipInquiry.distinct('phone');
        const partnershipTypes = await PartnershipInquiry.distinct('partnershipType');

        const datesResult = await PartnershipInquiry.aggregate([
            {
                $project: {
                    dateStr: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }
                }
            },
            {
                $group: {
                    _id: "$dateStr"
                }
            },
            {
                $sort: { _id: -1 }
            }
        ]);
        const dates = datesResult.map(d => d._id).filter(Boolean);

        res.status(200).json({
            companyNames: companyNames.filter(Boolean).sort(),
            emails: emails.filter(Boolean).sort(),
            phones: phones.filter(Boolean).sort(),
            partnershipTypes: partnershipTypes.filter(Boolean).sort(),
            dates
        });
    } catch (err) {
        res.status(httpStatusForError(err)).json({ message: err.message });
    }
};

export const deletePartnershipInquiry = async (req, res) => {
    try {
        const { id } = req.params;
        const inquiry = await PartnershipInquiry.findByIdAndDelete(id);
        if (!inquiry) return res.status(404).json({ message: 'Partnership inquiry not found' });
        res.status(200).json({ message: 'Partnership inquiry deleted successfully' });
    } catch (err) {
        res.status(httpStatusForError(err)).json({ message: err.message });
    }
};

export const updatePartnershipStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = [
            'Lead Received',
            'Under Verification',
            'Proposal Sent',
            'Contract Drafting',
            'Account Setup',
            'Active',
            'Suspended',
            'Rejected'
        ];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid status value' });
        }

        const inquiry = await PartnershipInquiry.findByIdAndUpdate(
            id,
            { status },
            { new: true }
        );

        if (!inquiry) return res.status(404).json({ message: 'Partnership inquiry not found' });
        res.status(200).json(inquiry);
    } catch (err) {
        res.status(httpStatusForError(err)).json({ message: err.message });
    }
};

export const getMyPartnershipInquiries = async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) {
            return res.status(400).json({ message: 'Email query parameter is required' });
        }
        const inquiries = await PartnershipInquiry.find({ email }).sort({ createdAt: -1 });
        res.status(200).json(inquiries);
    } catch (err) {
        res.status(httpStatusForError(err)).json({ message: err.message });
    }
};

export const updatePartnershipNotes = async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;

        const inquiry = await PartnershipInquiry.findByIdAndUpdate(
            id,
            { notes: notes || '' },
            { new: true }
        );

        if (!inquiry) return res.status(404).json({ message: 'Partnership inquiry not found' });
        res.status(200).json(inquiry);
    } catch (err) {
        res.status(httpStatusForError(err)).json({ message: err.message });
    }
};


