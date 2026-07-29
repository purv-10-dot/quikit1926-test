'use client';
/**
 * CompliancePlayer — ported from the old QuikSkills frontend
 * (`src/components/CompliancePlayer.tsx`).
 *
 * Compliance-gated content player:
 *   - Video  — ReactPlayer with controls/seeking disabled; the Next button
 *              unlocks only at >= 95% watched, and a 30s heartbeat posts
 *              progress to /progress.
 *   - SCORM  — iframe plus a SCORM 1.2 / 2004 API shim exposed on `window`
 *              (API / API_1484_11 / getAPI); `cmi.core.lesson_status` of
 *              "completed" or "passed" marks the lesson complete.
 *   - PDF / PPT / Text — plain iframe document viewer.
 *
 * Behaviour is a 1:1 port; only the axios → fetch api-client semantics and the
 * Next.js client-component boilerplate differ.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactPlayer from 'react-player';
import { Clock, Lock, CheckCircle, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface CompliancePlayerProps {
  contentUrl: string;
  contentType: 'Video' | 'SCORM' | 'PDF' | 'PPT' | 'Text';
  courseId: string;
  lessonId: string;
  onComplete?: () => void;
  onNext?: () => void;
}

const CompliancePlayer: React.FC<CompliancePlayerProps> = ({
  contentUrl,
  contentType,
  courseId,
  lessonId,
  onComplete,
  onNext,
}) => {
  const [currentPosition, setCurrentPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [percentRemaining, setPercentRemaining] = useState(100);
  const [timeRemaining, setTimeRemaining] = useState('00:00');
  const [canProceed, setCanProceed] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [scormStatus, setScormStatus] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scormAPIRef = useRef<any>(null);

  // Format time in MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate time remaining
  useEffect(() => {
    if (duration > 0 && currentPosition >= 0) {
      const remaining = duration - currentPosition;
      setPercentRemaining(Math.max(0, (remaining / duration) * 100));
      setTimeRemaining(formatTime(remaining));

      // Enable Next button when 95% complete
      const completionPercent = (currentPosition / duration) * 100;
      setCanProceed(completionPercent >= 95);
    }
  }, [currentPosition, duration]);

  // Heartbeat function to save progress every 30 seconds
  const sendHeartbeat = useCallback(async () => {
    try {
      await api.post('/progress', {
        courseId,
        lessonId,
        currentPosition,
        duration,
        percentRemaining,
        status: isCompleted ? 'Completed' : 'In Progress',
        scormStatus,
      });
    } catch (error) {
      console.error('Failed to save progress:', error);
    }
  }, [courseId, lessonId, currentPosition, duration, percentRemaining, isCompleted, scormStatus]);

  // Setup heartbeat interval
  useEffect(() => {
    if (contentType === 'Video' || contentType === 'SCORM') {
      heartbeatIntervalRef.current = setInterval(sendHeartbeat, 30000); // 30 seconds
      return () => {
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }
      };
    }
  }, [contentType, sendHeartbeat]);

  // SCORM API Implementation
  useEffect(() => {
    if (contentType === 'SCORM' && iframeRef.current) {
      // Create SCORM API object
      const scormAPI = {
        LMSInitialize: (param: string) => {
          console.log('SCORM: LMSInitialize', param);
          return 'true';
        },
        LMSFinish: (param: string) => {
          console.log('SCORM: LMSFinish', param);
          return 'true';
        },
        LMSGetValue: (element: string) => {
          console.log('SCORM: LMSGetValue', element);
          if (element === 'cmi.core.lesson_status') {
            return scormStatus || 'not attempted';
          }
          if (element === 'cmi.core.score.raw') {
            return '';
          }
          if (element === 'cmi.core.total_time') {
            return formatTime(currentPosition);
          }
          return '';
        },
        LMSSetValue: (element: string, value: string) => {
          console.log('SCORM: LMSSetValue', element, value);

          if (element === 'cmi.core.lesson_status') {
            setScormStatus(value);
            if (value === 'completed' || value === 'passed') {
              setIsCompleted(true);
              setCanProceed(true);
              if (onComplete) {
                onComplete();
              }
              // Save completion immediately
              sendHeartbeat();
            }
          }

          if (element === 'cmi.core.score.raw') {
            // Handle score if needed
          }

          return 'true';
        },
        LMSCommit: (param: string) => {
          console.log('SCORM: LMSCommit', param);
          return 'true';
        },
        LMSGetLastError: () => {
          return '0';
        },
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        LMSGetErrorString: (errorCode: string) => {
          return 'No error';
        },
        LMSGetDiagnostic: (_errorCode: string) => {
          return '';
        },
      };

      scormAPIRef.current = scormAPI;

      // Expose API to parent window (SCORM content looks for API in parent)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).API = scormAPI;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).API_1484_11 = scormAPI;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).getAPI = () => scormAPI;

      // Also try to expose to iframe after it loads
      const iframe = iframeRef.current;
      const handleIframeLoad = () => {
        try {
          const iframeWindow = iframe.contentWindow;
          if (iframeWindow) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (iframeWindow as any).API = scormAPI;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (iframeWindow as any).API_1484_11 = scormAPI;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (iframeWindow as any).getAPI = () => scormAPI;
          }
        } catch (e) {
          // Cross-origin restrictions may prevent this
          console.log('Cannot access iframe window (cross-origin):', e);
        }
      };

      iframe.addEventListener('load', handleIframeLoad);

      return () => {
        iframe.removeEventListener('load', handleIframeLoad);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (window as any).API;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (window as any).API_1484_11;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (window as any).getAPI;
      };
    }
  }, [contentType, scormStatus, currentPosition, onComplete, sendHeartbeat]);

  // Handle video progress
  const handleProgress = (state: { played: number; playedSeconds: number; loaded: number }) => {
    if (duration === 0 && playerRef.current) {
      const playerDuration = playerRef.current.getDuration();
      if (playerDuration) {
        setDuration(playerDuration);
      }
    }
    setCurrentPosition(state.playedSeconds);
  };

  // Handle video duration
  const handleDuration = (duration: number) => {
    setDuration(duration);
  };

  // Handle video end
  const handleEnded = () => {
    setIsCompleted(true);
    setCanProceed(true);
    if (onComplete) {
      onComplete();
    }
    sendHeartbeat();
  };

  // Render Video/Audio Player
  const renderVideoPlayer = () => {
    return (
      <div className="relative w-full bg-black rounded-lg overflow-hidden">
        {/* Time Remaining Overlay */}
        <div className="absolute top-4 right-4 z-10 bg-black/70 text-white px-4 py-2 rounded-lg flex items-center gap-2">
          <Clock className="w-4 h-4" />
          <span className="font-mono text-sm">{timeRemaining}</span>
          <span className="text-xs opacity-75">({percentRemaining.toFixed(1)}% remaining)</span>
        </div>

        {/* Lock Icon Overlay */}
        <div className="absolute top-4 left-4 z-10 bg-black/70 text-white px-3 py-2 rounded-lg flex items-center gap-2">
          <Lock className="w-4 h-4" />
          <span className="text-xs">Skipping Disabled</span>
        </div>

        {/* React Player with disabled controls */}
        <div
          className="pointer-events-none"
          style={{ pointerEvents: 'none' }}
        >
          <ReactPlayer
            ref={playerRef}
            url={contentUrl}
            playing={false}
            controls={false}
            width="100%"
            height="100%"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onProgress={(state: any) => {
              if (state && typeof state === 'object' && 'played' in state) {
                handleProgress(state);
              }
            }}
            onDuration={handleDuration}
            onEnded={handleEnded}
            progressInterval={1000}
            config={{
              youtube: {
                // @ts-ignore - ReactPlayer type definitions
                playerVars: {
                  controls: 0,
                  disablekb: 1,
                  rel: 0,
                  modestbranding: 1,
                  fs: 0, // Disable fullscreen
                },
              },
              vimeo: {
                // @ts-ignore - ReactPlayer type definitions
                playerOptions: {
                  controls: false,
                  keyboard: false,
                  responsive: true,
                },
              },
              file: {
                attributes: {
                  controlsList: 'nodownload',
                  disablePictureInPicture: true,
                },
              },
            }}
          />
        </div>

        {/* Custom Controls Overlay - Read-only progress bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 pointer-events-auto">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                if (playerRef.current) {
                  playerRef.current.seekTo(0);
                  setCurrentPosition(0);
                }
              }}
              className="text-white hover:text-gray-300 transition-colors px-3 py-1 rounded bg-black/50"
            >
              Restart
            </button>
            <div className="flex-1 bg-gray-600 rounded-full h-2 relative pointer-events-none">
              <div
                className="bg-primary-600 h-2 rounded-full transition-all pointer-events-none"
                style={{ width: `${duration > 0 ? (currentPosition / duration) * 100 : 0}%` }}
              />
            </div>
            <span className="text-white text-sm font-mono">
              {formatTime(currentPosition)} / {formatTime(duration)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // Render SCORM Player
  const renderScormPlayer = () => {
    return (
      <div className="relative w-full bg-gray-100 rounded-lg overflow-hidden" style={{ minHeight: '600px' }}>
        {/* SCORM Status Overlay */}
        <div className="absolute top-4 right-4 z-10 bg-white shadow-lg px-4 py-2 rounded-lg flex items-center gap-2">
          {scormStatus === 'completed' || scormStatus === 'passed' ? (
            <>
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-green-600">Completed</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-5 h-5 text-yellow-600" />
              <span className="text-sm font-medium text-yellow-600">In Progress</span>
            </>
          )}
        </div>

        <iframe
          ref={iframeRef}
          src={contentUrl}
          className="w-full h-full border-0"
          style={{ minHeight: '600px' }}
          title="SCORM Content"
          allow="fullscreen"
        />
      </div>
    );
  };

  // Render PDF/Document Viewer
  const renderDocumentViewer = () => {
    return (
      <div className="w-full bg-white rounded-lg overflow-hidden" style={{ minHeight: '600px' }}>
        <iframe
          src={contentUrl}
          className="w-full h-full border-0"
          style={{ minHeight: '600px' }}
          title="Document Viewer"
        />
      </div>
    );
  };

  return (
    <div className="w-full">
      {/* Content Player */}
      <div className="mb-6">
        {contentType === 'Video' && renderVideoPlayer()}
        {contentType === 'SCORM' && renderScormPlayer()}
        {(contentType === 'PDF' || contentType === 'PPT' || contentType === 'Text') && renderDocumentViewer()}
      </div>

      {/* Next Button */}
      {onNext && (
        <div className="flex justify-end">
          <button
            onClick={onNext}
            disabled={!canProceed}
            className={`px-6 py-3 rounded-lg font-medium transition-all inline-flex items-center gap-2 ${
              canProceed
                ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-lg'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isCompleted ? (
              <>
                <CheckCircle className="w-5 h-5" />
                Continue
              </>
            ) : (
              <>
                <Lock className="w-5 h-5" />
                Complete {percentRemaining.toFixed(1)}% to Continue
              </>
            )}
          </button>
        </div>
      )}

      {/* Progress Info */}
      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">
            Progress: {((currentPosition / duration) * 100 || 0).toFixed(1)}%
          </span>
          <span className="text-gray-600">
            Time Remaining: {timeRemaining}
          </span>
        </div>
      </div>
    </div>
  );
};

export default CompliancePlayer;
