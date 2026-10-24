import { waitForGoogleMaps } from './googleMaps';

/**
 * Location & geocoding helpers.
 *
 * These use the Google Maps JavaScript SDK (Geocoder / Places services) rather
 * than the maps.googleapis.com REST endpoints. Those REST endpoints send no
 * CORS headers, so calling them from the browser always fails — they are
 * server-to-server APIs. The SDK equivalents below run in-page and work.
 *
 * Return shapes are unchanged from the previous implementation, since a number
 * of screens destructure these results directly.
 */

/** Pull a named component out of a Geocoder / Places address_components array. */
const findComponent = (components, types) => {
    if (!Array.isArray(components)) return '';
    const match = components.find(c => types.some(t => c.types.includes(t)));
    return match ? match.long_name : '';
};

/** Map a Geocoder result into the shape the app expects. */
const toAddressData = (result, lat, lng) => {
    const components = result.address_components;
    return {
        fullAddress: result.formatted_address,
        city: findComponent(components, ['locality', 'administrative_area_level_2']),
        area: findComponent(components, ['sublocality_level_1', 'neighborhood']),
        state: findComponent(components, ['administrative_area_level_1']),
        pincode: findComponent(components, ['postal_code']),
        subLocal: findComponent(components, ['sublocality_level_2', 'route']),
        lat,
        lng
    };
};

/** Promise wrapper around the callback-based Geocoder with tight 1.5s timeout. */
const geocode = async (request) => {
    const maps = await waitForGoogleMaps(1200);
    const geocoder = new maps.Geocoder();

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Geocoder timeout')), 1800);
        geocoder.geocode(request, (results, status) => {
            clearTimeout(timeout);
            if (status === 'OK' && results && results.length > 0) {
                resolve(results);
            } else if (status === 'ZERO_RESULTS') {
                reject(new Error('No address found for these coordinates'));
            } else {
                reject(new Error(`Geocoding failed (${status})`));
            }
        });
    });
};

/**
 * Run a lookup so that any failure, including a synchronous throw (e.g.
 * AbortSignal.timeout missing on Safari < 16), resolves to null instead of rejecting.
 */
const safeLookup = (fn) => Promise.resolve().then(fn).catch(() => null);

/** Fast parallel IP-based geolocation fallback. Never rejects. */
const getFallbackCoordinatesFromIP = async () => {
    const fetchers = [
        safeLookup(() => fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(2000) })
            .then(res => res.ok ? res.json() : null)
            .then(data => data && data.latitude != null && data.longitude != null && Number.isFinite(Number(data.latitude)) && Number.isFinite(Number(data.longitude)) ? {
                lat: Number(data.latitude),
                lng: Number(data.longitude),
                city: data.city || '',
                area: data.region || '',
                state: data.region || '',
                pincode: data.postal || '',
                fullAddress: [data.city, data.region, data.country_name].filter(Boolean).join(', '),
                isFromIP: true
            } : null)),
        safeLookup(() => fetch('https://freeipapi.com/api/json', { signal: AbortSignal.timeout(2000) })
            .then(res => res.ok ? res.json() : null)
            .then(data => data && data.latitude != null && data.longitude != null && Number.isFinite(Number(data.latitude)) && Number.isFinite(Number(data.longitude)) ? {
                lat: Number(data.latitude),
                lng: Number(data.longitude),
                city: data.cityName || '',
                area: data.regionName || '',
                state: data.regionName || '',
                pincode: data.zipCode || '',
                fullAddress: [data.cityName, data.regionName, data.countryName].filter(Boolean).join(', '),
                isFromIP: true
            } : null))
    ];

    try {
        const results = await Promise.all(fetchers);
        return results.find(Boolean) || null;
    } catch {
        return null;
    }
};

export const locationService = {
    /**
     * Get current coordinates ultra fast by racing cached/browser GPS and IP lookup in parallel.
     */
    getCurrentCoordinates: async () => {
        // 1. Launch IP lookup in parallel immediately
        const ipPromise = getFallbackCoordinatesFromIP();

        // 2. Launch browser geolocation with 5-minute cache and 1.8s timeout.
        //    Stays null when unsupported; an eagerly-created Promise.reject here
        //    was replaced but never handled, logging an unhandled rejection on every call.
        let browserGeoPromise = null;
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
            browserGeoPromise = new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        resolve({
                            lat: position.coords.latitude,
                            lng: position.coords.longitude,
                            accuracy: position.coords.accuracy,
                            isGPS: true
                        });
                    },
                    (error) => {
                        reject(error);
                    },
                    {
                        enableHighAccuracy: false,
                        timeout: 1800,
                        maximumAge: 300000 // 5 minutes cached position
                    }
                );
            });
        }

        // Give browser GPS up to 1.8s; if it resolves, prefer it!
        try {
            const gpsCoords = browserGeoPromise ? await browserGeoPromise : null;
            if (gpsCoords) return gpsCoords;
        } catch {
            // Browser GPS timed out or failed, continue to IP
        }

        // If GPS wasn't fast enough, use the IP lookup
        try {
            const ipCoords = await ipPromise;
            if (ipCoords) return ipCoords;
        } catch {
            // IP failed
        }

        // Safe fallback coordinates (Delhi NCR)
        return {
            lat: 28.6139,
            lng: 77.2090,
            city: 'New Delhi',
            area: 'Central Delhi',
            state: 'Delhi',
            pincode: '110001',
            fullAddress: 'Connaught Place, New Delhi, Delhi, India',
            isDefault: true
        };
    },

    /**
     * Reverse geocode lat/lng to a structured address with multiple fast fallbacks.
     */
    reverseGeocode: async (lat, lng, fallbackData = null) => {
        // If fallbackData already has structured address, return it immediately without network delay
        if (fallbackData?.fullAddress && fallbackData?.city) {
            return {
                fullAddress: fallbackData.fullAddress,
                city: fallbackData.city || '',
                area: fallbackData.area || '',
                state: fallbackData.state || '',
                pincode: fallbackData.pincode || '',
                subLocal: '',
                lat,
                lng
            };
        }

        // 1. Try Google Maps Geocoder with quick timeout
        try {
            const results = await geocode({ location: { lat, lng } });
            if (results && results[0]) {
                return toAddressData(results[0], lat, lng);
            }
        } catch {
            // Google maps geocoding timed out or unavailable
        }

        // 2. Try OpenStreetMap Nominatim with tight 1.5s timeout
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(1500)
            });
            if (res.ok) {
                const data = await res.json();
                const addr = data.address || {};
                return {
                    fullAddress: data.display_name || 'Current Location',
                    city: addr.city || addr.town || addr.village || addr.county || '',
                    area: addr.suburb || addr.neighbourhood || addr.residential || '',
                    state: addr.state || '',
                    pincode: addr.postcode || '',
                    subLocal: addr.road || '',
                    lat,
                    lng
                };
            }
        } catch {
            // OSM failed
        }

        // 3. Fall back to coordinates string
        return {
            fullAddress: `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
            city: '',
            area: '',
            state: '',
            pincode: '',
            subLocal: '',
            lat,
            lng
        };
    },

    /**
     * Geocode an address string to lat/lng.
     */
    geocodeAddress: async (address) => {
        try {
            const results = await geocode({ address });
            const location = results[0].geometry.location;
            return {
                lat: location.lat(),
                lng: location.lng()
            };
        } catch (error) {
            console.error('Geocoding Error:', error);
            throw error;
        }
    },

    /**
     * Autocomplete predictions for a partial address query.
     */
    searchLocations: async (query) => {
        try {
            const maps = await waitForGoogleMaps();
            const service = new maps.places.AutocompleteService();

            return await new Promise((resolve) => {
                service.getPlacePredictions(
                    { input: query, componentRestrictions: { country: 'in' } },
                    (predictions, status) => {
                        if (status === maps.places.PlacesServiceStatus.OK && predictions) {
                            resolve(predictions);
                        } else {
                            resolve([]);
                        }
                    }
                );
            });
        } catch (error) {
            console.error('Places Autocomplete Error:', error);
            return [];
        }
    },

    /**
     * Get place details (lat/lng + formatted address) from a Place ID.
     */
    getPlaceDetails: async (placeId) => {
        try {
            const maps = await waitForGoogleMaps();
            // PlacesService needs a DOM node or map instance to attach to.
            const service = new maps.places.PlacesService(document.createElement('div'));

            return await new Promise((resolve, reject) => {
                service.getDetails(
                    { placeId, fields: ['geometry', 'formatted_address'] },
                    (details, status) => {
                        if (status === maps.places.PlacesServiceStatus.OK && details?.geometry) {
                            resolve({
                                lat: details.geometry.location.lat(),
                                lng: details.geometry.location.lng(),
                                address: details.formatted_address
                            });
                        } else {
                            reject(new Error('Place details not found'));
                        }
                    }
                );
            });
        } catch (error) {
            console.error('Place Details Error:', error);
            throw error;
        }
    }
};
