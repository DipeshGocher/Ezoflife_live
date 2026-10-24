import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('../../lib/api', () => ({
  UPLOADS_URL: 'http://api.test/uploads/',
  adApi: { getActiveSplash: vi.fn() }
}));

import { adApi } from '../../lib/api';
import SplashAdGate from './SplashAdGate';
import { appForPath, hasSeenSplash, markSplashSeen, splashDurationMs } from '../lib/splashSession';

const IMAGE_AD = { _id: 'a1', title: 'Monsoon Offer', notes: 'Flat 20% off on dry cleaning till Sunday', type: 'image', url: '/uploads/ads/ad-1.png', durationSeconds: 4 };

const setPath = (path) => window.history.replaceState({}, '', path);
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

// StrictMode like the real app (main.jsx): effects run twice in development,
// and the first request is aborted by cleanup. That must not dismiss the splash.
const renderGate = () => render(
  <React.StrictMode>
    <SplashAdGate>
      <p>Login page</p>
    </SplashAdGate>
  </React.StrictMode>
);

describe('splash session rules', () => {
  beforeEach(() => sessionStorage.clear());

  it('maps URLs to apps; admin and legal pages never get a splash', () => {
    expect(appForPath('/')).toBe('customer');
    expect(appForPath('/user/auth')).toBe('customer');
    expect(appForPath('/vendor/dashboard')).toBe('vendor');
    expect(appForPath('/supplier/auth')).toBe('supplier');
    expect(appForPath('/admin/dashboard')).toBe(null);
    expect(appForPath('/privacy')).toBe(null);
  });

  it('remembers per app for the session only', () => {
    expect(hasSeenSplash('customer')).toBe(false);
    markSplashSeen('customer');
    expect(hasSeenSplash('customer')).toBe(true);
    expect(hasSeenSplash('vendor')).toBe(false);
  });

  it('clamps the configured duration to 1–30 seconds', () => {
    expect(splashDurationMs(5)).toBe(5000);
    expect(splashDurationMs(0)).toBe(3000);
    expect(splashDurationMs(99)).toBe(30000);
    expect(splashDurationMs(undefined)).toBe(3000);
  });
});

describe('SplashAdGate', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    adApi.getActiveSplash.mockReset();
    setPath('/user/auth');
  });
  afterEach(() => vi.useRealTimers());

  it('shows the live splash before the login page, for the configured duration', async () => {
    adApi.getActiveSplash.mockResolvedValue(IMAGE_AD);
    renderGate();

    // Covers the app immediately, even before the server answers
    expect(screen.getByTestId('splash-ad')).toBeInTheDocument();
    await flush();
    expect(adApi.getActiveSplash).toHaveBeenCalledWith('customer', expect.anything());

    const img = screen.getByAltText('Monsoon Offer');
    expect(img.getAttribute('src')).toBe('http://api.test/uploads/ads/ad-1.png');
    fireEvent.load(img);
    expect(screen.getByTestId('splash-ad').dataset.phase).toBe('showing');

    // The campaign title and notes are shown as a caption
    const caption = screen.getByTestId('splash-caption');
    expect(caption).toHaveTextContent('Monsoon Offer');
    expect(caption).toHaveTextContent('Flat 20% off on dry cleaning till Sunday');

    act(() => vi.advanceTimersByTime(3900));
    expect(screen.queryByTestId('splash-ad')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(400)); // 4s + fade
    expect(screen.queryByTestId('splash-ad')).not.toBeInTheDocument();
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('shows the title alone when there are no notes', async () => {
    adApi.getActiveSplash.mockResolvedValue({ ...IMAGE_AD, notes: '' });
    renderGate();
    await flush();
    fireEvent.load(screen.getByAltText('Monsoon Offer'));
    const caption = screen.getByTestId('splash-caption');
    expect(caption).toHaveTextContent('Monsoon Offer');
    expect(caption.querySelector('p')).toBeNull();
  });

  it('shows only once per session', async () => {
    adApi.getActiveSplash.mockResolvedValue(IMAGE_AD);
    const first = renderGate();
    await flush();
    fireEvent.load(screen.getByAltText('Monsoon Offer'));
    first.unmount();

    // Reload in the same session
    const callsBefore = adApi.getActiveSplash.mock.calls.length;
    renderGate();
    expect(screen.queryByTestId('splash-ad')).not.toBeInTheDocument();
    expect(adApi.getActiveSplash.mock.calls.length).toBe(callsBefore);
    const callsAfterFirstOpen = adApi.getActiveSplash.mock.calls.length;
    expect(callsAfterFirstOpen).toBeGreaterThan(0);
  });

  it('shows nothing when no splash is live', async () => {
    adApi.getActiveSplash.mockResolvedValue(null);
    renderGate();
    await flush();
    expect(screen.queryByTestId('splash-ad')).not.toBeInTheDocument();
    expect(hasSeenSplash('customer')).toBe(false);
  });

  it('gets out of the way if the image fails to load', async () => {
    adApi.getActiveSplash.mockResolvedValue(IMAGE_AD);
    renderGate();
    await flush();
    fireEvent.error(screen.getByAltText('Monsoon Offer'));
    expect(screen.queryByTestId('splash-ad')).not.toBeInTheDocument();
  });

  it('dismisses after the fetch timeout if the server never answers', async () => {
    adApi.getActiveSplash.mockImplementation((_app, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    renderGate();
    await flush();
    expect(screen.getByTestId('splash-ad')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(2600); await Promise.resolve(); });
    expect(screen.queryByTestId('splash-ad')).not.toBeInTheDocument();
  });

  it('gets out of the way if the server is unreachable', async () => {
    adApi.getActiveSplash.mockRejectedValue(new Error('offline'));
    renderGate();
    await flush();
    expect(screen.queryByTestId('splash-ad')).not.toBeInTheDocument();
  });

  it('never shows on admin pages', () => {
    setPath('/admin/dashboard');
    renderGate();
    expect(screen.queryByTestId('splash-ad')).not.toBeInTheDocument();
    expect(adApi.getActiveSplash).not.toHaveBeenCalled();
  });

  it('asks for the vendor splash in the vendor app', async () => {
    setPath('/vendor/auth');
    adApi.getActiveSplash.mockResolvedValue(null);
    renderGate();
    await flush();
    expect(adApi.getActiveSplash).toHaveBeenCalledWith('vendor', expect.anything());
  });
});
