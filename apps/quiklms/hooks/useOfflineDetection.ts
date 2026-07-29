'use client';
/**
 * useOfflineDetection — ported from the old QuikSkills frontend
 * (`src/hooks/useOfflineDetection.ts`).
 *
 * Tracks navigator online/offline. `wasOffline` latches true for 3s after
 * reconnecting so the UI can flash a "back online" banner.
 *
 * The only deviation from the source is the `typeof navigator` guard in the
 * initial state: the source read `navigator.onLine` directly, which throws
 * during SSR. Consumers load the player via `dynamic(..., { ssr:false })`, but
 * the guard keeps the hook safe on its own. Defaulting to `true` (online) matches
 * the source's behavior in a browser, where `navigator.onLine` is true unless the
 * machine is actually offline.
 */
import { useState, useEffect } from 'react';

interface UseOfflineDetectionReturn {
  isOnline: boolean;
  wasOffline: boolean;
}

export const useOfflineDetection = (): UseOfflineDetectionReturn => {
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setWasOffline(true);
      // Reset after showing message
      setTimeout(() => setWasOffline(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, wasOffline };
};

export default useOfflineDetection;
