// @vitest-environment jsdom
/**
 * Renders the REAL MailboxPanel against the REAL /api/email/mailbox payload
 * shape to confirm the provider cards + Connect buttons appear when providers
 * are configured — the exact conditional that governs the reported bug. This
 * is the component itself (not a mock), fed the response the live API returns.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

// Stable toast reference — the real useToast returns a memoized object; a fresh
// object each render would change load()'s useCallback identity and loop.
const stableToast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), rich: vi.fn(), actionSuccess: vi.fn(), actionFailed: vi.fn() };
vi.mock("@/hooks/use-toast", () => ({ useToast: () => stableToast }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { MailboxPanel } from "@/components/settings/email/mailbox-panel";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  // Default: succeed with an empty/unconfigured payload so load() always
  // resolves even before a test sets a specific response.
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      data: {
        availableProviders: [],
        configStatus: { tokenEncryptionKey: false, gmail: false, microsoft: false, anyAvailable: false },
        connection: null,
      },
    }),
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function respond(data: unknown) {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, data }) });
}

describe("MailboxPanel rendering", () => {
  it("shows both provider cards + Connect buttons when configured (the fixed state)", async () => {
    respond({
      availableProviders: ["gmail", "microsoft"],
      configStatus: { tokenEncryptionKey: true, gmail: true, microsoft: true, anyAvailable: true },
      connection: null,
    });

    render(<MailboxPanel />);

    await waitFor(() => expect(screen.getByText("Google Workspace")).toBeTruthy());
    expect(screen.getByText("Microsoft 365")).toBeTruthy();
    expect(screen.getByText(/Connect Gmail/i)).toBeTruthy();
    expect(screen.getByText(/Connect Outlook/i)).toBeTruthy();
    // No "not configured" banner in the healthy state.
    expect(screen.queryByText(/not fully configured/i)).toBeNull();
  });

  it("shows the precise diagnostic when NO creds are set (the pre-fix state)", async () => {
    respond({
      availableProviders: [],
      configStatus: { tokenEncryptionKey: false, gmail: false, microsoft: false, anyAvailable: false },
      connection: null,
    });

    render(<MailboxPanel />);

    // Cards still render; the banner names exactly what's missing.
    await waitFor(() => expect(screen.getByText("Google Workspace")).toBeTruthy());
    expect(screen.getByText(/MAILBOX_TOKEN_ENCRYPTION_KEY is missing/i)).toBeTruthy();
    expect(screen.getByText(/GOOGLE_CLIENT_ID/i)).toBeTruthy();
    expect(screen.getByText(/MICROSOFT_CLIENT_ID/i)).toBeTruthy();
  });

  it("shows the connected card when a mailbox is connected", async () => {
    respond({
      availableProviders: ["gmail", "microsoft"],
      configStatus: { tokenEncryptionKey: true, gmail: true, microsoft: true, anyAvailable: true },
      connection: {
        provider: "gmail",
        emailAddress: "rep@company.com",
        status: "active",
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
      },
    });

    render(<MailboxPanel />);

    await waitFor(() => expect(screen.getByText("rep@company.com")).toBeTruthy());
    expect(screen.getAllByText(/Connected/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Sync now/i)).toBeTruthy();
    expect(screen.getByText(/Disconnect/i)).toBeTruthy();
  });

  it("shows 'Importing mail history' while the initial backfill runs", async () => {
    respond({
      availableProviders: ["gmail", "microsoft"],
      configStatus: { tokenEncryptionKey: true, gmail: true, microsoft: true, anyAvailable: true },
      connection: {
        provider: "microsoft",
        emailAddress: "adarsh.jain@moreyeahs.com",
        status: "active",
        syncState: "backfilling",
        lastSyncedAt: null,
        lastError: null,
      },
    });

    render(<MailboxPanel />);

    await waitFor(() => expect(screen.getByText("adarsh.jain@moreyeahs.com")).toBeTruthy());
    expect(screen.getByText(/Importing mail history/i)).toBeTruthy();
  });
});
