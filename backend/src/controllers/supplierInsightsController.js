import mongoose from 'mongoose';
import B2BOrder from '../models/B2BOrder.js';

const DAY = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const round2 = value => Math.round((Number(value) || 0) * 100) / 100;

const parseRange = query => {
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
    const time = new Date(date).getTime();
    return buckets.findIndex(bucket => time >= bucket.start.getTime() && time <= bucket.end.getTime());
};

const CANCELLED = new Set(['CANCELLED', 'Cancelled', 'REJECTED']);
const COMPLETED = new Set(['DELIVERED', 'Delivered', 'SETTLED', 'Settled']);
const SETTLED = new Set(['SETTLED', 'Settled']);
// Drafts and orders whose platform fee is still unpaid were never placed with the supplier.
const UNPLACED = ['CART', 'PENDING_PAYMENT'];
const isSettled = order => order.escrowStatus === 'Released' || SETTLED.has(order.status);

export const getSupplierInsights = async (req, res) => {
    try {
        const role = req.user?.role;
        if (role !== 'Supplier' && role !== 'Admin') {
            return res.status(403).json({ message: 'Only suppliers can view supplier business insights' });
        }

        const supplierId = role === 'Admin' && req.query.supplierId ? req.query.supplierId : req.user.id;
        if (!mongoose.isValidObjectId(supplierId)) return res.status(400).json({ message: 'Invalid supplier id' });

        const range = parseRange(req.query);
        if (range.error) return res.status(400).json({ message: range.error });
        const { from, to } = range;

        const orders = await B2BOrder.find({ supplier: supplierId, status: { $nin: UNPLACED }, createdAt: { $gte: from, $lte: to } })
            .select('b2bOrderId status totalAmount deliveryCharge paymentStatus escrowStatus items vendor createdAt')
            .populate('vendor', 'displayName businessName shopDetails.name')
            .populate('items.materialId', 'gst brand materialName +costPrice')
            .sort({ createdAt: -1 })
            .lean();

        const billable = orders.filter(order => !CANCELLED.has(order.status));
        const completed = orders.filter(order => COMPLETED.has(order.status));
        const { granularity, buckets } = buildBuckets(from, to);
        const trend = buckets.map(bucket => ({ label: bucket.label, revenue: 0, netSales: 0, orders: 0 }));
        const products = {};
        let grossRevenue = 0;
        let gstCollected = 0;
        let netSales = 0;
        let unitsSold = 0;
        let costOfGoods = 0;
        let profitCoverageComplete = true;

        for (const order of billable) {
            grossRevenue += Number(order.totalAmount) || 0;
            const index = bucketIndex(buckets, order.createdAt);
            let orderNet = 0;
            for (const item of order.items || []) {
                const quantity = Number(item.quantity) || 0;
                const lineTotal = (Number(item.price) || 0) * quantity;
                const rawGst = Number(item.gst ?? item.materialId?.gst);
                const gstRate = Number.isFinite(rawGst) && rawGst >= 0 ? rawGst : 18;
                const taxable = lineTotal / (1 + gstRate / 100);
                const tax = lineTotal - taxable;
                orderNet += taxable;
                gstCollected += tax;
                unitsSold += quantity;
                const unitCost = Number(item.costPrice ?? item.materialId?.costPrice);
                if (unitCost > 0) costOfGoods += unitCost * quantity;
                else profitCoverageComplete = false;
                const name = item.name || item.materialId?.materialName || 'Product';
                if (!products[name]) products[name] = { name, revenue: 0, units: 0 };
                products[name].revenue += lineTotal;
                products[name].units += quantity;
            }
            netSales += orderNet;
            if (index >= 0) {
                trend[index].revenue += Number(order.totalAmount) || 0;
                trend[index].netSales += orderNet;
                trend[index].orders += 1;
            }
        }

        trend.forEach(row => {
            row.revenue = round2(row.revenue);
            row.netSales = round2(row.netSales);
        });

        const statusCounts = {};
        orders.forEach(order => { statusCounts[order.status] = (statusCounts[order.status] || 0) + 1; });
        const statusBreakdown = Object.entries(statusCounts)
            .map(([name, count]) => ({ name, count, percent: orders.length ? round2(count * 100 / orders.length) : 0 }))
            .sort((a, b) => b.count - a.count);

        const topProducts = Object.values(products)
            .map(product => ({ ...product, revenue: round2(product.revenue) }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 8);

        // Money is owed only once goods are delivered; until then the order is still in the pipeline.
        const receivable = completed
            .filter(order => !isSettled(order))
            .reduce((sum, order) => sum + (Number(order.totalAmount) || 0), 0);
        const released = completed
            .filter(isSettled)
            .reduce((sum, order) => sum + (Number(order.totalAmount) || 0), 0);
        const inPipeline = billable
            .filter(order => !COMPLETED.has(order.status))
            .reduce((sum, order) => sum + (Number(order.totalAmount) || 0), 0);

        res.json({
            range: { from, to, granularity },
            kpis: {
                grossRevenue: round2(grossRevenue),
                netSales: round2(netSales),
                gstCollected: round2(gstCollected),
                costOfGoods: round2(costOfGoods),
                estimatedGrossProfit: profitCoverageComplete ? round2(netSales - costOfGoods) : null,
                profitCoverageComplete,
                receivable: round2(receivable),
                released: round2(released),
                inPipeline: round2(inPipeline),
                deliveryCharges: round2(billable.reduce((sum, order) => sum + (Number(order.deliveryCharge) || 0), 0)),
                billableOrders: billable.length,
                totalOrders: orders.length,
                completedOrders: completed.length,
                unitsSold: round2(unitsSold),
                averageOrderValue: billable.length ? round2(grossRevenue / billable.length) : 0,
                completionRate: orders.length ? round2(completed.length * 100 / orders.length) : null
            },
            trend,
            statusBreakdown,
            topProducts,
            recentOrders: orders.slice(0, 10).map(order => ({
                id: order.b2bOrderId || String(order._id).slice(-8).toUpperCase(),
                date: order.createdAt,
                vendor: order.vendor?.businessName || order.vendor?.shopDetails?.name || order.vendor?.displayName || 'Vendor',
                status: order.status,
                total: round2(order.totalAmount)
            }))
        });
    } catch (error) {
        console.error('Supplier insights error:', error);
        res.status(500).json({ message: 'Error computing supplier business insights' });
    }
};
