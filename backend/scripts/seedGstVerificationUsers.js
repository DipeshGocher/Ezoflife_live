/** Add four synthetic RD/URD accounts without altering existing accounts or money. */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../src/models/User.js';
import MasterService from '../src/models/MasterService.js';
import { GST_DEMO_ACCOUNTS } from '../tests/helpers/gstAccounts.js';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });
const dryRun = process.argv.includes('--dry-run');
try {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI must be configured');
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
    const services = await MasterService.find({ isActive: true }).limit(12).lean();
    if (!services.length) throw new Error('No active master services; vendors would not be able to accept orders');
    // Check all phone collisions before writing anything.
    for (const account of Object.values(GST_DEMO_ACCOUNTS)) {
        const existing = await User.findOne({ phone: account.phone }).lean();
        if (existing && (existing.displayName !== account.displayName || existing.role !== account.role)) {
            throw new Error(`Phone ${account.phone} belongs to another account; refusing to overwrite it`);
        }
    }
    for (const [label, account] of Object.entries(GST_DEMO_ACCOUNTS)) {
        const doc = structuredClone(account);
        if (doc.role === 'Vendor') doc.shopDetails.services = services.map(service => ({
            id: String(service._id), name: service.itemName,
            adminRate: Number(service.basePrice) || 0, vendorRate: Number(service.basePrice) || 0,
            active: true, status: 'approved'
        }));
        if (!dryRun) await User.updateOne({ phone: doc.phone }, { $setOnInsert: doc }, { upsert: true, runValidators: true });
        console.log(`${dryRun ? 'Would ensure' : 'Available'} ${label}: ${doc.phone} (${doc.displayName})`);
    }
    console.log(`Vendors support ${services.length} active master services. No orders, promotions, balances, tax settings, or payment accounts changed.`);
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
