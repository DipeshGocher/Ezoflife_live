import { settleVendorOrder } from './vendorSettlement.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import { nextSequence } from '../models/Counter.js';
import { generateOrderInvoices, GstConfigurationError } from '../utils/gstInvoiceHelper.js';

const financialYearFor = dateValue => {
    const date = new Date(dateValue);
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'numeric' }).formatToParts(date);
    const year = Number(parts.find(part => part.type === 'year').value);
    const month = Number(parts.find(part => part.type === 'month').value);
    const start = month >= 4 ? year : year - 1;
    return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
};

const assertInvoiceFields = (invoice, label) => {
    const missing = [];
    if (!invoice.issuerName) missing.push('issuer name');
    if (!invoice.supplierAddress) missing.push('supplier address');
    if (!invoice.recipientAddress) missing.push('recipient address');
    if (!invoice.placeOfSupplyStateCode) missing.push('place-of-supply state code');
    if (!Array.isArray(invoice.lineItems) || !invoice.lineItems.length) missing.push('line items');
    for (const [index, line] of (invoice.lineItems || []).entries()) {
        if (!line.description) missing.push(`line ${index + 1} description`);
        if (!line.sacCode) missing.push(`line ${index + 1} SAC code`);
    }
    if (missing.length) throw new GstConfigurationError(`${label} cannot be finalized; missing ${missing.join(', ')}`);
};

const finalizedInvoice = (invoice, invoiceNo, financialYear, invoiceDate) => ({
    ...(typeof invoice.toObject === 'function' ? invoice.toObject() : invoice),
    invoiceNo,
    financialYear,
    invoiceDate,
    generatedAt: invoiceDate,
    finalizedAt: new Date(),
    documentStatus: 'FINALIZED'
});

/**
 * The only supported transition to DELIVERED. It locks the order, validates
 * complete invoice fields, allocates FY-scoped numbers, and stores both frozen
 * invoices in the same database update that marks the order delivered.
 */
export const finalizeDeliveredOrder = async (orderId, { deliveredAt = new Date(), set = {} } = {}) => {
    const existing = await Order.findById(orderId);
    if (!existing) throw Object.assign(new Error('Order not found'), { status: 404 });
    if (existing.invoiceFinalizationStatus === 'FINALIZED') return existing;

    const lockTime = new Date();
    const locked = await Order.findOneAndUpdate(
        { _id: orderId, status: { $ne: 'CANCELLED' }, $or: [
            { invoiceFinalizationStatus: { $in: ['NOT_READY', null] } },
            { invoiceFinalizationStatus: 'FINALIZING', invoiceFinalizationStartedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } }
        ] },
        { $set: { invoiceFinalizationStatus: 'FINALIZING', invoiceFinalizationStartedAt: lockTime } },
        { new: true }
    );
    if (!locked) throw Object.assign(new Error('Invoice finalization is unavailable for this order'), { status: 409 });

    try {
        let generatedData = null;
        let customerInvoice = locked.invoices?.customerInvoice;
        let platformInvoice = locked.invoices?.platformInvoice;
        if (!customerInvoice?.preparedAt || !platformInvoice?.preparedAt) {
            const [customer, vendor] = await Promise.all([
                locked.customer ? User.findById(locked.customer) : null,
                locked.vendor ? User.findById(locked.vendor) : null
            ]);
            const generated = await generateOrderInvoices({
                order: locked, customer, vendor, vendorPromoValue: locked.ledger?.appliedPromoValue || 0
            });
            generatedData = generated;
            customerInvoice = generated.customerInvoice;
            platformInvoice = generated.platformInvoice;
        }

        assertInvoiceFields(customerInvoice, 'Invoice 1');
        assertInvoiceFields(platformInvoice, 'Invoice 2');
        const round = value => Math.round(Number(value) * 100) / 100;
        const oneTotal = round(customerInvoice.lineItems.reduce((sum, line) => sum + line.totalAmount, 0) - (customerInvoice.discountAmount || 0));
        const twoTotal = round(platformInvoice.lineItems.reduce((sum, line) => sum + line.totalAmount, 0));
        const ledger = generatedData?.ledger || locked.ledger;
        if (![customerInvoice.totalAmount, platformInvoice.totalInvoiceAmount, ledger.vendorNetPayout, ledger.invoice2Total, ledger.customerWalletCredit].every(value => Number.isFinite(value) && value >= 0)) throw new GstConfigurationError('Invalid invoice or payout amount');
        if (Math.abs(oneTotal - customerInvoice.totalAmount) > 0.01 || Math.abs(twoTotal - platformInvoice.totalInvoiceAmount) > 0.01
            || Math.abs(round(ledger.vendorNetPayout + ledger.invoice2Total + ledger.customerWalletCredit) - customerInvoice.totalAmount) > 0.01) {
            throw new GstConfigurationError('Invoice totals and payout ledger do not reconcile');
        }
        const financialYear = financialYearFor(deliveredAt);
        const [customerSequence, platformSequence] = await Promise.all([
            nextSequence(`invoice:customer:${financialYear}`),
            nextSequence(`invoice:platform:${financialYear}`)
        ]);
        const invoice1 = finalizedInvoice(customerInvoice, `SZ1/${financialYear}/${String(customerSequence).padStart(6, '0')}`, financialYear, deliveredAt);
        const invoice2 = finalizedInvoice(platformInvoice, `SZ2/${financialYear}/${String(platformSequence).padStart(6, '0')}`, financialYear, deliveredAt);

        const finalized = await Order.findOneAndUpdate(
            { _id: orderId, invoiceFinalizationStatus: 'FINALIZING', invoiceFinalizationStartedAt: lockTime },
            {
                $set: {
                    ...set,
                    ...(generatedData ? { ledger: generatedData.ledger, gstSnapshot: generatedData.gstSnapshot } : {}),
                    status: 'DELIVERED',
                    deliveredAt,
                    'invoices.customerInvoice': invoice1,
                    'invoices.platformInvoice': invoice2,
                    invoiceFinalizationStatus: 'FINALIZED',
                    invoiceFinalizationStartedAt: null
                },
                $push: { statusHistory: { status: 'DELIVERED', timestamp: deliveredAt } }
            },
            { new: true, runValidators: true }
        );
        if (!finalized) throw new Error('Invoice finalization lock was lost');
        if (process.env.RAZORPAY_ROUTE_ENABLED === 'true') {
            try { await settleVendorOrder(finalized._id); } catch (error) { console.error('Route settlement queued for retry:', error.message); }
        }
        return finalized;
    } catch (error) {
        await Order.updateOne(
            { _id: orderId, invoiceFinalizationStatus: 'FINALIZING', invoiceFinalizationStartedAt: lockTime },
            { $set: { invoiceFinalizationStatus: 'NOT_READY', invoiceFinalizationStartedAt: null } }
        );
        throw error;
    }
};

export { financialYearFor };
