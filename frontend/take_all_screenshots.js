import pkg from './node_modules/@playwright/test/index.js';
const { chromium } = pkg;
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = path.resolve('../screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function capture() {
  console.log('Launching Edge browser at:', EDGE_PATH);
  const browser = await chromium.launch({ 
    executablePath: EDGE_PATH,
    headless: true 
  });
  
  // Mobile context for User, Vendor, Supplier
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });

  // Desktop context for Admin Panel
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5
  });

  const page = await mobileContext.newPage();
  const wait = (ms) => new Promise(res => setTimeout(res, ms));

  try {
    // 1. Customer Auth
    console.log('1. Customer Auth...');
    await page.goto('http://localhost:5173/user/auth', { waitUntil: 'networkidle' });
    await wait(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_customer_auth.png') });

    // Login Customer
    console.log('Logging in Customer (1111111111)...');
    const phoneInput = page.locator('input[type="tel"], input[placeholder*="Phone"], input[placeholder*="Mobile"], input').first();
    if (await phoneInput.isVisible()) {
      await phoneInput.fill('1111111111');
      await page.keyboard.press('Enter');
      await wait(2500);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_customer_otp.png') });

    // Fill OTP
    const otpInputs = page.locator('input');
    const count = await otpInputs.count();
    if (count >= 6) {
      for (let i = 0; i < 6; i++) {
        await otpInputs.nth(i).fill(String(i + 1));
      }
    } else {
      await page.locator('input').first().fill('123456');
    }
    await wait(1500);

    const verifyBtn = page.locator('button:has-text("Verify"), button:has-text("Continue"), button:has-text("Submit")').first();
    if (await verifyBtn.isVisible()) {
      await verifyBtn.click();
    }
    await wait(3000);

    // 2. Customer Home
    console.log('2. Customer Home...');
    await page.goto('http://localhost:5173/user/home', { waitUntil: 'networkidle' });
    await wait(2500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_customer_home.png') });

    // 3. Customer Cart
    console.log('3. Customer Cart...');
    await page.goto('http://localhost:5173/user/cart', { waitUntil: 'networkidle' });
    await wait(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_customer_cart.png') });

    // 4. Customer Orders History
    console.log('4. Customer Orders...');
    await page.goto('http://localhost:5173/user/orders', { waitUntil: 'networkidle' });
    await wait(2500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_customer_orders.png') });

    // 5. Customer Profile
    console.log('5. Customer Profile...');
    await page.goto('http://localhost:5173/user/profile', { waitUntil: 'networkidle' });
    await wait(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_customer_profile.png') });

    // 6. Vendor Auth
    console.log('6. Vendor Auth...');
    const vendorPage = await mobileContext.newPage();
    await vendorPage.goto('http://localhost:5173/vendor/auth', { waitUntil: 'networkidle' });
    await wait(1500);
    await vendorPage.screenshot({ path: path.join(SCREENSHOT_DIR, '07_vendor_auth.png') });

    // Login Vendor
    console.log('Logging in Vendor (2222222222)...');
    const vPhone = vendorPage.locator('input[type="tel"], input').first();
    if (await vPhone.isVisible()) {
      await vPhone.fill('2222222222');
      await vendorPage.keyboard.press('Enter');
      await wait(2500);
    }
    await vendorPage.screenshot({ path: path.join(SCREENSHOT_DIR, '08_vendor_otp.png') });

    const vOtpInputs = vendorPage.locator('input');
    const vCount = await vOtpInputs.count();
    if (vCount >= 6) {
      for (let i = 0; i < 6; i++) {
        await vOtpInputs.nth(i).fill(String(i + 1));
      }
    } else {
      await vendorPage.locator('input').first().fill('123456');
    }
    await wait(1500);
    const vVerifyBtn = vendorPage.locator('button:has-text("Verify"), button:has-text("Login"), button:has-text("Partnership")').first();
    if (await vVerifyBtn.isVisible()) {
      await vVerifyBtn.click();
    }
    await wait(3000);

    // 7. Vendor Dashboard
    console.log('7. Vendor Dashboard...');
    await vendorPage.goto('http://localhost:5173/vendor/dashboard', { waitUntil: 'networkidle' });
    await wait(2500);
    await vendorPage.screenshot({ path: path.join(SCREENSHOT_DIR, '09_vendor_dashboard.png') });

    // 8. Vendor Services
    console.log('8. Vendor Services...');
    await vendorPage.goto('http://localhost:5173/vendor/my-services', { waitUntil: 'networkidle' });
    await wait(2000);
    await vendorPage.screenshot({ path: path.join(SCREENSHOT_DIR, '10_vendor_services.png') });

    // 9. Vendor Earnings & Reports
    console.log('9. Vendor Earnings...');
    await vendorPage.goto('http://localhost:5173/vendor/earnings', { waitUntil: 'networkidle' });
    await wait(2000);
    await vendorPage.screenshot({ path: path.join(SCREENSHOT_DIR, '11_vendor_earnings.png') });

    // 10. Vendor Profile
    console.log('10. Vendor Profile...');
    await vendorPage.goto('http://localhost:5173/vendor/profile', { waitUntil: 'networkidle' });
    await wait(2000);
    await vendorPage.screenshot({ path: path.join(SCREENSHOT_DIR, '12_vendor_profile.png') });

    // 11. Supplier Auth
    console.log('11. Supplier Auth...');
    const supplierPage = await mobileContext.newPage();
    await supplierPage.goto('http://localhost:5173/supplier/auth', { waitUntil: 'networkidle' });
    await wait(1500);
    await supplierPage.screenshot({ path: path.join(SCREENSHOT_DIR, '13_supplier_auth.png') });

    // Login Supplier (3333333333)
    console.log('Logging in Supplier (3333333333)...');
    const sPhone = supplierPage.locator('input[type="tel"], input').first();
    if (await sPhone.isVisible()) {
      await sPhone.fill('3333333333');
      await supplierPage.keyboard.press('Enter');
      await wait(2500);
    }
    await supplierPage.screenshot({ path: path.join(SCREENSHOT_DIR, '14_supplier_otp.png') });

    const sOtpInputs = supplierPage.locator('input');
    const sCount = await sOtpInputs.count();
    if (sCount >= 6) {
      for (let i = 0; i < 6; i++) {
        await sOtpInputs.nth(i).fill(String(i + 1));
      }
    } else {
      await supplierPage.locator('input').first().fill('123456');
    }
    await wait(1500);
    const sVerify = supplierPage.locator('button:has-text("Verify"), button:has-text("Partnership")').first();
    if (await sVerify.isVisible()) await sVerify.click();
    await wait(3000);

    // 12. Supplier Dashboard
    console.log('12. Supplier Dashboard...');
    await supplierPage.goto('http://localhost:5173/supplier/dashboard', { waitUntil: 'networkidle' });
    await wait(2500);
    await supplierPage.screenshot({ path: path.join(SCREENSHOT_DIR, '15_supplier_dashboard.png') });

    // 13. Supplier Supplies / Catalog
    console.log('13. Supplier Supplies...');
    await supplierPage.goto('http://localhost:5173/supplier/my-supplies', { waitUntil: 'networkidle' });
    await wait(2000);
    await supplierPage.screenshot({ path: path.join(SCREENSHOT_DIR, '16_supplier_supplies.png') });

    // 14. Supplier Wallet
    console.log('14. Supplier Wallet...');
    await supplierPage.goto('http://localhost:5173/supplier/wallet', { waitUntil: 'networkidle' });
    await wait(2000);
    await supplierPage.screenshot({ path: path.join(SCREENSHOT_DIR, '17_supplier_wallet.png') });

    // 15. Admin Panel
    console.log('15. Admin Login...');
    const adminPage = await desktopContext.newPage();
    await adminPage.goto('http://localhost:5173/admin/login', { waitUntil: 'networkidle' });
    await wait(1500);
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, '18_admin_login.png') });

    console.log('Logging in Admin (9999999994)...');
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
    await wait(3000);

    // 16. Admin Dashboard
    console.log('16. Admin Dashboard...');
    await adminPage.goto('http://localhost:5173/admin/dashboard', { waitUntil: 'networkidle' });
    await wait(3000);
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, '19_admin_dashboard.png') });

    // 17. Admin Orders
    console.log('17. Admin Orders...');
    await adminPage.goto('http://localhost:5173/admin/orders', { waitUntil: 'networkidle' });
    await wait(3000);
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, '20_admin_orders.png') });

    // 18. Admin Vendors
    console.log('18. Admin Vendors...');
    await adminPage.goto('http://localhost:5173/admin/vendors', { waitUntil: 'networkidle' });
    await wait(3000);
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, '21_admin_vendors.png') });

    console.log('✅ ALL 21 SCREENSHOTS CAPTURED SUCCESSFULLY!');
  } catch (err) {
    console.error('Error during capture:', err);
  } finally {
    await browser.close();
  }
}

capture();
