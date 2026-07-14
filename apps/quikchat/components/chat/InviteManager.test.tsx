import type { InviteDto } from "@/lib/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InviteManager } from "./InviteManager";

const invite = (over: Partial<InviteDto> & { id: string; code: string }): InviteDto => ({
  channelId: "c1",
  channelName: "general",
  maxUses: null,
  useCount: 0,
  expiresAt: null,
  createdAt: new Date().toISOString(),
  createdById: "me",
  revokedAt: null,
  ...over,
});

interface Call {
  url: string;
  method: string;
  body: unknown;
}
let calls: Call[];

beforeEach(() => {
  calls = [];
  let existing: InviteDto[] = [];
  global.fetch = vi.fn(async (url, init) => {
    const u = String(url);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: u, method, body });
    if (method === "GET") return resp(existing);
    if (method === "POST") {
      const created = invite({ id: "inv1", code: "CODE123", maxUses: body?.maxUses ?? null });
      existing = [created];
      return resp(created);
    }
    return resp({ revoked: true });
  }) as unknown as typeof fetch;
});
afterEach(() => {
  vi.restoreAllMocks();
});

function resp(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe("InviteManager", () => {
  it("creates an invite with maxUses and shows its link", async () => {
    render(<InviteManager channelId="c1" />);
    fireEvent.change(screen.getByLabelText("Max uses"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await screen.findByTestId("invite-row");
    const post = calls.find((c) => c.method === "POST");
    expect(post?.body).toEqual({ maxUses: 5 });
    expect(screen.getByText(/\/invite\/CODE123$/)).toBeInTheDocument();
  });

  it("revokes an invite", async () => {
    render(<InviteManager channelId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await screen.findByTestId("invite-row");
    fireEvent.click(screen.getByRole("button", { name: "Revoke invite" }));
    await waitFor(() => expect(screen.queryByTestId("invite-row")).toBeNull());
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });
});
