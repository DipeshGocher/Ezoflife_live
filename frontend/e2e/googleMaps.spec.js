import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Read the Vite env from disk — `import.meta.env` is not available in page scope. */
const hasMapsKey = (() => {
    if (process.env.VITE_GOOGLE_MAPS_API_KEY) return true;
    const envPath = fileURLToPath(new URL('../.env', import.meta.url));
    if (!existsSync(envPath)) return false;
    const line = readFileSync(envPath, 'utf8')
        .split('\n')
        .find(l => l.trim().startsWith('VITE_GOOGLE_MAPS_API_KEY='));
    return Boolean(line && line.split('=').slice(1).join('=').trim().replace(/["']/g, ''));
})();

/**
 * Google Maps regression suite.
 *
 * Two bugs previously broke maps across the app:
 *
 *   1. Nine useJsApiLoader/useLoadScript call sites passed mismatched options
 *      (different library sets, missing id/version, inline array literals).
 *      The loader threw "Loader must not be called again with different options"
 *      and every map on the page died.
 *
 *   2. locationService called the maps.googleapis.com REST endpoints from the
 *      browser. Those send no CORS headers, so geocoding always failed.
 *
 * These tests assert both stay fixed. They need a real VITE_GOOGLE_MAPS_API_KEY;
 * without one they skip rather than fail, so CI without secrets stays green.
 */

const LOADER_CONFLICT = /Loader must not be called again with different options/i;

const collectConsole = (page) => {
    const errors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', e => errors.push(e.message));
    return errors;
};

test.skip(!hasMapsKey, 'VITE_GOOGLE_MAPS_API_KEY not configured');

/**
 * These are the only specs that depend on a live third-party service. Under the
 * full suite the Google SDK occasionally loads slowly enough to trip the wait —
 * a different test each run, all passing in isolation. Retry rather than let
 * Google's latency turn the suite red; a genuine break still fails all attempts.
 */
test.describe.configure({ retries: 2 });

test('no loader-conflict error on a maps-bearing route', async ({ page }) => {
    const errors = collectConsole(page);

    await page.goto('/user/auth');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const conflicts = errors.filter(e => LOADER_CONFLICT.test(e));
    expect(conflicts, `loader conflict returned:\n${conflicts.join('\n')}`).toHaveLength(0);
});

test('the Maps SDK actually loads into the page', async ({ page }) => {
    await page.goto('/user/auth');
    await page.waitForLoadState('networkidle');

    const loaded = await page.waitForFunction(
        () => Boolean(window.google?.maps),
        null,
        { timeout: 30_000 }
    ).then(() => true).catch(() => false);

    expect(loaded, 'window.google.maps never became available').toBe(true);
});

/**
 * `window.google.maps` exists before its libraries are attached, so waiting on
 * the namespace alone races the load ("Geocoder is not a constructor").
 * Wait for what the tests actually use.
 */
const waitForMapsLibraries = (page) =>
    page.waitForFunction(
        () => typeof window.google?.maps?.Geocoder === 'function'
            && Boolean(window.google.maps.places)
            && Boolean(window.google.maps.geometry),
        null,
        { timeout: 30_000 }
    );

test('the required Maps libraries are present', async ({ page }) => {
    await page.goto('/user/auth');
    await waitForMapsLibraries(page).catch(() => {}); // assertions below name what is missing

    const available = await page.evaluate(() => ({
        geocoder: typeof window.google.maps.Geocoder === 'function',
        places: Boolean(window.google.maps.places),
        geometry: Boolean(window.google.maps.geometry)
    }));

    expect(available.geocoder, 'Geocoder missing').toBe(true);
    expect(available.places, 'places library missing').toBe(true);
    expect(available.geometry, 'geometry library missing').toBe(true);
});

test('reverse geocoding works in-browser (no CORS failure)', async ({ page }) => {
    await page.goto('/user/auth');
    await waitForMapsLibraries(page);

    // Exercise the same SDK path locationService now uses.
    const result = await page.evaluate(async () => {
        const geocoder = new window.google.maps.Geocoder();
        return new Promise(resolve => {
            geocoder.geocode({ location: { lat: 22.7196, lng: 75.8577 } }, (results, status) => {
                resolve({ status, address: results?.[0]?.formatted_address || null });
            });
        });
    });

    expect(result.status, `geocoder returned ${result.status}`).toBe('OK');
    expect(result.address).toBeTruthy();
});

test('no CORS errors against maps.googleapis.com REST endpoints', async ({ page }) => {
    const errors = collectConsole(page);
    const restCalls = [];

    page.on('request', r => {
        const u = r.url();
        // The browser must never call the server-side REST endpoints directly.
        if (/maps\.googleapis\.com\/maps\/api\/(geocode|place)\//.test(u)) restCalls.push(u);
    });

    await page.goto('/user/auth');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    expect(restCalls,
        `browser called CORS-blocked REST endpoints:\n${restCalls.join('\n')}`
    ).toHaveLength(0);

    const corsErrors = errors.filter(e => /CORS|Access-Control-Allow-Origin/i.test(e));
    expect(corsErrors, corsErrors.join('\n')).toHaveLength(0);
});

test('the loader is instantiated only once across navigations', async ({ page }) => {
    const errors = collectConsole(page);

    // Visiting several maps-bearing routes is what used to trigger the conflict.
    for (const route of ['/user/auth', '/vendor', '/user/auth']) {
        await page.goto(route);
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
    }

    const conflicts = errors.filter(e => LOADER_CONFLICT.test(e));
    expect(conflicts, conflicts.join('\n')).toHaveLength(0);
});
