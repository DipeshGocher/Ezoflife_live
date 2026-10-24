/**
 * Splash ad session rules.
 *
 * The splash shows once per app per browser session. sessionStorage is kept
 * across reloads but cleared when the tab/app is closed (on mobile: removed
 * from recents), which is exactly "once until the app is closed".
 */

const KEY_PREFIX = 'splash_seen_';

/** Which app a URL belongs to; null for pages that never show a splash (admin, legal). */
export const appForPath = (pathname = '/') => {
  if (pathname === '/' || pathname.startsWith('/user')) return 'customer';
  if (pathname.startsWith('/vendor')) return 'vendor';
  if (pathname.startsWith('/supplier')) return 'supplier';
  return null;
};

const store = () => {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null; // storage blocked (privacy mode): treat every load as a new session
  }
};

export const hasSeenSplash = (app) => {
  try {
    return store()?.getItem(KEY_PREFIX + app) === '1';
  } catch {
    return false;
  }
};

export const markSplashSeen = (app) => {
  try {
    store()?.setItem(KEY_PREFIX + app, '1');
  } catch {
    /* ignore */
  }
};

/** Clamp the admin-configured duration to something sane, in milliseconds. */
export const splashDurationMs = (seconds) => {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return 3000;
  return Math.min(30, Math.max(1, s)) * 1000;
};
