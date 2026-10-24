import { randomUUID } from 'node:crypto';
import User from '../models/User.js';
/** Serialize manual records and gateway settlements for one vendor. */
export const withVendorPayoutLock = async (vendorId, work) => {
    const token = randomUUID();
    const acquired = await User.findOneAndUpdate({ _id: vendorId, role: 'Vendor', $or: [
        { payoutLockUntil: { $lte: new Date() } }, { payoutLockUntil: null }
    ] }, { $set: { payoutLockUntil: new Date(Date.now() + 60000), payoutLockToken: token } });
    if (!acquired) throw Object.assign(new Error('Vendor payout is already being processed; retry shortly'), { status: 409 });
    try { return await work(); }
    finally { await User.updateOne({ _id: vendorId, payoutLockToken: token }, { $unset: { payoutLockUntil: '', payoutLockToken: '' } }); }
};
