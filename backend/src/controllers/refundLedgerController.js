import Order from '../models/Order.js';
import B2BOrder from '../models/B2BOrder.js';

const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

// ------------------------------------------------------------------
// Refund ledger (Payments > Refunds): every refund actually recorded
// ------------------------------------------------------------------
export const getRefundLedger = async (req, res) => {
    try {
        const [orders, b2b] = await Promise.all([
            Order.find({ paymentStatus: 'Refunded' })
                .select('orderId totalAmount walletAmountDeducted refundAmount walletRefundAmount onlineRefundAmount refundedAt paymentMethod razorpayPaymentId updatedAt createdAt customer customerSnapshot vendor vendorSnapshot')
                .populate('customer', 'displayName phone')
                .populate('vendor', 'displayName shopDetails.name')
                .sort({ updatedAt: -1 })
                .lean(),
            B2BOrder.find({ escrowStatus: 'Refunded' })
                .select('b2bOrderId totalAmount updatedAt vendor vendorSnapshot supplier supplierSnapshot')
                .populate('vendor', 'displayName shopDetails.name')
                .populate('supplier', 'displayName')
                .sort({ updatedAt: -1 })
                .lean()
        ]);

        const rows = [
            ...orders.map(o => {
                const hasRecordedRefund = (o.refundAmount || 0) > 0;
                const wallet = hasRecordedRefund
                    ? (o.walletRefundAmount || 0)
                    : Math.min(o.walletAmountDeducted || 0, o.totalAmount || 0);
                const amount = hasRecordedRefund ? o.refundAmount : o.totalAmount;
                const online = hasRecordedRefund
                    ? (o.onlineRefundAmount || 0)
                    : (o.paymentMethod === 'Online' ? Math.max(0, (o.totalAmount || 0) - wallet) : 0);
                return {
                    id: String(o._id),
                    kind: 'Customer order',
                    reference: o.orderId,
                    party: o.customer?.displayName || o.customerSnapshot?.displayName || o.customer?.phone || '—',
                    counterparty: o.vendor?.shopDetails?.name || o.vendor?.displayName || o.vendorSnapshot?.displayName || '—',
                    amount: round2(amount),
                    walletRefund: round2(wallet),
                    onlineRefund: round2(online),
                    paymentReference: o.razorpayPaymentId || null,
                    refundedAt: o.refundedAt || o.updatedAt,
                    orderedAt: o.createdAt
                };
            }),
            ...b2b.map(o => ({
                id: String(o._id),
                kind: 'Supply order',
                reference: o.b2bOrderId,
                party: o.vendor?.shopDetails?.name || o.vendor?.displayName || o.vendorSnapshot?.displayName || '—',
                counterparty: o.supplier?.displayName || o.supplierSnapshot?.displayName || '—',
                amount: round2(o.totalAmount),
                walletRefund: 0,
                onlineRefund: round2(o.totalAmount),
                paymentReference: null,
                refundedAt: o.updatedAt,
                orderedAt: null
            }))
        ].sort((a, b) => new Date(b.refundedAt) - new Date(a.refundedAt));

        res.json({
            summary: {
                count: rows.length,
                total: round2(rows.reduce((s, r) => s + r.amount, 0)),
                toWallet: round2(rows.reduce((s, r) => s + r.walletRefund, 0)),
                online: round2(rows.reduce((s, r) => s + r.onlineRefund, 0))
            },
            refunds: rows
        });
    } catch (error) {
        console.error('Refund ledger error:', error);
        res.status(500).json({ message: 'Error loading refunds' });
    }
};
