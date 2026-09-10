import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Network } from '@capacitor/network';
import { supabase } from '../../lib/supabase';
import { haversineMeters } from '../../lib/geo';

const QUEUE_KEY = 'logiflow.gps.queue.v1';
const MIN_INTERVAL_MS = 15_000;   // time trigger
const MIN_DISTANCE_M  = 20;       // distance trigger

export interface QueuedFix {
  lat: number;
  lng: number;
  accuracy: number | null;
  ts: number;
}

interface Options {
  enabled: boolean;
}

export function useDriverTracking({ enabled }: Options) {
  const [isTracking, setIsTracking] = useState(false);
  const [queueSize, setQueueSize] = useState(0);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const lastSentFix = useRef<QueuedFix | null>(null);
  const watcherId = useRef<string | null>(null);
  const online = useRef<boolean>(navigator.onLine);

  // ---- queue persistence -------------------------------------------------
  const readQueue = useCallback(async (): Promise<QueuedFix[]> => {
    const { value } = await Preferences.get({ key: QUEUE_KEY });
    if (!value) return [];
    try { return JSON.parse(value) as QueuedFix[]; } catch { return []; }
  }, []);

  const writeQueue = useCallback(async (q: QueuedFix[]) => {
    await Preferences.set({ key: QUEUE_KEY, value: JSON.stringify(q) });
    setQueueSize(q.length);
  }, []);

  // ---- single flush routine ---------------------------------------------
  const flush = useCallback(async () => {
    const q = await readQueue();
    if (q.length === 0) return;
    // Keep only the newest fix — the RPC is an upsert of the latest position.
    const newest = q.reduce((a, b) => (a.ts > b.ts ? a : b));

    const { error } = await supabase.rpc('upsert_driver_location', {
      p_lat: newest.lat,
      p_lng: newest.lng,
      p_accuracy: newest.accuracy,
    });

    if (error) {
      setLastError(error.message);
      return; // keep queue intact
    }
    await writeQueue([]);
    lastSentFix.current = newest;
    setLastSentAt(Date.now());
    setLastError(null);
  }, [readQueue, writeQueue]);

  // ---- send-or-enqueue ---------------------------------------------------
  const handleFix = useCallback(async (fix: QueuedFix) => {
    // Throttle: send if we have never sent, or if time/distance thresholds pass.
    const last = lastSentFix.current;
    const elapsed = last ? Date.now() - last.ts : Infinity;
    const moved = last ? haversineMeters(last, fix) : Infinity;
    const shouldSend = !last || elapsed >= MIN_INTERVAL_MS || moved >= MIN_DISTANCE_M;
    if (!shouldSend) return;

    if (!online.current) {
      const q = await readQueue();
      q.push(fix);
      await writeQueue(q); // retain for flush on reconnect
      return;
    }

    const { error } = await supabase.rpc('upsert_driver_location', {
      p_lat: fix.lat,
      p_lng: fix.lng,
      p_accuracy: fix.accuracy,
    });

    if (error) {
      const q = await readQueue();
      q.push(fix);
      await writeQueue(q);
      setLastError(error.message);
      return;
    }

    lastSentFix.current = fix;
    setLastSentAt(Date.now());
    setLastError(null);
  }, [readQueue, writeQueue]);

  // ---- start / stop watcher ---------------------------------------------
  const start = useCallback(async () => {
    if (watcherId.current) return;

    const { status } = await Network.getStatus();
    online.current = status === 'connected';

    if (Capacitor.isNativePlatform()) {
      // Native foreground-service watcher — survives screen lock and app
      // backgrounding. Must be imported lazily so the web build doesn't
      // try to load the native module.
      const { BackgroundGeolocation } = await import('@capacitor-community/background-geolocation');
      watcherId.current = await BackgroundGeolocation.addWatcher(
        {
          backgroundMessage: 'Tracking your delivery location',
          backgroundTitle: 'LogiFlow — On delivery',
          requestPermissions: true,
          stale: false,
          distanceFilter: 10, // metres — pre-filter at the native layer
        },
        (position, error) => {
          if (error) { setLastError(error.message); return; }
          if (!position) return;
          void handleFix({
            lat: position.latitude,
            lng: position.longitude,
            accuracy: position.accuracy ?? null,
            ts: Date.now(),
          });
        },
      );
    } else {
      // Web fallback — Capacitor Geolocation watch. Note: browsers throttle
      // background tabs; this is fine for testing but the native foreground
      // service is the production path.
      const { Geolocation } = await import('@capacitor/geolocation');
      const id = await Geolocation.watchPosition(
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
        (pos, err) => {
          if (err) { setLastError(err.message); return; }
          if (!pos) return;
          void handleFix({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? null,
            ts: Date.now(),
          });
        },
      );
      watcherId.current = String(id);
    }

    setIsTracking(true);
    await flush(); // flush anything left over from a previous session
  }, [handleFix, flush]);

  const stop = useCallback(async () => {
    if (!watcherId.current) return;
    if (Capacitor.isNativePlatform()) {
      const { BackgroundGeolocation } = await import('@capacitor-community/background-geolocation');
      await BackgroundGeolocation.removeWatcher({ id: watcherId.current });
    } else {
      const { Geolocation } = await import('@capacitor/geolocation');
      await Geolocation.clearWatch({ id: Number(watcherId.current) });
    }
    watcherId.current = null;
    setIsTracking(false);
  }, []);

  // ---- connectivity watchdog --------------------------------------------
  useEffect(() => {
    const sub = Network.addListener('networkStatusChange', (s) => {
      online.current = s.connected;
      if (s.connected && enabled) void flush();
    });
    return () => { void sub.then((h) => h.remove()); };
  }, [enabled, flush]);

  // Also respond to the browser's online event (covers the web build).
  useEffect(() => {
    const on = () => { online.current = true; void flush(); };
    const off = () => { online.current = false; };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [flush]);

  // Reflect persisted queue size on mount.
  useEffect(() => { void readQueue().then((q) => setQueueSize(q.length)); }, [readQueue]);

  // Auto start/stop from the `enabled` flag.
  useEffect(() => {
    if (enabled && !watcherId.current) void start();
    if (!enabled && watcherId.current) void stop();
    return () => { /* do not auto-stop on unmount; the shift owns lifecycle */ };
  }, [enabled, start, stop]);

  return { isTracking, queueSize, lastSentAt, lastError, start, stop, flush };
}
