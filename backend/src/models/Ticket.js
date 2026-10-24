import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    senderRole: {
        type: String,
        enum: ['Customer', 'Vendor', 'Supplier', 'Rider', 'Admin'],
        required: true
    },
    message: {
        type: String,
        required: true
    },
    attachments: [
        {
            type: { type: String, enum: ['image', 'document'], default: 'image' },
            url: String
        }
    ],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const ticketSchema = new mongoose.Schema({
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false,
        default: null
    },
    customerSnapshot: {
        displayName: { type: String, default: null },
        phone: { type: String, default: null },
        isExUser: { type: Boolean, default: false }
    },
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        default: null
    },
    subject: {
        type: String,
        required: true
    },
    category: {
        type: String,
        enum: ['Missing Items', 'Damaged Items', 'Wrong Items', 'Payment Issue', 'Rider Behavior', 'Others'],
        default: 'Others'
    },
    description: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['Open', 'In Progress', 'Resolved', 'Closed'],
        default: 'Open'
    },
    priority: {
        type: String,
        enum: ['Low', 'Medium', 'High'],
        default: 'Medium'
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignmentVersion: { type: Number, default: 0 },
    assignedAt: Date,
    assignmentHistory: [{
        from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        reason: { type: String, required: true },
        at: { type: Date, default: Date.now }
    }],
    messages: [messageSchema],
    lastMessageAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

ticketSchema.index({ assignedTo: 1, status: 1 });

const Ticket = mongoose.model('Ticket', ticketSchema);
export default Ticket;
