import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDir = 'uploads/ads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'ad-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const adUpload = multer({ 
    storage: storage,
    // A splash is fetched on every app open; keep media reasonably small.
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpg|jpeg|png|webp|gif|mp4|mov|avi|wmv|webm/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname || mimetype) { // Mimetype check can be flaky for some videos, so ext check is reliable
            return cb(null, true);
        }
        cb(new Error('Only images and popular video formats are allowed'));
    }
});

export default adUpload;
