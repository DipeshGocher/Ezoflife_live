import { pickProfileFields } from '../../../shared/profileFields.mjs';
import { getSessionToken } from './sessionToken';
import FilterSearchParams from './FilterSearchParams';
/**
 * Global fetch interceptor.
 *
 * Attaches the session JWT to EVERY call to our own API. It previously matched a
 * hand-maintained list of "/admin"-ish URLs, which meant customer and vendor
 * requests went out unauthenticated — so the server had no choice but to trust
 * ids in the request body. Any new authenticated route also had to be added to
 * that list by hand, and was silently unauthenticated until someone remembered.
 *
 * Sending a token to a public endpoint is harmless; the server ignores it.
 */
const originalFetch = window.fetch;

const getApiBaseUrl = () => {
    let raw = (import.meta.env.VITE_API_URL || 'http://localhost:5001/api').trim().replace(/\/$/, '');
    if (!raw.endsWith('/api')) {
        raw += '/api';
    }
    return raw;
};

export const BASE_URL = getApiBaseUrl();
export const UPLOADS_URL = BASE_URL.replace(/\/api$/, '') + '/uploads/';

/** Is this request going to our own backend? */
const isOwnApi = (url) => {
    if (!url) return false;
    return url.startsWith(BASE_URL) || url.includes('/api/');
};

window.fetch = async (input, init) => {
    let url = typeof input === 'string' ? input : (input instanceof Request ? input.url : '');
    let options = init || {};

    const token = getSessionToken();
    if (token) {
        if (isOwnApi(url)) {
            if (typeof input === 'string') {
                options.headers = options.headers || {};
                if (options.headers instanceof Headers) {
                    if (!options.headers.has('Authorization')) {
                        options.headers.set('Authorization', `Bearer ${token}`);
                    }
                } else if (Array.isArray(options.headers)) {
                    if (!options.headers.some(([k]) => k.toLowerCase() === 'authorization')) {
                        options.headers.push(['Authorization', `Bearer ${token}`]);
                    }
                } else {
                    if (!options.headers['Authorization'] && !options.headers['authorization']) {
                        options.headers['Authorization'] = `Bearer ${token}`;
                    }
                }
            } else if (input instanceof Request) {
                if (!input.headers.has('Authorization')) {
                    try {
                        input.headers.set('Authorization', `Bearer ${token}`);
                    } catch (e) {
                        const newHeaders = new Headers(input.headers);
                        newHeaders.set('Authorization', `Bearer ${token}`);
                        input = new Request(input, { headers: newHeaders });
                    }
                }
            }
        }
    }

    const res = await originalFetch(input, options);
    
    if (res.status === 401) {
        const urlLower = url.toLowerCase();
        const isAdminEndpoint = urlLower.includes('/admin') || 
                                (urlLower.includes('/geofence') && !urlLower.includes('/check-availability') && !urlLower.includes('/public/')) || 
                                urlLower.includes('/area-overrides') || 
                                (urlLower.includes('/master-pricing') && !urlLower.includes('fenceid=')) ||
                                urlLower.includes('/supplier/requests') ||
                                urlLower.includes('/labor/active-requests') ||
                                urlLower.includes('/labor/add');
        if (isAdminEndpoint) {
            console.warn('🔑 Admin Session expired or unauthorized. Redirecting to login...');
            localStorage.removeItem('adminAuth');
            localStorage.removeItem('adminToken');
            localStorage.removeItem('adminData');
            if (window.location.pathname.startsWith('/admin') && window.location.pathname !== '/admin/login') {
                window.location.href = '/admin/login';
            }
        }
    }
    return res;
};

// ─── Admin Auth Helpers ───────────────────────────────────────────────────────
// These are used by every admin API call to attach the JWT token.
export const getAdminToken = () => localStorage.getItem('adminToken') || localStorage.getItem('token');

export const adminAuthHeaders = (extra = {}) => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getAdminToken()}`,
    ...extra
});

// For FormData calls (no Content-Type, browser sets it with boundary)
export const adminAuthHeadersFormData = () => ({
    'Authorization': `Bearer ${getAdminToken()}`
});

export const categoryApi = {
    getAll: async () => {
        const res = await fetch(`${BASE_URL}/categories`);
        return res.json();
    },
    getPaginated: async (page = 1, limit = 10, filters = {}) => {
        const queryParams = new FilterSearchParams({
            page,
            limit,
            ...filters
        }).toString();
        const res = await fetch(`${BASE_URL}/categories?${queryParams}`);
        return res.json();
    },
    getMain: async () => {
        const res = await fetch(`${BASE_URL}/categories?isActive=true`);
        const data = await res.json();
        // Return unique main categories with name as id
        return Array.from(new Set(data.map(c => c.mainCategory)))
            .filter(Boolean)
            .map(name => ({ _id: name, name }));
    },
    getSub: async (mainCategoryName) => {
        const res = await fetch(`${BASE_URL}/categories?isActive=true`);
        const data = await res.json();
        return data.filter(c => c.mainCategory === mainCategoryName);
    },
    create: async (data) => {
        const res = await fetch(`${BASE_URL}/categories`, {
            method: 'POST',
            headers: adminAuthHeaders(),
            body: JSON.stringify(data)
        });
        return res.json();
    },
    update: async (id, data) => {
        const res = await fetch(`${BASE_URL}/categories/${id}`, {
            method: 'PUT',
            headers: adminAuthHeaders(),
            body: JSON.stringify(data)
        });
        return res.json();
    },
    delete: async (id) => {
        const res = await fetch(`${BASE_URL}/categories/${id}`, {
            method: 'DELETE',
            headers: adminAuthHeaders()
        });
        return res.json();
    },
    bulkUpload: async (categories) => {
        const res = await fetch(`${BASE_URL}/categories/bulk-upload`, {
            method: 'POST',
            headers: adminAuthHeaders(),
            body: JSON.stringify(categories)
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || 'Bulk upload failed');
        }
        return res.json();
    },
    clearAll: async () => {
        const res = await fetch(`${BASE_URL}/categories/clear-all`, {
            method: 'DELETE',
            headers: adminAuthHeaders()
        });
        return res.json();
    }
};

export const vendorSupplyCategoryApi = {
    getAll: async () => {
        const res = await fetch(`${BASE_URL}/vendor-supply-categories`);
        return res.json();
    },
    getPaginated: async (page = 1, limit = 10, filters = {}) => {
        const queryParams = new FilterSearchParams({
            page,
            limit,
            ...filters
        }).toString();
        const res = await fetch(`${BASE_URL}/vendor-supply-categories?${queryParams}`);
        return res.json();
    },
    getMain: async () => {
        const res = await fetch(`${BASE_URL}/vendor-supply-categories?isActive=true`);
        const data = await res.json();
        return Array.from(new Set(data.map(c => c.mainCategory)))
            .filter(Boolean)
            .map(name => ({ _id: name, name }));
    },
    getSub: async (mainCategoryName) => {
        const res = await fetch(`${BASE_URL}/vendor-supply-categories?isActive=true`);
        const data = await res.json();
        return data.filter(c => c.mainCategory === mainCategoryName);
    },
    create: async (data) => {
        const res = await fetch(`${BASE_URL}/vendor-supply-categories`, {
            method: 'POST',
            headers: adminAuthHeaders(),
            body: JSON.stringify(data)
        });
        return res.json();
    },
    update: async (id, data) => {
        const res = await fetch(`${BASE_URL}/vendor-supply-categories/${id}`, {
            method: 'PUT',
            headers: adminAuthHeaders(),
            body: JSON.stringify(data)
        });
        return res.json();
    },
    delete: async (id) => {
        const res = await fetch(`${BASE_URL}/vendor-supply-categories/${id}`, {
            method: 'DELETE',
            headers: adminAuthHeaders()
        });
        return res.json();
    },
    bulkUpload: async (categories) => {
        const res = await fetch(`${BASE_URL}/vendor-supply-categories/bulk-upload`, {
            method: 'POST',
            headers: adminAuthHeaders(),
            body: JSON.stringify(categories)
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || 'Bulk upload failed');
        }
        return res.json();
    },
    clearAll: async () => {
        const res = await fetch(`${BASE_URL}/vendor-supply-categories/clear-all`, {
            method: 'DELETE',
            headers: adminAuthHeaders()
        });
        return res.json();
    }
};

export const vendorMasterSupplyApi = {
    getAll: async (filters = {}) => {
        const queryParams = new FilterSearchParams(filters).toString();
        const res = await fetch(`${BASE_URL}/vendor-master-supplies?${queryParams}`);
        return res.json();
    },
    getUniqueFilters: async () => {
        const res = await fetch(`${BASE_URL}/vendor-master-supplies/unique-filters`);
        return res.json();
    },
    getPaginated: async (page = 1, limit = 10, filters = {}) => {
        const queryParams = new FilterSearchParams({
            page,
            limit,
            ...filters
        }).toString();
        const res = await fetch(`${BASE_URL}/vendor-master-supplies?${queryParams}`);
        return res.json();
    },
    create: async (data) => {
        const res = await fetch(`${BASE_URL}/vendor-master-supplies`, {
            method: 'POST',
            headers: adminAuthHeaders(),
            body: JSON.stringify(data)
        });
        return res.json();
    },
    update: async (id, data) => {
        const res = await fetch(`${BASE_URL}/vendor-master-supplies/${id}`, {
            method: 'PUT',
            headers: adminAuthHeaders(),
            body: JSON.stringify(data)
        });
        return res.json();
    },
    delete: async (id) => {
        const res = await fetch(`${BASE_URL}/vendor-master-supplies/${id}`, {
            method: 'DELETE',
            headers: adminAuthHeaders()
        });
        return res.json();
    },
    bulkUpload: async (items) => {
        const res = await fetch(`${BASE_URL}/vendor-master-supplies/bulk-upload`, {
            method: 'POST',
            headers: adminAuthHeaders(),
            body: JSON.stringify(items)
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || 'Bulk upload failed');
        }
        return res.json();
    },
    clearAll: async () => {
        const res = await fetch(`${BASE_URL}/vendor-master-supplies/clear-all`, {
            method: 'DELETE',
            headers: adminAuthHeaders()
        });
        return res.json();
    }
};

export const supplierServiceZoneApi = {
    getAll: async (filters = {}) => {
        const queryParams = new FilterSearchParams(filters).toString();
        const res = await fetch(`${BASE_URL}/supplier-service-zones?${queryParams}`);
        return res.json();
    },
    getPaginated: async (page = 1, limit = 10, filters = {}) => {
        const queryParams = new FilterSearchParams({
            page,
            limit,
            ...filters
        }).toString();
        const res = await fetch(`${BASE_URL}/supplier-service-zones?${queryParams}`);
        return res.json();
    },
    create: async (data) => {
        const res = await fetch(`${BASE_URL}/supplier-service-zones`, {
            method: 'POST',
            headers: adminAuthHeaders(),
            body: JSON.stringify(data)
        });
        return res.json();
    },
    update: async (id, data) => {
        const res = await fetch(`${BASE_URL}/supplier-service-zones/${id}`, {
            method: 'PUT',
            headers: adminAuthHeaders(),
            body: JSON.stringify(data)
        });
        return res.json();
    },
    delete: async (id) => {
        const res = await fetch(`${BASE_URL}/supplier-service-zones/${id}`, {
            method: 'DELETE',
            headers: adminAuthHeaders()
        });
        return res.json();
    },
    bulkUpload: async (zones) => {
        const res = await fetch(`${BASE_URL}/supplier-service-zones/bulk-upload`, {
            method: 'POST',
            headers: adminAuthHeaders(),
            body: JSON.stringify(zones)
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || 'Bulk upload failed');
        }
        return res.json();
    },
    clearAll: async () => {
        const res = await fetch(`${BASE_URL}/supplier-service-zones/clear-all`, {
            method: 'DELETE',
            headers: adminAuthHeaders()
        });
        return res.json();
    }
};


export const authApi = {
    requestOtp: async (phone, channel, mode, options = {}) => {
        // Mock Credentials Bypass
        if (phone === '9999999999') {
            return { message: 'OTP sent successfully', mock: true };
        }
        try {
            const response = await fetch(`${BASE_URL}/auth/request-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, channel, mode, ...options })
            });
            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },
    verifyOtp: async (phone, otp) => {
        try {
            const response = await fetch(`${BASE_URL}/auth/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, otp })
            });
            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },
    adminLogin: async (email, password) => {
        try {
            const response = await fetch(`${BASE_URL}/auth/admin-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            return await response.json();
        } catch (error) {
            console.error('Admin API Error:', error);
            throw error;
        }
    },
    registerVendor: async (vendorData) => {
        try {
            const response = await fetch(`${BASE_URL}/auth/register-vendor`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(vendorData)
            });
            return await response.json();
        } catch (error) {
            console.error('Register Vendor Error:', error);
            throw error;
        }
    },
    vendorLogin: async (identifier, password) => {
        try {
            const response = await fetch(`${BASE_URL}/auth/vendor-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier, password })
            });
            return await response.json();
        } catch (error) {
            console.error('Vendor Login Error:', error);
            throw error;
        }
    },
    completeVendorProfile: async (data) => {
        try {
            const isFormData = data instanceof FormData;
            const response = await fetch(`${BASE_URL}/auth/complete-vendor-profile`, {
                method: 'POST',
                headers: isFormData ? {} : { 'Content-Type': 'application/json' },
                body: isFormData ? data : JSON.stringify(data)
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Vendor API Error:', error);
            throw error;
        }
    },
    getStatus: async (phone) => {
        try {
            const response = await fetch(`${BASE_URL}/auth/get-status?phone=${phone}`);
            return await readApiResponse(response);
        } catch (error) {
            console.error('Status API Error:', error);
            throw error;
        }
    },
    getProfile: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/auth/profile/${id}`);
            return await readApiResponse(response);
        } catch (error) {
            console.error('Get Profile Error:', error);
            throw error;
        }
    },
    updateProfile: async (id, data, addressAuthorization) => {
        try {
            const profileData = data.shopDetails?.services ? { ...data, shopDetails: { ...data.shopDetails, services: data.shopDetails.services.map(service => { const { adminRate: _adminRate, rejectionReason: _reason, ...editable } = service; return editable; }) } } : data;
            const response = await fetch(`${BASE_URL}/auth/profile/update/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...(addressAuthorization ? { 'X-Walk-In-Authorization': addressAuthorization } : {}) },
                body: JSON.stringify(profileData)
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Update failed');
            }
            return await readApiResponse(response);
        } catch (error) {
            console.error('Update Profile Error:', error);
            throw error;
        }
    },
    becomeVendor: async (id, data) => {
        try {
            const response = await fetch(`${BASE_URL}/auth/become-vendor/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Become Vendor API Error:', error);
            throw error;
        }
    },
    becomeSupplier: async (id, formData) => {
        try {
            const isFormData = formData instanceof FormData;
            const response = await fetch(`${BASE_URL}/auth/become-supplier/${id}`, {
                method: 'POST',
                headers: isFormData ? {} : { 'Content-Type': 'application/json' },
                body: isFormData ? formData : JSON.stringify(formData)
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Become Supplier API Error:', error);
            throw error;
        }
    },
    submitVendorServices: async (id, services) => {
        try {
            const response = await fetch(`${BASE_URL}/auth/become-vendor/${id}/submit-services`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ services })
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Submit Services Error:', error);
            throw error;
        }
    },
    updateDocuments: async (id, formData) => {
        try {
            const response = await fetch(`${BASE_URL}/auth/update-documents/${id}`, {
                method: 'PATCH',
                body: formData
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Update Documents API Error:', error);
            throw error;
        }
    },
    updateProfileImage: async (id, formData) => {
        try {
            const response = await fetch(`${BASE_URL}/auth/update-profile-image/${id}`, {
                method: 'PATCH',
                body: formData
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Update Profile Image API Error:', error);
            throw error;
        }
    },
    updateFcmToken: async (userId, fcmToken) => {
        try {
            const response = await fetch(`${BASE_URL}/auth/update-fcm-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, fcmToken })
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Update FCM Token Error:', error);
            throw error;
        }
    },
    getDraftCart: async (userId) => {
        try {
            const response = await fetch(`${BASE_URL}/auth/cart/${userId}`);
            return await readApiResponse(response);
        } catch (error) {
            console.error('Get Cart Error:', error);
            throw error;
        }
    },
    updateDraftCart: async (userId, cart) => {
        try {
            const response = await fetch(`${BASE_URL}/auth/cart/${userId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cart })
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Update Cart Error:', error);
            throw error;
        }
    },
    lookupPhone: async (phone) => {
        try {
            const response = await fetch(`${BASE_URL}/auth/lookup-phone/${phone}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Lookup failed');
            }
            return await readApiResponse(response);
        } catch (error) {
            console.error('Lookup Phone API Error:', error);
            throw error;
        }
    }
};

export const adApi = {
    create: async (formData) => {
        try {
            const response = await fetch(`${BASE_URL}/ads`, {
                method: 'POST',
                headers: adminAuthHeadersFormData(),
                body: formData
            });
            return await response.json();
        } catch (error) {
            console.error('Create Ad Error:', error);
            throw error;
        }
    },
    getActive: async (category) => {
        try {
            const url = category ? `${BASE_URL}/ads/active?category=${category}` : `${BASE_URL}/ads/active`;
            const response = await fetch(url);
            return await response.json();
        } catch (error) {
            console.error('Get Active Ad Error:', error);
            throw error;
        }
    },
    getAll: async () => {
        try {
            const response = await fetch(`${BASE_URL}/ads/all`, {
                headers: adminAuthHeaders()
            });
            return await response.json();
        } catch (error) {
            console.error('Get All Ads Error:', error);
            throw error;
        }
    },
    toggleStatus: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/ads/${id}/toggle`, {
                method: 'PATCH',
                headers: adminAuthHeaders()
            });
            return await response.json();
        } catch (error) {
            console.error('Toggle Ad Error:', error);
            throw error;
        }
    },
    delete: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/ads/${id}`, {
                method: 'DELETE',
                headers: adminAuthHeaders()
            });
            return await response.json();
        } catch (error) {
            console.error('Delete Ad Error:', error);
            throw error;
        }
    },
    updateNotes: async (id, notes) => {
        try {
            const response = await fetch(`${BASE_URL}/ads/${id}/notes`, {
                method: 'PATCH',
                headers: {
                    ...adminAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ notes })
            });
            return await response.json();
        } catch (error) {
            console.error('Update Ad Notes Error:', error);
            throw error;
        }
    }
};


export const b2bOrderApi = {
    placeOrder: async (data) => {
        try {
            const response = await fetch(`${BASE_URL}/b2b-orders/place`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return await response.json();
        } catch (error) {
            console.error('Place B2B Order Error:', error);
            throw error;
        }
    },
    getById: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/b2b-orders/${id}`);
            return await response.json();
        } catch (error) {
            console.error('Get B2B Order by ID Error:', error);
            throw error;
        }
    },
    getSupplierOrders: async (supplierId) => {
        try {
            const response = await fetch(`${BASE_URL}/b2b-orders/supplier/${supplierId}`);
            return await response.json();
        } catch (error) {
            console.error('Get Supplier Orders Error:', error);
            throw error;
        }
    },
    getVendorOrders: async (vendorId) => {
        try {
            const response = await fetch(`${BASE_URL}/b2b-orders/vendor/${vendorId}`);
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || 'Failed to fetch vendor B2B orders');
            }
            return await response.json();
        } catch (error) {
            console.error('Fetch Vendor B2B Orders Error:', error);
            throw error;
        }
    },
    updateStatus: async (id, data) => {
        try {
            const response = await fetch(`${BASE_URL}/b2b-orders/${id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return await response.json();
        } catch (error) {
            console.error('Update B2B Status Error:', error);
            throw error;
        }
    },
    verifyDeliveryOtp: async (id, otp) => {
        try {
            const response = await fetch(`${BASE_URL}/b2b-orders/${id}/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ otp })
            });
            return await response.json();
        } catch (error) {
            console.error('Verify B2B Delivery OTP Error:', error);
            throw error;
        }
    },
    updateDeliveryDate: async (id, deliveryDate) => {
        try {
            const response = await fetch(`${BASE_URL}/b2b-orders/${id}/delivery-date`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deliveryDate })
            });
            return await response.json();
        } catch (error) {
            console.error('Update B2B Delivery Date Error:', error);
            throw error;
        }
    },
    bulkUpdateStatus: async (data) => {
        try {
            const response = await fetch(`${BASE_URL}/b2b-orders/bulk-status-update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return await response.json();
        } catch (error) {
            console.error('Bulk Update B2B Status Error:', error);
            throw error;
        }
    },
    initiateB2BPayment: async (orderId) => {
        try {
            const response = await fetch(`${BASE_URL}/b2b-orders/initiate-payment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId })
            });
            return await response.json();
        } catch (error) {
            console.error('Initiate B2B Payment Error:', error);
            throw error;
        }
    },
    verifyB2BPayment: async (paymentData) => {
        try {
            const response = await fetch(`${BASE_URL}/b2b-orders/verify-payment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(paymentData)
            });
            return await response.json();
        } catch (error) {
            console.error('Verify B2B Payment Error:', error);
            throw error;
        }
    },
    verifyPlatformFeePayment: async (paymentData) => {
        try {
            const response = await fetch(`${BASE_URL}/b2b-orders/verify-platform-fee`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(paymentData)
            });
            return await response.json();
        } catch (error) {
            console.error('Verify Platform Fee Payment Error:', error);
            throw error;
        }
    },
    getAdminEscrowOrders: async () => {
        try {
            const response = await fetch(`${BASE_URL}/b2b-orders/admin/escrow`, {
                headers: adminAuthHeaders()
            });
            return await response.json();
        } catch (error) {
            console.error('Get Admin Escrow Error:', error);
            throw error;
        }
    },
    releasePayment: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/b2b-orders/${id}/release`, {
                method: 'PATCH',
                headers: adminAuthHeaders()
            });
            return await response.json();
        } catch (error) {
            console.error('Release Payment Error:', error);
            throw error;
        }
    },
    getTimeline: async () => {
        try {
            const response = await fetch(`${BASE_URL}/b2b-orders/timeline`);
            return await response.json();
        } catch (error) {
            console.error('Get Timeline Error:', error);
            throw error;
        }
    }
};


const readApiResponse = async response => {
    const data = await response.json();
    if (!response.ok) {
        throw Object.assign(new Error(data.message || 'Request failed'), { status: response.status });
    }
    return data;
};

export const adminApi = {
    issueInvoice: async (id, type = 'customer') => readApiResponse(await fetch(`${BASE_URL}/admin/orders/${id}/invoices`, { method: 'POST', headers: adminAuthHeaders(), body: JSON.stringify({ type }) })),
    getUserHistory: async (id, filters = {}) => {
        const response = await fetch(`${BASE_URL}/admin/users/${encodeURIComponent(id)}/history?${new FilterSearchParams(filters)}`, { headers: adminAuthHeaders() });
        return readApiResponse(response);
    },
    getAuditEvents: async (filters = {}) => {
        const response = await fetch(`${BASE_URL}/admin/audit-events?${new FilterSearchParams(filters)}`, { headers: adminAuthHeaders() });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Unable to load audit history.');
        return data;
    },
    getSidebarCounts: async () => {
        try {
            const response = await fetch(`${BASE_URL}/admin/sidebar-counts`, {
                headers: adminAuthHeaders()
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Sidebar Counts Error:', error);
            return {};
        }
    },
    getStats: async () => {
        try {
            const response = await fetch(`${BASE_URL}/admin/stats`, {
                headers: adminAuthHeaders()
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Admin Stats Error:', error);
            throw error;
        }
    },
    getCloudinaryUsage: async () => {
        try {
            const response = await fetch(`${BASE_URL}/admin/cloudinary-usage`, {
                headers: adminAuthHeaders()
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Cloudinary Usage Error:', error);
            throw error;
        }
    },
    getPendingApprovals: async (filters = {}) => {
        try {
            const queryParams = new FilterSearchParams(filters).toString();
            const url = `${BASE_URL}/admin/pending-approvals${queryParams ? `?${queryParams}` : ''}`;
            const response = await fetch(url, {
                headers: adminAuthHeaders()
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Admin Approvals Error:', error);
            throw error;
        }
    },
    getCustomers: async () => {
        try {
            const response = await fetch(`${BASE_URL}/admin/customers`, {
                headers: adminAuthHeaders()
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Admin Customers Error:', error);
            throw error;
        }
    },
    getAllUsers: async (role) => {
        try {
            const response = await fetch(`${BASE_URL}/admin/users${role ? `?role=${role}` : ''}`, {
                headers: adminAuthHeaders()
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Admin All Users Error:', error);
            throw error;
        }
    },
    toggleUserStatus: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/admin/users/${id}/toggle-status`, {
                method: 'PATCH',
                headers: adminAuthHeaders()
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Toggle User Status Error:', error);
            throw error;
        }
    },
    deleteUser: async (id, deleteRelatedData = false) => {
        try {
            const response = await fetch(`${BASE_URL}/admin/users/${id}?deleteRelatedData=${deleteRelatedData}`, {
                method: 'DELETE',
                headers: {
                    ...adminAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ deleteRelatedData })
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Delete User Error:', error);
            throw error;
        }
    },
    approveVendor: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/admin/approve-vendor/${id}`, {
                method: 'POST',
                headers: adminAuthHeaders()
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Approve Vendor Error:', error);
            throw error;
        }
    },
    rejectVendor: async (id, data) => {
        try {
            const response = await fetch(`${BASE_URL}/admin/reject-vendor/${id}`, {
                method: 'POST',
                headers: adminAuthHeaders(),
                body: JSON.stringify(data)
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Reject Vendor Error:', error);
            throw error;
        }
    },
    getVendorRequestById: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/admin/vendor-request/${id}`, {
                headers: adminAuthHeaders()
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Get Vendor Request Error:', error);
            throw error;
        }
    },
    approveInitialVendor: async (id, tier) => {
        try {
            const response = await fetch(`${BASE_URL}/admin/vendor-request/${id}/approve-initial`, {
                method: 'PATCH',
                headers: adminAuthHeaders(),
                body: JSON.stringify({ tier })
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Initial Approval Error:', error);
            throw error;
        }
    },
    approveFinalVendor: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/admin/vendor-request/${id}/approve-final`, {
                method: 'PATCH',
                headers: adminAuthHeaders()
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Final Approval Error:', error);
            throw error;
        }
    },
    getAllVendors: async () => {
        try {
            const response = await fetch(`${BASE_URL}/admin/vendors`, {
                headers: adminAuthHeaders()
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('All Vendors Error:', error);
            throw error;
        }
    },
    deleteVendor: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/admin/vendors/${id}`, {
                method: 'DELETE',
                headers: adminAuthHeaders()
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Delete Vendor Error:', error);
            throw error;
        }
    },
    registerCustomer: async (data) => {
        try {
            const response = await fetch(`${BASE_URL}/admin/register-customer`, {
                method: 'POST',
                headers: adminAuthHeaders(),
                body: JSON.stringify(data)
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Register Customer Error:', error);
            throw error;
        }
    },
    getVendorById: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/admin/vendors/${id}`, {
                headers: adminAuthHeaders()
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Get Vendor By ID Error:', error);
            throw error;
        }
    },
    updateServiceStatus: async (vendorId, serviceId, data) => {
        try {
            const response = await fetch(`${BASE_URL}/admin/vendors/${vendorId}/services/${serviceId}/status`, {
                method: 'PATCH',
                headers: adminAuthHeaders(),
                body: JSON.stringify(data)
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Update Service Status Error:', error);
            throw error;
        }
    },
    uploadVendorDocument: async (vendorId, formData) => {
        try {
            const response = await fetch(`${BASE_URL}/admin/vendors/${vendorId}/documents`, {
                method: 'POST',
                headers: adminAuthHeadersFormData(),
                body: formData
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Upload Vendor Doc Error:', error);
            throw error;
        }
    },
    getAllSuppliers: async () => {
        try {
            const response = await fetch(`${BASE_URL}/admin/suppliers`, {
                headers: adminAuthHeaders()
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('All Suppliers Error:', error);
            throw error;
        }
    },
    approveSupplier: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/admin/suppliers/${id}/approve`, {
                method: 'PATCH',
                headers: adminAuthHeaders()
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Approve Supplier Error:', error);
            throw error;
        }
    },
    rejectSupplier: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/admin/suppliers/${id}/reject`, {
                method: 'PATCH',
                headers: adminAuthHeaders()
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Reject Supplier Error:', error);
            throw error;
        }
    },
    updateSupplier: async (id, data) => {
        try {
            const response = await fetch(`${BASE_URL}/admin/suppliers/${id}`, {
                method: 'PATCH',
                headers: adminAuthHeaders(),
                body: JSON.stringify(data)
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Update Supplier Error:', error);
            throw error;
        }
    },
    deleteSupplier: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/admin/suppliers/${id}`, {
                method: 'DELETE',
                headers: adminAuthHeaders()
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Delete Supplier Error:', error);
            throw error;
        }
    },
    clearAllOrders: async () => {
        try {
            const response = await fetch(`${BASE_URL}/admin/force-clear-orders`, {
                method: 'POST',
                headers: adminAuthHeaders()
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to clear orders');
            }
            return await readApiResponse(response);
        } catch (error) {
            console.error('Clear All Orders Error:', error);
            throw error;
        }
    },
    getOrderDetail: async (id) => {
        const response = await fetch(`${BASE_URL}/admin/orders/${encodeURIComponent(id)}`, {
            headers: adminAuthHeaders()
        });
        const data = await response.json();
        if (!response.ok) {
            const error = new Error(data.message || 'Unable to load order details.');
            error.status = response.status;
            throw error;
        }
        return data;
    },
    getConfig: async () => {
        try {
            // Config GET is public (needed for app boot), no auth required
            const response = await fetch(`${BASE_URL}/admin/config`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Unable to load configuration');
            return data;
        } catch (error) {
            console.error('Get Config Error:', error);
            throw error;
        }
    },
    updateConfig: async (keyOrData, value) => {
        try {
            const body = value !== undefined ? { key: keyOrData, value } : keyOrData;
            const response = await fetch(`${BASE_URL}/admin/config`, {
                method: 'POST',
                headers: adminAuthHeaders(),
                body: JSON.stringify(body)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Unable to save configuration');
            return data;
        } catch (error) {
            console.error('Update Config Error:', error);
            throw error;
        }
    },
    getCustomerPayments: async () => {
        try {
            const response = await fetch(`${BASE_URL}/admin/customer-payments`, {
                headers: adminAuthHeaders()
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Get Customer Payments Error:', error);
            throw error;
        }
    },
    getVendorPayments: async () => {
        try {
            const response = await fetch(`${BASE_URL}/admin/vendor-payments`, {
                headers: adminAuthHeaders()
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Get Vendor Payments Error:', error);
            throw error;
        }
    },
    recordVendorPayout: async (data) => {
        try {
            const response = await fetch(`${BASE_URL}/admin/record-vendor-payout`, {
                method: 'POST',
                headers: adminAuthHeaders(),
                body: JSON.stringify(data)
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Record Payout Error:', error);
            throw error;
        }
    },
    updateUserProfile: async (id, data) => {
        try {
            const response = await fetch(`${BASE_URL}/auth/profile/update/${id}`, {
                method: 'PATCH',
                headers: adminAuthHeaders(),
                body: JSON.stringify({ ...pickProfileFields(data), ...(['approved', 'rejected'].includes(data.status) ? { status: data.status } : {}) })
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Update User Profile Error:', error);
            throw error;
        }
    }
};

export const orderApi = {
    createOrder: async (orderData) => {
        try {
            const response = await fetch(`${BASE_URL}/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData)
            });
            return await response.json();
        } catch (error) {
            console.error('Create Order Error:', error);
            throw error;
        }
    },
    createRazorpayOrder: async (data) => {
        try {
            const response = await fetch(`${BASE_URL}/orders/razorpay`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return await response.json();
        } catch (error) {
            console.error('Create Razorpay Order Error:', error);
            throw error;
        }
    },
    createWalkInOrder: async (orderData) => {
        try {
            const response = await fetch(`${BASE_URL}/orders/walk-in`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData)
            });
            return await response.json();
        } catch (error) {
            console.error('Create Walk-In Error:', error);
            throw error;
        }
    },
    getMyOrders: async (customerId, filters = {}) => {
        try {
            const queryParams = new FilterSearchParams({ customerId, ...filters }).toString();
            const response = await fetch(`${BASE_URL}/orders/my?${queryParams}`);
            return await response.json();
        } catch (error) {
            console.error('Get Orders Error:', error);
            throw error;
        }
    },
    getNearbyVendors: async (lat, lng, radius = 10) => {
        try {
            const userRaw = localStorage.getItem('user') || localStorage.getItem('userData');
            let customerId = '';
            if (userRaw) {
                try {
                    const user = JSON.parse(userRaw);
                    customerId = user._id || user.id || user.user?._id || user.user?.id;
                } catch (e) {
                    console.error('Error parsing user from localStorage', e);
                }
            }
            const queryParams = new FilterSearchParams({ lat, lng, radius });
            if (customerId) {
                queryParams.append('customerId', customerId);
            }
            const response = await fetch(`${BASE_URL}/orders/nearby-vendors?${queryParams.toString()}`);
            return await response.json();
        } catch (error) {
            console.error('Get Nearby Vendors Error:', error);
            throw error;
        }
    },
    getVendorOrders: async (vendorId) => {
        try {
            const response = await fetch(`${BASE_URL}/orders/vendor?vendorId=${vendorId}`);
            return await response.json();
        } catch (error) {
            console.error('Get Vendor Orders Error:', error);
            throw error;
        }
    },
    updateOrderStatus: async (id, status) => {
        try {
            const response = await fetch(`${BASE_URL}/orders/status/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });
            return await response.json();
        } catch (error) {
            console.error('Update Status Error:', error);
            throw error;
        }
    },
    getAllOrders: async (page, limit, filters = {}) => {
        try {
            const params = {};
            if (page !== undefined && page !== null && page !== '') params.page = page;
            if (limit !== undefined && limit !== null && limit !== '') params.limit = limit;
            const queryParams = new FilterSearchParams({
                ...params,
                ...filters
            }).toString();
            const response = await fetch(`${BASE_URL}/orders/all?${queryParams}`);
            return await response.json();
        } catch (error) {
            console.error('Get All Orders Error:', error);
            throw error;
        }
    },
    deleteOrder: async (id) => {
        try {
            // Admin-only endpoint. The URL contains no '/admin' segment, so the
            // global interceptor does not attach the token — send it explicitly.
            const token = localStorage.getItem('adminToken') || localStorage.getItem('token');
            const response = await fetch(`${BASE_URL}/orders/${id}`, {
                method: 'DELETE',
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            return await response.json();
        } catch (error) {
            console.error('Delete Order Error:', error);
            throw error;
        }
    },
    getById: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/orders/${id}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to fetch order');
            }
            return await response.json();
        } catch (error) {
            console.error('Get Order ID Error:', error);
            throw error;
        }
    },
    getPoolOrders: async (vendorId) => {
        try {
            const response = await fetch(`${BASE_URL}/orders/pool?vendorId=${vendorId}`);
            return await response.json();
        } catch (error) {
            console.error('Pool API Error:', error);
            throw error;
        }
    },
    vendorAcceptOrder: async (orderId, vendorId) => {
        try {
            const response = await fetch(`${BASE_URL}/orders/vendor-accept/${orderId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vendorId })
            });
            return await response.json();
        } catch (error) {
            console.error('Vendor Accept Error:', error);
            throw error;
        }
    },
    verifyPickupOtp: async (id, otp) => {
        try {
            const response = await fetch(`${BASE_URL}/orders/verify-pickup/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ otp })
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Verification failed');
            }
            return await response.json();
        } catch (error) {
            console.error('OTP Verification Error:', error);
            throw error;
        }
    },
    verifyDeliveryOtp: async (id, otp) => {
        try {
            const response = await fetch(`${BASE_URL}/orders/verify-delivery/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ otp })
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Verification failed');
            }
            return await response.json();
        } catch (error) {
            console.error('Delivery OTP Error:', error);
            throw error;
        }
    },
    markOrderReady: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/orders/mark-ready/${id}`, { method: 'POST' });
            return await response.json();
        } catch (error) {
            console.error('Mark Ready API Error:', error);
            throw error;
        }
    },
    verifyHandshake: async (id, phase, otp) => {
        try {
            const response = await fetch(`${BASE_URL}/orders/verify-handshake/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phase, otp })
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Verification failed');
            }
            return await response.json();
        } catch (error) {
            console.error('Handshake Verification Error:', error);
            throw error;
        }
    },
    cancelOrder: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/orders/cancel/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to cancel order');
            }
            return await response.json();
        } catch (error) {
            console.error('Cancel Order Error:', error);
            throw error;
        }
    }
};

export const notificationApi = {
    getNotifications: async (userId, role) => {
        try {
            const response = await fetch(`${BASE_URL}/notifications?userId=${userId}&role=${role}`);
            return await response.json();
        } catch (error) {
            console.error('Get Notifications Error:', error);
            throw error;
        }
    },
    markAsRead: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/notifications/${id}/read`, { method: 'PATCH' });
            return await response.json();
        } catch (error) {
            console.error('Mark Read Error:', error);
            throw error;
        }
    },
    clearAll: async (userId, role) => {
        try {
            const response = await fetch(`${BASE_URL}/notifications/clear?userId=${userId}&role=${role}`, { method: 'DELETE' });
            return await response.json();
        } catch (error) {
            console.error('Clear Notifications Error:', error);
            throw error;
        }
    }
};

export const serviceApi = {
    getAll: async (params = {}) => {
        try {
            const query = new FilterSearchParams(params).toString();
            const url = `${BASE_URL}/services${query ? `?${query}` : ''}`;
            const response = await fetch(url);
            return await response.json();
        } catch (error) {
            console.error('Service API Error:', error);
            throw error;
        }
    },
    create: async (data) => {
        try {
            const response = await fetch(`${BASE_URL}/services`, {
                method: 'POST',
                headers: adminAuthHeaders(),
                body: JSON.stringify(data)
            });
            return await response.json();
        } catch (error) {
            console.error('Create Service Error:', error);
            throw error;
        }
    },
    update: async (id, data) => {
        try {
            const response = await fetch(`${BASE_URL}/services/${id}`, {
                method: 'PUT',
                headers: adminAuthHeaders(),
                body: JSON.stringify(data)
            });
            return await response.json();
        } catch (error) {
            console.error('Update Service Error:', error);
            throw error;
        }
    },
    delete: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/services/${id}`, {
                method: 'DELETE',
                headers: adminAuthHeaders()
            });
            return await response.json();
        } catch (error) {
            console.error('Delete Service Error:', error);
            throw error;
        }
    }
};

export const materialApi = {
    getAll: async () => {
        try {
            const response = await fetch(`${BASE_URL}/materials`);
            return await response.json();
        } catch (error) {
            console.error('Material API Error:', error);
            throw error;
        }
    },
    getLiveCatalog: async (vendorId) => {
        try {
            const response = await fetch(`${BASE_URL}/vendor-master-supplies/live-catalog?vendorId=${vendorId}`);
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || 'Failed to fetch catalog');
            }
            return await response.json();
        } catch (error) {
            console.error('getLiveCatalog Error:', error);
            throw error;
        }
    },
    create: async (data) => {
        try {
            const response = await fetch(`${BASE_URL}/materials`, {
                method: 'POST',
                headers: adminAuthHeaders(),
                body: JSON.stringify(data)
            });
            return await response.json();
        } catch (error) {
            console.error('Create Material Error:', error);
            throw error;
        }
    },
    update: async (id, data) => {
        try {
            const response = await fetch(`${BASE_URL}/materials/${id}`, {
                method: 'PUT',
                headers: adminAuthHeaders(),
                body: JSON.stringify(data)
            });
            return await response.json();
        } catch (error) {
            console.error('Update Material Error:', error);
            throw error;
        }
    },
    delete: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/materials/${id}`, {
                method: 'DELETE',
                headers: adminAuthHeaders()
            });
            return await response.json();
        } catch (error) {
            console.error('Delete Material Error:', error);
            throw error;
        }
    }
};

export const ticketApi = {
    getEvidence: async id => readApiResponse(await fetch(`${BASE_URL}/tickets/admin/${id}/evidence`, { headers: adminAuthHeaders() })),
    getSupportStaff: async () => readApiResponse(await fetch(`${BASE_URL}/tickets/admin/staff`, { headers: adminAuthHeaders() })),
    assignTicket: async (id, data) => readApiResponse(await fetch(`${BASE_URL}/tickets/admin/${id}/assignment`, { method: 'PATCH', headers: adminAuthHeaders(), body: JSON.stringify(data) })),
    createTicket: async (ticketData) => {
        try {
            const response = await fetch(`${BASE_URL}/tickets/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ticketData)
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Create Ticket Error:', error);
            throw error;
        }
    },
    getCustomerTickets: async (customerId) => {
        try {
            const response = await fetch(`${BASE_URL}/tickets/customer/${customerId}`);
            return await readApiResponse(response);
        } catch (error) {
            console.error('Get Customer Tickets Error:', error);
            throw error;
        }
    },
    getTicketByOrder: async (orderId) => {
        try {
            const response = await fetch(`${BASE_URL}/tickets/order/${orderId}`);
            return await readApiResponse(response);
        } catch (error) {
            console.error('Get Ticket By Order Error:', error);
            throw error;
        }
    },
    getTicketDetails: async (ticketId) => {
        try {
            const response = await fetch(`${BASE_URL}/tickets/${ticketId}`);
            return await readApiResponse(response);
        } catch (error) {
            console.error('Get Ticket Details Error:', error);
            throw error;
        }
    },
    sendMessage: async (ticketId, messageData) => {
        try {
            const response = await fetch(`${BASE_URL}/tickets/${ticketId}/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(messageData)
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Send Message Error:', error);
            throw error;
        }
    },
    getAllTickets: async () => {
        try {
            const response = await fetch(`${BASE_URL}/tickets/admin/all`, {
                headers: adminAuthHeaders()
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Get All Tickets Error:', error);
            throw error;
        }
    },
    updateTicketStatus: async (ticketId, status) => {
        try {
            const response = await fetch(`${BASE_URL}/tickets/admin/${ticketId}/status`, {
                method: 'PATCH',
                headers: adminAuthHeaders(),
                body: JSON.stringify({ status })
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Update Ticket Status Error:', error);
            throw error;
        }
    },
    updateTicket: async (ticketId, data) => {
        try {
            const response = await fetch(`${BASE_URL}/tickets/${ticketId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Update Ticket Error:', error);
            throw error;
        }
    },
    deleteTicket: async (ticketId) => {
        try {
            const response = await fetch(`${BASE_URL}/tickets/${ticketId}`, {
                method: 'DELETE'
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Delete Ticket Error:', error);
            throw error;
        }
    }
};

export const faqApi = {
    getAll: async () => {
        try {
            const response = await fetch(`${BASE_URL}/faqs`);
            return await response.json();
        } catch (error) {
            console.error('Get FAQs Error:', error);
            throw error;
        }
    },
    create: async (faqData) => {
        try {
            const response = await fetch(`${BASE_URL}/faqs`, {
                method: 'POST',
                headers: adminAuthHeaders(),
                body: JSON.stringify(faqData)
            });
            return await response.json();
        } catch (error) {
            console.error('Create FAQ Error:', error);
            throw error;
        }
    },
    delete: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/faqs/${id}`, {
                method: 'DELETE',
                headers: adminAuthHeaders()
            });
            return await response.json();
        } catch (error) {
            console.error('Delete FAQ Error:', error);
            throw error;
        }
    },
    update: async (id, faqData) => {
        try {
            const response = await fetch(`${BASE_URL}/faqs/${id}`, {
                method: 'PATCH',
                headers: adminAuthHeaders(),
                body: JSON.stringify(faqData)
            });
            return await response.json();
        } catch (error) {
            console.error('Update FAQ Error:', error);
            throw error;
        }
    },
    reorder: async (orders) => {
        try {
            const response = await fetch(`${BASE_URL}/faqs/reorder`, {
                method: 'POST',
                headers: adminAuthHeaders(),
                body: JSON.stringify({ orders })
            });
            return await response.json();
        } catch (error) {
            console.error('Reorder FAQs Error:', error);
            throw error;
        }
    }
};

export const feedbackApi = {
    submit: async (feedbackData) => {
        try {
            const response = await fetch(`${BASE_URL}/feedback/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(feedbackData)
            });
            return await response.json();
        } catch (error) {
            console.error('Submit Feedback Error:', error);
            throw error;
        }
    },
    getAll: async (filters = {}) => {
        try {
            const params = new FilterSearchParams();
            Object.keys(filters).forEach(key => {
                if (filters[key]) params.append(key, filters[key]);
            });
            const response = await fetch(`${BASE_URL}/feedback/all?${params.toString()}`, {
                headers: adminAuthHeaders()
            });
            return await response.json();
        } catch (error) {
            console.error('Get Feedbacks Error:', error);
            throw error;
        }
    },
    getFilters: async () => {
        try {
            const response = await fetch(`${BASE_URL}/feedback/filters`, {
                headers: adminAuthHeaders()
            });
            return await response.json();
        } catch (error) {
            console.error('Get Feedback Filters Error:', error);
            throw error;
        }
    },
    getByVendorId: async (vendorId) => {
        try {
            const response = await fetch(`${BASE_URL}/feedback/vendor/${vendorId}`);
            return await response.json();
        } catch (error) {
            console.error('Get Vendor Feedbacks Error:', error);
            throw error;
        }
    },
    delete: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/feedback/${id}`, {
                method: 'DELETE',
                headers: adminAuthHeaders()
            });
            return await response.json();
        } catch (error) {
            console.error('Delete Feedback Error:', error);
            throw error;
        }
    }
};

export const mediaApi = {
    bulkUpload: async (files) => {
        try {
            const formData = new FormData();
            files.forEach(file => formData.append('photos', file));
            
            const response = await fetch(`${BASE_URL}/media/bulk-upload`, {
                method: 'POST',
                body: formData
            });
            return await response.json();
        } catch (error) {
            console.error('Media Upload Error:', error);
            throw error;
        }
    },
    upload: async (formData) => {
        try {
            const response = await fetch(`${BASE_URL}/media/upload`, {
                method: 'POST',
                body: formData
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Media Upload Error:', error);
            throw error;
        }
    },
    getHistory: async () => {
        try {
            const response = await fetch(`${BASE_URL}/media/history`);
            if (!response.ok) return [];
            return await response.json();
        } catch (error) {
            console.error('Get Media History Error:', error);
            throw error;
        }
    },
    getLatest: async () => {
        try {
            const response = await fetch(`${BASE_URL}/media/latest?t=${Date.now()}`);
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.error('Get Latest Media Error:', error);
            throw error;
        }
    },
    submitInquiry: async (data) => {
        try {
            const response = await fetch(`${BASE_URL}/media/inquiry`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return await response.json();
        } catch (error) {
            console.error('Submit Inquiry Error:', error);
            throw error;
        }
    },
    getAllInquiries: async (filters = {}) => {
        try {
            const queryParams = new FilterSearchParams();
            Object.entries(filters).forEach(([key, val]) => {
                if (val !== undefined && val !== null && val !== '') {
                    queryParams.append(key, val);
                }
            });
            const url = `${BASE_URL}/media/inquiries${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
            const response = await fetch(url, {
                headers: adminAuthHeaders()
            });
            return await response.json();
        } catch (error) {
            console.error('Get All Inquiries Error:', error);
            throw error;
        }
    },
    getInquiryFilters: async () => {
        try {
            const response = await fetch(`${BASE_URL}/media/inquiries/filters`, {
                headers: adminAuthHeaders()
            });
            return await response.json();
        } catch (error) {
            console.error('Get Inquiry Filters Error:', error);
            throw error;
        }
    },
    deleteInquiry: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/media/inquiries/${id}`, {
                method: 'DELETE',
                headers: adminAuthHeaders()
            });
            return await response.json();
        } catch (error) {
            console.error('Delete Inquiry Error:', error);
            throw error;
        }
    },
    updateInquiryStatus: async (id, status) => {
        try {
            const response = await fetch(`${BASE_URL}/media/inquiries/${id}/status`, {
                method: 'PUT',
                headers: {
                    ...adminAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status })
            });
            return await response.json();
        } catch (error) {
            console.error('Update Inquiry Status Error:', error);
            throw error;
        }
    },
    updateInquiryNotes: async (id, notes) => {
        try {
            const response = await fetch(`${BASE_URL}/media/inquiries/${id}/notes`, {
                method: 'PUT',
                headers: {
                    ...adminAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ notes })
            });
            return await response.json();
        } catch (error) {
            console.error('Update Inquiry Notes Error:', error);
            throw error;
        }
    },
    getMyInquiries: async (email) => {
        try {
            const response = await fetch(`${BASE_URL}/media/inquiries/my?email=${encodeURIComponent(email)}`);
            return await response.json();
        } catch (error) {
            console.error('Get My Ad Inquiries Error:', error);
            throw error;
        }
    }
};

export const partnershipApi = {
    submit: async (data) => {
        try {
            const response = await fetch(`${BASE_URL}/partnerships/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return await response.json();
        } catch (error) {
            console.error('Partnership Submit Error:', error);
            throw error;
        }
    },
    getMyInquiries: async (email) => {
        try {
            const response = await fetch(`${BASE_URL}/partnerships/my-inquiries?email=${encodeURIComponent(email)}`);
            return await response.json();
        } catch (error) {
            console.error('Get My Partnerships Error:', error);
            throw error;
        }
    },
    getAll: async (filters = {}) => {
        try {
            const params = new FilterSearchParams();
            Object.keys(filters).forEach(key => {
                if (filters[key]) params.append(key, filters[key]);
            });
            const response = await fetch(`${BASE_URL}/partnerships/all?${params.toString()}`, {
                headers: adminAuthHeaders()
            });
            return await response.json();
        } catch (error) {
            console.error('Get Partnerships Error:', error);
            throw error;
        }
    },
    getFilters: async () => {
        try {
            const response = await fetch(`${BASE_URL}/partnerships/filters`, {
                headers: adminAuthHeaders()
            });
            return await response.json();
        } catch (error) {
            console.error('Get Partnership Filters Error:', error);
            throw error;
        }
    },
    delete: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/partnerships/${id}`, {
                method: 'DELETE',
                headers: adminAuthHeaders()
            });
            return await response.json();
        } catch (error) {
            console.error('Delete Partnership Inquiry Error:', error);
            throw error;
        }
    },
    updateStatus: async (id, status) => {
        try {
            const response = await fetch(`${BASE_URL}/partnerships/${id}/status`, {
                method: 'PUT',
                headers: {
                    ...adminAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status })
            });
            return await response.json();
        } catch (error) {
            console.error('Update Partnership Status Error:', error);
            throw error;
        }
    },
    updateNotes: async (id, notes) => {
        try {
            const response = await fetch(`${BASE_URL}/partnerships/${id}/notes`, {
                method: 'PUT',
                headers: {
                    ...adminAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ notes })
            });
            return await response.json();
        } catch (error) {
            console.error('Update Partnership Notes Error:', error);
            throw error;
        }
    }
};

export const laborApi = {
    add: async (data) => {
        try {
            const response = await fetch(`${BASE_URL}/labor/add`, {
                method: 'POST',
                headers: adminAuthHeaders(),
                body: JSON.stringify(data)
            });
            return await response.json();
        } catch (error) {
            console.error('Add Labor Error:', error);
            throw error;
        }
    },
    getAll: async () => {
        try {
            const response = await fetch(`${BASE_URL}/labor/all`);
            return await response.json();
        } catch (error) {
            console.error('Get Labor Error:', error);
            throw error;
        }
    },
    delete: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/labor/${id}`, {
                method: 'DELETE',
                headers: adminAuthHeaders()
            });
            return await response.json();
        } catch (error) {
            console.error('Delete Labor Error:', error);
            throw error;
        }
    },
    createRequisition: async (data) => {
        try {
            const response = await fetch(`${BASE_URL}/labor/place-request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return await response.json();
        } catch (error) {
            console.error('Create Requisition Error:', error);
            throw error;
        }
    },
    getAllRequisitions: async () => {
        try {
            const response = await fetch(`${BASE_URL}/labor/active-requests`, {
                headers: adminAuthHeaders()
            });
            return await response.json();
        } catch (error) {
            console.error('Get Requests Error:', error);
            throw error;
        }
    },
    assignRequisition: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/labor/place-request/${id}/assign`, {
                method: 'PATCH',
                headers: adminAuthHeaders()
            });
            return await response.json();
        } catch (error) {
            console.error('Assign Requisition Error:', error);
            throw error;
        }
    }
};

export const promotionApi = {
    create: async (data) => {
        try {
            const response = await fetch(`${BASE_URL}/promotions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Failed to create promotion');
            return result;
        } catch (error) {
            console.error('Create Promo Error:', error);
            throw error;
        }
    },
    update: async (id, data) => {
        try {
            const response = await fetch(`${BASE_URL}/promotions/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Failed to update promotion');
            return result;
        } catch (error) {
            console.error('Update Promo Error:', error);
            throw error;
        }
    },
    autogenerateCode: async (vendorId) => {
        try {
            const response = await fetch(`${BASE_URL}/promotions/autogenerate-code?vendorId=${vendorId}`);
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Failed to generate code');
            return result;
        } catch (error) {
            console.error('Autogenerate Code Error:', error);
            throw error;
        }
    },
    getVendorPromos: async (vendorId) => {
        try {
            const response = await fetch(`${BASE_URL}/promotions/vendor?vendorId=${vendorId}`);
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Failed to fetch vendor promotions');
            return result;
        } catch (error) {
            console.error('Get Vendor Promos Error:', error);
            throw error;
        }
    },
    getApplicablePromos: async (vendorId) => {
        try {
            const response = await fetch(`${BASE_URL}/promotions/applicable?vendorId=${vendorId}`);
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Failed to fetch applicable promotions');
            return result;
        } catch (error) {
            console.error('Get Applicable Promos Error:', error);
            throw error;
        }
    },
    validate: async (data) => {
        try {
            const response = await fetch(`${BASE_URL}/promotions/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return await response.json();
        } catch (error) {
            console.error('Validate Promo Error:', error);
            throw error;
        }
    },
    toggleStatus: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/promotions/${id}/toggle`, { method: 'PATCH' });
            return await response.json();
        } catch (error) {
            console.error('Toggle Promo Error:', error);
            throw error;
        }
    },
    delete: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/promotions/${id}`, { method: 'DELETE' });
            return await response.json();
        } catch (error) {
            console.error('Delete Promo Error:', error);
            throw error;
        }
    },
    adminList: async () => {
        try {
            const response = await fetch(`${BASE_URL}/promotions/admin/list`);
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Failed to fetch admin promotions');
            return result;
        } catch (error) {
            console.error('Admin Get Promos Error:', error);
            throw error;
        }
    },
    adminApprove: async (id) => {
        try {
            const response = await fetch(`${BASE_URL}/promotions/admin/${id}/approve`, { method: 'PATCH' });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Failed to approve promotion');
            return result;
        } catch (error) {
            console.error('Admin Approve Promo Error:', error);
            throw error;
        }
    },
    adminReject: async (id, rejection_reason) => {
        try {
            const response = await fetch(`${BASE_URL}/promotions/admin/${id}/reject`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rejection_reason })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Failed to reject promotion');
            return result;
        } catch (error) {
            console.error('Admin Reject Promo Error:', error);
            throw error;
        }
    }
};

export const jobApi = {
    create: async (data) => {
        const token = localStorage.getItem('token');
        const response = await fetch(`${BASE_URL}/jobs/vendor-create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify(data)
        });
        const resJson = await response.json();
        if (!response.ok) throw new Error(resJson.message || 'Failed to post job');
        return resJson;
    },
    adminCreate: async (data) => {
        const response = await fetch(`${BASE_URL}/jobs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
            body: JSON.stringify(data)
        });
        const resJson = await response.json();
        if (!response.ok) throw new Error(resJson.message || 'Failed to post job');
        return resJson;
    },
    getVendorJobs: async (vendorId) => {
        const response = await fetch(`${BASE_URL}/jobs/vendor?vendorId=${vendorId}`);
        return await response.json();
    },
    getActiveJobs: async () => {
        const response = await fetch(`${BASE_URL}/jobs/active`);
        return await response.json();
    },
    getAppliedJobIds: async (applicantId) => {
        const response = await fetch(`${BASE_URL}/jobs/applicant/${applicantId}/applied-job-ids`);
        return await response.json();
    },
    getApplicantApplications: async (applicantId) => {
        const response = await fetch(`${BASE_URL}/jobs/applicant/${applicantId}/applications`);
        return await response.json();
    },
    getVendorApplications: async (vendorId) => {
        const response = await fetch(`${BASE_URL}/jobs/vendor/${vendorId}/applications`);
        return await response.json();
    },
    apply: async (data) => {
        const isFormData = data instanceof FormData;
        const response = await fetch(`${BASE_URL}/jobs/apply`, {
            method: 'POST',
            headers: isFormData ? {} : { 'Content-Type': 'application/json' },
            body: isFormData ? data : JSON.stringify(data)
        });
        const resJson = await response.json();
        if (!response.ok) {
            throw new Error(resJson.message || 'Application failed');
        }
        return resJson;
    },
    getAdminAll: async () => {
        const response = await fetch(`${BASE_URL}/jobs/admin/all`, {
            headers: adminAuthHeaders()
        });
        return await response.json();
    },
    getAdminApplications: async (creatorRole) => {
        const response = await fetch(`${BASE_URL}/jobs/admin/applications${creatorRole ? `?creatorRole=${creatorRole}` : ''}`, {
            headers: adminAuthHeaders()
        });
        return await response.json();
    },
    delete: async (id) => {
        const response = await fetch(`${BASE_URL}/jobs/${id}`, {
            method: 'DELETE',
            headers: adminAuthHeaders()
        });
        return await response.json();
    },
    update: async (id, data) => {
        const response = await fetch(`${BASE_URL}/jobs/${id}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                ...adminAuthHeaders()
            },
            body: JSON.stringify(data)
        });
        return await response.json();
    },
    updateStatus: async (id, status) => {
        const response = await fetch(`${BASE_URL}/jobs/${id}/status`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                ...adminAuthHeaders()
            },
            body: JSON.stringify({ status })
        });
        return await response.json();
    },
    updateApplicationStatus: async (id, status) => {
        const response = await fetch(`${BASE_URL}/jobs/applications/${id}/status`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                ...adminAuthHeaders()
            },
            body: JSON.stringify({ status })
        });
        return await response.json();
    },
    updateApplicationNotes: async (id, notes) => {
        const response = await fetch(`${BASE_URL}/jobs/applications/${id}/notes`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                ...adminAuthHeaders()
            },
            body: JSON.stringify({ notes })
        });
        return await response.json();
    },
    deleteApplication: async (id) => {
        const response = await fetch(`${BASE_URL}/jobs/applications/${id}`, {
            method: 'DELETE',
            headers: adminAuthHeaders()
        });
        return await response.json();
    },
    getRoleTemplates: async (targetRole) => {
        const url = targetRole
            ? `${BASE_URL}/jobs/role-templates?targetRole=${targetRole}`
            : `${BASE_URL}/jobs/role-templates`;
        const response = await fetch(url);
        return await response.json();
    },
    createRoleTemplate: async (data) => {
        const response = await fetch(`${BASE_URL}/jobs/role-templates`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...adminAuthHeaders()
            },
            body: JSON.stringify(data)
        });
        return await response.json();
    },
    updateRoleTemplate: async (id, data) => {
        const response = await fetch(`${BASE_URL}/jobs/role-templates/${id}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                ...adminAuthHeaders()
            },
            body: JSON.stringify(data)
        });
        return await response.json();
    },
    deleteRoleTemplate: async (id) => {
        const response = await fetch(`${BASE_URL}/jobs/role-templates/${id}`, {
            method: 'DELETE',
            headers: adminAuthHeaders()
        });
        return await response.json();
    }
};


export const masterServiceApi = {
    getAll: async (params = {}) => {
        const query = new FilterSearchParams(params).toString();
        const res = await fetch(`${BASE_URL}/master-services${query ? `?${query}` : ''}`);
        return res.json();
    },
    getPricingPreview: (areaId, categoryId) => 
        fetch(`${BASE_URL}/master-services/preview?area_id=${areaId}&category_id=${encodeURIComponent(categoryId)}`)
        .then(res => res.json()),
    getVendorRates: async (id) => {
        const res = await fetch(`${BASE_URL}/master-services/${id}/vendor-rates`);
        return res.json();
    },
    create: async (data) => {
        const res = await fetch(`${BASE_URL}/master-services`, {
            method: 'POST',
            headers: adminAuthHeaders(),
            body: JSON.stringify(data)
        });
        return res.json();
    },
    update: async (id, data) => {
        const res = await fetch(`${BASE_URL}/master-services/${id}`, {
            method: 'PATCH',
            headers: adminAuthHeaders(),
            body: JSON.stringify(data)
        });
        return res.json();
    },
    delete: async (id) => {
        const res = await fetch(`${BASE_URL}/master-services/${id}`, {
            method: 'DELETE',
            headers: adminAuthHeaders()
        });
        return res.json();
    }
};

export const logisticsApi = {
    requestHandshake: async (orderId, phase) => {
        try {
            const response = await fetch(`${BASE_URL}/logistics/request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId, phase })
            });
            return await response.json();
        } catch (error) {
            console.error('Request Handshake Error:', error);
            throw error;
        }
    },
    verifyHandshake: async (orderId, phase, otp) => {
        try {
            const response = await fetch(`${BASE_URL}/logistics/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId, phase, otp })
            });
            return await response.json();
        } catch (error) {
            console.error('Verify Handshake Error:', error);
            throw error;
        }
    }
};

export const legalApi = {
    getAll: async () => {
        const response = await fetch(`${BASE_URL}/legal/all`);
        return await response.json();
    },
    getByType: async (type) => {
        const response = await fetch(`${BASE_URL}/legal/${type}`);
        return await response.json();
    },
    update: async (type, data) => {
        const response = await fetch(`${BASE_URL}/legal/${type}`, {
            method: 'POST',
            headers: adminAuthHeaders(),
            body: JSON.stringify(data)
        });
        return await response.json();
    }
};

export const geofenceApi = {
    checkAvailability: async (lat, lng) => {
        try {
            const response = await fetch(`${BASE_URL}/geofence/check-availability?lat=${lat}&lng=${lng}`, {
                signal: AbortSignal.timeout(3500)
            });
            return await response.json();
        } catch (error) {
            console.error('Geofence API Error:', error);
            return { available: false };
        }
    }
};

export const areaOverrideApi = {
    save: async (data) => {
        const res = await fetch(`${BASE_URL}/area-overrides`, {
            method: 'POST',
            headers: adminAuthHeaders(),
            body: JSON.stringify(data)
        });
        return res.json();
    },
    getByArea: async (areaId) => {
        const res = await fetch(`${BASE_URL}/area-overrides/area/${areaId}`);
        return res.json();
    }
};

export const vendorPaymentApi = {
    getEarningsSummary: async (vendorId) => {
        try {
            const response = await fetch(`${BASE_URL}/auth/vendor-earnings?vendorId=${vendorId}`);
            return await response.json();
        } catch (error) {
            console.error('Get Vendor Earnings Error:', error);
            throw error;
        }
    },
    getPayoutHistory: async (vendorId) => {
        try {
            const response = await fetch(`${BASE_URL}/auth/vendor-payouts/${vendorId}`);
            return await response.json();
        } catch (error) {
            console.error('Get Payout History Error:', error);
            throw error;
        }
    }
};

export const dashboardApi = {
    getAnalytics: async (filters = {}, options = {}) => {
        try {
            const queryParams = new FilterSearchParams();
            Object.entries(filters).forEach(([key, val]) => {
                if (val !== undefined && val !== null && val !== '') {
                    queryParams.append(key, val);
                }
            });
            const url = `${BASE_URL}/admin/dashboard-analytics${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
            const response = await fetch(url, {
                signal: options.signal,
                headers: adminAuthHeaders()
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Get Dashboard Analytics Error:', error);
            throw error;
        }
    },
    getFilters: async () => {
        try {
            const response = await fetch(`${BASE_URL}/admin/dashboard-analytics/filters`, {
                headers: adminAuthHeaders()
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Get Dashboard Filters Error:', error);
            throw error;
        }
    }
};

export const referralApi = {
    create: async (data) => {
        try {
            const token = localStorage.getItem('token') || localStorage.getItem('adminToken');
            const response = await fetch(`${BASE_URL}/referrals`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data)
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Create Referral Error:', error);
            throw error;
        }
    },
    getAll: async () => {
        try {
            const token = localStorage.getItem('adminToken') || localStorage.getItem('token');
            const response = await fetch(`${BASE_URL}/admin/referrals`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            return await readApiResponse(response);
        } catch (error) {
            console.error('Get Referrals Error:', error);
            throw error;
        }
    }
};
