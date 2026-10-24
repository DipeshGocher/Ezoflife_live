import fs from 'fs';
import path from 'path';
import Advertisement, { SPLASH_AUDIENCES, SPLASH_MAX_SECONDS, SPLASH_MIN_SECONDS } from '../models/Advertisement.js';

const CATEGORIES = ['splash', 'home_banner'];
const TYPES = ['image', 'video'];
const APPS = ['customer', 'vendor', 'supplier'];

/** Returns an error message, or null when the splash settings are valid. */
const validateSplashFields = ({ durationSeconds, audience }) => {
    if (durationSeconds !== undefined && durationSeconds !== '') {
        const d = Number(durationSeconds);
        if (!Number.isFinite(d) || d < SPLASH_MIN_SECONDS || d > SPLASH_MAX_SECONDS) {
            return `durationSeconds must be between ${SPLASH_MIN_SECONDS} and ${SPLASH_MAX_SECONDS}`;
        }
    }
    if (audience !== undefined && !SPLASH_AUDIENCES.includes(audience)) {
        return `audience must be one of ${SPLASH_AUDIENCES.join(', ')}`;
    }
    return null;
};

const removeUploadedFile = (url) => {
    if (!url || !url.startsWith('/uploads/ads/')) return;
    const filePath = path.join(process.cwd(), url.replace(/^\//, ''));
    fs.promises.unlink(filePath).catch(() => { /* already gone */ });
};

/**
 * Only one splash may be live per app. Making `ad` live switches off every
 * other live splash that would show in any of the same apps.
 */
const makeOnlyLiveSplash = async (ad) => {
    if (ad.category !== 'splash' || !ad.isActive) return;
    const overlapping = ad.audience === 'all' ? {} : { audience: { $in: ['all', ad.audience] } };
    await Advertisement.updateMany(
        { _id: { $ne: ad._id }, category: 'splash', isActive: true, ...overlapping },
        { $set: { isActive: false } }
    );
};

export const createAd = async (req, res) => {
    const file = req.file;
    try {
        const { title, type, notes, category = 'splash', durationSeconds, audience } = req.body;

        if (!file) {
            return res.status(400).json({ error: 'No media file uploaded' });
        }
        const problem =
            (!title || !title.trim()) ? 'title is required'
            : !TYPES.includes(type) ? 'type must be image or video'
            : !CATEGORIES.includes(category) ? 'category must be splash or home_banner'
            : validateSplashFields({ durationSeconds, audience });
        if (problem) {
            removeUploadedFile(`/uploads/ads/${file.filename}`);
            return res.status(400).json({ error: problem });
        }

        const newAd = new Advertisement({
            title: title.trim(),
            type,
            url: `/uploads/ads/${file.filename}`,
            category,
            notes: notes || '',
            ...(category === 'splash' ? {
                durationSeconds: durationSeconds ? Number(durationSeconds) : 3,
                audience: audience || 'all'
            } : {})
        });

        await newAd.save();
        await makeOnlyLiveSplash(newAd);
        res.status(201).json(newAd);
    } catch (error) {
        if (file) removeUploadedFile(`/uploads/ads/${file.filename}`);
        res.status(500).json({ error: error.message });
    }
};

/**
 * Public. The live ad for a placement.
 *   GET /api/ads/active?category=splash&app=customer|vendor|supplier
 * A splash for app X is one targeted at X or at 'all'.
 */
export const getActiveAd = async (req, res) => {
    try {
        const category = req.query.category || 'splash';
        const query = { isActive: true, category };
        if (category === 'splash' && req.query.app) {
            if (!APPS.includes(req.query.app)) {
                return res.status(400).json({ message: `app must be one of ${APPS.join(', ')}` });
            }
            query.audience = { $in: ['all', req.query.app] };
        }

        const ad = await Advertisement.findOne(query).sort({ createdAt: -1 });
        if (!ad) {
            return res.status(404).json({ message: `No active advertisement found for category: ${category}` });
        }
        res.json(ad);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getAllAds = async (req, res) => {
    try {
        const ads = await Advertisement.find().sort({ createdAt: -1 });
        res.json(ads);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const toggleAdStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const ad = await Advertisement.findById(id);
        if (!ad) return res.status(404).json({ error: 'Ad not found' });

        ad.isActive = !ad.isActive;
        await ad.save();
        await makeOnlyLiveSplash(ad);
        res.json(ad);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/** Admin: edit title, notes and splash settings without re-uploading media. */
export const updateAd = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, notes, durationSeconds, audience } = req.body;

        const problem = validateSplashFields({ durationSeconds, audience });
        if (problem) return res.status(400).json({ error: problem });
        if (title !== undefined && !String(title).trim()) {
            return res.status(400).json({ error: 'title cannot be empty' });
        }

        const ad = await Advertisement.findById(id);
        if (!ad) return res.status(404).json({ error: 'Ad not found' });

        if (title !== undefined) ad.title = String(title).trim();
        if (notes !== undefined) ad.notes = notes;
        if (ad.category === 'splash') {
            if (durationSeconds !== undefined && durationSeconds !== '') ad.durationSeconds = Number(durationSeconds);
            if (audience !== undefined) ad.audience = audience;
        }
        await ad.save();
        await makeOnlyLiveSplash(ad);
        res.json(ad);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteAd = async (req, res) => {
    try {
        const { id } = req.params;
        const ad = await Advertisement.findByIdAndDelete(id);
        if (!ad) return res.status(404).json({ error: 'Ad not found' });
        removeUploadedFile(ad.url);
        res.json({ message: 'Ad deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const updateAdNotes = async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;
        const ad = await Advertisement.findByIdAndUpdate(id, { notes }, { new: true });
        if (!ad) return res.status(404).json({ error: 'Ad not found' });
        res.json(ad);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
