import User from '../models/User.js';
import Order from '../models/Order.js';
import Ticket from '../models/Ticket.js';
import Feedback from '../models/Feedback.js';
import B2BOrder from '../models/B2BOrder.js';
import Job from '../models/Job.js';
import JobApplication from '../models/JobApplication.js';
import SupplierApplication from '../models/SupplierApplication.js';
import VendorMasterSupply from '../models/VendorMasterSupply.js';
import Service from '../models/Service.js';
import ServiceArea from '../models/ServiceArea.js';
import { canAccessAccount, isScopedAdmin } from './adminScope.js';
import { canAccessSupport } from './supportAccess.js';

const id = value => String(value?._id || value || '');
const reportModels = ['User', 'Order', 'Ticket', 'Feedback', 'B2BOrder', 'JobApplication', 'SupplierApplication', 'VendorMasterSupply', 'Service', 'ServiceArea'];
export const createAdminReportScope = async (req, resources = reportModels) => {
    if (!isScopedAdmin(req)) return { scoped: false, query: (_model, query = {}) => query, metadata: { type: 'all' } };
    // One request-local snapshot; never cache permission sets across requests.
    const needed = new Set(resources);
    if (needed.has('Ticket') || needed.has('Feedback')) needed.add('Order');
    if (['Order', 'JobApplication', 'VendorMasterSupply', 'Service'].some(model => needed.has(model))) needed.add('User');
    const scopedRead = (model, read) => needed.has(model) ? read() : Promise.resolve([]);
    req.reportScopePromises ||= new Map();
    const key = [...resources].sort().join(',');
    if (!req.reportScopePromises.has(key)) req.reportScopePromises.set(key, (async () => {
        const [users, orders, tickets, feedback, b2b, jobs, applications, supplierApps, supplies, services, areas] = await Promise.all([
            scopedRead('User', () => User.find().select('_id role location addresses shopDetails.location supplierDetails.location phone').lean()),
            scopedRead('Order', () => Order.find().select('_id pickupLocation vendor orderType').lean()),
            scopedRead('Ticket', () => Ticket.find().select('_id customer order').lean()),
            scopedRead('Feedback', () => Feedback.find().select('_id user vendor order').lean()),
            scopedRead('B2BOrder', () => B2BOrder.find().select('_id pincode').lean()),
            scopedRead('JobApplication', () => Job.find().select('_id vendor pincode').lean()),
            scopedRead('JobApplication', () => JobApplication.find().select('_id job').lean()),
            scopedRead('SupplierApplication', () => SupplierApplication.find().select('_id warehouseLocation').lean()),
            scopedRead('VendorMasterSupply', () => VendorMasterSupply.find().select('_id supplierId').lean()),
            scopedRead('Service', () => Service.find().select('_id vendorId isMaster').lean()),
            ServiceArea.find().select('_id areaName pincodes isActive boundary').lean()
        ]);
        const activeAreas = areas.filter(area => area.isActive);
        req.accountScopeAreas = Promise.resolve(activeAreas);
        req.supportAreasPromise = Promise.resolve(activeAreas);
        req.supportUsersById = new Map(users.map(user => [id(user), user]));
        req.supportOrdersById = new Map(orders.map(order => [id(order), order]));
        const visibleUsers = await Promise.all(users.map(user => canAccessAccount(req, user)));
        const userIds = new Set(users.filter((_user, index) => visibleUsers[index]).map(user => id(user)));
        const visibleOrders = await Promise.all(orders.map(order => canAccessSupport(req, { order })));
        const orderIds = new Set(orders.filter((_order, index) => visibleOrders[index]).map(order => id(order)));
        const visibleTickets = await Promise.all(tickets.map(ticket => canAccessSupport(req, ticket)));
        const visibleApps = await Promise.all(supplierApps.map(application => canAccessAccount(req, application)));
        const restrictions = req.account.geofenceRestrictions;
        // Legacy B2B/jobs store postal codes rather than coordinates. Ambiguous
        // codes spanning assigned and unassigned active areas cannot prove scope.
        const permittedPostcode = code => {
            if (!code || code === '-') return false;
            const matches = activeAreas.filter(area => area.pincodes?.includes(String(code).trim()));
            return matches.length > 0 && matches.every(area => restrictions.includes(area.areaName));
        };
        const jobIds = new Set(jobs.filter(job => job.pincode && job.pincode !== '-' ? permittedPostcode(job.pincode) : userIds.has(id(job.vendor))).map(job => id(job)));
        const supplierKeys = new Map();
        for (const user of users.filter(user => user.role === 'Supplier')) {
            for (const key of [id(user), `SUP-${user.phone?.slice(-4) || '001'}`]) {
                const owners = supplierKeys.get(key) || []; owners.push(id(user)); supplierKeys.set(key, owners);
            }
        }
        const sets = {
            User: users.filter(user => userIds.has(id(user))).map(user => user._id),
            Order: orders.filter(order => orderIds.has(id(order))).map(order => order._id),
            Ticket: tickets.filter((_ticket, index) => visibleTickets[index]).map(ticket => ticket._id),
            Feedback: feedback.filter(entry => entry.order ? orderIds.has(id(entry.order)) : userIds.has(id(entry.user)) && (!entry.vendor || userIds.has(id(entry.vendor)))).map(entry => entry._id),
            B2BOrder: b2b.filter(order => permittedPostcode(order.pincode)).map(order => order._id),
            JobApplication: applications.filter(application => jobIds.has(id(application.job))).map(application => application._id),
            SupplierApplication: supplierApps.filter((_application, index) => visibleApps[index]).map(application => application._id),
            VendorMasterSupply: supplies.filter(supply => {
                if (!supply.supplierId || supply.supplierId === '-') return true; // Shared catalog templates.
                const owners = supplierKeys.get(supply.supplierId);
                return owners?.length && owners.every(owner => userIds.has(owner));
            }).map(supply => supply._id),
            Service: services.filter(service => service.vendorId ? userIds.has(id(service.vendorId)) : service.isMaster).map(service => service._id),
            ServiceArea: areas.filter(area => restrictions.includes(area.areaName)).map(area => area._id)
        };
        return {
            scoped: true,
            query: (model, query = {}) => {
                if (!resources.includes(model) || !sets[model]) throw new Error(`Report scope is undefined for ${model}`);
                return { $and: [query, { _id: { $in: sets[model] } }] };
            },
            metadata: { type: 'assigned_service_areas', areas: [...restrictions], sharedCatalogs: ['services', 'materials', 'splash advertisements', 'supply templates'], unlocatedRecords: 'excluded', vendorSettlements: 'unavailable' }
        };
    })());
    return req.reportScopePromises.get(key);
};
