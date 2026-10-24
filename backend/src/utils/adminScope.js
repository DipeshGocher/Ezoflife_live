import ServiceArea from '../models/ServiceArea.js';

export const isScopedAdmin = req => !!req.account?.geofenceRestrictions?.length;
export const accountPoint = account => {
    if (account.warehouseLocation) return account.warehouseLocation;
    if (account.role === 'Customer') return account.addresses?.find(address => address.isDefault)?.location || account.addresses?.[0]?.location || account.location;
    return account.location || account.shopDetails?.location || account.supplierDetails?.location;
};
const inside = (point, ring) => {
    if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lng) || !ring?.length) return false;
    let result = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
        if ((yi > point.lat) !== (yj > point.lat) && point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi) result = !result;
    }
    return result;
};
export const canAccessAccount = async (req, account) => {
    if (!isScopedAdmin(req)) return true;
    if (account.role === 'Admin') return false;
    req.accountScopeAreas ||= ServiceArea.find({ isActive: true }).lean().exec();
    const area = (await req.accountScopeAreas).find(area => inside(accountPoint(account), area.boundary?.coordinates?.[0]));
    return !!area && req.account.geofenceRestrictions.includes(area.areaName);
};
export const filterAccountsByScope = async (req, accounts) => {
    if (!isScopedAdmin(req)) return accounts;
    const allowed = await Promise.all(accounts.map(account => canAccessAccount(req, account)));
    return accounts.filter((account, index) => allowed[index]);
};
