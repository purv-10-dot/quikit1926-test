import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const previewInvite = vi.fn();
vi.mock("@/lib/api", () => ({ previewInvite: (...a: unknown[]) => previewInvite(...a) }));

import InvitePage from "./page";

function renderPage() {
  return render(<InvitePage params={{ code: "abc" }} />);
}

beforeEach(() => {
  push.mockReset();
  previewInvite.mockResolvedValue({
    name: "Design",
    description: null,
    memberCount: 3,
    visibility: "private",
    remainingUses: null,
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("InvitePage accept (Bug 6)", () => {
  it("routes an unauthenticated accept to login with a next back to the invite", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 401, ok: false }) as unknown as Response),
    );
    renderPage();
    fireEvent.click(await screen.findByText("Accept & open"));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/login?next=${encodeURIComponent("/invite/abc")}`),
    );
  });

  it("on success deep-links into the accepted channel (binds to whoever is logged in)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            status: 200,
            ok: true,
            json: async () => ({ channelId: "chan-1" }),
          }) as unknown as Response,
      ),
    );
    renderPage();
    fireEvent.click(await screen.findByText("Accept & open"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/?channel=chan-1"));
  });
});
