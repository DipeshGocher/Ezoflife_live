import Order from '../models/Order.js';
import User from '../models/User.js';

/** Idempotent credit/reversal. The user's idempotency key and balance change
 * together; retries and the reconciler repair a crash between user/order writes. */
export const settlePromotionWallet = async order => {
    const amount = Number(order.ledger?.customerWalletCredit || 0);
    if (!amount || !order.customer) return;
    if (order.status === 'CANCELLED') {
        await User.updateOne({ _id: order.customer }, [{ $set: {
            walletBalance: { $subtract: [{ $ifNull: ['$walletBalance', 0] }, { $cond: [{ $in: [order._id, { $ifNull: ['$creditedPromotionOrders', []] }] }, amount, 0] }] },
            creditedPromotionOrders: { $setDifference: [{ $ifNull: ['$creditedPromotionOrders', []] }, [order._id]] },
            reversedPromotionOrders: { $setUnion: [{ $ifNull: ['$reversedPromotionOrders', []] }, [order._id]] }
        } }]);
        await Order.updateOne({ _id: order._id, status: 'CANCELLED' }, { $set: { walletCreditStatus: 'REVERSED' } });
        return;
    }
    await User.updateOne({ _id: order.customer, creditedPromotionOrders: { $ne: order._id }, reversedPromotionOrders: { $ne: order._id } }, {
        $inc: { walletBalance: amount }, $addToSet: { creditedPromotionOrders: order._id }
    });
    const fresh = await Order.findById(order._id);
    if (fresh?.status === 'CANCELLED') return settlePromotionWallet(fresh);
    await Order.updateOne({ _id: order._id, status: { $ne: 'CANCELLED' } }, { $set: { walletCreditStatus: 'CREDITED', walletCreditedAt: new Date() } });
};
export const reconcilePromotionWallets = async () => {
    const pending = await Order.find({ 'ledger.customerWalletCredit': { $gt: 0 }, $or: [
        { walletCreditStatus: 'PENDING' }, { status: 'CANCELLED', walletCreditStatus: { $ne: 'REVERSED' } }
    ] }).limit(200);
    for (const order of pending) await settlePromotionWallet(order);
};
