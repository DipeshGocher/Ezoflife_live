import { createAdminReportScope } from '../utils/adminReportScope.js';
import B2BOrder from '../models/B2BOrder.js';
import User from '../models/User.js';
import VendorMasterSupply from '../models/VendorMasterSupply.js';
import SystemConfig from '../models/SystemConfig.js';
import { getNextDeliveryDate, generateCycleId, isBeforeCutoff, DAYS } from '../utils/cycleHelper.js';
import admin from '../utils/firebaseAdmin.js';
import { sendError } from '../utils/errorResponse.js';
import SupplierServiceZone from '../models/SupplierServiceZone.js';
import { verifyRazorpayPayment } from '../utils/paymentVerification.js';
import { isRazorpayConfigured } from '../utils/razorpayClient.js';
import { openCheckout } from '../services/paymentLedger.js';
import PaymentTransaction from '../models/PaymentTransaction.js';
import {
    PLATFORM_FEE_CONFIG_KEY,
    computePlatformFee,
    describeFeeRule,
    effectiveWholesaleRate,
    loadGlobalFeeConfig,
    resolveFeeRule,
    validateGlobalConfig
} from '../utils/b2bPlatformFee.js';

const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Group cart items by supplier and work out each group's platform fee from
 * DB prices and admin-configured rules. Shared by /quote and /place so the
 * vendor is charged exactly what they were shown.
 */
const buildSupplierFeeGroups = async (items, pincode) => {
    const materialIds = items.map(i => i.materialId).filter(Boolean);
    const supplyProducts = await VendorMasterSupply.find({ _id: { $in: materialIds } }).select('+costPrice');
    const productMap = {};
    supplyProducts.forEach(p => { productMap[p._id.toString()] = p; });

    const groups = {};
    items.forEach(item => {
        const product = productMap[item.materialId?.toString()];
        const sId = product?.supplierId || '-';
        if (!groups[sId]) groups[sId] = { supplierId: sId, items: [], goodsSubtotal: 0 };
        const quantity = Number(item.quantity) || 0;
        const gst = Number(product?.gst) || 18;
        const wholesaleRate = product ? effectiveWholesaleRate(product, quantity) : 0;
        groups[sId].items.push({
            ...item,
            name: product?.materialName || item.name,
            quantity,
            // Store the supplier's GST-inclusive unit price from the database;
            // never trust a cart-supplied price for the order value.
            price: round2(wholesaleRate * (1 + gst / 100)),
            costPrice: product && Number(product.costPrice) > 0 ? Number(product.costPrice) : null,
            gst
        });
        if (product) {
            groups[sId].goodsSubtotal += wholesaleRate * quantity;
            groups[sId].movFreeDelivery = Math.max(
                Number(groups[sId].movFreeDelivery) || 0,
                Number(product.movFreeDelivery) || 0
            );
        }
    });

    const supplierIds = Object.keys(groups).filter(id => id !== '-');
    const zones = supplierIds.length
        ? await SupplierServiceZone.find({ supplierId: { $in: supplierIds }, isActive: true }).lean()
        : [];
    const globalConfig = await loadGlobalFeeConfig(SystemConfig);
    const pin = pincode ? String(pincode).trim() : null;

    for (const group of Object.values(groups)) {
        const supplierZones = zones.filter(z => z.supplierId === group.supplierId);
        // Prefer the zone that actually serves the delivery pincode.
        const zone = supplierZones.find(z => pin && (z.pincodes || []).map(String).includes(pin)) || supplierZones[0] || null;
        group.goodsSubtotal = round2(group.goodsSubtotal);
        group.rule = resolveFeeRule(zone, globalConfig);
        group.platformFee = computePlatformFee(group.goodsSubtotal, group.rule);
        const configuredDelivery = Number(zone?.deliveryCharges) || 0;
        const belowFreeDelivery = group.movFreeDelivery > 0 && group.goodsSubtotal < group.movFreeDelivery;
        group.deliveryCharge = belowFreeDelivery
            ? (configuredDelivery > 0 ? configuredDelivery : 50)
            : (group.movFreeDelivery > 0 ? 0 : configuredDelivery);
        const itemsWithGst = group.items.reduce(
            (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0),
            0
        );
        group.supplierPayableAmount = round2(itemsWithGst + group.deliveryCharge);
    }

    return Object.values(groups);
};

const decreaseSupplyStock = async (order) => {
    try {
        if (order.stockDecreased) {
            console.log(`ℹ️ [STOCK_DECREASE] Stock already decreased for order #${order.b2bOrderId || order._id}`);
            return;
        }
        console.log(`📦 [STOCK_DECREASE] Processing order #${order.b2bOrderId || order._id}`);
        for (const item of order.items) {
            if (!item.materialId) continue;
            const supply = await VendorMasterSupply.findById(item.materialId);
            if (supply) {
                const orderedQty = Number(item.quantity) || 0;
                if (orderedQty <= 0) continue;

                const currentStockStr = (supply.quantity || '0').trim();
                if (currentStockStr === '-' || currentStockStr === '') {
                    console.log(`⚠️ [STOCK_DECREASE] Material "${supply.materialName}" has no numeric stock: "${currentStockStr}". Skipping.`);
                    continue;
                }

                // Parse number and potential text unit
                const match = currentStockStr.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
                if (match) {
                    const currentNum = parseFloat(match[1]);
                    const unitSuffix = match[2] || '';
                    
                    const newNum = Math.max(0, currentNum - orderedQty);
                    supply.quantity = unitSuffix ? `${newNum} ${unitSuffix}` : `${newNum}`;
                    
                    await supply.save();
                    console.log(`✅ [STOCK_DECREASE] Material "${supply.materialName}" stock reduced: ${currentStockStr} -> ${supply.quantity} (Ordered: ${orderedQty})`);
                } else {
                    // Fallback: Try raw number parse
                    const currentNum = parseFloat(currentStockStr) || 0;
                    const newNum = Math.max(0, currentNum - orderedQty);
                    supply.quantity = `${newNum}`;
                    await supply.save();
                    console.log(`✅ [STOCK_DECREASE] Material "${supply.materialName}" stock reduced: ${currentNum} -> ${newNum} (Ordered: ${orderedQty})`);
                }
            }
        }
        // Mark order as stock decreased to ensure idempotency
        await B2BOrder.findByIdAndUpdate(order._id, { stockDecreased: true });
    } catch (err) {
        console.error('❌ [STOCK_DECREASE_ERROR] Failed to decrease stock:', err);
    }
};

// Place B2B Order with Aggregation & Cycle Logic

export const placeB2BOrder = async (req, res) => {
    console.log('\n🚨 [B2B_ORDER_INCOMING] ----------------------------------------');
    console.log('📦 Body:', JSON.stringify(req.body, null, 2));
    try {
        // totalPlatformFee from the client is deliberately ignored: the fee is computed server-side.
        const { vendorId, items, shippingAddress } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: 'items must be a non-empty array' });
        }
        
        // 0. Fetch Vendor to get fallback location info
        const vendor = await User.findById(vendorId);
        if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

        const cleanLocation = (val) => {
            if (!val || val === 'Unknown' || val === 'undefined') return null;
            return val.toString().trim();
        };

        let pincode = cleanLocation(req.body.pincode) || cleanLocation(vendor.shopDetails?.pincode) || cleanLocation(vendor.pincode);
        let city = cleanLocation(req.body.city) || cleanLocation(vendor.shopDetails?.city) || cleanLocation(vendor.city);
        let state = cleanLocation(req.body.state) || cleanLocation(vendor.shopDetails?.state)
            || cleanLocation((vendor.addresses || []).find(address => address.isDefault)?.state)
            || cleanLocation(vendor.addresses?.[0]?.state);

        if (!pincode && vendor.shopDetails?.address) {
            const pinMatch = vendor.shopDetails.address.match(/\b\d{6}\b/);
            if (pinMatch) {
                pincode = pinMatch[0];
                if (vendor.shopDetails) {
                    vendor.shopDetails.pincode = pincode;
                    await vendor.save();
                }
            }
        }

        if (!pincode && vendor.address) {
            const pinMatch = vendor.address.match(/\b\d{6}\b/);
            if (pinMatch) {
                pincode = pinMatch[0];
            }
        }

        // Safe fallbacks to prevent Mongoose schema validation failure
        if (!pincode) pincode = '452001';
        if (!city) city = 'Indore';
        if (!state) state = '-';

        const cleanAddress = (addr) => {
            if (!addr) return null;
            const trimmed = addr.trim();
            const invalidTokens = [',', ', ', 'undefined', 'null', '.', '. '];
            if (invalidTokens.includes(trimmed)) {
                return null;
            }
            return trimmed;
        };

        const finalShippingAddress = cleanAddress(shippingAddress) || 
                                     cleanAddress(vendor.shopDetails?.address) || 
                                     cleanAddress(vendor.address) || 
                                     cleanAddress(vendor.businessAddress) || 
                                     `${city}, ${pincode}`.trim();

        // 1. Get Global Delivery Day
        const config = await SystemConfig.findOne({ key: 'delivery_day' });
        let deliveryDayName = 'Sunday';
        if (config && config.value && typeof config.value === 'string') {
            const foundDay = DAYS.find(d => d.toLowerCase() === config.value.trim().toLowerCase());
            if (foundDay) deliveryDayName = foundDay;
        }

        // 2. Calculate Delivery Date & Cycle
        const deliveryDate = getNextDeliveryDate(deliveryDayName);
        const cycleId = generateCycleId(deliveryDate);

        console.log(`📦 [B2B_AGGREGATION] Order Attempt -> Vendor: ${vendor.displayName} | Pincode: ${pincode} | City: ${city}`);

        // 3. Group items by supplier and compute each supplier order's platform fee
        const feeGroups = await buildSupplierFeeGroups(items, pincode);
        const totalPlatformFee = round2(feeGroups.reduce((acc, g) => acc + g.platformFee, 0));
        const feeDue = totalPlatformFee > 0;

        // 4. Open the Razorpay order BEFORE persisting anything, so a gateway
        //    failure never leaves orphaned PENDING_PAYMENT orders behind.
        let rzpOrder = null;
        if (feeDue) {
            if (!isRazorpayConfigured()) {
                return res.status(503).json({ message: 'Payment gateway is not configured. Cannot collect the platform fee right now.' });
            }
            try {
                const checkout = await openCheckout({
                    purpose: 'B2B_PLATFORM_FEE',
                    payerId: vendorId,
                    amount: totalPlatformFee,
                    quote: { groups: feeGroups.map(g => ({ supplierId: g.supplierId, goods: g.goodsSubtotal, fee: g.platformFee })) }
                });
                rzpOrder = { id: checkout.razorpayOrderId, keyId: checkout.keyId };
            } catch (gatewayErr) {
                console.error('❌ [B2B_PLATFORM_FEE] Razorpay order creation failed:', gatewayErr?.error?.description || gatewayErr.message);
                return res.status(502).json({ message: 'Could not start the platform fee payment. Please try again.' });
            }
        }

        const createdOrders = [];

        // For each supplier group, create or aggregate separate orders
        for (const feeGroup of feeGroups) {
            const sId = feeGroup.supplierId;
            const groupItems = feeGroup.items;
            // Find supplier user ObjectId by phone suffix matching
            let supplierObjectId = null;
            let supplierApp = null;
            if (sId !== '-') {
                const suffix = sId.split('-')[1];
                if (suffix) {
                    const supplierUser = await User.findOne({
                        role: 'Supplier',
                        phone: { $regex: new RegExp(suffix + '$') }
                    });
                    if (supplierUser) {
                        supplierObjectId = supplierUser._id;
                        const SupplierApplication = (await import('../models/SupplierApplication.js')).default;
                        supplierApp = await SupplierApplication.findOne({ user: supplierObjectId });
                    }
                }
            }

            let groupDeliveryDate = deliveryDate;
            let groupDeliveryDay = deliveryDayName;
            let groupCycleId = cycleId;

            if (supplierApp && supplierApp.deliveryFrequency && supplierApp.deliveryFrequency.length > 0) {
                const freq = supplierApp.deliveryFrequency;
                const now = new Date();

                if (freq.includes('Daily')) {
                    // Delivery tomorrow
                    groupDeliveryDate = new Date();
                    groupDeliveryDate.setDate(now.getDate() + 1);
                    groupDeliveryDate.setHours(23, 59, 59, 999);
                    groupDeliveryDay = DAYS[groupDeliveryDate.getDay()];
                    groupCycleId = generateCycleId(groupDeliveryDate);
                } else if (freq.includes('Thrice a Week') || freq.includes('On-Demand')) {
                    // Delivery in 2 days
                    groupDeliveryDate = new Date();
                    groupDeliveryDate.setDate(now.getDate() + 2);
                    groupDeliveryDate.setHours(23, 59, 59, 999);
                    groupDeliveryDay = DAYS[groupDeliveryDate.getDay()];
                    groupCycleId = generateCycleId(groupDeliveryDate);
                } else if (freq.includes('Weekly')) {
                    // Delivery next global delivery day (Sunday)
                    groupDeliveryDate = getNextDeliveryDate(deliveryDayName);
                    groupDeliveryDay = deliveryDayName;
                    groupCycleId = generateCycleId(groupDeliveryDate);
                }
            }

            const groupTotal = feeGroup.supplierPayableAmount;

            // Create new order (No aggregation for Upfront payment flow)
            console.log(`✨ [B2B_CHECKOUT] Creating new order for supplier ${sId}`);
            let order = new B2BOrder({
                vendor: vendorId,
                supplier: supplierObjectId, // PRE-ASSIGNED!
                items: groupItems,
                totalAmount: groupTotal,
                deliveryCharge: feeGroup.deliveryCharge,
                platformFee: feeGroup.platformFee,
                platformFeeBase: feeGroup.goodsSubtotal,
                platformFeeRule: feeGroup.rule,
                platformFeeStatus: feeGroup.platformFee > 0 ? 'PENDING' : 'NOT_APPLICABLE',
                razorpayOrderId: rzpOrder ? rzpOrder.id : undefined,
                shippingAddress: finalShippingAddress,
                pincode,
                city: city?.trim(),
                shippingAddress: finalShippingAddress || 'Store Address',
                pincode: pincode || '452001',
                city: (city || 'Indore').trim(),
                state,
                status: feeDue ? 'PENDING_PAYMENT' : 'SUBMITTED',
                cycleId: groupCycleId,
                deliveryDay: groupDeliveryDay,
                deliveryDate: groupDeliveryDate,
                // Spinzyt collects only platformFee. The supplier invoice is
                // settled directly between the vendor and supplier.
                paymentStatus: 'Direct',
                escrowStatus: 'Not Applicable'
            });
            await order.save();
            createdOrders.push(order);
        }

        // An explicitly fee-free order can be submitted immediately. This does
        // not mark the supplier invoice paid; that remains a direct settlement.
        if (!feeDue) {
            for (let order of createdOrders) {
                order.status = 'SUBMITTED';
                await order.save();
                await decreaseSupplyStock(order);
            }
        }

        res.status(201).json({ 
            message: 'Orders submitted successfully!',
            orders: createdOrders,
            razorpayOrderId: rzpOrder ? rzpOrder.id : null,
            razorpayKeyId: rzpOrder ? rzpOrder.keyId : null,
            platformFeeAmount: totalPlatformFee || 0,
            supplierPayableAmount: round2(createdOrders.reduce((sum, order) => sum + (Number(order.totalAmount) || 0), 0))
        });

    } catch (err) {
        console.error('💥 [B2B_AGGREGATION_ERROR]:', err);
        sendError(res, err, 'Internal server error while placing order');
    }
};

// Verify Platform Fee Payment and Confirm Order

/**
 * Confirm the B2B orders paid for by one platform-fee checkout. Used by the
 * vendor's checkout callback and by the Razorpay webhook / reconciler, so an
 * order is confirmed even if the vendor's browser closes after paying.
 * Idempotent: each order moves PENDING_PAYMENT -> SUBMITTED at most once.
 */
export const confirmPlatformFeeOrders = async (razorpayOrderId, paymentId) => {
    const orders = await B2BOrder.find({ razorpayOrderId, status: 'PENDING_PAYMENT' }).select('_id');
    const confirmed = [];
    for (const { _id } of orders) {
        const order = await B2BOrder.findOneAndUpdate(
            { _id, status: 'PENDING_PAYMENT' },
            { status: 'SUBMITTED', platformFeePaymentId: paymentId, platformFeeStatus: 'PAID' },
            { new: true }
        );
        if (!order) continue; // confirmed concurrently
        if (!(order.platformFee > 0)) await B2BOrder.updateOne({ _id }, { platformFeeStatus: 'NOT_APPLICABLE' });
        await decreaseSupplyStock(order);
        confirmed.push(order);

        if (order.supplier) {
            try {
                const supplier = await User.findById(order.supplier);
                if (supplier && supplier.fcmToken) {
                    await admin.messaging().send({
                        notification: {
                            title: 'New Confirmed B2B Order',
                            body: 'A vendor has placed and confirmed a new order with you.'
                        },
                        data: { type: 'NEW_B2B_ORDER', orderId: order._id.toString() },
                        token: supplier.fcmToken
                    });
                }
            } catch (pushErr) {
                console.error('❌ [FCM_PUSH] Supplier Notification Error:', pushErr.message);
            }
        }
    }
    const ids = (await B2BOrder.find({ razorpayOrderId }).select('_id')).map(o => o._id);
    await PaymentTransaction.updateOne(
        { razorpayOrderId, status: { $in: ['created', 'paid'] } },
        { status: 'consumed', consumedAt: new Date(), razorpayPaymentId: paymentId, 'consumedBy.kind': 'B2BOrder', 'consumedBy.ids': ids }
    );
    return confirmed;
};

// Verify Platform Fee Payment and Confirm Order
export const verifyPlatformFeePayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        if (!razorpay_order_id) {
            return res.status(400).json({ message: 'razorpay_order_id is required' });
        }

        // The orders are identified by the Razorpay order they were placed under,
        // never by client-supplied ids, so a payment can only confirm its own orders.
        const orders = await B2BOrder.find({ razorpayOrderId: razorpay_order_id });
        if (orders.length === 0) {
            return res.status(404).json({ message: 'No orders found for this payment' });
        }

        const isAdmin = req.user?.role === 'Admin';
        if (!isAdmin && orders.some(o => o.vendor?.toString() !== req.user?.id)) {
            return res.status(403).json({ message: 'These orders do not belong to you' });
        }

        if (!orders.some(o => o.status === 'PENDING_PAYMENT')) {
            // Already confirmed (retried callback, or the webhook got there first).
            return res.json({ message: 'Payment already verified', orders });
        }

        const expectedAmount = round2(orders.reduce((acc, o) => acc + (Number(o.platformFee) || 0), 0));
        const verification = await verifyRazorpayPayment({
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            expectedAmount
        });
        if (!verification.ok) {
            return res.status(400).json({ message: verification.reason });
        }

        await confirmPlatformFeeOrders(razorpay_order_id, verification.paymentId);
        const updated = await B2BOrder.find({ razorpayOrderId: razorpay_order_id });
        res.json({ message: 'Payment verified and orders confirmed successfully', orders: updated });
    } catch (error) {
        console.error('💥 [VERIFY_PAYMENT_ERROR]:', error);
        sendError(res, error, 'Error verifying platform fee payment');
    }
};

// Preview the platform fee for a cart. Uses the same calculation as /place.
export const quotePlatformFee = async (req, res) => {
    try {
        const { items } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: 'items must be a non-empty array' });
        }

        let pincode = req.body.pincode ? String(req.body.pincode).trim() : null;
        if (!pincode && req.user?.id) {
            const vendor = await User.findById(req.user.id).select('shopDetails pincode').lean();
            pincode = vendor?.shopDetails?.pincode || vendor?.pincode || null;
        }

        const groups = await buildSupplierFeeGroups(items, pincode);
        res.json({
            totalPlatformFee: round2(groups.reduce((acc, g) => acc + g.platformFee, 0)),
            groups: groups.map(g => ({
                supplierId: g.supplierId,
                goodsSubtotal: g.goodsSubtotal,
                supplierPayableAmount: g.supplierPayableAmount,
                deliveryCharge: g.deliveryCharge,
                platformFee: g.platformFee,
                rule: g.rule,
                ruleLabel: describeFeeRule(g.rule)
            }))
        });
    } catch (error) {
        console.error('💥 [B2B_FEE_QUOTE_ERROR]:', error);
        sendError(res, error, 'Error calculating platform fee');
    }
};

// Admin: the global B2B platform fee default
export const getPlatformFeeConfig = async (req, res) => {
    try {
        const config = await loadGlobalFeeConfig(SystemConfig);
        res.json({ ...config, label: describeFeeRule(resolveFeeRule(null, config)) });
    } catch (error) {
        sendError(res, error, 'Error loading platform fee settings');
    }
};

export const updatePlatformFeeConfig = async (req, res) => {
    try {
        const result = validateGlobalConfig(req.body);
        if (!result.ok) return res.status(400).json({ message: result.message });

        await SystemConfig.findOneAndUpdate(
            { key: PLATFORM_FEE_CONFIG_KEY },
            { value: result.config, description: 'Default platform fee charged to vendors on supplier (B2B) orders' },
            { upsert: true, new: true }
        );
        res.json({ ...result.config, label: describeFeeRule(resolveFeeRule(null, result.config)) });
    } catch (error) {
        sendError(res, error, 'Error saving platform fee settings');
    }
};

// Admin: every vendor -> supplier order, with its platform fee
export const getAdminB2BOrders = async (req, res) => {
    try {
        const { status, platformFeeStatus } = req.query;
        const query = {};
        if (status) query.status = status;
        if (platformFeeStatus) query.platformFeeStatus = platformFeeStatus;

        const orders = await B2BOrder.find(query)
            .select('-deliveryOtp')
            .populate('vendor', 'displayName phone shopDetails.name')
            .populate('supplier', 'displayName phone supplierDetails.businessName')
            .sort({ createdAt: -1 })
            .limit(1000)
            .lean();

        const summary = orders.reduce((acc, o) => {
            const fee = Number(o.platformFee) || 0;
            if (o.status === 'PENDING_PAYMENT') acc.pendingFees += fee;
            else if (!['CANCELLED', 'Cancelled', 'REJECTED'].includes(o.status)) acc.collectedFees += fee;
            acc.goodsValue += Number(o.totalAmount) || 0;
            return acc;
        }, { collectedFees: 0, pendingFees: 0, goodsValue: 0 });

        res.json({
            orders,
            summary: {
                count: orders.length,
                collectedFees: round2(summary.collectedFees),
                pendingFees: round2(summary.pendingFees),
                goodsValue: round2(summary.goodsValue)
            }
        });
    } catch (error) {
        sendError(res, error, 'Error fetching vendor supply orders');
    }
};

// Get orders for a specific Supplier (Assigned + Regional Pool)
export const getSupplierOrders = async (req, res) => {
    try {
        const { supplierId } = req.params;
        const supplier = await User.findById(supplierId);
        if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

        // DEBUG: Log supplier data to find where the address is stored
        console.log(`🔍 [DEBUG_SUPPLIER] ID: ${supplierId} | Details:`, {
            supplierDetails: supplier.supplierDetails,
            shopDetails: supplier.shopDetails,
            addressCount: supplier.addresses?.length
        });

        const defaultAddress = supplier.addresses?.find(a => a.isDefault) || supplier.addresses?.[0];

        // Search in ALL possible fields
        const pincode = (
            supplier.supplierDetails?.pincode || 
            supplier.shopDetails?.pincode || 
            supplier.pincode || 
            defaultAddress?.pincode
        )?.toString().trim();

        const city = (
            supplier.supplierDetails?.city || 
            supplier.shopDetails?.city || 
            supplier.city || 
            defaultAddress?.city
        )?.trim();

        console.log(`📡 [FETCH_POOL] Supplier Location -> Pincode: ${pincode} | City: ${city}`);

        if (!pincode && !city) {
            console.warn(`⚠️ [FETCH_POOL] Supplier ${supplierId} has NO location data defined.`);
        }

        // Build regional query dynamically
        const regionalQuery = [];
        if (pincode) regionalQuery.push({ pincode: pincode });
        if (city) regionalQuery.push({ city: new RegExp(city, 'i') });

        // Find orders assigned to them OR pending orders in their region with no supplier yet
        const orders = await B2BOrder.find({
            status: { $nin: ['PENDING_PAYMENT', 'CART', 'Submitted'] }, // Hide unpaid/draft/old-submitted orders
            $or: [
                { supplier: supplierId }, // Already claimed
                { 
                    supplier: null, 
                    status: { $in: ['SUBMITTED', 'Confirmed', 'Open', 'Locked', 'Pending'] },
                    $or: regionalQuery.length > 0 ? regionalQuery : [{ _id: null }] // Match nothing if no location
                }
            ]
        })
        .populate('vendor', 'displayName phone shopDetails')
        .sort({ createdAt: -1 });

        console.log(`✅ [FETCH_POOL] Found ${orders.length} potential orders`);
        if ((req.user || req.admin)?.role === 'Admin') {
            const scope = await createAdminReportScope(req, ['B2BOrder']);
            const permitted = new Set(await B2BOrder.distinct('_id', scope.query('B2BOrder')));
            return res.status(200).json(orders.filter(order => [...permitted].some(key => String(key) === String(order._id))));
        }
        res.status(200).json(orders);
    } catch (err) {
        console.error('Fetch Pool Error:', err);
        res.status(500).json({ message: 'Error fetching supplier pool' });
    }
};

// Get orders for a specific Vendor
export const getVendorOrders = async (req, res) => {
    const { vendorId } = req.params;
    console.log(`📡 [B2B_FETCH] Fetching orders for Vendor ID: ${vendorId}`);
    try {
        const orders = await B2BOrder.find({ vendor: vendorId })
            .populate('supplier', 'displayName phone supplierDetails')
            .sort({ createdAt: -1 });

        if ((req.user || req.admin)?.role === 'Admin') {
            const scope = await createAdminReportScope(req, ['B2BOrder']);
            const permitted = new Set(await B2BOrder.distinct('_id', scope.query('B2BOrder')));
            return res.status(200).json(orders.filter(order => [...permitted].some(key => String(key) === String(order._id))));
        }
        res.status(200).json(orders);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching vendor orders' });
    }
};

// Update B2B Order Status (Claiming from Pool)
export const updateB2BStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, supplierId } = req.body; // SupplierId is now MANDATORY for claiming

        let order = await B2BOrder.findById(id).populate('vendor');
        if (!order) return res.status(404).json({ message: 'Order not found' });

        const supplier = await User.findById(supplierId);

        // Claiming logic
        if ((status === 'ACCEPTED' || status === 'Accepted') && !order.supplier) {
            // Atomically claim the order
            const claimedOrder = await B2BOrder.findOneAndUpdate(
                { _id: id, supplier: null },
                { status: 'ACCEPTED', supplier: supplierId, acceptedAt: new Date() },
                { new: true }
            ).populate('vendor');

            if (!claimedOrder) {
                return res.status(400).json({ message: 'Order already claimed by another supplier!' });
            }
            order = claimedOrder;

            // Send Push Notification to Vendor
            if (order.vendor && order.vendor.fcmToken) {
                try {
                    const message = {
                        notification: {
                            title: 'B2B Order Accepted!',
                            body: `Your order is accepted by ${supplier?.displayName || 'a supplier'} and delivery to ${order.deliveryDate.toLocaleDateString()}`
                        },
                        data: {
                            orderId: order._id.toString(),
                            type: 'B2B_ORDER_ACCEPTED'
                        },
                        token: order.vendor.fcmToken
                    };
                    await admin.messaging().send(message);
                    console.log(`🚀 [FCM_PUSH] B2B Acceptance Push Sent to Vendor: ${order.vendor.phone}`);
                } catch (pushErr) {
                    console.error('❌ [FCM_PUSH] B2B Notification Error:', pushErr.message);
                }
            }
        } else {
            // Normal status update
            const upperStatus = status.toUpperCase();
            const validUppercaseStatuses = ['CART', 'PENDING_PAYMENT', 'SUBMITTED', 'ACCEPTED', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'REJECTED', 'CANCELLED', 'SETTLED'];
            if (validUppercaseStatuses.includes(upperStatus)) {
                // OTP Protection: Block direct transition to DELIVERED if it has a deliveryOtp and was in DISPATCHED status
                if (upperStatus === 'DELIVERED' && order.status === 'DISPATCHED' && order.deliveryOtp) {
                    return res.status(400).json({ message: 'Delivery OTP verification is required to complete this order.' });
                }

                order.status = upperStatus;

                // Generate OTP when status is marked as DISPATCHED (Shipped)
                if (upperStatus === 'DISPATCHED') {
                    const otp = Math.floor(100000 + Math.random() * 900000).toString();
                    order.deliveryOtp = otp;
                    console.log(`🔑 [B2B_OTP] Generated Delivery OTP for Order #${order.b2bOrderId}: ${otp}`);
                }
            } else {
                order.status = status;
            }
            await order.save();
        }
        
        const CONFIRMED_STATUSES = ['SUBMITTED', 'ACCEPTED', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'SETTLED', 'Confirmed', 'Delivered', 'Accepted', 'Settled'];
        if (CONFIRMED_STATUSES.includes(order.status)) {
            await decreaseSupplyStock(order);
        }

        res.status(200).json({ message: `Order marked as ${status}`, order });
    } catch (err) {
        console.error('Update B2B Status Error:', err);
        res.status(500).json({ message: 'Error updating status' });
    }
};

// Verify B2B Delivery OTP and complete order
export const verifyDeliveryOtp = async (req, res) => {
    try {
        const { id } = req.params;
        const { otp } = req.body;

        const order = await B2BOrder.findById(id).populate('vendor');
        if (!order) return res.status(404).json({ message: 'Order not found' });

        if (order.status !== 'DISPATCHED') {
            return res.status(400).json({ message: 'Order must be in DISPATCHED status to verify delivery OTP' });
        }

        if (!order.deliveryOtp) {
            return res.status(400).json({ message: 'No delivery OTP generated for this order' });
        }

        if (order.deliveryOtp !== otp) {
            return res.status(400).json({ message: 'Invalid delivery OTP' });
        }

        // Success! Set status to DELIVERED
        order.status = 'DELIVERED';
        await order.save();
        await decreaseSupplyStock(order);

        console.log(`✅ [B2B_OTP_SUCCESS] Order #${order.b2bOrderId} marked as DELIVERED via OTP verification`);
        res.status(200).json({ message: 'OTP verified successfully. Order completed.', order });
    } catch (err) {
        console.error('Verify B2B OTP Error:', err);
        res.status(500).json({ message: 'Error verifying OTP' });
    }
};

// Bulk update status for multiple B2B orders
export const bulkUpdateB2BStatus = async (req, res) => {
    try {
        const { orderIds, status, supplierId } = req.body;
        if (!Array.isArray(orderIds)) return res.status(400).json({ message: 'Invalid orderIds' });

        const normalizedStatus = String(status || '').toUpperCase();
        const timestampField = {
            ACCEPTED: 'acceptedAt',
            PROCESSING: 'processingStartedAt',
            DISPATCHED: 'dispatchedAt',
            DELIVERED: 'deliveredAt'
        }[normalizedStatus];
        const update = { status };
        if (timestampField) update[timestampField] = new Date();
        const results = await B2BOrder.updateMany(
            { _id: { $in: orderIds }, supplier: supplierId },
            update
        );

        const CONFIRMED_STATUSES = ['SUBMITTED', 'ACCEPTED', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'SETTLED', 'Confirmed', 'Delivered', 'Accepted', 'Settled'];
        if (CONFIRMED_STATUSES.includes(status)) {
            const orders = await B2BOrder.find({ _id: { $in: orderIds } });
            for (const order of orders) {
                await decreaseSupplyStock(order);
            }
        }

        res.status(200).json({ message: `Successfully updated ${results.modifiedCount} orders to ${status}`, results });
    } catch (err) {
        console.error('Bulk Update Error:', err);
        res.status(500).json({ message: 'Error in bulk update' });
    }
};

// Supplier invoices are settled directly between vendor and supplier; the old
// in-app escrow checkout (initiate/verify-payment) was removed because it could
// mark any order Paid without checking ownership or amount. Legacy escrow
// orders that are already Paid/Held are still released by an Admin below.

// 3. Admin releases payment to Supplier
export const releaseSupplierPayment = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await B2BOrder.findById(id);

        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (order.paymentStatus !== 'Paid') return res.status(400).json({ message: 'Cannot release unpaid order' });
        // Funds go to the supplier only once the goods have been delivered.
        if (!['DELIVERED', 'Delivered'].includes(order.status)) {
            return res.status(400).json({ message: 'Funds can be released only after the order is delivered' });
        }
        if (order.escrowStatus === 'Released') {
            return res.status(400).json({ message: 'Funds for this order were already released' });
        }

        order.escrowStatus = 'Released';
        order.status = 'Settled';
        await order.save();

        res.json({ message: 'Funds released to supplier successfully', order });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// 4. Admin gets all "Paid & Held" orders for payout management
export const getAdminEscrowOrders = async (req, res) => {
    try {
        const scope = await createAdminReportScope(req, ['B2BOrder']);
        const orders = await B2BOrder.find(scope.query('B2BOrder', { paymentStatus: 'Paid' }))
            .populate('vendor', 'displayName shopDetails')
            .populate('supplier', 'displayName supplierDetails phone')
            .sort({ updatedAt: -1 });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
// Get Supplier Timeline (Live Data)
export const getSupplierTimeline = async (req, res) => {
    try {
        const config = await SystemConfig.findOne({ key: 'delivery_day' });
        const deliveryDayName = config ? config.value : 'Sunday';
        const deliveryDate = getNextDeliveryDate(deliveryDayName);

        // 1. Next Batch Pickup (Usually 24h before delivery)
        const pickupDate = new Date(deliveryDate);
        pickupDate.setHours(pickupDate.getHours() - 24);

        // 2. Next Payment Settlement (Every Friday)
        const settlementDate = new Date();
        const daysUntilFriday = (5 - settlementDate.getDay() + 7) % 7;
        settlementDate.setDate(settlementDate.getDate() + (daysUntilFriday === 0 ? 7 : daysUntilFriday));
        settlementDate.setHours(10, 0, 0, 0);

        // 3. Rate Submission Deadline (Saturday 6 PM)
        const deadlineDate = new Date();
        const daysUntilSaturday = (6 - deadlineDate.getDay() + 7) % 7;
        deadlineDate.setDate(deadlineDate.getDate() + daysUntilSaturday);
        deadlineDate.setHours(18, 0, 0, 0);

        const timeline = [
            {
                id: 'pickup',
                title: 'Weekend Consolidation',
                desc: 'Bulk batching cycle',
                date: pickupDate,
                icon: 'event_upcoming',
                color: 'indigo',
                variant: 'primary'
            },
            {
                id: 'payment',
                title: 'Payment Settlement',
                desc: 'Weekly payout cycle',
                date: settlementDate,
                icon: 'payments',
                color: 'emerald',
                variant: 'success'
            },
            {
                id: 'deadline',
                title: 'Rate Submission',
                desc: 'Deadline for next cycle',
                date: deadlineDate,
                icon: 'gavel',
                color: 'rose',
                variant: 'danger',
                actionRequired: new Date() > new Date(deadlineDate.getTime() - 6 * 60 * 60 * 1000) // 6 hours before
            }
        ];

        res.status(200).json(timeline);
    } catch (err) {
        console.error('Timeline Error:', err);
        res.status(500).json({ message: 'Error fetching timeline' });
    }
};

export const getB2BOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await B2BOrder.findById(id)
            .populate('vendor', 'displayName phone shopDetails location')
            .populate('supplier', 'displayName phone supplierDetails location')
            .populate('items.materialId');
        if (!order) return res.status(404).json({ message: 'Order not found' });

        const orderObj = order.toObject();
        const VendorMasterSupply = (await import('../models/VendorMasterSupply.js')).default;
        
        for (const item of orderObj.items) {
            if (item.materialId) {
                if (!item.materialId.images || item.materialId.images.length === 0 || !item.materialId.description || item.materialId.description.trim() === '') {
                    const templateItem = await VendorMasterSupply.findOne({ materialName: item.materialId.materialName, supplierId: '-' });
                    if (templateItem) {
                        if (!item.materialId.images || item.materialId.images.length === 0) {
                            item.materialId.images = templateItem.images || [];
                        }
                        if (!item.materialId.description || item.materialId.description.trim() === '') {
                            item.materialId.description = templateItem.description || '';
                        }
                    }
                }
            }
        }

        res.status(200).json(orderObj);
    } catch (err) {
        console.error('Fetch B2B Order Error:', err);
        res.status(500).json({ message: 'Error fetching order details' });
    }
};

export const updateB2BDeliveryDate = async (req, res) => {
    try {
        const { id } = req.params;
        const { deliveryDate } = req.body;

        if (!deliveryDate) {
            return res.status(400).json({ message: 'Delivery date is required' });
        }

        const parsedDate = new Date(deliveryDate);
        if (isNaN(parsedDate.getTime())) {
            return res.status(400).json({ message: 'Invalid delivery date format' });
        }

        const order = await B2BOrder.findById(id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        order.deliveryDate = parsedDate;
        
        const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        order.deliveryDay = DAYS[parsedDate.getDay()];
        
        await order.save();

        res.status(200).json({ message: 'Delivery date updated successfully', order });
    } catch (err) {
        console.error('Update Delivery Date Error:', err);
        sendError(res, err, 'Error updating delivery date');
    }
};



// Vendor rates the supplier of one of their delivered supply orders (1-5).
const RATEABLE_STATUSES = ['DELIVERED', 'Delivered', 'SETTLED', 'Settled'];
export const rateSupplier = async (req, res) => {
    try {
        const rating = Number(req.body.rating);
        const comment = typeof req.body.comment === 'string' ? req.body.comment.trim().slice(0, 500) : '';
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return res.status(400).json({ message: 'rating must be a whole number from 1 to 5' });
        }

        const order = await B2BOrder.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (!order.vendor || order.vendor.toString() !== req.user?.id) {
            return res.status(403).json({ message: 'Only the vendor who placed this order can rate its supplier' });
        }
        if (!order.supplier) {
            return res.status(400).json({ message: 'This order has no supplier to rate' });
        }
        if (!RATEABLE_STATUSES.includes(order.status)) {
            return res.status(400).json({ message: 'You can rate the supplier once the order is delivered' });
        }

        order.supplierRating = { rating, comment, ratedAt: new Date() };
        await order.save();
        res.json({ message: 'Thanks! Your rating was saved.', supplierRating: order.supplierRating });
    } catch (error) {
        console.error('Rate supplier error:', error);
        sendError(res, error, 'Error saving rating');
    }
};
