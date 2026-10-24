// Non-destructive configuration repair. Temporary address explicitly authorized
// by the user; replace it through Admin > Invoice Settings before live invoicing.
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import SystemConfig from '../src/models/SystemConfig.js';
dotenv.config({ path: new URL('../.env', import.meta.url).pathname });
try {
    await mongoose.connect(process.env.MONGODB_URI);
    const row = await SystemConfig.findOne({ key: 'invoice_settings' });
    const value = { ...(row?.value || {}) };
    const defaults = {
        registeredAddress: '1 Demo Street, Indore, Madhya Pradesh 452001 (Temporary address; update in Admin Invoice Settings)',
        platformSacCode: '998311', logisticsSacCode: '996511', promotionSacCode: '9983'
    };
    for (const [key, fallback] of Object.entries(defaults)) if (!value[key]) value[key] = fallback;
    await SystemConfig.updateOne({ key: 'invoice_settings' }, { $set: { value } }, { upsert: true });
    console.log('Invoice settings repaired; temporary address remains editable in the admin panel.');
} finally { await mongoose.disconnect(); }
