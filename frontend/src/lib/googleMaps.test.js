import { afterEach, expect, it, vi } from 'vitest';
import { waitForGoogleMaps } from './googleMaps';
afterEach(() => { delete window.google; vi.useRealTimers(); });
it('waits for the Geocoder constructor rather than an incomplete SDK namespace', async () => {
    vi.useFakeTimers(); window.google = { maps: {} };
    let ready = false; const promise = waitForGoogleMaps(1000).then(maps => { ready = true; return maps; });
    await vi.advanceTimersByTimeAsync(300); expect(ready).toBe(false);
    window.google.maps.Geocoder = function Geocoder() {};
    await vi.advanceTimersByTimeAsync(100); expect(await promise).toBe(window.google.maps);
});
it('rejects an incomplete SDK after the configured timeout', async () => {
    vi.useFakeTimers(); window.google = { maps: {} };
    const assertion = expect(waitForGoogleMaps(200)).rejects.toThrow('Google Maps SDK did not load');
    await vi.advanceTimersByTimeAsync(400); await assertion;
});
