// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UserPicker } from "@/components/ui/UserPicker";

const USERS = [
  { id: "u1", name: "Alice Admin", email: "alice@test.io" },
  { id: "u2", name: "Bob Builder", email: "bob@test.io" },
  { id: "u3", name: "Carol Civil", email: "carol@test.io" },
];

function mockFetch(payload: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch({ data: USERS }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("UserPicker", () => {
  it("shows a loading label first, then becomes enabled after the fetch resolves", async () => {
    render(<UserPicker value="" onChange={() => {}} />);
    expect(screen.getByText("Loading users…")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled());
  });

  it("opens a searchable dropdown listing the fetched users", async () => {
    render(<UserPicker value="" onChange={() => {}} placeholder="Select user…" />);
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Alice Admin")).toBeInTheDocument();
    expect(screen.getByText("Bob Builder")).toBeInTheDocument();
  });

  it("fires onChange with the user id when an option is clicked", async () => {
    const onChange = vi.fn();
    render(<UserPicker value="" onChange={onChange} />);
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("Bob Builder"));
    expect(onChange).toHaveBeenCalledWith("u2");
  });

  it("renders the current value's display name in the trigger", async () => {
    render(<UserPicker value="u3" onChange={() => {}} />);
    await waitFor(() => expect(screen.getByText("Carol Civil")).toBeInTheDocument());
  });

  it("filters the list by the search query", async () => {
    render(<UserPicker value="" onChange={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button"));
    fireEvent.change(screen.getByPlaceholderText("Search by name or email…"), { target: { value: "alice" } });
    expect(screen.getByText("Alice Admin")).toBeInTheDocument();
    expect(screen.queryByText("Bob Builder")).not.toBeInTheDocument();
  });

  it("shows the no-matches empty state when search excludes everyone", async () => {
    render(<UserPicker value="" onChange={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button"));
    fireEvent.change(screen.getByPlaceholderText("Search by name or email…"), { target: { value: "zzz" } });
    expect(screen.getByText("No matches")).toBeInTheDocument();
  });

  it("shows the no-users empty state when the API returns an empty list", async () => {
    vi.stubGlobal("fetch", mockFetch({ data: [] }));
    render(<UserPicker value="" onChange={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("No users found")).toBeInTheDocument();
  });
});
