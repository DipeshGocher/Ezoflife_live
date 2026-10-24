import mongoose from 'mongoose';

const mediaSchema = new mongoose.Schema({
    fileName: {
        type: String,
        required: true
    },
    fileUrl: {
        type: String,
        required: true
    },
    fileType: {
        type: String,
        default: 'PDF'
    },
    // 'media-kit' = uploaded from Admin → Media Kit. Other uploads (chat photos,
    // legal PDFs, product images) are not recorded here.
    purpose: {
        type: String,
        default: null
    },
    uploadedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

const Media = mongoose.model('Media', mediaSchema);
export default Media;
