import Specialist from '../models/Specialist.js';
import LaborRequisition from '../models/LaborRequisition.js';
import Notification from '../models/Notification.js';
import { getEventPublisher } from '../socket.js';
import { httpStatusForError } from '../utils/errorResponse.js';

export const addSpecialist = async (req, res) => {
    try {
        const specialist = new Specialist(req.body);
        await specialist.save();
        res.status(201).json(specialist);
    } catch (err) {
        res.status(httpStatusForError(err)).json({ message: err.message });
    }
};

export const getAllSpecialists = async (req, res) => {
    try {
        const specialists = await Specialist.find().sort({ createdAt: -1 });
        res.status(200).json(specialists);
    } catch (err) {
        res.status(httpStatusForError(err)).json({ message: err.message });
    }
};

export const deleteSpecialist = async (req, res) => {
    try {
        await Specialist.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'Specialist deleted' });
    } catch (err) {
        res.status(httpStatusForError(err)).json({ message: err.message });
    }
};

export const createRequisition = async (req, res) => {
    try {
        const { vendorId, vendorName, items, totalAmount } = req.body;

        // Without this, a missing items array throws on .length and surfaces as a 500.
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: 'At least one requisition item is required' });
        }
        if (!vendorId) {
            return res.status(400).json({ message: 'Vendor ID is required' });
        }

        console.log(`📩 New Requisition from ${vendorName} (${vendorId}) - ${items.length} skills`);
        
        const requisition = new LaborRequisition({ vendorId, vendorName, items, totalAmount });
        await requisition.save();
        
        // Notify Admins
        const adminNotification = new Notification({
            recipient: '66112c3f8e4b8a2e5c8b4568', // Fixed Admin ID
            role: 'admin',
            title: 'New Labor Requisition',
            message: `${vendorName} has requested ${items.length} specialists. Total value: ₹${totalAmount}`,
            type: 'order_placed',
            payload: { requisitionId: requisition._id }
        });
        await adminNotification.save();
        console.log('🔔 Admin notification generated');
        
        // Emit Socket Event
        try {
            const io = getEventPublisher();
            io.emit('new_notification', {
                recipient: '66112c3f8e4b8a2e5c8b4568',
                role: 'admin',
                notification: adminNotification
            });
            console.log('📡 Socket event emitted: new_notification');
        } catch (err) {
            console.error('Socket Emit Error:', err);
        }
        
        res.status(201).json(requisition);
    } catch (err) {
        res.status(httpStatusForError(err)).json({ message: err.message });
    }
};

export const getAllRequisitions = async (req, res) => {
    try {
        const requisitions = await LaborRequisition.find().sort({ createdAt: -1 });
        res.status(200).json(requisitions);
    } catch (err) {
        res.status(httpStatusForError(err)).json({ message: err.message });
    }
};

export const assignRequisition = async (req, res) => {
    try {
        const { id } = req.params;
        const requisition = await LaborRequisition.findByIdAndUpdate(id, { 
            status: 'Assigned',
            assignedAt: new Date()
        }, { new: true });

        // Send Notification to Vendor
        const notification = new Notification({
            recipient: requisition.vendorId, // Assuming vendorId is the User ID
            role: 'vendor',
            title: 'Labor Specialist Assigned',
            message: `Your requisition for ${requisition.items.map(i => i.name).join(', ')} has been successfully assigned!`,
            type: 'assigned',
            payload: { requisitionId: id }
        });
        await notification.save();
        
        // Emit Socket Event
        try {
            const io = getEventPublisher();
            io.emit('new_notification', {
                recipient: requisition.vendorId,
                role: 'vendor',
                notification: notification
            });
            console.log('📡 Socket event emitted to vendor');
        } catch (err) {
            console.error('Socket Emit Error:', err);
        }

        res.status(200).json(requisition);
    } catch (err) {
        res.status(httpStatusForError(err)).json({ message: err.message });
    }
};
