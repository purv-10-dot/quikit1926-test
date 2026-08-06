import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Guards provider-availability detection — the logic behind the Settings →
 * Email "which Connect buttons show" decision, and the root-cause of the
 * "not configured on this server" report (env vars absent).
 *
 * env() and the token cipher are mocked so we exercise the pure composition:
 * a provider is available iff its creds AND the encryption key are present.
 */

const envMock = vi.fn();
vi.mock("@/lib/env", () => ({ env: () => envMock() }));

const cipherOk = vi.fn();
vi.mock("@/lib/crypto/token-cipher", () => ({ isTokenCipherConfigured: () => cipherOk() }));

import { providerConfigStatus, configuredProviders } from "@/lib/services/email/providers";

const FULL = {
  GOOGLE_CLIENT_ID: "g-id",
  GOOGLE_CLIENT_SECRET: "g-secret",
  MICROSOFT_CLIENT_ID: "m-id",
  MICROSOFT_CLIENT_SECRET: "m-secret",
};

describe("provider config detection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("both providers available when key + all creds present", () => {
    cipherOk.mockReturnValue(true);
    envMock.mockReturnValue(FULL);
    expect(providerConfigStatus()).toMatchObject({
      tokenEncryptionKey: true,
      gmail: true,
      microsoft: true,
      anyAvailable: true,
    });
    expect(configuredProviders()).toEqual(["gmail", "microsoft"]);
  });

  it("no providers configurable when the encryption key is missing", () => {
    cipherOk.mockReturnValue(false);
    envMock.mockReturnValue(FULL);
    // configuredProviders gates on the key → empty; status shows creds present
    // but flags the missing key so the UI can explain precisely.
    expect(configuredProviders()).toEqual([]);
    const s = providerConfigStatus();
    expect(s.tokenEncryptionKey).toBe(false);
    expect(s.gmail).toBe(true); // creds ARE present…
    expect(s.anyAvailable).toBe(false); // …but not usable without the key
  });

  it("only gmail when microsoft creds are absent", () => {
    cipherOk.mockReturnValue(true);
    envMock.mockReturnValue({ GOOGLE_CLIENT_ID: "g", GOOGLE_CLIENT_SECRET: "s" });
    expect(configuredProviders()).toEqual(["gmail"]);
    expect(providerConfigStatus()).toMatchObject({ gmail: true, microsoft: false, anyAvailable: true });
  });

  it("reports nothing when env has no creds at all", () => {
    cipherOk.mockReturnValue(true);
    envMock.mockReturnValue({});
    expect(configuredProviders()).toEqual([]);
    expect(providerConfigStatus()).toMatchObject({ gmail: false, microsoft: false, anyAvailable: false });
  });
});
