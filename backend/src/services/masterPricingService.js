import MasterPricing from '../models/MasterPricing.js';
import MasterService from '../models/MasterService.js';
import ServiceArea from '../models/ServiceArea.js';

export const masterPricingService = {
    /**
     * Syncs a single area with all services.
     * Useful when a new geofence is drawn.
     */
    syncAreaWithServices: async (fenceId) => {
        const area = await ServiceArea.findById(fenceId);
        const services = await MasterService.find();
        
        const bulkOps = services.map(service => {
            const expM = service.expressMultiplier !== undefined && service.expressMultiplier !== null ? service.expressMultiplier : 1;
            const surgeM = area.dynamicSurgeMultiplier !== undefined && area.dynamicSurgeMultiplier !== null ? area.dynamicSurgeMultiplier : 1;
            const areaM = area.basePriceMultiplier !== undefined && area.basePriceMultiplier !== null ? area.basePriceMultiplier : 1;
            const discM = area.discountPriceMultiplier !== undefined && area.discountPriceMultiplier !== null ? area.discountPriceMultiplier : 1;
            const heritageM = area.heritageMultiplier !== undefined && area.heritageMultiplier !== null ? area.heritageMultiplier : 1;
            
            const multipliers = expM * surgeM * areaM * discM * heritageM;
            const finalPrice = Math.round(service.discountedPrice * multipliers);

            return {
                updateOne: {
                    filter: { serviceId: service._id, fenceId: area._id },
                    update: {
                        $set: {
                            categoryId: service.categoryId,
                            basePrice: service.basePrice,
                            discountPrice: service.discountedPrice,
                            gstPercent: service.gst !== undefined && service.gst !== null ? service.gst : 18,
                            expressMultiplier: expM,
                            surgeMultiplier: surgeM,
                            areaMultiplier: areaM,
                            discountMultiplier: discM,
                            heritageMultiplier: heritageM,
                            isActive: area.isActive,
                            finalPrice: finalPrice
                        }
                    },
                    upsert: true
                }
            };
        });

        const result = await MasterPricing.bulkWrite(bulkOps);

        // Notify active vendors in the area about any newly added master services
        try {
            const User = (await import('../models/User.js')).default;
            const vendors = await User.find({ role: 'Vendor', status: 'approved' });
            const polygonCoords = area.boundary?.coordinates?.[0];

            if (polygonCoords && vendors.length > 0) {
                for (const vendor of vendors) {
                    const vLat = Number(vendor.location?.lat || 0);
                    const vLng = Number(vendor.location?.lng || 0);

                    // Check if the vendor falls inside the Service Area geofence
                    if (isPointInPolygon(vLat, vLng, polygonCoords)) {
                        let newServicesAdded = [];
                        let shopServices = vendor.shopDetails?.services || [];

                        for (const service of services) {
                            const serviceIdStr = service._id.toString();
                            const alreadyRegistered = shopServices.some(s => 
                                s.id?.toString() === serviceIdStr || s._id?.toString() === serviceIdStr
                            );

                            if (!alreadyRegistered) {
                                const newServiceEntry = {
                                    id: serviceIdStr,
                                    name: service.itemName,
                                    vendorRate: service.discountedPrice,
                                    adminRate: service.basePrice,
                                    status: 'offered', // Offered by admin, awaiting vendor acceptance
                                    icon: service.icon || 'local_laundry_service',
                                    active: false,
                                    normalTime: '',
                                    expressTime: ''
                                };
                                shopServices.push(newServiceEntry);
                                newServicesAdded.push(service.itemName);
                            }
                        }

                        if (newServicesAdded.length > 0) {
                            if (!vendor.shopDetails) vendor.shopDetails = {};
                            vendor.shopDetails.services = shopServices;
                            vendor.markModified('shopDetails.services');
                            await vendor.save();

                            console.log(`✅ [SYNC_SERVICES] Added ${newServicesAdded.length} new services to vendor ${vendor.phone}`);

                            // Send FCM Push Notification
                            if (vendor.fcmToken) {
                                try {
                                    const admin = (await import('../utils/firebaseAdmin.js')).default;
                                    const title = 'New Service Request Available! 🧺';
                                    const body = `Admin has added new services in your zone: ${newServicesAdded.join(', ')}. Please check your Service Requests.`;
                                    
                                    const message = {
                                        notification: { title, body },
                                        data: { type: 'NEW_SERVICE_REQUEST' },
                                        token: vendor.fcmToken
                                    };
                                    await admin.messaging().send(message);
                                    console.log(`🚀 [FCM_PUSH] Sent notification to vendor ${vendor.phone}`);
                                } catch (fcmErr) {
                                    console.error(`❌ [FCM_PUSH] Error sending to ${vendor.phone}:`, fcmErr.message);
                                }
                            }

                            // Send DB Notification
                            try {
                                const Notification = (await import('../models/Notification.js')).default;
                                await new Notification({
                                    recipient: vendor._id,
                                    role: 'vendor',
                                    title: 'New Service Request Available',
                                    message: `Admin has added new services in your zone: ${newServicesAdded.join(', ')}.`,
                                    type: 'order_available'
                                }).save();
                            } catch (dbNotifErr) {
                                console.error(`❌ [DB_NOTIFICATION] Error for ${vendor.phone}:`, dbNotifErr.message);
                            }

                            // Broadcast Socket.io Event
                            try {
                                const { getEventPublisher } = await import('../socket.js');
                                const io = getEventPublisher();
                                if (io) {
                                    io.to(`user_${vendor._id}`).emit('new_service_request', {
                                        message: `Admin has added new services in your zone: ${newServicesAdded.join(', ')}.`
                                    });
                                }
                            } catch (socketErr) {
                                console.error('❌ [SOCKET] Error:', socketErr.message);
                            }
                        }
                    }
                }
            }
        } catch (syncErr) {
            console.error('Error during vendor sync notifications:', syncErr);
        }

        return result;
    },

    /**
     * Batch update multipliers for a specific area
     */
    updateAreaMultipliers: async (fenceId, multipliers) => {
        return await MasterPricing.updateMany(
            { fenceId },
            { $set: multipliers },
            { runValidators: true }
        );
    }
};

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
