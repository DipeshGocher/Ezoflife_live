import { createAdminReportScope } from '../utils/adminReportScope.js';
import B2BOrder from '../models/B2BOrder.js';
import User from '../models/User.js';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import VendorMasterSupply from '../models/VendorMasterSupply.js';
import SystemConfig from '../models/SystemConfig.js';
import { getNextDeliveryDate, generateCycleId, isBeforeCutoff, DAYS } from '../utils/cycleHelper.js';
import admin from '../utils/firebaseAdmin.js';
import { sendError } from '../utils/errorResponse.js';

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'rzp_test_secret_placeholder'
});

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
        const { vendorId, items, shippingAddress, totalAmount, totalPlatformFee } = req.body;
        
        // 0. Fetch Vendor to get fallback location info
        const vendor = await User.findById(vendorId);
        if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

        const cleanLocation = (val) => {
            if (!val || val === 'Unknown' || val === 'undefined') return null;
            return val.toString().trim();
        };

        let pincode = cleanLocation(req.body.pincode) || cleanLocation(vendor.shopDetails?.pincode) || cleanLocation(vendor.pincode);
        let city = cleanLocation(req.body.city) || cleanLocation(vendor.shopDetails?.city) || cleanLocation(vendor.city);

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

        // 3. Fetch VendorMasterSupply to determine supplierId for each cart item
        const VendorMasterSupply = (await import('../models/VendorMasterSupply.js')).default;
        const materialIds = items.map(i => i.materialId);
        const supplyProducts = await VendorMasterSupply.find({ _id: { $in: materialIds } });
        
        const productMap = {};
        supplyProducts.forEach(p => {
            productMap[p._id.toString()] = p;
        });

        // Group items by supplierId
        const groups = {};
        items.forEach(item => {
            const product = productMap[item.materialId?.toString()];
            const sId = product?.supplierId || '-';
            if (!groups[sId]) groups[sId] = [];
            groups[sId].push(item);
        });

        const createdOrders = [];

        // For each supplier group, create or aggregate separate orders
        for (const [sId, groupItems] of Object.entries(groups)) {
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

            const groupTotal = groupItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);

            // Create new order (No aggregation for Upfront payment flow)
            console.log(`✨ [B2B_CHECKOUT] Creating new order for supplier ${sId}`);
            let order = new B2BOrder({
                vendor: vendorId,
                supplier: supplierObjectId, // PRE-ASSIGNED!
                items: groupItems,
                totalAmount: groupTotal,
                platformFee: 0, // We will assign the total platform fee to the first order later
                shippingAddress: finalShippingAddress,
                pincode,
                city: city?.trim(),
                shippingAddress: finalShippingAddress || 'Store Address',
                pincode: pincode || '452001',
                city: (city || 'Indore').trim(),
                status: (totalPlatformFee && totalPlatformFee > 0) ? 'PENDING_PAYMENT' : 'SUBMITTED',
                cycleId: groupCycleId,
                deliveryDay: groupDeliveryDay,
                deliveryDate: groupDeliveryDate,
                paymentStatus: 'Pending',
                escrowStatus: 'Held'
            });
            await order.save();
            createdOrders.push(order);
        }

        // Assign platform fee and create Razorpay Order
        let rzpOrder = null;
        if (createdOrders.length > 0) {
            createdOrders[0].platformFee = totalPlatformFee || 0;
            await createdOrders[0].save();

            if (totalPlatformFee > 0) {
                const options = {
                    amount: Math.round(totalPlatformFee * 100), // In paise
                    currency: 'INR',
                    receipt: `receipt_b2b_${Date.now()}`,
                    notes: { vendorId: vendorId.toString(), type: 'B2B_PLATFORM_FEE' }
                };
                rzpOrder = await razorpay.orders.create(options);
                
                // Save razorpay order ID to all created orders
                for (let order of createdOrders) {
                    order.razorpayOrderId = rzpOrder.id;
                    await order.save();
                }
            } else {
                // If no platform fee, automatically confirm
                for (let order of createdOrders) {
                    order.status = 'SUBMITTED';
                    order.paymentStatus = 'Paid';
                    await order.save();
                    await decreaseSupplyStock(order);
                }
            }
        }

        res.status(201).json({ 
            message: 'Orders submitted successfully!',
            orders: createdOrders,
            razorpayOrderId: rzpOrder ? rzpOrder.id : null,
            platformFeeAmount: totalPlatformFee || 0
        });

    } catch (err) {
        console.error('💥 [B2B_AGGREGATION_ERROR]:', err);
        sendError(res, err, 'Internal server error while placing order');
    }
};

// Verify Platform Fee Payment and Confirm Order

export const verifyPlatformFeePayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderIds } = req.body;
        
        const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'rzp_test_secret_placeholder');
        hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
        const generated_signature = hmac.digest('hex');

        if (generated_signature !== razorpay_signature) {
            return res.status(400).json({ message: 'Invalid payment signature' });
        }

        // Update all orders to Confirmed
        const orders = await B2BOrder.find({ _id: { $in: orderIds } });
        
        for (let order of orders) {
            order.status = 'SUBMITTED';
            order.paymentStatus = 'Paid';
            await order.save();
            await decreaseSupplyStock(order);
            
            // Notify supplier if pre-assigned
            if (order.supplier) {
                try {
                    const supplier = await User.findById(order.supplier);
                    if (supplier && supplier.fcmToken) {
                        const notificationMessage = {
                            notification: {
                                title: 'New Confirmed B2B Order',
                                body: `A vendor has placed and confirmed a new order with you.`
                            },
                            data: {
                                type: 'NEW_B2B_ORDER',
                                orderId: order._id.toString()
                            },
                            token: supplier.fcmToken
                        };
                        await admin.messaging().send(notificationMessage);
                    }
                } catch (pushErr) {
                    console.error('❌ [FCM_PUSH] Supplier Notification Error:', pushErr.message);
                }
            }
        }

        res.json({ message: 'Payment verified and orders confirmed successfully', orders });
    } catch (error) {
        console.error('💥 [VERIFY_PAYMENT_ERROR]:', error);
        res.status(500).json({ error: error.message });
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
                { status: 'ACCEPTED', supplier: supplierId },
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

        const results = await B2BOrder.updateMany(
            { _id: { $in: orderIds }, supplier: supplierId },
            { status: status }
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

// 1. Vendor initiates payment (Razorpay Order creation)
export const initiateB2BPayment = async (req, res) => {
    try {
        const { orderId } = req.body;
        const b2bOrder = await B2BOrder.findById(orderId);

        if (!b2bOrder) return res.status(404).json({ message: 'Order not found' });
        if (b2bOrder.status !== 'DELIVERED' && b2bOrder.status !== 'Delivered') {
            return res.status(400).json({ message: 'Payment only allowed after product is delivered' });
        }

        const options = {
            amount: b2bOrder.totalAmount * 100, // In paise
            currency: 'INR',
            receipt: `receipt_${b2bOrder.b2bOrderId}`,
            notes: { orderId: b2bOrder._id.toString(), type: 'B2B_ESCROW' }
        };

        const rzpOrder = await razorpay.orders.create(options);
        res.json({ rzpOrder, b2bOrderId: b2bOrder.b2bOrderId });
    } catch (error) {
        console.error('Razorpay Order Error:', error);
        res.status(500).json({ message: 'Failed to create payment order' });
    }
};

// 2. Complete payment tracking
export const verifyB2BPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;
        const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'rzp_test_secret_placeholder');
        hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
        const generated_signature = hmac.digest('hex');

        if (generated_signature === razorpay_signature) {
            const order = await B2BOrder.findByIdAndUpdate(orderId, {
                paymentStatus: 'Paid',
                escrowStatus: 'Held'
            }, { new: true });
            res.json({ message: 'Payment verified and held in Escrow', order });
        } else {
            res.status(400).json({ message: 'Invalid signature' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 3. Admin releases payment to Supplier
export const releaseSupplierPayment = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await B2BOrder.findById(id);

        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (order.paymentStatus !== 'Paid') return res.status(400).json({ message: 'Cannot release unpaid order' });

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


