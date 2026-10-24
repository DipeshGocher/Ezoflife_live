import { businessDayStart } from './analyticsWindow.js';
import { eventTime, slaExceptions } from './operationalMetrics.js';

export const normalizeStatus = value => String(value || '').trim().toUpperCase().replace(/\s+/g, '_');
const b2cActive = new Set(['ORDER_PLACED', 'PICKUP_ASSIGNED', 'RIDER_ARRIVING', 'IN_TRANSIT', 'RECEIVED_BY_VENDOR', 'PROCESSING', 'READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY']);
const b2bActive = new Set(['SUBMITTED', 'CONFIRMED', 'ACCEPTED', 'PROCESSING', 'DISPATCHED', 'OUT_FOR_DELIVERY']);
const b2bBooked = new Set([...b2bActive, 'DELIVERED', 'SETTLED']);
const cents = value => Math.round((Number(value) || 0) * 100);

const offset = 330 * 60000;
const day = 86400000;
const trendFor = (orders, period) => {
    const span = +period.end - +period.start;
    const granularity = span <= day ? 'hour' : span <= 90 * day ? 'day' : span <= 3 * 366 * day ? 'month' : 'year';
    const bucket = value => {
        const date = new Date(+new Date(value) + offset);
        if (granularity === 'year') return Date.UTC(date.getUTCFullYear(), 0, 1) - offset;
        if (granularity === 'month') return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) - offset;
        const unit = granularity === 'hour' ? 3600000 : day;
        return Math.floor((+new Date(value) + offset) / unit) * unit - offset;
    };
    const next = value => {
        if (granularity === 'hour') return value + 3600000;
        if (granularity === 'day') return value + day;
        const date = new Date(value + offset);
        return (granularity === 'month' ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) : Date.UTC(date.getUTCFullYear() + 1, 0, 1)) - offset;
    };
    const points = new Map();
    for (let time = bucket(period.start); time <= +period.end; time = next(time)) points.set(time, { at: new Date(time).toISOString(), amount: 0, orders: 0 });
    for (const order of orders) {
        const time = +new Date(order.createdAt);
        if (time < +period.start || time > +period.end) continue;
        const point = points.get(bucket(time));
        if (point) { point.amount += cents(order.totalAmount); point.orders++; }
    }
    return { granularity, points: [...points.values()].map(point => ({ ...point, amount: point.amount / 100 })) };
};
const activeStages = [
    { name: 'New & accepted', b2c: ['ORDER_PLACED', 'PICKUP_ASSIGNED', 'RIDER_ARRIVING'], b2b: ['SUBMITTED', 'CONFIRMED', 'ACCEPTED'] },
    { name: 'Processing', b2c: ['RECEIVED_BY_VENDOR', 'PROCESSING'], b2b: ['PROCESSING'] },
    { name: 'Ready', b2c: ['READY_FOR_DISPATCH'], b2b: [] },
    { name: 'In transit', b2c: ['IN_TRANSIT', 'OUT_FOR_DELIVERY'], b2b: ['DISPATCHED', 'OUT_FOR_DELIVERY'] }
];

// Pure reducer shared by the endpoint's cards and queues. No payment mutation.
export const dashboardMetrics = (orders, supplies, period, now = new Date()) => {
    const activeB2c = orders.filter(order => b2cActive.has(normalizeStatus(order.status)));
    const activeB2b = supplies.filter(order => b2bActive.has(normalizeStatus(order.status)));
    const booked = [...orders.filter(order => normalizeStatus(order.status) !== 'CANCELLED'), ...supplies.filter(order => b2bBooked.has(normalizeStatus(order.status)))];
    const total = (start, end) => booked.filter(order => +new Date(order.createdAt) >= +start && +new Date(order.createdAt) <= +end).reduce((sum, order) => sum + cents(order.totalAmount), 0) / 100;
    const tripOrders = activeB2c.filter(order => order.orderType !== 'Walk-In' && ['PICKUP_ASSIGNED', 'RIDER_ARRIVING', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(normalizeStatus(order.status)));
    const riders = new Set(); let unidentifiedTrips = 0;
    for (const order of tripOrders) {
        const phone = String(order.riderDetails?.phone || '').replace(/\D/g, '');
        const key = phone.length >= 10 ? `phone:${phone.slice(-10)}` : order.rider ? `account:${order.rider}` : null;
        if (key) riders.add(key); else unidentifiedTrips++;
    }
    const exceptions = orders.flatMap(order => slaExceptions(order, +now)).filter(alert => ['pickup_2h', 'unpaid_delivery_2h'].includes(alert.rule));
    const queue = rule => exceptions.filter(alert => alert.rule === rule).sort((a, b) => +a.dueAt - +b.dueAt || String(a.orderId).localeCompare(String(b.orderId)));
    return {
        charts: {
            gmvTrend: trendFor(booked, period),
            activeStages: activeStages.map(stage => ({ name: stage.name, b2c: activeB2c.filter(order => stage.b2c.includes(normalizeStatus(order.status))).length, b2b: activeB2b.filter(order => stage.b2b.includes(normalizeStatus(order.status))).length }))
        },
        activeOrders: { total: activeB2c.length + activeB2b.length, b2c: activeB2c.length, b2b: activeB2b.length },
        ridersOnTrips: { count: riders.size, recordedTrips: tripOrders.length, unidentifiedTrips, source: 'Stored rider assignments on active B2C trips; not live GPS availability' },
        gmv: { today: total(businessDayStart(now), now), selectedPeriod: total(period.start, period.end), definition: 'Booked order value; cancelled, rejected, cart and unpaid B2B drafts excluded. Not cash collected.' },
        coverage: { unpaidDeliveriesWithoutTimestamp: orders.filter(order => order.status === 'DELIVERED' && order.paymentStatus === 'Pending' && order.dueAmount > 0 && eventTime(order, 'DELIVERED') === null).length },
        delayedPickups: queue('pickup_2h'), unpaidDeliveries: queue('unpaid_delivery_2h')
    };
};

export const pointInArea = (point, area) => {
    if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lng)) return false;
    const inside = ring => {
        let result = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [x, y] = ring[i], [px, py] = ring[j];
            if ((y > point.lat) !== (py > point.lat) && point.lng < (px - x) * (point.lat - y) / (py - y) + x) result = !result;
        }
        return result;
    };
    const [outer, ...holes] = area.boundary?.coordinates || [];
    return !!outer?.length && inside(outer) && !holes.some(inside);
};
