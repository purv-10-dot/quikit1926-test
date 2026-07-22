import type { PublicUser } from "@/lib/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { UserPicker } from "./UserPicker";

const USERS: PublicUser[] = [
  { id: "u-bob", displayName: "Bob", avatarUrl: null },
  { id: "u-cara", displayName: "Cara", avatarUrl: null },
];

beforeEach(() => {
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => USERS,
  })) as unknown as typeof fetch;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("UserPicker", () => {
  it("single-select calls onChange with one user and shows a chip", async () => {
    const onChange = vi.fn();
    render(<UserPicker onChange={onChange} />);
    fireEvent.click(await screen.findByText("Bob"));
    expect(onChange).toHaveBeenLastCalledWith([USERS[0]]);
    // chip with remove button
    expect(screen.getByRole("button", { name: "Remove Bob" })).toBeInTheDocument();
  });

  it("multi-select accumulates selections", async () => {
    const onChange = vi.fn();
    render(<UserPicker multi onChange={onChange} />);
    fireEvent.click(await screen.findByText("Bob"));
    fireEvent.click(await screen.findByText("Cara"));
    expect(onChange).toHaveBeenLastCalledWith([USERS[0], USERS[1]]);
  });

  it("debounces search and passes q to the endpoint", async () => {
    render(<UserPicker onChange={vi.fn()} />);
    await screen.findByText("Bob");
    fireEvent.change(screen.getByLabelText("Search people"), { target: { value: "cara" } });
    await waitFor(() => {
      const calls = (global.fetch as Mock).mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes("q=cara"))).toBe(true);
    });
  });
});
