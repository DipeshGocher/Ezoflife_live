export const DEFAULT_INVOICE_SETTINGS = Object.freeze({
    businessName: 'SPINZYT',
    businessAddress: '',
    registeredAddress: '',
    platformSacCode: '998311',
    logisticsSacCode: '996511',
    promotionSacCode: '9983',
    contactEmail: 'support@spinzyt.com',
    contactPhone: '',
    website: 'www.spinzyt.com',
    gstNumber: '',
    logo: 'https://spinzyt.com/wp-content/uploads/2023/12/spinzyt-logo-new.png',
    invoiceTitle: 'Tax Invoice',
    customTerms: 'Thank you for taking our services.',
    invoiceNote: 'This is a computer generated invoice.',
    paymentInstructions: '',
    showLogo: true,
    showVendorDetails: true,
    showTerms: true,
    showTaxes: false,
    showServiceFee: true,
    showDeliveryFee: true,
    showSurge: true,
    showDiscount: true,
    showAdvance: true,
    accentColor: '#000000'
});

const limits = { businessName: 120, businessAddress: 500, registeredAddress: 500, platformSacCode: 8, logisticsSacCode: 8, promotionSacCode: 8, contactEmail: 254, contactPhone: 40,
    website: 200, gstNumber: 15, logo: 2000, invoiceTitle: 60, customTerms: 2000,
    invoiceNote: 500, paymentInstructions: 1000, accentColor: 7 };

export function normalizeInvoiceSettings(value = {}, { validate = false } = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        if (validate) throw new Error('Invoice settings must be an object.');
        value = {};
    }
    const settings = { ...DEFAULT_INVOICE_SETTINGS };
    for (const [key, fallback] of Object.entries(DEFAULT_INVOICE_SETTINGS)) {
        if (value[key] === undefined) continue;
        if (typeof value[key] !== typeof fallback) {
            if (validate) throw new Error(`Invalid value for ${key}.`);
            continue;
        }
        settings[key] = typeof fallback === 'string' ? value[key].trim() : value[key];
        if (validate && limits[key] && settings[key].length > limits[key]) throw new Error(`${key} is too long (maximum ${limits[key]} characters).`);
    }
    if (!settings.businessAddress && settings.registeredAddress) settings.businessAddress = settings.registeredAddress;
    if (!settings.registeredAddress && settings.businessAddress) settings.registeredAddress = settings.businessAddress;
    if (validate && (!settings.businessName || !settings.invoiceTitle)) throw new Error('Business name and invoice title are required.');
    if (validate && settings.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.contactEmail)) throw new Error('Enter a valid contact email.');
    if (settings.logo && !/^https?:\/\//i.test(settings.logo)) {
        if (validate) throw new Error('Logo must be an HTTP or HTTPS image URL.');
        settings.logo = '';
    }
    if (!/^#[0-9a-f]{6}$/i.test(settings.accentColor)) {
        if (validate) throw new Error('Enter a valid accent color.');
        settings.accentColor = DEFAULT_INVOICE_SETTINGS.accentColor;
    }
    return settings;
}

// Text inserted into the standalone customer print document must remain text.
export const escapeInvoiceText = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
