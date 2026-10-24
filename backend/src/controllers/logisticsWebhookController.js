import crypto from 'crypto';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import { getLogisticsProvider, DeliveryStatus } from '../services/logistics/index.js';

/**
 * Delivery status webhook.
 *
 * Providers retry on any non-2xx and will eventually disable a webhook that
 * keeps failing, so this endpoint returns 200 for anything it has safely
 * received — including payloads it cannot map. Genuine rejections (a bad
 * secret) still return 401, because those must not be silently accepted.
 */

/** Which of our order statuses each delivery state implies, per leg. */
const ORDER_STATUS_FOR = {
    PICKUP: {
        [DeliveryStatus.PARTNER_ASSIGNED]: 'PICKUP_ASSIGNED',
        [DeliveryStatus.ARRIVED_AT_PICKUP]: 'RIDER_ARRIVING',
        [DeliveryStatus.PICKED_UP]: 'IN_TRANSIT',
        [DeliveryStatus.IN_TRANSIT]: 'IN_TRANSIT',
        [DeliveryStatus.DELIVERED]: 'RECEIVED_BY_VENDOR'
    },
    RETURN: {
        [DeliveryStatus.PARTNER_ASSIGNED]: 'READY_FOR_DISPATCH',
        [DeliveryStatus.PICKED_UP]: 'OUT_FOR_DELIVERY',
        [DeliveryStatus.IN_TRANSIT]: 'OUT_FOR_DELIVERY',
        [DeliveryStatus.ARRIVED_AT_DROP]: 'OUT_FOR_DELIVERY',
        [DeliveryStatus.DELIVERED]: 'DELIVERED'
    }
};

const LEG_STATUS_FIELD = { PICKUP: 'pickupStatus', RETURN: 'deliveryStatus' };

/** Timing-safe comparison so the secret cannot be probed by response timing. */
const secretMatches = (provided) => {
    const expected = process.env.LOGISTICS_WEBHOOK_SECRET;
    if (!expected) return null;           // not configured — caller decides
    if (!provided) return false;
    const a = Buffer.from(String(provided));
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const handleLogisticsWebhook = async (req, res) => {
    // ── authenticate ──
    const provided =
        req.headers['x-webhook-secret'] ||
        req.headers['x-api-key'] ||
        req.query.secret;

    const match = secretMatches(provided);
    if (match === false) {
        console.warn('🚫 [WEBHOOK] rejected: bad or missing secret');
        return res.status(401).json({ message: 'Invalid webhook secret' });
    }
    if (match === null) {
        // Loud, because an unauthenticated public webhook can move order state.
        console.warn('⚠️  [WEBHOOK] LOGISTICS_WEBHOOK_SECRET is not set — accepting unauthenticated callbacks');
    }

    try {
        const provider = getLogisticsProvider();
        const parsed = provider.parseWebhook(req.body);

        if (!parsed.ok) {
            // Acknowledge so the provider stops retrying something we will never
            // understand, but record it — an unmapped status is a real gap.
            console.warn(`⚠️  [WEBHOOK] unparsed payload: ${parsed.reason}`);
            return res.status(200).json({ received: true, applied: false, reason: parsed.reason });
        }

        // ── locate the order and the leg ──
        const or = [];
        if (parsed.referenceId) or.push({ orderId: parsed.referenceId });
        if (parsed.taskId) {
            or.push({ 'shipmentDetails.taskId': parsed.taskId });
            or.push({ 'deliveryShipmentDetails.taskId': parsed.taskId });
        }

        const order = or.length ? await Order.findOne({ $or: or }) : null;
        if (!order) {
            console.warn(`⚠️  [WEBHOOK] no order for reference=${parsed.referenceId} task=${parsed.taskId}`);
            return res.status(200).json({ received: true, applied: false, reason: 'order not found' });
        }

        const leg = order.deliveryShipmentDetails?.taskId === parsed.taskId ? 'RETURN' : 'PICKUP';

        // ── apply ──
        const update = {
            [`${leg === 'PICKUP' ? 'shipmentDetails' : 'deliveryShipmentDetails'}.lastStatus`]: parsed.status
        };

        if (parsed.partner?.phone) {
            update.riderDetails = {
                name: parsed.partner.name,
                phone: parsed.partner.phone,
                photo: parsed.partner.photo
            };
        }

        if (parsed.status === DeliveryStatus.PICKED_UP) {
            update[LEG_STATUS_FIELD[leg]] = leg === 'PICKUP' ? 'picked' : 'requested';
        } else if (parsed.status === DeliveryStatus.DELIVERED) {
            update[LEG_STATUS_FIELD[leg]] = leg === 'PICKUP' ? 'picked' : 'delivered';
        } else if (parsed.status === DeliveryStatus.FAILED || parsed.status === DeliveryStatus.CANCELLED) {
            update[LEG_STATUS_FIELD[leg]] = 'failed';
        }

        const mappedStatus = ORDER_STATUS_FOR[leg]?.[parsed.status];
        if (mappedStatus) update.status = mappedStatus;

        // Record the actual transition atomically. Repeated provider callbacks
        // must not move the delivery timestamp and postpone unpaid alerts.
        const pipeline = [];
        if (mappedStatus) pipeline.push({ $set: { statusHistory: { $cond: [
            { $ne: ['$status', mappedStatus] },
            { $concatArrays: [{ $ifNull: ['$statusHistory', []] }, [{ _id: new mongoose.Types.ObjectId(), status: mappedStatus, timestamp: new Date() }]] },
            { $ifNull: ['$statusHistory', []] }
        ] } } });
        pipeline.push({ $set: Object.fromEntries(Object.entries(update).map(([key, value]) => [key, { $literal: value }])) });
        await Order.updateOne({ _id: order._id }, pipeline);

        // ── notify listeners ──
        try {
            const { getEventPublisher } = await import('../socket.js');
            const io = getEventPublisher();
            if (io) {
                const fresh = await Order.findById(order._id)
                    .populate('customer', 'displayName phone address')
                    .populate('vendor', 'shopDetails address location');
                io.to(`order_${order._id}`).emit('order_status_update', fresh);
            }
        } catch (socketErr) {
            console.error('[WEBHOOK] socket emit failed:', socketErr.message);
        }

        console.log(`📩 [WEBHOOK] ${order.orderId} ${leg} → ${parsed.status}${mappedStatus ? ` (order: ${mappedStatus})` : ''}`);
        return res.status(200).json({ received: true, applied: true, leg, status: parsed.status });
    } catch (err) {
        // Still 200: the provider must not retry-storm us over our own bug.
        console.error('❌ [WEBHOOK] handler error:', err.message);
        return res.status(200).json({ received: true, applied: false, reason: 'internal error' });
    }
};
