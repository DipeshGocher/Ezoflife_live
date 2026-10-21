/** Align only the four synthetic GST demo accounts with a reference customer's region. */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../src/models/User.js';
import ServiceArea from '../src/models/ServiceArea.js';
import { GST_DEMO_ACCOUNTS } from '../tests/helpers/gstAccounts.js';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname, quiet: true });
const args = process.argv.slice(2);
const referencePhone = args[args.indexOf('--customer-phone') + 1];
const apply = args.includes('--apply');

try {
    if (!args.includes('--customer-phone') || !/^\d{10,15}$/.test(referencePhone || '')) {
        throw new Error('Usage: node scripts/alignGstDemoRegion.js --customer-phone PHONE [--apply]');
    }
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    const reference = await User.findOne({ phone: referencePhone, role: 'Customer' }).lean();
    if (!reference) throw new Error('Reference customer not found');
    const saved = reference.addresses?.find(a => a.isDefault) || reference.addresses?.[0];
    const location = saved?.location?.lat ? saved.location : reference.location;
    const address = saved?.address || reference.address;
    if (!address || !Number.isFinite(location?.lat) || !Number.isFinite(location?.lng)) {
        throw new Error('Reference customer needs a saved address and coordinates');
    }
    const areas = await ServiceArea.find({ isActive: true, boundary: { $geoIntersects: {
        $geometry: { type: 'Point', coordinates: [location.lng, location.lat] }
    } } }).lean();
    if (areas.length !== 1) throw new Error('Reference location must match exactly one active service region');
    const area = areas[0];
    const city = saved?.city || area.city;
    const state = saved?.state || address.match(/,\s*([^,]+?)\s*-?\s*\d{6}\s*$/)?.[1]?.trim();
    const pincode = saved?.pincode || address.match(/\b\d{6}\b/)?.[0];
    if (!city || !state || !pincode) throw new Error('Cannot resolve reference city, state and pincode');

    const plans = [];
    for (const demo of Object.values(GST_DEMO_ACCOUNTS)) {
        const existing = await User.findOne({ phone: demo.phone }).lean();
        if (!existing || existing.displayName !== demo.displayName || existing.role !== demo.role) {
            throw new Error(`Refusing to modify missing or non-demo account ${demo.phone}`);
        }
        const updates = { address, location: { lat: location.lat, lng: location.lng } };
        if (existing.role === 'Vendor') {
            Object.assign(updates, { 'shopDetails.address': address, 'shopDetails.city': city,
                'shopDetails.state': state, 'shopDetails.pincode': pincode });
        } else {
            updates.addresses = (existing.addresses?.length ? existing.addresses : demo.addresses).map(a => ({
                ...a, address, city, state, pincode, location: updates.location
            }));
            if (existing.customerType === 'retail') updates.businessAddress = address;
        }
        const before = Object.fromEntries(Object.keys(updates).map(key => [key,
            key.split('.').reduce((value, part) => value?.[part], existing)]));
        plans.push({ id: existing._id, phone: existing.phone, before, updates });
    }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', region: area.areaName,
        city, state, pincode, location, accounts: plans.map(p => p.phone) }, null, 2));
    if (apply) {
        const backup = join(tmpdir(), `gst-demo-regions-${Date.now()}.json`);
        writeFileSync(backup, JSON.stringify(plans, null, 2), { mode: 0o600 });
        console.log(`Location backup: ${backup}`);
        for (const plan of plans) {
            const result = await User.updateOne({ _id: plan.id, phone: plan.phone }, { $set: plan.updates }, { runValidators: true });
            if (result.matchedCount !== 1) throw new Error(`Account changed during update: ${plan.phone}`);
        }
        for (const plan of plans) {
            const user = await User.findById(plan.id).lean();
            if (user.location.lat !== location.lat || user.location.lng !== location.lng ||
                user.addresses?.some(a => a.location?.lat !== location.lat || a.location?.lng !== location.lng)) {
                throw new Error(`Location verification failed for ${plan.phone}`);
            }
        }
        console.log('Verified all four demo accounts in the reference region. GST, services, orders and balances unchanged.');
    }
} catch (error) {
    console.error(error.message.replace(/mongodb(?:\+srv)?:\/\/[^\s]+/g, '[database URI redacted]'));
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
