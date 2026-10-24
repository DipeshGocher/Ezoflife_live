import mongoose from 'mongoose';
import Service from '../models/Service.js';
import MasterService from '../models/MasterService.js';
import { PROFILE_FIELDS } from '../../../shared/profileFields.mjs';
import { safeProfile } from '../utils/profileData.js';
import { requireProfileDestination } from '../middleware/profileAccess.js';
import { canAccessAccount, isScopedAdmin } from '../utils/adminScope.js';
import { httpStatusForError } from '../utils/errorResponse.js';
import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { 
    sendVendorApplicationConfirmation, 
    sendAdminVendorApplicationNotification,
    sendSupplierApplicationConfirmation,
    sendAdminSupplierApplicationNotification
} from '../utils/emailHelper.js';
import { sendWhatsAppMessage, sendSMSMessage } from '../utils/communicationHelper.js';
import { getWhatsAppProvider } from '../services/whatsapp/index.js';

/**
 * WhatsApp is the ONLY OTP channel — there is no SMS fallback for login/signup.
 *
 * While no live WhatsApp Business account is configured (WHATSAPP_ENABLED is
 * unset or credentials are missing), the mock provider is selected and the OTP
 * is the fixed demo value '123456' for every account — there is no way to
 * prove real delivery without a live account, so a fixed code keeps the whole
 * app usable and testable end-to-end. The moment a live provider is selected,
 * this switches to a genuine random 6-digit code with no other changes
 * required. See src/services/whatsapp/README.md.
 */
const generateOTP = () =>
    getWhatsAppProvider().name === 'mock'
        ? '123456'
        : String(Math.floor(100000 + Math.random() * 900000));

export const getVendorEarnings = async (req, res) => {
    try {
        if (req.account?.role === 'Admin' && isScopedAdmin(req)) return res.status(403).json({ message: 'Vendor financial aggregates require access to all service areas.' });
        const { vendorId } = req.query;
        if (!vendorId) return res.status(400).json({ message: 'Vendor ID is required' });

        const Order = (await import('../models/Order.js')).default;
        const Payout = (await import('../models/Payout.js')).default;
        const User = (await import('../models/User.js')).default;

        const vendor = await User.findById(vendorId).select('displayName shopDetails').lean();
        if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

        // Vendor Earnings = baseWithArea + expressSurcharge from priceBreakdown
        const orders = await Order.find({ 
            vendor: vendorId,
            status: { $in: ['Ready', 'Delivered', 'Out for Delivery'] }
        }).select('priceBreakdown status orderId createdAt').lean();
        
        const totalEarnings = orders.reduce((acc, curr) => {
            const breakdown = curr.priceBreakdown || {};
            return acc + (breakdown.baseWithArea || 0) + (breakdown.expressSurcharge || 0);
        }, 0);
        
        // Total Paid by Admin to Vendor
        const payouts = await Payout.find({ vendor: vendorId, status: 'Completed' }).select('amount paidAt').lean();
        const totalPaid = payouts.reduce((acc, curr) => acc + (curr.amount || 0), 0);
        
        const pendingBalance = totalEarnings - totalPaid;

        res.status(200).json({
            _id: vendorId,
            displayName: vendor.displayName,
            shopName: vendor.shopDetails?.name || 'N/A',
            totalOrders: orders.length,
            totalEarnings,
            totalPaid,
            pendingBalance,
            lastPayout: payouts.length > 0 ? payouts[payouts.length - 1].paidAt : null
        });
    } catch (err) {
        console.error('Get Vendor Earnings Error:', err);
        res.status(500).json({ message: 'Error fetching earnings', error: err.message });
    }
};

export const requestOtp = async (req, res) => {
    try {
        // `channel` is no longer read: WhatsApp is the only OTP transport, so a
        // client cannot ask for anything else. Kept in the destructure removed
        // — nothing downstream depends on it any more.
        const { phone, mode, customerType } = req.body;
        const requestedRole = req.body.role || 'Customer'; // Capitalized
        const whatsapp = getWhatsAppProvider();

        // ADMIN BYPASS FOR TESTING
        if (phone === '9999999994') {
            let admin = await User.findOne({ phone });
            if (!admin) {
                return res.status(404).json({ message: 'Your number is not registered' });
            }
            const bypassOtp = generateOTP();
            admin.role = 'Admin';
            admin.status = 'approved';
            admin.otp = bypassOtp;
            admin.otpExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
            await admin.save();
            console.log(`🛡️ [ADMIN_BYPASS] Master Admin activated for ${phone}`);
            // Best-effort delivery — this is a testing bypass, so it must not
            // block or fail the response if WhatsApp is unreachable.
            whatsapp.sendOtp(phone, bypassOtp).catch(err =>
                console.error('Admin bypass OTP send failed:', err.message)
            );
            return res.status(200).json({ message: 'Admin OTP sent successfully', role: 'Admin', mock: whatsapp.name === 'mock' });
        }

        if (!phone) {
            return res.status(400).json({ message: 'Phone number is required' });
        }

        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Find User
        let user = await User.findOne({ phone });

        // Admin Protection: Disable Signup for Admin
        if (requestedRole === 'Admin' && mode === 'signup') {
            return res.status(403).json({ message: 'Admin registration is disabled.' });
        }

        // UNIFIED LOGIN LOGIC
        if (mode === 'login') {
            if (!user) {
                return res.status(404).json({ message: 'Your number is not registered' });
            }
        }

        if (mode === 'signup' && user) {
            return res.status(400).json({ message: `Account already exists as ${user.role}. Please login.` });
        }

        // If Signup and user not found, create as Customer by default
        const finalType = (req.body.customerType || customerType || 'individual').toLowerCase();
        console.log(`👤 [AUTH_TYPE] Setting Customer Type: ${finalType} for ${phone}`);

        const nameToSave = req.body.displayName || req.body.name;
        if (!user) {
            user = new User({ 
                phone, 
                role: requestedRole, // Use the role requested by the frontend
                status: requestedRole === 'Vendor' ? 'pending' : 'approved',
                customerType: finalType,
                displayName: nameToSave || ''
            });
        } else {
            if (nameToSave) {
                user.displayName = nameToSave;
            }
            if (mode === 'signup') {
                 // If for some reason user exists but trying to signup, update type
                 user.customerType = finalType;
            }
        }

        user.otp = otp;
        user.otpExpiry = otpExpiry;
        await user.save();

        // Actually deliver the code. In demo mode this always succeeds (and
        // logs the OTP to the console); once a live WhatsApp account is
        // configured, a real delivery failure is reported to the caller
        // instead of silently claiming success.
        const delivery = await whatsapp.sendOtp(phone, otp);
        if (!delivery.ok) {
            console.error(`❌ [AUTH] OTP could not be delivered to ${phone}: ${delivery.reason}`);
            return res.status(502).json({
                message: 'Could not deliver the OTP on WhatsApp. Please try again shortly.'
            });
        }

        console.log(`👤 [AUTH] OTP requested for ${phone} — role: ${user.role}, mode: ${mode || 'login'}`);

        res.status(200).json({ message: 'OTP sent successfully', role: user.role });
    } catch (err) {
        console.error('Request OTP Error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Comprehensive Vendor Onboarding (4-Stage)
export const becomeVendor = async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            ownerName, 
            businessType, 
            facilityName, 
            panNumber, 
            aadharNumber, 
            gstNumber, 
            businessAddress,
            bankAccountName, 
            bankAccountNumber, 
            ifscCode, 
            bankName,
            serviceRates,
            location 
        } = req.body;
        
        const user = await User.findById(id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        
        // Parse service rates if sent as stringified JSON
        let parsedRates = serviceRates;
        if (typeof serviceRates === 'string') {
            try { parsedRates = JSON.parse(serviceRates); } catch (e) { parsedRates = {}; }
        }

        const servicesArray = Object.keys(parsedRates || {}).map(sId => ({
            id: sId,
            vendorRate: Number(parsedRates[sId]),
            status: 'pending'
        }));

        // Basic Profile & KYV
        user.role = 'Customer'; // Keep as Customer until final approval
        user.status = 'pending';
        user.isProfileComplete = true;
        user.onboardingStage = 'INITIAL_REVIEW';
        
        user.ownerName = ownerName || user.displayName;
        user.businessType = businessType;
        user.facilityName = facilityName;
        user.panNumber = panNumber;
        user.aadharNumber = aadharNumber;
        user.gstNumber = gstNumber;
        user.businessAddress = businessAddress;
        user.displayName = facilityName || user.displayName;

        user.shopDetails = {
            name: facilityName,
            address: businessAddress,
            gst: gstNumber,
            services: servicesArray
        };

        // Handle Location
        if (location) {
            try {
                const parsedLoc = typeof location === 'string' ? JSON.parse(location) : location;
                user.location = {
                    lat: Number(parsedLoc.lat),
                    lng: Number(parsedLoc.lng)
                };
            } catch (e) {
                console.error('Location Parse Error:', e);
            }
        }

        user.bankDetails = {
            accountHolderName: bankAccountName,
            accountNumber: bankAccountNumber,
            ifscCode: ifscCode,
            bankName: bankName
        };

        // Handle File Uploads (Cloudinary URLs from Multer)
        if (req.files) {
            const files = req.files;
            if (!user.documents) user.documents = [];

            const addOrUpdateDoc = (type, url) => {
                if (!url) return;
                const idx = user.documents.findIndex(d => d.type?.toLowerCase() === type.toLowerCase());
                if (idx > -1) {
                    user.documents[idx] = { type, url };
                } else {
                    user.documents.push({ type, url });
                }
            };

            if (files.panDoc) {
                user.panDoc = files.panDoc[0].path;
                addOrUpdateDoc('PAN Card', user.panDoc);
            }
            if (files.gstDoc) {
                user.gstDoc = files.gstDoc[0].path;
                addOrUpdateDoc('GST Certificate', user.gstDoc);
            }
            if (files.aadharDoc) {
                user.aadharDoc = files.aadharDoc[0].path;
                addOrUpdateDoc('Aadhaar Card', user.aadharDoc);
            }
            if (files.msmeDoc) {
                user.msmeDoc = files.msmeDoc[0].path;
                addOrUpdateDoc('MSME Certificate', user.msmeDoc);
            }
            if (files.franchiseDoc) {
                user.franchiseDoc = files.franchiseDoc[0].path;
                addOrUpdateDoc('Franchise Agreement', user.franchiseDoc);
            }
            if (files.chequeDoc) {
                user.chequeDoc = files.chequeDoc[0].path;
                addOrUpdateDoc('Cancelled Cheque', user.chequeDoc);
            }
            if (files.exteriorPhoto) {
                user.exteriorPhoto = files.exteriorPhoto[0].path;
                addOrUpdateDoc('Store Exterior', user.exteriorPhoto);
            }
            if (files.walkthroughVideo) {
                user.walkthroughVideo = files.walkthroughVideo[0].path;
                addOrUpdateDoc('Facility Video', user.walkthroughVideo);
            }
            
            if (files.interiorPhotos) {
                user.interiorPhotos = files.interiorPhotos.map(f => f.path);
                files.interiorPhotos.forEach((f, idx) => {
                    addOrUpdateDoc(`Store Interior ${idx + 1}`, f.path);
                });
            }
        }

        await user.save();
        console.log(`🚀 [VENDOR_REGISTRATION] User ${user.phone} dossier submitted for review`);

        // Send confirmation email if user has email set
        if (user.email) {
            sendVendorApplicationConfirmation(user).catch(err => {
                console.error('Vendor Application Confirmation Email Failed:', err);
            });
        }

        // Send notification email to Admin
        sendAdminVendorApplicationNotification(user).catch(err => {
            console.error('Admin Vendor Application Notification Failed:', err);
        });

        // Send WhatsApp & SMS Notification to User
        const commsMessage = "Thank you for submitting your details to Spinzyt! We have received your inquiry and our team is looking over it. We will get back to you ASAP to discuss the next steps! – The Spinzyt Team";
        
        sendWhatsAppMessage(user.phone, commsMessage).catch(err => {
            console.error('Vendor WhatsApp Notification Failed:', err);
        });

        sendSMSMessage(user.phone, commsMessage).catch(err => {
            console.error('Vendor SMS Notification Failed:', err);
        });

        res.status(200).json({ 
            message: 'Vendor application dossier submitted successfully!', 
            user: {
                id: user._id,
                role: user.role,
                status: user.status,
                onboardingStage: user.onboardingStage
            }
        });
    } catch (err) {
        console.error('Become Vendor Error:', err);
        res.status(500).json({ message: 'Internal server error during dossier submission' });
    }
};

// Phase 2: Submit selected services and rates
export const submitVendorServices = async (req, res) => {
    try {
        const { id } = req.params;
        const { services } = req.body; // Array of { id, vendorRate }
        if (!Array.isArray(services)) return res.status(400).json({ message: 'Services must be an array.' });

        const user = await User.findById(id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const Service = (await import('../models/MasterService.js')).default;
        
        const servicesWithMetadata = await Promise.all(services.map(async (svc) => {
            const master = await Service.findById(svc.id);
            return {
                id: svc.id,
                name: master?.itemName || 'Unknown Service',
                icon: master?.icon || 'local_laundry_service',
                vendorRate: svc.vendorRate,
                status: 'pending'
            };
        }));

        user.shopDetails.services = servicesWithMetadata;

        user.onboardingStage = 'FINAL_REVIEW';
        await user.save();

        res.status(200).json({ message: 'Services submitted for final audit!', user: safeProfile(user) });
    } catch (err) {
        console.error('Submit Services Error:', err);
        res.status(500).json({ message: 'Error submitting services' });
    }
};

// Toggle role to Supplier
export const becomeSupplier = async (req, res) => {
    console.log(`📩 [SUPPLIER_REG] Incoming request for ID: ${req.params.id}`);
    try {
        const { id } = req.params;
        const { supplierName, businessName, address, city, pincode, gst } = req.body;
        
        console.log('📦 [SUPPLIER_REG] Body received:', { supplierName, businessName, city });
        
        // Parse JSON strings if they come as stringified objects in Multipart
        let bankDetails = req.body.bankDetails;
        if (typeof bankDetails === 'string') bankDetails = JSON.parse(bankDetails);
        
        let location = req.body.location;
        if (typeof location === 'string') location = JSON.parse(location);

        const user = await User.findById(id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (user.role === 'Supplier') {
            return res.status(400).json({ message: 'Already a supplier' });
        }

        user.role = 'Supplier';
        user.status = 'pending'; // Changed to pending for Admin approval flow
        user.displayName = supplierName || user.displayName;
        user.supplierDetails = {
            businessName,
            address,
            city,
            pincode,
            gst
        };
        
        if (bankDetails) {
            user.bankDetails = bankDetails;
        }

        if (location) {
            user.location = location;
        }

        // Handle Document Uploads from req.files (Cloudinary)
        const documentFiles = [];
        if (req.files) {
            if (req.files.gstCert) {
                documentFiles.push({ type: 'GST Certificate', url: req.files.gstCert[0].path });
            }
            if (req.files.udyogAadhar) {
                documentFiles.push({ type: 'Udyog Aadhar', url: req.files.udyogAadhar[0].path });
            }
            if (req.files.aadharCard) {
                documentFiles.push({ type: 'Aadhar Card', url: req.files.aadharCard[0].path });
            }
            if (req.files.addressProof) {
                documentFiles.push({ type: 'Address Proof', url: req.files.addressProof[0].path });
            }
        }
        
        if (documentFiles.length > 0) {
            user.documents = documentFiles;
        }

        user.isProfileComplete = true; // Still marked complete, but status is pending
        
        await user.save();
        console.log(`✅ [SUPPLIER_REGISTRATION] User ${user.phone} registered as Supplier (PENDING APPROVAL)`);

        // Send confirmation email to User
        if (user.email) {
            sendSupplierApplicationConfirmation(user).catch(err => {
                console.error('Supplier Application Confirmation Email Failed:', err);
            });
        }

        // Send notification email to Admin
        sendAdminSupplierApplicationNotification(user).catch(err => {
            console.error('Admin Supplier Application Notification Failed:', err);
        });

        // Send WhatsApp & SMS Notification to User
        const commsMessage = "Thank you for submitting your details to Spinzyt! We have received your inquiry and our team is looking over it. We will get back to you ASAP to discuss the next steps! – The Spinzyt Team";
        
        sendWhatsAppMessage(user.phone, commsMessage).catch(err => {
            console.error('Supplier WhatsApp Notification Failed:', err);
        });

        sendSMSMessage(user.phone, commsMessage).catch(err => {
            console.error('Supplier SMS Notification Failed:', err);
        });

        res.status(200).json({ 
            message: 'Registration successful! Waiting for Admin verification.', 
            user: {
                id: user._id,
                phone: user.phone,
                role: user.role,
                status: user.status,
                isProfileComplete: user.isProfileComplete
            }
        });
    } catch (err) {
        console.error('Become Supplier Error:', err);
        res.status(500).json({ message: 'Error upgrading to supplier' });
    }
};

export const verifyOtp = async (req, res) => {
    try {
        const { phone, otp } = req.body;

        if (!phone || !otp) {
            return res.status(400).json({ message: 'Phone and OTP are required' });
        }

        const user = await User.findOne({ phone });

        if (!user || user.otp !== otp || new Date() > user.otpExpiry) {
            return res.status(401).json({ message: 'Invalid or expired OTP' });
        }

        // Clear OTP
        user.otp = null;
        user.otpExpiry = null;
        await user.save();

        // Generate JWT
        const token = jwt.sign(
            { id: user._id, role: user.role, phone: user.phone },
            process.env.JWT_SECRET || 'ezoflife_secret_key_2026',
            { expiresIn: '7d' }
        );

        res.status(200).json({
            message: 'OTP verified successfully',
            token,
            user
        });
    } catch (err) {
        console.error('Verify OTP Error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Complete Vendor Profile
export const completeVendorProfile = async (req, res) => {
    try {
        const { phone, shopName, address, pincode, city, gst } = req.body;
        const location = req.body.location ? JSON.parse(req.body.location) : null;
        const services = req.body.services ? JSON.parse(req.body.services) : [];
        const bankDetails = req.body.bankDetails ? JSON.parse(req.body.bankDetails) : null;

        console.log(`🚀 [PROFILE_COMPLETE] Attempting for Phone: ${phone}`);

        if (phone && phone !== req.profileTarget.phone) return res.status(403).json({ message: 'Phone does not match your account.' });
        const user = await User.findOne({ _id: req.user.id, role: 'Vendor' });
        
        if (!user) {
            console.error(`❌ [PROFILE_COMPLETE] User NOT found with Phone: ${phone} and Role: Vendor`);
            // Extra check: is user there with different role?
            const anyUser = await User.findOne({ phone });
            if (anyUser) console.log(`ℹ️ [DEBUG] Found user with phone ${phone} but role is: ${anyUser.role}`);
            else console.log(`ℹ️ [DEBUG] No user at all found with phone ${phone}`);
            
            return res.status(404).json({ message: 'Vendor not found' });
        }

        // Handle File Uploads from Local Storage
        const documentFiles = [];
        if (req.files) {
            if (req.files.gstDoc) {
                documentFiles.push({ type: 'GST Document', url: req.files.gstDoc[0].path });
            }
            if (req.files.msmeDoc) {
                documentFiles.push({ type: 'MSME Document', url: req.files.msmeDoc[0].path });
            }
        }

        user.shopDetails = {
            name: shopName,
            address: address,
            pincode: pincode,
            city: city,
            gst: gst,
            services: services.map(service => ({ id: service.id, name: service.name, vendorRate: service.vendorRate, status: 'pending' }))
        };
        user.location = location;
        user.bankDetails = bankDetails;
        user.documents = documentFiles; // Store Cloudinary URLs
        user.isProfileComplete = true;
        user.status = 'pending'; 
        await user.save();

        res.status(200).json({ message: 'Profile completed successfully. Pending approval.', user: safeProfile(user) });
    } catch (err) {
        console.error('Complete Profile Error:', err);
        res.status(500).json({ message: 'Error completing profile' });
    }
};

// Get User Status
export const getStatus = async (req, res) => {
    try {
        const { phone } = req.query;
        if (!phone) return res.status(400).json({ message: 'Phone is required' });

        if (phone !== req.profileTarget.phone) return res.status(403).json({ message: 'You cannot inspect this account status.' });
        const user = await User.findOne({ _id: req.user.id, role: 'Vendor' });
        if (!user) return res.status(404).json({ message: 'Vendor not found' });

        res.status(200).json({ 
            status: user.status, 
            isProfileComplete: user.isProfileComplete 
        });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching status' });
    }
};

// Update FCM Token
export const updateFcmToken = async (req, res) => {
    try {
        const { userId, fcmToken } = req.body;
        if (!userId || !fcmToken) {
            return res.status(400).json({ message: 'User ID and FCM Token are required' });
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { fcmToken },
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        console.log(`🔑 [FCM] Token updated for user: ${updatedUser.phone}`);
        res.status(200).json({ message: 'FCM Token updated successfully' });
    } catch (err) {
        console.error('Update FCM Token Error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Admin Login
export const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Hardcoded admin for now as per user request to not change too much
        // In a real app, we would find the user in DB and compare hashed passwords
        if (email === 'admin@ezoflife.com' && password === 'admin123') {
            let user = await User.findOne({ phone: 'ADMIN_SYSTEM', role: 'Admin' });
            if (!user) {
                user = new User({ phone: 'ADMIN_SYSTEM', role: 'Admin', displayName: 'System Admin' });
                await user.save();
            }

            const token = jwt.sign(
                { id: user._id, role: user.role, phone: user.phone },
                process.env.JWT_SECRET || 'ezoflife_secret_key_2026',
                { expiresIn: '7d' }
            );

            return res.status(200).json({
                message: 'Admin login successful',
                token,
                user: {
                    id: user._id,
                    phone: user.phone,
                    role: user.role,
                    displayName: user.displayName
                }
            });
        }

        // Dynamic Sub-Admin login checking
        const subAdmin = await User.findOne({ email, role: 'Admin' });
        if (subAdmin && subAdmin.password) {
            if (subAdmin.status !== 'approved') {
                return res.status(403).json({ message: `Your sub-admin account status is currently: ${subAdmin.status}.` });
            }

            const isMatch = await bcrypt.compare(password, subAdmin.password);
            if (isMatch) {
                const token = jwt.sign(
                    { id: subAdmin._id, role: subAdmin.role, phone: subAdmin.phone },
                    process.env.JWT_SECRET || 'ezoflife_secret_key_2026',
                    { expiresIn: '7d' }
                );

                return res.status(200).json({
                    message: 'Admin login successful',
                    token,
                    user: {
                        id: subAdmin._id,
                        phone: subAdmin.phone,
                        role: subAdmin.role,
                        displayName: subAdmin.displayName,
                        email: subAdmin.email,
                        adminRole: subAdmin.adminRole,
                        adminPermissions: subAdmin.adminPermissions || [],
                        adminAccessType: subAdmin.adminAccessType || 'Read/Write'
                    }
                });
            }
        }

        return res.status(401).json({ message: 'Invalid admin credentials' });
    } catch (err) {
        console.error('Admin Login Error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Profile Management
export const getUserProfile = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id).select('-password -otp -otpExpiry -activationToken -fcmToken -bankVerification.amount').lean();
        if (!user) return res.status(404).json({ message: 'User not found' });

        // If Vendor, merge/map service details for clear UI
        if (user.role === 'Vendor' && user.shopDetails?.services) {
            const MasterService = (await import('../models/MasterService.js')).default;
            const masterServices = await MasterService.find().lean();
            
            user.shopDetails.services = user.shopDetails.services.map(svc => {
                const master = masterServices.find(m => m._id.toString() === svc.id || m.id === svc.id);
                return {
                    ...svc,
                    name: master ? master.itemName : `Service ${svc.id.slice(-4)}`,
                    icon: master ? master.icon : 'local_laundry_service'
                };
            });
        }

        // If Supplier (or user has a supplier application), sync & populate bank details and documents from SupplierApplication if missing
        if (user.role === 'Supplier' || user.isVerifiedSupplier || !user.bankDetails?.accountNumber || !user.documents?.length) {
            const SupplierApplication = (await import('../models/SupplierApplication.js')).default;
            const supplierApp = await SupplierApplication.findOne({ user: id }).lean();
            if (supplierApp) {

                // Bank details sync
                if ((!user.bankDetails?.accountNumber || !user.bankDetails?.bankName) && supplierApp.accountNumber) {
                    user.bankDetails = {
                        accountHolderName: user.bankDetails?.accountHolderName || supplierApp.contactPersonName || supplierApp.registeredBusinessName || '',
                        accountNumber: supplierApp.accountNumber || '',
                        ifscCode: supplierApp.ifscCode || '',
                        bankName: supplierApp.bankName || ''
                    };
                }

                // Documents sync
                if (!user.documents || user.documents.length === 0) {
                    const docs = [];
                    if (supplierApp.gstDoc) docs.push({ type: 'GST Document', url: supplierApp.gstDoc });
                    if (supplierApp.panDoc) docs.push({ type: 'PAN Card', url: supplierApp.panDoc });
                    if (supplierApp.msmeDoc) docs.push({ type: 'MSME Document', url: supplierApp.msmeDoc });
                    if (supplierApp.cancelledChequeDoc) docs.push({ type: 'Cancelled Cheque', url: supplierApp.cancelledChequeDoc });
                    if (supplierApp.priceListDoc) docs.push({ type: 'Price List', url: supplierApp.priceListDoc });
                    if (supplierApp.manufacturerAuthDoc) docs.push({ type: 'Manufacturer Auth', url: supplierApp.manufacturerAuthDoc });
                    if (supplierApp.ownerAadhaar && typeof supplierApp.ownerAadhaar === 'string' && supplierApp.ownerAadhaar.startsWith('http')) {
                        docs.push({ type: 'Aadhaar Document', url: supplierApp.ownerAadhaar });
                    }
                    if (docs.length > 0) {
                        user.documents = docs;

                    }
                }

                // SupplierDetails sync if missing
                if (!user.supplierDetails?.businessName && supplierApp.registeredBusinessName) {
                    user.supplierDetails = {
                        ...(user.supplierDetails || {}),
                        businessName: supplierApp.registeredBusinessName,
                        address: supplierApp.warehouseAddress || '',
                        gst: supplierApp.gstNumber || '',
                        city: supplierApp.city || '',
                        pincode: supplierApp.pincode || ''
                    };

                }


            }
        }

        // If Vendor, sync & populate documents array from registration fields if missing
        if (user.role === 'Vendor' || user.status === 'approved' || user.panDoc || user.gstDoc || user.aadharDoc) {
            let docList = Array.isArray(user.documents) ? [...user.documents] : [];
            const docMap = new Map(docList.map(d => [d.type?.toLowerCase().trim(), d]));

            const syncDoc = (type, url) => {
                if (url && typeof url === 'string' && url.trim().length > 0) {
                    if (!docMap.has(type.toLowerCase().trim())) {
                        const newDoc = { type, url };
                        docList.push(newDoc);
                        docMap.set(type.toLowerCase().trim(), newDoc);
                    }
                }
            };

            syncDoc('PAN Card', user.panDoc);
            syncDoc('GST Certificate', user.gstDoc);
            syncDoc('Aadhaar Card', user.aadharDoc);
            syncDoc('MSME Certificate', user.msmeDoc);
            syncDoc('Cancelled Cheque', user.chequeDoc);
            syncDoc('Franchise Agreement', user.franchiseDoc);
            syncDoc('Store Exterior', user.exteriorPhoto);
            if (Array.isArray(user.interiorPhotos)) {
                user.interiorPhotos.forEach((photo, idx) => {
                    syncDoc(`Store Interior ${idx + 1}`, photo);
                });
            }
            syncDoc('Facility Video', user.walkthroughVideo);

            if (docList.length > (user.documents?.length || 0)) {
                user.documents = docList;

            }
        }

        res.status(200).json(safeProfile(user));
    } catch (err) {
        console.error('Get Profile Error:', err);
        res.status(500).json({ message: 'Error fetching profile' });
    }
};

export const updateUserProfile = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const user = await User.findById(id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const isAdmin = req.user.role === 'Admin';
        const allowed = [...PROFILE_FIELDS, ...(isAdmin && user.role !== 'Admin' ? ['status'] : [])];
        if (Object.keys(updates).some(key => !allowed.includes(key))) return res.status(400).json({ message: 'Profile contains protected or unsupported fields.' });
        const unsafeKeys = value => value && typeof value === 'object' && Object.entries(value).some(([key, child]) => key.includes('.') || key.startsWith('$') || ['__proto__', 'constructor', 'prototype'].includes(key) || unsafeKeys(child));
        if (unsafeKeys(updates)) return res.status(400).json({ message: 'Invalid profile field.' });
        if (updates.status !== undefined && !['approved', 'rejected'].includes(updates.status)) return res.status(400).json({ message: 'Use the approval workflow for onboarding status changes.' });
        if (updates.shopDetails?.services !== undefined && !Array.isArray(updates.shopDetails.services)) return res.status(400).json({ message: 'Services must be an array.' });
        if (!isAdmin && updates.shopDetails?.services) {
            const normalized = [];
            for (const service of updates.shopDetails.services) {
                if (!service || typeof service !== 'object') return res.status(400).json({ message: 'Invalid service entry.' });
                const previous = user.shopDetails?.services?.find(item => String(item.id) === String(service.id));
                const approved = !previous && mongoose.isValidObjectId(service.id) ? await Service.findOne({ _id: service.id, vendorId: user._id, approvalStatus: 'Approved' }).lean() : null;
                const master = !previous && !approved && mongoose.isValidObjectId(service.id) ? await MasterService.findById(service.id).select('basePrice').lean() : null;
                const adminRate = previous?.adminRate ?? approved?.basePrice ?? master?.basePrice;
                const status = previous?.status || (approved ? 'approved' : 'pending');
                if ((service.adminRate !== undefined && service.adminRate !== adminRate) || (service.rejectionReason !== undefined && service.rejectionReason !== (previous?.rejectionReason || '')) || (service.status !== undefined && !['pending', 'offered', status].includes(service.status))) return res.status(403).json({ message: 'Service approval and admin prices cannot be edited here.' });
                normalized.push({ ...service, ...(adminRate !== undefined ? { adminRate } : {}), status: service.status || status, rejectionReason: previous?.rejectionReason || '' });
            }
            updates.shopDetails.services = normalized;
        }
        if (req.walkInAddress && updates.addresses !== undefined) {
            if (!Array.isArray(updates.addresses) || updates.addresses.length !== 1) return res.status(400).json({ message: 'A walk-in update can only save one destination address.' });
            const destination = updates.addresses[0];
            if (!destination || typeof destination !== 'object' || typeof destination.address !== 'string' || !destination.address.trim()) return res.status(400).json({ message: 'A destination address is required.' });
            const existing = (user.addresses || []).map(address => ({ ...address.toObject(), isDefault: false }));
            updates.addresses = [...existing.filter(address => address.address !== destination.address), { ...destination, _id: undefined, isDefault: true }];
        }
        // Surgical update using Mongoose .set() to ensure nested paths are tracked
        Object.keys(updates).forEach(key => {
            if (typeof updates[key] === 'object' && updates[key] !== null && !Array.isArray(updates[key])) {
                // For objects, we can merge or use path notation. Path notation is safer.
                Object.keys(updates[key]).forEach(subKey => {
                    user.set(`${key}.${subKey}`, updates[key][subKey]);
                });
            } else {
                user.set(key, updates[key]);
            }
        });

        if (updates.status !== undefined) user.isBlocked = updates.status === 'rejected';
        if (!await requireProfileDestination(req, user)) return res.status(403).json({ message: 'The updated profile is outside your permitted service areas.' });

        // ROLE-AWARE SYNC: If root address/pincode/city is updated, sync to specific details
        if (updates.address || updates.pincode || updates.city) {
            if (user.role === 'Vendor') {
                user.shopDetails = {
                    ...user.shopDetails,
                    address: updates.address || user.shopDetails.address,
                    pincode: updates.pincode || user.shopDetails.pincode,
                    city: updates.city || user.shopDetails.city
                };
            } else if (user.role === 'Supplier') {
                user.supplierDetails = {
                    ...user.supplierDetails,
                    address: updates.address || user.supplierDetails.address,
                    pincode: updates.pincode || user.supplierDetails.pincode,
                    city: updates.city || user.supplierDetails.city
                };
            }
        }

        if (updates.location) {
            console.log(`\n\x1b[36m📍 [ADDRESS UPDATE] Customer/Vendor Role: ${user.role} | Phone: ${user.phone}\x1b[0m`);
            console.log(`\x1b[33m   Coordinates Received (Default):\x1b[0m`, updates.location);
        }
        if (updates.addresses && Array.isArray(updates.addresses)) {
            updates.addresses.forEach((addr, idx) => {
                if (addr.location) {
                    console.log(`\x1b[33m   Address [${idx}] (${addr.type}) Coordinates:\x1b[0m`, addr.location);
                }
            });
        }

        await user.save();
        res.status(200).json(req.walkInAddress ? { _id: user._id, address: user.address, location: user.location } : safeProfile(user));
    } catch (err) {
        console.error('Update Profile Error:', err);
        res.status(httpStatusForError(err)).json({ message: 'Error updating profile', error: err.message });
    }
};

export const updateVendorDocuments = async (req, res) => {
    try {
        const { id } = req.params;
        const { type } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ message: 'No document file uploaded' });
        }

        const user = await User.findById(id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const newDoc = {
            type,
            url: req.file.path // Cloudinary URL
        };

        // Find if document of same type exists
        const existingDocIdx = user.documents.findIndex(d => d.type === type);
        
        if (existingDocIdx > -1) {
            // Replace existing
            user.documents[existingDocIdx] = newDoc;
        } else {
            // Add new
            user.documents.push(newDoc);
        }

        // Keep direct fields in sync
        const typeLower = (type || '').toLowerCase().trim();
        if (typeLower.includes('pan')) user.panDoc = req.file.path;
        else if (typeLower.includes('gst')) user.gstDoc = req.file.path;
        else if (typeLower.includes('aadhaar') || typeLower.includes('aadhar')) user.aadharDoc = req.file.path;
        else if (typeLower.includes('cheque')) user.chequeDoc = req.file.path;
        else if (typeLower.includes('msme')) user.msmeDoc = req.file.path;
        else if (typeLower.includes('franchise')) user.franchiseDoc = req.file.path;
        else if (typeLower.includes('exterior')) user.exteriorPhoto = req.file.path;

        await user.save();
        res.status(200).json(safeProfile(user));
    } catch (err) {
        console.error('Update Documents Error:', err);
        res.status(500).json({ message: 'Error updating documents' });
    }
};

export const updateProfileImage = async (req, res) => {
    try {
        const { id } = req.params;
        if (!req.file) {
            return res.status(400).json({ message: 'No image file uploaded' });
        }

        const user = await User.findById(id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.image = req.file.path; // Cloudinary URL
        await user.save();
        
        res.status(200).json(safeProfile(user));
    } catch (err) {
        console.error('Update Profile Image Error:', err);
        res.status(500).json({ message: 'Error updating profile image' });
    }
};

// Admin registering a vendor
export const registerVendor = async (req, res) => {
    try {
        const { name, mobile, email, gstNumber, password, address } = req.body;

        if (!name || !mobile || !email || !password) {
            return res.status(400).json({ message: 'Name, mobile, email and password are required' });
        }

        // Check if vendor already exists
        const existingUser = await User.findOne({ $or: [{ phone: mobile }, { email }] });
        if (existingUser) {
            return res.status(400).json({ message: 'Vendor with this mobile or email already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        const newVendor = new User({
            displayName: name,
            phone: mobile,
            email,
            password: hashedPassword,
            role: 'Vendor',
            status: 'approved', // Admin registered vendors are auto-approved
            address: address, // Main user address
            shopDetails: {
                name: name,
                address: address,
                gst: gstNumber,
                services: []
            },
            isProfileComplete: true
        });

        await newVendor.save();

        res.status(201).json({
            message: 'Vendor registered successfully',
            vendor: {
                id: newVendor._id,
                name: newVendor.displayName,
                email: newVendor.email,
                phone: newVendor.phone
            }
        });
    } catch (err) {
        console.error('Register Vendor Error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Vendor login with password
export const vendorLogin = async (req, res) => {
    try {
        const { identifier, password } = req.body; // identifier can be email or phone

        if (!identifier || !password) {
            return res.status(400).json({ message: 'Email/Phone and password are required' });
        }

        const user = await User.findOne({ 
            $or: [{ email: identifier }, { phone: identifier }],
            role: 'Vendor'
        });

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (user.status !== 'approved') {
            return res.status(403).json({ message: `Your account status is: ${user.status}. Access denied.` });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Generate JWT
        const token = jwt.sign(
            { id: user._id, role: user.role, phone: user.phone },
            process.env.JWT_SECRET || 'ezoflife_secret_key_2026',
            { expiresIn: '7d' }
        );

        res.status(200).json({
            message: 'Vendor login successful',
            token,
            user: {
                id: user._id,
                phone: user.phone,
                email: user.email,
                role: user.role,
                displayName: user.displayName,
                status: user.status,
                isProfileComplete: user.isProfileComplete,
                shopDetails: user.shopDetails
            }
        });
    } catch (err) {
        console.error('Vendor Login Error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};
export const tempSeedUser = async (req, res) => {
    try {
        const phone = '9926723112';
        const otp = generateOTP();
        let user = await User.findOne({ phone });
        
        if (user) {
            user.otp = otp;
            user.otpExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await user.save();
            return res.status(200).json({ message: 'User updated successfully', user });
        } else {
            user = new User({
                phone,
                otp,
                otpExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
                role: 'Customer',
                status: 'approved',
                isProfileComplete: false
            });
            await user.save();
            return res.status(201).json({ message: 'User created successfully', user });
        }
    } catch (err) {
        console.error('Seed Error:', err);
        res.status(500).json({ message: 'Seed failed', error: err.message });
    }
};

export const getDraftCart = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id).select('draftCart');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.status(200).json(user.draftCart || {});
    } catch (err) {
        console.error('Get Cart Error:', err);
        res.status(500).json({ message: 'Error fetching cart' });
    }
};

export const updateDraftCart = async (req, res) => {
    try {
        const { id } = req.params;
        const { cart } = req.body;
        const user = await User.findById(id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        
        user.draftCart = cart;
        await user.save();
        res.status(200).json({ message: 'Cart updated successfully', cart: user.draftCart });
    } catch (err) {
        console.error('Update Cart Error:', err);
        res.status(500).json({ message: 'Error updating cart' });
    }
};

export const lookupCustomerByPhone = async (req, res) => {
    try {
        const { phone } = req.params;
        if (!/^\d{10,13}$/.test(phone)) return res.status(400).json({ message: 'A valid phone number is required.' });
        const customer = await User.findOne({ phone: new RegExp(phone.slice(-10) + '$') });
        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }
        
        if (customer.role !== 'Customer') {
            return res.status(400).json({ 
                message: `This phone number is registered as a ${customer.role}. Only Customer accounts are allowed.` 
            });
        }

        if (!await canAccessAccount(req, customer)) return res.status(403).json({ message: 'Customer is outside your permitted service areas.' });
        if (customer.isBlocked) return res.status(403).json({ message: 'This customer is unavailable for walk-in updates.' });
        const addressUpdateToken = jwt.sign({ purpose: 'walkin-address', actorId: String(req.user.id), customerId: String(customer._id) }, process.env.JWT_SECRET || 'ezoflife_secret_key_2026', { expiresIn: '15m' });
        let defAddr = customer.addresses && customer.addresses.length > 0 ? customer.addresses[0] : null;
        res.status(200).json({ 
            id: customer._id,
            addressUpdateToken,
            displayName: customer.displayName || '',
            type: defAddr ? defAddr.type : 'Home',
            address: defAddr ? defAddr.address : (customer.address || ''),
            city: defAddr ? defAddr.city : (customer.city || ''),
            state: defAddr ? (defAddr.state || '') : (customer.state || ''),
            pincode: defAddr ? defAddr.pincode : (customer.pincode || ''),
            lat: defAddr ? defAddr.location?.lat : (customer.location?.lat || null),
            lng: defAddr ? defAddr.location?.lng : (customer.location?.lng || null),
            isRegistered: true
        });
    } catch (err) {
        console.error('Lookup Phone Error:', err);
        res.status(500).json({ message: 'Error looking up customer' });
    }
};

// Invite a new sub-admin (called by Master Admin)
export const inviteSubAdmin = async (req, res) => {
    try {
        const { firstName, lastName, email, phone, role, accessType, geofences } = req.body;

        if (!firstName || !lastName || !email || !phone || !role) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Check if phone or email already registered
        const existingUser = await User.findOne({ $or: [{ phone }, { email }] });
        if (existingUser) {
            return res.status(400).json({ message: 'A user with this phone or email already exists' });
        }

        // Generate activation details
        const activationToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit OTP
        const otpExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        // Map role permissions based on matrix
        let permissions = [];
        if (role === 'Master Admin') {
            permissions = ['Dashboard', 'User Management', 'Registration Approval', 'Vendor Service Request', 'Supplier Product Request', 'Orders', 'Services & Pricing', 'Vendor Supply Pricing', 'Support Tickets', 'Notifications', 'FAQ Manager', 'Privacy Policy', 'Terms & Conditions', 'Splash Ads', 'Advertise', 'Referral Settings', 'Promotions', 'Partnerships', 'Customer Feedback', 'Career Center', 'Settings', 'Invoice Design'];
        } else if (role === 'Global Auditor / Developer') {
            permissions = ['Dashboard', 'User Management', 'Registration Approval', 'Vendor Service Request', 'Supplier Product Request', 'Orders', 'Services & Pricing', 'Vendor Supply Pricing', 'Support Tickets', 'Notifications', 'FAQ Manager', 'Privacy Policy', 'Terms & Conditions', 'Splash Ads', 'Advertise', 'Referral Settings', 'Promotions', 'Partnerships', 'Customer Feedback', 'Career Center', 'Settings', 'Invoice Design'];
        } else if (role === 'Operations & Pricing Lead') {
            permissions = ['Dashboard', 'Registration Approval', 'Vendor Service Request', 'Supplier Product Request', 'Orders'];
        } else if (role === 'Customer Support Executive') {
            permissions = ['User Management', 'Orders', 'Support Tickets', 'FAQ Manager'];
        } else if (role === 'Logistics & Shipping Coordinator') {
            permissions = ['Orders', 'Support Tickets', 'Notifications'];
        } else if (role === 'Growth & Marketing Admin') {
            permissions = ['Splash Ads', 'Advertise', 'Referral Settings', 'Promotions', 'Partnerships'];
        } else if (role === 'HR') {
            permissions = ['User Management', 'Support Tickets', 'FAQ Manager', 'Career Center', 'Invoice Design', 'Customer Feedback'];
        } else {
            // Custom role
            permissions = req.body.permissions || [];
        }

        // Save placeholder sub-admin to DB
        const newAdmin = new User({
            phone,
            email,
            role: 'Admin',
            displayName: `${firstName} ${lastName}`,
            status: 'pending',
            adminRole: role,
            adminPermissions: permissions,
            adminAccessType: accessType || 'Read/Write',
            geofenceRestrictions: geofences || [],
            otp,
            otpExpiry,
            activationToken
        });
        
        await newAdmin.save();

        // Generate activation link
        const activationLink = `http://localhost:5173/admin/activate?token=${activationToken}`;

        // 1. Send Whatsapp Message Mock to backend terminal
        console.log('\n----------------------------------------');
        console.log('🟢 [WHATSAPP MOCK] Sub-Admin Invitation');
        console.log(`📱 Phone: +91 ${phone}`);
        console.log(`👤 Name: ${firstName} ${lastName}`);
        console.log(`🔑 Verification OTP: ${otp}`);
        console.log(`🔗 Link: ${activationLink}`);
        console.log('----------------------------------------\n');

        // 2. Send email using helper
        try {
            const { sendSubAdminActivationEmail } = await import('../utils/emailHelper.js');
            await sendSubAdminActivationEmail(email, firstName, activationLink, otp);
            console.log(`📧 [EMAIL] Sent sub-admin invitation email to ${email}`);
        } catch (emailErr) {
            console.error('❌ Failed to send sub-admin activation email:', emailErr.message);
        }

        res.status(201).json({
            success: true,
            message: 'Sub-admin invited successfully. Check terminal for WhatsApp mock and email logs.',
            activationLink,
            otp
        });

    } catch (err) {
        console.error('Invite Sub-Admin Error:', err);
        res.status(500).json({ message: 'Internal server error', error: err.message });
    }
};

// Fetch sub-admin activation details by token (Public GET)
export const getSubAdminActivationDetails = async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.status(400).json({ message: 'Token is required' });
        }

        const user = await User.findOne({ activationToken: token, role: 'Admin' });
        if (!user) {
            return res.status(404).json({ message: 'Invalid or expired invitation link' });
        }

        res.status(200).json({
            email: user.email,
            phone: user.phone,
            displayName: user.displayName,
            adminRole: user.adminRole
        });
    } catch (err) {
        console.error('Get Activation Details Error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Activate sub-admin (sets password and verifies via OTP) (Public POST)
export const activateSubAdmin = async (req, res) => {
    try {
        const { token, password, otp } = req.body;

        if (!token || !password || !otp) {
            return res.status(400).json({ message: 'Token, password, and OTP are required' });
        }

        const user = await User.findOne({ activationToken: token, role: 'Admin' });
        if (!user) {
            return res.status(404).json({ message: 'Invalid or expired activation token' });
        }

        // Verify OTP
        if (user.otp !== otp) {
            return res.status(400).json({ message: 'Invalid verification OTP' });
        }

        if (new Date() > user.otpExpiry) {
            return res.status(400).json({ message: 'Verification OTP has expired' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Update user status and credentials
        user.password = hashedPassword;
        user.status = 'approved';
        user.otp = null;
        user.otpExpiry = null;
        user.activationToken = null;

        await user.save();

        console.log(`🔓 [SUB_ADMIN] Account activated successfully for: ${user.email}`);

        res.status(200).json({
            success: true,
            message: 'Account activated successfully! You can now log in using your password.'
        });
    } catch (err) {
        console.error('Activate Sub-Admin Error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};
