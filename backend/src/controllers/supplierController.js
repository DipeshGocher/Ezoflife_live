import { filterCondition } from '../utils/queryFilters.js';
import SupplierApplication from '../models/SupplierApplication.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { getEventPublisher } from '../socket.js';
import axios from 'axios';
import { sendError, httpStatusForError } from '../utils/errorResponse.js';
import { resolveActorId } from '../middleware/authMiddleware.js';
import { razorpayApiBaseUrl } from '../utils/razorpayClient.js';

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

/**
 * Bank account verification through RazorpayX Fund Account Validation (a real
 * "penny drop"): RazorpayX sends ₹1 to the account and reports whether it is
 * active and the account holder's name registered with the bank. Nothing about
 * the check is returned to, or typed in by, the user — the result comes from
 * RazorpayX only.
 *
 * Needs RAZORPAYX_API_KEY, RAZORPAYX_API_SECRET and RAZORPAYX_ACCOUNT_NUMBER.
 */
const razorpayXRequest = async (method, path, body) => {
    const auth = Buffer.from(`${process.env.RAZORPAYX_API_KEY}:${process.env.RAZORPAYX_API_SECRET}`).toString('base64');
    const response = await fetch(`${razorpayApiBaseUrl()}${path}`, {
        method,
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(data?.error?.description || `RazorpayX request failed (${response.status})`);
        error.status = response.status;
        throw error;
    }
    return data;
};

const isRazorpayXConfigured = () => Boolean(
    process.env.RAZORPAYX_API_KEY && process.env.RAZORPAYX_API_SECRET && process.env.RAZORPAYX_ACCOUNT_NUMBER
);

const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** The account being verified belongs to the logged-in user (Admins may pass one). */
const verificationTarget = (req) => resolveActorId(req, 'userId');

export const initiateBankVerification = async (req, res) => {
    try {
        const userId = verificationTarget(req);
        const accountNumber = String(req.body.accountNumber || '').replace(/\s/g, '');
        const ifscCode = String(req.body.ifscCode || '').trim().toUpperCase();
        if (!/^\d{6,18}$/.test(accountNumber)) return res.status(400).json({ message: 'Enter a valid bank account number' });
        if (!IFSC_PATTERN.test(ifscCode)) return res.status(400).json({ message: 'Enter a valid IFSC code' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (!isRazorpayXConfigured()) {
            return res.status(503).json({
                message: 'Instant bank verification is unavailable right now. You can still submit; our team will verify your account during review.'
            });
        }

        const holderName = String(req.body.accountHolderName || user.supplierDetails?.businessName
            || user.shopDetails?.name || user.displayName || 'Account Holder').slice(0, 120);

        const validation = await razorpayXRequest('POST', '/v1/fund_accounts/validations', {
            account_number: process.env.RAZORPAYX_ACCOUNT_NUMBER,
            fund_account: {
                account_type: 'bank_account',
                bank_account: { name: holderName, ifsc: ifscCode, account_number: accountNumber },
                contact: {
                    name: holderName,
                    contact: user.phone || undefined,
                    email: user.email || undefined,
                    type: user.role === 'Supplier' ? 'vendor' : 'customer',
                    reference_id: String(user._id)
                }
            },
            amount: 100,
            currency: 'INR',
            notes: { userId: String(user._id) }
        });

        user.bankVerification = {
            validationId: validation.id,
            status: 'pending',
            isVerified: false,
            accountLast4: accountNumber.slice(-4),
            ifsc: ifscCode,
            registeredName: '',
            lastRequested: new Date()
        };
        await user.save();

        res.json({
            success: true,
            status: 'pending',
            message: 'We are sending ₹1 to this account to verify it. This usually takes under a minute.'
        });
    } catch (error) {
        console.error('❌ [RAZORPAYX] Bank verification request failed:', error.message);
        res.status(error.status === 400 ? 400 : 502).json({ message: `Could not start bank verification. ${error.status === 400 ? error.message : 'Please try again.'}` });
    }
};

/** Checks the RazorpayX result for the user's latest verification request. */
export const completeBankVerification = async (req, res) => {
    try {
        const user = await User.findById(verificationTarget(req));
        const pending = user?.bankVerification;
        if (!user || !pending?.validationId) {
            return res.status(400).json({ message: 'No active verification request found' });
        }
        if (pending.isVerified) {
            return res.json({ success: true, status: 'verified', registeredName: pending.registeredName });
        }
        if (!isRazorpayXConfigured()) {
            return res.status(503).json({ message: 'Instant bank verification is unavailable right now.' });
        }

        const validation = await razorpayXRequest('GET', `/v1/fund_accounts/validations/${encodeURIComponent(pending.validationId)}`);
        if (validation.status !== 'completed') {
            return res.status(202).json({ success: false, status: 'pending', message: 'Verification is still in progress.' });
        }

        const active = validation.results?.account_status === 'active';
        user.bankVerification.status = active ? 'verified' : 'failed';
        user.bankVerification.isVerified = active;
        user.bankVerification.registeredName = validation.results?.registered_name || '';
        await user.save();

        if (!active) {
            return res.status(400).json({
                success: false,
                status: 'failed',
                message: 'The bank reported this account as invalid or inactive. Check the account number and IFSC.'
            });
        }
        res.json({
            success: true,
            status: 'verified',
            registeredName: user.bankVerification.registeredName,
            message: 'Bank Account Verified Successfully!'
        });
    } catch (error) {
        console.error('❌ [RAZORPAYX] Verification status check failed:', error.message);
        res.status(502).json({ message: 'Could not check the verification status. Please try again.' });
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

        const newApplication = await SupplierApplication.create(applicationData);

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
