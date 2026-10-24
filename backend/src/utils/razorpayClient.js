import Razorpay from 'razorpay';

/** True when the Razorpay checkout keys are configured on the server. */
export const isRazorpayConfigured = () =>
    Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

/**
 * A Razorpay SDK client built on demand (server.js loads .env after ES module
 * imports are evaluated, so a module-level instance would capture missing keys).
 *
 * RAZORPAY_API_BASE_URL lets the automated tests point the SDK at a local fake
 * gateway. It is ignored in production, so live traffic always goes to Razorpay.
 */
export const getRazorpay = () => {
    if (!isRazorpayConfigured()) {
        const error = new Error('Razorpay keys are not configured on the server');
        error.statusCode = 503;
        throw error;
    }
    const instance = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
    });
    if (process.env.RAZORPAY_API_BASE_URL && process.env.NODE_ENV !== 'production') {
        instance.api.rq.defaults.baseURL = process.env.RAZORPAY_API_BASE_URL;
    }
    return instance;
};

/** Base URL for direct (non-SDK) calls such as RazorpayX. Same test override. */
export const razorpayApiBaseUrl = () =>
    (process.env.RAZORPAY_API_BASE_URL && process.env.NODE_ENV !== 'production')
        ? process.env.RAZORPAY_API_BASE_URL.replace(/\/$/, '')
        : 'https://api.razorpay.com';

export const toPaise = (rupees) => Math.round((Number(rupees) || 0) * 100);
export const toRupees = (paise) => Math.round(Number(paise) || 0) / 100;
