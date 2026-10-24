// Accept legacy scalar parameters and JSON arrays from checkbox filters.
export const filterList = value => {
    let parsed = value;
    if (typeof value === 'string' && value.startsWith('[')) {
        try { parsed = JSON.parse(value); } catch { parsed = value; }
    }
    const values = Array.isArray(parsed) ? parsed : [parsed];
    return values.filter(item => ['string', 'number', 'boolean'].includes(typeof item) && item !== '');
};

export const filterCondition = (value, transform = item => item) => {
    const values = filterList(value).map(transform);
    return values.length === 1 ? values[0] : { $in: values };
};

const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const textFilter = value => {
    const values = filterList(value);
    // Preserve substring matching for existing free-text searches. Checkbox
    // arrays use exact matches, including labels containing regex punctuation.
    if (typeof value === 'string' && !value.startsWith('[')) return { $regex: value.trim(), $options: 'i' };
    return { $in: values.map(item => new RegExp(`^${escapeRegex(String(item).trim())}$`, 'i')) };
};

export const matchesFilter = (selection, value) => {
    const values = filterList(selection);
    return !values.length || values.some(item => String(item).trim().toLowerCase() === String(value ?? '').trim().toLowerCase());
};

export const dateFilter = (value, field = 'createdAt') => ({
    $or: filterList(value).map(item => {
        const start = new Date(item);
        const end = new Date(item);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        return { [field]: { $gte: start, $lte: end } };
    })
});

export const priceFilter = value => ({
    $or: filterList(value).map(item => {
        const text = String(item);
        if (text.includes('-')) {
            const [min, max] = text.split('-').map(Number);
            return { wholesaleRate: { $gte: min, $lte: max } };
        }
        if (text.endsWith('+')) return { wholesaleRate: { $gte: Number(text.slice(0, -1)) } };
        return { wholesaleRate: Number(text) };
    })
});
