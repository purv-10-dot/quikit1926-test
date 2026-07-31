"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import {
  getSelectedDevices,
  resolveSelectedId,
  setSelectedDevice,
  useMediaDevices,
  type DeviceKind,
  type DeviceOption,
} from "@/lib/media-devices";

function DeviceRow({
  title,
  desc,
  options,
  value,
  onChange,
  disabled,
  note,
}: {
  title: string;
  desc: string;
  options: DeviceOption[];
  value: string;
  onChange: (deviceId: string) => void;
  disabled?: boolean;
  note?: string;
}) {
  return (
    <div className="qc-set-row">
      <div className="qc-set-row__text">
        <div className="qc-set-row__title">{title}</div>
        <div className="qc-set-row__desc">{note ?? desc}</div>
      </div>
      <select
        className="qc-set-select"
        aria-label={title}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{disabled ? "Not available" : "Default"}</option>
        {options.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {/* Pre-permission browsers report blank labels; the id prefix keeps
                the option distinguishable rather than showing an empty row. */}
            {d.label || `${title} ${d.deviceId.slice(0, 8)}`}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Settings → Devices. Microphone / Speaker / Camera pickers backed by
 * `lib/media-devices` (localStorage, per machine — a deviceId is machine- and
 * origin-specific, so it is never synced server-side).
 *
 * Applied today by voice notes (`use-voice-recorder`). Calls still use their own
 * in-call picker until Session B moves `CallControls` onto this module.
 */
export function DevicesSettings() {
  const devices = useMediaDevices();
  const [selected, setSelected] = useState(() => getSelectedDevices());

  // Re-read after mount so SSR renders the neutral "Default" state and hydration
  // matches (localStorage is unavailable on the server).
  useEffect(() => {
    setSelected(getSelectedDevices());
  }, []);

  function pick(kind: DeviceKind, deviceId: string) {
    setSelectedDevice(kind, deviceId);
    setSelected(getSelectedDevices());
  }

  // A saved id that isn't in the current list (device unplugged) shows as
  // "Default" without the stored preference being erased.
  const micValue = resolveSelectedId(devices.mics, selected.micId) ?? "";
  const speakerValue = resolveSelectedId(devices.speakers, selected.speakerId) ?? "";
  const cameraValue = resolveSelectedId(devices.cameras, selected.cameraId) ?? "";

  // Output routing needs HTMLMediaElement.setSinkId (Chromium-only today), and
  // Firefox/Safari also enumerate no audiooutput devices. Degrade to a disabled
  // control with an explanation rather than a picker that silently does nothing.
  const speakerUnsupported = !devices.outputSelectionSupported || devices.speakers.length === 0;
  const camerasHidden = devices.cameras.length === 0 && !devices.labelsAvailable;

  return (
    <div className="qc-set-section__body">
      {!devices.supported ? (
        <div className="qc-set-note" data-testid="devices-unsupported">
          This browser can&apos;t list audio or video devices.
        </div>
      ) : null}

      {devices.supported && !devices.labelsAvailable ? (
        <div className="qc-set-note" data-testid="devices-permission-prompt">
          <span>Allow microphone access to see and choose your devices by name.</span>
          <Button variant="primary" onClick={() => void devices.requestLabels("mic")}>
            Allow access
          </Button>
        </div>
      ) : null}

      <DeviceRow
        title="Microphone"
        desc="Used for voice messages and calls."
        options={devices.mics}
        value={micValue}
        onChange={(id) => pick("mic", id)}
      />

      <DeviceRow
        title="Speaker"
        desc="Where call audio plays."
        options={devices.speakers}
        value={speakerValue}
        onChange={(id) => pick("speaker", id)}
        disabled={speakerUnsupported}
        note={
          speakerUnsupported
            ? "Your browser doesn't support choosing an output device."
            : undefined
        }
      />

      <DeviceRow
        title="Camera"
        desc="Used for video calls."
        options={devices.cameras}
        value={cameraValue}
        onChange={(id) => pick("camera", id)}
      />

      {camerasHidden ? (
        <div className="qc-set-note" data-testid="camera-permission-prompt">
          <span>Allow camera access to choose a camera.</span>
          <Button variant="primary" onClick={() => void devices.requestLabels("camera")}>
            Allow camera access
          </Button>
        </div>
      ) : null}
    </div>
  );
}
