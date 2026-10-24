const dateValue = value => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value) : null;
export const formatOrderDate = value => dateValue(value)?.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) || 'Not recorded';
export const formatOrderStatus = value => String(value || 'Unknown').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
export const formatOrderMoney = value => typeof value === 'number' && Number.isFinite(value)
    ? `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Not recorded';
const entity = value => value && typeof value === 'object' && !Array.isArray(value) ? value : null;

export function orderDetailView(raw) {
    const customer = entity(raw.customer);
    const vendor = entity(raw.vendor);
    const customerSnapshot = raw.customerSnapshot || {};
    const vendorSnapshot = raw.vendorSnapshot || {};
    return {
        ...raw,
        id: raw.orderId || raw._id,
        total: raw.totalAmount,
        user: {
            id: customer?._id,
            name: customer?.displayName || customerSnapshot.displayName || 'Customer details unavailable',
            phone: customer?.phone || customerSnapshot.phone || 'Not recorded',
            address: raw.dropAddress || customer?.address || 'Not recorded'
        },
        vendor: {
            ...vendor,
            id: vendor?._id,
            name: vendor?.displayName || vendorSnapshot.displayName || 'Not recorded',
            shop: vendor?.shopDetails?.name || vendorSnapshot.shopName || vendor?.displayName || vendorSnapshot.displayName || 'Not assigned',
            address: vendor?.shopDetails?.address || vendor?.address || 'Not recorded'
        },
        items: (raw.items || []).map(item => ({
            ...item,
            qty: !Number.isFinite(item.quantity) ? 'Not recorded' : `${item.quantity} ${item.unit || ''}`.trim(),
            lineTotal: typeof item.price === 'number' && typeof item.quantity === 'number' ? item.price * item.quantity : null
        })),
        // Show only persisted events; never invent completed steps or times.
        timeline: (raw.statusHistory || []).map(step => ({ ...step, status: formatOrderStatus(step.status), time: formatOrderDate(step.timestamp) }))
    };
}

export function orderInvoiceView(raw) {
    const detail = orderDetailView(raw);
    return {
        ...raw,
        id: detail.id,
        orderNo: detail.id,
        invoiceNo: raw.invoiceNo || 'Not issued',
        date: dateValue(raw.createdAt)?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) || 'Not recorded',
        // Stored transaction amounts only, including for legacy records.
        total: raw.totalAmount,
        priceBreakdown: raw.priceBreakdown || {},
        user: { ...(entity(raw.customer) || raw.customerSnapshot || {}), name: detail.user.name, displayName: detail.user.name },
        vendor: { ...(entity(raw.vendor) || raw.vendorSnapshot || {}), id: detail.vendor.id || 'Not recorded' },
        items: raw.gstSnapshot || raw.invoices?.customerInvoice ? (raw.items || []) : detail.items.map(item => ({ ...item, quantity: undefined, unitPrice: item.price, price: item.lineTotal ?? 0 }))
    };
}
