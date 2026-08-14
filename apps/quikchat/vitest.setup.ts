// Load .env.local so integration tests (Prisma against local Postgres) and the
// auth harness see DATABASE_URL / NEXTAUTH_SECRET, mirroring how the app boots.
// This app only ever has `.env.local` (dev secrets, gitignored) — plain
// `dotenv/config` only reads `.env`, which doesn't exist here, so it silently
// loaded nothing. List `.env.local` first so it wins; `.env` stays as a
// fallback for anyone who does have one (dotenv doesn't overwrite keys already
// set by an earlier file in the list).
import { config } from "dotenv";
config({ path: [".env.local", ".env"] });
// Runtime registration of the jest-dom matchers. jest-dom is hoisted to the repo
// root, so `@testing-library/jest-dom/vitest`'s self-extend binds root vitest 4.x's
// `expect` — a different instance than quikchat's nested vitest 3.2.4 that the tests
// use, so the matchers never land ("Invalid Chai property"). Import `expect` from
// vitest HERE (resolves to the nested 3.2.4 the tests share) and extend it directly.
import { expect } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";
expect.extend(matchers);

// Type-side augmentation. The standalone (vitest 1.x) relied on
// "@testing-library/jest-dom/vitest" augmenting `declare module "vitest"`, but this
// monorepo pins vitest 3, where the `Assertion` interface `expect()` returns lives in
// `@vitest/expect` and is only *re-exported* by `vitest` — so augmenting `vitest`
// no longer merges. Target `@vitest/expect` directly so `.toBeInTheDocument()` et al.
// type-check under vitest 3.
declare module "@vitest/expect" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type
  interface Assertion<T = any> extends TestingLibraryMatchers<unknown, T> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, unknown> {}
}

// Keep the suite hermetic: publishFanout must NOT hit a live Redis by default.
// The seam test opts in by setting REDIS_URL itself (with ioredis mocked).
delete process.env.REDIS_URL;
// Keep calendar hermetic too (S15c): a developer's real CALENDAR_MODE=google /
// =microsoft creds in .env must never route getCalendarProvider() to a live
// provider during tests. Provider unit tests construct impls directly with mock
// fetch; everything else gets the stub.
delete process.env.CALENDAR_MODE;
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GOOGLE_CLIENT_SECRET;
delete process.env.GMAIL_REFRESH_TOKEN;
delete process.env.MICROSOFT_CLIENT_ID;
delete process.env.MICROSOFT_CLIENT_SECRET;
delete process.env.MICROSOFT_REDIRECT_URI;
delete process.env.MICROSOFT_CALENDAR_REDIRECT_URL;
// Keep calling hermetic too (CALL-1): a developer's real SFU_MODE/LIVEKIT_*
// creds in .env must never route to a live LiveKit during tests.
delete process.env.SFU_MODE;
delete process.env.LIVEKIT_URL;
delete process.env.LIVEKIT_API_KEY;
delete process.env.LIVEKIT_API_SECRET;
// Deterministic secrets for handshake-token + agent-JWT tests.
process.env.REALTIME_TOKEN_SECRET ??= "test-realtime-secret";
process.env.AGENT_JWT_SECRET ??= "test-agent-secret";
process.env.INTERNAL_API_SECRET ??= "test-internal-secret";

// jsdom doesn't implement scrollIntoView; MessageList calls it on update.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom has no getUserMedia/getDisplayMedia; add mediaDevices to the existing
// navigator without replacing it. Used by voice recorder, screen share, and
// device-settings tests (LiveKit calling goes through the mocked
// "livekit-client" module below, not raw getUserMedia).
if (typeof globalThis.navigator !== "undefined" && !globalThis.navigator.mediaDevices) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis.navigator as any).mediaDevices = {
    getUserMedia: async () => new MediaStream(),
    getDisplayMedia: async () => new MediaStream(),
  };
}

// MediaStream is not available in jsdom; provide a minimal mock for tests.
if (typeof globalThis.MediaStream === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).MediaStream = class MockMediaStream {
    #tracks: unknown[] = [];
    getAudioTracks() {
      return this.#tracks;
    }
    getVideoTracks() {
      return this.#tracks;
    }
    getTracks() {
      return this.#tracks;
    }
  };
}

// livekit-client uses WebRTC APIs that are not available in jsdom; mock the module.
import { vi } from "vitest";

vi.mock("livekit-client", () => ({
  Room: vi.fn(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    localParticipant: {
      setCameraEnabled: vi.fn().mockResolvedValue(undefined),
      setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
      setScreenShareEnabled: vi.fn().mockResolvedValue(undefined),
      isSpeaking: false,
      isMicrophoneEnabled: true,
      isCameraEnabled: true,
      isScreenShareEnabled: false,
      getTrackPublication: vi.fn().mockReturnValue(undefined),
      publishTrack: vi.fn().mockResolvedValue(undefined),
      unpublishTrack: vi.fn().mockResolvedValue(undefined),
    },
    remoteParticipants: new Map(),
    on: vi.fn().mockReturnThis(),
    off: vi.fn().mockReturnThis(),
    state: "connected",
    switchActiveDevice: vi.fn().mockResolvedValue(undefined),
  })),
  RoomEvent: {
    ParticipantConnected: "participantConnected",
    ParticipantDisconnected: "participantDisconnected",
    TrackSubscribed: "trackSubscribed",
    TrackUnsubscribed: "trackUnsubscribed",
    LocalTrackPublished: "localTrackPublished",
    LocalTrackUnpublished: "localTrackUnpublished",
    ActiveSpeakersChanged: "activeSpeakersChanged",
    Disconnected: "disconnected",
    Reconnecting: "reconnecting",
    Reconnected: "reconnected",
  },
  Track: {
    Source: {
      Camera: "camera",
      Microphone: "microphone",
      ScreenShare: "screen_share",
    },
  },
}));
