const hour = 3600000;
const time = value => value && Number.isFinite(+new Date(value)) ? +new Date(value) : null;
export const eventTime = (order, status) => {
    const events = (order.statusHistory || []).filter(event => event.status === status && time(event.timestamp) !== null);
    return events.length ? Math.max(...events.map(event => time(event.timestamp))) : null;
};
export const processingSample = order => {
    if (order.status === 'CANCELLED') return { excluded: 'cancelled' };
    const started = eventTime(order, 'PROCESSING') ?? eventTime(order, 'RECEIVED_BY_VENDOR');
    const ready = (order.statusHistory || []).filter(event => event.status === 'READY_FOR_DISPATCH' && time(event.timestamp) !== null && time(event.timestamp) >= started).sort((a, b) => time(a.timestamp) - time(b.timestamp))[0];
    if (started === null || !ready) return { excluded: 'missing_timestamps' };
    return { hours: (time(ready.timestamp) - started) / hour, startedAt: new Date(started), readyAt: new Date(ready.timestamp), breach: order.deliveryMode !== 'Express' && (time(ready.timestamp) - started) >= 24 * hour };
};
export const slaExceptions = (order, now = Date.now()) => {
    if (order.status === 'CANCELLED') return [];
    const alerts = [];
    const add = (rule, since, hours) => {
        if (since !== null && now >= since + hours * hour) alerts.push({ key: `${order._id}:${rule}:${since}`, rule, orderId: order._id, orderNumber: order.orderId, startedAt: new Date(since), dueAt: new Date(since + hours * hour), overdueHours: (now - since - hours * hour) / hour });
    };
    if (order.orderType !== 'Walk-In' && ['ORDER_PLACED', 'PICKUP_ASSIGNED', 'RIDER_ARRIVING'].includes(order.status) && order.pickupStatus !== 'picked') add('pickup_2h', time(order.pickupExpectedDate) ?? time(order.pickupTriggerTime) ?? time(order.createdAt), 2);
    if (['RECEIVED_BY_VENDOR', 'PROCESSING'].includes(order.status) && order.deliveryMode !== 'Express') add('processing_24h', eventTime(order, 'PROCESSING') ?? eventTime(order, 'RECEIVED_BY_VENDOR'), 24);
    if (order.status === 'DELIVERED' && order.paymentStatus === 'Pending' && order.dueAmount > 0) add('unpaid_delivery_2h', eventTime(order, 'DELIVERED'), 2);
    return alerts;
};
export const summarizeTat = orders => {
    const samples = orders.map(processingSample);
    const values = samples.filter(item => item.hours !== undefined).map(item => item.hours).sort((a, b) => a - b);
    const percentile = p => values.length ? values[Math.max(0, Math.ceil(p * values.length) - 1)] : null;
    const median = values.length ? (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2 : null;
    return { sampleCount: values.length, averageHours: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, medianHours: median, p90Hours: percentile(0.9), normalBreachCount: samples.filter(item => item.breach).length, cancelled: samples.filter(item => item.excluded === 'cancelled').length, missingTimestamps: samples.filter(item => item.excluded === 'missing_timestamps').length };
};
// Fixed 3 km grid in a local metric projection; buckets are operational density,
// not service-area permissions or a claim of geodesic circle coverage.
export const densityCells = orders => {
    const cells = new Map(); let unlocated = 0;
    for (const order of orders) {
        const point = order.pickupLocation;
        if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lng) || Math.abs(point.lat) > 85 || Math.abs(point.lng) > 180) { unlocated++; continue; }
        const x = 6378137 * point.lng * Math.PI / 180;
        const y = 6378137 * Math.log(Math.tan(Math.PI / 4 + point.lat * Math.PI / 360));
        const col = Math.floor(x / 3000), row = Math.floor(y / 3000), key = `${col}:${row}`;
        const cell = cells.get(key) || { key, count: 0, center: { lng: ((col + 0.5) * 3000 / 6378137) * 180 / Math.PI, lat: (2 * Math.atan(Math.exp((row + 0.5) * 3000 / 6378137)) - Math.PI / 2) * 180 / Math.PI } };
        cell.count++; cells.set(key, cell);
    }
    return { cells: [...cells.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)), unlocated, located: orders.length - unlocated, gridMeters: 3000, projection: 'EPSG:3857' };
};
