// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FilterPicker } from "@quikit/ui";

const OPTIONS = [
  { value: "u1", label: "Alice Smith", sublabel: "alice@test.com" },
  { value: "u2", label: "Bob Jones", sublabel: "bob@test.com" },
];

function open() {
  // Before opening, the only "All Users" button is the trigger.
  fireEvent.click(screen.getByRole("button", { name: /all users/i }));
}

function listEl(container: HTMLElement): HTMLElement {
  return container.querySelector('[class*="overflow-y-auto"]') as HTMLElement;
}

describe("FilterPicker", () => {
  // ── Backward-compat: client mode (no onSearch) — UNCHANGED behavior ──
  describe("client mode (no onSearch)", () => {
    it("filters options locally by substring on label", () => {
      render(<FilterPicker value="" onChange={() => {}} options={OPTIONS} allLabel="All Users" />);
      open();
      fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "alice" } });
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
      expect(screen.queryByText("Bob Jones")).not.toBeInTheDocument();
    });

    it("also matches on the sublabel (email)", () => {
      render(<FilterPicker value="" onChange={() => {}} options={OPTIONS} allLabel="All Users" />);
      open();
      fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "bob@test" } });
      expect(screen.getByText("Bob Jones")).toBeInTheDocument();
      expect(screen.queryByText("Alice Smith")).not.toBeInTheDocument();
    });

    it("suppresses pagination while a query is typed", () => {
      const onLoadMore = vi.fn();
      const { container } = render(
        <FilterPicker value="" onChange={() => {}} options={OPTIONS} allLabel="All Users"
          hasMore loadingMore={false} onLoadMore={onLoadMore} />,
      );
      open();
      fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "ab" } });
      fireEvent.scroll(listEl(container));
      expect(onLoadMore).not.toHaveBeenCalled();
    });

    it("paginates when no query is typed", () => {
      const onLoadMore = vi.fn();
      const { container } = render(
        <FilterPicker value="" onChange={() => {}} options={OPTIONS} allLabel="All Users"
          hasMore loadingMore={false} onLoadMore={onLoadMore} />,
      );
      open();
      fireEvent.scroll(listEl(container));
      expect(onLoadMore).toHaveBeenCalled();
    });
  });

  // ── New opt-in: server mode (onSearch provided) ──
  describe("server mode (onSearch)", () => {
    it("does NOT filter locally — the parent controls the option set", () => {
      render(
        <FilterPicker value="" onChange={() => {}} options={OPTIONS} allLabel="All Users" onSearch={() => {}} />,
      );
      open();
      // A term that matches neither option must still leave both rendered,
      // because the server (parent) is the source of truth for results.
      fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "zzz" } });
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
      expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    });

    it("calls onSearch with the (debounced) typed query", async () => {
      const onSearch = vi.fn();
      render(
        <FilterPicker value="" onChange={() => {}} options={OPTIONS} allLabel="All Users" onSearch={onSearch} />,
      );
      open();
      fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "shub" } });
      await waitFor(() => expect(onSearch).toHaveBeenCalledWith("shub"));
    });

    it("keeps paginating while a query is typed (server search is page-able)", () => {
      const onLoadMore = vi.fn();
      const { container } = render(
        <FilterPicker value="" onChange={() => {}} options={OPTIONS} allLabel="All Users"
          onSearch={() => {}} hasMore loadingMore={false} onLoadMore={onLoadMore} />,
      );
      open();
      fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "ab" } });
      fireEvent.scroll(listEl(container));
      expect(onLoadMore).toHaveBeenCalled();
    });

    it("selecting an option fires onChange with its value", () => {
      const onChange = vi.fn();
      render(
        <FilterPicker value="" onChange={onChange} options={OPTIONS} allLabel="All Users" onSearch={() => {}} />,
      );
      open();
      fireEvent.click(screen.getByText("Alice Smith"));
      expect(onChange).toHaveBeenCalledWith("u1");
    });
  });
});
