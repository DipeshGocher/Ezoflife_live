/**
 * Canonical Google Maps loader configuration.
 *
 * `@react-google-maps/api` loads the Maps SDK exactly once per page. Every
 * useJsApiLoader / useLoadScript call must therefore receive the SAME options
 * object — same id, same version, same libraries. If any call site differs,
 * the loader throws:
 *
 *     "Loader must not be called again with different options"
 *
 * ...and every map on the page silently fails to render.
 *
 * Two rules for call sites:
 *   1. Always spread GOOGLE_MAPS_LOADER_OPTIONS — never hand-roll the options.
 *   2. Never pass an inline array for `libraries`. A fresh array literal is a new
 *      reference on every render, which the loader reads as changed options.
 */
export const GOOGLE_MAPS_LIBRARIES = ['drawing', 'places', 'geometry'];

export const GOOGLE_MAPS_LOADER_OPTIONS = {
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    version: '3.64',
    libraries: GOOGLE_MAPS_LIBRARIES
};

/**
 * True once the SDK is usable, not merely present. `window.google.maps` is
 * created by the bootstrap before the Geocoder and the `places` library are
 * attached, so checking the namespace alone races the load and callers hit
 * "Geocoder is not a constructor".
 */
const isMapsReady = () =>
    typeof window.google?.maps?.Geocoder === 'function' && Boolean(window.google.maps.places);

/**
 * Resolves once the Maps SDK is ready on `window`.
 *
 * Geocoding and Places helpers can be called from effects that run before the
 * loader has finished, so they wait here rather than throwing on `window.google`
 * being undefined or only partially loaded.
 */
export const waitForGoogleMaps = (timeoutMs = 10000) => {
    if (isMapsReady()) return Promise.resolve(window.google.maps);

    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const poll = setInterval(() => {
            if (isMapsReady()) {
                clearInterval(poll);
                resolve(window.google.maps);
            } else if (Date.now() - startedAt > timeoutMs) {
                clearInterval(poll);
                reject(new Error('Google Maps SDK did not load. Check VITE_GOOGLE_MAPS_API_KEY.'));
            }
        }, 100);
    });
};
