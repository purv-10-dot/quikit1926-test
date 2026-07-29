'use client';
/**
 * OfflineAlert — ported from the old QuikSkills frontend
 * (`src/components/learner/OfflineAlert.tsx`).
 *
 * A fixed banner that appears when the connection drops and flips to a
 * "restored" state for 5s on reconnect, firing `onReconnect` so the host can
 * flush queued progress. Renders nothing while online.
 *
 * Its only consumer is LockedCoursePlayer, which is why it is ported alongside it.
 */
import React, { useEffect, useState } from 'react';
import { WifiOff, CheckCircle } from 'lucide-react';
import { useOfflineDetection } from '@/hooks/useOfflineDetection';

interface OfflineAlertProps {
  onReconnect?: () => void;
}

const OfflineAlert: React.FC<OfflineAlertProps> = ({ onReconnect }) => {
  const { isOnline, wasOffline } = useOfflineDetection();
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    if (wasOffline && isOnline) {
      setShowReconnected(true);
      if (onReconnect) {
        onReconnect();
      }
      setTimeout(() => setShowReconnected(false), 5000);
    }
  }, [wasOffline, isOnline, onReconnect]);

  if (isOnline && !showReconnected) {
    return null;
  }

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-slide-in">
      {!isOnline ? (
        <div className="bg-red-600 text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 max-w-md">
          <WifiOff className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Connection Lost</p>
            <p className="text-sm text-red-100">
              Progress will sync once you are back online.
            </p>
          </div>
        </div>
      ) : showReconnected ? (
        <div className="bg-green-600 text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 max-w-md">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Connection Restored</p>
            <p className="text-sm text-green-100">
              Syncing your progress...
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default OfflineAlert;
