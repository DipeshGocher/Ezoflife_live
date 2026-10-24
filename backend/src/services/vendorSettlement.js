import { withVendorPayoutLock } from './vendorPayoutLock.js';
import axios from 'axios';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Payout from '../models/Payout.js';
import PaymentTransaction from '../models/PaymentTransaction.js';
import { getRazorpay, razorpayApiBaseUrl, toPaise } from '../utils/razorpayClient.js';

const bankSettlementFields = data => ({
    providerTransferStatus: data.status || data.transfer_status || '',
    bankSettlementStatus: Number(data.amount_reversed || 0) > 0 || ['failed', 'reversed', 'partially_reversed'].includes(data.status || data.transfer_status)
        ? 'REVIEW' : ({ pending: 'PENDING', on_hold: 'ON_HOLD', settled: 'SETTLED' }[data.settlement_status] || 'UNKNOWN'),
    recipientSettlementId: data.recipient_settlement_id || '',
    bankSettlementCheckedAt: new Date()
});

// Fetch-only: a bank-settlement retry must never create another transfer.
const refreshBankSettlement = async order => {
    const request = order.vendorSettlement;
    if (!request?.transferId || request.bankSettlementStatus === 'SETTLED') return request;
    try {
        const data = await getRazorpay().transfers.fetch(request.transferId);
        if (data.id !== request.transferId || Number(data.amount) !== toPaise(request.amount) || data.recipient !== request.account || data.currency !== 'INR') throw new Error('Transfer response does not match saved payout');
        const fields = bankSettlementFields(data);
        const error = fields.bankSettlementStatus === 'REVIEW' ? 'Transfer failed or reversed; manual reconciliation required' : '';
        await Payout.updateOne({ order: order._id, transactionId: request.transferId }, { $set: fields });
        await Order.updateOne({ _id: order._id, 'vendorSettlement.transferId': request.transferId }, { $set: Object.fromEntries(Object.entries({ ...fields, error }).map(([key, value]) => [`vendorSettlement.${key}`, value])) });
        return { ...request.toObject(), ...fields, error };
    } catch (error) {
        // Preserve the reservation/transfer state; a fetch failure is no evidence
        // that funds were returned or that a replacement transfer is safe.
        await Order.updateOne({ _id: order._id }, { $set: { 'vendorSettlement.error': 'Bank settlement status check failed; retry required' } });
        return { ...request.toObject(), error: 'Bank settlement status check failed; retry required' };
    }
};

/** Route transfers use one immutable request + provider idempotency key per
 * finalized order. A timeout may safely be retried with the same request. */
const routeVendorOrder = async orderId => {
    const order = await Order.findById(orderId);
    if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
    if (order.vendorSettlement?.status === 'TRANSFERRED') return order.vendorSettlement;
    const blocked = async reason => {
        await Order.updateOne({ _id: orderId, 'vendorSettlement.status': { $ne: 'TRANSFERRED' } }, { $set: { 'vendorSettlement.status': 'BLOCKED', 'vendorSettlement.error': reason } });
        return { status: 'BLOCKED', error: reason };
    };
    if (process.env.RAZORPAY_ROUTE_ENABLED !== 'true') return blocked('Razorpay Route is not enabled');
    if (order.status !== 'DELIVERED' || order.invoiceFinalizationStatus !== 'FINALIZED') return blocked('Finalized delivered order required');
    if (order.paymentStatus !== 'Paid' || order.paymentMethod !== 'Online' || !order.razorpayPaymentId) return blocked('Verified online collection required; settle COD orders manually');
    const txn = await PaymentTransaction.findOne({ razorpayPaymentId: order.razorpayPaymentId, status: 'consumed', purpose: 'CUSTOMER_ORDER', payer: order.customer });
    if (!txn || txn.consumedBy?.kind !== 'Order' || !txn.consumedBy.ids.some(id => String(id) === String(order._id))) return blocked('Payment is not linked to this order');
    const amount = Number(order.ledger?.vendorNetPayout);
    if (!Number.isFinite(amount) || amount <= 0) return blocked('No positive vendor payout available');
    const vendor = await User.findById(order.vendor);
    if (!/^acc_[A-Za-z0-9]+$/.test(vendor?.razorpayLinkedAccountId || '')) return blocked('Vendor Razorpay linked account is missing');
    const priorManual = await Payout.findOne({ vendor: order.vendor, order: null, status: 'Completed', paidAt: { $gte: order.createdAt } });
    if (priorManual) return blocked('Manual payout overlaps this order; reconcile before routing');
    // Freeze destination and amount before calling the provider. Later profile
    // edits cannot change a request that may already have reached Razorpay.
    await Order.updateOne({ _id: orderId, 'vendorSettlement.account': { $in: ['', null] } }, { $set: {
        'vendorSettlement.account': vendor.razorpayLinkedAccountId, 'vendorSettlement.amount': amount,
        'vendorSettlement.key': `sz-${order._id}`, 'vendorSettlement.status': 'PENDING'
    } });
    const current = await Order.findById(orderId);
    const request = current.vendorSettlement;
    const gateway = getRazorpay();
    const payment = await gateway.payments.fetch(order.razorpayPaymentId);
    if (payment.status !== 'captured' || payment.currency !== 'INR' || Number(payment.amount_refunded || 0) > 0) return blocked('Payment is not an unrefunded captured INR payment');
    // Wallet redemption is funded from the platform balance alongside the new
    // capture; a direct Route transfer can therefore exceed this one capture.
    if (Number(payment.amount) + toPaise(order.walletAmountDeducted || 0) < toPaise(order.invoices.customerInvoice.totalAmount)) return blocked('Verified payment and wallet funds do not cover Invoice 1');
    // Reserve the payable amount before an external write. Manual payout
    // recording subtracts Pending as well as Completed rows, including retries.
    await Payout.findOneAndUpdate({ order: order._id }, { $setOnInsert: {
        vendor: order.vendor, order: order._id, amount: request.amount,
        transactionId: `pending:${order._id}`, paymentMethod: 'Bank Transfer', status: 'Pending',
        notes: 'Reserved for invoice-derived Razorpay Route transfer'
    } }, { upsert: true, runValidators: true });
    try {
        const data = request.transferId ? await gateway.transfers.fetch(request.transferId) : (await axios.post(`${razorpayApiBaseUrl()}/v1/transfers`, {
            account: request.account, amount: toPaise(request.amount), currency: 'INR',
            notes: { order_id: String(order._id), invoice_1: order.invoices.customerInvoice.invoiceNo, invoice_2: order.invoices.platformInvoice.invoiceNo }
        }, {
            auth: { username: process.env.RAZORPAY_KEY_ID, password: process.env.RAZORPAY_KEY_SECRET },
            headers: { 'X-Transfer-Idempotency': request.key }, timeout: 15000
        })).data;
        if (!data.id || data.amount !== toPaise(request.amount) || data.recipient !== request.account || data.currency !== 'INR') throw new Error('Transfer response does not match settlement request');
        const bankFields = bankSettlementFields(data);
        const completed = (data.status || data.transfer_status) === 'processed' && bankFields.bankSettlementStatus !== 'REVIEW';
        await Payout.findOneAndUpdate({ order: order._id }, { $set: {
            vendor: order.vendor, order: order._id, amount: request.amount, transactionId: data.id,
            paymentMethod: 'Bank Transfer', status: completed ? 'Completed' : 'Pending',
            ...bankFields,
            notes: 'Razorpay Route transfer to vendor linked account; bank settlement follows provider schedule.'
        } }, { upsert: true, runValidators: true });
        const state = { ...request.toObject(), ...bankFields, status: completed ? 'TRANSFERRED' : 'PENDING', transferId: data.id, error: bankFields.bankSettlementStatus === 'REVIEW' ? 'Transfer failed or reversed; manual reconciliation required' : '', updatedAt: new Date() };
        await Order.updateOne({ _id: order._id }, { $set: { vendorSettlement: state } });
        return state;
    } catch (error) {
        const message = error.response?.data?.error?.description || error.message;
        await Order.updateOne({ _id: order._id, 'vendorSettlement.status': { $ne: 'TRANSFERRED' } }, { $set: { 'vendorSettlement.status': 'RETRY', 'vendorSettlement.error': message } });
        return { status: 'RETRY', error: message };
    }
};
export const settleVendorOrder = async orderId => {
    const order = await Order.findById(orderId).select('vendor vendorSettlement');
    if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
    if (!order.vendor) throw Object.assign(new Error('Vendor not assigned'), { status: 409 });
    return withVendorPayoutLock(order.vendor, async () => {
        const current = await Order.findById(orderId).select('vendor vendorSettlement');
        return current.vendorSettlement?.status === 'TRANSFERRED' ? refreshBankSettlement(current) : routeVendorOrder(orderId);
    });
};
export const reconcileVendorSettlements = async () => {
    if (process.env.RAZORPAY_ROUTE_ENABLED !== 'true') return;
    const orders = await Order.find({ status: 'DELIVERED', invoiceFinalizationStatus: 'FINALIZED', paymentMethod: 'Online', paymentStatus: 'Paid', 'vendorSettlement.status': { $ne: 'TRANSFERRED' } }).select('_id').limit(100);
    for (const order of orders) {
        try { await settleVendorOrder(order._id); } catch (error) { console.error('Route reconciliation:', error.message); }
    }
    const bankPending = await Order.find({ 'vendorSettlement.status': 'TRANSFERRED', 'vendorSettlement.bankSettlementStatus': { $nin: ['SETTLED', 'REVIEW'] } }).select('_id').sort({ 'vendorSettlement.bankSettlementCheckedAt': 1 }).limit(100);
    for (const order of bankPending) {
        try { await settleVendorOrder(order._id); } catch (error) { console.error('Bank settlement reconciliation:', error.message); }
    }
};
