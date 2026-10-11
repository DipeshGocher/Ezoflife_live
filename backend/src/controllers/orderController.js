import mongoose from 'mongoose';
import Order from '../models/Order.js';
import User from '../models/User.js';
import axios from 'axios';
import Notification from '../models/Notification.js';
import { calculateTriggerTime } from '../utils/timeUtils.js';
import fs from 'fs';
import { getIO } from '../socket.js';
import { sendWalkInWhatsApp } from '../utils/whatsappHelper.js';
import { sendSMSMessage, sendWhatsAppMessage } from '../utils/communicationHelper.js';
import { dispatchReturn } from '../services/logistics/dispatch.js';
import { finalizeDeliveredOrder } from '../services/invoiceFinalizationService.js';
import PaymentTransaction from '../models/PaymentTransaction.js';
import { getRazorpay } from '../utils/razorpayClient.js';
import { calculateOrderPrice } from '../utils/pricingEngine.js';
import { priceCustomerOrder, PricingError } from '../utils/customerOrderPricing.js';
import { openCheckout, claimPayment, linkPayment, refundConsumed, PaymentError } from '../services/paymentLedger.js';
import { sendError } from '../utils/errorResponse.js';
import { estimateWeightFromItems, MAX_WEIGHT_KG, parseWeightKg, resolveOrderWeight } from '../utils/orderWeight.js';
import { resolveActorId, isOwnerOrAdmin } from '../middleware/authMiddleware.js';
import MasterService from '../models/MasterService.js';
import Service from '../models/Service.js';
import ServiceArea from '../models/ServiceArea.js';
import {
    generateOrderInvoices, checkCustomerRD, checkVendorRD,
    GstEligibilityError, GstConfigurationError
} from '../utils/gstInvoiceHelper.js';

const customerSafeOrder = order => {
    const value = typeof order?.toObject === 'function' ? order.toObject() : { ...order };
    if (value.invoices) value.invoices = { customerInvoice: value.invoices.customerInvoice };
    return value;
};


const orderForActor = (req, order) => {
    const value = typeof order?.toObject === 'function' ? order.toObject() : { ...order };
    const vendorId = value.vendor?._id || value.vendor;
    const customerId = value.customer?._id || value.customer;
    if (req.user?.role === 'Vendor' && String(vendorId) === String(req.user.id)) return value;
    if (req.user?.role === 'Customer' && String(customerId) === String(req.user.id)) return customerSafeOrder(value);
    delete value.invoices;
    return value;
};


const logToFile = (msg) => {
    try {
        fs.appendFileSync('./REAL_USER_DEBUG.log', `${new Date().toISOString()} - ${msg}\n`);
    } catch (e) {}
};

// Haversine formula to calculate distance between two points in km
const calculateHaversineDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

// Google Maps Distance Matrix API call
const calculateGoogleDistance = async (lat1, lon1, lat2, lon2) => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return null;

    try {
        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${lat1},${lon1}&destinations=${lat2},${lon2}&key=${apiKey}`;
        const response = await axios.get(url);
        if (response.data.status === 'OK' && response.data.rows[0].elements[0].status === 'OK') {
            return response.data.rows[0].elements[0].distance.value / 1000; // in km
        }
        return null;
    } catch (error) {
        console.error('Google Maps API Error:', error);
        return null;
    }
};

// Helper: Ray casting algorithm to check if point is in polygon
const isPointInPolygon = (lat, lng, polygonCoords) => {
    let inside = false;
    const x = lng;
    const y = lat;
    for (let i = 0, j = polygonCoords.length - 1; i < polygonCoords.length; j = i++) {
        const xi = polygonCoords[i][0];
        const yi = polygonCoords[i][1];
        const xj = polygonCoords[j][0];
        const yj = polygonCoords[j][1];
        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

export const getNearbyVendors = async (customerLat, customerLng, radiusKm = 4, serviceIds = [], isCustomerRD = false) => {
    try {
        const cLat = Number(customerLat);
        const cLng = Number(customerLng);

        // 1. Try to find the active ServiceArea containing the customer's coordinates
        const serviceArea = await ServiceArea.findOne({
            isActive: true,
            boundary: {
                $geoIntersects: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [cLng, cLat] // [lng, lat]
                    }
                }
            }
        });

        if (serviceArea) {
            logToFile(`📍 Customer coordinates match ServiceArea: ${serviceArea.areaName} (ID: ${serviceArea._id})`);
        } else {
            logToFile(`⚠️ Customer coordinates outside active ServiceAreas. Falling back to ${radiusKm}km radius.`);
        }

        const query = { role: 'Vendor', status: 'approved' };
        if (isCustomerRD) {
            query.$or = [
                { 'shopDetails.gst': { $ne: '', $exists: true } },
                { gstNumber: { $ne: '', $exists: true } }
            ];
        }
        const vendors = await User.find(query);
        const nearbyVendors = [];

        for (const vendor of vendors) {
            // The Mongo filter above is only an index-friendly prefilter. Always
            // repeat exact GSTIN validation so malformed non-empty values never pass.
            if (isCustomerRD && !checkVendorRD(vendor)) continue;
            // Filter by active services if serviceIds are requested
            if (serviceIds && serviceIds.length > 0) {
                const vendorServices = vendor.shopDetails?.services || [];
                const hasAllServices = serviceIds.every(sId => {
                    const vendorService = vendorServices.find(vs => vs.id === sId || vs._id?.toString() === sId);
                    return vendorService && vendorService.active !== false && vendorService.status === 'approved';
                });
                if (!hasAllServices) continue;
            }

            const vLat = Number(vendor.location?.lat || 0);
            const vLng = Number(vendor.location?.lng || 0);
            let isMatched = false;
            let distance = calculateHaversineDistance(cLat, cLng, vLat, vLng);

            // Match if vendor is in the same ServiceArea geofence
            if (serviceArea && serviceArea.boundary?.coordinates?.[0]) {
                const polygonCoords = serviceArea.boundary.coordinates[0];
                if (isPointInPolygon(vLat, vLng, polygonCoords)) {
                    isMatched = true;
                    logToFile(`Matched Vendor ${vendor.shopDetails?.name || vendor.displayName} in Geofence: ${serviceArea.areaName}`);
                }
            }

            // Fallback: If customer is not in any geofence, match by distance
            if (!isMatched && !serviceArea && distance <= radiusKm) {
                isMatched = true;
            }

            if (isMatched) {
                nearbyVendors.push({
                    id: vendor._id,
                    name: vendor.shopDetails?.name || vendor.displayName,
                    distance: distance.toFixed(2),
                    location: vendor.location
                });
            }
        }
        return nearbyVendors;
    } catch (err) {
        console.error('Nearby Vendors Error:', err);
        return [];
    }
};

/**
 * Express Controller Wrapper for getNearbyVendors
 */
export const handleGetNearbyVendors = async (req, res) => {
    try {
        const { lat, lng, radius, customerId } = req.query;
        if (!lat || !lng) {
            return res.status(400).json({ message: 'Latitude and Longitude are required' });
        }
        
        let isCustomerRD = false;
        // Customer identity comes from the token. Only an Admin may inspect
        // nearby eligibility on behalf of another customer.
        const effectiveCustomerId = req.user?.role === 'Admin' && customerId ? customerId : req.user?.id;
        if (effectiveCustomerId) {
            const customer = await User.findById(effectiveCustomerId);
            isCustomerRD = checkCustomerRD(customer);
        }
        
        const vendors = await getNearbyVendors(lat, lng, radius || 10, [], isCustomerRD); // Default 10km for browsing
        res.json(vendors);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const assignVendor = async (customerLat, customerLng) => {
    try {
        const vendors = await User.find({ role: 'Vendor', status: 'approved' });
        if (vendors.length === 0) return null;

        let closestVendor = null;
        let minDistance = Infinity;

        for (const vendor of vendors) {
            const vendorLat = vendor.location?.lat || 0;
            const vendorLng = vendor.location?.lng || 0;

            let distance = await calculateGoogleDistance(customerLat, customerLng, vendorLat, vendorLng);
            if (distance === null) {
                distance = calculateHaversineDistance(customerLat, customerLng, vendorLat, vendorLng);
            }

            if (distance < minDistance) {
                minDistance = distance;
                closestVendor = vendor;
            }
        }

        return closestVendor ? closestVendor._id : null;
    } catch (err) {
        console.error('Vendor Assignment Error:', err);
        return null;
    }
};

// getNearbyRiders removed (obsolete custom local rider flow)

/**
 * Rider-delivery fee for a vendor's walk-in order: the admin-configured
 * normal_logistics_fee, times the express multiplier of the vendor's service
 * area for Express. Same rule the walk-in screen shows; the server is the source.
 */
const quoteWalkInDeliveryFee = async (vendor, deliveryMode) => {
    const SystemConfig = (await import('../models/SystemConfig.js')).default;
    const config = await SystemConfig.findOne({ key: 'normal_logistics_fee' }).lean();
    const baseFee = Number(config?.value) || 0;
    let expressMultiplier = 1;
    if (deliveryMode === 'Express') {
        const lat = Number(vendor?.location?.lat) || 22.7196;
        const lng = Number(vendor?.location?.lng) || 75.8577;
        const area = await ServiceArea.findOne({
            isActive: true,
            boundary: { $geoIntersects: { $geometry: { type: 'Point', coordinates: [lng, lat] } } }
        }).lean();
        expressMultiplier = Number(area?.dynamicSurgeMultiplier) || 1.5;
    }
    const fee = Math.round(baseFee * expressMultiplier);
    return fee > 0 ? fee : 50;
};

const sendPaymentOrPricingError = (res, error, fallback) => {
    if (error instanceof PricingError || error instanceof PaymentError || error instanceof GstConfigurationError) {
        return res.status(error.status).json({ message: error.message });
    }
    if (error?.statusCode === 503) return res.status(503).json({ message: 'Online payment is not available right now' });
    console.error(`❌ [RAZORPAY] ${fallback}:`, error?.error?.description || error.message);
    return res.status(500).json({ message: fallback });
};

/**
 * Opens a Razorpay checkout. The amount is always calculated here, from the
 * purpose and its inputs; an amount sent by the app is ignored.
 *
 *   { purpose: 'CUSTOMER_ORDER', order: { items, pickupLocation, deliveryMode, selectedTier, promoApplied, useWallet } }
 *   { purpose: 'WALKIN_DELIVERY', deliveryMode }
 */
export const createRazorpayOrder = async (req, res) => {
    try {
        const { purpose } = req.body || {};

        if (purpose === 'CUSTOMER_ORDER') {
            const customerId = resolveActorId(req, 'customerId');
            if (!mongoose.isValidObjectId(customerId)) return res.status(400).json({ message: 'Invalid Customer ID' });
            const customer = await User.findById(customerId);
            if (!customer) return res.status(404).json({ message: 'Customer user not found' });

            const quote = await priceCustomerOrder({ ...(req.body.order || {}), customer });
            if (quote.payableOnline < 1) {
                return res.status(400).json({ message: 'Nothing to pay online for this order', quote: { payable: 0 } });
            }
            const checkout = await openCheckout({
                purpose,
                payerId: customer._id,
                amount: quote.payableOnline,
                quote: { breakdown: quote.priceBreakdown, discount: quote.discount, wallet: quote.walletDeduction, finalTotal: quote.finalTotal }
            });
            return res.status(200).json({ ...checkout, payable: quote.payableOnline, finalTotal: quote.finalTotal });
        }

        if (purpose === 'WALKIN_DELIVERY') {
            if (!['Vendor', 'Admin'].includes(req.user?.role)) {
                return res.status(403).json({ message: 'Only vendors pay walk-in delivery fees' });
            }
            const vendor = await User.findById(req.user.id).select('location role');
            const fee = await quoteWalkInDeliveryFee(vendor, req.body.deliveryMode);
            const checkout = await openCheckout({
                purpose,
                payerId: req.user.id,
                amount: fee,
                quote: { deliveryMode: req.body.deliveryMode === 'Express' ? 'Express' : 'Normal', fee }
            });
            return res.status(200).json({ ...checkout, payable: fee });
        }

        return res.status(400).json({ message: 'purpose must be CUSTOMER_ORDER or WALKIN_DELIVERY' });
    } catch (error) {
        return sendPaymentOrPricingError(res, error, 'Could not start the payment');
    }
};

/** The server's price for a cart, so the app shows exactly what will be charged. */
export const quoteCustomerOrder = async (req, res) => {
    try {
        const customerId = resolveActorId(req, 'customerId');
        if (!mongoose.isValidObjectId(customerId)) return res.status(400).json({ message: 'Invalid Customer ID' });
        const customer = await User.findById(customerId);
        if (!customer) return res.status(404).json({ message: 'Customer user not found' });
        const quote = await priceCustomerOrder({ ...req.body, customer });
        const { promo, ...rest } = quote;
        res.json({ ...rest, promo: promo ? { _id: promo._id, code: promo.code } : null });
    } catch (error) {
        return sendPaymentOrPricingError(res, error, 'Could not price this order');
    }
};

/** Walk-in rider delivery fee, as the server will charge it. */
export const getWalkInDeliveryFee = async (req, res) => {
    try {
        if (!['Vendor', 'Admin'].includes(req.user?.role)) {
            return res.status(403).json({ message: 'Only vendors can quote walk-in delivery' });
        }
        const vendor = await User.findById(req.user.id).select('location');
        const fee = await quoteWalkInDeliveryFee(vendor, req.query.deliveryMode);
        res.json({ fee, deliveryMode: req.query.deliveryMode === 'Express' ? 'Express' : 'Normal' });
    } catch (error) {
        return sendPaymentOrPricingError(res, error, 'Could not calculate the delivery fee');
    }
};

export const createOrder = async (req, res) => {
    try {
        const { 
            items, 
            pickupSlot, 
            deliverySlot, 
            pickupAddress, 
            pickupLocation, 
            dropAddress, 
            dropLocation, 
            totalAmount, 
            deliveryMode,
            deliveryCharge,
            specialInstructions,
            customerPhotos
        } = req.body;
        // Identity comes from the verified token. A body-supplied customerId is
        // honoured for Admins only (support / staff-raised orders) — otherwise
        // any caller could place an order in somebody else's name.
        const customerId = resolveActorId(req, 'customerId');

        if (!customerId) return res.status(400).json({ message: 'Customer ID required' });
        // Reject a malformed id up front. Without this, findById throws a CastError
        // that surfaces as a 500 — bad client input should never read as a server fault.
        if (!mongoose.Types.ObjectId.isValid(customerId)) {
            return res.status(400).json({ message: 'Invalid Customer ID' });
        }

        const customerUser = await User.findById(customerId);
        if (!customerUser) return res.status(404).json({ message: 'Customer user not found' });
        const isCustomerRD = checkCustomerRD(customerUser);

        // 1. Price the order on the server. Prices, multipliers, fees and discounts
        // sent by the app are ignored; see utils/customerOrderPricing.js.
        let quote;
        try {
            quote = await priceCustomerOrder({
                items,
                pickupLocation,
                deliveryMode,
                selectedTier: req.body.selectedTier,
                promoApplied: req.body.promoApplied,
                useWallet: req.body.useWallet,
                customer: customerUser
            });
        } catch (error) {
            if (error instanceof PricingError) return res.status(error.status).json({ message: error.message });
            throw error;
        }
        const finalPriceBreakdown = { ...quote.priceBreakdown };
        const multipliers = { advancePerc: quote.advancePercent };

        // --- DROP-OFF CALCULATION ---
        const itemIds = items.map(i => i.serviceId);
        const [masterSvcs, customSvcs] = await Promise.all([
            MasterService.find({ _id: { $in: itemIds.filter(id => id && id.length > 20) } }).select('completionTime gst heritageGst tier'),
            Service.find({ _id: { $in: itemIds.filter(id => id && id.length > 20) } }).select('completionTime gst tier')
        ]);
        const allSvcs = [...masterSvcs, ...customSvcs];
        const maxServiceTime = allSvcs.reduce((max, svc) => Math.max(max, svc.completionTime || 1), 1);
        
        // Auto-calculate drop-off date if not provided or to validate
        const pickupDateObj = new Date(pickupSlot.date);
        const dropOffDate = new Date(pickupDateObj);
        dropOffDate.setDate(dropOffDate.getDate() + maxServiceTime);
        
        // Update deliverySlot date if it was empty or just for consistency
        if (!deliverySlot.date) {
            deliverySlot.date = dropOffDate.toISOString().split('T')[0];
        }

        // Smart Pickup Logic
        const now = new Date();
        const currentHour = now.getHours();
        let pickupExpectedDate = new Date();
        let fallbackEnabled = false;

        if (currentHour < 12) {
            // Morning: Same day
        } else if (currentHour < 15) {
            // Afternoon: Try same day, fallback enabled
            fallbackEnabled = true;
        } else {
            // Evening/Night: Next day
            pickupExpectedDate.setDate(pickupExpectedDate.getDate() + 1);
        }

        const triggerTime = calculateTriggerTime(pickupSlot?.date, pickupSlot?.time);

        // Totals from the server quote (pre-discount total is stored as totalAmount).
        const finalTotal = quote.grandTotal;
        const walletDeduction = quote.walletDeduction;

        // B2B Promotions priority discovery & matching
        const serviceArea = await ServiceArea.findOne({
            isActive: true,
            boundary: {
                $geoIntersects: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [Number(pickupLocation.lng), Number(pickupLocation.lat)]
                    }
                }
            }
        });
        const serviceAreaId = serviceArea ? serviceArea._id : null;

        const Promotion = (await import('../models/Promotion.js')).default;
        const serviceIds = items.map(item => item.serviceId);

        const matchingVendorPromos = await Promotion.find({
            owner_type: 'VENDOR',
            status: 'Active',
            approval_status: 'APPROVED',
            start_date: { $lte: new Date() },
            expiryDate: { $gte: new Date() },
            $or: [
                { min_order_value: { $lte: finalPriceBreakdown.baseWithArea } },
                { minOrderValue: { $lte: finalPriceBreakdown.baseWithArea } }
            ],
            $or: [
                { geofence_id: serviceAreaId },
                { geofence_id: null }
            ],
            $or: [
                { scope_type: 'GLOBAL_ORDER' },
                { scope_type: 'SELECTED_SERVICES', selected_services: { $in: serviceIds } }
            ]
        });

        let allocationStatus = 'NONE';
        let allocationExpiresAt = null;
        let priorityVendorIds = [];

        if (matchingVendorPromos.length > 0) {
            priorityVendorIds = matchingVendorPromos.map(p => p.vendorId?.toString()).filter(Boolean);
            if (priorityVendorIds.length > 0) {
                allocationStatus = 'PROMO_EXCLUSIVE';
                allocationExpiresAt = new Date(Date.now() + 120 * 1000);
            }
        }

        // Apply Platform Promo calculation immediately at checkout if applied
        let appliedPromo = null;
        let finalLedger = {
            vendorNetPayout: 0,
            customerWalletCredit: 0,
            platformFee: 0,
            spinzytCombinedRevenue: 0,
            appliedPromoValue: 0,
            promoOwnerType: 'NONE'
        };

        if (quote.promo) {
            appliedPromo = quote.promo;
            if (appliedPromo.owner_type === 'PLATFORM') {
                const promoValue = quote.discount;
                const retailValue = finalTotal + promoValue;
                const standardFee = retailValue * 0.10;
                finalLedger = {
                    vendorNetPayout: retailValue - standardFee,
                    customerWalletCredit: 0,
                    platformFee: standardFee,
                    spinzytCombinedRevenue: standardFee - promoValue,
                    appliedPromoValue: promoValue,
                    promoOwnerType: 'PLATFORM'
                };
            }
        }

        // --- Payment resolution (server-authoritative) ---
        // The paymentStatus reported by the client is ignored. An online order is
        // only Paid once its Razorpay checkout (opened by the server for this exact
        // amount) is verified and consumed; a payment can be consumed only once.
        const validatedDiscount = quote.discount;
        const remainingTotal = quote.remaining;
        const calculatedAdvance = (remainingTotal * (multipliers.advancePerc / 100));
        const calculatedDue = remainingTotal - calculatedAdvance;

        let resolvedPaymentStatus = 'Pending';
        let resolvedPaymentMethod = 'COD';
        let paymentTxn = null;

        if (remainingTotal <= 0) {
            // Fully covered by wallet credit — there is nothing left to collect.
            resolvedPaymentStatus = 'Paid';
            resolvedPaymentMethod = 'Wallet';
        } else if (req.body.paymentMethod === 'Online') {
            try {
                paymentTxn = await claimPayment({
                    purpose: 'CUSTOMER_ORDER',
                    payerId: customerUser._id,
                    razorpay_order_id: req.body.razorpayOrderId,
                    razorpay_payment_id: req.body.razorpayPaymentId,
                    razorpay_signature: req.body.razorpaySignature,
                    expectedAmount: quote.payableOnline
                });
            } catch (error) {
                if (error instanceof PaymentError) {
                    console.warn(`🚫 [PAYMENT] Rejected order for customer ${customerId}: ${error.message}`);
                    return res.status(error.status).json({ message: error.message, refunded: Boolean(error.refunded) });
                }
                throw error;
            }
            resolvedPaymentStatus = 'Paid';
            resolvedPaymentMethod = 'Online';
        }

        // Payment is settled, so the wallet can now be debited — atomically, so two
        // simultaneous orders can never spend the same balance.
        if (walletDeduction > 0) {
            const debited = await User.updateOne(
                { _id: customerUser._id, walletBalance: { $gte: walletDeduction } },
                { $inc: { walletBalance: -walletDeduction } }
            );
            if (debited.modifiedCount !== 1) {
                if (paymentTxn) await refundConsumed(paymentTxn, 'Wallet balance changed before the order was placed');
                return res.status(409).json({
                    message: 'Your wallet balance changed. Please review your cart and try again.',
                    refunded: Boolean(paymentTxn)
                });
            }
            console.log(`💸 [WALLET] Deducted ₹${walletDeduction} from customer ${customerUser.phone} for order`);
        }
        const undoCharges = async (reason) => {
            if (walletDeduction > 0) await User.updateOne({ _id: customerUser._id }, { $inc: { walletBalance: walletDeduction } });
            if (paymentTxn) await refundConsumed(paymentTxn, reason);
        };

        // Weight is calculated only from quantities and the Avg Weight configured by
        // Admin for each Master Service. Legacy client-sent estimates and per-item
        // weights are deliberately ignored.
        // Stored items carry the server price; only display extras come from the app.
        const itemsForOrder = quote.items.map((priced, i) => ({
            serviceId: priced.serviceId,
            name: priced.name,
            quantity: priced.quantity,
            price: priced.price,
            gstPercent: priced.gstPercent,
            sacCode: priced.sacCode,
            serviceType: priced.serviceType,
            unit: items[i]?.unit || priced.unit,
            photos: Array.isArray(items[i]?.photos) ? items[i].photos : []
        }));
        const estimatedWeight = await estimateWeightFromItems(itemsForOrder);
        const orderWeight = resolveOrderWeight({ estimatedWeight });
        const analyticsAddress = (customerUser.addresses || []).find(address => address.isDefault)
            || (customerUser.addresses || [])[0]
            || {};

        const newOrder = new Order({
            customer: customerId,
            items: itemsForOrder,
            pickupSlot,
            deliverySlot,
            pickupAddress,
            pickupLocation,
            dropAddress,
            dropLocation,
            analyticsLocation: {
                state: analyticsAddress.state || '',
                city: analyticsAddress.city || '',
                pincode: analyticsAddress.pincode || '',
                geofence: serviceArea?.areaName || ''
            },
            totalAmount: Math.round(finalTotal * 100) / 100,
            advanceAmount: Math.round(calculatedAdvance * 100) / 100,
            dueAmount: Math.round(calculatedDue * 100) / 100,
            paymentStatus: resolvedPaymentStatus,
            paymentMethod: resolvedPaymentMethod,
            razorpayPaymentId: paymentTxn?.razorpayPaymentId || null,
            razorpayOrderId: paymentTxn?.razorpayOrderId || null,
            deliveryMode: deliveryMode === 'Express' ? 'Express' : 'Normal',
            tier: quote.multipliers.tier,
            deliveryCharge: quote.priceBreakdown.logisticsFee,
            promoApplied: req.body.promoApplied || null,
            discountAmount: validatedDiscount,
            walletAmountDeducted: Math.round(walletDeduction * 100) / 100,
            specialInstructions: specialInstructions || '',
            customerPhotos: customerPhotos || [],
            priceBreakdown: finalPriceBreakdown,
            status: 'ORDER_PLACED',
            pickupExpectedDate: pickupExpectedDate,
            pickupTriggerTime: triggerTime,
            deliveryStatus: 'none',
            serviceTime: maxServiceTime,
            fallbackEnabled: fallbackEnabled,
            pickupStatus: 'none',
            allocation_status: allocationStatus,
            allocation_expires_at: allocationExpiresAt,
            isCustomerRD: isCustomerRD,
            totalWeight: orderWeight.totalWeight,
            weightSource: orderWeight.weightSource,
            estimatedWeight,
            customerSnapshot: {
                displayName: customerUser.displayName || null,
                phone: customerUser.phone || null,
                email: customerUser.email || null,
                customerType: customerUser.customerType || 'individual',
                gstNumber: customerUser.gstNumber || null,
                isExUser: false
            },
            ledger: finalLedger
        });

        try {
            await newOrder.save();
        } catch (saveError) {
            await undoCharges('Order could not be saved');
            throw saveError;
        }
        if (paymentTxn) await linkPayment(paymentTxn, 'Order', [newOrder._id]);

        // Clear customer draftCart so it is removed from cart permanently
        try {
            await User.findByIdAndUpdate(customerId, { $set: { draftCart: {} } });
            console.log(`🛒 [CART] Cleared draftCart for customer ${customerId}`);
        } catch (cartErr) {
            console.warn('⚠️ [CART] Error clearing draftCart:', cartErr);
        }

        const io = getIO();
        const nearbyVendors = await getNearbyVendors(pickupLocation.lat, pickupLocation.lng, 3, serviceIds, isCustomerRD);
        
        // Filter nearby vendors if priority allocation is active
        const targetVendors = allocationStatus === 'PROMO_EXCLUSIVE'
            ? nearbyVendors.filter(v => priorityVendorIds.includes(v.id.toString()))
            : nearbyVendors;

        const notifications = targetVendors.map(vendor => ({
            recipient: vendor.id,
            role: 'vendor',
            title: allocationStatus === 'PROMO_EXCLUSIVE' ? 'Priority Order Available' : 'New Order Available',
            message: `A new laundry request at ${pickupAddress}. Distance: ${vendor.distance}km.`,
            type: 'order_available',
            orderId: newOrder._id
        }));

        if (notifications.length > 0) {
            try {
                await Notification.insertMany(notifications);
                
                targetVendors.forEach(v => {
                    logToFile(`Broadcasting to vendor room: user_${v.id}`);
                    io.to(`user_${v.id}`).emit('new_order_available', {
                        orderId: newOrder._id,
                        displayId: newOrder.orderId,
                        distance: v.distance,
                        items: newOrder.items,
                        tier: newOrder.items[0]?.tier || 'Essential',
                        deliveryMode: newOrder.deliveryMode,
                        notes: newOrder.specialInstructions,
                        totalAmount: newOrder.totalAmount,
                        allocation_status: allocationStatus,
                        allocation_expires_at: allocationExpiresAt
                    });
                });

                // --- REAL FIREBASE PUSH NOTIFICATION FOR VENDORS ---
                try {
                    const admin = (await import('../utils/firebaseAdmin.js')).default;
                    const vendorIds = targetVendors.map(v => v.id);
                    console.log(`📡 [FCM_DEBUG] Found ${vendorIds.length} B2B target vendors:`, vendorIds);
                    
                    const vendorUsers = await User.find({ 
                        _id: { $in: vendorIds },
                        status: 'approved'
                    });

                    for (const vendorUser of vendorUsers) {
                        if (vendorUser.fcmToken) {
                            console.log(`🚀 [FCM_PUSH] Sending New Order to Vendor: ${vendorUser.phone}`);
                            const message = {
                                notification: {
                                    title: allocationStatus === 'PROMO_EXCLUSIVE' ? 'Priority Order Available! 🚨' : 'New Order Available! 🧺',
                                    body: allocationStatus === 'PROMO_EXCLUSIVE' ? `Exclusive priority match for your promotion!` : `you have received new order`
                                },
                                data: {
                                    orderId: newOrder._id.toString(),
                                    type: 'NEW_ORDER'
                                },
                                token: vendorUser.fcmToken
                            };
                            await admin.messaging().send(message);
                        }
                    }
                } catch (pushErr) {
                    console.error('❌ [FCM_PUSH] Vendor notification error:', pushErr.message);
                }
            } catch (notifErr) {
                console.error('Notification Insert Error:', notifErr.message);
            }
        }

        // Set fallback timeout if in priority exclusive window
        if (allocationStatus === 'PROMO_EXCLUSIVE') {
            setTimeout(async () => {
                try {
                    const o = await Order.findById(newOrder._id);
                    if (o && o.allocation_status === 'PROMO_EXCLUSIVE' && !o.vendor) {
                        o.allocation_status = 'GENERAL_POOL';
                        await o.save();

                        // Notify ALL nearby vendors that it is in the general pool
                        const allNearby = await getNearbyVendors(pickupLocation.lat, pickupLocation.lng, 3, serviceIds, isCustomerRD);
                        allNearby.forEach(v => {
                            io.to(`user_${v.id}`).emit('new_order_available', {
                                orderId: o._id,
                                displayId: o.orderId,
                                distance: v.distance,
                                items: o.items,
                                tier: o.tier || 'Essential',
                                deliveryMode: o.deliveryMode,
                                notes: o.specialInstructions,
                                totalAmount: o.totalAmount,
                                allocation_status: 'GENERAL_POOL'
                            });
                        });
                        console.log(`🕒 [FALLBACK] Expiry timer fired: Order ${o.orderId} released to GENERAL_POOL`);
                    }
                } catch (e) {
                    console.error('Error in exclusive allocation fallback timer:', e);
                }
            }, 120 * 1000);
        }

        console.log(`\n\n========================================`);
        console.log(`🛍️ NEW ORDER CREATED SUCCESSFULLY!`);
        console.log(`ORDER ID: ${newOrder.orderId}`);
        console.log(`DB STATUS SAVED AS: ${newOrder.status}`);
        console.log(`ALLOCATION STATUS: ${newOrder.allocation_status}`);
        console.log(`========================================\n\n`);

        res.status(201).json(orderForActor(req, newOrder));
    } catch (err) {
        console.error('Create Order Error Details:', err);
        res.status(500).json({ message: 'Error creating order', error: err.message });
    }
};

export const getMyOrders = async (req, res) => {
    try {
        const { startDate, endDate, orderType } = req.query;

        // A customer may only list their own orders. Admins may pass ?customerId
        // to look at somebody else's; for everyone else the token decides.
        const customerId = (req.user?.role === 'Admin' && req.query.customerId)
            ? req.query.customerId
            : req.user?.id;

        if (!customerId) return res.status(400).json({ message: 'Customer ID required' });

        logToFile(`[DEBUG] Fetching orders for CustomerID: ${customerId}. Detecting phone...`);

        const currentUser = await User.findById(customerId);
        if (!currentUser) {
            logToFile(`[DEBUG] ERROR: User not found for ID: ${customerId}`);
            return res.status(404).json({ message: 'User not found' });
        }

        let accountIds = [customerId];

        if (currentUser.phone) {
            logToFile(`[DEBUG] Found phone: ${currentUser.phone} for account ${customerId}`);
            const last10 = currentUser.phone.slice(-10);
            const allUserAccounts = await User.find({ phone: new RegExp(last10 + '$') });
            accountIds = allUserAccounts.map(acc => acc._id);
            logToFile(`[DEBUG] Cross-account search for ${last10}. Found ${accountIds.length} linked IDs.`);
        }

        const query = { customer: { $in: accountIds } };

        if (orderType && orderType !== 'all') {
            if (orderType === 'walk-in') {
                query.orderType = 'Walk-In'; 
            } else if (orderType === 'online') {
                query.$or = [{ orderType: 'Online' }, { orderType: { $exists: false } }, { orderType: null }];
            }
        }

        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) {
                const start = new Date(startDate);
                start.setHours(0,0,0,0);
                query.createdAt.$gte = start;
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23,59,59,999);
                query.createdAt.$lte = end;
            }
        }

        const orders = await Order.find(query)
            .populate('rider', 'displayName phone')
            .populate('vendor', 'shopDetails phone address')
            .sort({ createdAt: -1 });

        logToFile(`[DEBUG] Orders found for ${currentUser.phone}: ${orders.length}`);

        // A customer never receives Spinzyt's vendor-facing platform invoice.
        res.status(200).json(orders.map(customerSafeOrder));
    } catch (err) {
        console.error('Fetch My Orders Error:', err);
        res.status(500).json({ message: 'Error fetching orders' });
    }
};

export const getVendorOrders = async (req, res) => {
    try {
        // A vendor may only list orders assigned to them; Admins may query any.
        const vendorId = (req.user?.role === 'Admin' && req.query.vendorId)
            ? req.query.vendorId
            : req.user?.id;

        if (!vendorId) return res.status(400).json({ message: 'Vendor ID required' });

        const orders = await Order.find({ vendor: vendorId }).populate('customer', 'displayName phone').sort({ createdAt: -1 });
        res.status(200).json(orders.map(order => orderForActor(req, order)));
    } catch (err) {
        res.status(500).json({ message: 'Error fetching vendor orders' });
    }
};

export const updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const order = await Order.findById(id)
            .populate('customer', 'displayName phone address location customerType gstNumber')
            .populate('vendor', 'shopDetails address location');
            
        if (!order) return res.status(404).json({ message: 'Order not found' });

        // Only the assigned vendor, the owning customer, or an Admin may move an
        // order along. Without this any logged-in account could mark any order
        // DELIVERED.
        const isAssignedVendor = isOwnerOrAdmin(req, order.vendor);
        const isOwningCustomer = isOwnerOrAdmin(req, order.customer);
        if (!isAssignedVendor && !isOwningCustomer) {
            return res.status(403).json({ message: 'You cannot update this order' });
        }
        if (status === 'DELIVERED' && req.user?.role !== 'Admin' && !isAssignedVendor) {
            return res.status(403).json({ message: 'Delivery must be confirmed by the assigned vendor or delivery OTP' });
        }

        const updateData = { status };
        let shouldDispatchReturn = false;

        if (status === 'READY_FOR_DISPATCH') {
            if (order.orderType === 'Walk-In' && !order.riderDropOff) {
                console.log(`[LOGISTICS] Walk-In Order ${order.orderId} marked as READY (Direct Handover). Skipping rider assignment.`);
                order.deliveryStatus = 'none';
                order.deliveryTriggerTime = null;
                order.nearbyRiders = [];
                order.rider = null;
                if (!order.deliveryOtp) {
                    order.deliveryOtp = Math.floor(1000 + Math.random() * 9000).toString();
                }
            } else {
                console.log(`[LOGISTICS] Order ${order.orderId} marked as READY. Scheduling delivery trigger...`);
                
                const deliveryTriggerTime = calculateTriggerTime(order.deliverySlot?.date, order.deliverySlot?.time);
                order.deliveryTriggerTime = deliveryTriggerTime;
                order.deliveryStatus = 'scheduled';

                // Local rider allocation is bypassed — the logistics provider
                // fulfils the return leg. Dispatch happens after the save below,
                // so a provider outage can never block the vendor's update.
                order.nearbyRiders = [];
                order.rider = null;
                order.deliveryOtp = Math.floor(1000 + Math.random() * 9000).toString();
                shouldDispatchReturn = true;
            }
        }

        if (status === 'DELIVERED') {
            await finalizeDeliveredOrder(order._id);
        } else {
            order.status = status;
            await order.save();
        }

        // Book the return leg once the order is safely persisted. dispatchReturn
        // is idempotent, so the scheduler retrying later is harmless.
        if (shouldDispatchReturn) {
            const result = await dispatchReturn(order._id);
            if (!result.ok) {
                // Left as deliveryStatus 'scheduled' for the scheduler to retry.
                console.warn(`⚠️  [LOGISTICS] return dispatch deferred for ${order.orderId}: ${result.reason}`);
            }
        }

        const updatedOrder = await Order.findById(id)
            .populate('customer', 'displayName phone address email customerType gstNumber')
            .populate('vendor', 'shopDetails address location')
            .populate('rider', 'displayName phone location');

        // --- REAL FIREBASE PUSH NOTIFICATION ---
        console.log(`📡 [FCM_DEBUG] updateOrderStatus status: ${status} for order: ${updatedOrder.orderId}`);
        if (status === 'In Progress') {
            let customerId = updatedOrder.customer;
            if (customerId && typeof customerId === 'object') {
                customerId = customerId._id || customerId.id || customerId;
            }
            customerId = customerId?.toString();

            if (customerId) {
                console.log(`📡 [FCM_DEBUG] Found customerId for handover: ${customerId}`);
                try {
                    const admin = (await import('../utils/firebaseAdmin.js')).default;
                    const customer = await User.findById(customerId);
                    
                    if (customer && customer.fcmToken) {
                        console.log(`🚀 [FCM_PUSH] Sending Start Processing Notification to ${customer.phone}`);
                        const message = {
                            notification: {
                                title: 'Service Started! 🧺',
                                body: `your cloth service is start`
                            },
                            data: {
                                orderId: updatedOrder.orderId.toString(),
                                type: 'SERVICE_START'
                            },
                            token: customer.fcmToken
                        };

                        await admin.messaging().send(message);
                        console.log(`🚀 [FCM_PUSH] Start Processing Success`);
                    } else {
                        console.log(`⚠️ [FCM_PUSH] Skipping Handover - Token missing`);
                    }
                } catch (pushErr) {
                    console.error('❌ [FCM_PUSH] Handover error:', pushErr.message);
                }
            }
        }
            
        // Socket.io: Notify rooms
        const io = getIO();
        io.to(`order_${id}`).emit('order_status_update', customerSafeOrder(updatedOrder));
        
        // Also notify vendor specifically for live reports
        if (updatedOrder.vendor) {
            const vendorId = updatedOrder.vendor._id || updatedOrder.vendor;
            io.to(`user_${vendorId}`).emit('order_status_update', updatedOrder);
        }

        // Notify customer specifically for real-time updates
        if (updatedOrder.customer) {
            const customerId = updatedOrder.customer._id || updatedOrder.customer;
            io.to(`user_${customerId}`).emit('order_status_update', customerSafeOrder(updatedOrder));
        }

        // Helper to map DB status to UI terms
        const getCustomerStatus = (st) => {
            const map = {
                'ORDER_PLACED': 'Placed',
                'PICKUP_ASSIGNED': 'Rider Assigned',
                'RIDER_ARRIVING': 'Rider Arriving',
                'IN_TRANSIT': 'In Transit',
                'RECEIVED_BY_VENDOR': 'Processing',
                'PROCESSING': 'Processing',
                'READY_FOR_DISPATCH': 'Ready for Dispatch',
                'OUT_FOR_DELIVERY': 'Out for Delivery',
                'DELIVERED': 'Delivered',
                'CANCELLED': 'Cancelled'
            };
            return map[st] || st;
        };

        const getVendorStatus = (st) => {
            const map = {
                'ORDER_PLACED': 'New Order',
                'PICKUP_ASSIGNED': 'Awaiting Pickup',
                'RIDER_ARRIVING': 'Awaiting Pickup',
                'IN_TRANSIT': 'In Transit',
                'RECEIVED_BY_VENDOR': 'Sorting',
                'PROCESSING': 'In Progress',
                'READY_FOR_DISPATCH': 'Ready to Ship',
                'OUT_FOR_DELIVERY': 'Dispatched',
                'DELIVERED': 'Completed',
                'CANCELLED': 'Cancelled'
            };
            return map[st] || st;
        };

        console.log(`\n\n========================================`);
        console.log(`🔄 ORDER STATUS UPDATED!`);
        console.log(`ORDER ID: ${updatedOrder.orderId}`);
        console.log(`DB STATUS NOW: ${updatedOrder.status}`);
        console.log(`----------------------------------------`);
        console.log(`CUSTOMER APP VIEW: "${getCustomerStatus(updatedOrder.status)}"`);
        console.log(`VENDOR APP VIEW: "${getVendorStatus(updatedOrder.status)}"`);
        console.log(`========================================\n\n`);

        res.status(200).json(orderForActor(req, updatedOrder));
    } catch (err) {
        console.error('Update Status Error:', err);
        if (err instanceof GstConfigurationError) return res.status(err.status).json({ message: err.message });
        res.status(500).json({ message: 'Error updating order status' });
    }
};

export const getAllOrders = async (req, res) => {
    try {
        const { page, limit, status, zone, customer, startDate, endDate } = req.query;

        const orders = await Order.find()
            .populate('customer', 'displayName phone customerType gstNumber')
            .populate('vendor', 'shopDetails phone location gstNumber')
            .sort({ createdAt: -1 });
        
        // Fetch active service areas to map them to orders
        const serviceAreas = await ServiceArea.find({ isActive: true });
        
        const ordersWithZone = orders.map(order => {
            let zoneName = 'N/A';
            let lat = order.pickupLocation?.lat;
            let lng = order.pickupLocation?.lng;

            if (order.orderType === 'Walk-In' && order.vendor?.location) {
                lat = order.vendor.location.lat;
                lng = order.vendor.location.lng;
            }
            
            if (lat && lng) {
                for (const area of serviceAreas) {
                    if (area.boundary?.coordinates?.[0]) {
                        const polygonCoords = area.boundary.coordinates[0];
                        if (isPointInPolygon(lat, lng, polygonCoords)) {
                            zoneName = area.areaName;
                            break;
                        }
                    }
                }
            }
            
            const orderObj = order.toObject();
            if (!orderObj.customer && orderObj.customerSnapshot?.displayName) {
                orderObj.customer = {
                    displayName: orderObj.customerSnapshot.displayName,
                    phone: orderObj.customerSnapshot.phone,
                    customerType: orderObj.customerSnapshot.customerType || 'individual',
                    isExUser: true
                };
            }
            if (!orderObj.vendor && orderObj.vendorSnapshot?.displayName) {
                orderObj.vendor = {
                    displayName: orderObj.vendorSnapshot.displayName,
                    shopDetails: { name: orderObj.vendorSnapshot.shopName || orderObj.vendorSnapshot.displayName },
                    phone: orderObj.vendorSnapshot.phone,
                    isExUser: true
                };
            }

            return {
                ...orderForActor(req, orderObj),
                serviceZone: zoneName
            };
        });

        // Compute unique customer names and service zones from all orders before filtering
        const uniqueCustomerNamesSet = new Set();
        const uniqueServiceZonesSet = new Set();
        
        ordersWithZone.forEach(o => {
            const custName = (o.customer?.displayName || '').trim();
            if (custName) uniqueCustomerNamesSet.add(custName);
            
            const zoneName = (o.serviceZone || '').trim();
            if (zoneName && zoneName !== 'N/A') uniqueServiceZonesSet.add(zoneName);
        });

        const uniqueCustomerNames = Array.from(uniqueCustomerNamesSet).sort();
        const uniqueServiceZones = Array.from(uniqueServiceZonesSet).sort();

        // Apply filtering
        let filtered = ordersWithZone;

        // Apply admin geofence scoping
        let adminGeofences = [];
        if (req.admin && req.admin.id) {
            const adminUser = await User.findById(req.admin.id);
            if (adminUser && adminUser.geofenceRestrictions && adminUser.geofenceRestrictions.length > 0) {
                adminGeofences = adminUser.geofenceRestrictions;
            }
        }

        if (adminGeofences.length > 0) {
            filtered = filtered.filter(o => adminGeofences.includes(o.serviceZone));
        }

        const { activeTab } = req.query;
        if (activeTab === 'Active') {
            filtered = filtered.filter(o => !['DELIVERED', 'CANCELLED'].includes((o.status || '').toUpperCase()));
        } else if (activeTab === 'Completed') {
            filtered = filtered.filter(o => (o.status || '').toUpperCase() === 'DELIVERED');
        }

        if (status) {
            filtered = filtered.filter(o => (o.status || '').toUpperCase() === status.toUpperCase());
        }

        if (zone) {
            filtered = filtered.filter(o => (o.serviceZone || '').trim().toLowerCase() === zone.trim().toLowerCase());
        }

        if (customer) {
            filtered = filtered.filter(o => (o.customer?.displayName || '').trim().toLowerCase() === customer.trim().toLowerCase());
        }

        if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            filtered = filtered.filter(o => new Date(o.createdAt) >= start);
        }

        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            filtered = filtered.filter(o => new Date(o.createdAt) <= end);
        }

        // Apply pagination if page and limit are specified
        if (page && limit) {
            const pageNumber = parseInt(page, 10) || 1;
            const limitNumber = parseInt(limit, 10) || 10;
            const skip = (pageNumber - 1) * limitNumber;

            const paginated = filtered.slice(skip, skip + limitNumber);
            
            return res.status(200).json({
                data: paginated,
                pagination: {
                    total: filtered.length,
                    page: pageNumber,
                    limit: limitNumber,
                    totalPages: Math.ceil(filtered.length / limitNumber) || 1
                },
                filterOptions: {
                    customerNames: uniqueCustomerNames,
                    serviceZones: uniqueServiceZones
                }
            });
        }
        
        res.status(200).json(filtered);
    } catch (err) {
        console.error('Error fetching all orders:', err);
        res.status(500).json({ message: 'Error fetching all orders' });
    }
};

// getRiderTasks removed (obsolete custom local rider flow)

export const getPoolOrders = async (req, res) => {
    try {
        if (req.user?.role !== 'Vendor') return res.status(403).json({ message: 'Only vendors can view the order pool' });
        const vendorId = req.user.id;
        const vendor = await User.findById(vendorId);
        if (!vendor) {
            console.log(`⚠️ [POOL] Vendor lookup FAILED for ID: ${vendorId}`);
            return res.status(404).json({ message: 'Vendor not found' });
        }

        // SECURITY: If vendor is NOT approved, return empty pool
        if (vendor.status !== 'approved') {
            console.log(`🛡️ [POOL_SEC] Blocking pending vendor ${vendor.phone} from seeing orders.`);
            return res.status(200).json([]);
        }

        const vLat = vendor.location?.lat || 0;
        const vLng = vendor.location?.lng || 0;

        // Auto-release expired exclusive allocations on-the-fly
        await Order.updateMany(
            {
                status: 'ORDER_PLACED',
                vendor: null,
                allocation_status: 'PROMO_EXCLUSIVE',
                allocation_expires_at: { $lte: new Date() }
            },
            {
                $set: { allocation_status: 'GENERAL_POOL' }
            }
        );

        // Auto-reject orders older than 1 hour
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const expiredResult = await Order.updateMany(
            { 
                status: 'ORDER_PLACED', 
                vendor: null, 
                createdAt: { $lt: oneHourAgo } 
            },
            { $set: { status: 'Cancelled' } }
        );

        if (expiredResult.modifiedCount > 0) {
            console.log(`🕒 [EXPIRY] Auto-cancelled ${expiredResult.modifiedCount} stale orders in pool.`);
        }

        const isVendorRD = checkVendorRD(vendor);

        // GST Business Customer Protection: Unregistered Vendors (URD) cannot see RD Customer orders
        const poolQuery = { 
            status: 'ORDER_PLACED', 
            vendor: null,
            createdAt: { $gte: oneHourAgo }
        };
        if (!isVendorRD) {
            poolQuery.isCustomerRD = { $ne: true };
        }

        const orders = await Order.find(poolQuery).populate('customer', 'displayName address location customerType gstNumber');
        
        const Promotion = (await import('../models/Promotion.js')).default;
        const ServiceArea = (await import('../models/ServiceArea.js')).default;

        const pool = [];
        for (const order of orders) {
            // Secondary safety check for RD customer protection
            const orderIsRD = order.isCustomerRD || checkCustomerRD(order.customer);
            if (orderIsRD && !isVendorRD) continue;

            if (!order.pickupLocation?.lat) continue;
            const dist = calculateHaversineDistance(vLat, vLng, order.pickupLocation.lat, order.pickupLocation.lng);
            if (dist > 3) continue; // 3km radius

            // Enforce exclusive priority window visibility check
            if (order.allocation_status === 'PROMO_EXCLUSIVE' && order.allocation_expires_at > new Date()) {
                const serviceIds = order.items.map(item => item.serviceId);
                
                // Get Service Area
                const orderArea = await ServiceArea.findOne({
                    isActive: true,
                    boundary: {
                        $geoIntersects: {
                            $geometry: {
                                type: 'Point',
                                coordinates: [Number(order.pickupLocation.lng), Number(order.pickupLocation.lat)]
                            }
                        }
                    }
                });
                const serviceAreaId = orderArea ? orderArea._id : null;

                const matchingPromo = await Promotion.findOne({
                    vendorId: vendor._id,
                    owner_type: 'VENDOR',
                    status: 'Active',
                    approval_status: 'APPROVED',
                    start_date: { $lte: new Date() },
                    expiryDate: { $gte: new Date() },
                    $or: [
                        { min_order_value: { $lte: order.priceBreakdown?.baseWithArea || order.totalAmount || 0 } },
                        { minOrderValue: { $lte: order.priceBreakdown?.baseWithArea || order.totalAmount || 0 } }
                    ],
                    $or: [
                        { geofence_id: serviceAreaId },
                        { geofence_id: null }
                    ],
                    $or: [
                        { scope_type: 'GLOBAL_ORDER' },
                        { scope_type: 'SELECTED_SERVICES', selected_services: { $in: serviceIds } }
                    ]
                });

                if (!matchingPromo) continue; // Skip order if vendor has no matching priority promo
            }

            // Check if vendor deactivated or doesn't offer any of the order's services
            const serviceIds = order.items.map(item => item.serviceId);
            const vendorServices = vendor.shopDetails?.services || [];
            const hasAllServices = serviceIds.every(sId => {
                const vendorService = vendorServices.find(vs => vs.id === sId || vs._id?.toString() === sId);
                return vendorService && vendorService.active !== false && vendorService.status === 'approved';
            });
            if (!hasAllServices) continue;

            pool.push({
                ...order._doc,
                distance: dist.toFixed(2),
                tier: order.tier || order.items[0]?.tier || 'Essential',
                deliveryMode: order.deliveryMode || 'Normal',
                notes: order.specialInstructions
            });
        }

        res.status(200).json(pool);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching pool orders' });
    }
};

export const vendorAcceptOrder = async (req, res) => {
    try {
        const { id } = req.params;
        // The accepting vendor is whoever is logged in. Accepting an order "as"
        // another vendor is an Admin-only action.
        const vendorId = resolveActorId(req, 'vendorId');

        const order = await Order.findById(id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (order.vendor) return res.status(400).json({ message: 'Order already accepted by another vendor' });

        const vendor = await User.findById(vendorId);
        if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

        // Verify that the vendor has all order services active and approved
        const serviceIds = order.items.map(item => item.serviceId);
        const vendorServices = vendor.shopDetails?.services || [];
        const hasAllServices = serviceIds.every(sId => {
            const vendorService = vendorServices.find(vs => vs.id === sId || vs._id?.toString() === sId);
            return vendorService && vendorService.active !== false && vendorService.status === 'approved';
        });

        if (!hasAllServices) {
            return res.status(400).json({ message: 'You cannot accept this order because some services are inactive or not offered by you.' });
        }

        // GST Business Customer Protection: Restrict and prevent URD vendors from accepting RD customer orders
        const customerUser = await User.findById(order.customer);
        const isCustRD = order.isCustomerRD || checkCustomerRD(customerUser);
        const isVendRD = checkVendorRD(vendor);

        if (isCustRD && !isVendRD) {
            return res.status(403).json({ 
                message: 'Order Eligibility Restriction: Registered Business Customer (RD) orders require a GST-registered vendor (RD) for tax invoice compliance.' 
            });
        }

        // B2B Promotions priority window claim verification
        const Promotion = (await import('../models/Promotion.js')).default;
        const ServiceArea = (await import('../models/ServiceArea.js')).default;

        let appliedPromo = null;
        let finalLedger = order.ledger || {
            vendorNetPayout: 0,
            customerWalletCredit: 0,
            platformFee: 0,
            spinzytCombinedRevenue: 0,
            appliedPromoValue: 0,
            promoOwnerType: 'NONE'
        };
        let finalPromoValue = 0;

        if (order.allocation_status === 'PROMO_EXCLUSIVE' && order.allocation_expires_at > new Date()) {
            // Must have matching Vendor-funded promotion
            const orderArea = await ServiceArea.findOne({
                isActive: true,
                boundary: {
                    $geoIntersects: {
                        $geometry: {
                            type: 'Point',
                            coordinates: [Number(order.pickupLocation.lng), Number(order.pickupLocation.lat)]
                        }
                    }
                }
            });
            const serviceAreaId = orderArea ? orderArea._id : null;

            const matchingPromo = await Promotion.findOne({
                vendorId: vendor._id,
                owner_type: 'VENDOR',
                status: 'Active',
                approval_status: 'APPROVED',
                start_date: { $lte: new Date() },
                expiryDate: { $gte: new Date() },
                $or: [
                    { min_order_value: { $lte: order.priceBreakdown?.baseWithArea || order.totalAmount || 0 } },
                    { minOrderValue: { $lte: order.priceBreakdown?.baseWithArea || order.totalAmount || 0 } }
                ],
                $or: [
                    { geofence_id: serviceAreaId },
                    { geofence_id: null }
                ],
                $or: [
                    { scope_type: 'GLOBAL_ORDER' },
                    { scope_type: 'SELECTED_SERVICES', selected_services: { $in: serviceIds } }
                ]
            });

            if (!matchingPromo) {
                return res.status(400).json({ message: 'This order is currently in an exclusive priority window for promotional vendors.' });
            }

            // Apply Branch A (Vendor-Funded) calculations
            appliedPromo = matchingPromo;
            const promoVal = matchingPromo.discountType === 'Percentage' || matchingPromo.discountType === 'PERCENTAGE'
                ? (order.totalAmount * matchingPromo.discountValue) / 100
                : matchingPromo.discountValue;

            const standardFee = order.totalAmount * 0.10;
            finalPromoValue = Math.min(promoVal, order.totalAmount);
            // 50% of discount amount due to promotion goes to Customer's Wallet
            const customerCashback = Math.round((finalPromoValue * 0.50) * 100) / 100;

            finalLedger = {
                vendorNetPayout: order.totalAmount - standardFee - finalPromoValue,
                customerWalletCredit: customerCashback,
                platformFee: standardFee,
                spinzytCombinedRevenue: standardFee + customerCashback,
                appliedPromoValue: finalPromoValue,
                promoOwnerType: 'VENDOR'
            };

            // Wallet credit is applied only after the conditional order claim
            // succeeds, preventing duplicate credits from concurrent accepts.
        } else if (order.ledger && order.ledger.promoOwnerType === 'PLATFORM') {
            // Already populated during order creation under Branch B
        } else {
            // No promo applied, run standard B2B split (10% platform fee, 90% vendor payout)
            const standardFee = order.totalAmount * 0.10;
            finalLedger = {
                vendorNetPayout: order.totalAmount - standardFee,
                customerWalletCredit: 0,
                platformFee: standardFee,
                spinzytCombinedRevenue: standardFee,
                appliedPromoValue: 0,
                promoOwnerType: 'NONE'
            };
        }

        // Generate Invoice 1 (Customer Invoice), Invoice 2 (Platform Revenue Invoice) and Payout Ledger
        const invoiceData = await generateOrderInvoices({
            order,
            customer: customerUser,
            vendor,
            vendorPromoValue: finalPromoValue
        });

        const pickupOtp = Math.floor(1000 + Math.random() * 9000).toString();
        
        const acceptedAt = new Date();
        const vendorSnapshot = {
            displayName: vendor.displayName || null,
            shopName: vendor.shopDetails?.name || null,
            phone: vendor.phone || null,
            email: vendor.email || null,
            gstNumber: vendor.shopDetails?.gst || vendor.gstNumber || null,
            isExUser: false
        };

        const claimSet = {
            vendor: vendorId,
            status: 'RIDER_ARRIVING',
            pickupOtp,
            pickupStatus: 'scheduled',
            nearbyRiders: [],
            ledger: invoiceData.ledger,
            invoices: { customerInvoice: invoiceData.customerInvoice, platformInvoice: invoiceData.platformInvoice },
            gstSnapshot: invoiceData.gstSnapshot,
            vendorSnapshot,
            walletCreditStatus: invoiceData.ledger.customerWalletCredit > 0 ? 'PENDING' : 'NOT_APPLICABLE',
            acceptedAt
        };
        if (appliedPromo) {
            claimSet.promoApplied = appliedPromo._id;
            claimSet.discountAmount = finalPromoValue;
        }

        // The vendor assignment and status predicate form the database lock.
        // Exactly one concurrent request can change this unassigned order.
        const claimedOrder = await Order.findOneAndUpdate(
            { _id: id, vendor: null, status: 'ORDER_PLACED' },
            { $set: claimSet, $push: { statusHistory: { status: 'RIDER_ARRIVING', timestamp: acceptedAt } } },
            { new: true, runValidators: true }
        );
        if (!claimedOrder) return res.status(409).json({ message: 'Order already accepted by another vendor' });

        const walletCredit = invoiceData.ledger.customerWalletCredit;
        if (walletCredit > 0) {
            const credited = await User.updateOne(
                { _id: order.customer, creditedPromotionOrders: { $ne: order._id } },
                { $inc: { walletBalance: walletCredit }, $addToSet: { creditedPromotionOrders: order._id } }
            );
            if (credited.modifiedCount === 1) {
                await Order.updateOne(
                    { _id: order._id, walletCreditStatus: 'PENDING' },
                    { $set: { walletCreditStatus: 'CREDITED', walletCreditedAt: new Date() } }
                );
            } else {
                // A retry may observe the idempotency key already applied.
                await Order.updateOne(
                    { _id: order._id },
                    { $set: { walletCreditStatus: 'CREDITED' } }
                );
            }
        }

        // Remove availability notifications for other vendors
        await Notification.deleteMany({ orderId: id, type: 'order_available' });

        const updatedOrder = await Order.findById(id).populate('customer', 'displayName phone address location');
        const nearbyRiders = claimedOrder.nearbyRiders || [];


        // Socket.io updates
        const io = getIO();
        
        // Notify all vendors that order is taken
        io.emit('pool_update', { orderId: id, action: 'removed' }); 
        
        // Notify specific riders with EXTENDED DATA
        nearbyRiders.forEach(rider => {
            const earnings = 20 + (parseFloat(rider.distance) * 5);
            io.to(`user_${rider.id}`).emit('new_pickup_broadcast', {
                orderId: updatedOrder.orderId,
                mongoOrderId: id,
                customerName: updatedOrder.customer?.displayName || 'Customer',
                pickupAddress: updatedOrder.pickupAddress,
                dropAddress: vendor?.shopDetails?.address || vendor?.address || 'Vendor Shop',
                distance: rider.distance,
                earnings: earnings.toFixed(2)
            });
        });

        // Notify the CUSTOMER specifically
        let customerId = updatedOrder.customer;
        if (customerId && typeof customerId === 'object') {
            customerId = customerId._id || customerId.id || customerId;
        }
        customerId = customerId?.toString();

        if (customerId) {
            console.log(`🔔 [NOTIFICATION] Notifying Customer: ${customerId}`);
            io.to(`user_${customerId}`).emit('order_status_update', customerSafeOrder(updatedOrder));
            io.to(`user_${customerId}`).emit('push_notification', {
                title: 'Order Accepted! ✅',
                body: `Your order is accepted by vendor`,
                orderId: updatedOrder.orderId
            });

            // --- REAL FIREBASE PUSH NOTIFICATION ---
            try {
                console.log(`📡 [FCM_DEBUG] Starting push process for order: ${updatedOrder.orderId}`);
                const admin = (await import('../utils/firebaseAdmin.js')).default;
                const customer = await User.findById(customerId);
                
                if (customer && customer.fcmToken) {
                    console.log(`📡 [FCM_DEBUG] Found token for ${customer.phone}: ${customer.fcmToken.substring(0, 20)}...`);
                    const message = {
                        notification: {
                            title: 'Order Accepted! ✅',
                            body: `Your order is accepted by vendor`
                        },
                        data: {
                            orderId: updatedOrder.orderId.toString(),
                            type: 'ORDER_ACCEPTED'
                        },
                        token: customer.fcmToken
                    };

                    const response = await admin.messaging().send(message);
                    console.log(`🚀 [FCM_PUSH] Success! Message ID: ${response}`);
                } else {
                    console.log(`⚠️ [FCM_PUSH] Skipping push - Customer or token missing for ID: ${customerId}`);
                }
            } catch (pushErr) {
                console.error('❌ [FCM_PUSH] Error sending push notification:', pushErr.message);
                if (pushErr.stack) console.error(pushErr.stack);
            }
        }

        res.status(200).json(orderForActor(req, updatedOrder));
    } catch (err) {
        console.error('Vendor Accept Error:', err);
        if (err instanceof GstEligibilityError || err instanceof GstConfigurationError) {
            return res.status(err.status).json({ message: err.message, code: err.code });
        }
        res.status(500).json({ message: 'Error accepting order' });
    }
};

// acceptOrder removed (obsolete custom local rider flow)

// getRiderStats removed (obsolete custom local rider flow)

export const getOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        let query = {};

        if (mongoose.Types.ObjectId.isValid(id)) {
            query._id = id;
        } else {
            // Check for human-readable orderId (e.g. #SZ-8291)
            const cleanId = id.startsWith('#') ? id : `#${id}`;
            query.orderId = cleanId;
        }

        const order = await Order.findOne(query)
            .populate('customer', 'displayName phone address email customerType gstNumber')
            .populate('vendor', 'shopDetails phone location address')
            .populate('rider', 'displayName phone');

        if (!order) return res.status(404).json({ message: 'Order not found' });

        // An order is visible to the customer who placed it, the vendor handling
        // it, or an Admin — not to any logged-in account that guesses an id.
        const viewingAsCustomer = req.user?.role !== 'Admin' && isOwnerOrAdmin(req, order.customer);
        if (!viewingAsCustomer && !isOwnerOrAdmin(req, order.vendor)) {
            return res.status(403).json({ message: 'You cannot view this order' });
        }

        const orderObj = order.toObject();
        if (!orderObj.customer && orderObj.customerSnapshot?.displayName) {
            orderObj.customer = {
                displayName: orderObj.customerSnapshot.displayName,
                phone: orderObj.customerSnapshot.phone,
                address: orderObj.dropAddress,
                email: orderObj.customerSnapshot.email,
                customerType: orderObj.customerSnapshot.customerType || 'individual',
                isExUser: true
            };
        }
        if (!orderObj.vendor && orderObj.vendorSnapshot?.displayName) {
            orderObj.vendor = {
                displayName: orderObj.vendorSnapshot.displayName,
                shopDetails: { name: orderObj.vendorSnapshot.shopName || orderObj.vendorSnapshot.displayName },
                phone: orderObj.vendorSnapshot.phone,
                isExUser: true
            };
        }

        res.status(200).json(orderForActor(req, orderObj));
    } catch (err) {
        res.status(500).json({ message: 'Error fetching order details', error: err.message });
    }
};

// verifyPickupOtp removed (obsolete custom local rider flow)

/**
 * PHASE 2: Mark Order as Ready & Generate Reverse Handover OTP
 * Vendor -> Rider (Handover)
 */
export const markOrderReady = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await Order.findById(id);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        // Only the vendor processing this order (or an Admin) may mark it ready.
        if (!isOwnerOrAdmin(req, order.vendor)) {
            return res.status(403).json({ message: 'You cannot mark this order ready' });
        }

        order.status = 'READY_FOR_DISPATCH';
        
        let message = 'Order marked as ready. Handover OTP generated for Rider.';
        
        if (order.orderType === 'Walk-In' && !order.riderDropOff) {
            console.log(`[LOGISTICS] Walk-In Order ${order.orderId} marked as READY. Skipping reverse logistics handshake.`);
            if (!order.deliveryOtp) {
                order.deliveryOtp = Math.floor(1000 + Math.random() * 9000).toString();
            }
            message = 'Order marked as ready for customer self-pickup.';
        } else {
            // Generate Reverse Handshake OTP (Rider provides this to Vendor)
            const handoverOtp = Math.floor(1000 + Math.random() * 9000).toString();
            
            // Add to handshakes array
            order.logisticsHandshakes.push({
                phase: 'Reverse',
                otp: handoverOtp,
                initiator: 'Rider',
                verifier: 'Vendor'
            });

            console.log('\n========================================');
            console.log('🔄 [LOGISTICS] REVERSE HANDSHAKE INITIATED');
            console.log(`📦 Order: ${order.orderId}`);
            console.log(`🔑 RIDER OTP FOR VENDOR: ${handoverOtp}`);
            console.log('========================================\n');
        }

        await order.save();

        const populatedOrder = await Order.findById(id)
            .populate('customer', 'displayName phone address email')
            .populate('vendor', 'shopDetails address location')
            .populate('rider', 'displayName phone location');

        const io = getIO();
        io.to(`order_${id}`).emit('order_status_update', customerSafeOrder(populatedOrder));
        
        // Notify customer
        const notificationBody = (order.orderType === 'Walk-In' && !order.riderDropOff)
            ? `Your garments are ready for self-pickup! Please collect them from the store. Code: ${order.deliveryOtp}`
            : `Vendor has packed your garments. A rider is arriving for delivery.`;

        io.to(`user_${order.customer}`).emit('push_notification', {
            title: 'Your items are ready! ✨',
            body: notificationBody,
            orderId: order.orderId
        });

        res.status(200).json({ 
            message: 'Order marked as ready. Handover OTP generated for Rider.',
            order: orderForActor(req, populatedOrder)
        });
    } catch (error) {
        console.error('Mark Ready Error:', error);
        res.status(500).json({ message: 'Error updating order status' });
    }
};

/**
 * Generic Handshake Verification
 * Can be used for Collection, Reverse, Completion etc.
 */
export const verifyHandshake = async (req, res) => {
    try {
        const { id } = req.params;
        const { phase, otp } = req.body;

        const order = await Order.findById(id);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        const handshake = order.logisticsHandshakes.find(h => h.phase === phase && !h.isVerified);
        if (!handshake) {
            return res.status(400).json({ message: `No active ${phase} handshake found.` });
        }

        if (handshake.otp !== otp) {
            return res.status(400).json({ message: 'Invalid OTP. Verification failed.' });
        }

        // Mark as verified
        handshake.isVerified = true;
        handshake.verifiedAt = new Date();

        // Update Order Status based on Phase
        if (phase === 'Reverse') {
            order.status = 'OUT_FOR_DELIVERY';
            // Generate next phase (Completion) OTP for final delivery to customer
            const deliveryOtp = Math.floor(1000 + Math.random() * 9000).toString();
            order.deliveryOtp = deliveryOtp; 
            order.logisticsHandshakes.push({
                phase: 'Completion',
                otp: deliveryOtp,
                initiator: 'Rider',
                verifier: 'Customer'
            });
            
            console.log('\n========================================');
            console.log('🏁 [LOGISTICS] FINAL LEG STARTED');
            console.log(`📦 Order: ${order.orderId}`);
            console.log(`🔑 RIDER OTP FOR CUSTOMER: ${deliveryOtp}`);
            console.log('========================================\n');
        }

        if (phase === 'Completion') {
            console.log('\n========================================');
            console.log('✅ [DELIVERY] COMPLETED FOR CUSTOMER');
            console.log(`📦 Order: ${order.orderId}`);
            console.log(`🎯 Target User: ${order.customer.toString()}`);
            console.log('========================================\n');
        }

        if (phase === 'Completion') {
            await finalizeDeliveredOrder(order._id, {
                set: {
                    logisticsHandshakes: order.logisticsHandshakes.map(item => item.toObject()),
                    deliveryStatus: 'delivered'
                }
            });
        } else {
            await order.save();
        }

        const populatedOrder = await Order.findById(id)
            .populate('customer', 'displayName phone address email')
            .populate('vendor', 'shopDetails address location')
            .populate('rider', 'displayName phone location');

        const io = getIO();
        io.to(`order_${id}`).emit('order_status_update', customerSafeOrder(populatedOrder));
        io.to(`user_${order.customer.toString()}`).emit('order_status_update', customerSafeOrder(populatedOrder));

        res.status(200).json({ message: `${phase} Handshake Verified!`, order: orderForActor(req, populatedOrder) });
    } catch (error) {
        console.error('Handshake Verification Error:', error);
        if (error instanceof GstConfigurationError) return res.status(error.status).json({ message: error.message });
        res.status(500).json({ message: 'Error verifying handshake' });
    }
};

// verifyDeliveryOtp removed (obsolete custom local rider flow)

export const deleteOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await Order.findByIdAndDelete(id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        res.status(200).json({ message: 'Order deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting order', error: err.message });
    }
};
const parseWalkInDeliveryTime = (deliveryTime) => {
    const now = new Date();
    let targetDate = new Date();
    let timeSlot = '06:00 PM - 08:00 PM';

    if (deliveryTime) {
        // Handle formats with commas, e.g., "TOMORROW, Jun 13, 2026, 06:00 PM - 08:00 PM"
        const parts = deliveryTime.split(',');
        if (parts.length >= 2) {
            const timePart = parts[parts.length - 1].trim();
            const datePart = parts.slice(0, -1).join(',').trim();
            
            // Clean up weekday, TODAY, or TOMORROW prefixes
            const cleanDatePart = datePart.replace(/^(TODAY|TOMORROW|MON|TUE|WED|THU|FRI|SAT|SUN)\s*,?\s*/i, '').trim();
            
            let parsedDate;
            const yearRegex = /\b\d{4}\b/;
            if (!yearRegex.test(cleanDatePart)) {
                const testDate = new Date(`${cleanDatePart}, ${now.getFullYear()}`);
                if (!isNaN(testDate.getTime())) {
                    if (testDate < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)) {
                        parsedDate = new Date(`${cleanDatePart}, ${now.getFullYear() + 1}`);
                    } else {
                        parsedDate = testDate;
                    }
                } else {
                    parsedDate = new Date(cleanDatePart);
                }
            } else {
                parsedDate = new Date(cleanDatePart);
            }

            if (parsedDate && !isNaN(parsedDate.getTime())) {
                targetDate = parsedDate;
            } else {
                const lowerDatePart = datePart.toLowerCase();
                if (lowerDatePart.includes('today')) {
                    targetDate = now;
                } else if (lowerDatePart.includes('tomorrow')) {
                    targetDate = new Date();
                    targetDate.setDate(now.getDate() + 1);
                }
            }

            if (timePart.includes('-')) {
                timeSlot = timePart;
            } else {
                timeSlot = timePart;
            }
        } else {
            // Old format fallback
            const timeStr = deliveryTime.toLowerCase();
            if (timeStr.includes('today')) {
                targetDate = now;
                if (timeStr.includes('8 pm')) {
                    timeSlot = '08:00 PM - 10:00 PM';
                }
            } else if (timeStr.includes('tomorrow')) {
                targetDate.setDate(now.getDate() + 1);
                if (timeStr.includes('6 pm')) {
                    timeSlot = '06:00 PM - 08:00 PM';
                }
            } else if (timeStr.includes('2 days')) {
                targetDate.setDate(now.getDate() + 2);
            }
        }
    } else {
        targetDate.setDate(now.getDate() + 1);
    }

    // Format targetDate as YYYY-MM-DD
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');

    return {
        date: `${year}-${month}-${day}`,
        time: timeSlot
    };
};

export const createWalkInOrder = async (req, res) => {
    try {
        const { customerPhone, customerName, items, totalAmount, riderDropOff, dropAddress, deliveryTime } = req.body;
        // The vendor is whoever is logged in; only an Admin may raise one for a vendor.
        const vendorId = resolveActorId(req, 'vendorId');

        if (!customerPhone || !items || !vendorId) {
            return res.status(400).json({ message: 'Missing required fields for walk-in order' });
        }

        const vendorUser = await User.findById(vendorId);
        if (!vendorUser) return res.status(404).json({ message: 'Vendor not found' });
        const existingCustomer = await User.findOne({ phone: new RegExp(customerPhone.slice(-10) + '$') });
        if (existingCustomer && checkCustomerRD(existingCustomer) && !checkVendorRD(vendorUser)) {
            throw new GstEligibilityError();
        }

        // The clothes are at the counter, so the vendor must weigh them.
        const weighedWeight = parseWeightKg(req.body.weight);
        if (!weighedWeight) {
            return res.status(400).json({ message: `Enter the weight of the clothes (0.1–${MAX_WEIGHT_KG} kg)` });
        }

        // Rider delivery must be paid for (by the vendor, through Razorpay) before
        // anything is created. The fee is the server's quote, never the request's.
        let deliveryTxn = null;
        if (riderDropOff) {
            const payingVendor = await User.findById(vendorId).select('location');
            const fee = await quoteWalkInDeliveryFee(payingVendor, req.body.deliveryMode);
            const proof = req.body.logisticsPayment || {};
            try {
                deliveryTxn = await claimPayment({
                    purpose: 'WALKIN_DELIVERY',
                    payerId: req.user.id,
                    razorpay_order_id: proof.razorpay_order_id,
                    razorpay_payment_id: proof.razorpay_payment_id,
                    razorpay_signature: proof.razorpay_signature,
                    expectedAmount: fee
                });
            } catch (error) {
                if (error instanceof PaymentError) {
                    return res.status(error.status === 400 ? 402 : error.status).json({
                        message: `Rider delivery needs the delivery fee to be paid first. ${error.message}`,
                        refunded: Boolean(error.refunded)
                    });
                }
                throw error;
            }
        }

        // 1. Find or create a shadow user for this walk-in customer
        let customer = existingCustomer;
        
        let customerUpdated = false;
        if (!customer) {
            customer = new User({
                displayName: customerName || `Walk-In (${customerPhone.slice(-4)})`,
                phone: customerPhone,
                role: 'Customer',
                status: 'approved'
            });
            customerUpdated = true;
        } else if (customerName && customer.displayName !== customerName) {
            customer.displayName = customerName;
            customerUpdated = true;
        }

        if (riderDropOff && req.body.addressDetails && req.body.addressDetails.street) {
            const addr = req.body.addressDetails;
            const formattedAddress = `${addr.flatNo ? addr.flatNo + ', ' : ''}${addr.street}`;
            customer.address = formattedAddress;
            customer.location = { lat: addr.lat || 0, lng: addr.lng || 0 };
            
            // Avoid duplicates by checking if similar address already exists
            const existingAddress = customer.addresses.find(a => a.address === formattedAddress);
            if (!existingAddress) {
                customer.addresses.push({
                    type: (addr.type && addr.type.trim().toLowerCase() === 'office') ? 'Office' : (addr.type && addr.type.trim().toLowerCase() === 'other') ? 'Other' : 'Home',
                    address: formattedAddress,
                    city: addr.city || '',
                    state: addr.state || '',
                    pincode: addr.pincode || '',
                    location: {
                        lat: addr.lat || 0,
                        lng: addr.lng || 0
                    },
                    isDefault: customer.addresses.length === 0
                });
            }
            customerUpdated = true;
        }

        if (customerUpdated) {
            await customer.save();
        }

        // 2. Parse delivery slots
        const parsedDeliverySlot = parseWalkInDeliveryTime(deliveryTime);

        // 3. Setup pricing breakdown and generate Invoices
        const isCustRD = checkCustomerRD(customer);
        const walkInIds = items.map(item => item.serviceId).filter(id => mongoose.Types.ObjectId.isValid(id));
        const [walkInMasters, walkInServices] = await Promise.all([
            MasterService.find({ _id: { $in: walkInIds } }).lean(),
            Service.find({ _id: { $in: walkInIds } }).lean()
        ]);
        const walkInCatalog = new Map([...walkInMasters, ...walkInServices].map(service => [String(service._id), service]));
        const walkInItems = items.map(item => {
            const service = walkInCatalog.get(String(item.serviceId));
            const gstPercent = Number((req.body.selectedTier || req.body.tier) === 'Heritage' ? service?.heritageGst : service?.gst);
            return {
                serviceId: item.serviceId || 'walkin',
                name: item.name || item.title,
                quantity: item.quantity || 1,
                price: item.price,
                gstPercent: Number.isFinite(gstPercent) ? gstPercent : 0,
                sacCode: String(service?.sacCode || ''),
                serviceType: service?.serviceType || '',
                unit: service?.unit || 'pc'
            };
        });
        const missingSac = walkInItems.find(item => !item.sacCode);
        if (missingSac) throw new GstConfigurationError(`Missing SAC code for walk-in service: ${missingSac.name}`);
        const itemsTotal = walkInItems.reduce((s, i) => s + (i.price * i.quantity), 0);
        const deliveryChargeVal = deliveryTxn ? deliveryTxn.amountPaid : 0;
        
        const priceBreakdown = {
            baseWithArea: itemsTotal,
            expressSurcharge: 0,
            platformFee: 0,
            logisticsFee: deliveryChargeVal,
            gstAmount: 0
        };

        const tempOrderId = `#WL-${Date.now().toString().slice(-4)}`;
        const invoiceData = await generateOrderInvoices({
            order: { _id: new mongoose.Types.ObjectId(), orderId: tempOrderId, orderType: 'Walk-In', items: walkInItems, priceBreakdown, deliveryCharge: deliveryChargeVal },
            customer,
            vendor: vendorUser,
            vendorPromoValue: 0
        });

        // 4. Create the order
        const newOrder = new Order({
            customer: customer._id,
            vendor: vendorId,
            items: walkInItems,
            totalWeight: weighedWeight,
            weightSource: 'weighed',
            weighedWeight,
            weighedAt: new Date(),
            status: 'PROCESSING', // Direct to progress
            paymentStatus: 'Paid', // Assuming cash/direct payment for walk-in
            totalAmount: invoiceData.customerInvoice.totalAmount || totalAmount,
            orderType: 'Walk-In',
            tier: req.body.selectedTier || req.body.tier || 'Essential',
            deliveryMode: req.body.deliveryMode || 'Normal',
            deliveryCharge: deliveryChargeVal,
            priceBreakdown,
            isCustomerRD: isCustRD,
            customerSnapshot: {
                displayName: customer.displayName || null,
                phone: customer.phone || null,
                email: customer.email || null,
                customerType: customer.customerType || 'individual',
                gstNumber: customer.gstNumber || null,
                isExUser: false
            },
            vendorSnapshot: {
                displayName: vendorUser?.displayName || null,
                shopName: vendorUser?.shopDetails?.name || null,
                phone: vendorUser?.phone || null,
                email: vendorUser?.email || null,
                gstNumber: vendorUser?.shopDetails?.gst || vendorUser?.gstNumber || null,
                isExUser: false
            },
            invoices: {
                customerInvoice: invoiceData.customerInvoice,
                platformInvoice: invoiceData.platformInvoice
            },
            gstSnapshot: invoiceData.gstSnapshot,
            ledger: invoiceData.ledger,
            riderDropOff: Boolean(deliveryTxn),
            logisticsPayment: deliveryTxn
                ? {
                    razorpayOrderId: deliveryTxn.razorpayOrderId,
                    razorpayPaymentId: deliveryTxn.razorpayPaymentId,
                    amount: deliveryTxn.amountPaid,
                    status: 'PAID'
                }
                : { status: 'NOT_APPLICABLE' },
            pickupStatus: 'picked',
            pickupExpectedDate: new Date(),
            pickupSlot: {
                date: new Date().toISOString().split('T')[0],
                time: new Date().toLocaleTimeString()
            },
            deliverySlot: parsedDeliverySlot,
            pickupAddress: 'Store Walk-In',
            dropAddress: riderDropOff ? dropAddress : 'Store Pickup',
            pickupLocation: { lat: 0, lng: 0 },
            dropLocation: { lat: 0, lng: 0 }
        });

        try {
            await newOrder.save();
        } catch (saveError) {
            if (deliveryTxn) await refundConsumed(deliveryTxn, 'Walk-in order could not be saved');
            throw saveError;
        }
        if (deliveryTxn) await linkPayment(deliveryTxn, 'Order', [newOrder._id]);
        
        // Send automated welcome SMS + WhatsApp message containing the Spinzyt app download link
        const welcomeMsg = `Thank u for taking our service if u have to see your service status plz download our app\nhttps://spinzyt.com/app`;
        await sendSMSMessage(customerPhone, welcomeMsg);
        await sendWhatsAppMessage(customerPhone, welcomeMsg);
        
        // Notify the generated customer shadow account (optional)
        const io = getIO();
        io.to(`user_${customer._id}`).emit('new_order_available', {
            orderId: newOrder._id,
            displayId: newOrder.orderId
        });

        res.status(201).json(orderForActor(req, newOrder));
    } catch (err) {
        console.error('Walk-In Creation Error:', err);
        if (err instanceof GstEligibilityError || err instanceof GstConfigurationError) {
            return res.status(err.status).json({ message: err.message, code: err.code });
        }
        res.status(500).json({ message: 'Internal server error', error: err.message });
    }
};

export const cancelOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await Order.findById(id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Only the customer who placed it (or an Admin) may cancel.
        if (!isOwnerOrAdmin(req, order.customer)) {
            return res.status(403).json({ message: 'You cannot cancel this order' });
        }

        // 1. Check time limit: 2 hours (120 minutes)
        const now = new Date();
        const orderTime = new Date(order.createdAt);
        const diffInMs = now.getTime() - orderTime.getTime();
        const diffInMinutes = diffInMs / (1000 * 60);

        if (diffInMinutes > 120) {
            return res.status(400).json({ message: 'Orders can only be cancelled within 2 hours of placement.' });
        }

        // 2. Check status: Only allow cancellation if order has not been picked up or processed yet.
        const cancellableStatuses = ['ORDER_PLACED', 'PICKUP_ASSIGNED', 'RIDER_ARRIVING'];
        if (!cancellableStatuses.includes(order.status)) {
            return res.status(400).json({ 
                message: `Order cannot be cancelled because it is already in status: ${order.status}` 
            });
        }

        let refundLog = '';
        let walletRefunded = 0;
        let onlineRefunded = 0;

        // 3. Online refund first: if Razorpay refuses, nothing else has changed and
        // the cancellation can simply be retried. Refund exactly what was captured
        // (the ledger's figure; older orders: total − discount − wallet).
        const paymentTxn = order.razorpayPaymentId
            ? await PaymentTransaction.findOne({ razorpayPaymentId: order.razorpayPaymentId })
            : null;
        const refundAmount = paymentTxn?.amountPaid
            ?? Math.max(0, (order.totalAmount || 0) - (order.discountAmount || 0) - (order.walletAmountDeducted || 0));
        if (order.paymentMethod === 'Online' && order.paymentStatus === 'Paid' && order.razorpayPaymentId && refundAmount > 0) {
            let razorpay;
            try {
                razorpay = getRazorpay();
            } catch {
                console.error('❌ [REFUND] Razorpay keys not configured on server');
                return res.status(503).json({ message: 'Online refunds are not available right now. Please try again later.' });
            }

            console.log(`💳 [REFUND] Initiating Razorpay refund for payment ${order.razorpayPaymentId} of amount ₹${refundAmount}`);
            const refundResult = await razorpay.payments.refund(order.razorpayPaymentId, {
                amount: Math.round(refundAmount * 100), // paise
                speed: 'normal',
                notes: {
                    orderId: order.orderId || order._id.toString(),
                    reason: 'Customer cancelled within 2 hours'
                }
            });
            console.log(`💳 [REFUND] Razorpay refund success:`, refundResult.id);
            onlineRefunded = refundAmount;
            refundLog += `Refunded ₹${onlineRefunded} via Razorpay (Refund ID: ${refundResult.id}). `;
            if (paymentTxn) {
                await PaymentTransaction.updateOne(
                    { _id: paymentTxn._id },
                    { status: 'refunded', refundId: refundResult.id, refundedAt: new Date(), failureReason: 'Order cancelled' }
                );
            }
        }

        // 4. Wallet refund (atomic increment)
        if (order.walletAmountDeducted && order.walletAmountDeducted > 0) {
            const credited = await User.findByIdAndUpdate(
                order.customer,
                { $inc: { walletBalance: order.walletAmountDeducted } },
                { new: true }
            );
            if (credited) {
                walletRefunded = order.walletAmountDeducted;
                refundLog += `Refunded ₹${walletRefunded} to customer wallet. `;
                console.log(`💸 [WALLET REFUND] Restored ₹${walletRefunded} to customer ${credited.phone}`);
            }
        }

        // 5. Update order status
        order.status = 'CANCELLED';
        const totalRefunded = onlineRefunded + walletRefunded;
        if (order.paymentStatus === 'Paid' || totalRefunded > 0) {
            order.paymentStatus = 'Refunded';
        }
        order.onlineRefundAmount = onlineRefunded;
        order.walletRefundAmount = walletRefunded;
        order.refundAmount = totalRefunded;
        if (totalRefunded > 0) order.refundedAt = new Date();
        await order.save();

        const updatedOrder = await Order.findById(id)
            .populate('customer', 'displayName phone address email customerType gstNumber')
            .populate('vendor', 'shopDetails address location')
            .populate('rider', 'displayName phone location');

        // 6. Broadcast updates via Socket.io
        const io = getIO();
        io.to(`order_${id}`).emit('order_status_update', customerSafeOrder(updatedOrder));
        if (updatedOrder.vendor) {
            const vendorId = updatedOrder.vendor._id || updatedOrder.vendor;
            io.to(`user_${vendorId}`).emit('order_status_update', updatedOrder);
        }
        if (updatedOrder.customer) {
            const customerId = updatedOrder.customer._id || updatedOrder.customer;
            io.to(`user_${customerId}`).emit('order_status_update', customerSafeOrder(updatedOrder));
        }

        // 7. Send push notifications
        try {
            const admin = (await import('../utils/firebaseAdmin.js')).default;
            if (updatedOrder.customer && updatedOrder.customer.fcmToken) {
                const message = {
                    notification: {
                        title: 'Order Cancelled 🚫',
                        body: `Your order ${updatedOrder.orderId || ''} has been successfully cancelled and refund initiated.`
                    },
                    data: {
                        orderId: updatedOrder._id.toString(),
                        type: 'ORDER_CANCELLED'
                    },
                    token: updatedOrder.customer.fcmToken
                };
                await admin.messaging().send(message);
            }
            if (updatedOrder.vendor && updatedOrder.vendor.fcmToken) {
                const message = {
                    notification: {
                        title: 'Order Cancelled 🚫',
                        body: `Order ${updatedOrder.orderId || ''} has been cancelled by the customer.`
                    },
                    data: {
                        orderId: updatedOrder._id.toString(),
                        type: 'ORDER_CANCELLED'
                    },
                    token: updatedOrder.vendor.fcmToken
                };
                await admin.messaging().send(message);
            }
        } catch (pushErr) {
            console.error('❌ [FCM] Notification error on cancel:', pushErr.message);
        }

        res.status(200).json({
            message: 'Order cancelled successfully',
            refundLog,
            order: orderForActor(req, updatedOrder)
        });

    } catch (err) {
        console.error('Cancel Order Error:', err);
        res.status(500).json({ message: 'Error cancelling order', error: err.message });
    }
};

/**
 * RBAC Invoice Endpoint:
 * - Invoice 1 (Customer Invoice): Accessible by owning Customer and Vendor
 * - Invoice 2 (Platform Revenue Invoice): Strictly accessible ONLY by the owning Vendor
 */
export const getOrderInvoices = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await Order.findById(id).populate('customer', 'displayName phone address email customerType gstNumber');
        if (!order) return res.status(404).json({ message: 'Order not found' });

        const actorId = req.user?.id;
        const actorRole = req.user?.role;

        const isCustomer = actorRole === 'Customer' && order.customer && (order.customer._id?.toString() === actorId || order.customer.toString() === actorId);
        const isVendor = actorRole === 'Vendor' && order.vendor && (order.vendor._id?.toString() === actorId || order.vendor.toString() === actorId);
        if (!isCustomer && !isVendor) {
            return res.status(403).json({ message: 'Not authorized to view invoices for this order' });
        }

        if (order.status !== 'DELIVERED' || order.invoiceFinalizationStatus !== 'FINALIZED') {
            return res.status(409).json({
                message: 'Final invoices become available after delivery.',
                invoiceStatus: order.invoiceFinalizationStatus || 'NOT_READY'
            });
        }

        let invoices = order.invoices;
        if (!invoices?.customerInvoice?.invoiceNo || !invoices?.platformInvoice?.invoiceNo) {
            return res.status(500).json({ message: 'Finalized invoice data is incomplete. Please contact support.' });
        }

        // Access Control Rule:
        // Invoice 1: Customer Invoice -> Only Customer and Vendor can see it.
        // Invoice 2: Platform Revenue Invoice -> Only Vendor can see it. (Strictly hidden from customer)
        if (isCustomer && !isVendor) {
            return res.status(200).json({
                orderId: order._id,
                orderNo: order.orderId,
                customerInvoice: invoices.customerInvoice
            });
        }

        return res.status(200).json({
            orderId: order._id,
            orderNo: order.orderId,
            customerInvoice: invoices.customerInvoice,
            platformInvoice: invoices.platformInvoice
        });
    } catch (err) {
        console.error('Error fetching order invoices:', err);
        if (err instanceof GstEligibilityError || err instanceof GstConfigurationError) {
            return res.status(err.status).json({ message: err.message, code: err.code });
        }
        res.status(500).json({ message: 'Error fetching order invoices', error: err.message });
    }
};

// Vendor records the measured weight once the clothes are with them.
// It replaces the admin-configured Avg Weight estimate.
const WEIGHABLE_STATUSES = ['RECEIVED_BY_VENDOR', 'PROCESSING', 'READY_FOR_DISPATCH'];
export const recordOrderWeight = async (req, res) => {
    try {
        const weighedWeight = parseWeightKg(req.body.weight);
        if (!weighedWeight) {
            return res.status(400).json({ message: `Weight must be between 0.1 and ${MAX_WEIGHT_KG} kg` });
        }
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        const isAdmin = req.user?.role === 'Admin';
        if (!isAdmin && String(order.vendor) !== String(req.user?.id)) {
            return res.status(403).json({ message: 'Only the vendor handling this order can record its weight' });
        }
        if (!isAdmin && !WEIGHABLE_STATUSES.includes(order.status)) {
            return res.status(400).json({ message: 'Weight can be recorded once the clothes have reached you' });
        }

        order.weighedWeight = weighedWeight;
        order.weighedAt = new Date();
        order.totalWeight = weighedWeight;
        order.weightSource = 'weighed';
        await order.save();
        res.json({
            message: 'Weight recorded',
            weight: { totalWeight: order.totalWeight, weightSource: order.weightSource, weighedAt: order.weighedAt, customerWeight: order.customerWeight }
        });
    } catch (err) {
        sendError(res, err, 'Error recording weight');
    }
};
