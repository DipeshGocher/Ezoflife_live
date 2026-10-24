import { getDashboardAnalytics as getLegacyDashboardAnalytics, getDashboardFilters as getLegacyDashboardFilters } from './legacyDashboardAnalyticsController.js';
import { isScopedAdmin } from '../utils/adminScope.js';
import { getOperationalDashboard } from './operationalDashboardController.js';
import { slaExceptions } from '../utils/operationalMetrics.js';
import { analyticsWindow, inWindow } from '../utils/analyticsWindow.js';
import { createAdminReportScope } from '../utils/adminReportScope.js';
import { canAccessAccount } from '../utils/adminScope.js';
import { filterCondition, textFilter } from '../utils/queryFilters.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import B2BOrder from '../models/B2BOrder.js';
import Ticket from '../models/Ticket.js';
import Feedback from '../models/Feedback.js';
import MasterService from '../models/MasterService.js';
import VendorMasterSupply from '../models/VendorMasterSupply.js';
import SupplierApplication from '../models/SupplierApplication.js';
import ServiceArea from '../models/ServiceArea.js';

export const getDashboardAnalytics = async (req, res) => {
    if (req.query.view === 'operational') return getOperationalDashboard(req, res);
    // Retain the expanded legacy response for existing clients; restricted admins
    // use the scoped queries below so no global analytics escape their service area.
    if (!isScopedAdmin(req) && !req.query.geofence) return getLegacyDashboardAnalytics(req, res);
    try {
        const { channel, state, city, pincode, geofence } = req.query;

        let period;
        try { period = analyticsWindow(req.query); }
        catch (error) { return res.status(400).json({ success: false, message: error.message }); }
        const { start, end } = period;
        const scope = await createAdminReportScope(req, ['User', 'Order', 'Ticket', 'Feedback', 'B2BOrder', 'SupplierApplication', 'VendorMasterSupply', 'ServiceArea']);

        // Resolve geofence boundary pincodes
        let geofencePincodes = [];
        if (geofence) {
            const areas = await ServiceArea.find(scope.query('ServiceArea', { areaName: filterCondition(geofence) }));
            geofencePincodes = [...new Set(areas.flatMap(area => area.pincodes || []))];
        }

        // Helper to construct dynamic queries for Users
        const buildUserQuery = (role, extra = {}) => {
            const q = { ...(role === 'User' ? { role: { $in: ['Customer', 'Vendor', 'Supplier'] } } : { role }), ...extra };
            const location = {};
            if (state) location.state = textFilter(state);
            if (city) location.city = textFilter(city);
            if (pincode) location.pincode = filterCondition(pincode);
            const conditions = [];
            if (Object.keys(location).length) {
                conditions.push({ $or: [
                    { addresses: { $elemMatch: location } },
                    Object.fromEntries(Object.entries(location).map(([key, value]) => [`shopDetails.${key}`, value])),
                    Object.fromEntries(Object.entries(location).map(([key, value]) => [`supplierDetails.${key}`, value]))
                ] });
            }
            if (geofence) {
                conditions.push({ $or: [
                    { 'addresses.pincode': { $in: geofencePincodes } },
                    { 'shopDetails.pincode': { $in: geofencePincodes } },
                    { 'supplierDetails.pincode': { $in: geofencePincodes } }
                ] });
            }
            if (conditions.length) q.$and = conditions;
            return q;
        };

        // Helper to construct dynamic queries for B2C Orders
        const buildOrderQuery = async (extra = {}) => {
            const q = { ...extra };


            if (channel === 'B2B') {
                q._id = null;
                return inWindow(q, start, end);
            }

            if (state || city || pincode || geofence) {
                const userQuery = buildUserQuery('Customer');
                const customerIds = await User.distinct('_id', scope.query('User', userQuery));
                q.customer = { $in: customerIds };
            }
            return inWindow(q, start, end);
        };

        // Helper to construct dynamic queries for B2B Orders
        const buildB2BOrderQuery = async (extra = {}) => {
            const q = { ...extra };


            if (channel === 'B2C') {
                q._id = null;
                return inWindow(q, start, end);
            }

            if (city) {
                q.city = textFilter(city);
            }
            if (pincode) {
                q.pincode = filterCondition(pincode);
            }
            if (geofence) {
                if (geofencePincodes.length) {
                    q.$and = [...(q.$and || []), { pincode: { $in: geofencePincodes } }];
                } else {
                    q._id = null;
                }
            }
            if (state) {
                const vendorQuery = buildUserQuery('Vendor');
                const vendorIds = await User.distinct('_id', scope.query('User', vendorQuery));
                q.vendor = { $in: vendorIds };
            }
            return inWindow(q, start, end);
        };

        // Helper to construct dynamic queries for Tickets
        const buildTicketQuery = async (extra = {}) => {
            const q = { ...extra };


            if (state || city || pincode || geofence) {
                const userQuery = buildUserQuery('Customer');
                const customerIds = await User.distinct('_id', scope.query('User', userQuery));
                q.customer = { $in: customerIds };
            }
            return inWindow(q, start, end);
        };

        // Helper to construct dynamic queries for Feedbacks
        const buildFeedbackQuery = async (extra = {}, window = { start, end }) => {
            const q = { ...extra };


            if (state || city || pincode || geofence) {
                const userQuery = buildUserQuery('Customer');
                const customerIds = await User.distinct('_id', scope.query('User', userQuery));
                q.user = { $in: customerIds };
            }
            return inWindow(q, window.start, window.end);
        };

        // ----------------------------------------------------
        // MODULE 2.1: CUSTOMER ANALYTICS (Parallelized)
        // ----------------------------------------------------
        const spanMs = Math.max(24 * 60 * 60 * 1000, end.getTime() - start.getTime());
        const priorStart = new Date(start.getTime() - spanMs);
        const priorEnd = new Date(start.getTime());

        const customerQuery = buildUserQuery('Customer');
        const individualQuery = buildUserQuery('Customer', { customerType: { $ne: 'retail' } });
        const businessQuery = buildUserQuery('Customer', { customerType: 'retail' });
        const recentOrderQuery = await buildOrderQuery({ createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } });
        const recentRegQuery = inWindow(buildUserQuery('Customer', { createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }), start, end);

        const priorCustomerQuery = buildUserQuery('Customer');
        priorCustomerQuery.createdAt = { $gte: priorStart, $lt: priorEnd };

        const [
            totalCustomers,
            individualCustomers,
            businessCustomers,
            activeCustomerIds,
            recentRegUsers,
            priorCustomersCount,
            currentRegistrations
        ] = await Promise.all([
            User.countDocuments(scope.query('User', customerQuery)),
            User.countDocuments(scope.query('User', individualQuery)),
            User.countDocuments(scope.query('User', businessQuery)),
            Order.distinct('customer', scope.query('Order', recentOrderQuery)),
            User.find(scope.query('User', recentRegQuery)).select('_id').lean(),
            User.countDocuments(scope.query('User', priorCustomerQuery)),
            User.countDocuments(scope.query('User', inWindow(customerQuery, start, end)))
        ]);

        const churnRiskCount = Math.max(0, totalCustomers - activeCustomerIds.length);

        let customerTrendMoM = '0%';
        if (priorCustomersCount > 0) {
            const diff = ((currentRegistrations - priorCustomersCount) / priorCustomersCount) * 100;
            customerTrendMoM = (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%';
        } else if (currentRegistrations > 0) {
            customerTrendMoM = '+100%';
        }

        // Vectorized onboarding friction check (no N+1 loop)
        const recentRegCustomerIds = recentRegUsers.map(u => u._id);
        const orderedCustomerIds = recentRegCustomerIds.length > 0 
            ? await Order.distinct('customer', scope.query('Order', { customer: { $in: recentRegCustomerIds } }))
            : [];
        const onboardingFrictionCount = Math.max(0, recentRegCustomerIds.length - orderedCustomerIds.length);

        // ----------------------------------------------------
        // MODULE 2.2: VENDOR PERFORMANCE (Parallelized)
        // ----------------------------------------------------
        const vendorQuery = buildUserQuery('Vendor');
        const activeVendorOrderQuery = await buildOrderQuery({ status: { $ne: 'ORDER_PLACED' }, createdAt: { $gte: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) } });
        const feedbackQuery = await buildFeedbackQuery({ vendor: { $exists: true } });
        const b2bOrdersQuery = await buildB2BOrderQuery();
        const b2bRecentOrdersQuery = await buildB2BOrderQuery({ createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } });

        const [
            totalVendors,
            localVendors,
            proprietorshipVendors,
            partnershipVendors,
            pvtLtdVendors,
            franchiseVendors,
            activeVendorIds,
            feedbacks,
            b2bOrderVendors,
            b2bRecentOrderVendors,
        ] = await Promise.all([
            User.countDocuments(scope.query('User', vendorQuery)),
            User.countDocuments(scope.query('User', buildUserQuery('Vendor', { businessType: { $in: ['', null] } }))),
            User.countDocuments(scope.query('User', buildUserQuery('Vendor', { businessType: 'Proprietorship' }))),
            User.countDocuments(scope.query('User', buildUserQuery('Vendor', { businessType: 'Partnership' }))),
            User.countDocuments(scope.query('User', buildUserQuery('Vendor', { businessType: 'Pvt Ltd' }))),
            User.countDocuments(scope.query('User', buildUserQuery('Vendor', { businessType: 'Franchise' }))),
            Order.distinct('vendor', scope.query('Order', activeVendorOrderQuery)),
            Feedback.find(scope.query('Feedback', feedbackQuery)).populate('vendor', 'displayName phone').lean(),
            B2BOrder.distinct('vendor', scope.query('B2BOrder', b2bOrdersQuery)),
            B2BOrder.distinct('vendor', scope.query('B2BOrder', b2bRecentOrdersQuery)),
        ]);

        const dormantVendorsCount = Math.max(0, totalVendors - activeVendorIds.length);
        const neverOrderedB2B = Math.max(0, totalVendors - b2bOrderVendors.length);
        const dormancy30DaysB2B = Math.max(0, totalVendors - b2bRecentOrderVendors.length);

        // Feedback Outliers
        const vendorRatings = {};
        feedbacks.forEach(f => {
            if (!f.vendor) return;
            const id = f.vendor._id.toString();
            if (!vendorRatings[id]) {
                vendorRatings[id] = { name: f.vendor.displayName || 'Vendor', count: 0, sum: 0 };
            }
            vendorRatings[id].count++;
            vendorRatings[id].sum += f.rating;
        });

        const vendorLeaderboard = Object.keys(vendorRatings).map(id => ({
            id,
            name: vendorRatings[id].name,
            rating: Number((vendorRatings[id].sum / vendorRatings[id].count).toFixed(1)),
            count: vendorRatings[id].count
        })).sort((a, b) => b.rating - a.rating);

        const topVendors = vendorLeaderboard.slice(0, 5);
        const bottomVendors = [...vendorLeaderboard].reverse().slice(0, 5);

        // ----------------------------------------------------
        // MODULE 2.3 & 2.4: SUPPLIER & FINANCIAL INTELLIGENCE (Parallelized)
        // ----------------------------------------------------
        const supplierQuery = buildUserQuery('Supplier');
        const wholesalerQuery = buildUserQuery('Supplier', { 'supplierDetails.businessName': { $regex: /wholesaler|distributor/i } });
        const orderQ = await buildOrderQuery({ status: { $ne: 'CANCELLED' } });
        const b2bOrderQ = await buildB2BOrderQuery({ status: { $nin: ['CANCELLED', 'REJECTED'] } });
        const walletQuery = buildUserQuery('Customer');
        const refundOrderQ = await buildOrderQuery({ paymentStatus: 'Refunded' });
        const refundB2BOrderQ = await buildB2BOrderQuery({ escrowStatus: 'Refunded' });

        const [
            totalSuppliers,
            wholesalersCount,
            b2cRevenues,
            b2bRevenues,
            walletAgg,
            monthlyB2CAgg,
            monthlyB2BAgg,
            b2cRefundAgg,
            b2bRefundAgg,
            supplierDeliveriesAgg,
            allSuppliersList
        ] = await Promise.all([
            User.countDocuments(scope.query('User', supplierQuery)),
            User.countDocuments(scope.query('User', wholesalerQuery)),
            Order.aggregate([{ $match: scope.query('Order') }, ...[
                { $match: orderQ },
                { $group: { _id: null, total: { $sum: '$totalAmount' }, platform: { $sum: '$priceBreakdown.platformFee' }, logistics: { $sum: '$priceBreakdown.logisticsFee' } } }
            ]]),
            B2BOrder.aggregate([{ $match: scope.query('B2BOrder') }, ...[
                { $match: b2bOrderQ },
                { $group: { _id: null, total: { $sum: '$totalAmount' }, platform: { $sum: '$platformFee' } } }
            ]]),
            User.aggregate([{ $match: scope.query('User') }, ...[
                { $match: walletQuery },
                { $group: { _id: null, total: { $sum: '$walletBalance' } } }
            ]]),
            Order.aggregate([{ $match: scope.query('Order') }, ...[
                { $match: orderQ },
                { $group: {
                    _id: { year: { $year: { date: '$createdAt', timezone: 'Asia/Kolkata' } }, month: { $month: { date: '$createdAt', timezone: 'Asia/Kolkata' } } },
                    revenue: { $sum: '$totalAmount' },
                    platform: { $sum: '$priceBreakdown.platformFee' },
                    logistics: { $sum: '$priceBreakdown.logisticsFee' }
                }},
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ]]),
            B2BOrder.aggregate([{ $match: scope.query('B2BOrder') }, ...[
                { $match: b2bOrderQ },
                { $group: {
                    _id: { year: { $year: { date: '$createdAt', timezone: 'Asia/Kolkata' } }, month: { $month: { date: '$createdAt', timezone: 'Asia/Kolkata' } } },
                    revenue: { $sum: '$totalAmount' },
                    platform: { $sum: '$platformFee' }
                }},
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ]]),
            Order.aggregate([{ $match: scope.query('Order') }, ...[
                { $match: refundOrderQ },
                { $group: { _id: null, total: { $sum: '$totalAmount' } } }
            ]]),
            B2BOrder.aggregate([{ $match: scope.query('B2BOrder') }, ...[
                { $match: refundB2BOrderQ },
                { $group: { _id: null, total: { $sum: '$totalAmount' } } }
            ]]),
            B2BOrder.aggregate([{ $match: scope.query('B2BOrder') }, ...[
                { $match: await buildB2BOrderQuery({ status: { $in: ['DELIVERED', 'Delivered', 'SETTLED', 'Settled'] } }) },
                { $group: { _id: '$supplier', count: { $sum: 1 } } }
            ]]),
            User.find(scope.query('User', supplierQuery)).select('_id supplierDetails').lean()
        ]);

        const manufacturersCount = Math.max(0, totalSuppliers - wholesalersCount);
        const b2cRev = b2cRevenues[0]?.total || 0;
        const b2bRev = b2bRevenues[0]?.total || 0;
        const grossRevenue = (channel === 'B2B') ? b2bRev : (channel === 'B2C') ? b2cRev : (b2cRev + b2bRev);

        const b2cPlatform = b2cRevenues[0]?.platform || 0;
        const b2bPlatform = b2bRevenues[0]?.platform || 0;
        const netProfit = (channel === 'B2B') ? b2bPlatform : (channel === 'B2C') ? b2cPlatform : (b2cPlatform + b2bPlatform);

        const logisticsFee = (channel === 'B2B') ? 0 : (b2cRevenues[0]?.logistics || 0);
        const vendorPayouts = Math.max(0, grossRevenue - netProfit - logisticsFee);
        const walletLiability = walletAgg[0]?.total || 0;

        const b2cRefunds = b2cRefundAgg[0]?.total || 0;
        const b2bRefunds = b2bRefundAgg[0]?.total || 0;
        const totalRefunds = (channel === 'B2B') ? b2bRefunds : (channel === 'B2C') ? b2cRefunds : (b2cRefunds + b2bRefunds);

        // Merge real monthly aggregations
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const dynamicMonthlyTrend = [];
        const months = [...new Set([...monthlyB2CAgg, ...monthlyB2BAgg].map(item => `${item._id.year}-${String(item._id.month).padStart(2, '0')}`))].sort();
        for (const key of months) {
            const [y, m] = key.split('-').map(Number);
            const label = `${monthNames[m - 1]} ${y}`;
            const b2cItem = monthlyB2CAgg.find(item => item._id.year === y && item._id.month === m);
            const b2bItem = monthlyB2BAgg.find(item => item._id.year === y && item._id.month === m);

            const b2cMRev = b2cItem?.revenue || 0;
            const b2bMRev = b2bItem?.revenue || 0;
            const b2cMPlat = b2cItem?.platform || 0;
            const b2bMPlat = b2bItem?.platform || 0;
            const logM = channel === 'B2B' ? 0 : (b2cItem?.logistics || 0);

            const revM = (channel === 'B2B') ? b2bMRev : (channel === 'B2C') ? b2cMRev : (b2cMRev + b2bMRev);
            const profM = (channel === 'B2B') ? b2bMPlat : (channel === 'B2C') ? b2cMPlat : (b2cMPlat + b2bMPlat);
            const payM = Math.max(0, revM - profM - logM);

            dynamicMonthlyTrend.push({
                month: label,
                Revenue: Math.round(revM),
                Payouts: Math.round(payM),
                Logistics: Math.round(logM),
                Profit: Math.round(profM)
            });
        }

        // Revenue MoM calculation from real monthly history
        const curMRev = dynamicMonthlyTrend.at(-1)?.Revenue || 0;
        const prevMRev = dynamicMonthlyTrend.at(-2)?.Revenue || 0;
        let revenueTrendMoM = '0%';
        if (prevMRev > 0) {
            const diff = ((curMRev - prevMRev) / prevMRev) * 100;
            revenueTrendMoM = (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%';
        } else if (curMRev > 0) {
            revenueTrendMoM = '+100%';
        }

        // Dynamic Supplier Scatter Data
        const supplierDeliveriesMap = {};
        supplierDeliveriesAgg.forEach(item => {
            if (item._id) supplierDeliveriesMap[item._id.toString()] = item.count;
        });
        const dynamicSupplierScatter = allSuppliersList.map(s => ({
            deliveries: supplierDeliveriesMap[s._id.toString()] || 0,
            rating: Number.isFinite(s.supplierDetails?.rating) ? Number(s.supplierDetails.rating.toFixed(1)) : null
        })).filter(supplier => supplier.rating !== null);

        // ----------------------------------------------------
        // MODULE 2.5 & 2.6: CATALOGS (Parallelized)
        // ----------------------------------------------------
        const [
            totalServices,
            inactiveServices,
            pendingCatalogReviews,
            totalB2BProducts,
            inactiveB2BProducts,
            pendingMaterialReviews
        ] = await Promise.all([
            MasterService.countDocuments({ isActive: true }),
            MasterService.countDocuments({ isActive: false }),
            User.countDocuments(scope.query('User', buildUserQuery('Vendor', { 'shopDetails.services.status': 'pending' }))),
            VendorMasterSupply.countDocuments(scope.query('VendorMasterSupply')),
            VendorMasterSupply.countDocuments(scope.query('VendorMasterSupply', { isActive: 'n' })),
            SupplierApplication.countDocuments(scope.query('SupplierApplication', { status: 'pending' }))
        ]);

        // ----------------------------------------------------
        // MODULE 2.7: B2C ORDER LIFECYCLE (Parallelized)
        // ----------------------------------------------------
        const mainOrderQuery = await buildOrderQuery();
        const acceptedOrderQuery = await buildOrderQuery({ status: { $nin: ['ORDER_PLACED', 'CANCELLED'] } });
        const logisticsBouncesQuery = await buildOrderQuery({ 'shipmentDetails.lastStatus': 'rejected' });
        const immediateTimeoutsQuery = await buildOrderQuery({ status: 'ORDER_PLACED', createdAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } });
        const criticalTimeoutsQuery = await buildOrderQuery({ status: 'ORDER_PLACED', createdAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
        const inProgressQ = await buildOrderQuery({ status: 'PROCESSING' });
        const readyForDispatchQ = await buildOrderQuery({ status: 'READY_FOR_DISPATCH' });
        const outboundLogisticsQ = await buildOrderQuery({ status: 'IN_TRANSIT' });
        const reverseLogisticsQ = await buildOrderQuery({ status: 'OUT_FOR_DELIVERY' });

        const pickupViolationsQ = await buildOrderQuery({ pickupStatus: { $in: ['failed', 'rescheduled'] } });
        const dropoffViolationsQ = await buildOrderQuery({ deliveryStatus: 'failed' });
        const slaOrders = await Order.find(scope.query('Order', mainOrderQuery)).select('_id orderId status statusHistory createdAt pickupExpectedDate pickupTriggerTime pickupStatus orderType deliveryMode paymentStatus dueAmount').lean();
        const confirmedSla = slaOrders.flatMap(order => slaExceptions(order));

        const [
            totalSubmitted,
            totalAccepted,
            logisticsBounces,
            immediateTimeouts,
            criticalTimeouts,
            inProgress,
            readyForDispatch,
            outboundLogistics,
            reverseLogistics,
            pickupViolations,
            dropoffViolations,
            vendorSlaViolations
        ] = await Promise.all([
            Order.countDocuments(scope.query('Order', mainOrderQuery)),
            Order.countDocuments(scope.query('Order', acceptedOrderQuery)),
            Order.countDocuments(scope.query('Order', logisticsBouncesQuery)),
            Order.countDocuments(scope.query('Order', immediateTimeoutsQuery)),
            Order.countDocuments(scope.query('Order', criticalTimeoutsQuery)),
            Order.countDocuments(scope.query('Order', inProgressQ)),
            Order.countDocuments(scope.query('Order', readyForDispatchQ)),
            Order.countDocuments(scope.query('Order', outboundLogisticsQ)),
            Order.countDocuments(scope.query('Order', reverseLogisticsQ)),
            Order.countDocuments(scope.query('Order', pickupViolationsQ)),
            Order.countDocuments(scope.query('Order', dropoffViolationsQ)),
            Promise.resolve(confirmedSla.filter(alert => alert.rule === 'processing_24h').length)
        ]);

        // ----------------------------------------------------
        // MODULE 2.8: B2B ORDER LIFECYCLE (Real MongoDB Counts)
        // ----------------------------------------------------
        const b2bTotalPlacedQ = await buildB2BOrderQuery();
        const b2bAcceptedQ = await buildB2BOrderQuery({ status: { $in: ['ACCEPTED', 'Confirmed', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'Settled'] } });
        const b2bInProgressQ = await buildB2BOrderQuery({ status: { $in: ['PROCESSING'] } });
        const b2bDispatchedQ = await buildB2BOrderQuery({ status: { $in: ['DISPATCHED', 'Out for Delivery'] } });
        const b2bDeliveredQ = await buildB2BOrderQuery({ status: { $in: ['DELIVERED', 'Settled'] } });
        const b2bCancelledQ = await buildB2BOrderQuery({ status: { $in: ['CANCELLED', 'REJECTED'] } });

        const b2bSla1hQ = await buildB2BOrderQuery({ 
            status: { $in: ['SUBMITTED', 'Submitted'] }, 
            createdAt: { $lt: new Date(Date.now() - 60 * 60 * 1000) } 
        });
        const b2bSla48hQ = await buildB2BOrderQuery({ 
            status: { $in: ['PROCESSING', 'ACCEPTED', 'Confirmed'] }, 
            createdAt: { $lt: new Date(Date.now() - 48 * 60 * 60 * 1000) } 
        });
        const b2bLateQ = await buildB2BOrderQuery({ 
            deliveryDate: { $lt: new Date() }, 
            status: { $nin: ['DELIVERED', 'Delivered', 'SETTLED', 'Settled', 'CANCELLED', 'Cancelled', 'REJECTED'] } 
        });
        const b2bCancelledSupplierQ = await buildB2BOrderQuery({ status: { $in: ['REJECTED', 'Rejected'] } });
        const b2bCancelledVendorQ = await buildB2BOrderQuery({ status: { $in: ['CANCELLED', 'Cancelled'] } });

        const [
            b2bPlaced,
            b2bAccepted,
            b2bProcessing,
            b2bDispatched,
            b2bDelivered,
            b2bCancelled,
            b2bSla1h,
            b2bSla48h,
            b2bLate,
            b2bCancelledSupplier,
            b2bCancelledVendor
        ] = await Promise.all([
            B2BOrder.countDocuments(scope.query('B2BOrder', b2bTotalPlacedQ)),
            B2BOrder.countDocuments(scope.query('B2BOrder', b2bAcceptedQ)),
            B2BOrder.countDocuments(scope.query('B2BOrder', b2bInProgressQ)),
            B2BOrder.countDocuments(scope.query('B2BOrder', b2bDispatchedQ)),
            B2BOrder.countDocuments(scope.query('B2BOrder', b2bDeliveredQ)),
            B2BOrder.countDocuments(scope.query('B2BOrder', b2bCancelledQ)),
            B2BOrder.countDocuments(scope.query('B2BOrder', b2bSla1hQ)),
            B2BOrder.countDocuments(scope.query('B2BOrder', b2bSla48hQ)),
            B2BOrder.countDocuments(scope.query('B2BOrder', b2bLateQ)),
            B2BOrder.countDocuments(scope.query('B2BOrder', b2bCancelledSupplierQ)),
            B2BOrder.countDocuments(scope.query('B2BOrder', b2bCancelledVendorQ))
        ]);

        const b2bOnTime = Math.max(0, b2bDelivered - b2bLate);

        // ----------------------------------------------------
        // MODULE 2.9 & 2.10: HELPDESK & FEEDBACK SENTIMENT (Parallelized)
        // ----------------------------------------------------
        const priorFeedbackQ = await buildFeedbackQuery({
            createdAt: { $gte: priorStart, $lt: priorEnd }
        }, { start: priorStart, end: priorEnd });

        const [
            openTickets,
            progressTickets,
            resolvedTickets,
            closedTickets,
            priorFeedbacks
        ] = await Promise.all([
            Ticket.countDocuments(scope.query('Ticket', await buildTicketQuery({ status: 'Open' }))),
            Ticket.countDocuments(scope.query('Ticket', await buildTicketQuery({ status: 'In Progress' }))),
            Ticket.countDocuments(scope.query('Ticket', await buildTicketQuery({ status: 'Resolved' }))),
            Ticket.countDocuments(scope.query('Ticket', await buildTicketQuery({ status: 'Closed' }))),
            Feedback.find(scope.query('Feedback', priorFeedbackQ)).select('rating').lean()
        ]);

        let avgRating = 0;
        if (feedbacks.length > 0) {
            let totalRating = 0;
            feedbacks.forEach(f => { totalRating += f.rating; });
            avgRating = Number((totalRating / feedbacks.length).toFixed(1));
        }

        let feedbackTrendMoM = '0.0';
        if (priorFeedbacks.length > 0 && feedbacks.length > 0) {
            const priorAvg = priorFeedbacks.reduce((sum, f) => sum + (f.rating || 0), 0) / priorFeedbacks.length;
            const diff = avgRating - priorAvg;
            feedbackTrendMoM = (diff >= 0 ? '+' : '') + diff.toFixed(1);
        }

        // Dynamic Feedback Sentiment Extraction from real customer submissions
        const knownTags = [
            'Crisp Folding', 'Fresh Fragrance', 'On-Time Delivery', 'Friendly Rider', 
            'Polite Rider', 'Excellent Wash', 'Fast Service', 'Neat Packaging',
            'Late Pickup', 'Damp Clothes', 'High Delivery Fee', 'Delayed Response',
            'Improper Crease', 'Rude Rider', 'Missing Clothes', 'Poor Wash'
        ];

        const posCount = {};
        const critCount = {};

        feedbacks.forEach(f => {
            const text = (f.comment || '') + ' ' + (f.category || '');
            if (!text.trim()) return;

            if (f.rating >= 4) {
                knownTags.forEach(tag => {
                    if (new RegExp(tag, 'i').test(text)) {
                        posCount[tag] = (posCount[tag] || 0) + 1;
                    }
                });
                if (f.category && f.category !== 'Other' && f.category !== 'order') {
                    const catTag = f.category + ' Quality';
                    posCount[catTag] = (posCount[catTag] || 0) + 1;
                }
            } else {
                knownTags.forEach(tag => {
                    if (new RegExp(tag, 'i').test(text)) {
                        critCount[tag] = (critCount[tag] || 0) + 1;
                    }
                });
                if (f.category && f.category !== 'Other' && f.category !== 'order') {
                    const catTag = f.category + ' Issue';
                    critCount[catTag] = (critCount[catTag] || 0) + 1;
                }
            }
        });

        const dynamicPositiveKeywords = Object.entries(posCount)
            .sort((a, b) => b[1] - a[1])
            .map(e => e[0])
            .slice(0, 5);

        const dynamicCriticalKeywords = Object.entries(critCount)
            .sort((a, b) => b[1] - a[1])
            .map(e => e[0])
            .slice(0, 5);

        // ----------------------------------------------------
        // MODULE 2.10: PENDING PARTNER VERIFICATIONS
        // ----------------------------------------------------
        const [
            pendingVendorCount,
            pendingSupplierCount
        ] = await Promise.all([
            User.countDocuments(scope.query('User', {
                role: 'Vendor',
                $or: [
                    { onboardingStage: { $in: ['INITIAL_REVIEW', 'FINAL_REVIEW', 'DOCUMENTS_SUBMITTED', 'PENDING'] } },
                    { status: { $in: ['pending', 'revision_required'] } }
                ],
                $nor: [
                    { status: 'approved', onboardingStage: 'COMPLETED' },
                    { status: 'approved', onboardingStage: { $in: [null, undefined, ''] } }
                ]
            })),
            SupplierApplication.countDocuments(scope.query('SupplierApplication', {
                status: { $in: ['Pending', 'pending', 'Revision_Required'] },
                onboardingStage: { $ne: 'Onboarded' }
            }))
        ]);

        // Compile all analytics response (pure database numbers)
        res.status(200).json({
            success: true,
            scope: scope.metadata,
            measuredAt: new Date().toISOString(),
            period: { start, end, timezone: period.timezone },
            definitions: { grossRevenue: 'Booked non-cancelled order value, not cash collected', netProfit: 'Recorded platform fees, not accounting profit', refunds: 'Value of orders marked refunded; partial transfers require reconciliation', populations: 'Current geographically eligible accounts, independent of registration date', monthlyTrend: 'Same channel, geography, permission and booking window as totals' },
            data: {
                channel: channel || 'All',
                pendingVerifications: {
                    total: pendingVendorCount + pendingSupplierCount,
                    vendors: pendingVendorCount,
                    suppliers: pendingSupplierCount
                },
                monthlyTrend: dynamicMonthlyTrend,
                customerAnalytics: {
                    totalCustomers: totalCustomers,
                    individualCount: individualCustomers,
                    businessCount: businessCustomers,
                    churnRisk: churnRiskCount,
                    onboardingFriction: onboardingFrictionCount,
                    trendMoM: customerTrendMoM
                },
                vendorPerformance: {
                    totalVendors: totalVendors,
                    cohorts: {
                        local: localVendors,
                        proprietorship: proprietorshipVendors,
                        partnership: partnershipVendors,
                        pvtLtd: pvtLtdVendors,
                        franchise: franchiseVendors
                    },
                    dormantCount: dormantVendorsCount,
                    topVendors: topVendors,
                    bottomVendors: bottomVendors,
                    neverOrderedB2B: neverOrderedB2B,
                    dormancy30DaysB2B: dormancy30DaysB2B,
                },
                supplierAnalytics: {
                    totalSuppliers: totalSuppliers,
                    wholesalers: wholesalersCount,
                    manufacturers: manufacturersCount,
                    scatterData: dynamicSupplierScatter
                },
                financials: {
                    grossRevenue: grossRevenue,
                    b2cRevenue: b2cRev,
                    b2bRevenue: b2bRev,
                    vendorPayouts: vendorPayouts,
                    logisticsPayouts: logisticsFee,
                    netProfit: netProfit,
                    refunds: totalRefunds,
                    walletLiability: walletLiability,
                    trendMoM: revenueTrendMoM
                },
                catalogB2C: {
                    totalServices: totalServices,
                    inactiveServices: inactiveServices,
                    pendingReviews: pendingCatalogReviews
                },
                catalogB2B: {
                    totalProducts: totalB2BProducts,
                    inactiveProducts: inactiveB2BProducts,
                    pendingReviews: pendingMaterialReviews
                },
                orderLifecycleB2C: {
                    totalSubmitted: totalSubmitted,
                    totalAccepted: totalAccepted,
                    logisticsBounces: logisticsBounces,
                    immediateTimeouts: immediateTimeouts,
                    criticalTimeouts: criticalTimeouts,
                    inProgress: inProgress,
                    readyForDispatch: readyForDispatch,
                    outboundLogistics: outboundLogistics,
                    reverseLogistics: reverseLogistics,
                    sla: { pickup2h: confirmedSla.filter(alert => alert.rule === 'pickup_2h').length, processing24h: confirmedSla.filter(alert => alert.rule === 'processing_24h').length, unpaidDelivery2h: confirmedSla.filter(alert => alert.rule === 'unpaid_delivery_2h').length },
                    violations: {
                        pickup: pickupViolations,
                        dropoff: dropoffViolations,
                        vendorSla: vendorSlaViolations
                    }
                },
                orderLifecycleB2B: {
                    totalPlaced: b2bPlaced,
                    totalAccepted: b2bAccepted,
                    inProgress: b2bProcessing,
                    dispatched: b2bDispatched,
                    delivered: b2bDelivered,
                    cancelled: b2bCancelled,
                    slaBreach1h: b2bSla1h,
                    slaBreach48h: b2bSla48h,
                    onTime: b2bOnTime,
                    late: b2bLate,
                    cancellations: { supplier: b2bCancelledSupplier, vendor: b2bCancelledVendor }
                },
                helpdesk: {
                    open: openTickets,
                    inProgress: progressTickets,
                    resolved: resolvedTickets,
                    closed: closedTickets
                },
                feedbackSentiment: {
                    averageRating: avgRating,
                    trendMoM: feedbackTrendMoM,
                    positiveKeywords: dynamicPositiveKeywords,
                    criticalKeywords: dynamicCriticalKeywords
                }
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const getDashboardFilters = async (req, res) => {
    if (!isScopedAdmin(req)) return getLegacyDashboardFilters(req, res);
    try {
        const scope = await createAdminReportScope(req, ['User', 'ServiceArea']);
        const capitalize = (str) => {
            if (!str) return '';
            return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        };

        const stateCityMap = {};
        const cityPincodeMap = {};
        const geofenceMap = {};
        const allStates = new Set();

        // 1. Process ServiceAreas (Geofences)
        const serviceAreas = await ServiceArea.find(scope.query('ServiceArea', { isActive: true })).lean();
        for (const area of serviceAreas) {
            if (!area.city) continue;
            const normalizedCity = capitalize(area.city.trim());
            if (!cityPincodeMap[normalizedCity]) cityPincodeMap[normalizedCity] = new Set();
            if (area.pincodes) {
                area.pincodes.forEach(p => {
                    if (p) cityPincodeMap[normalizedCity].add(p.trim());
                });
            }

            if (!geofenceMap[normalizedCity]) geofenceMap[normalizedCity] = new Set();
            if (area.areaName) {
                geofenceMap[normalizedCity].add(area.areaName);
            }
        }

        // 2. Process Users (Customers, Vendors, Suppliers)
        const users = await User.find(scope.query('User', { role: { $in: ['Customer', 'Vendor', 'Supplier'] } })).lean();
        for (const u of users) {
            if (u.addresses) {
                for (const addr of u.addresses) {
                    if (scope.scoped && !await canAccessAccount(req, { role: 'Customer', addresses: [addr] })) continue;
                    if (addr.state && addr.city) {
                        const s = capitalize(addr.state.trim());
                        const c = capitalize(addr.city.trim());
                        allStates.add(s);
                        if (!stateCityMap[s]) stateCityMap[s] = new Set();
                        stateCityMap[s].add(c);

                        if (addr.pincode) {
                            if (!cityPincodeMap[c]) cityPincodeMap[c] = new Set();
                            cityPincodeMap[c].add(addr.pincode.trim());
                        }
                    }
                }
            }
            const details = u.role === 'Supplier' ? u.supplierDetails : u.shopDetails;
            if (details && details.city && details.state) {
                const s = capitalize(details.state.trim());
                const c = capitalize(details.city.trim());
                allStates.add(s);
                if (!stateCityMap[s]) stateCityMap[s] = new Set();
                stateCityMap[s].add(c);

                if (details.pincode) {
                    if (!cityPincodeMap[c]) cityPincodeMap[c] = new Set();
                    cityPincodeMap[c].add(details.pincode.trim());
                }
            }
        }

        // Format mapping response
        const formattedStateCityMap = {};
        const formattedCityPincodeMap = {};
        const formattedGeofenceMap = {};

        Object.keys(stateCityMap).forEach(s => {
            formattedStateCityMap[s] = Array.from(stateCityMap[s]).sort();
        });
        Object.keys(cityPincodeMap).forEach(c => {
            formattedCityPincodeMap[c] = Array.from(cityPincodeMap[c]).sort();
        });
        Object.keys(geofenceMap).forEach(c => {
            formattedGeofenceMap[c] = Array.from(geofenceMap[c]).sort();
        });

        res.status(200).json({
            success: true,
            scope: scope.metadata,
            data: {
                states: Array.from(allStates).sort(),
                stateCityMap: formattedStateCityMap,
                cityPincodeMap: formattedCityPincodeMap,
                geofenceMap: formattedGeofenceMap
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
