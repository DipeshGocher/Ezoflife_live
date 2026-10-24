import React, { useEffect, useRef, useState } from 'react';
import { adApi, UPLOADS_URL } from '../../lib/api';
import { appForPath, hasSeenSplash, markSplashSeen, splashDurationMs } from '../lib/splashSession';

const FETCH_TIMEOUT_MS = 2500; // never hold the app hostage to a slow network
const MEDIA_TIMEOUT_MS = 5000; // give up if the image/video can't load

const mediaUrl = (url) => {
  if (!url) return '';
  if (/^https?:\/\//.test(url)) return url;
  if (url.startsWith('/uploads/')) return UPLOADS_URL.replace(/\/uploads\/$/, '') + url;
  return `${UPLOADS_URL}${url}`;
};

/**
 * Full-screen splash ad shown when an app (customer / vendor / supplier) is
 * first opened in a session, before the login page or any other content.
 *
 * The page underneath renders and loads its data while the splash is up, so
 * the splash doubles as the app's loader. Configured in Admin → Splash Ads
 * (image or video, duration in seconds, target app). With no live splash,
 * nothing is shown.
 */
export default function SplashAdGate({ children }) {
  const [app] = useState(() => (typeof window !== 'undefined' ? appForPath(window.location.pathname) : null));
  // 'checking' covers the screen while we ask the server; 'showing' plays the ad; 'done' removes it.
  const [phase, setPhase] = useState(() => (app && !hasSeenSplash(app) ? 'checking' : 'done'));
  const [ad, setAd] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const timers = useRef([]);

  const finish = React.useCallback(() => {
    setLeaving(true);
    timers.current.push(setTimeout(() => setPhase('done'), 250));
  }, []);

  // 1. Ask for the live splash for this app
  useEffect(() => {
    if (phase !== 'checking') return undefined;
    const controller = new AbortController();
    // `cancelled` = this effect was cleaned up (unmount, or React StrictMode's
    // double-invoke in development). That abort must NOT dismiss the splash;
    // only a genuine failure or the timeout below does.
    let cancelled = false;
    const giveUp = setTimeout(() => {
      controller.abort();
      if (!cancelled) setPhase('done');
    }, FETCH_TIMEOUT_MS);

    adApi.getActiveSplash(app, { signal: controller.signal })
      .then((live) => {
        if (cancelled) return;
        if (live?.url) setAd(live);
        else setPhase('done');
      })
      .catch(() => { if (!cancelled) setPhase('done'); })
      .finally(() => clearTimeout(giveUp));

    return () => { cancelled = true; clearTimeout(giveUp); controller.abort(); };
  }, [phase, app]);

  // 2. If the media never loads, don't keep the user waiting
  useEffect(() => {
    if (!ad || phase !== 'checking') return undefined;
    const t = setTimeout(() => setPhase('done'), MEDIA_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [ad, phase]);

  // 3. Once visible, keep it up for the configured duration
  useEffect(() => {
    if (phase !== 'showing') return undefined;
    markSplashSeen(app);
    const t = setTimeout(finish, splashDurationMs(ad?.durationSeconds));
    timers.current.push(t);
    return () => clearTimeout(t);
  }, [phase, app, ad, finish]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const onMediaReady = () => setPhase(p => (p === 'checking' ? 'showing' : p));
  const onMediaError = () => setPhase('done');

  const duration = splashDurationMs(ad?.durationSeconds);

  return (
    <>
      {children}
      {phase !== 'done' && (
        <div
          data-testid="splash-ad"
          data-phase={phase}
          role="dialog"
          aria-modal="true"
          aria-label={ad?.title ? `Advertisement: ${ad.title}` : 'Loading'}
          className={`fixed inset-0 bg-white flex items-center justify-center overflow-hidden transition-opacity duration-200 ${leaving ? 'opacity-0' : 'opacity-100'}`}
          style={{ zIndex: 2147483000 }}
        >
          {ad && (ad.type === 'video' ? (
            <video
              src={mediaUrl(ad.url)}
              autoPlay
              muted
              loop
              playsInline
              onCanPlay={onMediaReady}
              onError={onMediaError}
              className={`w-full h-full object-contain bg-black ${phase === 'showing' ? 'opacity-100' : 'opacity-0'}`}
            />
          ) : (
            <>
              {/* Blurred fill so images that aren't 9:16 are never cropped */}
              <img
                src={mediaUrl(ad.url)}
                alt=""
                aria-hidden="true"
                className={`absolute inset-0 w-full h-full object-cover scale-110 blur-2xl brightness-90 ${phase === 'showing' ? 'opacity-100' : 'opacity-0'}`}
              />
              <img
                src={mediaUrl(ad.url)}
                alt={ad.title || 'Advertisement'}
                onLoad={onMediaReady}
                onError={onMediaError}
                className={`relative w-full h-full object-contain ${phase === 'showing' ? 'opacity-100' : 'opacity-0'}`}
              />
            </>
          ))}

          {phase === 'showing' && (
            <>
              <span className="absolute top-4 left-4 px-2.5 py-1 rounded-full bg-black/50 text-white text-[9px] font-black uppercase tracking-widest">
                Ad
              </span>
              {/* Campaign title and notes from Admin → Splash Ads */}
              {(ad?.title || ad?.notes) && (
                <div
                  data-testid="splash-caption"
                  className="absolute inset-x-0 bottom-0 px-6 pt-24 pb-8 bg-gradient-to-t from-black/85 via-black/50 to-transparent text-white"
                  style={{ paddingBottom: 'max(2rem, calc(env(safe-area-inset-bottom) + 1.25rem))' }}
                >
                  <div className="max-w-xl mx-auto">
                    {ad.title && (
                      <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight [text-wrap:balance]">
                        {ad.title}
                      </h2>
                    )}
                    {ad.notes && (
                      <p className="mt-2 text-sm sm:text-base font-medium text-white/85 leading-relaxed whitespace-pre-line line-clamp-4">
                        {ad.notes}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {/* Progress for the configured duration */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                <div
                  className="h-full bg-white/85 splash-progress"
                  style={{ animation: `splash-progress ${duration}ms linear forwards` }}
                />
              </div>
            </>
          )}
          <style>{'@keyframes splash-progress { from { width: 0% } to { width: 100% } }'}</style>
        </div>
      )}
    </>
  );
}
