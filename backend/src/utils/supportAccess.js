import ServiceArea from '../models/ServiceArea.js';
import Order from '../models/Order.js';
import User from '../models/User.js';

export const supportActor = req => req.user || req.admin;
export const supportError = (message, status = 403) => Object.assign(new Error(message), { status });
const idOf = value => String(value?._id || value || '');
const pointInside = (point, ring) => {
    if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lng) || !ring?.length) return false;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
        if ((yi > point.lat) !== (yj > point.lat) && point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
};

export const canAccessSupport = async (req, ticket) => {
    const actor = supportActor(req);
    if (actor.role !== 'Admin') return idOf(ticket.customer) === String(actor.id);
    const restrictions = req.account?.geofenceRestrictions || [];
    if (!restrictions.length) return true;
    let point;
    if (ticket.order) {
        const order = ticket.order.pickupLocation ? ticket.order : (req.supportOrdersById?.get(idOf(ticket.order)) || await Order.findById(idOf(ticket.order)).select('pickupLocation vendor orderType'));
        if (order?.orderType === 'Walk-In' && order.vendor) {
            const vendor = req.supportUsersById?.get(idOf(order.vendor)) || await User.findById(idOf(order.vendor)).select('location');
            point = vendor?.location;
        } else point = order?.pickupLocation;
    } else if (ticket.customer) {
        const customer = ticket.customer.role ? ticket.customer : (req.supportUsersById?.get(idOf(ticket.customer)) || await User.findById(idOf(ticket.customer)).select('role location addresses'));
        point = customer?.role === 'Customer'
            ? (customer.addresses?.find(address => address.isDefault)?.location || customer.addresses?.[0]?.location || customer.location)
            : customer?.location;
    }
    req.supportAreasPromise ||= ServiceArea.find({ isActive: true }).exec();
    const area = (await req.supportAreasPromise).find(candidate => pointInside(point, candidate.boundary?.coordinates?.[0]));
    return !!area && restrictions.includes(area.areaName);
};

export const requireSupportAccess = async (req, ticket) => {
    if (!await canAccessSupport(req, ticket)) throw supportError('You cannot access this support ticket.');
};
