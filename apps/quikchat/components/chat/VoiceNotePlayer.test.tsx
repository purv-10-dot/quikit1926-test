// @vitest-environment jsdom
/**
 * VoiceNotePlayer. jsdom implements no media playback at all — play/pause/load
 * throw "Not implemented" and currentTime/duration/playbackRate are inert — so
 * they're stubbed on the prototype here. Everything asserted below is our own
 * state machine driven through the element's events, which is exactly the seam
 * the component is built on.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pseudoPeaks } from "@/lib/voice-peaks";
import { VoiceNotePlayer } from "./VoiceNotePlayer";

let play: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;

/** Make the media element scriptable in jsdom. */
function stubMediaElement() {
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    writable: true,
    value: play,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    writable: true,
    value: pause,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "load", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
  // jsdom's currentTime is read-only-ish and duration is always NaN.
  let time = 0;
  Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
    configurable: true,
    get: () => time,
    set: (v: number) => {
      time = v;
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, "playbackRate", {
    configurable: true,
    writable: true,
    value: 1,
  });
}

const SEED = "quikchat/org/chan/uuid-voice-message.webm";

function renderPlayer(props: Partial<React.ComponentProps<typeof VoiceNotePlayer>> = {}) {
  return render(
    <VoiceNotePlayer url="https://example.test/voice.webm" durationSec={8} seed={SEED} {...props} />,
  );
}

const audioEl = () => screen.getByTestId("voice-note-audio") as HTMLAudioElement;
const waveEl = () => screen.getByTestId("voice-note-wave");
const scrub = () => screen.getByRole("slider", { name: "Seek voice message" }) as HTMLInputElement;
const progress = () => waveEl().style.getPropertyValue("--qc-vn-progress");

beforeEach(() => {
  stubMediaElement();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("VoiceNotePlayer", () => {
  it("renders the label, the bars, and the total duration", () => {
    renderPlayer();

    expect(screen.getByText(/Voice message/)).toBeInTheDocument();
    // 40 bars, drawn twice (unplayed layer + clipped played layer).
    expect(waveEl().querySelectorAll(".qc-voice-note__bar")).toHaveLength(80);
    expect(waveEl()).toHaveAttribute("aria-hidden");
    expect(screen.getByTestId("voice-note-time")).toHaveTextContent("0:00 / 0:08");
  });

  it("uses the audio URL on a real <audio> element with controls removed", () => {
    renderPlayer();
    const el = audioEl();
    expect(el).toHaveAttribute("src", "https://example.test/voice.webm");
    // Custom UI — the native controls must not render.
    expect(el).not.toHaveAttribute("controls");
    // A voice note carries a persisted duration, so there's nothing to probe:
    // preloading would cost a signed-URL range request per note per channel open.
    expect(el).toHaveAttribute("preload", "none");
  });

  it("preloads metadata ONLY for a plain attachment with no persisted duration", () => {
    renderPlayer({ durationSec: undefined });
    // This is the one case that genuinely needs the probe — it's where the
    // audio.duration fallback gets its value.
    expect(audioEl()).toHaveAttribute("preload", "metadata");
  });

  it("draws deterministic bar heights from the seed", () => {
    const { unmount } = renderPlayer();
    const first = Array.from(waveEl().querySelectorAll(".qc-voice-note__bar")).map(
      (b) => (b as HTMLElement).style.height,
    );
    unmount();

    renderPlayer();
    const second = Array.from(waveEl().querySelectorAll(".qc-voice-note__bar")).map(
      (b) => (b as HTMLElement).style.height,
    );
    expect(second).toEqual(first);
    // And they follow the pure helper, not something ad-hoc.
    expect(first[0]).toBe(`${Math.round(pseudoPeaks(SEED)[0]! * 100)}%`);
  });

  it("prefers real peaks when provided", () => {
    renderPlayer({ peaks: [1, 0.5] });
    const bars = waveEl().querySelectorAll(".qc-voice-note__bar");
    expect(bars).toHaveLength(4); // 2 bars × 2 layers
    expect((bars[0] as HTMLElement).style.height).toBe("100%");
    expect((bars[1] as HTMLElement).style.height).toBe("50%");
  });

  it("play toggles to pause and back", () => {
    renderPlayer();

    fireEvent.click(screen.getByRole("button", { name: "Play voice message" }));
    expect(play).toHaveBeenCalledTimes(1);

    const pauseBtn = screen.getByRole("button", { name: "Pause voice message" });
    fireEvent.click(pauseBtn);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Play voice message" })).toBeInTheDocument();
  });

  it("timeupdate advances the progress property and the elapsed readout", () => {
    renderPlayer();
    expect(progress()).toBe("0");

    const el = audioEl();
    el.currentTime = 2;
    fireEvent.timeUpdate(el);

    expect(progress()).toBe("0.25"); // 2 / 8
    expect(screen.getByTestId("voice-note-time")).toHaveTextContent("0:02 / 0:08");
  });

  it("scrubbing sets currentTime from the fraction", () => {
    renderPlayer();

    fireEvent.change(scrub(), { target: { value: "0.5" } });

    expect(audioEl().currentTime).toBe(4); // 0.5 × 8s
    expect(progress()).toBe("0.5");
    expect(screen.getByTestId("voice-note-time")).toHaveTextContent("0:04 / 0:08");
  });

  it("exposes an accessible seek slider with a spoken value", () => {
    renderPlayer();
    const s = scrub();
    expect(s).toHaveAttribute("min", "0");
    expect(s).toHaveAttribute("max", "1");
    expect(s).toBeEnabled();
    expect(s).toHaveAttribute("aria-valuetext", "0:00 of 0:08");
  });

  it("speed cycles 1× → 1.5× → 2× → 1× onto playbackRate", () => {
    renderPlayer();
    const el = audioEl();
    const btn = () => screen.getByRole("button", { name: /Playback speed/ });

    expect(btn()).toHaveTextContent("1×");
    fireEvent.click(btn());
    expect(btn()).toHaveTextContent("1.5×");
    expect(el.playbackRate).toBe(1.5);
    fireEvent.click(btn());
    expect(btn()).toHaveTextContent("2×");
    expect(el.playbackRate).toBe(2);
    fireEvent.click(btn());
    expect(btn()).toHaveTextContent("1×");
    expect(el.playbackRate).toBe(1);
  });

  it("ended resets to the start and back to Play", () => {
    renderPlayer();
    const el = audioEl();
    fireEvent.click(screen.getByRole("button", { name: "Play voice message" }));
    el.currentTime = 7;
    fireEvent.timeUpdate(el);
    expect(progress()).toBe("0.875");

    fireEvent.ended(el);

    expect(el.currentTime).toBe(0);
    expect(progress()).toBe("0");
    expect(screen.getByRole("button", { name: "Play voice message" })).toBeInTheDocument();
  });

  it("starting a second voice note pauses the first", () => {
    render(
      <>
        <div data-testid="first">
          <VoiceNotePlayer url="/a.webm" durationSec={5} seed="seed-a" />
        </div>
        <div data-testid="second">
          <VoiceNotePlayer url="/b.webm" durationSec={5} seed="seed-b" />
        </div>
      </>,
    );

    const first = within(screen.getByTestId("first"));
    const second = within(screen.getByTestId("second"));

    fireEvent.click(first.getByRole("button", { name: "Play voice message" }));
    expect(first.getByRole("button", { name: "Pause voice message" })).toBeInTheDocument();

    fireEvent.click(second.getByRole("button", { name: "Play voice message" }));

    // The first one was paused via the registry…
    expect(pause).toHaveBeenCalled();
    // …and its button reverted, while the second is now playing.
    expect(first.getByRole("button", { name: "Play voice message" })).toBeInTheDocument();
    expect(second.getByRole("button", { name: "Pause voice message" })).toBeInTheDocument();
  });

  it("unmounting removes the player from the registry", () => {
    const { unmount } = render(
      <>
        <div data-testid="keeper">
          <VoiceNotePlayer url="/a.webm" durationSec={5} seed="seed-a" />
        </div>
      </>,
    );
    unmount();
    pause.mockClear();

    // A fresh player's play() must not try to pause the unmounted one.
    render(<VoiceNotePlayer url="/b.webm" durationSec={5} seed="seed-b" />);
    fireEvent.click(screen.getByRole("button", { name: "Play voice message" }));

    expect(pause).not.toHaveBeenCalled();
  });

  it("an external pause event syncs the button back to Play", () => {
    renderPlayer();
    fireEvent.click(screen.getByRole("button", { name: "Play voice message" }));

    fireEvent.pause(audioEl());

    expect(screen.getByRole("button", { name: "Play voice message" })).toBeInTheDocument();
  });

  describe("duration handling", () => {
    it("durationSec wins and audio.duration is never consulted", () => {
      renderPlayer({ durationSec: 8 });
      const el = audioEl();
      Object.defineProperty(el, "duration", { configurable: true, value: 999 });

      fireEvent.loadedMetadata(el);

      expect(screen.getByTestId("voice-note-time")).toHaveTextContent("0:00 / 0:08");
    });

    it("falls back to a FINITE audio.duration only when durationSec is absent", () => {
      renderPlayer({ durationSec: undefined });
      expect(screen.getByTestId("voice-note-time")).toHaveTextContent("0:00 / 0:00");
      const el = audioEl();
      Object.defineProperty(el, "duration", { configurable: true, value: 12 });

      fireEvent.loadedMetadata(el);

      expect(screen.getByTestId("voice-note-time")).toHaveTextContent("0:00 / 0:12");
      expect(scrub()).toBeEnabled();
    });

    it("ignores an Infinity duration — the MediaRecorder webm case — and disables seeking", () => {
      renderPlayer({ durationSec: undefined });
      const el = audioEl();
      Object.defineProperty(el, "duration", { configurable: true, value: Infinity });

      fireEvent.loadedMetadata(el);

      expect(screen.getByTestId("voice-note-time")).toHaveTextContent("0:00 / 0:00");
      // Nothing to seek within, so the slider is disabled rather than lying.
      expect(scrub()).toBeDisabled();
    });

    it("ignores a NaN duration", () => {
      renderPlayer({ durationSec: undefined });
      const el = audioEl();
      Object.defineProperty(el, "duration", { configurable: true, value: NaN });

      fireEvent.loadedMetadata(el);

      expect(scrub()).toBeDisabled();
      // Playback still works — only seeking is unavailable.
      fireEvent.click(screen.getByRole("button", { name: "Play voice message" }));
      expect(play).toHaveBeenCalled();
    });
  });
});
