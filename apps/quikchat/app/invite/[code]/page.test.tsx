import type { InvitePreview } from "@/lib/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import InvitePage from "./page";

const preview: InvitePreview = {
  channelId: "c1",
  name: "design-team",
  description: "Where design happens",
  visibility: "private",
  memberCount: 4,
  expiresAt: null,
  remainingUses: 3,
};

function mock(
  handler: (url: string, method: string) => { ok: boolean; status: number; body: unknown },
) {
  global.fetch = vi.fn(async (url, init) => {
    const r = handler(String(url), (init?.method ?? "GET").toUpperCase());
    return { ok: r.ok, status: r.status, json: async () => r.body } as unknown as Response;
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  push.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("InvitePage", () => {
  it("renders the preview", async () => {
    mock(() => ({ ok: true, status: 200, body: preview }));
    render(<InvitePage params={{ code: "abc" }} />);
    expect(await screen.findByText("design-team")).toBeInTheDocument();
    expect(screen.getByText(/3 uses left/)).toBeInTheDocument();
  });

  it("accepts and deep-links into the channel", async () => {
    mock((url, method) => {
      if (method === "POST") return { ok: true, status: 200, body: { channelId: "c1" } };
      return { ok: true, status: 200, body: preview };
    });
    render(<InvitePage params={{ code: "abc" }} />);
    fireEvent.click(await screen.findByRole("button", { name: /Accept/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard?channel=c1"));
  });

  it("sends unauthenticated users through login with ?next", async () => {
    mock((url, method) => {
      if (method === "POST") return { ok: false, status: 401, body: {} };
      return { ok: true, status: 200, body: preview };
    });
    render(<InvitePage params={{ code: "abc" }} />);
    fireEvent.click(await screen.findByRole("button", { name: /Accept/ }));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/login?next=${encodeURIComponent("/invite/abc")}`),
    );
  });

  it("shows an unavailable state for expired/revoked invites", async () => {
    mock(() => ({ ok: false, status: 410, body: { error: "gone" } }));
    render(<InvitePage params={{ code: "abc" }} />);
    expect(await screen.findByText("Invite unavailable")).toBeInTheDocument();
  });
});
