import Order from '../models/Order.js';
import { getLogisticsProvider } from '../services/logistics/index.js';

/**
 * Logistics Handshake Controller
 * Manages the "Chain of Custody" OTP verifications.
 */

export const requestHandshake = async (req, res) => {
    try {
        const { orderId, phase } = req.body;
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Generate a 4-digit OTP
        const otp = Math.floor(1000 + Math.random() * 9000).toString();

        // The delivery partner comes from the provider (or a webhook). If none
        // is known yet, look it up from the booked task rather than inventing one.
        if (!order.riderDetails || !order.riderDetails.phone) {
            const provider = getLogisticsProvider();
            // Tracking is indexed by AWB, so prefer it over the internal task id.
            const ref = order.deliveryShipmentDetails?.awbCode || order.deliveryShipmentDetails?.taskId
                     || order.shipmentDetails?.awbCode   || order.shipmentDetails?.taskId;
            if (ref) {
                const status = await provider.getStatus(ref);
                if (status.ok && status.partner) order.riderDetails = status.partner;
            }
        }

        // Update or Add handshake record
        const handshakeIndex = order.logisticsHandshakes.findIndex(h => h.phase === phase);
        if (handshakeIndex > -1) {
            order.logisticsHandshakes[handshakeIndex].otp = otp;
            order.logisticsHandshakes[handshakeIndex].isVerified = false;
        } else {
            order.logisticsHandshakes.push({
                phase,
                otp,
                initiator: 'Rider',
                verifier: (phase === 'Collection' || phase === 'Completion') ? 'Customer' : 'Vendor'
            });
        }

        await order.save();

        // The handover OTP is shown to the customer/vendor in-app; the delivery
        // partner reads it from their own app. Nothing is sent from here.
        res.status(200).json({
            message: `Handshake OTP requested for ${phase}.`,
            rider: order.riderDetails || null
        });

    } catch (error) {
        console.error('Request Handshake Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const verifyHandshake = async (req, res) => {
    try {
        const { orderId, phase, otp } = req.body;
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const handshake = order.logisticsHandshakes.find(h => h.phase === phase);

        if (!handshake) {
            return res.status(400).json({ message: 'No handshake requested for this phase' });
        }

        if (handshake.otp !== otp) {
            return res.status(400).json({ message: 'Invalid OTP. Please check with the Rider.' });
        }

        // Mark as verified
        handshake.isVerified = true;
        handshake.verifiedAt = new Date();

        // Trigger Status Updates based on Phase
        if (phase === 'Collection') {
            order.status = 'IN_TRANSIT';
        } else if (phase === 'Inbound') {
            order.status = 'PROCESSING';
        } else if (phase === 'Reverse') {
            order.status = 'OUT_FOR_DELIVERY';
        } else if (phase === 'Completion') {
            order.status = 'DELIVERED';
        }

        await order.save();

        // Populate order details and emit WebSocket status update
        try {
            const populatedOrder = await Order.findById(order._id)
                .populate('customer', 'displayName phone address email')
                .populate('vendor', 'shopDetails address location')
                .populate('rider', 'displayName phone location');

            const { getEventPublisher } = await import('../socket.js');
            const io = getEventPublisher();
            if (io) {
                const orderRoom = `order_${order._id.toString()}`;
                console.log(`[DEBUG] Emitting order status update to room: ${orderRoom} -> ${order.status}`);
                io.to(orderRoom).emit('order_status_update', populatedOrder);

                if (phase === 'Completion') {
                    const customerId = order.customer._id || order.customer;
                    const targetRoom = `user_${customerId.toString()}`;
                    console.log(`[DEBUG] Notifying delivery to user room: ${targetRoom}`);
                    io.to(targetRoom).emit('order_status_update', populatedOrder);
                }
            }
        } catch (socketErr) {
            console.error('Socket notification error in logistics handshake verification:', socketErr);
        }

        res.status(200).json({ 
            message: `Handshake ${phase} verified successfully!`,
            newStatus: order.status
        });

    } catch (error) {
        console.error('Verify Handshake Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
