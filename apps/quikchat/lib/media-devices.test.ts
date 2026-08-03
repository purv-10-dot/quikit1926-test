// @vitest-environment jsdom
/**
 * Device enumeration + per-machine selection. jsdom has no
 * `navigator.mediaDevices`, so it's installed per-test — which also lets us
 * exercise the unsupported-browser path by leaving it off.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cameraConstraint,
  DEVICE_STORAGE_KEY,
  deviceErrorMessage,
  enumerateDevices,
  getSelectedDevices,
  isDeviceUnavailableError,
  isOutputSelectionSupported,
  MEDIA_DEVICE_KIND,
  micConstraint,
  requestDeviceLabels,
  resolveSelectedId,
  setSelectedDevice,
  useMediaDevices,
} from "./media-devices";

type FakeDevice = { deviceId: string; kind: MediaDeviceKind; label: string };

const DEVICES: FakeDevice[] = [
  { deviceId: "mic-1", kind: "audioinput", label: "Headset Mic" },
  { deviceId: "mic-2", kind: "audioinput", label: "Laptop Mic" },
  { deviceId: "spk-1", kind: "audiooutput", label: "Headset Speaker" },
  { deviceId: "cam-1", kind: "videoinput", label: "HD Webcam" },
];

let listeners: Record<string, (() => void)[]>;
let enumerate: ReturnType<typeof vi.fn>;
let getUserMedia: ReturnType<typeof vi.fn>;

function installMediaDevices(devices: FakeDevice[] = DEVICES) {
  listeners = {};
  enumerate = vi.fn().mockResolvedValue(devices);
  getUserMedia = vi.fn();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    writable: true,
    value: {
      enumerateDevices: (...a: unknown[]) => enumerate(...a),
      getUserMedia: (...a: unknown[]) => getUserMedia(...a),
      addEventListener: (type: string, fn: () => void) => {
        (listeners[type] ??= []).push(fn);
      },
      removeEventListener: (type: string, fn: () => void) => {
        listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
      },
    },
  });
}

function removeMediaDevices() {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    writable: true,
    value: undefined,
  });
}

/** Pretend the browser can route element output (Chromium). */
function enableSetSinkId() {
  (HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId = () =>
    Promise.resolve();
}
function disableSetSinkId() {
  delete (HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId;
}

beforeEach(() => {
  localStorage.clear();
  installMediaDevices();
  enableSetSinkId();
});

afterEach(() => {
  disableSetSinkId();
  vi.restoreAllMocks();
});

describe("enumerateDevices", () => {
  it("splits devices by kind", async () => {
    const snap = await enumerateDevices();
    expect(snap.mics).toEqual([
      { deviceId: "mic-1", label: "Headset Mic" },
      { deviceId: "mic-2", label: "Laptop Mic" },
    ]);
    expect(snap.speakers).toEqual([{ deviceId: "spk-1", label: "Headset Speaker" }]);
    expect(snap.cameras).toEqual([{ deviceId: "cam-1", label: "HD Webcam" }]);
    expect(snap.supported).toBe(true);
    expect(snap.labelsAvailable).toBe(true);
    expect(snap.outputSelectionSupported).toBe(true);
  });

  it("reports labelsAvailable false when the browser withholds every name", async () => {
    // Pre-permission Chrome: one placeholder per kind, blank id AND blank label.
    installMediaDevices([
      { deviceId: "", kind: "audioinput", label: "" },
      { deviceId: "", kind: "videoinput", label: "" },
    ]);
    const snap = await enumerateDevices();
    expect(snap.labelsAvailable).toBe(false);
    // Unselectable placeholders are not offered as options.
    expect(snap.mics).toEqual([]);
    expect(snap.cameras).toEqual([]);
  });

  it("treats an empty device list as a non-permission problem", async () => {
    installMediaDevices([]);
    const snap = await enumerateDevices();
    expect(snap.labelsAvailable).toBe(true);
    expect(snap.mics).toEqual([]);
  });

  it("returns empty lists on an unsupported browser instead of throwing", async () => {
    removeMediaDevices();
    const snap = await enumerateDevices();
    expect(snap).toMatchObject({ supported: false, mics: [], speakers: [], cameras: [] });
  });

  it("survives an enumerateDevices rejection", async () => {
    enumerate.mockRejectedValue(new Error("blocked"));
    const snap = await enumerateDevices();
    expect(snap).toMatchObject({ supported: true, mics: [] });
  });

  it("reports outputSelectionSupported false without setSinkId (Firefox/Safari)", async () => {
    disableSetSinkId();
    expect(isOutputSelectionSupported()).toBe(false);
    const snap = await enumerateDevices();
    expect(snap.outputSelectionSupported).toBe(false);
  });
});

describe("requestDeviceLabels", () => {
  it("grabs a mic permission and releases the stream immediately", async () => {
    const track = { stop: vi.fn() };
    getUserMedia.mockResolvedValue({ getTracks: () => [track] });

    await expect(requestDeviceLabels("mic")).resolves.toEqual({ ok: true });
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    // We only wanted the permission — never hold the device open.
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it("requests video (not audio) for the camera, so reading names can't open the mic", async () => {
    const track = { stop: vi.fn() };
    getUserMedia.mockResolvedValue({ getTracks: () => [track] });
    await requestDeviceLabels("camera");
    expect(getUserMedia).toHaveBeenCalledWith({ video: true });
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it("reports WHY it failed instead of a bare false", async () => {
    const denied = new Error("Permission denied");
    denied.name = "NotAllowedError";
    getUserMedia.mockRejectedValue(denied);

    // The old boolean made denied/missing/busy indistinguishable from success.
    await expect(requestDeviceLabels("mic")).resolves.toEqual({
      ok: false,
      error: "Microphone access was blocked. Allow it in your browser settings to choose a microphone.",
    });
  });

  it("reports camera wording for a camera failure", async () => {
    const denied = new Error("Permission denied");
    denied.name = "NotAllowedError";
    getUserMedia.mockRejectedValue(denied);

    await expect(requestDeviceLabels("camera")).resolves.toEqual({
      ok: false,
      error: "Camera access was blocked. Allow it in your browser settings to choose a camera.",
    });
  });

  it("reports a reason on a browser with no mediaDevices", async () => {
    removeMediaDevices();
    const result = await requestDeviceLabels("mic");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/can't access audio or video devices/);
  });
});

describe("deviceErrorMessage", () => {
  const mk = (name: string, message = "boom") => Object.assign(new Error(message), { name });

  it.each([
    ["NotAllowedError", "mic", "Microphone access was blocked"],
    ["SecurityError", "mic", "Microphone access was blocked"],
    ["NotFoundError", "mic", "No microphone found."],
    ["DevicesNotFoundError", "mic", "No microphone found."],
    ["NotReadableError", "mic", "already in use by another app"],
    ["TrackStartError", "mic", "already in use by another app"],
    ["NotAllowedError", "camera", "Camera access was blocked"],
    ["NotFoundError", "camera", "No camera found."],
    ["NotReadableError", "camera", "already in use by another app"],
  ] as const)("maps %s for %s", (name, kind, expected) => {
    expect(deviceErrorMessage(kind, mk(name))).toContain(expected);
  });

  it("falls back to the error message, then to a generic line", () => {
    expect(deviceErrorMessage("mic", mk("WeirdError", "something odd"))).toBe("something odd");
    expect(deviceErrorMessage("camera", "not an error")).toBe("Couldn't get camera access.");
  });
});

describe("persistence", () => {
  it("round-trips a selection per kind under the versioned key", () => {
    setSelectedDevice("mic", "mic-1");
    setSelectedDevice("speaker", "spk-1");
    setSelectedDevice("camera", "cam-1");
    expect(getSelectedDevices()).toEqual({
      micId: "mic-1",
      speakerId: "spk-1",
      cameraId: "cam-1",
    });
    expect(JSON.parse(localStorage.getItem(DEVICE_STORAGE_KEY)!)).toMatchObject({
      micId: "mic-1",
    });
  });

  it("an empty deviceId clears that kind back to default", () => {
    setSelectedDevice("mic", "mic-1");
    setSelectedDevice("mic", "");
    expect(getSelectedDevices().micId).toBeUndefined();
  });

  it("returns {} for missing, malformed, or wrong-typed stored values", () => {
    expect(getSelectedDevices()).toEqual({});
    localStorage.setItem(DEVICE_STORAGE_KEY, "not json");
    expect(getSelectedDevices()).toEqual({});
    localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify({ micId: 42 }));
    expect(getSelectedDevices()).toEqual({});
    localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(["nope"]));
    expect(getSelectedDevices()).toEqual({});
  });

  it("does not throw when localStorage is blocked", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    expect(() => setSelectedDevice("mic", "mic-1")).not.toThrow();
    setItem.mockRestore();
  });
});

describe("resolveSelectedId (stale device → default)", () => {
  const mics = [{ deviceId: "mic-1", label: "Headset Mic" }];

  it("returns the id when the device is present", () => {
    expect(resolveSelectedId(mics, "mic-1")).toBe("mic-1");
  });

  it("returns undefined for an id that's gone (unplugged / rotated)", () => {
    expect(resolveSelectedId(mics, "mic-gone")).toBeUndefined();
  });

  it("returns undefined when nothing is saved", () => {
    expect(resolveSelectedId(mics, undefined)).toBeUndefined();
  });

  it("does NOT erase the stored preference — a replugged device is remembered", () => {
    setSelectedDevice("mic", "mic-gone");
    expect(resolveSelectedId(mics, getSelectedDevices().micId)).toBeUndefined();
    expect(getSelectedDevices().micId).toBe("mic-gone");
  });
});

describe("constraints shared with the call code", () => {
  it("builds an exact-deviceId constraint, or true for the default", () => {
    expect(micConstraint("mic-1")).toEqual({ deviceId: { exact: "mic-1" } });
    expect(micConstraint(undefined)).toBe(true);
    expect(cameraConstraint("cam-1")).toEqual({ deviceId: { exact: "cam-1" } });
    expect(cameraConstraint(undefined)).toBe(true);
  });

  it("classifies only device-unavailable failures as retryable", () => {
    const mk = (name: string) => Object.assign(new Error(name), { name });
    expect(isDeviceUnavailableError(mk("OverconstrainedError"))).toBe(true);
    expect(isDeviceUnavailableError(mk("NotFoundError"))).toBe(true);
    // A denial must never be retried — that would re-prompt in a loop.
    expect(isDeviceUnavailableError(mk("NotAllowedError"))).toBe(false);
    expect(isDeviceUnavailableError("nope")).toBe(false);
  });

  it("maps UI kinds to MediaDeviceKind", () => {
    expect(MEDIA_DEVICE_KIND).toEqual({
      mic: "audioinput",
      speaker: "audiooutput",
      camera: "videoinput",
    });
  });
});

describe("useMediaDevices", () => {
  it("enumerates on mount", async () => {
    const { result } = renderHook(() => useMediaDevices());
    await waitFor(() => expect(result.current.mics).toHaveLength(2));
    expect(result.current.speakers).toHaveLength(1);
    expect(result.current.cameras).toHaveLength(1);
  });

  it("re-enumerates on devicechange (headset plugged in)", async () => {
    const { result } = renderHook(() => useMediaDevices());
    await waitFor(() => expect(result.current.mics).toHaveLength(2));

    enumerate.mockResolvedValue([
      ...DEVICES,
      { deviceId: "mic-3", kind: "audioinput", label: "USB Mic" },
    ]);
    await act(async () => {
      listeners.devicechange?.forEach((fn) => fn());
    });

    await waitFor(() => expect(result.current.mics).toHaveLength(3));
  });

  it("removes the devicechange listener on unmount", async () => {
    const { result, unmount } = renderHook(() => useMediaDevices());
    await waitFor(() => expect(result.current.mics).toHaveLength(2));
    expect(listeners.devicechange).toHaveLength(1);

    unmount();

    expect(listeners.devicechange).toHaveLength(0);
  });

  it("requestLabels unlocks names then re-enumerates", async () => {
    installMediaDevices([{ deviceId: "", kind: "audioinput", label: "" }]);
    const track = { stop: vi.fn() };
    getUserMedia.mockResolvedValue({ getTracks: () => [track] });

    const { result } = renderHook(() => useMediaDevices());
    await waitFor(() => expect(result.current.labelsAvailable).toBe(false));

    // Granting reveals the real device.
    enumerate.mockResolvedValue(DEVICES);
    await act(async () => {
      await result.current.requestLabels("mic");
    });

    expect(result.current.labelsAvailable).toBe(true);
    expect(result.current.mics).toHaveLength(2);
  });

  it("is inert on an unsupported browser (no crash, no listener)", async () => {
    removeMediaDevices();
    const { result, unmount } = renderHook(() => useMediaDevices());
    await waitFor(() => expect(result.current.supported).toBe(false));
    expect(result.current.mics).toEqual([]);
    expect(() => unmount()).not.toThrow();
  });
});
