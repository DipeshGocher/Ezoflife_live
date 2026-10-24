export const scopedAnalytics = {
    success: true,
    scope: { type: 'assigned_service_areas', areas: ['Allowed'] },
    measuredAt: '2026-10-24T04:30:00.000Z',
    data: {
        supplierOverview: { available: true, totalSuppliers: 2, activeSuppliers: 2, activeOrders: 1, bookedOrders: 1, completedOrders: 0, cancelledOrders: 0, bookedValue: 200, types: [{ name: 'Supplier', count: 1 }, { name: 'Distributor/Wholesaler', count: 1 }], rows: [{ id: 'supplier-one', name: 'Actual Wholesale Supplier', type: 'Supplier', bookedOrders: 1, activeOrders: 1, completedOrders: 0, cancelledOrders: 0, bookedValue: 200 }, { id: 'supplier-two', name: 'Regional Distributor', type: 'Distributor/Wholesaler', bookedOrders: 0, activeOrders: 0, completedOrders: 0, cancelledOrders: 0, bookedValue: 0 }], rowCount: 2, other: { bookedOrders: 0, activeOrders: 0, completedOrders: 0, cancelledOrders: 0, bookedValue: 0 } },
        transactions: { total: 867, customerValue: 667, supplyValue: 200, customerOrders: 4, supplyOrders: 1 },
        financialOverview: { paidOrderValue: 600, customerOutstanding: 67, supplyPendingValue: 200, platformFees: 45, refundMarkedValue: 0, refundMarkedOrders: 0 },
        partnersAndClients: { total: 15, clients: 10, vendors: 3, suppliers: 2, clientTypes: [{ name: 'Individual clients', count: 8 }, { name: 'Business clients', count: 2 }], vendorTypes: [{ name: 'Proprietorship', count: 2 }, { name: 'Partnership', count: 1 }], supplierTypes: [{ name: 'Manufacturer', count: 1 }, { name: 'Distributor/Wholesaler', count: 1 }] },
        orderTimeline: { total: 2, items: [{ key: 'timeline-1', orderId: '600000000000000000000001', orderNumber: '#ON-101', channel: 'customer', status: 'PROCESSING', at: '2026-10-24T04:00:00Z' }, { key: 'timeline-2', orderId: '600000000000000000000002', orderNumber: '#ON-102', channel: 'customer', status: 'ORDER_BOOKED', at: '2026-10-24T03:00:00Z' }] },
        charts: {
            gmvTrend: { granularity: 'day', points: [78, 131, 96, 174, 87, 143, 158].map((amount, i) => ({ at: `2026-10-${18 + i}T00:00:00+05:30`, amount, orders: 2 })) },
            activeStages: [{ name: 'New & accepted', b2c: 1, b2b: 1 }, { name: 'Processing', b2c: 2, b2b: 0 }, { name: 'Ready', b2c: 1, b2b: 0 }, { name: 'In transit', b2c: 0, b2b: 0 }]
        },
        activeOrders: { total: 5, b2c: 4, b2b: 1 },
        ridersOnTrips: { count: 0, recordedTrips: 0, unidentifiedTrips: 0 },
        gmv: { today: 158, selectedPeriod: 867, definition: 'Booked order value, not cash collected.' },
        delayedPickups: { total: 0, page: 1, pages: 1, items: [] },
        unpaidDeliveries: { total: 0, page: 1, pages: 1, items: [] },
        pendingVerifications: { total: 0, vendors: 0, suppliers: 0 }, monthlyTrend: [],
        customerAnalytics: { totalCustomers: 1, individualCount: 1, businessCount: 0, churnRisk: 0, onboardingFriction: 0, trendMoM: '0%' },
        vendorPerformance: { totalVendors: 1, cohorts: { local: 1, proprietorship: 0, partnership: 0, pvtLtd: 0, franchise: 0 }, dormantCount: 0, topVendors: [], bottomVendors: [], neverOrderedB2B: 0, dormancy30DaysB2B: 0 },
        supplierAnalytics: { totalSuppliers: 1, wholesalers: 0, manufacturers: 1, scatterData: [] },
        financials: { grossRevenue: 867, b2cRevenue: 667, b2bRevenue: 200, vendorPayouts: 100, logisticsPayouts: 10, netProfit: 5, refunds: 0, walletLiability: 0, trendMoM: '0%' },
        catalogB2C: { totalServices: 1, inactiveServices: 1, pendingReviews: 0 }, catalogB2B: { totalProducts: 2, inactiveProducts: 1, pendingReviews: 0 },
        orderLifecycleB2C: { totalSubmitted: 4, totalAccepted: 2, logisticsBounces: 0, immediateTimeouts: 0, criticalTimeouts: 0, inProgress: 1, readyForDispatch: 1, outboundLogistics: 0, reverseLogistics: 0, violations: { pickup: 0, dropoff: 0, vendorSla: 0 } },
        orderLifecycleB2B: { totalPlaced: 1, totalAccepted: 0, inProgress: 0, dispatched: 0, delivered: 0, cancelled: 0, slaBreach1h: 0, slaBreach48h: 0, onTime: 0, late: 0, cancellations: { supplier: 0, vendor: 0 } },
        helpdesk: { open: 2, inProgress: 0, resolved: 0, closed: 0 },
        feedbackSentiment: { averageRating: 5, trendMoM: '0.0', positiveKeywords: [], criticalKeywords: [] }
    }
};
