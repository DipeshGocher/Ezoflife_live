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

beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network unavailable'));
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

    test('returns coordinates when SDK and fallback lookup find nothing', async () => {
        installMaps({ geocoder: mockGeocoder([], 'ZERO_RESULTS') });
        await expect(locationService.reverseGeocode(0, 0)).resolves.toMatchObject({ lat: 0, lng: 0, fullAddress: 'Location (0.0000, 0.0000)' });
    });

    test('retains coordinate fallback when the SDK is denied', async () => {
        installMaps({ geocoder: mockGeocoder(null, 'REQUEST_DENIED') });
        await expect(locationService.reverseGeocode(1, 1)).resolves.toMatchObject({ lat: 1, lng: 1, city: '' });
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
    test('resolves with the browser position', async () => {
        global.navigator.geolocation = {
            getCurrentPosition: (ok) => ok({ coords: { latitude: 1, longitude: 2, accuracy: 5 } })
        };
        await expect(locationService.getCurrentCoordinates())
            .resolves.toEqual({ lat: 1, lng: 2, accuracy: 5, isGPS: true });
    });

    test('uses the marked default when GPS is denied and IP is unavailable', async () => {
        global.navigator.geolocation = {
            getCurrentPosition: (_ok, err) => err(new Error('User denied Geolocation'))
        };
        await expect(locationService.getCurrentCoordinates()).resolves.toMatchObject({ isDefault: true, city: 'New Delhi' });
    });

    test('uses the marked default when geolocation and IP are unavailable', async () => {
        const saved = global.navigator.geolocation;
        delete global.navigator.geolocation;
        await expect(locationService.getCurrentCoordinates()).resolves.toMatchObject({ isDefault: true, city: 'New Delhi' });
        global.navigator.geolocation = saved;
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
