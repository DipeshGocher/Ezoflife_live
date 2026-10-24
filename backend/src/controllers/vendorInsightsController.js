import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Feedback from '../models/Feedback.js';
import { extractFeedbackTags } from '../utils/feedbackTags.js';

/**
 * Vendor "Business Insights": every figure on the page, computed from the
 * vendor's own orders and customer feedback for the selected date range.
 *
 * GET /api/orders/vendor/insights?from=YYYY-MM-DD&to=YYYY-MM-DD
 */

const DAY = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

// Order statuses grouped the way the page's status chart presents them
const STATUS_GROUPS = [
    ['Completed', ['DELIVERED']],
    ['In Progress', ['RECEIVED_BY_VENDOR', 'PROCESSING', 'READY_FOR_DISPATCH']],
    ['Awaiting Pickup', ['PICKUP_ASSIGNED', 'RIDER_ARRIVING']],
    ['In Transit', ['IN_TRANSIT', 'OUT_FOR_DELIVERY']],
    ['New Order', ['ORDER_PLACED']],
    ['Cancelled', ['CANCELLED']]
];

/** What the vendor earns on an order (same rule as the admin payout summary). */
export const vendorEarning = (order) => {
    const net = order.ledger?.vendorNetPayout;
    if (typeof net === 'number' && net > 0) return net;
    const b = order.priceBreakdown || {};
    return (b.baseWithArea || 0) + (b.expressSurcharge || 0);
};

/** Business (B2B) customer: has a GSTIN or is a retail/business account. */
export const isBusinessCustomer = (customer) =>
    Boolean(customer && ((customer.gstNumber || '').trim() || customer.customerType === 'retail'));

const parseRange = (query) => {
    const now = new Date();
    const from = query.from ? new Date(query.from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = query.to ? new Date(query.to) : now;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return { error: 'from/to must be valid dates' };
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
    if (to < from) return { error: '"to" must be on or after "from"' };
    if (to - from > 731 * DAY) return { error: 'Range cannot exceed 2 years' };
    return { from, to };
};

/** Day buckets up to a month, weeks up to ~3 months, then months. */
const buildBuckets = (from, to) => {
    const span = (to - from) / DAY;
    const granularity = span <= 31 ? 'day' : span <= 92 ? 'week' : 'month';
    const buckets = [];
    const cursor = new Date(from);

    while (cursor <= to) {
        const start = new Date(cursor);
        let end;
        let label;
        if (granularity === 'day') {
            end = new Date(start.getTime() + DAY - 1);
            label = `${start.getDate()} ${MONTHS[start.getMonth()]}`;
            cursor.setDate(cursor.getDate() + 1);
        } else if (granularity === 'week') {
            end = new Date(start.getTime() + 7 * DAY - 1);
            label = `${start.getDate()} ${MONTHS[start.getMonth()]}`;
            cursor.setDate(cursor.getDate() + 7);
        } else {
            end = new Date(start.getFullYear(), start.getMonth() + 1, 1, 0, 0, 0, -1);
            label = `${MONTHS[start.getMonth()]} ${String(start.getFullYear()).slice(2)}`;
            cursor.setMonth(cursor.getMonth() + 1, 1);
            cursor.setHours(0, 0, 0, 0);
        }
        buckets.push({ start, end: end > to ? to : end, label });
    }
    return { granularity, buckets };
};

const bucketIndex = (buckets, date) => {
    const t = new Date(date).getTime();
    return buckets.findIndex(b => t >= b.start.getTime() && t <= b.end.getTime());
};

export const getVendorInsights = async (req, res) => {
    try {
        const role = req.user?.role;
        if (role !== 'Vendor' && role !== 'Admin') {
            return res.status(403).json({ message: 'Only vendors can view business insights' });
        }
        // A vendor sees only their own numbers; an admin may pass ?vendorId.
        const vendorId = role === 'Admin' && req.query.vendorId ? req.query.vendorId : req.user.id;
        if (!mongoose.isValidObjectId(vendorId)) {
            return res.status(400).json({ message: 'Invalid vendor id' });
        }

        const range = parseRange(req.query);
        if (range.error) return res.status(400).json({ message: range.error });
        const { from, to } = range;

        const [orders, feedbacks] = await Promise.all([
            Order.find({ vendor: vendorId, createdAt: { $gte: from, $lte: to } })
                .select('orderId status totalAmount priceBreakdown ledger items customer createdAt')
                .populate('customer', 'displayName phone gstNumber customerType businessName')
                .sort({ createdAt: -1 })
                .lean(),
            Feedback.find({ vendor: vendorId, createdAt: { $gte: from, $lte: to } })
                .select('rating comment category createdAt')
                .lean()
        ]);

        const billable = orders.filter(o => o.status !== 'CANCELLED');
        const { granularity, buckets } = buildBuckets(from, to);

        // ---- KPIs ----
        const revenue = billable.reduce((s, o) => s + (o.totalAmount || 0), 0);
        const netEarnings = billable.reduce((s, o) => s + vendorEarning(o), 0);
        const completed = orders.filter(o => o.status === 'DELIVERED').length;
        const cancelled = orders.filter(o => o.status === 'CANCELLED').length;
        const closed = completed + cancelled;

        // ---- Revenue / earnings trend ----
        const trend = buckets.map(b => ({ label: b.label, revenue: 0, earnings: 0, orders: 0 }));
        for (const o of billable) {
            const i = bucketIndex(buckets, o.createdAt);
            if (i < 0) continue;
            trend[i].revenue += o.totalAmount || 0;
            trend[i].earnings += vendorEarning(o);
            trend[i].orders += 1;
        }
        trend.forEach(t => { t.revenue = round2(t.revenue); t.earnings = round2(t.earnings); });

        // ---- Status mix ----
        const statusBreakdown = STATUS_GROUPS.map(([name, statuses]) => {
            const count = orders.filter(o => statuses.includes(o.status)).length;
            return { name, count, percent: orders.length ? Math.round((count / orders.length) * 1000) / 10 : 0 };
        }).filter(s => s.count > 0);

        // ---- Average order value per service ----
        const services = {};
        for (const o of billable) {
            const seen = new Set();
            for (const item of o.items || []) {
                const name = item.name || 'Service';
                const line = (Number(item.price) || 0) * (Number(item.quantity) || 0);
                if (!services[name]) services[name] = { total: 0, orders: 0 };
                services[name].total += line;
                if (!seen.has(name)) { services[name].orders += 1; seen.add(name); }
            }
        }
        const serviceAov = Object.entries(services)
            .map(([name, v]) => ({ name, avg: round2(v.orders ? v.total / v.orders : 0), orders: v.orders }))
            .sort((a, b) => b.avg - a.avg)
            .slice(0, 6);

        // ---- GST ledger (cancelled orders are not invoiced) ----
        const ledger = billable.map(o => {
            const total = Number(o.totalAmount) || 0;
            const gst = Number(o.priceBreakdown?.gstAmount) || 0;
            const taxable = Math.max(0, total - gst);
            const business = isBusinessCustomer(o.customer);
            return {
                invoiceNo: o.orderId || String(o._id).slice(-8).toUpperCase(),
                date: o.createdAt,
                client: o.customer?.businessName || o.customer?.displayName || o.customer?.phone || 'Walk-in Customer',
                customerId: o.customer?._id ? String(o.customer._id) : null,
                type: business ? 'B2B' : 'B2C',
                gstin: (o.customer?.gstNumber || '').trim() || 'N/A',
                taxable: round2(taxable),
                rate: taxable > 0 ? Math.round((gst / taxable) * 100) : 0,
                gst: round2(gst),
                total: round2(total)
            };
        });

        const b2bRows = ledger.filter(r => r.type === 'B2B');
        const b2cRows = ledger.filter(r => r.type === 'B2C');

        const clientTotals = {};
        for (const r of b2bRows) {
            const key = r.customerId || r.client;
            if (!clientTotals[key]) clientTotals[key] = { name: r.client, taxable: 0 };
            clientTotals[key].taxable += r.taxable;
        }
        const b2bClients = Object.values(clientTotals)
            .map(c => ({ name: c.name, taxable: round2(c.taxable) }))
            .sort((a, b) => b.taxable - a.taxable)
            .slice(0, 6);

        // B2C orders per month across the range
        const monthKeys = [];
        for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d <= to; d.setMonth(d.getMonth() + 1)) {
            monthKeys.push({ y: d.getFullYear(), m: d.getMonth(), label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, orders: 0 });
        }
        for (const r of b2cRows) {
            const d = new Date(r.date);
            const mk = monthKeys.find(k => k.y === d.getFullYear() && k.m === d.getMonth());
            if (mk) mk.orders += 1;
        }

        // ---- Customer feedback ----
        const rated = feedbacks.filter(f => Number(f.rating) > 0);
        const avgOf = list => (list.length ? Math.round((list.reduce((s, f) => s + f.rating, 0) / list.length) * 10) / 10 : null);
        const ratingTrend = buckets.map(b => ({
            label: b.label,
            rating: avgOf(rated.filter(f => { const t = new Date(f.createdAt).getTime(); return t >= b.start.getTime() && t <= b.end.getTime(); }))
        }));
        const tags = extractFeedbackTags(rated, 3);

        res.json({
            range: { from, to, granularity },
            kpis: {
                revenue: round2(revenue),
                netEarnings: round2(netEarnings),
                aov: billable.length ? round2(revenue / billable.length) : 0,
                totalOrders: orders.length,
                billableOrders: billable.length,
                completed,
                cancelled,
                // Delivered out of all orders that reached a final state; null when none have
                successRate: closed ? Math.round((completed / closed) * 1000) / 10 : null
            },
            trend,
            statusBreakdown,
            serviceAov,
            gst: {
                taxable: round2(ledger.reduce((s, r) => s + r.taxable, 0)),
                gst: round2(ledger.reduce((s, r) => s + r.gst, 0)),
                b2bTaxable: round2(b2bRows.reduce((s, r) => s + r.taxable, 0)),
                b2cOrders: b2cRows.length
            },
            b2bClients,
            b2cMonthly: monthKeys.map(({ label, orders: n }) => ({ label, orders: n })),
            ledger: ledger.map(({ customerId, ...row }) => row),
            feedback: {
                average: avgOf(rated),
                count: rated.length,
                trend: ratingTrend,
                positive: tags.positive,
                critical: tags.critical
            }
        });
    } catch (error) {
        console.error('Vendor insights error:', error);
        res.status(500).json({ message: 'Error computing business insights' });
    }
};
