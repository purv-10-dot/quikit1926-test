'use client';
/**
 * AudioPlayerResource — ported from the old QuikSkills frontend
 * (src/components/learner/AudioPlayerResource.tsx).
 *
 * Plays an audio resource with a Web Audio frequency visualizer and tracks
 * SCORM-style playback progress:
 *   - lesson_location is persisted in the "time:SECONDS" format.
 *   - max listened time and per-session listening time are tracked separately.
 *   - progress is synced to PATCH /api/learner/sync-audio every 10s while
 *     playing, and once more on unmount.
 *   - completion fires at 95% progress, emitting an optional xAPI statement.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Clock } from 'lucide-react';
import { api } from '@/lib/api';

// Debug logging
const DEBUG_ENABLED = true;
const debugLog = (msg: string, data?: any) => {
  if (!DEBUG_ENABLED) return;
  console.log(`[AudioPlayer] ${msg}`, data || '');
};

// SCORM location format parser - extracts numeric value from "time:X" format
const parseTimeLocation = (location: string | number | undefined): number => {
  if (typeof location === 'number') return location;
  if (!location) return 0;
  const match = String(location).match(/^time:(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
};

interface AudioPlayerResourceProps {
  audioUrl: string;
  courseId: string;
  lessonId: string;
  title?: string;
  onComplete?: () => void;
  initialTime?: number;
  onXAPIStatement?: (verb: string, result?: any) => void; // xAPI callback
}

const AudioPlayerResource: React.FC<AudioPlayerResourceProps> = ({
  audioUrl,
  courseId,
  lessonId,
  title = 'Audio Resource',
  onComplete,
  initialTime = 0,
  onXAPIStatement,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const sessionStartRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(initialTime);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [maxListenedTime, setMaxListenedTime] = useState(initialTime); // SCORM compliance
  const [sessionTime, setSessionTime] = useState(0); // Total listening time this session

  // Audio context for visualizer
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  // Send xAPI statement helper
  const sendXAPI = useCallback((verb: string, result?: any) => {
    debugLog(`xAPI: ${verb}`, result);
    if (onXAPIStatement) {
      onXAPIStatement(verb, result);
    }
  }, [onXAPIStatement]);

  // Track session time while playing
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isPlaying) {
      sessionStartRef.current = Date.now();
      interval = setInterval(() => {
        setSessionTime(prev => prev + 1);
      }, 1000);
    } else {
      sessionStartRef.current = null;
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying]);

  // Initialize audio and resume from last position
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Set initial time
    if (initialTime > 0) {
      audio.currentTime = initialTime;
      setCurrentTime(initialTime);
    }

    // Load duration
    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      if (initialTime > 0) {
        audio.currentTime = initialTime;
      }
    };

    // Update current time
    const handleTimeUpdate = () => {
      const time = audio.currentTime;
      setCurrentTime(time);

      // Track max listened time (SCORM compliance)
      setMaxListenedTime(prev => Math.max(prev, time));

      const newProgress = duration > 0 ? (time / duration) * 100 : 0;
      setProgress(newProgress);

      // Check completion (95%)
      if (newProgress >= 95 && !isCompleted) {
        setIsCompleted(true);
        debugLog('Audio completed!', { progress: newProgress, duration });
        sendXAPI('completed', {
          completion: true,
          success: true,
          duration: `PT${Math.floor(duration)}S`
        });
        if (onComplete) {
          onComplete();
        }
      }
    };

    // Handle ended
    const handleEnded = () => {
      setIsPlaying(false);
      if (progress >= 95) {
        setIsCompleted(true);
      }
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl, initialTime, duration, progress, isCompleted, onComplete]);

  // Setup audio visualizer
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !canvasRef.current) return;

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Create audio context
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        sourceRef.current = audioContextRef.current.createMediaElementSource(audio);
        sourceRef.current.connect(analyserRef.current);
        analyserRef.current.connect(audioContextRef.current.destination);
      }

      const analyser = analyserRef.current;
      if (!analyser) return;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        if (!isPlaying || !analyserRef.current) {
          animationFrameRef.current = requestAnimationFrame(draw);
          return;
        }

        analyserRef.current.getByteFrequencyData(dataArray);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'; // slate-900
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          barHeight = (dataArray[i] / 255) * canvas.height * 0.8;

          const gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
          gradient.addColorStop(0, '#6366f1'); // primary-500
          gradient.addColorStop(1, '#8b5cf6'); // purple-500

          ctx.fillStyle = gradient;
          ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);

          x += barWidth + 1;
        }

        animationFrameRef.current = requestAnimationFrame(draw);
      };

      draw();
    } catch (error) {
      console.error('Failed to setup audio visualizer:', error);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying]);

  // Sync progress every 10 seconds
  useEffect(() => {
    if (!isPlaying) return;

    syncIntervalRef.current = setInterval(() => {
      syncAudioProgress();
    }, 10000);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [isPlaying, currentTime, courseId, lessonId]);

  // Sync on unmount
  useEffect(() => {
    return () => {
      syncAudioProgress();
    };
  }, []);

  const syncAudioProgress = async () => {
    // SCORM-compliant lesson_location format: "time:SECONDS"
    const lessonLocationFormatted = `time:${Math.floor(currentTime)}`;

    debugLog('Syncing audio progress', { currentTime, progress, maxListenedTime, sessionTime, lessonLocation: lessonLocationFormatted });
    try {
      await api.patch('/learner/sync-audio', {
        courseId,
        subModuleId: lessonId,
        currentTime: currentTime,
        currentPosition: lessonLocationFormatted, // SCORM format: "time:X"
        progress: progress,
        maxListenedTime: maxListenedTime,
        sessionTime: sessionTime,
        suspendData: JSON.stringify({
          // SCORM 1.2: cmi.core.lesson_location
          // SCORM 2004: cmi.location
          lesson_location: lessonLocationFormatted, // SCORM format: "time:X"
          currentTime,
          maxListened: maxListenedTime,
          sessionTime,
          lastAccessed: new Date().toISOString()
        })
      });

      // Send xAPI progress statement
      sendXAPI('progressed', {
        duration: `PT${Math.floor(currentTime)}S`
      });
    } catch (error) {
      console.error('Failed to sync audio progress:', error);
    }
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      debugLog('Audio paused', { currentTime, progress });
    } else {
      audio.play().catch((error) => {
        console.error('Failed to play audio:', error);
      });
      setIsPlaying(true);
      debugLog('Audio playing', { currentTime, progress });

      // Send launched xAPI on first play
      if (currentTime === 0 || currentTime === initialTime) {
        sendXAPI('launched');
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = (parseFloat(e.target.value) / 100) * duration;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const skipForward = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(audio.currentTime + 10, duration);
  };

  const skipBackward = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(audio.currentTime - 10, 0);
  };

  const handlePlaybackRateChange = (rate: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = rate;
    setPlaybackRate(rate);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const newVolume = parseFloat(e.target.value);
    audio.volume = newVolume;
    setVolume(newVolume);
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
      audio.muted = false;
    }
  };

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white">
      {/* Header */}
      <div className="p-6 border-b border-slate-800">
        <h2 className="text-2xl font-bold mb-2">{title}</h2>
        <div className="flex items-center gap-4 text-sm text-gray-400">
          <span>Progress: {Math.round(progress)}%</span>
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            Session: {formatTime(sessionTime)}
          </span>
          {isCompleted && (
            <span className="text-green-500 font-semibold">✓ Completed</span>
          )}
        </div>
      </div>

      {/* Visualizer */}
      <div className="flex-1 flex items-center justify-center bg-black p-8">
        <canvas
          ref={canvasRef}
          width={800}
          height={200}
          className="w-full max-w-4xl h-48 rounded-lg"
        />
      </div>

      {/* Controls */}
      <div className="p-6 bg-slate-800 border-t border-slate-700">
        {/* Progress Bar */}
        <div className="mb-4">
          <input
            type="range"
            min="0"
            max="100"
            value={progress}
            onChange={handleSeek}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
            style={{
              background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${progress}%, #334155 ${progress}%, #334155 100%)`,
            }}
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Main Controls */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {/* Playback Speed */}
            <div className="flex items-center gap-1 bg-slate-700 rounded-lg p-1">
              {[0.5, 1, 1.5, 2].map((rate) => (
                <button
                  key={rate}
                  onClick={() => handlePlaybackRateChange(rate)}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    playbackRate === rate
                      ? 'bg-primary-500 text-white'
                      : 'text-gray-300 hover:bg-slate-600'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={skipBackward}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
              title="Skip backward 10s"
            >
              <SkipBack className="w-5 h-5" />
            </button>
            <button
              onClick={togglePlay}
              className="p-3 bg-primary-500 hover:bg-primary-600 rounded-full transition-colors"
            >
              {isPlaying ? (
                <Pause className="w-6 h-6" />
              ) : (
                <Play className="w-6 h-6 ml-0.5" />
              )}
            </button>
            <button
              onClick={skipForward}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
              title="Skip forward 10s"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Volume Control */}
            <button
              onClick={toggleMute}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-5 h-5" />
              ) : (
                <Volume2 className="w-5 h-5" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-24 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
            />
          </div>
        </div>

        {/* Completion Warning */}
        {progress < 95 && (
          <div className="text-center text-sm text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-lg p-2">
            Please listen to at least 95% of the audio to proceed to the next lesson.
          </div>
        )}
      </div>

      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        style={{ display: 'none' }}
      />
    </div>
  );
};

export default AudioPlayerResource;
