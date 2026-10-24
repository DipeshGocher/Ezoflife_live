import { afterEach, expect, it, vi } from 'vitest';
import { waitForGoogleMaps } from './googleMaps';
afterEach(() => { delete window.google; vi.useRealTimers(); });
it('waits for the Geocoder constructor rather than an incomplete SDK namespace', async () => {
    vi.useFakeTimers(); window.google = { maps: {} };
    let ready = false; const promise = waitForGoogleMaps(1000).then(maps => { ready = true; return maps; });
    await vi.advanceTimersByTimeAsync(300); expect(ready).toBe(false);
    window.google.maps.Geocoder = function Geocoder() {}; window.google.maps.places = {};
    await vi.advanceTimersByTimeAsync(100); expect(await promise).toBe(window.google.maps);
});

describe('waitForGoogleMaps', () => {
    beforeEach(() => { delete window.google; });
    afterEach(() => { delete window.google; vi.useRealTimers(); });

    test('resolves immediately when the SDK is already present', async () => {
        window.google = { maps: { Geocoder: class {}, places: {} } };
        await expect(waitForGoogleMaps()).resolves.toBe(window.google.maps);
    });

    test('resolves once the SDK appears later', async () => {
        const pending = waitForGoogleMaps(5000);
        const maps = { Geocoder: class {}, places: {} };
        setTimeout(() => { window.google = { maps }; }, 150);
        await expect(pending).resolves.toBe(maps);
    });

    test('waits while the namespace exists but libraries are still loading', async () => {
        // The bootstrap creates google.maps before Geocoder/places are attached.
        window.google = { maps: {} };
        const pending = waitForGoogleMaps(5000);
        let settled = false;
        pending.then(() => { settled = true; });

        await new Promise(r => setTimeout(r, 250));
        expect(settled).toBe(false);

        window.google.maps.Geocoder = class {};
        window.google.maps.places = {};
        await expect(pending).resolves.toBe(window.google.maps);
    });

    test('times out if the libraries never finish loading', async () => {
        window.google = { maps: {} };
        await expect(waitForGoogleMaps(300)).rejects.toThrow(/did not load/);
    });

    test('rejects with an actionable message when the SDK never loads', async () => {
        await expect(waitForGoogleMaps(300)).rejects.toThrow(/VITE_GOOGLE_MAPS_API_KEY/);
    });

    test('does not hang forever — the timeout is honoured', async () => {
        const started = Date.now();
        await waitForGoogleMaps(250).catch(() => {});
        expect(Date.now() - started).toBeLessThan(3000);
    });
});
