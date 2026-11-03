const STATE_CODES = Object.freeze({
    'jammu and kashmir': '01', 'himachal pradesh': '02', punjab: '03', chandigarh: '04',
    uttarakhand: '05', haryana: '06', delhi: '07', rajasthan: '08', 'uttar pradesh': '09',
    bihar: '10', sikkim: '11', 'arunachal pradesh': '12', nagaland: '13', manipur: '14',
    mizoram: '15', tripura: '16', meghalaya: '17', assam: '18', 'west bengal': '19',
    jharkhand: '20', odisha: '21', chhattisgarh: '22', 'madhya pradesh': '23', gujarat: '24',
    'dadra and nagar haveli and daman and diu': '26', maharashtra: '27',
    'andhra pradesh': '37', karnataka: '29', goa: '30', lakshadweep: '31', kerala: '32',
    'tamil nadu': '33', puducherry: '34', 'andaman and nicobar islands': '35', telangana: '36',
    ladakh: '38'
});

export const stateCodeFromName = value => STATE_CODES[String(value || '').trim().toLowerCase()] || '';
export const stateCodeFromGstin = gstin => /^[0-9]{2}/.test(String(gstin || '')) ? String(gstin).slice(0, 2) : '';

/**
 * Infer state code from a 6-digit Indian PIN code prefix.
 */
export const stateCodeFromPincode = (pincode) => {
    const pin = String(pincode || '').replace(/\D/g, '');
    if (pin.length !== 6) return '';
    const prefix2 = parseInt(pin.slice(0, 2), 10);
    const prefix3 = parseInt(pin.slice(0, 3), 10);

    // Delhi
    if (prefix2 === 11) return '07';
    // Haryana
    if (prefix2 >= 12 && prefix2 <= 13) return '06';
    // Punjab
    if (prefix2 >= 14 && prefix2 <= 15) return '03';
    // Chandigarh
    if (prefix3 === 160) return '04';
    // Himachal Pradesh
    if (prefix2 === 17) return '02';
    // Jammu & Kashmir / Ladakh
    if (prefix2 >= 18 && prefix2 <= 19) return prefix3 >= 194 ? '38' : '01';
    // Uttar Pradesh / Uttarakhand
    if (prefix2 >= 20 && prefix2 <= 28) {
        if (prefix3 >= 244 && prefix3 <= 249) return '05'; // Uttarakhand
        if (prefix2 === 26) return '05';
        return '09'; // Uttar Pradesh
    }
    // Rajasthan
    if (prefix2 >= 30 && prefix2 <= 34) return '08';
    // Gujarat / Daman & Diu / Dadra & Nagar Haveli
    if (prefix2 >= 36 && prefix2 <= 39) {
        if (prefix3 === 396) return '26';
        return '24';
    }
    // Maharashtra / Goa
    if (prefix2 >= 40 && prefix2 <= 44) {
        if (prefix3 === 403) return '30'; // Goa
        return '27'; // Maharashtra
    }
    // Madhya Pradesh / Chhattisgarh
    if (prefix2 >= 45 && prefix2 <= 49) {
        if (prefix2 === 49) return '22'; // Chhattisgarh
        return '23'; // Madhya Pradesh
    }
    // Andhra Pradesh / Telangana
    if (prefix2 >= 50 && prefix2 <= 53) {
        if (prefix2 === 50) return '36'; // Telangana
        return '37'; // Andhra Pradesh
    }
    // Karnataka
    if (prefix2 >= 56 && prefix2 <= 59) return '29';
    // Tamil Nadu / Puducherry
    if (prefix2 >= 60 && prefix2 <= 64) {
        if (prefix3 === 605) return '34'; // Puducherry
        return '33'; // Tamil Nadu
    }
    // Kerala / Lakshadweep
    if (prefix2 >= 67 && prefix2 <= 69) {
        if (prefix3 === 682) return '31'; // Lakshadweep
        return '32'; // Kerala
    }
    // West Bengal / Andaman & Nicobar / Sikkim
    if (prefix2 >= 70 && prefix2 <= 74) {
        if (prefix3 === 737) return '11'; // Sikkim
        if (prefix3 === 744) return '35'; // Andaman
        return '19'; // West Bengal
    }
    // Odisha
    if (prefix2 >= 75 && prefix2 <= 77) return '21';
    // Assam
    if (prefix2 === 78) return '18';
    // North East (NE)
    if (prefix2 === 79) {
        if (prefix3 >= 790 && prefix3 <= 792) return '12'; // Arunachal
        if (prefix3 >= 793 && prefix3 <= 794) return '17'; // Meghalaya
        if (prefix3 >= 795 && prefix3 <= 796) return '14'; // Manipur
        if (prefix3 === 796) return '15'; // Mizoram
        if (prefix3 >= 797 && prefix3 <= 798) return '13'; // Nagaland
        if (prefix3 === 799) return '16'; // Tripura
    }
    // Bihar / Jharkhand
    if (prefix2 >= 80 && prefix2 <= 85) {
        if (prefix2 >= 81 && prefix2 <= 83) return '20'; // Jharkhand
        return '10'; // Bihar
    }

    return '';
};

/**
 * Infer state code by matching known state names inside an address string.
 */
export const stateCodeFromAddressString = (addressStr) => {
    if (!addressStr || typeof addressStr !== 'string') return '';
    const lower = addressStr.toLowerCase();

    // Check for explicit occurrences of state names (longer names first to prevent partial collision)
    const sortedNames = Object.keys(STATE_CODES).sort((a, b) => b.length - a.length);
    for (const name of sortedNames) {
        const regex = new RegExp(`\\b${name}\\b`, 'i');
        if (regex.test(lower)) {
            return STATE_CODES[name];
        }
    }

    // Common abbreviations
    if (/\b(m\.?p\.?|mp)\b/i.test(lower)) return '23'; // Madhya Pradesh
    if (/\b(u\.?p\.?|up)\b/i.test(lower)) return '09'; // Uttar Pradesh
    if (/\b(mh|mah)\b/i.test(lower)) return '27'; // Maharashtra
    if (/\b(dl|del)\b/i.test(lower)) return '07'; // Delhi
    if (/\b(rj|raj)\b/i.test(lower)) return '08'; // Rajasthan
    if (/\b(gj|guj)\b/i.test(lower)) return '24'; // Gujarat
    if (/\b(ka|kar)\b/i.test(lower)) return '29'; // Karnataka
    if (/\b(tn)\b/i.test(lower)) return '33'; // Tamil Nadu

    return '';
};

export const resolvePartyAddress = party => {
    const saved = (party?.addresses || []).find(address => address.isDefault) || party?.addresses?.[0] || {};
    let state = party?.shopDetails?.state || party?.supplierDetails?.state || saved.state || '';
    let pincode = party?.shopDetails?.pincode || party?.supplierDetails?.pincode || saved.pincode || '';
    const city = party?.shopDetails?.city || party?.supplierDetails?.city || saved.city || '';
    const address = party?.businessAddress || party?.shopDetails?.address || party?.address || saved.address || '';

    // Smart fallback 1: Extract 6-digit pincode from address string if pincode is missing
    if (!pincode && address) {
        const pinMatch = address.match(/\b([1-9][0-9]{5})\b/);
        if (pinMatch) pincode = pinMatch[1];
    }

    // Smart Resolution of State Code:
    // 1. Direct state name
    let stateCode = stateCodeFromName(state);

    // 2. Fallback to pincode
    if (!stateCode && pincode) {
        stateCode = stateCodeFromPincode(pincode);
    }

    // 3. Fallback to address string parsing
    if (!stateCode && address) {
        stateCode = stateCodeFromAddressString(address);
    }

    return { address, city, state, stateCode, pincode };
};
