import { filterCondition } from '../utils/queryFilters.js';
import SupplierApplication from '../models/SupplierApplication.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { getEventPublisher } from '../socket.js';
import axios from 'axios';
import { sendError, httpStatusForError } from '../utils/errorResponse.js';

export const verifyGst = async (req, res) => {
    try {
        const { gstNumber } = req.body;

        // Bad input should not be sent upstream only to come back as a 500.
        if (!gstNumber || typeof gstNumber !== 'string') {
            return res.status(400).json({ message: 'GST number is required' });
        }

        console.log(`🔍 [SIGNZY] Verifying GST: ${gstNumber}`);

        const apiKey = process.env.SIGNZY_API_KEY;
        const baseUrl = process.env.SIGNZY_BASE_URL;

        if (!apiKey || !baseUrl) {
            console.warn('⚠️ [SIGNZY] API Keys missing. Using Demo Mode.');
            return res.json({ success: true, message: 'GST Verified (Demo Mode)', data: { status: 'Active' } });
        }

        const response = await axios.post(`${baseUrl}/gst/verify`, {
            gstNumber
        }, {
            headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/json'
            }
        });

        res.json({ success: true, data: response.data });
    } catch (error) {
        console.error('❌ [SIGNZY] Verification Error:', error.response?.data || error.message);
        // Fallback for development if keys are placeholders
        if (process.env.NODE_ENV === 'development') {
            return res.json({ success: true, message: 'GST Verified (Dev Fallback)', data: { status: 'Active' } });
        }
        sendError(res, error, 'GST Verification failed');
    }
};

export const initiateBankVerification = async (req, res) => {
    try {
        const { userId, accountNumber, ifscCode } = req.body;
        console.log(`🏦 [RAZORPAYX] Initiating Penny Drop for User: ${userId}`);

        // 1. Generate a random amount between 1.00 and 2.00 (e.g. 1.15)
        const randomAmount = parseFloat((Math.random() * (2.0 - 1.0) + 1.0).toFixed(2));
        
        // 2. Simulate RazorpayX Payout (In production, use axios to call RazorpayX)
        // Note: We send amount in paise to RazorpayX
        const amountInPaise = Math.round(randomAmount * 100);
        console.log(`💸 [RAZORPAYX] Sending ₹${randomAmount} (${amountInPaise} paise) to ${accountNumber}`);

        // 3. Update User with the secret amount
        await User.findByIdAndUpdate(userId, {
            'bankVerification.amount': randomAmount,
            'bankVerification.isVerified': false,
            'bankVerification.lastRequested': new Date()
        });

        res.json({ 
            success: true, 
            message: `Penny Drop Generated (Demo Mode): ₹${randomAmount}. Please enter ${randomAmount} below to confirm.`,
            demoAmount: randomAmount,
            demoNote: `[DEMO MODE]: Generated Penny Drop Amount is ₹${randomAmount}`
        });
    } catch (error) {
        console.error('❌ [RAZORPAYX] Payout Error:', error.message);
        res.status(500).json({ message: 'Failed to initiate bank verification' });
    }
};

export const completeBankVerification = async (req, res) => {
    try {
        const { userId, amountEntered } = req.body;
        const user = await User.findById(userId);

        if (!user || !user.bankVerification.amount) {
            return res.status(400).json({ message: 'No active verification request found' });
        }

        const actualAmount = user.bankVerification.amount;
        console.log(`🧐 [VERIFY] User Entered: ${amountEntered}, Actual: ${actualAmount}`);

        // Match with 0.01 tolerance just in case of float issues
        if (Math.abs(parseFloat(amountEntered) - actualAmount) < 0.01) {
            user.bankVerification.isVerified = true;
            await user.save();
            res.json({ success: true, message: 'Bank Account Verified Successfully!' });
        } else {
            res.status(400).json({ success: false, message: 'Incorrect amount. Please try again.' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Verification failed' });
    }
};

export const submitApplication = async (req, res) => {
    try {
        const userId = req.params.userId;
        const existingApplication = await SupplierApplication.findOne({ user: userId });

        if (existingApplication) {
            Object.assign(existingApplication, req.body);
            existingApplication.status = 'Pending';
            existingApplication.rejectionReason = undefined;
            existingApplication.rejectionFlags = [];
            existingApplication.onboardingStage = 'Initial_Approval_Pending';
            await existingApplication.save();
            return res.status(200).json({ message: 'Application updated successfully', application: existingApplication });
        }

        const applicationData = {
            ...req.body,
            user: userId,
            status: 'Pending',
            onboardingStage: 'Initial_Approval_Pending'
        };

        // Build documents array from submitted application
        const docs = [];
        if (req.body.gstDoc) docs.push({ type: 'GST Document', url: req.body.gstDoc });
        if (req.body.panDoc) docs.push({ type: 'PAN Card', url: req.body.panDoc });
        if (req.body.msmeDoc) docs.push({ type: 'MSME Document', url: req.body.msmeDoc });
        if (req.body.cancelledChequeDoc) docs.push({ type: 'Cancelled Cheque', url: req.body.cancelledChequeDoc });
        if (req.body.priceListDoc) docs.push({ type: 'Price List', url: req.body.priceListDoc });
        if (req.body.manufacturerAuthDoc) docs.push({ type: 'Manufacturer Auth', url: req.body.manufacturerAuthDoc });
        if (req.body.ownerAadhaar && typeof req.body.ownerAadhaar === 'string' && req.body.ownerAadhaar.startsWith('http')) {
            docs.push({ type: 'Aadhaar Document', url: req.body.ownerAadhaar });
        }

        // Sync bank details and business info to User model immediately
        await User.findByIdAndUpdate(userId, {
            'supplierDetails.businessName': req.body.registeredBusinessName,
            'supplierDetails.address': req.body.warehouseAddress,
            'supplierDetails.gst': req.body.gstNumber,
            'supplierDetails.city': req.body.city || '',
            'supplierDetails.pincode': req.body.pincode || '',
            'supplierDetails.supplyCategories': req.body.supplyCategories || [],
            'supplierDetails.entityType': req.body.entityType || 'Supplier',
            'supplierDetails.designation': req.body.designation || '',
            'supplierDetails.panNumber': req.body.panNumber || '',
            'supplierDetails.aadhaarNumber': req.body.ownerAadhaar || '',
            bankDetails: {
                accountHolderName: req.body.contactPersonName || req.body.registeredBusinessName || '',
                accountNumber: req.body.accountNumber || '',
                ifscCode: req.body.ifscCode || '',
                bankName: req.body.bankName || ''
            },
            ...(docs.length > 0 ? { documents: docs } : {})
        });

        res.status(201).json({ message: 'Application submitted successfully', application: newApplication });
    } catch (error) {
        console.error('Submit Supplier Application Error:', error);
        res.status(httpStatusForError(error)).json({ message: error.message });
    }
};

export const getAllApplications = async (req, res) => {
    try {
        const { supplierName, businessName, phone, status, all } = req.query;
        const query = {};

        if (supplierName) {
            query.contactPersonName = filterCondition(supplierName);
        }
        if (businessName) {
            query.registeredBusinessName = filterCondition(businessName);
        }
        if (phone) {
            const matchingUsers = await User.find({ phone: filterCondition(phone) }).select('_id');
            const userIds = matchingUsers.map(u => u._id);
            query.user = { $in: userIds };
        }

        // Only return pending/revision supplier requests needing admin verification
        if (status) {
            query.status = filterCondition(status);
        } else if (all !== 'true') {
            query.status = { $in: ['Pending', 'pending', 'Revision_Required'] };
            query.onboardingStage = { $ne: 'Onboarded' };
        }

        const applications = await SupplierApplication.find(query).populate('user', 'name phone email');
        res.status(200).json(applications);
    } catch (error) {
        res.status(httpStatusForError(error)).json({ message: error.message });
    }
};

export const getApplicationById = async (req, res) => {
    try {
        const application = await SupplierApplication.findById(req.params.id).populate('user');
        if (!application) return res.status(404).json({ message: 'Application not found' });
        res.status(200).json(application);
    } catch (error) {
        res.status(httpStatusForError(error)).json({ message: error.message });
    }
};

export const initialApproveApplication = async (req, res) => {
    try {
        const application = await SupplierApplication.findById(req.params.id);
        if (!application) return res.status(404).json({ message: 'Application not found' });

        application.onboardingStage = 'Product_Selection_Phase';
        application.reviewedAt = new Date();
        await application.save();

        // Send Push Notification & Save to DB
        try {
            const notification = await Notification.create({
                recipient: application.user,
                role: 'user',
                title: 'Application Approved! 🎉',
                message: 'Admin approved your request. Please select your products to continue.',
                type: 'supplier_onboarding',
                payload: { applicationId: application._id, stage: 'Product_Selection_Phase' }
            });

            // Emit Real-time via Socket
            const io = getEventPublisher();
            io.to(`user_${application.user.toString()}`).emit('push_notification', {
                title: 'Application Approved! 🎉',
                body: 'Admin approved your request. Please select your products to continue.',
                payload: { applicationId: application._id, stage: 'Product_Selection_Phase' }
            });
        } catch (notifErr) {
            console.error('Failed to send approval notification:', notifErr);
        }

        res.status(200).json({ 
            message: 'Documents approved. Supplier can now select products to supply.',
            stage: application.onboardingStage 
        });
    } catch (error) {
        res.status(httpStatusForError(error)).json({ message: error.message });
    }
};

export const selectProducts = async (req, res) => {
    try {
        const { applicationId } = req.body;
        const products = req.body.products || req.body.selectedProducts;
        
        const application = await SupplierApplication.findById(applicationId);
        
        if (!application) return res.status(404).json({ message: 'Application not found' });
        if (application.onboardingStage !== 'Product_Selection_Phase') {
            return res.status(400).json({ message: 'Product selection is not allowed at this stage' });
        }

        application.selectedProducts = products || [];
        application.onboardingStage = 'Final_Approval_Pending';
        await application.save();

        res.status(200).json({ 
            message: 'Products selected. Awaiting final admin approval.',
            stage: application.onboardingStage
        });
    } catch (error) {
        res.status(httpStatusForError(error)).json({ message: error.message });
    }
};

export const finalApproveApplication = async (req, res) => {
    try {
        const application = await SupplierApplication.findById(req.params.id);
        if (!application) return res.status(404).json({ message: 'Application not found' });

        if (application.onboardingStage !== 'Final_Approval_Pending') {
            return res.status(400).json({ message: 'Supplier must select products before final approval' });
        }

        application.status = 'Approved';
        application.onboardingStage = 'Onboarded';
        application.reviewedAt = new Date();
        await application.save();

        const userObj = await User.findById(application.user);
        const userPhone = userObj?.phone || '';
        const supplierId = `SUP-${userPhone ? userPhone.slice(-4) : '001'}`;

        // Build documents array from application
        const docs = [];
        if (application.gstDoc) docs.push({ type: 'GST Document', url: application.gstDoc });
        if (application.panDoc) docs.push({ type: 'PAN Card', url: application.panDoc });
        if (application.msmeDoc) docs.push({ type: 'MSME Document', url: application.msmeDoc });
        if (application.cancelledChequeDoc) docs.push({ type: 'Cancelled Cheque', url: application.cancelledChequeDoc });
        if (application.priceListDoc) docs.push({ type: 'Price List', url: application.priceListDoc });
        if (application.manufacturerAuthDoc) docs.push({ type: 'Manufacturer Auth', url: application.manufacturerAuthDoc });
        if (application.ownerAadhaar && typeof application.ownerAadhaar === 'string' && application.ownerAadhaar.startsWith('http')) {
            docs.push({ type: 'Aadhaar Document', url: application.ownerAadhaar });
        }

        // Officially promote user to Supplier and sync full business, bank details & documents
        await User.findByIdAndUpdate(application.user, { 
            role: 'Supplier',
            status: 'approved',
            isProfileComplete: true,
            isVerifiedSupplier: true,
            supplierDetails: {
                businessName: application.registeredBusinessName,
                address: application.warehouseAddress,
                gst: application.gstNumber,
                city: application.city || '',
                pincode: application.pincode || '',
                supplyCategories: application.supplyCategories || [],
                entityType: application.entityType || 'Supplier',
                designation: application.designation || '',
                panNumber: application.panNumber || '',
                aadhaarNumber: application.ownerAadhaar || ''
            },
            bankDetails: {
                accountHolderName: application.contactPersonName || application.registeredBusinessName || '',
                accountNumber: application.accountNumber || '',
                ifscCode: application.ifscCode || '',
                bankName: application.bankName || ''
            },
            ...(docs.length > 0 ? { documents: docs } : {})
        });

        // Automatically create SupplierServiceZone record if zone and pincode exist
        if (application.zone && application.pincode) {
            const SupplierServiceZone = (await import('../models/SupplierServiceZone.js')).default;
            const lastZone = await SupplierServiceZone.findOne({ zoneId: { $regex: /^SPZ-ZONE-/ } }).sort({ zoneId: -1 });
            let nextNum = 1;
            if (lastZone && lastZone.zoneId) {
                const match = lastZone.zoneId.match(/^SPZ-ZONE-(\d+)$/);
                if (match) {
                    nextNum = parseInt(match[1], 10) + 1;
                }
            }
            const zoneId = `SPZ-ZONE-${String(nextNum).padStart(3, '0')}`;

            const newZone = new SupplierServiceZone({
                zoneId,
                zoneName: application.zone,
                supplierId: supplierId,
                pincodes: [application.pincode],
                deliveryCharges: 0,
                minOrderValue: 0,
                isActive: true
            });
            await newZone.save();
        }

        // Clone the selected products into VendorMasterSupply with this supplierId & supplierFacilityName
        if (application.selectedProducts && application.selectedProducts.length > 0) {
            const VendorMasterSupply = (await import('../models/VendorMasterSupply.js')).default;
            const VendorSupplyCategory = (await import('../models/VendorSupplyCategory.js')).default;
            
            for (const selectedItem of application.selectedProducts) {
                // Ensure we don't duplicate clone for the same supplier
                const exists = await VendorMasterSupply.findOne({
                    materialName: selectedItem.productName,
                    supplierId: supplierId
                });
                
                if (!exists) {
                    // Find template supply item
                    const templateItem = await VendorMasterSupply.findOne({
                        materialName: selectedItem.productName,
                        supplierId: '-'
                    });
                    
                    if (templateItem) {
                        const lastSupply = await VendorMasterSupply.findOne().sort({ serialNumber: -1 });
                        const nextSerial = (lastSupply?.serialNumber || 0) + 1;
                        
                        const categoryDoc = await VendorSupplyCategory.findById(templateItem.categoryId);
                        
                        // Generate SKU ID
                        const prefix1 = "spz";
                        const prefix2 = "sup";
                        let catPart = "cat";
                        if (categoryDoc && categoryDoc.mainCategory) {
                            catPart = categoryDoc.mainCategory.trim().replace(/[^a-zA-Z\s]/g, '').slice(0, 3).toLowerCase();
                            if (!catPart) catPart = "cat";
                        }
                        let subPart = "sub";
                        if (categoryDoc && categoryDoc.subCategory) {
                            const words = categoryDoc.subCategory.trim().replace(/[^a-zA-Z\s]/g, '').split(/\s+/).filter(Boolean);
                            if (words.length >= 2) {
                                subPart = (words[0][0] + words[1][0]).toLowerCase();
                            } else if (words.length === 1) {
                                subPart = words[0].slice(0, 2).toLowerCase();
                            }
                            if (!subPart) subPart = "sub";
                        }
                        const serialStr = String(nextSerial).padStart(3, '0');
                        const newSkuId = `${prefix1}-${prefix2}-${catPart}-${subPart}-${serialStr}`.toUpperCase();

                        const newSupply = new VendorMasterSupply({
                            skuId: newSkuId,
                            categoryId: templateItem.categoryId,
                            hsnCode: templateItem.hsnCode || '-',
                            gst: templateItem.gst || 18,
                            brand: templateItem.brand || 'Generic',
                            materialName: templateItem.materialName,
                            quantity: templateItem.quantity || '-',
                            wholesaleRate: selectedItem.wholesaleRate || 0,
                            bulkDiscount: selectedItem.bulkDiscount || 0,
                            bulkThreshold: selectedItem.bulkThreshold || 0,
                            isActive: 'y',
                            approvalStatus: 'Approved',
                            deliveryFrequency: (application.deliveryFrequency && application.deliveryFrequency.length > 0)
                                ? application.deliveryFrequency.join(', ')
                                : '-',
                            movFreeDelivery: selectedItem.movFreeDelivery || 0,
                            supplierId: supplierId,
                            supplierFacilityName: application.registeredBusinessName,
                            serialNumber: nextSerial,
                            images: selectedItem.images || []
                        });
                        
                        await newSupply.save();
                    }
                }
            }
        }

        res.status(200).json({ 
            message: 'Supplier onboarded officially!',
            stage: application.onboardingStage
        });
    } catch (error) {
        res.status(httpStatusForError(error)).json({ message: error.message });
    }
};

export const rejectApplication = async (req, res) => {
    try {
        const { reason, status, rejectionFlags } = req.body;
        const application = await SupplierApplication.findById(req.params.id);
        if (!application) return res.status(404).json({ message: 'Application not found' });

        const targetStatus = status || 'Rejected';

        application.status = targetStatus;
        application.rejectionReason = reason || 'Criteria not met';
        application.rejectionFlags = rejectionFlags || [];
        application.reviewedAt = new Date();
        await application.save();

        res.status(200).json({ 
            message: `Application ${targetStatus === 'Revision_Required' ? 'sent for revision' : 'rejected'}` 
        });
    } catch (error) {
        res.status(httpStatusForError(error)).json({ message: error.message });
    }
};
