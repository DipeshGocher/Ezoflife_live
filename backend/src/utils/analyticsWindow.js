const day = 86400000;
const offset = 330 * 60000;
export const businessDayStart = value => new Date(Math.floor((new Date(value).getTime() + offset) / day) * day - offset);
export const analyticsWindow = (query = {}, now = new Date()) => {
    const range = query.timeRange || 'Today';
    let start = businessDayStart(now), end = new Date(now);
    if (range === 'Last 7 Days') start = new Date(now.getTime() - 7 * day);
    else if (range === 'Last 30 Days') start = new Date(now.getTime() - 30 * day);
    else if (range === 'Year-to-Date') start = new Date(`${new Date(now.getTime() + offset).getUTCFullYear()}-01-01T00:00:00+05:30`);
    else if (range === 'Custom Range') {
        const date = /^\d{4}-\d{2}-\d{2}$/;
        if (!date.test(query.startDate || '') || !date.test(query.endDate || '')) throw new Error('Custom range requires start and end dates.');
        start = new Date(`${query.startDate}T00:00:00+05:30`);
        end = new Date(new Date(`${query.endDate}T00:00:00+05:30`).getTime() + day - 1);
        if (!Number.isFinite(+start) || !Number.isFinite(+end) || new Date(+start + offset).toISOString().slice(0, 10) !== query.startDate || new Date(+end + offset).toISOString().slice(0, 10) !== query.endDate) throw new Error('Invalid analytics date range.');
    } else if (!['Today', 'Last 7 Days', 'Last 30 Days', 'Year-to-Date'].includes(range)) throw new Error('Invalid analytics time range.');
    if (!Number.isFinite(+start) || !Number.isFinite(+end) || start > end) throw new Error('Invalid analytics date range.');
    return { start, end, timezone: 'Asia/Kolkata' };
};
// Preserve both the report window and deadline/cohort constraints.
export const inWindow = (query, start, end) => ({ $and: [{ createdAt: { $gte: start, $lte: end } }, query] });
