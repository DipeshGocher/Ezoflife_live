import { dashboardOverview, partnerBreakdown, supplierOverview } from '../utils/dashboardOverview.js';
import { accountPoint } from '../utils/adminScope.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import B2BOrder from '../models/B2BOrder.js';
import ServiceArea from '../models/ServiceArea.js';
import { createAdminReportScope } from '../utils/adminReportScope.js';
import { analyticsWindow, businessDayStart } from '../utils/analyticsWindow.js';
import { dashboardMetrics, pointInArea } from '../utils/dashboardMetrics.js';
import { filterCondition, textFilter } from '../utils/queryFilters.js';

export const getOperationalDashboard = async (req, res) => {
    try {
        const now = new Date();
        let period;
        try { period = analyticsWindow(req.query, now); }
        catch (error) { return res.status(400).json({ success: false, message: error.message }); }
        const { channel = 'All', state, city, pincode, geofence } = req.query;
        if (!['All', 'B2C', 'B2B'].includes(channel)) return res.status(400).json({ success: false, message: 'Invalid dashboard channel.' });
        const page = Number(req.query.page || 1);
        if (!Number.isSafeInteger(page) || page < 1) return res.status(400).json({ success: false, message: 'Invalid alert page.' });
        const scope = await createAdminReportScope(req, ['User', 'Order', 'B2BOrder', 'ServiceArea']);
        const areas = await ServiceArea.find(scope.query('ServiceArea', { isActive: true, ...(geofence ? { areaName: filterCondition(geofence) } : {}) })).select('areaName boundary pincodes city').lean();
        const address = {};
        if (state) address.state = textFilter(state);
        if (city) address.city = textFilter(city);
        if (pincode) address.pincode = filterCondition(pincode);
        const userQuery = Object.keys(address).length ? { $or: [
            { addresses: { $elemMatch: address } },
            Object.fromEntries(Object.entries(address).map(([key, value]) => [`shopDetails.${key}`, value])),
            Object.fromEntries(Object.entries(address).map(([key, value]) => [`supplierDetails.${key}`, value]))
        ] } : {};
        // Keep historical orders accessible even when their customer has been archived.
        // Account-derived geography is only used when an administrator chooses those filters.
        const users = await User.find(scope.query('User', { $and: [userQuery, { role: { $in: ['Customer', 'Vendor', 'Supplier'] } }] })).select('_id role customerType businessType supplierDetails.entityType supplierDetails.businessName displayName status isBlocked location addresses shopDetails.location supplierDetails.location').lean();
        const userIds = users.map(user => user._id);
        const earliest = new Date(Math.min(+businessDayStart(now), +period.start));
        const orderQuery = { $or: [
            { createdAt: { $gte: earliest, $lte: new Date(Math.max(+now, +period.end)) } },
            { status: { $in: ['ORDER_PLACED', 'PICKUP_ASSIGNED', 'RIDER_ARRIVING', 'IN_TRANSIT', 'RECEIVED_BY_VENDOR', 'PROCESSING', 'READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY'] } },
            { status: 'DELIVERED', paymentStatus: 'Pending', dueAmount: { $gt: 0 } },
            { 'statusHistory.timestamp': { $gte: period.start, $lte: period.end } }
        ] };
        if (state || city || pincode) orderQuery.customer = { $in: userIds };
        const supplyQuery = { $or: [
            { createdAt: { $gte: earliest, $lte: new Date(Math.max(+now, +period.end)) } },
            { status: { $in: ['SUBMITTED', 'Submitted', 'Confirmed', 'ACCEPTED', 'PROCESSING', 'DISPATCHED', 'Out for Delivery'] } }
        ] };
        if (city) supplyQuery.city = textFilter(city);
        if (pincode) supplyQuery.pincode = filterCondition(pincode);
        if (state) supplyQuery.vendor = { $in: userIds };
        if (geofence) supplyQuery.$and = [{ pincode: { $in: [...new Set(areas.flatMap(area => area.pincodes || []))] } }];
        const [records, supplies] = await Promise.all([
            channel === 'B2B' ? [] : Order.find(scope.query('Order', orderQuery)).select('_id orderId status statusHistory createdAt totalAmount pickupLocation vendor rider riderDetails.phone orderType pickupExpectedDate pickupTriggerTime pickupStatus deliveryMode paymentStatus dueAmount priceBreakdown.platformFee').lean(),
            channel === 'B2C' ? [] : B2BOrder.find(scope.query('B2BOrder', supplyQuery)).select('_id supplier b2bOrderId status createdAt totalAmount paymentStatus platformFee escrowStatus').lean()
        ]);
        let orders = records;
        if (geofence) {
            const vendorIds = [...new Set(records.filter(order => order.orderType === 'Walk-In' && order.vendor).map(order => String(order.vendor)))];
            const vendors = await User.find({ _id: { $in: vendorIds } }).select('_id location shopDetails.location').lean();
            const points = new Map(vendors.map(vendor => [String(vendor._id), vendor.location || vendor.shopDetails?.location]));
            orders = records.filter(order => areas.some(area => pointInArea(order.orderType === 'Walk-In' ? points.get(String(order.vendor)) : order.pickupLocation, area)));
        }
        const metrics = dashboardMetrics(orders, supplies, period, now);
        const population = users.filter(user => (!geofence || areas.some(area => pointInArea(accountPoint(user), area))) && (channel !== 'B2C' || user.role !== 'Supplier') && (channel !== 'B2B' || user.role !== 'Customer'));
        const overview = dashboardOverview(orders, supplies, period, now);
        const paginate = rows => {
            const pages = Math.max(1, Math.ceil(rows.length / 20));
            const currentPage = Math.min(page, pages);
            return { total: rows.length, page: currentPage, pageSize: 20, pages, items: rows.slice((currentPage - 1) * 20, currentPage * 20) };
        };
        res.json({ success: true, scope: scope.metadata, measuredAt: now, period, data: {
            ...metrics, ...overview, supplierOverview: channel === 'B2C' ? { available: false } : supplierOverview(population, supplies, period), partnersAndClients: partnerBreakdown(population), delayedPickups: paginate(metrics.delayedPickups), unpaidDeliveries: paginate(metrics.unpaidDeliveries),
            geographyBasis: 'Service-area boundaries use stored pickup coordinates (vendor location for walk-ins). State, city and pincode filters use current account addresses for B2C; archived or unlocated accounts may be excluded. B2B uses stored city/pincode and vendor state.',
            refreshSeconds: 60
        } });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
