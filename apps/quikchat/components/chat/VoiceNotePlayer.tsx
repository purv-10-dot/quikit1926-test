"use client";

/**
 * Custom voice-note player (Session 2). Replaces the native `<audio controls>` in
 * MessageRow's audio branch.
 *
 * The playback engine is a REAL `<audio>` element with `controls` removed, driven
 * through play()/pause()/currentTime/playbackRate. Deliberately no WebAudio and no
 * fetch of the audio URL: decoding would mean reading the signed cross-origin GCS
 * object, which needs bucket CORS that the server-side storage design exists to
 * avoid — it would pass against the same-origin local driver and fail in prod.
 * `<audio src>` needs no CORS, and `media-src 'self' blob: https:` already covers it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconButton, Mic, Pause, Play } from "@/components/ui";
import { formatVoiceDuration } from "@/lib/format";
import { fractionToTime, pseudoPeaks, timeToFraction } from "@/lib/voice-peaks";

/** Cycled by the speed button. Ephemeral per player — never persisted. */
const SPEEDS = [1, 1.5, 2] as const;

/**
 * Single-active-player registry. Starting one voice note pauses every other
 * mounted one. Module-level because it must span sibling bubbles that share no
 * React ancestor state.
 */
interface PlayerHandle {
  pause: () => void;
}
const PLAYERS = new Set<PlayerHandle>();

/**
 * `self` is nullable on purpose rather than guarded at the call site: if the
 * handle were somehow missing, a guard would silently pause NOTHING, whereas
 * passing null makes `player !== self` trivially true and still pauses everyone
 * else — the correct behaviour in that (practically unreachable) case.
 */
function pauseOtherPlayers(self: PlayerHandle | null) {
  for (const player of PLAYERS) {
    if (player !== self) player.pause();
  }
}

export interface VoiceNotePlayerProps {
  url: string;
  /**
   * The sender's recorded length — authoritative for both the label and the scrub
   * denominator, because MediaRecorder webm carries no container duration.
   */
  durationSec?: number;
  /** Real measured amplitudes, when a future session persists them. */
  peaks?: number[];
  /** Stable identity for the placeholder waveform (the media object's storage key). */
  seed: string;
}

export function VoiceNotePlayer({ url, durationSec, peaks, seed }: VoiceNotePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);
  // Only ever set from a FINITE audio.duration, and only when durationSec is
  // absent. MediaRecorder webm usually reports Infinity here; the `1e101`
  // currentTime duration-forcing hack is deliberately not used.
  const [probedDuration, setProbedDuration] = useState<number | undefined>(undefined);

  const bars = useMemo(
    () => (peaks && peaks.length > 0 ? peaks : pseudoPeaks(seed)),
    [peaks, seed],
  );

  const total = durationSec ?? probedDuration;
  const seekable = !!total && Number.isFinite(total) && total > 0;
  const fraction = timeToFraction(currentTime, total);
  const speed = SPEEDS[speedIdx]!;

  // Registry handle, built exactly once inside the effect. Nothing it closes over
  // can go stale — `setPlaying` is a useState setter and `audioRef` is a stable
  // ref object — so there is no reason to reassign it on every render.
  const selfRef = useRef<PlayerHandle | null>(null);
  useEffect(() => {
    const self: PlayerHandle = {
      pause: () => {
        audioRef.current?.pause();
        setPlaying(false);
      },
    };
    selfRef.current = self;
    PLAYERS.add(self);
    return () => {
      PLAYERS.delete(self);
    };
  }, []);

  // Keep the element's rate in sync (it resets on some src/load transitions).
  useEffect(() => {
    const el = audioRef.current;
    if (el) el.playbackRate = speed;
  }, [speed]);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    pauseOtherPlayers(selfRef.current);
    el.playbackRate = speed;
    // play() returns a promise in browsers (and undefined under a jsdom stub).
    const started = el.play() as Promise<void> | undefined;
    started?.catch(() => setPlaying(false));
    setPlaying(true);
  }, [playing, speed]);

  const seek = useCallback(
    (nextFraction: number) => {
      const el = audioRef.current;
      const time = fractionToTime(nextFraction, total);
      if (el) el.currentTime = time;
      setCurrentTime(time);
    },
    [total],
  );

  const cycleSpeed = useCallback(() => {
    setSpeedIdx((i) => (i + 1) % SPEEDS.length);
  }, []);

  // Bar elements are memoized so a `timeupdate` only rewrites the wrapper's
  // --qc-vn-progress custom property — the 40 bars never re-render, and the
  // played/unplayed split is done in CSS via clip-path.
  const barEls = useMemo(
    () =>
      bars.map((height, i) => (
        <span
          key={i}
          className="qc-voice-note__bar"
          style={{ height: `${Math.round(height * 100)}%` }}
        />
      )),
    [bars],
  );

  const elapsedLabel = formatVoiceDuration(currentTime);
  const totalLabel = formatVoiceDuration(total);

  return (
    <div className="qc-voice-note" data-testid="voice-note-player">
      <span className="qc-voice-note__label">
        <Mic size={13} aria-hidden />
        Voice message
        {total ? ` · ${totalLabel}` : ""}
      </span>
      <div className="qc-voice-note__player">
        <IconButton
          className="qc-voice-note__play"
          label={playing ? "Pause voice message" : "Play voice message"}
          onClick={toggle}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </IconButton>

        <div className="qc-voice-note__track">
          <span
            className="qc-voice-note__wave"
            aria-hidden
            data-testid="voice-note-wave"
            style={{ "--qc-vn-progress": String(fraction) } as React.CSSProperties}
          >
            <span className="qc-voice-note__bars">{barEls}</span>
            <span className="qc-voice-note__bars qc-voice-note__bars--played">{barEls}</span>
          </span>
          {/* A transparent range input over the bars buys pointer drag, arrow-key
              stepping and screen-reader semantics without reimplementing any. */}
          <input
            className="qc-voice-note__scrub"
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={fraction}
            disabled={!seekable}
            aria-label="Seek voice message"
            aria-valuetext={`${elapsedLabel} of ${totalLabel}`}
            onChange={(e) => seek(Number(e.target.value))}
          />
        </div>

        <span className="qc-voice-note__time" data-testid="voice-note-time">
          {elapsedLabel} / {totalLabel}
        </span>

        <button
          type="button"
          className="qc-voice-note__speed"
          onClick={cycleSpeed}
          aria-label={`Playback speed ${speed}×`}
        >
          {speed}×
        </button>

        <audio
          ref={audioRef}
          src={url}
          // durationSec is authoritative and persisted, so a real voice note needs
          // no metadata probe — preloading would cost one signed-URL range request
          // per note on every channel open. Only the plain-attachment fallback,
          // which has no persisted duration, has to fetch metadata.
          preload={durationSec === undefined ? "metadata" : "none"}
          data-testid="voice-note-audio"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            const probed = e.currentTarget.duration;
            // Only a finite value is usable, and only as a fallback.
            if (durationSec === undefined && Number.isFinite(probed)) setProbedDuration(probed);
          }}
          onEnded={(e) => {
            e.currentTarget.currentTime = 0;
            setCurrentTime(0);
            setPlaying(false);
          }}
        />
      </div>
    </div>
  );
}
