"use client";

/**
 * LeadSquared-style call recording player: a compact rounded pill with
 * play/pause, elapsed / total time, a seek bar, mute, and download.
 *
 * Playback streams through the same-origin proxy
 * (/api/telephony/recording?url=...) because the recording host returns a
 * self-referencing CORS header that blocks a direct <audio> fetch. Download
 * adds &download=1 so the proxy sets Content-Disposition: attachment (a
 * cross-origin <a download> is ignored by browsers and would just stream).
 *
 * Shared by the unified Timeline tab and the Call Disposition tab so a
 * recording looks identical wherever it appears.
 */

import { useCallback, useRef, useState } from "react";
import { Play, Pause, Download, Volume2, VolumeX } from "lucide-react";

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function CallRecordingPlayer({
  recordingUrl,
  className = "",
}: {
  recordingUrl: string;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  const proxied = `/api/telephony/recording?url=${encodeURIComponent(recordingUrl)}`;
  const downloadHref = `${proxied}&download=1`;

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  }, []);

  const onSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a) return;
    const t = Number(e.target.value);
    a.currentTime = t;
    setCurrent(t);
  }, []);

  const toggleMute = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.muted = !a.muted;
    setMuted(a.muted);
  }, []);

  return (
    <div
      className={
        "inline-flex w-full max-w-md items-center gap-2 rounded-full border border-crm-border bg-white px-2 py-1 shadow-sm dark:bg-slate-900 " +
        className
      }
    >
      <audio
        ref={audioRef}
        src={proxied}
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      <button
        type="button"
        onClick={toggle}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700"
        aria-label={playing ? "Pause recording" : "Play recording"}
      >
        {playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
      </button>

      <span className="shrink-0 text-xs tabular-nums text-crm-muted">
        {fmt(current)} / {fmt(duration)}
      </span>

      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={Math.min(current, duration || 0)}
        onChange={onSeek}
        className="h-1 flex-1 cursor-pointer accent-emerald-600"
        aria-label="Seek recording"
      />

      <button
        type="button"
        onClick={toggleMute}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-crm-muted transition hover:bg-crm-panel hover:text-crm-text"
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
      </button>

      <a
        href={downloadHref}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-crm-muted transition hover:bg-crm-panel hover:text-emerald-700"
        aria-label="Download recording"
        title="Download recording"
      >
        <Download size={15} />
      </a>
    </div>
  );
}
