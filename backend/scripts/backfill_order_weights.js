/**
 * Give orders that were saved without a weight the estimate from each service's
 * admin-configured Avg Weight. Safe to re-run; never overwrites an existing weight.
 *
 *   node scripts/backfill_order_weights.js --dry-run   # preview only
 *   node scripts/backfill_order_weights.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import Order from '../src/models/Order.js';
import { backfillMissingOrderWeights } from '../src/utils/orderWeight.js';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const dryRun = process.argv.includes('--dry-run');

try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ezoflife');
    const { updated, skipped } = await backfillMissingOrderWeights(Order, { dryRun });
    updated.forEach(row => console.log(`${dryRun ? 'would set' : 'set'} ${row.orderId} -> ${row.totalWeight} kg (estimated)`));
    if (skipped.length) console.log(`No Avg Weight for some items, left as "—": ${skipped.join(', ')}`);
    console.log(`${dryRun ? 'Dry run: ' : ''}${updated.length} order(s) ${dryRun ? 'would be updated' : 'updated'}, ${skipped.length} skipped.`);
} catch (error) {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
