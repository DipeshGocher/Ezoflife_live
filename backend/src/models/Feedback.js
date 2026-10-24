import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order'
    },
    vendor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    // A star rating on its own is valid feedback; the comment is optional.
    comment: {
        type: String,
        default: '',
        trim: true
    },
    category: {
        type: String,
        enum: ['Service', 'App Experience', 'Rider', 'Pricing', 'Other'],
        default: 'Service'
    }
}, { timestamps: true });

const Feedback = mongoose.model('Feedback', feedbackSchema);

export default Feedback;
