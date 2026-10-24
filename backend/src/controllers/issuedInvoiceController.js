import Order from '../models/Order.js';
import SystemConfig from '../models/SystemConfig.js';
import IssuedInvoice from '../models/IssuedInvoice.js';
import { nextSequence } from '../models/Counter.js';
import { normalizeInvoiceSettings } from '../../../shared/invoiceSettings.mjs';
import { requireSupportAccess } from '../utils/supportAccess.js';
const loadOrder = async req => {
    const order = await Order.findById(req.params.id).select('orderId customer vendor customerSnapshot vendorSnapshot items totalAmount dueAmount advanceAmount grossServiceCost discount deliveryCharge priceBreakdown ledger paymentStatus paymentMethod orderType createdAt dropAddress pickupAddress tier deliveryMode pickupLocation')
        .populate('customer', 'displayName phone email address customerType gstNumber')
        .populate('vendor', 'displayName phone email address gstNumber location shopDetails.name shopDetails.address shopDetails.gst').lean();
    if (!order) throw Object.assign(new Error('Order not found.'), { status: 404 });
    await requireSupportAccess(req, { order });
    return order;
};
const typeOf = req => {
    const type = req.body?.type || req.query.type || 'customer';
    if (!['customer', 'platform_vendor'].includes(type)) throw Object.assign(new Error('Unsupported invoice type.'), { status: 400 });
    return type;
};
const fail = (res, error) => res.status(error.status || (error.name === 'CastError' ? 400 : 503)).json({ message: error.message });
export const getIssuedInvoice = async (req, res) => {
    try {
        await loadOrder(req);
        const invoice = await IssuedInvoice.findOne({ order: req.params.id, type: typeOf(req) }).lean();
        if (!invoice) return res.status(404).json({ message: 'No invoice has been issued for this document type.' });
        res.json(invoice);
    } catch (error) { fail(res, error); }
};
export const issueInvoice = async (req, res) => {
    try {
        await IssuedInvoice.init();
        const facts = await loadOrder(req), type = typeOf(req);
        const existing = await IssuedInvoice.findOne({ order: facts._id, type }).lean();
        if (existing) return res.json(existing);
        if (!Number.isFinite(facts.totalAmount) || !(facts.items || []).every(item => Number.isFinite(item.price) && Number.isFinite(item.quantity))) return res.status(422).json({ message: 'The order has incomplete recorded amounts. Resolve its source facts before issuing.' });
        const config = await SystemConfig.findOne({ key: 'invoice_settings' }).lean();
        const issuedAt = new Date(), year = issuedAt.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric' });
        const sequence = await nextSequence(`invoice:${year}`);
        try {
            const created = await IssuedInvoice.create({ order: facts._id, type, number: `INV-${year}-${sequence}`, issuedAt, issuedBy: req.admin.id, templateVersion: 'recorded-facts-v1', settings: normalizeInvoiceSettings(config?.value), facts });
            return res.status(201).json(created);
        } catch (error) {
            if (error.code !== 11000) throw error;
            const winner = await IssuedInvoice.findOne({ order: facts._id, type }).lean();
            if (!winner) throw error;
            return res.json(winner);
        }
    } catch (error) { fail(res, error); }
};
