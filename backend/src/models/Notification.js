import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
    eventKey: { type: String, unique: true, sparse: true },
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    role: {
        type: String,
        enum: ['user', 'vendor', 'rider', 'admin', 'supplier'],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['order_placed', 'order_available', 'pickup_available', 'ready', 'assigned', 'picked_up', 'delivered', 'job_application', 'supplier_onboarding', 'b2b_chat', 'vendor_activated'],
        default: 'order_placed'
    },
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order'
    },
    isRead: {
        type: Boolean,
        default: false
    },
    payload: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, { timestamps: true });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
