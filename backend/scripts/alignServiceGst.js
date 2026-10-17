// Align current active customer services to the user's requested global rate.
// Existing order item snapshots and finalized invoices remain untouched.
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import SystemConfig from '../src/models/SystemConfig.js';
dotenv.config({ path: new URL('../.env', import.meta.url).pathname });
try {
    await mongoose.connect(process.env.MONGODB_URI);
    const config = await SystemConfig.findOne({ key: 'gst_percent' }).lean();
    const rate = Number(config?.value);
    if (!config || !Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error('Configure gst_percent first');
    const db = mongoose.connection.db;
    const services = await db.collection('masterservices').find({ isActive: true }, { projection: { _id: 1 } }).toArray();
    await db.collection('masterservices').updateMany({ _id: { $in: services.map(s => s._id) } }, { $set: { gst: rate, heritageGst: rate } });
    await db.collection('masterpricings').updateMany({ serviceId: { $in: services.map(s => s._id) } }, { $set: { gstPercent: rate } });
    const custom = await db.collection('services').updateMany({ approvalStatus: 'Approved', status: { $in: ['Active', null] } }, { $set: { gst: rate, heritageGst: rate } });
    console.log(`Aligned ${services.length} active master services and ${custom.matchedCount} approved custom services to configured ${rate}% GST; order snapshots unchanged.`);
} finally { await mongoose.disconnect(); }
