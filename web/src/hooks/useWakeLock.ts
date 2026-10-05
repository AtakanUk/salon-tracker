import { useEffect } from 'react';

/**
 * Keeps the tablet screen awake while a session is running.
 * Silently does nothing on browsers without the Wake Lock API.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;

    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        // e.g. low battery mode; not critical
      }
    };
    const onVisibility = () => {
      if (!document.hidden) acquire();
    };

    acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      lock?.release().catch(() => {});
    };
  }, [active]);
}
