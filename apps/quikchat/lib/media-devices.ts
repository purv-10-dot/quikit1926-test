"use client";

/**
 * Media device enumeration + per-machine selection.
 *
 * The shared module for ALL device selection in QuikChat. Session A consumes it
 * from Settings → Devices and from `use-voice-recorder`; Session B refactors the
 * in-call picker (`components/calling/CallControls.tsx`, which today enumerates
 * inline with no persistence) onto it and adds speaker routing. Keep the
 * constraint builders + `isDeviceUnavailableError` here so both the recorder and
 * the call code produce IDENTICAL constraints and share the stale-id fallback.
 *
 * Selection is localStorage-only, deliberately. A `deviceId` is scoped to one
 * machine AND one origin, and browsers rotate it when the user clears site data
 * — syncing it server-side would push meaningless ids between devices.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** UI-facing device kinds. */
export type DeviceKind = "mic" | "speaker" | "camera";

/** The `MediaDeviceKind` each UI kind maps to. */
export const MEDIA_DEVICE_KIND: Record<DeviceKind, MediaDeviceKind> = {
  mic: "audioinput",
  speaker: "audiooutput",
  camera: "videoinput",
};

export interface DeviceOption {
  deviceId: string;
  label: string;
}

export interface DeviceSnapshot {
  mics: DeviceOption[];
  speakers: DeviceOption[];
  cameras: DeviceOption[];
  /** `navigator.mediaDevices` exists (false during SSR / on old browsers). */
  supported: boolean;
  /**
   * False when devices exist but every label is blank — the browser withholds
   * names until capture permission has been granted once. An empty device list
   * is NOT a permission problem, so it reports true.
   */
  labelsAvailable: boolean;
  /**
   * `HTMLMediaElement.setSinkId` exists — i.e. output routing can actually be
   * applied. Chromium-only today; Firefox/Safari enumerate no `audiooutput`
   * and/or can't route, so the speaker picker degrades to disabled.
   */
  outputSelectionSupported: boolean;
}

export const EMPTY_SNAPSHOT: DeviceSnapshot = {
  mics: [],
  speakers: [],
  cameras: [],
  supported: false,
  labelsAvailable: true,
  outputSelectionSupported: false,
};

function hasMediaDevices(): boolean {
  return (
    typeof navigator !== "undefined" && typeof navigator.mediaDevices?.enumerateDevices === "function"
  );
}

/** True when an <audio>/<video> element can be routed to a chosen output. */
export function isOutputSelectionSupported(): boolean {
  return typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
}

function toOptions(devices: MediaDeviceInfo[], kind: MediaDeviceKind): DeviceOption[] {
  return devices
    .filter((d) => d.kind === kind)
    // Pre-permission browsers report placeholder entries with a blank deviceId;
    // they can't be selected, so they're not offered as options (the blank
    // labels still drive `labelsAvailable` below).
    .filter((d) => !!d.deviceId)
    .map((d) => ({ deviceId: d.deviceId, label: d.label }));
}

/** Enumerate and split by kind. Never throws — an unsupported/blocked browser yields empty lists. */
export async function enumerateDevices(): Promise<DeviceSnapshot> {
  if (!hasMediaDevices()) return { ...EMPTY_SNAPSHOT };
  let devices: MediaDeviceInfo[];
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch {
    return { ...EMPTY_SNAPSHOT, supported: true };
  }
  const labelsHidden = devices.length > 0 && devices.every((d) => !d.label);
  return {
    mics: toOptions(devices, "audioinput"),
    speakers: toOptions(devices, "audiooutput"),
    cameras: toOptions(devices, "videoinput"),
    supported: true,
    labelsAvailable: !labelsHidden,
    outputSelectionSupported: isOutputSelectionSupported(),
  };
}

/**
 * Grab a capture permission purely to unlock device LABELS, then release it
 * immediately — we never keep the stream. Camera is requested separately from
 * mic so reading device names can't switch the webcam on unnecessarily.
 */
export async function requestDeviceLabels(kind: "mic" | "camera"): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia(
      kind === "mic" ? { audio: true } : { video: true },
    );
    for (const track of stream.getTracks()) track.stop();
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Persistence (localStorage — per machine, never server-synced)
// ============================================================================

export const DEVICE_STORAGE_KEY = "qc.devices.v1";

export interface SelectedDevices {
  micId?: string;
  speakerId?: string;
  cameraId?: string;
}

const FIELD: Record<DeviceKind, keyof SelectedDevices> = {
  mic: "micId",
  speaker: "speakerId",
  camera: "cameraId",
};

/** Saved selections. Returns `{}` on SSR, blocked storage, or malformed JSON. */
export function getSelectedDevices(): SelectedDevices {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DEVICE_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const { micId, speakerId, cameraId } = parsed as Record<string, unknown>;
    const out: SelectedDevices = {};
    if (typeof micId === "string" && micId) out.micId = micId;
    if (typeof speakerId === "string" && speakerId) out.speakerId = speakerId;
    if (typeof cameraId === "string" && cameraId) out.cameraId = cameraId;
    return out;
  } catch {
    return {};
  }
}

/** Persist one selection. An empty `deviceId` clears it (back to system default). */
export function setSelectedDevice(kind: DeviceKind, deviceId: string): void {
  if (typeof window === "undefined") return;
  const next = getSelectedDevices();
  if (deviceId) next[FIELD[kind]] = deviceId;
  else delete next[FIELD[kind]];
  try {
    window.localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked/full — selection stays in-memory for this session only.
  }
}

/**
 * The saved id ONLY if that device is currently present, else undefined ("use
 * the system default"). Note it does not erase the saved value: unplugging a
 * headset must not forget the choice for when it's plugged back in.
 */
export function resolveSelectedId(
  list: DeviceOption[],
  savedId: string | undefined,
): string | undefined {
  if (!savedId) return undefined;
  return list.some((d) => d.deviceId === savedId) ? savedId : undefined;
}

// ============================================================================
// Constraints (shared with Session B's call code — keep the semantics identical)
// ============================================================================

/** `getUserMedia` audio constraint for a chosen mic, or `true` for the default. */
export function micConstraint(micId?: string): MediaTrackConstraints | true {
  return micId ? { deviceId: { exact: micId } } : true;
}

/** `getUserMedia` video constraint for a chosen camera, or `true` for the default. */
export function cameraConstraint(cameraId?: string): MediaTrackConstraints | true {
  return cameraId ? { deviceId: { exact: cameraId } } : true;
}

/**
 * True when `getUserMedia` failed *because the exact device isn't available*
 * (unplugged, or a stale id from cleared site data) rather than because the user
 * denied access. Callers retry once without the deviceId; a denial must NOT be
 * retried, or we'd re-prompt in a loop.
 */
export function isDeviceUnavailableError(err: unknown): boolean {
  const name = err instanceof Error ? err.name : "";
  return name === "OverconstrainedError" || name === "NotFoundError";
}

// ============================================================================
// Hook
// ============================================================================

export interface UseMediaDevices extends DeviceSnapshot {
  /** Re-enumerate now (after granting permission, or on demand). */
  refresh: () => Promise<void>;
  /** Unlock labels for one kind, then re-enumerate. */
  requestLabels: (kind: "mic" | "camera") => Promise<boolean>;
}

/**
 * Enumerates on mount and re-enumerates on `devicechange`, so plugging or
 * unplugging a headset updates the lists live. The listener is always removed on
 * unmount, and no state is set after unmount.
 */
export function useMediaDevices(): UseMediaDevices {
  const [snapshot, setSnapshot] = useState<DeviceSnapshot>(EMPTY_SNAPSHOT);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const next = await enumerateDevices();
    if (mountedRef.current) setSnapshot(next);
  }, []);

  const requestLabels = useCallback(
    async (kind: "mic" | "camera") => {
      const ok = await requestDeviceLabels(kind);
      // Re-enumerate either way: a partial grant can still reveal some names.
      await refresh();
      return ok;
    },
    [refresh],
  );

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    if (!hasMediaDevices()) return () => {
      mountedRef.current = false;
    };
    const target = navigator.mediaDevices;
    const onChange = () => void refresh();
    target.addEventListener?.("devicechange", onChange);
    return () => {
      mountedRef.current = false;
      target.removeEventListener?.("devicechange", onChange);
    };
  }, [refresh]);

  return { ...snapshot, refresh, requestLabels };
}
