const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 30, bottom: 30, left: 40, right: 40 },
  autoFirstPage: false
});

const outputPath = path.resolve('../EzOfLife_Loondry_Platform_Guide_v2.pdf');
const stream = fs.createWriteStream(outputPath);
doc.pipe(stream);

const SCREENSHOT_DIR = path.resolve('../screenshots');

let currentPageNumber = 0;

// Reusable Header
function addHeader(title, category = 'LOONDRY (EZ OF LIFE) PLATFORM WALKTHROUGH') {
  doc.addPage();
  currentPageNumber++;
  
  // Header banner bar
  doc.rect(40, 25, 515, 22).fill('#0f172a');
  doc.fillColor('#38bdf8').fontSize(8.5).font('Helvetica-Bold').text(category.toUpperCase(), 50, 32, { characterSpacing: 1 });
  
  // Title
  doc.fillColor('#0f172a').fontSize(14).font('Helvetica-Bold').text(title, 40, 54);
  doc.moveTo(40, 74).lineTo(555, 74).strokeColor('#e2e8f0').lineWidth(1).stroke();
  doc.y = 80;
}

// Reusable Footer
function addFooter(pageNo) {
  doc.fillColor('#94a3b8').fontSize(8).font('Helvetica')
     .text(`Loondry (Ez of Life) Confidential • Client Presentation & System Guide • Page ${pageNo}`, 40, 805, { align: 'center', width: 515 });
}

// -------------------------------------------------------------
// PAGE 1: TITLE & COVER PAGE (With Credentials Quick Table)
// -------------------------------------------------------------
doc.addPage();
currentPageNumber++;
doc.rect(0, 0, 595, 842).fill('#0f172a'); // Full dark navy background
doc.rect(0, 0, 595, 10).fill('#0284c7'); // Accent blue top bar

// Main Cover Titles
doc.fillColor('#38bdf8').fontSize(11).font('Helvetica-Bold').text('ENTERPRISE PLATFORM ARCHITECTURE & TESTING GUIDE', 45, 60, { characterSpacing: 2 });
doc.fillColor('#ffffff').fontSize(28).font('Helvetica-Bold').text('Loondry (Ez of Life)', 45, 82);
doc.fillColor('#94a3b8').fontSize(13).font('Helvetica').text('Multi-Persona On-Demand Laundry & Dry Cleaning Logistics Platform', 45, 120);

doc.rect(45, 145, 505, 1.5).fill('#334155');

// Credentials Quick Reference Box
doc.rect(45, 160, 505, 235).fill('#1e293b');
doc.rect(45, 160, 505, 26).fill('#334155');
doc.fillColor('#38bdf8').fontSize(9.5).font('Helvetica-Bold').text('TEST CREDENTIALS & LOGIN URLS (CLIENT DEMO READY)', 55, 168, { characterSpacing: 1 });

const creds = [
  { 
    role: '1. Master Admin Panel', 
    url: 'http://localhost:5173/admin/login', 
    phone: '9999999994', 
    otp: '123456', 
    desc: 'Platform Owner Control: Live KPIs, Geofencing, Pricing, GST Invoices (SZ1/SZ2), Vendor Approvals & Disputes.' 
  },
  { 
    role: '2. Vendor Portal (Laundry Shop)', 
    url: 'http://localhost:5173/vendor/auth', 
    phone: '2222222222 / 8888888881', 
    otp: '123456', 
    desc: 'Shop Partner: Order alerts, Inbound OTP intake, Garment weighing & status updates, Earnings & Payout ledger.' 
  },
  { 
    role: '3. Customer Portal (End User)', 
    url: 'http://localhost:5173/user/auth', 
    phone: '1111111111', 
    otp: '123456', 
    desc: 'Consumer App: Geofence detection (Nashik), Essential/Heritage catalog, Razorpay test payment, Live OTP tracking.' 
  },
  { 
    role: '4. B2B Supplier Portal', 
    url: 'http://localhost:5173/supplier/auth', 
    phone: '3333333333', 
    otp: '123456', 
    desc: 'Material Supplier: Detergents, packaging & chemicals catalog, wholesale vendor orders, B2B Escrow wallet.' 
  }
];

let credY = 195;
creds.forEach((c) => {
  doc.fillColor('#f8fafc').fontSize(9.5).font('Helvetica-Bold').text(c.role, 55, credY);
  doc.fillColor('#38bdf8').fontSize(8.5).font('Helvetica-Bold').text(`Mobile: ${c.phone}   |   Master OTP: ${c.otp}`, 225, credY);
  doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica').text(`URL: ${c.url}`, 55, credY + 13);
  doc.fillColor('#cbd5e1').fontSize(7.5).font('Helvetica-Oblique').text(c.desc, 55, credY + 24, { width: 485 });
  credY += 48;
});

// Key Platform Highlights
doc.rect(45, 410, 505, 375).fill('#1e293b');
doc.rect(45, 410, 505, 26).fill('#334155');
doc.fillColor('#38bdf8').fontSize(9.5).font('Helvetica-Bold').text('KEY SYSTEM ARCHITECTURE & COMPLIANCE HIGHLIGHTS', 55, 418, { characterSpacing: 1 });

const highlights = [
  { 
    t: '1. Strict 4-Step Chain of Custody (Digital Handshake OTP)', 
    d: 'Kabhi bhi kapde chori ya mix nahi ho sakte. Customer Doorstep Pickup OTP, Shop Inbound Intake OTP, Vendor Dispatch OTP aur Final Customer Delivery OTP se order lock hota hai.' 
  },
  { 
    t: '2. Dynamic Geofencing & Automated Smart Vendor Routing', 
    d: 'Customer ka GPS ya Pincode detect karke sirf uske area ke approved polygon geofence (jaise Nashik Serene Meadows) ke andar wale vendor ko order direct broadcast hota hai.' 
  },
  { 
    t: '3. Dual-Invoice GST Engine (SZ1 B2C + SZ2 B2B Compliance)', 
    d: 'Delivered hote hi system do invoices banata hai: SZ1 customer ke liye (SAC 9994 laundry charges) aur SZ2 vendor se platform commission (SAC 9983 + 18% GST). Pincode se state code automatically nikalta hai.' 
  },
  { 
    t: '4. Enterprise Admin Control & Zero-Code Pricing Management', 
    d: 'Admin panel se bina code change kiye naye services add karna, per-kg/per-piece rate change karna, express delivery charges set karna aur geofence polygon draw karna possible hai.' 
  },
  { 
    t: '5. Integrated Test Mode Gateway (Razorpay Card & UPI)', 
    d: 'Safe sandbox testing: Test card 4111 1111 1111 1111 (CVV 123) use karke bina asli paisa kate real-life end-to-end payment flow client ko live demo me dikha sakte hain.' 
  }
];

let hy = 445;
highlights.forEach(h => {
  doc.fillColor('#38bdf8').fontSize(9).font('Helvetica-Bold').text(h.t, 55, hy);
  doc.fillColor('#cbd5e1').fontSize(8).font('Helvetica').text(h.d, 55, hy + 13, { width: 485, lineGap: 1.5 });
  hy += 62;
});

addFooter(currentPageNumber);

// -------------------------------------------------------------
// PAGE 2: DETAILED OVERALL FLOW (HINGLISH GUIDE - PART 1)
// -------------------------------------------------------------
addHeader('Overall System Flow & Order Journey (Hinglish Guide - Part 1)', 'SYSTEM ARCHITECTURE & ORDER WORKFLOW');

// Flow explanation box
doc.rect(40, 80, 515, 60).fill('#f8fafc').strokeColor('#cbd5e1').stroke();
doc.fillColor('#0284c7').fontSize(9.5).font('Helvetica-Bold').text('YE SYSTEM KAISE KAAM KARTA HAI (HIGH LEVEL SUMMARY):', 50, 88);
doc.fillColor('#334155').fontSize(8.5).font('Helvetica').text(
  'Loondry ek multi-tier hyperlocal platform hai. Isme 4 main log jude hote hain: Customer (jo kapde dhulwata hai), Vendor (laundry shop partner), Rider (pickup & drop logistics), aur Admin (jo pura system monitor karta hai). Niche step-by-step bataya gaya hai ki order booking se lekar vendor intake tak kya hota hai.',
  50, 103, { width: 495, lineGap: 2 }
);

const flowPart1 = [
  {
    step: 'STEP 1: Customer Login & Location Detection',
    hinglish: 'Customer apna 10-digit number dal kar login karta hai (OTP 123456). System customer ka address/pincode (jaise Samrat Tropicano, Nashik 422013) scan karta hai aur check karta hai ki kya ye area company ke approved Geofence polygon me aata hai.',
    badge: 'Customer Portal (/user/home)'
  },
  {
    step: 'STEP 2: Service Selection & Cart Breakdown',
    hinglish: 'Customer apne kapde select karta hai (e.g. Cotton Saree ₹200, Shirt ₹50). Delivery speed choose karta hai: Standard ya Express (1.5x fast delivery). Cart page par Base Rate + Express Surcharge + Logistics Fee + GST (SAC 9994) clear calculate hoti hai.',
    badge: 'Cart & Pricing (/user/cart)'
  },
  {
    step: 'STEP 3: Secure Razorpay Payment Lock',
    hinglish: 'Customer "Pay Now" par click karta hai. Razorpay test popup open hota hai. Card number 4111 1111 1111 1111 dalne par payment capture ho jata hai. Backend Razorpay signature verify karta hai taki koi fraud na ho, aur order status "PLACED" ban jata hai.',
    badge: 'Payment Gateway'
  },
  {
    step: 'STEP 4: Real-Time Geofence Broadcast to Vendor',
    hinglish: 'Order place hote hi system Nashik geofence ke active vendors ko search karta hai jinke paas wo service enabled hai (jaise Ujjawal Vendors - 2222222222). Vendor ke dashboard par "New Request" tab me order sound ke sath dikhta hai.',
    badge: 'Smart Geofence Engine'
  },
  {
    step: 'STEP 5: Pickup Rider Assignment & Collection Handshake',
    hinglish: 'Vendor ya System pickup rider assign karta hai. Rider customer ke ghar pahunchta hai. Yahan Customer rider ko 4-digit Collection OTP deta hai. Rider jab OTP verify karta hai tabhi order status "IN_TRANSIT" hota hai. Isse kabhi galat kapde pick nahi hote.',
    badge: 'Handshake 1: Pickup OTP'
  },
  {
    step: 'STEP 6: Shop Intake Handshake (Kapde Vendor ke paas)',
    hinglish: 'Rider kapde lekar laundry shop par pahunchta hai. Vendor apne dashboard par rider se 4-digit Inbound OTP confirm karta hai. Ab order ka custody officially Vendor ke paas transfer ho jata hai aur status "RECEIVED_BY_VENDOR" ho jata hai.',
    badge: 'Handshake 2: Inbound OTP'
  }
];

let fp1Y = 150;
flowPart1.forEach(f => {
  doc.rect(40, fp1Y, 515, 68).fill('#ffffff').strokeColor('#e2e8f0').stroke();
  doc.rect(40, fp1Y, 5, 68).fill('#0284c7');
  
  doc.fillColor('#0f172a').fontSize(9.5).font('Helvetica-Bold').text(f.step, 55, fp1Y + 8);
  doc.rect(385, fp1Y + 6, 160, 16).fill('#f1f5f9').strokeColor('#cbd5e1').stroke();
  doc.fillColor('#0369a1').fontSize(7).font('Helvetica-Bold').text(f.badge, 390, fp1Y + 11, { width: 150, align: 'center' });
  
  doc.fillColor('#475569').fontSize(8.2).font('Helvetica').text(f.hinglish, 55, fp1Y + 26, { width: 490, lineGap: 1.5 });
  fp1Y += 75;
});

// Meeting tip box
doc.rect(40, 610, 515, 75).fill('#eff6ff').strokeColor('#93c5fd').stroke();
doc.fillColor('#1e40af').fontSize(8.5).font('Helvetica-Bold').text('CLIENT MEETING ME YE POINT KAISE SAMJHAYEIN:', 50, 618);
doc.fillColor('#1e3a8a').fontSize(8).font('Helvetica').text(
  'Client ko batayein: "Sir, hamare platform me safety sabse pehle hai. Customer se lekar shop tak kapde pahunchne me do OTP lagte hain - ek customer ke darwaze par aur ek laundry shop par. Iska sabse bada fayda ye hai ki kapda khone ya rider ke hatho misplaced hone ka 1% bhi chance nahi rehta. Har cheez system me GPS aur time ke sath record hoti hai."',
  50, 632, { width: 495, lineGap: 2 }
);

addFooter(currentPageNumber);

// -------------------------------------------------------------
// PAGE 3: DETAILED OVERALL FLOW (HINGLISH GUIDE - PART 2)
// -------------------------------------------------------------
addHeader('Overall System Flow & Handshake Protocol (Hinglish Guide - Part 2)', 'SYSTEM ARCHITECTURE & ORDER WORKFLOW');

// Flow explanation box
doc.rect(40, 80, 515, 55).fill('#f8fafc').strokeColor('#cbd5e1').stroke();
doc.fillColor('#0284c7').fontSize(9.5).font('Helvetica-Bold').text('GARMENT PROCESSING SE LEKAR DUAL GST INVOICE TAK:', 50, 88);
doc.fillColor('#334155').fontSize(8.5).font('Helvetica').text(
  'Is second phase me vendor kapdo ko process karta hai, wazan lock karta hai, return delivery rider ko hand over karta hai, customer ko final delivery milti hai, aur government GST compliant tax invoices generate hoti hain.',
  50, 103, { width: 495, lineGap: 2 }
);

const flowPart2 = [
  {
    step: 'STEP 7: Weighed Weight Recording & Washing Process',
    hinglish: 'Vendor kapdo ka weight machine par wazan karta hai (e.g. 2.5 kg). Dashboard me weight update karke submit karta hai. Iske baad washing, dry cleaning ya steam ironing complete hone par "Ready for Delivery" mark karta hai. Status "READY_FOR_DISPATCH" ban jata hai.',
    badge: 'Weight Lock & Washing'
  },
  {
    step: 'STEP 8: Return Dispatch Handshake (Shop se Rider)',
    hinglish: 'Kapde pack hone ke baad return rider shop par aata hai. Vendor apne dashboard par rider ka 4-digit Dispatch/Reverse OTP confirm karta hai. Ab kapde return rider ke bag me load ho jate hain aur status "OUT_FOR_DELIVERY" ho jata hai.',
    badge: 'Handshake 3: Dispatch OTP'
  },
  {
    step: 'STEP 9: Final Doorstep Delivery Handshake',
    hinglish: 'Rider customer ke doorstep par pahunchta hai. Customer kapde check karke rider ko Completion OTP deta hai. Rider OTP verify karta hai aur order permanently "DELIVERED" mark ho jata hai. Customer aur Vendor dono ko instant confirmation message milta hai.',
    badge: 'Handshake 4: Completion OTP'
  },
  {
    step: 'STEP 10: Automated Dual GST Invoice Generation (SZ1 & SZ2)',
    hinglish: 'Order Delivered hote hi platform do separate legal GST Invoices generate karta hai:\n1. Invoice 1 (SZ1 - B2C Customer Invoice): Customer ke liye, laundry charges + GST (SAC Code 9994).\n2. Invoice 2 (SZ2 - B2B Commission Invoice): Vendor se platform commission deduction (SAC Code 9983 + 18% GST). Pincode se State Code (27 Maharashtra) automatically assign hota hai.',
    badge: 'Dual GST Invoicing'
  },
  {
    step: 'STEP 11: Vendor Payout Settlement & B2B Raw Materials',
    hinglish: 'Order delivery ke baad platform fee deduct karke remaining paisa Vendor ke wallet/settlement ledger me credit ho jata hai. Agar vendor ko detergent ya packaging bags chahiye, to wo Supplier Portal se direct wholesale order kar sakta hai.',
    badge: 'Payouts & B2B Supplies'
  }
];

let fp2Y = 145;
flowPart2.forEach(f => {
  doc.rect(40, fp2Y, 515, 78).fill('#ffffff').strokeColor('#e2e8f0').stroke();
  doc.rect(40, fp2Y, 5, 78).fill('#10b981');
  
  doc.fillColor('#0f172a').fontSize(9.5).font('Helvetica-Bold').text(f.step, 55, fp2Y + 8);
  doc.rect(385, fp2Y + 6, 160, 16).fill('#f1f5f9').strokeColor('#cbd5e1').stroke();
  doc.fillColor('#047857').fontSize(7).font('Helvetica-Bold').text(f.badge, 390, fp2Y + 11, { width: 150, align: 'center' });
  
  doc.fillColor('#475569').fontSize(8.2).font('Helvetica').text(f.hinglish, 55, fp2Y + 26, { width: 490, lineGap: 1.5 });
  fp2Y += 85;
});

// Demo guide box
doc.rect(40, 600, 515, 80).fill('#f0fdf4').strokeColor('#86efac').stroke();
doc.fillColor('#166534').fontSize(8.5).font('Helvetica-Bold').text('CLIENT DEMO ME DUAL INVOICE KO KAISE SHOWCASE KAREIN:', 50, 608);
doc.fillColor('#14532d').fontSize(8).font('Helvetica').text(
  'Client ko samjhayein: "Sir, Indian tax laws ke mutabiq aggregator platform par 2 invoices banni mandatory hain. Pehli invoice customer ko milti hai jisme laundry service ka GST hota hai. Doosri invoice hamari company vendor ko deti hai jisme hamara platform commission aur 18% GST hota hai. Hamara software ye dono invoices delivery ke 1 second ke andar bina manual calculation ke generate kar deta hai."',
  50, 622, { width: 495, lineGap: 2 }
);

addFooter(currentPageNumber);

// -------------------------------------------------------------
// HELPER FOR MOBILE PAGES (2 Screens per page with Hinglish explanation)
// -------------------------------------------------------------
function renderMobilePagePair(title, sub, item1, item2) {
  addHeader(title, sub);

  // Item 1 (Top Screen)
  doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text(item1.title, 40, 80);
  doc.rect(385, 78, 170, 15).fill('#f1f5f9').strokeColor('#cbd5e1').stroke();
  doc.fillColor('#0284c7').fontSize(7.5).font('Helvetica-Bold').text(item1.route, 390, 82, { width: 160, align: 'center' });

  // Hinglish Box
  doc.rect(40, 98, 330, 48).fill('#f8fafc').strokeColor('#e2e8f0').stroke();
  doc.fillColor('#0369a1').fontSize(7.5).font('Helvetica-Bold').text('YE SCREEN KYA KARTI HAI (HINGLISH):', 45, 103);
  doc.fillColor('#334155').fontSize(7.5).font('Helvetica').text(item1.hinglish, 45, 115, { width: 320, lineGap: 1.5 });

  // Bullets
  let by = 153;
  if (item1.bullets) {
    item1.bullets.forEach(b => {
      doc.fillColor('#0284c7').fontSize(7.5).font('Helvetica-Bold').text('•', 45, by);
      doc.fillColor('#475569').fontSize(7.5).font('Helvetica').text(b, 55, by, { width: 315 });
      by += 15;
    });
  }

  // Pitch tip
  doc.rect(40, 218, 330, 40).fill('#eff6ff').strokeColor('#bfdbfe').stroke();
  doc.fillColor('#1e40af').fontSize(7).font('Helvetica-Bold').text('CLIENT PITCH TIP:', 45, 222);
  doc.fillColor('#1e3a8a').fontSize(7).font('Helvetica').text(item1.pitch, 45, 232, { width: 320 });

  // Image 1
  const img1Path = path.join(SCREENSHOT_DIR, item1.img);
  if (fs.existsSync(img1Path)) {
    doc.rect(385, 98, 170, 160).fill('#f8fafc').strokeColor('#cbd5e1').stroke();
    doc.image(img1Path, 387, 100, { width: 166, height: 156, fit: [166, 156], align: 'center' });
  }

  // Divider line
  doc.moveTo(40, 270).lineTo(555, 270).strokeColor('#e2e8f0').lineWidth(1).stroke();

  // Item 2 (Bottom Screen)
  doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text(item2.title, 40, 280);
  doc.rect(385, 278, 170, 15).fill('#f1f5f9').strokeColor('#cbd5e1').stroke();
  doc.fillColor('#0284c7').fontSize(7.5).font('Helvetica-Bold').text(item2.route, 390, 282, { width: 160, align: 'center' });

  // Hinglish Box
  doc.rect(40, 298, 330, 48).fill('#f8fafc').strokeColor('#e2e8f0').stroke();
  doc.fillColor('#0369a1').fontSize(7.5).font('Helvetica-Bold').text('YE SCREEN KYA KARTI HAI (HINGLISH):', 45, 303);
  doc.fillColor('#334155').fontSize(7.5).font('Helvetica').text(item2.hinglish, 45, 315, { width: 320, lineGap: 1.5 });

  // Bullets
  let by2 = 353;
  if (item2.bullets) {
    item2.bullets.forEach(b => {
      doc.fillColor('#0284c7').fontSize(7.5).font('Helvetica-Bold').text('•', 45, by2);
      doc.fillColor('#475569').fontSize(7.5).font('Helvetica').text(b, 55, by2, { width: 315 });
      by2 += 15;
    });
  }

  // Pitch tip
  doc.rect(40, 418, 330, 40).fill('#eff6ff').strokeColor('#bfdbfe').stroke();
  doc.fillColor('#1e40af').fontSize(7).font('Helvetica-Bold').text('CLIENT PITCH TIP:', 45, 422);
  doc.fillColor('#1e3a8a').fontSize(7).font('Helvetica').text(item2.pitch, 45, 432, { width: 320 });

  // Image 2
  const img2Path = path.join(SCREENSHOT_DIR, item2.img);
  if (fs.existsSync(img2Path)) {
    doc.rect(385, 298, 170, 160).fill('#f8fafc').strokeColor('#cbd5e1').stroke();
    doc.image(img2Path, 387, 300, { width: 166, height: 156, fit: [166, 156], align: 'center' });
  }

  addFooter(currentPageNumber);
}

// -------------------------------------------------------------
// HELPER FOR DESKTOP ADMIN PAGES (1 Full Screen per page with Hinglish explanation)
// -------------------------------------------------------------
function renderDesktopAdmin(title, sub, item) {
  addHeader(title, sub);

  // Title & Route Badge
  doc.fillColor('#0f172a').fontSize(12).font('Helvetica-Bold').text(item.title, 40, 80);
  doc.rect(380, 77, 175, 17).fill('#f1f5f9').strokeColor('#cbd5e1').stroke();
  doc.fillColor('#0284c7').fontSize(8).font('Helvetica-Bold').text(item.route, 385, 82, { width: 165, align: 'center' });

  // Hinglish Explanation Box
  doc.rect(40, 100, 515, 52).fill('#f8fafc').strokeColor('#e2e8f0').stroke();
  doc.fillColor('#0369a1').fontSize(8).font('Helvetica-Bold').text('YE SCREEN KYA KARTI HAI (HINGLISH EXPLANATION):', 50, 106);
  doc.fillColor('#334155').fontSize(8).font('Helvetica').text(item.hinglish, 50, 118, { width: 495, lineGap: 1.5 });

  // Key Features
  let fy = 158;
  doc.fillColor('#0f172a').fontSize(8.5).font('Helvetica-Bold').text('Key Features & Operational Control:', 40, fy);
  fy += 12;
  if (item.features) {
    item.features.forEach(f => {
      doc.fillColor('#0284c7').fontSize(7.5).font('Helvetica-Bold').text('•', 45, fy);
      doc.fillColor('#475569').fontSize(7.5).font('Helvetica').text(f, 55, fy, { width: 495 });
      fy += 12;
    });
  }

  // Screenshot image
  const imgY = fy + 5;
  const imgHeight = 280;
  const imgPath = path.join(SCREENSHOT_DIR, item.img);
  if (fs.existsSync(imgPath)) {
    doc.rect(40, imgY, 515, imgHeight).fill('#0f172a').strokeColor('#cbd5e1').stroke();
    doc.image(imgPath, 42, imgY + 2, { width: 511, height: imgHeight - 4, fit: [511, imgHeight - 4], align: 'center', valign: 'center' });
  }

  // Client Pitch Box
  const pitchY = imgY + imgHeight + 8;
  doc.rect(40, pitchY, 515, 45).fill('#ecfdf5').strokeColor('#a7f3d0').stroke();
  doc.fillColor('#065f46').fontSize(8).font('Helvetica-Bold').text('CLIENT MEETING ME KYA BOLNA HAI (PITCH SCRIPT):', 50, pitchY + 6);
  doc.fillColor('#047857').fontSize(7.5).font('Helvetica').text(item.pitch, 50, pitchY + 17, { width: 495, lineGap: 1.5 });

  addFooter(currentPageNumber);
}

// -------------------------------------------------------------
// SECTION 1: CUSTOMER APP SCREENS
// -------------------------------------------------------------
renderMobilePagePair(
  'Customer Authentication & OTP Flow',
  'PERSONA 1: CUSTOMER (USER) PORTAL',
  {
    title: 'Screen 01: Customer Login Screen',
    route: 'Route: /user/auth',
    hinglish: 'Customer yahan apna 10-digit mobile number enter karta hai. System Indian mobile number regex validate karta hai aur privacy agreement check karta hai.',
    bullets: [
      'Test Customer Number: 1111111111 (Seeded Nashik customer).',
      'One-tap Terms & Privacy condition check.',
      'Auto-focus input field with clear clean UI.',
      'Next button dabate hi OTP screen par redirect hota hai.'
    ],
    pitch: 'Client ko batayein: "Customer ko koi lamba registration form nahi bharna padta, sirf mobile number se instant login ho jata hai."',
    img: '01_customer_auth.png'
  },
  {
    title: 'Screen 02: Customer OTP Verification',
    route: 'Route: /user/otp',
    hinglish: 'Customer ke mobile par aane wala 6-digit verification code yahan enter hota hai. Dev mode me master OTP 123456 set hai.',
    bullets: [
      'Master Bypass OTP: 123456 (testing ke liye).',
      'Auto-cursor shift: Ek digit likhte hi agle box par automatic cursor jata hai.',
      'Resend OTP timer aur security rate limiting enabled.',
      'Verify button dabate hi direct Home Catalog open hota hai.'
    ],
    pitch: 'Client ko batayein: "OTP flow fast aur secure hai, testing me 123456 use karke instant customer account login ho jata hai."',
    img: '02_customer_otp.png'
  }
);

renderMobilePagePair(
  'Customer Home Catalog & Shopping Cart Flow',
  'PERSONA 1: CUSTOMER (USER) PORTAL',
  {
    title: 'Screen 03: Customer Home Catalog',
    route: 'Route: /user/home',
    hinglish: 'Customer yahan services browse karta hai (Dry Clean, Laundry, Ironing) aur Essential vs Heritage tier select karta hai. Top me "30% Off" banner dikhta hai.',
    bullets: [
      'Location Bar: Auto-detects customer geofence (Nashik: Samrat Tropicano).',
      'Category Filter: All Services, Dry Cleaning, Laundry, Steam Iron.',
      'Tier Tabs: Essential (Daily wear) vs Heritage (Premium / Wedding wear).',
      'Inline +/- buttons se garments cart me add hote hain.'
    ],
    pitch: 'Client ko batayein: "Customer ka location Nashik geofence me hone ki wajah se sirf wahi services dikhti hain jo local vendor deliver kar sakta hai."',
    img: '03_customer_home.png'
  },
  {
    title: 'Screen 04: Cart & Razorpay Checkout',
    route: 'Route: /user/cart',
    hinglish: 'Cart page par price breakdown (Base rate + Delivery + Express charge + GST) dikhta hai. Customer Razorpay se payment lock karta hai.',
    bullets: [
      'Express Delivery Mode: 1.5x fast turnaround toggle.',
      'SAC Code 9994 compliance enforce hoti hai.',
      'Razorpay Test Mode: Card 4111 1111 1111 1111 se free test checkout.',
      'Order create hote hi status PLACED banta hai aur vendor ko alert jata hai.'
    ],
    pitch: 'Client ko batayein: "Cart me transparent pricing hai - customer ko delivery charge, GST aur discount sab alag-alag dikhta hai, koi hidden fees nahi hai."',
    img: '04_customer_cart.png'
  }
);

renderMobilePagePair(
  'Customer Order Tracking & Profile Settings',
  'PERSONA 1: CUSTOMER (USER) PORTAL',
  {
    title: 'Screen 05: Customer Orders & Handshakes',
    route: 'Route: /user/orders',
    hinglish: 'Active aur past orders ki list yahan dikhti hai. Order par click karke customer live rider tracking aur pickup/delivery OTP dekh sakta hai.',
    bullets: [
      'Order Status Timeline: Placed -> Rider Assigned -> In Transit -> Delivered.',
      'Collection OTP Display: Rider ko handover ke waqt dikhane ke liye OTP.',
      'Track Button: Rider ka live route dekhne ke liye.',
      'Invoice Download: Delivered hote hi PDF tax invoice download ka button.'
    ],
    pitch: 'Client ko batayein: "Customer ko har second pata rehta hai ki uska kapda kahan hai - rider ke paas hai, dhul raha hai ya delivery par nikla hai."',
    img: '05_customer_orders.png'
  },
  {
    title: 'Screen 06: Customer Profile & Addresses',
    route: 'Route: /user/profile',
    hinglish: 'Customer apni personal details, saved delivery addresses (Home, Office), payment methods aur notification preferences manage karta hai.',
    bullets: [
      'Saved Addresses: Multiple locations with flat/society and pincode.',
      'Geofence Match: Pincode 422013 automatically maps to Nashik cluster.',
      'Help & Support: Direct dispute ticket create karne ka option.',
      'One-tap Logout aur Session Security.'
    ],
    pitch: 'Client ko batayein: "Customer ek baar address save kar le toh baar-baar address daalne ki zaroorat nahi padti, repeat order 1 click me hota hai."',
    img: '06_customer_profile.png'
  }
);

// -------------------------------------------------------------
// SECTION 2: VENDOR PORTAL SCREENS
// -------------------------------------------------------------
renderMobilePagePair(
  'Vendor Authentication & OTP Login',
  'PERSONA 2: VENDOR (LAUNDRY SHOP PARTNER) PORTAL',
  {
    title: 'Screen 07: Vendor Partner Login',
    route: 'Route: /vendor/auth',
    hinglish: 'Laundry shop owner ya vendor partner apna registered mobile number enter karta hai. Ye portal shops ke liye dedicated hai.',
    bullets: [
      'Test Vendor Number: 2222222222 (Ujjawal Vendors Nashik).',
      'Alternate Vendor Number: 8888888881 (Newly added Cotton Saree vendor).',
      'B2B partner terms & commission structure acceptance.',
      'Submit karte hi OTP verification screen par le jata hai.'
    ],
    pitch: 'Client ko batayein: "Vendors ke liye mobile-first app banayi gayi hai taki shop owner counter par khade-khade mobile se orders manage kar sake."',
    img: '07_vendor_auth.png'
  },
  {
    title: 'Screen 08: Vendor OTP Verification',
    route: 'Route: /vendor/otp',
    hinglish: 'Vendor shop security ke liye 6-digit OTP verify karta hai. Test environment me master code 123456 configured hai.',
    bullets: [
      'Master OTP: 123456 (instant testing access).',
      'Vendor Role Authorization check backend se verify hota hai.',
      'Shop geofence status active hone par hi dashboard load hota hai.',
      'Successful verification ke baad Vendor Dashboard par redirect.'
    ],
    pitch: 'Client ko batayein: "Vendor authentication secure hai, unauthorized person shop ke confidential orders access nahi kar sakta."',
    img: '08_vendor_otp.png'
  }
);

renderMobilePagePair(
  'Vendor Live Dashboard & Service Management',
  'PERSONA 2: VENDOR (LAUNDRY SHOP PARTNER) PORTAL',
  {
    title: 'Screen 09: Vendor Live Dashboard',
    route: 'Route: /vendor/dashboard',
    hinglish: 'Vendor ka control center: New Requests (alert ke sath), In Progress orders, Completed orders, aur Today Business revenue summary yahan aati hai.',
    bullets: [
      'Available Tab: Nearby geofence se aane wale naye orders yahan dikhte hain.',
      'Accept / Reject: Vendor order dekhkar 1-click me accept kar sakta hai.',
      'Inbound OTP Handshake: Rider se kapde receive karte waqt OTP verify karna.',
      'Today Revenue & Active Pickups count cards.'
    ],
    pitch: 'Client ko batayein: "Naya order aate hi vendor ko dashboard par live notification milta hai. Vendor click karke turant order accept kar sakta hai."',
    img: '09_vendor_dashboard.png'
  },
  {
    title: 'Screen 10: Vendor My Services Catalog',
    route: 'Route: /vendor/my-services',
    hinglish: 'Vendor select karta hai ki uski shop par kaun-kaun si services active hain (e.g. Cotton Saree, Men Shirt, Dry Clean, Steam Press) aur unka pricing.',
    bullets: [
      'Active Toggle: Jo service shop par available hai usko ON/OFF karna.',
      'Service Categories: Household, Summer wear, Winter wear.',
      'Cotton Saree Service: Enable karke Nashik customer ke liye active ki gayi.',
      'Price Per Unit: Master admin rate ya custom store rate display.'
    ],
    pitch: 'Client ko batayein: "Agar vendor ki washing machine kharab ho ya staff kam ho, toh wo kisi bhi service ko 1 click me temporarily band kar sakta hai."',
    img: '10_vendor_services.png'
  }
);

renderMobilePagePair(
  'Vendor Earnings & Profile Management',
  'PERSONA 2: VENDOR (LAUNDRY SHOP PARTNER) PORTAL',
  {
    title: 'Screen 11: Vendor Earnings & Settlement',
    route: 'Route: /vendor/earnings',
    hinglish: 'Vendor ki daily/monthly income, platform commission deduction, pending payouts aur settled bank transfers ka ledger yahan dikhta hai.',
    bullets: [
      'Total Revenue vs Net Payouts (after platform fee deduction).',
      'Completed Order Ledger: Har order ka split (Service fee - Platform charge).',
      'Weekly Settlement Cycle status tracking.',
      'B2B Tax Invoice (SZ2) download access for accounting.'
    ],
    pitch: 'Client ko batayein: "Vendor ko clear hisab-kitab milta hai ki kitna paisa bana, kitna commission kata aur kab bank account me transfer hoga."',
    img: '11_vendor_earnings.png'
  },
  {
    title: 'Screen 12: Vendor Shop Profile & Banking',
    route: 'Route: /vendor/profile',
    hinglish: 'Shop owner ki profile, Shop address, GSTIN number, Bank Account details (payouts ke liye) aur business working hours yahan manage hote hain.',
    bullets: [
      'Shop Name & Contact: Ujjawal Vendors Nashik.',
      'Bank Account / UPI ID for automated weekly disbursements.',
      'GSTIN / PAN Card records for legal compliance.',
      'Operating Hours & Holiday calendar setting.'
    ],
    pitch: 'Client ko batayein: "Vendor ki profile me verified GSTIN aur bank account link rehta hai, jisse payouts bina kisi manual delay ke seedhe bank me jaate hain."',
    img: '12_vendor_profile.png'
  }
);

// -------------------------------------------------------------
// SECTION 3: B2B SUPPLIER PORTAL SCREENS
// -------------------------------------------------------------
renderMobilePagePair(
  'B2B Supplier Authentication & Dashboard',
  'PERSONA 3: B2B SUPPLIER (MATERIALS & CHEMICALS) PORTAL',
  {
    title: 'Screen 13: Supplier Login Screen',
    route: 'Route: /supplier/auth',
    hinglish: 'B2B Raw Material aur Chemical Supplier ke liye dedicated login. Yahan se detergent, packaging bags aur hangers provide karne wale suppliers login karte hain.',
    bullets: [
      'Test Supplier Number: 3333333333 (Ujjawal Supplier).',
      'B2B wholesale portal gateway.',
      'Indian telecom regex validation.',
      'One-tap redirect to OTP verification.'
    ],
    pitch: 'Client ko batayein: "Ye platform sirf consumer laundry nahi, balki vendors ke liye B2B wholesale supply chain bhi manage karta hai."',
    img: '13_supplier_auth.png'
  },
  {
    title: 'Screen 14: Supplier Dashboard & Analytics',
    route: 'Route: /supplier/dashboard',
    hinglish: 'Supplier dashboard par vendor orders, pending dispatches, inventory stock status aur daily revenue analytics dashboard visible hota hai.',
    bullets: [
      'Wholesale Orders Count from laundry shops.',
      'Pending vs Dispatched Chemical & Material orders.',
      'Escrow Protected Payments: Vendor ka paisa safe escrow me hold rehta hai.',
      'Quick action to add new supplies to catalog.'
    ],
    pitch: 'Client ko batayein: "Laundry vendors ko detergent ya packaging ke liye market me bhatakna nahi padta, app ke andar se hi wholesale supply order kar sakte hain."',
    img: '15_supplier_dashboard.png'
  }
);

renderMobilePagePair(
  'Supplier Supplies Catalog & Wallet Settlement',
  'PERSONA 3: B2B SUPPLIER (MATERIALS & CHEMICALS) PORTAL',
  {
    title: 'Screen 16: Supplier Raw Materials Catalog',
    route: 'Route: /supplier/my-supplies',
    hinglish: 'Supplier yahan apne products list karta hai jaise Industrial Detergent (50kg), Eco Laundry Bags, Garment Hangers, Fabric Conditioner aur unki bulk pricing.',
    bullets: [
      'Product Listing with wholesale bulk MOQ (Minimum Order Quantity).',
      'Inventory Stock counter & out-of-stock toggle.',
      'Category filter: Chemicals, Packaging, Machinery Spare parts.',
      'Wholesale price per unit and volume discount slabs.'
    ],
    pitch: 'Client ko batayein: "Suppliers apne products par volume discounts de sakte hain, jisse badhe vendors ko bulk rate par material milta hai."',
    img: '16_supplier_supplies.png'
  },
  {
    title: 'Screen 17: Supplier Escrow Wallet',
    route: 'Route: /supplier/wallet',
    hinglish: 'Supplier ka wholesale ledger: Escrow me hold balance, delivered orders ka released payout, aur company settlement status dikhta hai.',
    bullets: [
      'Escrow Security: Vendor se advance lekar tab release hota hai jab supply deliver ho.',
      'Settled Payouts history with bank UTR transaction IDs.',
      'Dispute protection against damaged material delivery.',
      'One-click payout withdrawal request.'
    ],
    pitch: 'Client ko batayein: "Escrow wallet se supplier aur vendor dono fraud se safe rehte hain - material milne par hi supplier ko payment release hoti hai."',
    img: '17_supplier_wallet.png'
  }
);

// -------------------------------------------------------------
// SECTION 4: MASTER ADMIN PANEL SCREENS (12 Dedicated Full Pages)
// -------------------------------------------------------------

// Admin Screen 18: Login
renderDesktopAdmin(
  'Admin Authentication & Master Access Control',
  'PERSONA 4: MASTER ADMIN PANEL',
  {
    title: 'Screen 18: Admin Secure Portal Login',
    route: 'Route: /admin/login  |  /admin/otp',
    hinglish: 'Platform owner aur administrative staff ke liye enterprise login gate. Role-based access control enforce karta hai taki sub-admins ko sirf assigned modules dikhein.',
    features: [
      'Master Admin Mobile: 9999999994 (Root Access) | Dev OTP: 123456.',
      'JWT Token Authentication with base64 decoded payload role validation (AdminGuard).',
      'Session Security: Admin session automatically client portal ke user token se isolate rehti hai.',
      'Brute-force protection aur rate limiting enabled on admin authentication endpoints.'
    ],
    pitch: 'Client ko batayein: "Admin portal military-grade role-based security par bana hai. Sub-admin ko agar sirf Orders dekhne ka access dena hai toh wo baaki financial data ya pricing nahi dekh sakta."',
    img: '18_admin_login.png'
  }
);

// Admin Screen 19: Dashboard
renderDesktopAdmin(
  'Admin Master Executive Dashboard & Real-Time KPIs',
  'PERSONA 4: MASTER ADMIN PANEL',
  {
    title: 'Screen 19: Executive Analytics & Platform Overview',
    route: 'Route: /admin/dashboard',
    hinglish: 'Company leadership ke liye high-level bird-eye view. Daily GMV, Active orders count, Verified vendors, Customer growth aur City-wise performance real time me dikhti hai.',
    features: [
      'Live Revenue Metrics: Daily Booked Business, Net Commission, Pending Settlements.',
      'Order Volume Graph: Hourly order placement vs Delivered status comparison.',
      'Active Geofence Clusters: Nashik, Pune, Mumbai operations health indicators.',
      'Quick Alert Badges: Unassigned orders, pending vendor verification requests.'
    ],
    pitch: 'Client ko batayein: "Company CEO ya operations head ek nazar me dashboard dekh kar samajh sakta hai ki aaj kitne rupaye ka dhandha hua aur kitne orders live chal rahe hain."',
    img: '19_admin_dashboard.png'
  }
);

// Admin Screen 20: Orders Management
renderDesktopAdmin(
  'Admin Orders Monitoring, Handshakes & Live Tracking',
  'PERSONA 4: MASTER ADMIN PANEL',
  {
    title: 'Screen 20: Centralized Orders Control Room',
    route: 'Route: /admin/orders',
    hinglish: 'Platform ke tamam orders ka master database. Har order ka real-time status (PLACED, IN_TRANSIT, READY, DELIVERED), assigned rider, pickup OTP aur customer details yahan dikhti hain.',
    features: [
      'Status Filtering: Placed, Rider Assigned, Vendor Processing, Out for Delivery, Delivered, Cancelled.',
      'Handshake Auditing: Pickup OTP, Inbound OTP, Dispatch OTP aur Completion OTP logs.',
      'Manual Override: Emergency me order status ya rider assignment force-update karne ki power.',
      'Live Order Search by Order ID (e.g. #ON-100022), Customer Name ya Phone Number.'
    ],
    pitch: 'Client ko batayein: "Agar customer call center me phone kare ki mera order kahan hai, to admin 2 second me order number daal kar pura status aur rider location bata sakta hai."',
    img: '20_admin_orders.png'
  }
);

// Admin Screen 21: Vendors Management
renderDesktopAdmin(
  'Admin Vendor Partners Directory & Onboarding Approvals',
  'PERSONA 4: MASTER ADMIN PANEL',
  {
    title: 'Screen 21: Vendor Directory & Compliance Approvals',
    route: 'Route: /admin/vendors',
    hinglish: 'City ke saare laundry shop partners ki list. Admin naye vendors ke documents (Aadhaar, GSTIN, Shop Act) verify karta hai, shop active/block karta hai aur commission rate set karta hai.',
    features: [
      'Vendor Status Toggles: Active, Pending Approval, Suspended, Blocked.',
      'Location & Geofence Tagging: Vendor kis polygon cluster ke andar fall karta hai.',
      'Services Audit: Shop par kaunsi services enabled hain (e.g. Cotton Saree on 8888888881).',
      'Commission Structure: Per-order platform commission percentage configuration.'
    ],
    pitch: 'Client ko batayein: "Koi bhi vendor tab tak live orders nahi le sakta jab tak admin uske documents aur shop physical verification approve na kare. Quality control 100% strict hai."',
    img: '21_admin_vendors.png'
  }
);

// Admin Screen 22: Services & Master Catalog
renderDesktopAdmin(
  'Master Laundry Services & SAC Code Catalog',
  'PERSONA 4: MASTER ADMIN PANEL',
  {
    title: 'Screen 22: Master Service Catalog & Taxonomy',
    route: 'Route: /admin/services  |  /admin/master-services',
    hinglish: 'Platform par bikne wali har laundry service ki master list. Admin yahan naye kapde (e.g. Silk Coat, Blanket, Curtain) add karta hai, category set karta hai aur SAC code link karta hai.',
    features: [
      'Master Catalog Creation: Name, Category (Household, Men, Women), Tier (Essential / Heritage).',
      'Mandatory SAC Code Assignment: 9994 (Laundry & Dry cleaning services) for GST billing.',
      'Unit Definition: Per piece, Per pair, Per kg, ya Per meter calculation mode.',
      'Service Icon & Image Upload: Mobile app me visually attractive banner set karna.'
    ],
    pitch: 'Client ko batayein: "Company ko naya kapda ya service launch karne ke liye developer ke paas jaane ki zaroorat nahi hai. Admin panel se 1 minute me nayi service add ho jati hai."',
    img: '22_admin_services.png'
  }
);

// Admin Screen 23: Pricing Configuration
renderDesktopAdmin(
  'Dynamic Pricing Engine, Surcharges & Multipliers',
  'PERSONA 4: MASTER ADMIN PANEL',
  {
    title: 'Screen 23: Global & Area Pricing Configuration',
    route: 'Route: /admin/pricing',
    hinglish: 'Base laundry rates, Express delivery surcharges (e.g. 1.5x), Minimum order threshold, Logistics delivery fees aur Area-wise pricing multipliers ko bina code change kiye control karna.',
    features: [
      'Base Rate Configuration: Har garment ka standard washing & dry clean rate.',
      'Express Multiplier: Fast turnaround service ke liye 1.25x se 2.0x extra pricing set karna.',
      'Logistics Charge Engine: Free delivery limit aur standard pickup-drop fee structure.',
      'Area Pricing Overrides: Posh areas ya high-cost cities ke liye custom percentage multiplier.'
    ],
    pitch: 'Client ko batayein: "Diwali ya wedding season me surge pricing lagana ho ya kisi specific city me rate badhana ho, admin panel se instant update ho jata hai."',
    img: '23_admin_pricing.png'
  }
);

// Admin Screen 24: Geofencing & Service Areas
renderDesktopAdmin(
  'Interactive Polygon Geofencing & Pincode Mapping',
  'PERSONA 4: MASTER ADMIN PANEL',
  {
    title: 'Screen 24: Service Geofences & Municipal Boundaries',
    route: 'Route: /admin/geofencing',
    hinglish: 'Map par visual polygon boundary draw karke serviceable area define karna. Nashik, Pune ya Mumbai ke specific mohalle select hote hain jahan company delivery deti hai.',
    features: [
      'Interactive Map Polygon: Map par boundary draw karke Nashik-Serene Meadows cluster banana.',
      'Pincode Mapping: 422013 jaise postal codes ko geofence hub ke sath bind karna.',
      'Strict Order Gating: Geofence boundary se bahar ke customers ko clear "Service Unavailable" message.',
      'Vendor-to-Hub Association: Vendor shop ki GPS location geofence ke andar verify karna.'
    ],
    pitch: 'Client ko batayein: "Logistics cost control karne ke liye geofencing sabse bada tool hai. Delivery sirf usi area me hoti hai jahan hamara vendor aur rider available hai, out-of-boundary fake orders 0% ho jaate hain."',
    img: '24_admin_geofence.png'
  }
);

// Admin Screen 25: GST & Invoice Configuration
renderDesktopAdmin(
  'GST Compliance Settings & Dual Invoice Engine (SZ1 & SZ2)',
  'PERSONA 4: MASTER ADMIN PANEL',
  {
    title: 'Screen 25: Legal GST Rates & Invoice Sequencing',
    route: 'Route: /admin/invoice-settings',
    hinglish: 'Indian tax compliance aur invoice numbering rules ka setup. SZ1 (Customer B2C Invoice) aur SZ2 (Vendor Commission B2B Invoice) ke prefixes, SAC codes aur tax rates yahan configure hote hain.',
    features: [
      'Dual Invoice Setup: SZ1 (Laundry Service B2C) & SZ2 (Platform Commission B2B).',
      'SAC Code Registry: 9994 (Laundry), 9965 (Logistics/Transport), 9983 (IT/Platform Fee).',
      'Tax Splitting Rules: Intra-State (CGST 9% + SGST 9%) vs Inter-State (IGST 18%).',
      'Smart POS Derivation: Pincode se State Code (27 Maharashtra) automatically derive hona.'
    ],
    pitch: 'Client ko batayein: "Chartered Accountant ke auditing ke liye hamara system 100% compliant hai. Har financial year ke hisab se invoice number format (e.g. EZ/26-27/001) automatically generate hota hai."',
    img: '25_admin_invoice_settings.png'
  }
);

// Admin Screen 26: Users / Customers CRM
renderDesktopAdmin(
  'Customer Database, Order History & CRM Management',
  'PERSONA 4: MASTER ADMIN PANEL',
  {
    title: 'Screen 26: Customer Directory & Lifetime Value (LTV)',
    route: 'Route: /admin/users',
    hinglish: 'Tamam registered customers ka complete database. Customer ki total spending, order count, registered addresses, cancellation rate aur account status yahan visible rehta hai.',
    features: [
      'Customer Search by Mobile Number (1111111111) or Name.',
      'Order History Drilldown: Customer ke har purane order ki detailed invoice aur status.',
      'Customer Fraud / Abuse Management: Problematic users ko block/unblock karne ka tool.',
      'Wallet & Referral Credit balance adjustment for customer retention.'
    ],
    pitch: 'Client ko batayein: "Customer CRM se support team kisi bhi customer ki purani complaint ya order history 1 click me nikal kar issue solve kar sakti hai."',
    img: '26_admin_users.png'
  }
);

// Admin Screen 27: Dispute Center
renderDesktopAdmin(
  'Customer Complaints, Damaged Garment Claims & Disputes',
  'PERSONA 4: MASTER ADMIN PANEL',
  {
    title: 'Screen 27: Resolution Center & Claim Adjudication',
    route: 'Route: /admin/dispute-center',
    hinglish: 'Agar kisi customer ka kapda damage ho jaye, color bleed kare ya delay ho, toh customer dispute raise karta hai. Admin yahan vendor aur customer dono ki baat sunkar refund faisla karta hai.',
    features: [
      'Dispute Tickets Queue: Open, Under Investigation, Resolved, Refund Issued.',
      'Evidence Photos: Customer dwara upload ki gayi damaged garment photo inspection.',
      'Settlement Options: Customer wallet refund, Vendor penalty deduction ya Free re-wash voucher.',
      'Audit Trail: Kisine kab ticket resolve kiya uska timestamp record.'
    ],
    pitch: 'Client ko batayein: "Dispute center se brand reputation protect hoti hai. Agar kisi kapde par daag lag jaye, to admin vendor ko bina hurt kiye transparent compensation issue kar sakta hai."',
    img: '27_admin_dispute.png'
  }
);

// Admin Screen 28: Payments & Vendor Settlements
renderDesktopAdmin(
  'Vendor Payouts, Commission Ledger & Escrow Clearing',
  'PERSONA 4: MASTER ADMIN PANEL',
  {
    title: 'Screen 28: Payout Disbursements & Financial Ledger',
    route: 'Route: /admin/payments',
    hinglish: 'Company ka financial settlement room. Customers se aaya paisa Razorpay se company account me aata hai, platform commission deduct hota hai aur baki paisa Vendor ke bank me transfer hota hai.',
    features: [
      'Net Receivable vs Net Payable calculation across all operational hubs.',
      'Automated Commission Deduction: Platform fee + GST lock on every order.',
      'Bank Payout Batch Export: Direct bank NEFT/IMPS transfer ke liye payout sheet generation.',
      'Escrow Hold & Release: B2B raw material suppliers ka payment clearing.'
    ],
    pitch: 'Client ko batayein: "Finance team ka 90% manual kaam khatam ho jata hai kyunki software vendor ka hisab, commission aur bank payout calculation khud calculate karta hai."',
    img: '28_admin_payments.png'
  }
);

// Admin Screen 29: B2B Raw Material Suppliers
renderDesktopAdmin(
  'B2B Wholesale Suppliers & Chemical Inventory Management',
  'PERSONA 4: MASTER ADMIN PANEL',
  {
    title: 'Screen 29: B2B Wholesale Suppliers & Supply Chain',
    route: 'Route: /admin/suppliers',
    hinglish: 'Detergents, packaging materials aur chemicals supply karne wale B2B vendors ka master control. Admin suppliers ko approve karta hai aur wholesale pricing check karta hai.',
    features: [
      'Approved Supplier Roster: Ujjawal Suppliers (3333333333) and chemical distributors.',
      'Catalog Verification: B2B products ki quality aur wholesale pricing slabs verify karna.',
      'B2B Supply Orders Tracking: Kis laundry vendor ne kitne bags detergent mangwaya.',
      'Wholesale Escrow Management: Supply deliver hone par hi supplier ko payment release hona.'
    ],
    pitch: 'Client ko batayein: "Hamara platform laundry vendors ko raw materials par bulk discount dilwata hai, jisse vendor ka profit margin 20% tak badh jata hai aur vendor platform ke sath loyal rehta hai."',
    img: '29_admin_suppliers.png'
  }
);

// -------------------------------------------------------------
// PAGE 25: CLIENT MEETING CHEATSHEET & FAQ SUMMARY
// -------------------------------------------------------------
addHeader('Client Meeting Cheatsheet & Frequently Asked Questions', 'CLIENT PRESENTATION GUIDE');

// Intro box
doc.rect(40, 80, 515, 45).fill('#f8fafc').strokeColor('#cbd5e1').stroke();
doc.fillColor('#0284c7').fontSize(9.5).font('Helvetica-Bold').text('CLIENT MEETING KE LIYE TOP QUESTIONS & INSTANT HINGLISH ANSWERS:', 50, 87);
doc.fillColor('#334155').fontSize(8.2).font('Helvetica').text(
  'Jab aap client ke samne demo denge, to client ye 5 aam sawaal zaroor puchega. Inka tayar jawab niche diya gaya hai taki aap confident hoke meeting close kar sakein.',
  50, 100, { width: 495, lineGap: 1.5 }
);

const faqs = [
  {
    q: 'Q1. "Agar rider customer se kapde leke gayab ho jaye ya kapde kho jayein toh?"',
    a: 'Answer: "Sir, hamare system me 4-step digital handshake hai. Jab tak customer rider ko pickup OTP nahi deta, tab tak kapde pick nahi maane jaate. Aur rider jab shop par drop karta hai, to vendor inbound OTP verify karta hai. Dono ke beech ka pura time, GPS route aur timestamp server par lock hota hai. Agar kapda gayab hua toh clear pata chal jayega ki kiski custody me issue hua."',
    tag: 'Custody Handshake'
  },
  {
    q: 'Q2. "Kya ham kisi ek area me mehenga aur doosre area me sasta rate rakh sakte hain?"',
    a: 'Answer: "Haan bilkul Sir! Admin Panel me \'Pricing Configuration\' aur \'Area Pricing Overrides\' ka option hai. Agar Mumbai South me rates 1.5x rakhne hain aur Nashik me normal, to admin bina kisi programmer ki madad ke 1 minute me percentage override set kar sakta hai."',
    tag: 'Dynamic Pricing'
  },
  {
    q: 'Q3. "GST aur tax compliance ka kya scene hai? Do invoices kyu banti hain?"',
    a: 'Answer: "Sir, Indian tax rules ke mutabiq aggregator platform par 2 invoices banni mandatory hain. Pehli Invoice (SZ1) customer ke liye banti hai laundry service (SAC 9994) ki. Doosri Invoice (SZ2) company vendor par commission charge karti hai (SAC 9983 + 18% GST). Hamara software order deliver hote hi automatic dono invoices PDF format me generate kar deta hai."',
    tag: 'GST Dual Invoicing'
  },
  {
    q: 'Q4. "Vendor ko order aane par pata kaise chalega?"',
    a: 'Answer: "Vendor Dashboard par sound alert aur notification bar diya gaya hai. Sath hi agar vendor chahe to WhatsApp aur SMS alert bhi integrate ho jate hain. Naya order aate hi \'Available\' tab me beep karta hai aur vendor 1 click me accept kar sakta hai."',
    tag: 'Vendor Alerts'
  },
  {
    q: 'Q5. "Testing ke liye real card se payment karna padega kya?"',
    a: 'Answer: "Nahi Sir! Hamne Razorpay ka safe Test Sandbox mode integrate kiya hai. Testing card 4111 1111 1111 1111 dalne par real order place ho jata hai aur 0 rupaye kharch hote hain. Client ko live demo bina kisi paise ke smoothly dikhaya ja sakta hai."',
    tag: 'Zero-Cost Testing'
  }
];

let faqy = 135;
faqs.forEach(f => {
  doc.rect(40, faqy, 515, 95).fill('#ffffff').strokeColor('#e2e8f0').stroke();
  doc.rect(40, faqy, 5, 95).fill('#3b82f6');
  
  doc.fillColor('#0f172a').fontSize(9).font('Helvetica-Bold').text(f.q, 55, faqy + 8, { width: 380 });
  doc.rect(440, faqy + 6, 105, 15).fill('#f1f5f9').strokeColor('#cbd5e1').stroke();
  doc.fillColor('#0284c7').fontSize(7).font('Helvetica-Bold').text(f.tag, 445, faqy + 10, { width: 95, align: 'center' });
  
  doc.fillColor('#475569').fontSize(8).font('Helvetica').text(f.a, 55, faqy + 26, { width: 490, lineGap: 2 });
  faqy += 105;
});

// Final summary badge
doc.rect(40, 675, 515, 80).fill('#0f172a');
doc.fillColor('#38bdf8').fontSize(11).font('Helvetica-Bold').text('EZ OF LIFE (LOONDRY) - READY FOR PRODUCTION DEPLOYMENT', 55, 690, { characterSpacing: 1 });
doc.fillColor('#ffffff').fontSize(8.5).font('Helvetica').text(
  'Aapka platform backend (Node.js/Express/PostgreSQL), frontend (React/Vite/Tailwind), logistics integration aur GST dual-invoice engine ke sath completely ready aur tested hai. Is PDF ko client meeting me use karein aur screen by screen showcase karein.',
  55, 710, { width: 485, lineGap: 2 }
);

addFooter(currentPageNumber);

// Finalize PDF
doc.end();

stream.on('finish', () => {
  console.log(`✅ COMPREHENSIVE HINGLISH PDF SUCCESSFULLY GENERATED!`);
  console.log(`Path: ${outputPath}`);
  console.log(`Total Pages: ${currentPageNumber}`);
});
