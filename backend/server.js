import { requireUnrestrictedAdmin } from './src/middleware/adminAccountScope.js';
import dotenv from 'dotenv';
dotenv.config();

import dns from 'node:dns';
// Fix querySrv EBADRESP on local networks / ISPs by using reliable public DNS servers
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

console.log('🔥 SERVER IS BOOTING WITH LATEST ADMIN CLEANUP CODE (APR 26)...');
// Server updated at 2026-04-29T11:58:25
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import morgan from 'morgan';
import http from 'http';
import fs from 'fs';

const logToFile = (msg) => {
    try {
        fs.appendFileSync('./REAL_USER_DEBUG.log', `${new Date().toISOString()} - ${msg}\n`);
    } catch (e) {}
};

// Route imports
import authRoutes from './src/routes/authRoutes.js';
import { verifyAdmin } from './src/middleware/authMiddleware.js';
import adminRoutes from './src/routes/adminRoutes.js';
import orderRoutes from './src/routes/orderRoutes.js';
import notificationRoutes from './src/routes/notificationRoutes.js';
import serviceRoutes from './src/routes/serviceRoutes.js';
import jobRoutes from './src/routes/jobRoutes.js';
import materialRoutes from './src/routes/materialRoutes.js';
import ticketRoutes from './src/routes/ticketRoutes.js';
import faqRoutes from './src/routes/faqRoutes.js';
import feedbackRoutes from './src/routes/feedbackRoutes.js';
import mediaRoutes from './src/routes/mediaRoutes.js';
import partnershipRoutes from './src/routes/partnershipRoutes.js';
import promotionRoutes from './src/routes/promotionRoutes.js';
import b2bOrderRoutes from './src/routes/b2bOrderRoutes.js';
import masterServiceRoutes from './src/routes/masterServiceRoutes.js';
import adRoutes from './src/routes/adRoutes.js';
import logisticsRoutes from './src/routes/logisticsRoutes.js';
import categoryRoutes from './src/routes/categoryRoutes.js';
import vendorSupplyCategoryRoutes from './src/routes/vendorSupplyCategoryRoutes.js';
import vendorMasterSupplyRoutes from './src/routes/vendorMasterSupplyRoutes.js';
import referralRoutes from './src/routes/referralRoutes.js';
import supplierServiceZoneRoutes from './src/routes/supplierServiceZoneRoutes.js';
import dashboardAnalyticsRoutes from './src/routes/dashboardAnalyticsRoutes.js';

import legalRoutes from './src/routes/legalRoutes.js';
import supplierRoutes from './src/routes/supplierRoutes.js';
import geofenceRoutes from './src/routes/geofenceRoutes.js';
import areaOverrideRoutes from './src/routes/areaOverrideRoutes.js';
import masterPricingRoutes from './src/routes/masterPricingRoutes.js';
import vendorProductQueryRoutes from './src/routes/vendorProductQueryRoutes.js';


import SystemConfig from './src/models/SystemConfig.js';
import { getSystemConfig, updateSystemConfig } from './src/controllers/adminController.js';
import { addSpecialist, getAllSpecialists, deleteSpecialist, createRequisition, getAllRequisitions, assignRequisition } from './src/controllers/laborController.js';

import { initPickupScheduler } from './src/jobs/pickupScheduler.js';
import { startOrderAggregationJob } from './src/jobs/orderAggregationJob.js';
import { initSocket } from './src/socket.js';

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
initSocket(server);

// Initialize Jobs
initPickupScheduler();
startOrderAggregationJob();

// Middleware
const envOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map(o => o.trim().replace(/\/$/, ''))
    .filter(Boolean);

const defaultOrigins = [
    'http://localhost:5173', 
    'http://localhost:5174',
    'https://ezoflife-six.vercel.app'
];

const allowedOrigins = Array.from(new Set([...envOrigins, ...defaultOrigins]));

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        
        let cleanOrigin = origin.trim().replace(/\/$/, '');
        try {
            cleanOrigin = new URL(origin).origin;
        } catch (e) {}

        const isAllowed = allowedOrigins.some(allowed => {
            if (allowed === '*') return true;
            let cleanAllowed = allowed.trim().replace(/\/$/, '');
            try {
                cleanAllowed = new URL(allowed).origin;
            } catch (e) {}
            return cleanOrigin === cleanAllowed;
        });

        if (isAllowed || cleanOrigin.endsWith('.vercel.app')) {
            callback(null, true);
        } else {
            console.log('🚫 CORS Blocked Origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(express.json());
app.use(morgan('dev'));
app.use('/uploads', express.static('uploads'));

// Global Traffic Monitor
app.use((req, res, next) => {
    const logMsg = `📡 [TRAFFIC] ${new Date().toLocaleTimeString()} | ${req.method} ${req.url}`;
    console.log(logMsg);
    logToFile(logMsg);
    next();
});

// ─── Public Routes (no auth required) ────────────────────────────────────────
app.use('/api/auth', authRoutes);

// Public read-only config (needed at app startup)
app.get('/api/admin/config', getSystemConfig);

// ─── Protected Admin Routes (JWT required) ────────────────────────────────────
// All routes below require a valid Admin JWT in Authorization: Bearer <token>
app.post('/api/admin/config', verifyAdmin, requireUnrestrictedAdmin, updateSystemConfig);
app.use('/api/admin/dashboard-analytics', verifyAdmin, dashboardAnalyticsRoutes);
app.use('/api/admin', verifyAdmin, adminRoutes);
app.post('/api/admin/force-clear-orders', verifyAdmin, requireUnrestrictedAdmin, async (req, res) => {
    try {
        const Order = (await import('./src/models/Order.js')).default;
        await Order.deleteMany({});
        res.json({ message: 'Database Purged: All orders removed.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.get('/api/admin-test-direct', verifyAdmin, (req, res) => res.json({ message: 'Admin Direct Route Active' }));

// ─── General App Routes ───────────────────────────────────────────────────────
app.use('/api/orders', orderRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/faqs', faqRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/media', mediaRoutes);
console.log('🛠️ [DEBUG] Loading Master Service Routes...', typeof masterServiceRoutes);
app.get('/api/master-test', (req, res) => res.json({ msg: 'Master Route System Active' }));
app.use('/api/master-services', masterServiceRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/legal', legalRoutes);
app.use('/api/supplier', supplierRoutes);

app.use('/api/jobs', jobRoutes);
app.use('/api/partnerships', partnershipRoutes);
console.log('🛠️ [DEBUG] Loading B2B Order Routes...', typeof b2bOrderRoutes);
app.use('/api/b2b-orders', b2bOrderRoutes);
app.use('/api/ads', adRoutes);
app.use('/api/logistics', logisticsRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/vendor-supply-categories', vendorSupplyCategoryRoutes);
app.use('/api/vendor-master-supplies', vendorMasterSupplyRoutes);
app.use('/api/supplier-service-zones', supplierServiceZoneRoutes);



// ─── Admin-only Data Routes (JWT required) ───────────────────────────────────
app.use('/api/geofence', geofenceRoutes);
app.use('/api/area-overrides', verifyAdmin, areaOverrideRoutes);
app.use('/api/master-pricing', masterPricingRoutes);
app.use('/api/vendor-product-queries', vendorProductQueryRoutes);

// Labor Routes
app.post('/api/labor/add', verifyAdmin, addSpecialist);
app.get('/api/labor/all', getAllSpecialists);
app.delete('/api/labor/:id', verifyAdmin, deleteSpecialist);
app.post('/api/labor/place-request', createRequisition);
app.get('/api/labor/active-requests', verifyAdmin, getAllRequisitions);
app.patch('/api/labor/place-request/:id/assign', verifyAdmin, assignRequisition);

// Database Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ezoflife';
mongoose.connect(MONGODB_URI)
    .then(async () => {
        console.log('✅ Connected to MongoDB');
        try {
            // Seed Role Templates
            const RoleTemplate = (await import('./src/models/RoleTemplate.js')).default;
            const defaultTemplates = [
                {
                    name: 'Ironing Specialist',
                    description: 'Responsible for high-quality pressing and steam finishing of all garments.',
                    responsibilities: [
                        'Iron and steam press garments to meet quality standards',
                        'Inspect garments for stains or damage before pressing',
                        'Organize ironed clothes neatly on hangers or folded packs',
                        'Follow safety protocols while handling hot equipment'
                    ]
                },
                {
                    name: 'Delivery Rider',
                    description: 'Responsible for timely pickup and delivery of garments while ensuring customer satisfaction.',
                    responsibilities: [
                        'Deliver orders safely and on time',
                        'Handle customer interactions professionally',
                        'Maintain delivery records and receipts',
                        'Follow assigned delivery schedules and route guidelines'
                    ]
                },
                {
                    name: 'Shop Assistant',
                    description: 'Handles customer walk-ins, garment intake, tagging, and general storefront support.',
                    responsibilities: [
                        'Greet customers and register incoming garments',
                        'Use shop software to generate receipts and tags',
                        'Explain services, pricing, and promotional offers to customers',
                        'Hand over completed orders and process payments'
                    ]
                },
                {
                    name: 'Dry Clean Technician',
                    description: 'Operates dry cleaning machinery and handles delicate fabrics using specialized chemicals.',
                    responsibilities: [
                        'Categorize and inspect garments for dry clean compatibility',
                        'Apply stain-treatment solvents and operate cleaning equipment',
                        'Maintain chemicals and machine filters in compliance with standards',
                        'Quality control check post dry-cleaning cycle'
                    ]
                },
                {
                    name: 'Packing Staff',
                    description: 'Performs final checks, folding, sorting, and neat packaging of processed garments.',
                    responsibilities: [
                        'Verify orders against customer lists or invoices',
                        'Professionally fold and pack garments to prevent wrinkling',
                        'Affix barcode stickers or tags on final delivery bags',
                        'Keep packaging station clean and stocked with supplies'
                    ]
                },
                {
                    name: 'Laundry Helper',
                    description: 'Assists with washing, sorting, and loading garments into commercial washing machines.',
                    responsibilities: [
                        'Sort garments by color, fabric type, and washing instructions',
                        'Load and unload commercial washing machines and dryers',
                        'Measure detergent, bleach, and other laundry additives',
                        'Assist senior staff with daily operational duties'
                    ]
                },
                {
                    name: 'Warehouse Helper',
                    description: 'Responsible for managing and organizing supply materials in the warehouse, loading/unloading, and picking lists.',
                    responsibilities: [
                        'Organize and stack supply inventory neatly in warehouse bays',
                        'Follow picking lists to prepare shipments for dispatch',
                        'Assist in unloading material shipments and verifying quantities',
                        'Perform periodic stock counting and inventory reporting'
                    ],
                    targetRole: 'Supplier'
                },
                {
                    name: 'Delivery Driver',
                    description: 'Responsible for delivering wholesale orders to vendor locations safely and on time.',
                    responsibilities: [
                        'Load materials safely onto delivery vehicles',
                        'Drive and deliver wholesale orders to local laundry vendors',
                        'Verify delivered items with vendor receipts and return sheets',
                        'Perform daily vehicle maintenance and safety checks'
                    ],
                    targetRole: 'Supplier'
                },
                {
                    name: 'Inventory Coordinator',
                    description: 'Responsible for cataloging supply inventory, tracking stock levels, and coordinate orders.',
                    responsibilities: [
                        'Maintain accurate digital registers of raw supply inventory',
                        'Track stock thresholds and alert procurement team for refills',
                        'Coordinate with suppliers for delivery schedules and invoicing',
                        'Monitor and report material usage trends in the facility'
                    ],
                    targetRole: 'Supplier'
                },
                {
                    name: 'Sales Executive',
                    description: 'Responsible for reaching out to new laundry vendors and promoting wholesale laundry products.',
                    responsibilities: [
                        'Visit local laundry shops to present wholesale catalogs',
                        'Explain benefits of wholesale pricing and bulk discount slabs',
                        'Manage relations with registered vendors and resolve disputes',
                        'Track monthly sales targets and generate vendor accounts'
                    ],
                    targetRole: 'Supplier'
                },
                {
                    name: 'Machine Operator',
                    description: 'Responsible for operating chemical mixers or packaging machinery in the facility.',
                    responsibilities: [
                        'Set up and calibrate packaging or mixing machines',
                        'Load chemicals, detergents, and packages into machinery',
                        'Monitor machinery runs to ensure uniform packaging sizes',
                        'Follow strict safety, hazardous handling, and chemical mixing SOPs'
                    ],
                    targetRole: 'Supplier'
                }
            ];

            for (const tpl of defaultTemplates) {
                await RoleTemplate.findOneAndUpdate(
                    { name: tpl.name },
                    tpl,
                    { upsert: true, new: true }
                );
            }
        } catch (e) {
            console.error('❌ [CRITICAL_SEED] FAILED:', e.message);
        }
    })
    .catch((err) => console.error('❌ MongoDB Connection Error:', err));

app.use('/api/maintenance', verifyAdmin, requireUnrestrictedAdmin, (req, res, next) => ['GET', 'HEAD'].includes(req.method) ? res.status(405).json({ message: 'Maintenance changes require an explicit POST request.' }) : next());

app.post('/api/maintenance/seed-vendor-promos', async (req, res) => {
    try {
        const User = (await import('./src/models/User.js')).default;
        const Promotion = (await import('./src/models/Promotion.js')).default;
        
        // Find both target vendors
        const vendor1 = await User.findOne({ phone: '9988776655' });
        const vendor2 = await User.findById('69e0f69491a1f019d22b2997');

        const vendors = [vendor1, vendor2].filter(v => v);
        if (vendors.length === 0) return res.status(404).json({ error: 'No target vendors found' });

        const now = new Date();
        const nextMonth = new Date(now.setMonth(now.getMonth() + 1));
        
        let totalCreated = 0;
        for (const vendor of vendors) {
            const promos = [
                { title: 'Grand Opening', code: `OPEN50_${vendor._id.toString().slice(-4)}`, discountType: 'Flat', discountValue: 50, minOrderValue: 200, usageLimit: 500, expiryDate: nextMonth, vendorId: vendor._id },
                { title: 'Weekend Clean', code: `WASH20_${vendor._id.toString().slice(-4)}`, discountType: 'Percentage', discountValue: 20, minOrderValue: 500, usageLimit: 200, expiryDate: nextMonth, vendorId: vendor._id },
                { title: 'Premium Care', code: `LUXE10_${vendor._id.toString().slice(-4)}`, discountType: 'Percentage', discountValue: 10, minOrderValue: 1000, usageLimit: 100, expiryDate: nextMonth, vendorId: vendor._id },
                { title: 'Dry Clean Special', code: `DC100_${vendor._id.toString().slice(-4)}`, discountType: 'Flat', discountValue: 100, minOrderValue: 800, usageLimit: 150, expiryDate: nextMonth, vendorId: vendor._id },
                { title: 'Flash Sale', code: `FLASH30_${vendor._id.toString().slice(-4)}`, discountType: 'Percentage', discountValue: 30, minOrderValue: 400, usageLimit: 500, expiryDate: nextMonth, vendorId: vendor._id },
                { title: 'Referral Bonus', code: `REF25_${vendor._id.toString().slice(-4)}`, discountType: 'Percentage', discountValue: 25, minOrderValue: 300, usageLimit: 1000, expiryDate: nextMonth, vendorId: vendor._id },
                { title: 'Loyalty Perk', code: `LOYAL20_${vendor._id.toString().slice(-4)}`, discountType: 'Flat', discountValue: 20, minOrderValue: 0, usageLimit: 5000, expiryDate: nextMonth, vendorId: vendor._id },
                { title: 'Bulk Wash', code: `BULK15_${vendor._id.toString().slice(-4)}`, discountType: 'Percentage', discountValue: 15, minOrderValue: 1200, usageLimit: 300, expiryDate: nextMonth, vendorId: vendor._id },
                { title: 'Night Owl', code: `NIGHT10_${vendor._id.toString().slice(-4)}`, discountType: 'Percentage', discountValue: 10, minOrderValue: 200, usageLimit: 100, expiryDate: nextMonth, vendorId: vendor._id },
                { title: 'Super Saver', code: `SAVE40_${vendor._id.toString().slice(-4)}`, discountType: 'Percentage', discountValue: 40, minOrderValue: 600, usageLimit: 500, expiryDate: nextMonth, vendorId: vendor._id }
            ];

            for (const p of promos) {
                await Promotion.findOneAndUpdate({ code: p.code }, p, { upsert: true });
                totalCreated++;
            }
        }
        
        res.json({ message: `Successfully seeded campaigns for ${vendors.length} vendors. Total items: ${totalCreated}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/maintenance/seed-test-users', async (req, res) => {
    try {
        const User = (await import('./src/models/User.js')).default;
        const testUsers = [
            // Customers
            { phone: '9999999991', role: 'Customer', status: 'approved', displayName: 'Simran Customer 1', address: 'Indore, MP' },
            { phone: '9999999992', role: 'Customer', status: 'approved', displayName: 'Rahul Customer 2', address: 'Bhopal, MP' },
            // Vendors
            { 
                phone: '9999999993', role: 'Vendor', status: 'approved', displayName: 'Sandeep Vendor 1', 
                shopDetails: { name: 'Sandeep Laundry', address: 'Vijay Nagar', pincode: '452010', city: 'Indore', gst: 'GST9933' },
                isProfileComplete: true
            },
            { 
                phone: '9999999994', role: 'Vendor', status: 'approved', displayName: 'Amit Vendor 2', 
                shopDetails: { name: 'Amit Dry Clean', address: 'Saket', pincode: '452001', city: 'Indore', gst: 'GST9944' },
                isProfileComplete: true
            },
            // Suppliers
            { 
                phone: '9999999995', role: 'Supplier', status: 'approved', displayName: 'Vikram Supplier 1', 
                supplierDetails: { businessName: 'Vikram Materials', address: 'Industrial Area', pincode: '452001', city: 'Indore', gst: 'GST9955' },
                isProfileComplete: true
            },
            { 
                phone: '9999999996', role: 'Supplier', status: 'approved', displayName: 'Neha Supplier 2', 
                supplierDetails: { businessName: 'Neha Logistics', address: 'Palasia', pincode: '452010', city: 'Indore', gst: 'GST9966' },
                isProfileComplete: true
            }
        ];

        for (const u of testUsers) {
            await User.findOneAndUpdate({ phone: u.phone }, u, { upsert: true, new: true });
        }

        res.json({ message: '✅ Successfully seeded 6 test users (2 Cust, 2 Vend, 2 Supp).', users: testUsers.map(u => u.phone) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/maintenance/seed-accounts', async (req, res) => {
    try {
        const User = (await import('./src/models/User.js')).default;
        const targetUsers = [
            { phone: '9999999991', role: 'Customer', status: 'approved', displayName: 'Test Customer' },
            { 
                phone: '9999999992', role: 'Vendor', status: 'approved', displayName: 'Test Vendor',
                isProfileComplete: true,
                shopDetails: { name: 'Test Vendor Shop', address: 'Vijay Nagar', city: 'Indore', gst: 'GST9922' }
            },
            { 
                phone: '9999999993', role: 'Supplier', status: 'approved', displayName: 'Test Supplier',
                isProfileComplete: true,
                supplierDetails: { businessName: 'Test Supplier Biz', address: 'Industrial Area', city: 'Indore', gst: 'GST9933' }
            },
            { phone: '9999999994', role: 'Admin', status: 'approved', displayName: 'System Admin' }
        ];

        for (const u of targetUsers) {
            await User.findOneAndUpdate({ phone: u.phone }, u, { upsert: true, new: true });
        }

        res.json({ 
            message: '✅ 4 Accounts registered successfully!', 
            accounts: targetUsers.map(u => `${u.role}: ${u.phone}`) 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/maintenance/seed-materials', async (req, res) => {
    try {
        const Material = (await import('./src/models/Material.js')).default;
        const materials = [
            { name: 'Ultra-Whiteness Detergent', price: 450, category: 'Cleaning', stock: '250 kg', icon: 'shampoo', status: 'active' },
            { name: 'Soft-Touch Fabric Softener', price: 320, category: 'Cleaning', stock: '120 L', icon: 'opacity', status: 'active' },
            { name: 'Eco-Safe Stain Remover', price: 150, category: 'Cleaning', stock: '45 Units', icon: 'pill', status: 'active' },
            { name: 'Premium Wooden Hangers', price: 25, category: 'Packaging', stock: '500 Pcs', icon: 'apparel', status: 'active' },
            { name: 'Bio-Degradable Poly Bags', price: 5, category: 'Packaging', stock: '2000 Units', icon: 'package', status: 'active' },
            { name: 'Microfiber Lint Brushes', price: 85, category: 'Tools', stock: '15 Units', icon: 'brush', status: 'active' },
            { name: 'Industrial Ironing Board Cover', price: 450, category: 'Tools', stock: '5 Units', icon: 'layers', status: 'active' },
            { name: 'Fragrance Boost Beads', price: 550, category: 'Cleaning', stock: '30 kg', icon: 'bubble_chart', status: 'active' },
            { name: 'Leather Conditioner Pro', price: 950, category: 'Specialty', stock: '12 L', icon: 'sanitizer', status: 'active' },
            { name: 'Anti-Static Dryer Sheets', price: 220, category: 'Cleaning', stock: '80 Packs', icon: 'style', status: 'active' },
            { name: 'Safety Pins (Bulk)', price: 45, category: 'Tools', stock: '100 Boxes', icon: 'push_pin', status: 'active' },
            { name: 'Mesh Laundry Bags (Small)', price: 35, category: 'Packaging', stock: '150 Pcs', icon: 'grid_view', status: 'active' }
        ];

        for (const m of materials) {
            await Material.findOneAndUpdate({ name: m.name }, m, { upsert: true });
        }
        res.json({ message: `✅ Successfully seeded ${materials.length} catalog materials.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/maintenance/seed-labor', async (req, res) => {
    try {
        const Specialist = (await import('./src/models/Specialist.js')).default;
        const specialists = [
            { name: 'Master Ironing Expert', rate: '₹750/shift', icon: 'iron', description: 'Expert in high-pressure steam ironing and delicate fabrics.' },
            { name: 'Stain Removal Specialist', rate: '₹850/shift', icon: 'colorize', description: 'Certified in chemical stain identification and removal.' },
            { name: 'Bulk Washing Operator', rate: '₹600/shift', icon: 'local_laundry_service', description: 'Experienced in 50kg+ industrial machine operations.' },
            { name: 'Senior Delivery Captain', rate: '₹550/shift', icon: 'moped', description: 'Skilled navigator with 5+ years in logistics delivery.' },
            { name: 'Shop Operations Manager', rate: '₹1200/shift', icon: 'manage_accounts', description: 'Handles staff, inventory, and end-to-end shop flow.' },
            { name: 'Dry Cleaning Technician', rate: '₹950/shift', icon: 'dry_cleaning', description: 'Expert in solvent-based cleaning and finishing.' },
            { name: 'Quality Control Auditor', rate: '₹800/shift', icon: 'fact_check', description: 'Ensures 100% garment hygiene and spotting standards.' },
            { name: 'Customer Experience Lead', rate: '₹700/shift', icon: 'support_agent', description: 'Handles walk-in clients and complex order support.' }
        ];

        for (const s of specialists) {
            await Specialist.findOneAndUpdate({ name: s.name }, s, { upsert: true });
        }
        res.json({ message: `✅ Successfully seeded ${specialists.length} skilled labor types.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/maintenance/fix-master-categories', async (req, res) => {
    try {
        const MasterService = (await import('./src/models/MasterService.js')).default;
        const Category = (await import('./src/models/Category.js')).default;
        
        // 1. Find or create the "General" category.
        // NOTE: Category uses mainCategory/subCategory — this block previously
        // referenced name/description, which do not exist on the schema, so the
        // endpoint always failed validation and returned 500.
        let generalCat = await Category.findOne({ mainCategory: /General/i });
        if (!generalCat) {
            generalCat = await new Category({
                mainCategory: 'General',
                subCategory: 'General',
                isActive: true
            }).save();
        }

        // 2. Repair services still carrying a legacy string category.
        // The current field is `categoryId`; older documents used `category`.
        const allServices = await MasterService.find({}).lean();
        const invalidServices = allServices.filter(
            s => typeof s.category === 'string' || !s.categoryId
        );

        let fixedCount = 0;
        for (const service of invalidServices) {
            await MasterService.findByIdAndUpdate(service._id, {
                categoryId: generalCat._id,
                $unset: { category: '' }
            });
            fixedCount++;
        }

        res.json({ 
            message: 'Maintenance complete', 
            fixedCount, 
            generalCategoryId: generalCat._id,
            totalServices: allServices.length
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/', (req, res) => {
    res.json({ message: `Ez of Life API is running on PORT ${PORT}...` });
});

// Port
const PORT = process.env.PORT || 5002;
server.listen(PORT, () => {
    const msg = `🚀 SERVER RESTARTED AT ${new Date().toISOString()} ON PORT ${PORT}`;
    console.log(msg);
    console.log(`🌐 Allowed Frontend: ${process.env.FRONTEND_URL || 'All (*)'}`);
    logToFile(msg);
});

// trigger restart 10
