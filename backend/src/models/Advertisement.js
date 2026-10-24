import mongoose from 'mongoose';

export const SPLASH_AUDIENCES = ['all', 'customer', 'vendor', 'supplier'];
export const SPLASH_MIN_SECONDS = 1;
export const SPLASH_MAX_SECONDS = 30;

const advertisementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['image', 'video'],
    required: true
  },
  url: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  category: {
    type: String,
    enum: ['splash', 'home_banner'],
    default: 'splash'
  },
  // Splash only: how long the splash screen stays up when the app opens.
  durationSeconds: {
    type: Number,
    min: SPLASH_MIN_SECONDS,
    max: SPLASH_MAX_SECONDS,
    default: 3
  },
  // Splash only: which app shows it. 'all' = customer, vendor and supplier apps.
  audience: {
    type: String,
    enum: SPLASH_AUDIENCES,
    default: 'all'
  },
  notes: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Advertisement = mongoose.model('Advertisement', advertisementSchema);
export default Advertisement;
