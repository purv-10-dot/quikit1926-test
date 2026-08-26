import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The AADSTS65001 regression: "Client Master → Teams meetings" failed in 0.4s
 * with "The user or administrator has not consented to use the application",
 * and NO calendar event was ever created for any org.
 *
 * Cause: adding the two read-only `OnlineMeeting*` scopes for the attendance
 * report grew the connector's SCOPES constant, and `refresh()` passed that
 * constant into the refresh-token grant. A refresh may narrow the granted
 * scopes but never widen them, so Entra rejected every connection consented
 * before those scopes existed. Because every Graph call funnels through
 * `getFreshAccessToken`, an OPTIONAL feature's permission had become a hard
 * dependency of creating a calendar event at all.
 *
 * These tests pin the invariant that prevents it recurring: a refresh grant
 * asserts no scopes, and the required/optional split stays honest.
 */
import { msRefresh, msExchangeCode, msAppConfig } from "@/lib/connectors/microsoft-identity";
import { ReconnectRequiredError } from "@/lib/connectors/types";
import { REQUIRED_SCOPES, CAPTURE_SCOPES } from "@/lib/connectors/teams";

const CFG = { clientId: "cid", clientSecret: "secret", tenant: "common" };

/** Form body of the single fetch a token call makes, parsed back to an object. */
function sentForm(fetchMock: ReturnType<typeof vi.fn>): URLSearchParams {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return new URLSearchParams(String(init.body));
}

function mockTokenResponse(body: Record<string, unknown>, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({ ok, status, json: async () => body });
}

describe("msRefresh — the refresh grant must not assert scopes", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockTokenResponse({ access_token: "new_tok", expires_in: 3600, scope: "Calendars.ReadWrite" });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends NO scope parameter (the direct AADSTS65001 regression)", async () => {
    await msRefresh(CFG, "stored_refresh_token");

    const form = sentForm(fetchMock);
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe("stored_refresh_token");
    // The assertion that matters: asking for scopes here is what broke every
    // pre-existing connection.
    expect(form.has("scope")).toBe(false);
  });

  it("never leaks a capture scope into the refresh request", async () => {
    await msRefresh(CFG, "stored_refresh_token");

    const raw = String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body);
    for (const scope of CAPTURE_SCOPES) {
      expect(raw).not.toContain(scope);
    }
  });

  it("records the scopes the provider actually returned, not the ones we wanted", async () => {
    const tokens = await msRefresh(CFG, "stored_refresh_token");
    expect(tokens.scopes).toEqual(["Calendars.ReadWrite"]);
  });

  it("falls back to [] when the response omits scope, rather than inventing a grant", async () => {
    // Stamping a connection with unconfirmed scopes would let a legacy
    // connection masquerade as having the capture permissions, turning a clean
    // "reconnect to grant X" into an opaque 403 at report time.
    vi.stubGlobal("fetch", mockTokenResponse({ access_token: "new_tok", expires_in: 3600 }));
    const tokens = await msRefresh(CFG, "stored_refresh_token");
    expect(tokens.scopes).toEqual([]);
  });

  it("echoes the prior refresh token when the provider does not re-issue one", async () => {
    const tokens = await msRefresh(CFG, "stored_refresh_token");
    expect(tokens.refreshToken).toBe("stored_refresh_token");
  });

  it("keeps a newly issued refresh token when the provider does re-issue one", async () => {
    vi.stubGlobal(
      "fetch",
      mockTokenResponse({ access_token: "new_tok", refresh_token: "rotated", expires_in: 3600 }),
    );
    const tokens = await msRefresh(CFG, "stored_refresh_token");
    expect(tokens.refreshToken).toBe("rotated");
  });
});

describe("msExchangeCode — consent DOES still ask for the full scope set", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends every scope on the authorization-code grant", async () => {
    // Guards the opposite error: dropping scopes from the CONSENT step would
    // mean the attendance report could never be granted at all.
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes("/me")) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ mail: "me@org.com" }) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ access_token: "tok", expires_in: 3600, scope: "Calendars.ReadWrite" }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const scopes = [...REQUIRED_SCOPES, ...CAPTURE_SCOPES];
    await msExchangeCode(CFG, scopes, "auth_code", "https://app/cb");

    const form = sentForm(fetchMock);
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("scope")?.split(" ").sort()).toEqual([...scopes].sort());
  });
});

describe("token failures are classified into an actionable error", () => {
  afterEach(() => vi.unstubAllGlobals());

  const failWith = (body: Record<string, unknown>, status = 400) =>
    vi.stubGlobal("fetch", mockTokenResponse(body, false, status));

  it("turns AADSTS65001 into ReconnectRequiredError", async () => {
    failWith({
      error: "invalid_grant",
      error_description:
        "AADSTS65001: The user or administrator has not consented to use the application with ID '088f6576'. Trace ID: abc Correlation ID: def",
    });
    await expect(msRefresh(CFG, "tok")).rejects.toBeInstanceOf(ReconnectRequiredError);
  });

  it("strips Entra's trace/correlation noise from the surfaced message", async () => {
    failWith({
      error: "invalid_grant",
      error_description: "AADSTS65001: not consented. Trace ID: abc Correlation ID: def Timestamp: 2026-08-26",
    });
    // A workflow run log is read by whoever clicked the button, not by an
    // identity engineer. The remedy has to survive the trip.
    const err = await msRefresh(CFG, "tok").catch((e) => e);
    expect(String(err)).toMatch(/administrator may need to grant consent/);
    expect(String(err)).not.toMatch(/Correlation ID/);
  });

  it("treats a revoked/expired grant as reconnect-required too", async () => {
    failWith({ error: "invalid_grant", error_description: "AADSTS70000: refresh token expired" });
    await expect(msRefresh(CFG, "tok")).rejects.toBeInstanceOf(ReconnectRequiredError);
  });

  it("leaves an unrelated failure as a plain Error (still a real run failure)", async () => {
    failWith({ error: "temporarily_unavailable", error_description: "Service is busy" }, 503);
    const err = await msRefresh(CFG, "tok").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ReconnectRequiredError);
    expect(String(err)).toContain("Service is busy");
  });
});

describe("required vs optional scope split", () => {
  it("keeps every capture scope OUT of the required set", () => {
    // The structural guard: nothing on the create/update/delete path may come
    // to depend on an admin-consent-required attendance scope again.
    for (const scope of CAPTURE_SCOPES) {
      expect(REQUIRED_SCOPES).not.toContain(scope);
    }
  });

  it("still requires the scopes calendar writes genuinely need", () => {
    expect(REQUIRED_SCOPES).toContain("Calendars.ReadWrite");
    expect(REQUIRED_SCOPES).toContain("offline_access");
  });

  it("has one source of truth for the capture scopes", async () => {
    const attendance = await import("@/lib/connectors/teams-attendance");
    expect(attendance.CAPTURE_SCOPES).toBe(CAPTURE_SCOPES);
  });
});

describe("msAppConfig", () => {
  it("throws a named error when the client id is unset", () => {
    const prev = process.env.MICROSOFT_CLIENT_ID;
    delete process.env.MICROSOFT_CLIENT_ID;
    expect(() => msAppConfig("MICROSOFT")).toThrow(/MICROSOFT_CLIENT_ID is not set/);
    if (prev !== undefined) process.env.MICROSOFT_CLIENT_ID = prev;
  });
});
