'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, SkipForward, SkipBack, WifiOff } from 'lucide-react';
import { api } from '@/lib/api';

interface Caption {
  language: string;
  label: string;
  url: string;
}

interface VideoPlayerWithProgressProps {
  videoUrl: string;
  courseId: string;
  lessonId: string;
  lessonTitle: string;
  onProgressUpdate?: (watchedPercentage: number) => void;
  onComplete?: () => void;
  initialPosition?: number;
  captions?: Caption[];
}

export function VideoPlayerWithProgress({
  videoUrl,
  courseId,
  lessonId,
  lessonTitle,
  onProgressUpdate,
  onComplete,
  initialPosition = 0,
  captions,
}: VideoPlayerWithProgressProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressSaveInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchedRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(initialPosition);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [watchedPercentage, setWatchedPercentage] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Track online/offline status.
  useEffect(() => {
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Persist progress to the backend.
  const saveProgress = useCallback(
    async (percentage: number) => {
      const video = videoRef.current;
      if (!video) return;
      try {
        await api.post('/progress', {
          courseId,
          lessonId,
          currentPosition: video.currentTime,
          duration: video.duration || undefined,
          completionPercentage: percentage,
          status: percentage >= 100 ? 'completed' : 'in_progress',
        });
      } catch (err) {
        // best-effort; surface in console only
        // eslint-disable-next-line no-console
        console.error('Failed to save video progress:', err);
      }
    },
    [courseId, lessonId],
  );

  // Restore saved position once metadata is available.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      if (initialPosition > 0 && initialPosition < video.duration) {
        video.currentTime = initialPosition;
        setCurrentTime(initialPosition);
      }
    };
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata);
  }, [initialPosition]);

  // Pause when going offline.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!isOnline && isPlaying) {
      video.pause();
      setIsPlaying(false);
    }
  }, [isOnline, isPlaying]);

  // Time updates → fire onProgressUpdate.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleTimeUpdate = () => {
      const current = video.currentTime;
      const total = video.duration || duration;
      setCurrentTime(current);
      if (total > 0) {
        const pct = Math.min(100, (current / total) * 100);
        setWatchedPercentage(pct);
        watchedRef.current = pct;
        if (onProgressUpdate && isOnline) onProgressUpdate(pct);
      }
    };
    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [duration, onProgressUpdate, isOnline]);

  // Video end → onComplete + 100% persist.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleEnded = () => {
      setIsPlaying(false);
      setWatchedPercentage(100);
      watchedRef.current = 100;
      if (onProgressUpdate) onProgressUpdate(100);
      saveProgress(100);
      if (onComplete) onComplete();
    };
    video.addEventListener('ended', handleEnded);
    return () => video.removeEventListener('ended', handleEnded);
  }, [onComplete, onProgressUpdate, saveProgress]);

  // Auto-save every 10s + flush on unmount.
  useEffect(() => {
    progressSaveInterval.current = setInterval(() => {
      if (watchedRef.current > 0) saveProgress(watchedRef.current);
    }, 10000);
    return () => {
      if (progressSaveInterval.current) clearInterval(progressSaveInterval.current);
      if (watchedRef.current > 0) saveProgress(watchedRef.current);
    };
  }, [saveProgress]);

  // Flush on page unload.
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (watchedRef.current > 0) saveProgress(watchedRef.current);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveProgress]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
    } else {
      void video.play();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const newTime = parseFloat(e.target.value);
    video.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const newVolume = parseFloat(e.target.value);
    video.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isMuted) {
      video.volume = volume || 0.5;
      setIsMuted(false);
    } else {
      video.volume = 0;
      setIsMuted(true);
    }
  };

  const toggleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;
    if (!isFullscreen) {
      void video.requestFullscreen?.();
    } else {
      void document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  };

  const skipForward = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(video.currentTime + 10, video.duration);
  };

  const skipBackward = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(video.currentTime - 10, 0);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-black rounded-lg overflow-hidden shadow-xl">
      <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
        <video
          ref={videoRef}
          src={videoUrl}
          className="absolute top-0 left-0 w-full h-full"
          crossOrigin="anonymous"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onWaiting={() => setBuffering(true)}
          onCanPlay={() => setBuffering(false)}
        >
          {captions?.map((cap, idx) => (
            <track
              key={`${cap.language}-${idx}`}
              kind="subtitles"
              src={cap.url}
              srcLang={cap.language}
              label={cap.label}
              default={idx === 0}
            />
          ))}
        </video>

        {buffering && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white" />
          </div>
        )}

        {!isOnline && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center text-white">
              <WifiOff className="w-16 h-16 mx-auto mb-4" />
              <p className="text-xl font-semibold mb-2">Connection Lost</p>
              <p className="text-gray-300">Progress will sync once you are back online.</p>
            </div>
          </div>
        )}

        {watchedPercentage >= 95 && (
          <div className="absolute top-4 right-4 bg-emerald-500 text-white px-3 py-1 rounded-full text-sm font-medium">
            Ready for Quiz
          </div>
        )}
      </div>

      <div className="bg-gray-900 p-4">
        <div className="mb-4">
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{formatTime(currentTime)}</span>
            <span className="font-medium text-white">{watchedPercentage.toFixed(1)}% watched</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={togglePlay} className="p-2 hover:bg-gray-800 rounded transition-colors" aria-label={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? <Pause className="w-5 h-5 text-white" /> : <Play className="w-5 h-5 text-white" />}
            </button>
            <button onClick={skipBackward} className="p-2 hover:bg-gray-800 rounded transition-colors" aria-label="Back 10s">
              <SkipBack className="w-5 h-5 text-white" />
            </button>
            <button onClick={skipForward} className="p-2 hover:bg-gray-800 rounded transition-colors" aria-label="Forward 10s">
              <SkipForward className="w-5 h-5 text-white" />
            </button>
            <div className="flex items-center gap-2 ml-4">
              <button onClick={toggleMute} className="p-2 hover:bg-gray-800 rounded transition-colors" aria-label={isMuted ? 'Unmute' : 'Mute'}>
                {isMuted ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-20 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400 truncate max-w-[160px]">{lessonTitle}</span>
            {captions && captions.length > 0 && (
              <button
                onClick={() => {
                  const next = !captionsEnabled;
                  setCaptionsEnabled(next);
                  const video = videoRef.current;
                  if (video) {
                    const tracks = video.textTracks;
                    for (let i = 0; i < tracks.length; i++) tracks[i].mode = next ? 'showing' : 'hidden';
                  }
                }}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  captionsEnabled ? 'bg-indigo-600 text-white' : 'hover:bg-gray-800 text-gray-400'
                }`}
                aria-label={captionsEnabled ? 'Disable captions' : 'Enable captions'}
              >
                CC
              </button>
            )}
            <button onClick={toggleFullscreen} className="p-2 hover:bg-gray-800 rounded transition-colors" aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              {isFullscreen ? <Minimize className="w-5 h-5 text-white" /> : <Maximize className="w-5 h-5 text-white" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default VideoPlayerWithProgress;
