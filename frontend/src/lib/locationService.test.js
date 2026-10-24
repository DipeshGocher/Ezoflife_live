import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { locationService } from './locationService';

/**
 * These previously called maps.googleapis.com REST endpoints from the browser,
 * which always fail on CORS. They now use the JS SDK. The key regression guard
 * is: Google lookups use the SDK; network/GPS failures retain the existing
 * OSM, IP and explicit default-location fallbacks.
 */

const mockGeocoder = (results, status = 'OK') => ({
    geocode: vi.fn((_req, cb) => cb(results, status))
});

const installMaps = (overrides = {}) => {
    window.google = {
        maps: {
            Geocoder: vi.fn(function () { return overrides.geocoder ?? mockGeocoder([]); }),
            places: {
                AutocompleteService: vi.fn(function () {
                    return overrides.autocomplete ?? { getPlacePredictions: (_r, cb) => cb([], 'OK') };
                }),
                PlacesService: vi.fn(function () {
                    return overrides.places ?? { getDetails: (_r, cb) => cb(null, 'NOT_FOUND') };
                }),
                PlacesServiceStatus: { OK: 'OK' }
            }
        }
    };
};

const GEOCODE_RESULT = [{
    formatted_address: '12 Test Road, Indore, Madhya Pradesh 452001, India',
    address_components: [
        { long_name: 'Indore', types: ['locality'] },
        { long_name: 'Vijay Nagar', types: ['sublocality_level_1'] },
        { long_name: 'Madhya Pradesh', types: ['administrative_area_level_1'] },
        { long_name: '452001', types: ['postal_code'] },
        { long_name: 'Test Road', types: ['route'] }
    ],
    geometry: { location: { lat: () => 22.7196, lng: () => 75.8577 } }
}];

let fetchSpy;

/** Answer fetch by URL substring; anything unmatched fails like a network error. */
const routeFetch = (routes) => {
    fetchSpy.mockImplementation(async (url) => {
        const key = Object.keys(routes).find(k => String(url).includes(k));
        if (!key) throw new Error(`network error: ${url}`);
        return { ok: true, json: async () => routes[key] };
    });
};

const noGoogleRestCalls = () =>
    fetchSpy.mock.calls.every(([url]) => !String(url).includes('googleapis.com'));

beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
        throw new Error('locationService must not call fetch');
    });
});

afterEach(() => {
    delete window.google;
    vi.restoreAllMocks();
});

describe('reverseGeocode', () => {
    test('returns a structured address from the SDK', async () => {
        installMaps({ geocoder: mockGeocoder(GEOCODE_RESULT) });

        const r = await locationService.reverseGeocode(22.7196, 75.8577);

        expect(r.fullAddress).toContain('Indore');
        expect(r.city).toBe('Indore');
        expect(r.area).toBe('Vijay Nagar');
        expect(r.state).toBe('Madhya Pradesh');
        expect(r.pincode).toBe('452001');
        expect(r.lat).toBe(22.7196);
        expect(r.lng).toBe(75.8577);
    });

    test('never issues an HTTP request (the old CORS bug)', async () => {
        installMaps({ geocoder: mockGeocoder(GEOCODE_RESULT) });
        await locationService.reverseGeocode(22.7196, 75.8577);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test('falls back to OpenStreetMap when the geocoder finds nothing', async () => {
        installMaps({ geocoder: mockGeocoder([], 'ZERO_RESULTS') });
        routeFetch({
            'nominatim.openstreetmap.org': {
                display_name: 'Vijay Nagar, Indore, Madhya Pradesh, 452010, India',
                address: { city: 'Indore', suburb: 'Vijay Nagar', state: 'Madhya Pradesh', postcode: '452010', road: 'AB Road' }
            }
        });

        const r = await locationService.reverseGeocode(22.75, 75.89);

        expect(r).toEqual({
            fullAddress: 'Vijay Nagar, Indore, Madhya Pradesh, 452010, India',
            city: 'Indore',
            area: 'Vijay Nagar',
            state: 'Madhya Pradesh',
            pincode: '452010',
            subLocal: 'AB Road',
            lat: 22.75,
            lng: 75.89
        });
        expect(noGoogleRestCalls()).toBe(true);
    });

    test('falls back to a coordinates label when the geocoder and OpenStreetMap both fail', async () => {
        installMaps({ geocoder: mockGeocoder(null, 'REQUEST_DENIED') });
        // fetch throws by default (beforeEach), so the OpenStreetMap lookup fails too

        const r = await locationService.reverseGeocode(1, 1);

        expect(r.fullAddress).toBe('Location (1.0000, 1.0000)');
        expect(r.city).toBe('');
        expect(r.lat).toBe(1);
        expect(r.lng).toBe(1);
    });

    test('uses provided fallback data without any lookup', async () => {
        installMaps({ geocoder: mockGeocoder(GEOCODE_RESULT) });
        const r = await locationService.reverseGeocode(5, 6, { fullAddress: 'Known Place', city: 'Bhopal', pincode: '462001' });
        expect(r.fullAddress).toBe('Known Place');
        expect(r.city).toBe('Bhopal');
        expect(window.google.maps.Geocoder).not.toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test('tolerates a result with missing address components', async () => {
        installMaps({
            geocoder: mockGeocoder([{ formatted_address: 'Somewhere', address_components: undefined }])
        });
        const r = await locationService.reverseGeocode(1, 2);
        expect(r.fullAddress).toBe('Somewhere');
        expect(r.city).toBe('');
        expect(r.pincode).toBe('');
    });
});

describe('geocodeAddress', () => {
    test('returns coordinates for an address string', async () => {
        installMaps({ geocoder: mockGeocoder(GEOCODE_RESULT) });
        const r = await locationService.geocodeAddress('Indore');
        expect(r).toEqual({ lat: 22.7196, lng: 75.8577 });
    });

    test('never issues an HTTP request', async () => {
        installMaps({ geocoder: mockGeocoder(GEOCODE_RESULT) });
        await locationService.geocodeAddress('Indore');
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test('rejects on a failed lookup', async () => {
        installMaps({ geocoder: mockGeocoder([], 'ZERO_RESULTS') });
        await expect(locationService.geocodeAddress('nowhere at all')).rejects.toThrow();
    });
});

describe('searchLocations', () => {
    test('returns predictions from the Places SDK', async () => {
        installMaps({
            autocomplete: {
                getPlacePredictions: (_r, cb) => cb([{ description: 'Indore, MP' }], 'OK')
            }
        });
        const r = await locationService.searchLocations('indo');
        expect(r).toHaveLength(1);
        expect(r[0].description).toContain('Indore');
    });

    test('restricts predictions to India', async () => {
        const getPlacePredictions = vi.fn((_r, cb) => cb([], 'OK'));
        installMaps({ autocomplete: { getPlacePredictions } });

        await locationService.searchLocations('test');

        expect(getPlacePredictions).toHaveBeenCalledWith(
            expect.objectContaining({ componentRestrictions: { country: 'in' } }),
            expect.any(Function)
        );
    });

    test('returns an empty array rather than throwing on failure', async () => {
        installMaps({ autocomplete: { getPlacePredictions: (_r, cb) => cb(null, 'OVER_QUERY_LIMIT') } });
        await expect(locationService.searchLocations('x')).resolves.toEqual([]);
    });
});

describe('getCurrentCoordinates', () => {
    const IP_RESPONSE = { latitude: 22.72, longitude: 75.86, city: 'Indore', region: 'Madhya Pradesh', postal: '452001', country_name: 'India' };
    let savedGeo;

    beforeEach(() => { savedGeo = globalThis.navigator.geolocation; });
    afterEach(() => { globalThis.navigator.geolocation = savedGeo; });

    test('resolves with the browser position', async () => {
        globalThis.navigator.geolocation = {
            getCurrentPosition: (ok) => ok({ coords: { latitude: 1, longitude: 2, accuracy: 5 } })
        };
        await expect(locationService.getCurrentCoordinates())
            .resolves.toEqual({ lat: 1, lng: 2, accuracy: 5, isGPS: true });
    });

    test('falls back to IP location when the browser denies permission', async () => {
        globalThis.navigator.geolocation = {
            getCurrentPosition: (_ok, err) => err(new Error('User denied Geolocation'))
        };
        routeFetch({ 'ipapi.co': IP_RESPONSE });

        const r = await locationService.getCurrentCoordinates();

        expect(r).toMatchObject({ lat: 22.72, lng: 75.86, city: 'Indore', pincode: '452001', isFromIP: true });
    });

    test('falls back to IP location when geolocation is unavailable', async () => {
        delete globalThis.navigator.geolocation;
        routeFetch({ 'freeipapi.com': { latitude: 19.07, longitude: 72.87, cityName: 'Mumbai', regionName: 'Maharashtra', zipCode: '400001', countryName: 'India' } });

        const r = await locationService.getCurrentCoordinates();

        expect(r).toMatchObject({ lat: 19.07, lng: 72.87, city: 'Mumbai', isFromIP: true });
    });

    test('returns the default location when GPS and IP lookups all fail', async () => {
        globalThis.navigator.geolocation = {
            getCurrentPosition: (_ok, err) => err(new Error('User denied Geolocation'))
        };
        // fetch throws by default (beforeEach)

        const r = await locationService.getCurrentCoordinates();

        expect(r).toMatchObject({ lat: 28.6139, lng: 77.2090, city: 'New Delhi', isDefault: true });
    });
});


test('IP fallback accepts legitimate zero coordinates and remains marked as approximate', async () => {
    const saved = navigator.geolocation; delete navigator.geolocation;
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ latitude: 0, longitude: 77, city: 'Approximate' }) });
    await expect(locationService.getCurrentCoordinates()).resolves.toMatchObject({ lat: 0, lng: 77, isFromIP: true });
    navigator.geolocation = saved;
});

test('reverse geocode uses structured OSM results when the SDK is unavailable', async () => {
    installMaps({ geocoder: mockGeocoder(null, 'REQUEST_DENIED') });
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ display_name: 'Fallback Street', address: { city: 'Fallback City', postcode: '123456' } }) });
    await expect(locationService.reverseGeocode(1, 2)).resolves.toMatchObject({ fullAddress: 'Fallback Street', city: 'Fallback City', pincode: '123456' });
    expect(fetchSpy.mock.calls.every(([url]) => !url.includes('googleapis.com'))).toBe(true);
});
