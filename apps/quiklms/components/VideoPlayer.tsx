'use client';
/**
 * VideoPlayer — ported from the old QuikLMSs frontend
 * (src/components/VideoPlayer.tsx).
 *
 * Detects the kind of video behind `videoUrl` and renders it accordingly:
 *   - youtube / vimeo — an <iframe> embed built from the extracted video id,
 *                       badged with the provider in the top-right corner.
 *   - direct         — a native <video> element plus custom hover controls
 *                      (play/pause, mute, volume, fullscreen).
 *
 * An optional `title` renders as a badge over the top-left of the player.
 *
 * FORCED DEVIATION — the provider badge icon. The source imported lucide-react's
 * `Youtube` brand icon, but this app is on lucide-react 1.x, which dropped the
 * brand icons entirely (the reference app was on 0.294). There is no equivalent,
 * so the badge uses the generic `Video` glyph. The badge's "YouTube" / "Vimeo"
 * TEXT is unchanged, so the provider is still named to the user — only the
 * pictogram differs.
 */
import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Video } from 'lucide-react';

interface VideoPlayerProps {
  videoUrl: string;
  title?: string;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ videoUrl, title }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoType, setVideoType] = useState<'youtube' | 'vimeo' | 'direct'>('direct');

  useEffect(() => {
    const youtubeRegex = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
    const youtubeMatch = videoUrl.match(youtubeRegex);
    if (youtubeMatch) { setVideoId(youtubeMatch[1]); setVideoType('youtube'); return; }

    const vimeoRegex = /(?:vimeo\.com\/)(?:.*\/)?(\d+)/;
    const vimeoMatch = videoUrl.match(vimeoRegex);
    if (vimeoMatch) { setVideoId(vimeoMatch[1]); setVideoType('vimeo'); return; }

    setVideoType('direct');
    setVideoId(null);
  }, [videoUrl]);

  const getEmbedUrl = () => {
    if (videoType === 'youtube' && videoId) {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      return `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${origin}&modestbranding=1&rel=0&controls=1&showinfo=0`;
    }
    if (videoType === 'vimeo' && videoId) {
      return `https://player.vimeo.com/video/${videoId}?title=0&byline=0&portrait=0`;
    }
    return videoUrl;
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); } else { v.pause(); }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    const v = videoRef.current;
    if (v) {
      v.volume = val;
      v.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => { setIsFullscreen(!!document.fullscreenElement); };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => { document.removeEventListener('fullscreenchange', handleFullscreenChange); };
  }, []);

  return (
    <div ref={containerRef} className="bg-black rounded-lg overflow-hidden relative group">
      <div className="relative w-full" style={{ aspectRatio: '16/9' }}>
        {videoType === 'direct' ? (
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full h-full"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onVolumeChange={() => {
              const v = videoRef.current;
              if (v) { setIsMuted(v.muted); setVolume(v.volume); }
            }}
          />
        ) : (
          <div className="relative w-full h-full">
            <iframe
              src={getEmbedUrl()}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              title={title || 'Video Player'}
            />
            <div className="absolute top-4 right-4 bg-black/70 text-white px-3 py-1.5 rounded-lg text-xs font-medium">
              {videoType === 'youtube' && (
                <div className="flex items-center gap-1.5">
                  <Video className="w-3.5 h-3.5" /><span>YouTube</span>
                </div>
              )}
              {videoType === 'vimeo' && <span>Vimeo</span>}
            </div>
          </div>
        )}
      </div>

      {/* Custom controls — only for direct video files */}
      {videoType === 'direct' && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-4">
            <button onClick={togglePlay} className="text-white hover:text-gray-300 transition-colors">
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
            </button>
            <button onClick={toggleMute} className="text-white hover:text-gray-300 transition-colors">
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={handleVolumeChange}
              className="flex-1 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
            />
            <button
              onClick={toggleFullscreen}
              className="text-white hover:text-gray-300 transition-colors"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              <Maximize className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Title badge */}
      {title && (
        <div className="absolute top-4 left-4 bg-black/60 text-white px-3 py-2 rounded-lg">
          <div className="flex items-center gap-2">
            {videoType === 'youtube' && <Video className="w-4 h-4" />}
            <span className="text-sm font-medium">{title}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
