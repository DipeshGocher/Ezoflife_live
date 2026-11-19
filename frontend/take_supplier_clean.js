import pkg from './node_modules/@playwright/test/index.js';
const { chromium } = pkg;
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = path.resolve('../screenshots');
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function captureSupplierClean() {
  console.log('1. Authenticating Supplier via API directly to get clean session...');
  await fetch('http://localhost:5005/api/auth/request-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '3333333333' })
  });

  const res = await fetch('http://localhost:5005/api/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '3333333333', otp: '123456' })
  });
  const authData = await res.json();
  if (!authData.token) {
    throw new Error('Failed to obtain supplier token: ' + JSON.stringify(authData));
  }
  console.log('✅ Obtained fresh Supplier JWT token:', authData.token.substring(0, 25) + '...');

  console.log('2. Launching Edge browser...');
  const browser = await chromium.launch({ 
    executablePath: EDGE_PATH,
    headless: true 
  });
  
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });

  const page = await context.newPage();
  const wait = (ms) => new Promise(res => setTimeout(res, ms));

  try {
    // 13. Supplier Auth Screen (Logged Out state)
    console.log('3. Taking 13_supplier_auth.png...');
    await page.goto('http://localhost:5173/supplier/auth', { waitUntil: 'networkidle' });
    await wait(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13_supplier_auth.png') });

    // 14. Supplier OTP Screen
    console.log('4. Entering 3333333333 to show OTP screen...');
    const phoneInput = page.locator('input[type="tel"], input').first();
    if (await phoneInput.isVisible()) {
      await phoneInput.fill('3333333333');
      await wait(500);
      await page.keyboard.press('Enter');
      await wait(2500);
    }
    console.log('5. Taking 14_supplier_otp.png...');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '14_supplier_otp.png') });

    // Inject Supplier Session into LocalStorage
    console.log('6. Injecting valid Supplier session into LocalStorage...');
    await page.evaluate(({ token, user }) => {
      localStorage.clear();
      localStorage.setItem('supplierToken', token);
      localStorage.setItem('token', token);
      localStorage.setItem('supplierData', JSON.stringify(user));
      localStorage.setItem('userData', JSON.stringify(user));
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('userRole', 'supplier');
    }, { token: authData.token, user: authData.user });

    // 15. Clean Supplier Dashboard
    console.log('7. Loading Supplier Dashboard (/supplier/dashboard)...');
    await page.goto('http://localhost:5173/supplier/dashboard', { waitUntil: 'networkidle' });
    await wait(3500);
    console.log('Current URL is now:', page.url());
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '15_supplier_dashboard.png') });

    // 16. Clean Supplier Supplies Catalog
    console.log('8. Loading Supplier Supplies (/supplier/my-supplies)...');
    await page.goto('http://localhost:5173/supplier/my-supplies', { waitUntil: 'networkidle' });
    await wait(3500);
    console.log('Current URL is now:', page.url());
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '16_supplier_supplies.png') });

    // 17. Clean Supplier Wallet
    console.log('9. Loading Supplier Wallet (/supplier/wallet)...');
    await page.goto('http://localhost:5173/supplier/wallet', { waitUntil: 'networkidle' });
    await wait(3000);
    console.log('Current URL is now:', page.url());
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '17_supplier_wallet.png') });

    console.log('🎉 ALL SUPPLIER SCREENSHOTS SUCCESSFULLY CAPTURED IN CLEAN STATE!');
  } catch (err) {
    console.error('Error during clean capture:', err);
  } finally {
    await browser.close();
  }
}

captureSupplierClean();
