// @vitest-environment jsdom
/**
 * Settings → Devices. Renders against a mocked `navigator.mediaDevices` and
 * asserts the three pickers, the persistence write, the labels-need-permission
 * flow, and the speaker degrade when the browser can't route output.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEVICE_STORAGE_KEY, getSelectedDevices, setSelectedDevice } from "@/lib/media-devices";
import { DevicesSettings } from "./DevicesSettings";

type FakeDevice = { deviceId: string; kind: MediaDeviceKind; label: string };

const DEVICES: FakeDevice[] = [
  { deviceId: "mic-1", kind: "audioinput", label: "Headset Mic" },
  { deviceId: "mic-2", kind: "audioinput", label: "Laptop Mic" },
  { deviceId: "spk-1", kind: "audiooutput", label: "Headset Speaker" },
  { deviceId: "cam-1", kind: "videoinput", label: "HD Webcam" },
];

let enumerate: ReturnType<typeof vi.fn>;
let getUserMedia: ReturnType<typeof vi.fn>;

function installMediaDevices(devices: FakeDevice[] = DEVICES) {
  enumerate = vi.fn().mockResolvedValue(devices);
  getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    writable: true,
    value: {
      enumerateDevices: (...a: unknown[]) => enumerate(...a),
      getUserMedia: (...a: unknown[]) => getUserMedia(...a),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
}

const select = (name: string) => screen.getByRole("combobox", { name }) as HTMLSelectElement;

beforeEach(() => {
  localStorage.clear();
  installMediaDevices();
  (HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId = () =>
    Promise.resolve();
});

afterEach(() => {
  delete (HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId;
  vi.restoreAllMocks();
});

describe("DevicesSettings", () => {
  it("renders the three pickers populated with real device labels", async () => {
    render(<DevicesSettings />);

    await waitFor(() => expect(screen.getByText("Headset Mic")).toBeInTheDocument());
    expect(select("Microphone")).toBeInTheDocument();
    expect(select("Speaker")).toBeInTheDocument();
    expect(select("Camera")).toBeInTheDocument();
    expect(screen.getByText("Laptop Mic")).toBeInTheDocument();
    expect(screen.getByText("Headset Speaker")).toBeInTheDocument();
    expect(screen.getByText("HD Webcam")).toBeInTheDocument();
    // Each picker offers the system default.
    expect(screen.getAllByRole("option", { name: "Default" })).toHaveLength(3);
  });

  it("persists a picked microphone to localStorage", async () => {
    render(<DevicesSettings />);
    await waitFor(() => expect(screen.getByText("Headset Mic")).toBeInTheDocument());

    fireEvent.change(select("Microphone"), { target: { value: "mic-2" } });

    expect(getSelectedDevices().micId).toBe("mic-2");
    expect(JSON.parse(localStorage.getItem(DEVICE_STORAGE_KEY)!)).toMatchObject({
      micId: "mic-2",
    });
    expect(select("Microphone").value).toBe("mic-2");
  });

  it("persists speaker and camera independently", async () => {
    render(<DevicesSettings />);
    await waitFor(() => expect(screen.getByText("HD Webcam")).toBeInTheDocument());

    fireEvent.change(select("Speaker"), { target: { value: "spk-1" } });
    fireEvent.change(select("Camera"), { target: { value: "cam-1" } });

    expect(getSelectedDevices()).toMatchObject({ speakerId: "spk-1", cameraId: "cam-1" });
  });

  it("shows a previously saved selection on mount", async () => {
    setSelectedDevice("mic", "mic-2");
    render(<DevicesSettings />);
    await waitFor(() => expect(select("Microphone").value).toBe("mic-2"));
  });

  it("falls back to Default for a saved device that's no longer present", async () => {
    setSelectedDevice("mic", "mic-unplugged");
    render(<DevicesSettings />);

    await waitFor(() => expect(screen.getByText("Headset Mic")).toBeInTheDocument());
    expect(select("Microphone").value).toBe("");
    // The preference survives for when the device comes back.
    expect(getSelectedDevices().micId).toBe("mic-unplugged");
  });

  it("selecting Default clears the stored selection", async () => {
    setSelectedDevice("mic", "mic-2");
    render(<DevicesSettings />);
    await waitFor(() => expect(select("Microphone").value).toBe("mic-2"));

    fireEvent.change(select("Microphone"), { target: { value: "" } });

    expect(getSelectedDevices().micId).toBeUndefined();
  });

  it("prompts for permission when the browser withholds device names, then re-enumerates", async () => {
    installMediaDevices([
      { deviceId: "", kind: "audioinput", label: "" },
      { deviceId: "", kind: "videoinput", label: "" },
    ]);
    render(<DevicesSettings />);

    const prompt = await screen.findByTestId("devices-permission-prompt");
    expect(prompt).toHaveTextContent("Allow microphone access");

    enumerate.mockResolvedValue(DEVICES);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Allow access" }));
    });

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    await waitFor(() => expect(screen.getByText("Headset Mic")).toBeInTheDocument());
    expect(screen.queryByTestId("devices-permission-prompt")).toBeNull();
  });

  it("offers a separate camera-access button so reading names can't open the webcam", async () => {
    installMediaDevices([{ deviceId: "", kind: "videoinput", label: "" }]);
    render(<DevicesSettings />);

    // Resolve the button BEFORE entering act() — an RTL findBy inside act() never
    // settles, since act blocks the flush the query is waiting on.
    const button = await screen.findByRole("button", { name: "Allow camera access" });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(getUserMedia).toHaveBeenCalledWith({ video: true });
  });

  it("disables the speaker picker with a note when output routing is unsupported", async () => {
    delete (HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId;
    render(<DevicesSettings />);

    await waitFor(() => expect(screen.getByText("Headset Mic")).toBeInTheDocument());
    expect(select("Speaker")).toBeDisabled();
    expect(
      screen.getByText("Your browser doesn't support choosing an output device."),
    ).toBeInTheDocument();
    // The input pickers stay usable.
    expect(select("Microphone")).toBeEnabled();
    expect(select("Camera")).toBeEnabled();
  });

  it("disables the speaker picker when no audiooutput devices enumerate (Firefox)", async () => {
    installMediaDevices(DEVICES.filter((d) => d.kind !== "audiooutput"));
    render(<DevicesSettings />);

    await waitFor(() => expect(screen.getByText("Headset Mic")).toBeInTheDocument());
    expect(select("Speaker")).toBeDisabled();
  });

  it("renders an explanation on a browser with no mediaDevices at all", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    render(<DevicesSettings />);

    expect(await screen.findByTestId("devices-unsupported")).toBeInTheDocument();
    // Controls still render (harmlessly empty) rather than crashing.
    expect(select("Microphone")).toBeInTheDocument();
  });
});
