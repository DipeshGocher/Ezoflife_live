import { reconcileVendorSettlements } from '../services/vendorSettlement.js';
import { reconcilePromotionWallets } from '../services/promotionWallet.js';
import cron from 'node-cron';
import { runPaymentReconciliation } from '../services/paymentSync.js';

/**
 * Every 10 minutes: match open checkouts with Razorpay, confirm B2B fee orders
 * that were paid but never confirmed, and refund payments no order used.
 * Off under NODE_ENV=test (tests trigger a pass explicitly).
 */
export const startPaymentReconciler = () => {
    if (process.env.NODE_ENV === 'test') return;
    let running = false;
    cron.schedule('*/10 * * * *', async () => {
        if (running) return;
        running = true;
        try {
            await reconcilePromotionWallets();
            await reconcileVendorSettlements();
            const summary = await runPaymentReconciliation();
            if (summary.captured || summary.refunded || summary.expired || summary.errors) {
                console.log('💳 [RECONCILE]', summary);
            }
        } catch (error) {
            console.error('❌ [RECONCILE] pass failed:', error.message);
        } finally {
            running = false;
        }
    });
};
