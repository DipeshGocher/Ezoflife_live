import IssuedInvoice from '../models/IssuedInvoice.js';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import User from '../models/User.js';
import ServiceArea from '../models/ServiceArea.js';

const containsPoint = (lat, lng, polygon) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
};

// Read-only admin detail contract. Keep customer/vendor order APIs unchanged.
export const getAdminOrderDetail = async (req, res) => {
    try {
        const admin = await User.findById(req.admin?.id).select('role status geofenceRestrictions');
        if (!admin || admin.role !== 'Admin' || admin.status !== 'approved') {
            return res.status(403).json({ message: 'An active admin account is required.' });
        }
        const id = req.params.id;
        const query = mongoose.Types.ObjectId.isValid(id)
            ? { _id: id }
            : { orderId: { $in: [id, id.startsWith('#') ? id.slice(1) : `#${id}`] } };
        const order = await Order.findOne(query)
            .select('-pickupOtp -deliveryOtp -logisticsHandshakes.otp')
            .populate('customer', 'displayName phone address email customerType gstNumber')
            .populate('vendor', 'displayName shopDetails phone address email gstNumber location')
            .populate('rider', 'displayName phone');
        if (!order) return res.status(404).json({ message: 'Order not found.' });

        // Match the order-list convention: pickup point, or vendor for walk-ins.
        if (admin.geofenceRestrictions?.length) {
            const point = order.orderType === 'Walk-In' && order.vendor?.location
                ? order.vendor.location : order.pickupLocation;
            const areas = await ServiceArea.find({ isActive: true });
            const area = Number.isFinite(point?.lat) && Number.isFinite(point?.lng)
                ? areas.find(candidate => candidate.boundary?.coordinates?.[0]?.length >= 3 &&
                    containsPoint(point.lat, point.lng, candidate.boundary.coordinates[0])) : null;
            if (!area || !admin.geofenceRestrictions.includes(area.areaName)) {
                return res.status(403).json({ message: 'This order is outside your permitted service areas.' });
            }
        }
        // Deleted-party snapshots are already part of the order contract; let
        // the view identify them without pretending the account still exists.
        const issuedInvoice = await IssuedInvoice.findOne({ order: order._id, type: 'customer' }).lean();
        return res.status(200).json({ ...order.toObject(), issuedInvoice });
    } catch (error) {
        console.error('Admin order detail error:', error.message);
        return res.status(500).json({ message: 'Unable to load order details.' });
    }
};
