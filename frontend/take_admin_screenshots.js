import pkg from './node_modules/@playwright/test/index.js';
const { chromium } = pkg;
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = path.resolve('../screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function captureAdmin() {
  console.log('Launching Edge browser for Admin screens...');
  const browser = await chromium.launch({ 
    executablePath: EDGE_PATH,
    headless: true 
  });
  
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5
  });

  const adminPage = await desktopContext.newPage();
  const wait = (ms) => new Promise(res => setTimeout(res, ms));

  try {
    console.log('Logging in Admin (9999999994)...');
    await adminPage.goto('http://localhost:5173/admin/login', { waitUntil: 'networkidle' });
    await wait(1500);

    const aPhone = adminPage.locator('input[type="tel"], input').first();
    if (await aPhone.isVisible()) {
      await aPhone.fill('9999999994');
      await adminPage.keyboard.press('Enter');
      await wait(2500);
    }
    const aOtpInputs = adminPage.locator('input');
    const aCount = await aOtpInputs.count();
    if (aCount >= 6) {
      for (let i = 0; i < 6; i++) {
        await aOtpInputs.nth(i).fill(String(i + 1));
      }
    } else {
      await adminPage.locator('input').first().fill('123456');
    }
    await wait(1500);
    const aVerify = adminPage.locator('button:has-text("Verify"), button:has-text("Login"), button:has-text("Sign in")').first();
    if (await aVerify.isVisible()) await aVerify.click();
    await wait(3500);

    // 22. Admin Services & Catalog
    console.log('Admin Services...');
    await adminPage.goto('http://localhost:5173/admin/services', { waitUntil: 'networkidle' });
    await wait(2500);
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, '22_admin_services.png') });

    // 23. Admin Pricing Config
    console.log('Admin Pricing Config...');
    await adminPage.goto('http://localhost:5173/admin/pricing', { waitUntil: 'networkidle' });
    await wait(2500);
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, '23_admin_pricing.png') });

    // 24. Admin Geofence / Service Areas
    console.log('Admin Geofencing...');
    await adminPage.goto('http://localhost:5173/admin/geofencing', { waitUntil: 'networkidle' });
    await wait(3000);
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, '24_admin_geofence.png') });

    // 25. Admin Invoice Settings
    console.log('Admin Invoice Settings...');
    await adminPage.goto('http://localhost:5173/admin/invoice-settings', { waitUntil: 'networkidle' });
    await wait(2500);
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, '25_admin_invoice_settings.png') });

    // 26. Admin Users / Customers
    console.log('Admin Users...');
    await adminPage.goto('http://localhost:5173/admin/users', { waitUntil: 'networkidle' });
    await wait(2500);
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, '26_admin_users.png') });

    // 27. Admin Dispute Center
    console.log('Admin Dispute Center...');
    await adminPage.goto('http://localhost:5173/admin/dispute-center', { waitUntil: 'networkidle' });
    await wait(2500);
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, '27_admin_dispute.png') });

    // 28. Admin Payments & Settlements
    console.log('Admin Payments...');
    await adminPage.goto('http://localhost:5173/admin/payments', { waitUntil: 'networkidle' });
    await wait(2500);
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, '28_admin_payments.png') });

    // 29. Admin Suppliers
    console.log('Admin Suppliers...');
    await adminPage.goto('http://localhost:5173/admin/suppliers', { waitUntil: 'networkidle' });
    await wait(2500);
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, '29_admin_suppliers.png') });

    console.log('✅ ALL ADMIN SCREENSHOTS CAPTURED SUCCESSFULLY!');
  } catch (err) {
    console.error('Error during admin capture:', err);
  } finally {
    await browser.close();
  }
}

captureAdmin();

