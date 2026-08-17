import { describe, it, expect, beforeEach, afterEach } from "vitest";

/**
 * Regression coverage for the QUIKFLOW_* env-var prefix on the mail/calendar
 * connectors. QuikFlow's Google/Microsoft OAuth vars used to be the bare
 * GOOGLE_CLIENT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET / MS_TENANT names, which
 * collided with other apps' own, unrelated OAuth app registrations of the
 * same shape (e.g. QuikHRMS's MS_TEAMS_CLIENT_ID for a separate Azure app)
 * wherever env vars are shared across apps. Renamed to QUIKFLOW_GOOGLE_* /
 * QUIKFLOW_MS_* / QUIKFLOW_TEAMS_*. These tests pin the new names and guard
 * against a silent fallback to the old ones.
 */

const ENV_KEYS = [
  "QUIKFLOW_GOOGLE_CLIENT_ID",
  "QUIKFLOW_GOOGLE_CLIENT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "QUIKFLOW_MS_CLIENT_ID",
  "QUIKFLOW_MS_CLIENT_SECRET",
  "QUIKFLOW_MS_TENANT",
  "MS_CLIENT_ID",
  "MS_CLIENT_SECRET",
  "MS_TENANT",
  "QUIKFLOW_TEAMS_CLIENT_ID",
  "QUIKFLOW_TEAMS_CLIENT_SECRET",
  "QUIKFLOW_TEAMS_TENANT",
] as const;

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe("gmail.ts — QUIKFLOW_GOOGLE_* env vars", () => {
  it("throws the new var name when unset", async () => {
    const { GMAIL } = await import("../../lib/connectors/gmail");
    expect(() => GMAIL.buildAuthUrl("http://localhost/callback", "state")).toThrow(
      "QUIKFLOW_GOOGLE_CLIENT_ID is not set.",
    );
  });

  it("does not fall back to the old bare GOOGLE_CLIENT_ID name", async () => {
    process.env.GOOGLE_CLIENT_ID = "old-id";
    process.env.GOOGLE_CLIENT_SECRET = "old-secret";
    const { GMAIL } = await import("../../lib/connectors/gmail");
    expect(() => GMAIL.buildAuthUrl("http://localhost/callback", "state")).toThrow(
      "QUIKFLOW_GOOGLE_CLIENT_ID is not set.",
    );
  });

  it("builds the auth URL from QUIKFLOW_GOOGLE_CLIENT_ID once set", async () => {
    process.env.QUIKFLOW_GOOGLE_CLIENT_ID = "new-id";
    process.env.QUIKFLOW_GOOGLE_CLIENT_SECRET = "new-secret";
    const { GMAIL } = await import("../../lib/connectors/gmail");
    const url = GMAIL.buildAuthUrl("http://localhost/callback", "state");
    expect(new URL(url).searchParams.get("client_id")).toBe("new-id");
  });
});

describe("microsoft.ts (Outlook mail) — QUIKFLOW_MS_* env vars", () => {
  it("throws the new var name when unset", async () => {
    const { OUTLOOK } = await import("../../lib/connectors/microsoft");
    expect(() => OUTLOOK.buildAuthUrl("http://localhost/callback", "state")).toThrow(
      "QUIKFLOW_MS_CLIENT_ID is not set.",
    );
  });

  it("does not fall back to the old bare MS_CLIENT_ID name", async () => {
    process.env.MS_CLIENT_ID = "old-id";
    process.env.MS_CLIENT_SECRET = "old-secret";
    const { OUTLOOK } = await import("../../lib/connectors/microsoft");
    expect(() => OUTLOOK.buildAuthUrl("http://localhost/callback", "state")).toThrow(
      "QUIKFLOW_MS_CLIENT_ID is not set.",
    );
  });

  it("builds the auth URL from QUIKFLOW_MS_CLIENT_ID and defaults tenant to common", async () => {
    process.env.QUIKFLOW_MS_CLIENT_ID = "new-id";
    process.env.QUIKFLOW_MS_CLIENT_SECRET = "new-secret";
    const { OUTLOOK } = await import("../../lib/connectors/microsoft");
    const url = new URL(OUTLOOK.buildAuthUrl("http://localhost/callback", "state"));
    expect(url.searchParams.get("client_id")).toBe("new-id");
    expect(url.pathname.startsWith("/common/")).toBe(true);
  });

  it("honors a QUIKFLOW_MS_TENANT override, ignoring the old bare MS_TENANT", async () => {
    process.env.QUIKFLOW_MS_CLIENT_ID = "new-id";
    process.env.QUIKFLOW_MS_CLIENT_SECRET = "new-secret";
    process.env.QUIKFLOW_MS_TENANT = "contoso-tenant";
    process.env.MS_TENANT = "old-tenant";
    const { OUTLOOK } = await import("../../lib/connectors/microsoft");
    const url = new URL(OUTLOOK.buildAuthUrl("http://localhost/callback", "state"));
    expect(url.pathname.startsWith("/contoso-tenant/")).toBe(true);
  });
});

describe("microsoft-identity.ts msAppConfig(\"QUIKFLOW_TEAMS\") — Teams calendar connector", () => {
  it("throws QUIKFLOW_TEAMS_CLIENT_ID_is_not_set when client id missing", async () => {
    const { msAppConfig } = await import("../../lib/connectors/microsoft-identity");
    expect(() => msAppConfig("QUIKFLOW_TEAMS")).toThrow("QUIKFLOW_TEAMS_CLIENT_ID is not set.");
  });

  it("throws QUIKFLOW_TEAMS_CLIENT_SECRET_is_not_set when secret missing", async () => {
    process.env.QUIKFLOW_TEAMS_CLIENT_ID = "teams-id";
    const { msAppConfig } = await import("../../lib/connectors/microsoft-identity");
    expect(() => msAppConfig("QUIKFLOW_TEAMS")).toThrow("QUIKFLOW_TEAMS_CLIENT_SECRET is not set.");
  });

  it("reads client id/secret and defaults tenant to common", async () => {
    process.env.QUIKFLOW_TEAMS_CLIENT_ID = "teams-id";
    process.env.QUIKFLOW_TEAMS_CLIENT_SECRET = "teams-secret";
    const { msAppConfig } = await import("../../lib/connectors/microsoft-identity");
    expect(msAppConfig("QUIKFLOW_TEAMS")).toEqual({
      clientId: "teams-id",
      clientSecret: "teams-secret",
      tenant: "common",
    });
  });

  it("honors a QUIKFLOW_TEAMS_TENANT override", async () => {
    process.env.QUIKFLOW_TEAMS_CLIENT_ID = "teams-id";
    process.env.QUIKFLOW_TEAMS_CLIENT_SECRET = "teams-secret";
    process.env.QUIKFLOW_TEAMS_TENANT = "contoso-tenant";
    const { msAppConfig } = await import("../../lib/connectors/microsoft-identity");
    expect(msAppConfig("QUIKFLOW_TEAMS").tenant).toBe("contoso-tenant");
  });
});
