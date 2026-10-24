import { normalizeStatus } from './dashboardMetrics.js';
const cents = value => Math.round((Number(value) || 0) * 100);
const bookedSupplyStatuses = new Set(['SUBMITTED', 'CONFIRMED', 'ACCEPTED', 'PROCESSING', 'DISPATCHED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'SETTLED']);
const inPeriod = (date, period) => Number.isFinite(+new Date(date)) && +new Date(date) >= +period.start && +new Date(date) <= +period.end;
const sum = (rows, read) => rows.reduce((total, row) => total + cents(read(row)), 0) / 100;
const group = (users, read) => {
    const counts = new Map();
    for (const user of users) { const label = String(read(user) || '').trim() || 'Unspecified'; counts.set(label, (counts.get(label) || 0) + 1); }
    return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};
export const partnerBreakdown = users => {
    const clients = users.filter(user => user.role === 'Customer');
    const vendors = users.filter(user => user.role === 'Vendor');
    const suppliers = users.filter(user => user.role === 'Supplier');
    return { total: clients.length + vendors.length + suppliers.length, clients: clients.length, vendors: vendors.length, suppliers: suppliers.length,
        clientTypes: group(clients, user => user.customerType === 'retail' ? 'Business clients' : user.customerType === 'individual' ? 'Individual clients' : 'Unspecified'),
        vendorTypes: group(vendors, user => user.businessType), supplierTypes: group(suppliers, user => user.supplierDetails?.entityType) };
};
export const dashboardOverview = (orders, supplies, period, now = new Date()) => {
    const periodOrders = orders.filter(order => inPeriod(order.createdAt, period));
    const periodSupplies = supplies.filter(order => inPeriod(order.createdAt, period));
    const bookedOrders = periodOrders.filter(order => normalizeStatus(order.status) !== 'CANCELLED');
    const bookedSupplies = periodSupplies.filter(order => bookedSupplyStatuses.has(normalizeStatus(order.status)));
    const customerValue = sum(bookedOrders, order => order.totalAmount), supplyValue = sum(bookedSupplies, order => order.totalAmount);
    const paidOrders = bookedOrders.filter(order => order.paymentStatus === 'Paid');
    const paidSupplies = bookedSupplies.filter(order => order.paymentStatus === 'Paid' && order.escrowStatus !== 'Refunded');
    const refundedOrders = periodOrders.filter(order => order.paymentStatus === 'Refunded');
    const refundedSupplies = periodSupplies.filter(order => order.escrowStatus === 'Refunded');
    const trail = [];
    for (const order of orders) {
        const history = order.statusHistory || [];
        const events = [...(history.some(event => event.status === 'ORDER_PLACED' && Number.isFinite(+new Date(event.timestamp))) ? [] : [{ status: 'ORDER_BOOKED', timestamp: order.createdAt }]), ...history];
        const seen = new Set();
        for (const event of events) {
            if (!inPeriod(event.timestamp, period) || +new Date(event.timestamp) > +now) continue;
            // Booking is represented once, even when the initial status history has the same event.
            const status = event.status === 'ORDER_PLACED' ? 'ORDER_BOOKED' : event.status;
            const key = `${order._id}:${status}:${+new Date(event.timestamp)}`;
            if (seen.has(key)) continue; seen.add(key);
            trail.push({ key, orderId: String(order._id), orderNumber: order.orderId || String(order._id), channel: 'customer', status, at: new Date(event.timestamp).toISOString() });
        }
    }
    for (const order of periodSupplies) {
        if (['CART', 'PENDING_PAYMENT'].includes(normalizeStatus(order.status)) || +new Date(order.createdAt) > +now) continue;
        trail.push({ key: `${order._id}:booked`, orderId: String(order._id), orderNumber: order.b2bOrderId || String(order._id), channel: 'supply', status: 'ORDER_CREATED', at: new Date(order.createdAt).toISOString() });
    }
    trail.sort((a, b) => +new Date(b.at) - +new Date(a.at) || a.key.localeCompare(b.key));
    return {
        transactions: { total: (cents(customerValue) + cents(supplyValue)) / 100, customerValue, supplyValue, customerOrders: bookedOrders.length, supplyOrders: bookedSupplies.length },
        financialOverview: {
            paidOrderValue: (cents(sum(paidOrders, order => order.totalAmount)) + cents(sum(paidSupplies, order => order.totalAmount))) / 100,
            customerOutstanding: sum(bookedOrders.filter(order => order.paymentStatus === 'Pending'), order => Math.max(0, Number(order.dueAmount) || 0)),
            supplyPendingValue: sum(bookedSupplies.filter(order => order.paymentStatus === 'Pending' && order.escrowStatus !== 'Refunded'), order => order.totalAmount),
            platformFees: (cents(sum(bookedOrders, order => order.priceBreakdown?.platformFee)) + cents(sum(bookedSupplies, order => order.platformFee))) / 100,
            refundMarkedValue: (cents(sum(refundedOrders, order => order.totalAmount)) + cents(sum(refundedSupplies, order => order.totalAmount))) / 100,
            refundMarkedOrders: refundedOrders.length + refundedSupplies.length
        },
        orderTimeline: { total: trail.length, items: trail.slice(0, 12) }
    };
};

export const supplierOverview = (users, orders, period) => {
    const suppliers = users.filter(user => user.role === 'Supplier');
    const activeStatuses = new Set(['SUBMITTED', 'CONFIRMED', 'ACCEPTED', 'PROCESSING', 'DISPATCHED', 'OUT_FOR_DELIVERY']);
    const completedStatuses = new Set(['DELIVERED', 'SETTLED']);
    const empty = () => ({ bookedOrders: 0, activeOrders: 0, completedOrders: 0, cancelledOrders: 0, valueInCents: 0 });
    const rows = new Map(suppliers.map(user => [String(user._id), { id: String(user._id), name: user.supplierDetails?.businessName || user.displayName || 'Supplier', type: user.supplierDetails?.entityType?.trim() || 'Unspecified', ...empty() }]));
    const totals = empty(), other = empty();
    for (const order of orders) {
        const status = normalizeStatus(order.status);
        const row = rows.get(String(order.supplier || '')) || other;
        if (activeStatuses.has(status)) { row.activeOrders++; totals.activeOrders++; }
        if (!inPeriod(order.createdAt, period)) continue;
        if (bookedSupplyStatuses.has(status)) {
            row.bookedOrders++; totals.bookedOrders++;
            row.valueInCents += cents(order.totalAmount); totals.valueInCents += cents(order.totalAmount);
        }
        if (completedStatuses.has(status)) { row.completedOrders++; totals.completedOrders++; }
        if (['CANCELLED', 'REJECTED'].includes(status)) { row.cancelledOrders++; totals.cancelledOrders++; }
    }
    const format = row => { const { valueInCents, ...rest } = row; return { ...rest, bookedValue: valueInCents / 100 }; };
    return { available: true, totalSuppliers: suppliers.length, activeSuppliers: suppliers.filter(user => user.status === 'approved' && !user.isBlocked).length,
        ...format(totals), types: group(suppliers, user => user.supplierDetails?.entityType),
        rows: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).slice(0, 8).map(format), rowCount: rows.size,
        other: format(other) };
};
