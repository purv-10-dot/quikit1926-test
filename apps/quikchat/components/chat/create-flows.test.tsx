import type { PublicUser } from "@/lib/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiscoverModal } from "./DiscoverModal";
import { NewChatModal } from "./NewChatModal";
import { NewGroupModal } from "./NewGroupModal";

const USERS: PublicUser[] = [{ id: "u-bob", displayName: "Bob", avatarUrl: null }];

interface Call {
  url: string;
  method: string;
  body: unknown;
}
let calls: Call[];

function mockApi(routes: (url: string, method: string) => unknown) {
  global.fetch = vi.fn(async (url, init) => {
    const u = String(url);
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ url: u, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return { ok: true, status: 200, json: async () => routes(u, method) } as unknown as Response;
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  calls = [];
});
afterEach(() => {
  vi.restoreAllMocks();
});

const bodyOf = (urlPart: string, method: string) =>
  calls.find((c) => c.url.includes(urlPart) && c.method === method)?.body;

describe("NewChatModal", () => {
  it("creates a DM with the picked user", async () => {
    mockApi((u) => {
      if (u.includes("/api/users")) return USERS;
      if (u.includes("/api/channels")) return { channelId: "dm1", type: "dm" };
      return {};
    });
    const onCreated = vi.fn();
    render(<NewChatModal open onClose={vi.fn()} onCreated={onCreated} />);
    fireEvent.click(await screen.findByText("Bob"));
    fireEvent.click(screen.getByRole("button", { name: "Start chat" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(bodyOf("/api/channels", "POST")).toEqual({ type: "dm", memberIds: ["u-bob"] });
  });
});

describe("NewGroupModal", () => {
  it("guards public groups without a name", async () => {
    mockApi(() => USERS);
    render(<NewGroupModal open onClose={vi.fn()} onCreated={vi.fn()} />);
    // private default → Create enabled
    expect(screen.getByRole("button", { name: "Create group" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Visibility"), { target: { value: "public" } });
    expect(screen.getByRole("button", { name: "Create group" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "general" } });
    expect(screen.getByRole("button", { name: "Create group" })).toBeEnabled();
  });

  it("creates a group with the correct body", async () => {
    mockApi((u) => {
      if (u.includes("/api/users")) return USERS;
      return { channelId: "g1", type: "group" };
    });
    const onCreated = vi.fn();
    render(<NewGroupModal open onClose={vi.fn()} onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "design" } });
    fireEvent.click(await screen.findByText("Bob"));
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(bodyOf("/api/channels", "POST")).toMatchObject({
      type: "group",
      name: "design",
      visibility: "private",
      memberIds: ["u-bob"],
    });
  });
});

describe("DiscoverModal", () => {
  it("lists public channels with isMember and joins one", async () => {
    mockApi((u) => {
      if (u.includes("/discover")) {
        return [
          {
            channelId: "g1",
            name: "general",
            description: "",
            memberCount: 3,
            visibility: "public",
            isMember: false,
          },
          {
            channelId: "g2",
            name: "random",
            description: "",
            memberCount: 1,
            visibility: "public",
            isMember: true,
          },
        ];
      }
      if (u.includes("/join")) return { channelId: "g1", type: "group" };
      return {};
    });
    const onJoined = vi.fn();
    render(<DiscoverModal open onClose={vi.fn()} onJoined={onJoined} />);
    await screen.findByText("general");
    expect(screen.getByText("Joined")).toBeInTheDocument(); // random is already joined
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    await waitFor(() => expect(onJoined).toHaveBeenCalled());
    expect(calls.some((c) => c.url.includes("/api/channels/g1/join") && c.method === "POST")).toBe(
      true,
    );
  });

  it("shows the empty state when no public channels are found", async () => {
    mockApi((u) => {
      if (u.includes("/discover")) return [];
      return {};
    });
    render(<DiscoverModal open onClose={vi.fn()} onJoined={vi.fn()} />);
    expect(await screen.findByText("No public channels found")).toBeInTheDocument();
  });

  it("debounces the search query before calling discoverChannels", async () => {
    mockApi((u) => {
      if (u.includes("/discover")) return [];
      return {};
    });
    render(<DiscoverModal open onClose={vi.fn()} onJoined={vi.fn()} />);
    await waitFor(() => expect(calls.some((c) => c.url.includes("/discover"))).toBe(true));
    const callsBeforeTyping = calls.length;

    fireEvent.change(screen.getByLabelText("Search public channels"), {
      target: { value: "eng" },
    });
    // Debounce window hasn't elapsed yet — no new request fired immediately.
    expect(calls.length).toBe(callsBeforeTyping);

    await waitFor(() => {
      expect(calls.some((c) => c.url.includes("/discover") && c.url.includes("q=eng"))).toBe(
        true,
      );
    });
  });
});
