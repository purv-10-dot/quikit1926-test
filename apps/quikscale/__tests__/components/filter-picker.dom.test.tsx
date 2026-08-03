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

// ── Opt-in: multi-select mode (`multiple`) ──
// Single-select behaviour must be untouched — the suites above are the guard.
describe("FilterPicker — multiple mode", () => {
  function openMulti(label = /all users/i) {
    fireEvent.click(screen.getByRole("button", { name: label }));
  }

  it("shows allLabel on the trigger when nothing is selected", () => {
    render(
      <FilterPicker multiple values={[]} onChangeMultiple={() => {}} options={OPTIONS} allLabel="All Users" />,
    );
    expect(screen.getByRole("button", { name: /all users/i })).toBeInTheDocument();
  });

  it("shows a count on the trigger once values are selected", () => {
    render(
      <FilterPicker multiple values={["u1", "u2"]} onChangeMultiple={() => {}} options={OPTIONS} allLabel="All Users" />,
    );
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("renders a chip per selected value so the selection is readable", () => {
    render(
      <FilterPicker multiple values={["u1", "u2"]} onChangeMultiple={() => {}} options={OPTIONS} allLabel="All Users" />,
    );
    // Chips render without opening the dropdown.
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove alice smith/i })).toBeInTheDocument();
  });

  it("labels chips from selectedOptions when the value is outside the loaded page", () => {
    render(
      <FilterPicker
        multiple
        values={["u9"]}
        onChangeMultiple={() => {}}
        options={OPTIONS}
        selectedOptions={[{ value: "u9", label: "Zoe Far" }]}
        allLabel="All Users"
      />,
    );
    expect(screen.getByText("Zoe Far")).toBeInTheDocument();
  });

  it("adds a value when an unselected option is clicked", () => {
    const onChangeMultiple = vi.fn();
    render(
      <FilterPicker multiple values={["u1"]} onChangeMultiple={onChangeMultiple} options={OPTIONS} allLabel="All Users" />,
    );
    openMulti(/1 selected/i);
    fireEvent.click(screen.getByText("Bob Jones"));
    expect(onChangeMultiple).toHaveBeenCalledWith(["u1", "u2"]);
  });

  it("removes a value when a selected option is clicked again", () => {
    const onChangeMultiple = vi.fn();
    render(
      <FilterPicker multiple values={["u1", "u2"]} onChangeMultiple={onChangeMultiple} options={OPTIONS} allLabel="All Users" />,
    );
    openMulti(/2 selected/i);
    // The dropdown row, not the chip.
    const rows = screen.getAllByText("Alice Smith");
    fireEvent.click(rows[rows.length - 1]);
    expect(onChangeMultiple).toHaveBeenCalledWith(["u2"]);
  });

  it("keeps the dropdown open after toggling, so several can be picked", () => {
    render(
      <FilterPicker multiple values={[]} onChangeMultiple={() => {}} options={OPTIONS} allLabel="All Users" />,
    );
    openMulti();
    fireEvent.click(screen.getByText("Bob Jones"));
    // Search box is only rendered while the dropdown is open.
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it("clears the whole selection via the All row", () => {
    const onChangeMultiple = vi.fn();
    render(
      <FilterPicker multiple values={["u1", "u2"]} onChangeMultiple={onChangeMultiple} options={OPTIONS} allLabel="All Users" />,
    );
    openMulti(/2 selected/i);
    fireEvent.click(screen.getByText("All Users"));
    expect(onChangeMultiple).toHaveBeenCalledWith([]);
  });

  it("removes just that value from a chip's × button", () => {
    const onChangeMultiple = vi.fn();
    render(
      <FilterPicker multiple values={["u1", "u2"]} onChangeMultiple={onChangeMultiple} options={OPTIONS} allLabel="All Users" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /remove alice smith/i }));
    expect(onChangeMultiple).toHaveBeenCalledWith(["u2"]);
  });
});

// ── `allMeansEvery`: the "All" row selects everything instead of clearing ──
// Used by the WWW status filter, where the value is an explicit set and `[]`
// means "match nothing".
describe("FilterPicker — allMeansEvery", () => {
  it("selects every option from the All row instead of clearing", () => {
    const onChangeMultiple = vi.fn();
    render(
      <FilterPicker multiple allMeansEvery values={["u1"]} onChangeMultiple={onChangeMultiple}
        options={OPTIONS} allLabel="All Users" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /1 selected/i }));
    fireEvent.click(screen.getByText("All Users"));
    expect(onChangeMultiple).toHaveBeenCalledWith(["u1", "u2"]);
  });

  it("shows allLabel on the trigger when everything is selected", () => {
    render(
      <FilterPicker multiple allMeansEvery values={["u1", "u2"]} onChangeMultiple={() => {}}
        options={OPTIONS} allLabel="All Users" />,
    );
    expect(screen.getByRole("button", { name: /all users/i })).toBeInTheDocument();
    expect(screen.queryByText("2 selected")).not.toBeInTheDocument();
  });

  it("hides the chip row when everything is selected (nothing is excluded)", () => {
    render(
      <FilterPicker multiple allMeansEvery values={["u1", "u2"]} onChangeMultiple={() => {}}
        options={OPTIONS} allLabel="All Users" />,
    );
    expect(screen.queryByRole("button", { name: /remove alice smith/i })).not.toBeInTheDocument();
  });

  it("still shows chips + count for a partial selection", () => {
    render(
      <FilterPicker multiple allMeansEvery values={["u1"]} onChangeMultiple={() => {}}
        options={OPTIONS} allLabel="All Users" />,
    );
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove alice smith/i })).toBeInTheDocument();
  });

  it("leaves the default (clear-on-All) behaviour untouched without the flag", () => {
    const onChangeMultiple = vi.fn();
    render(
      <FilterPicker multiple values={["u1", "u2"]} onChangeMultiple={onChangeMultiple}
        options={OPTIONS} allLabel="All Users" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /2 selected/i }));
    fireEvent.click(screen.getByText("All Users"));
    expect(onChangeMultiple).toHaveBeenCalledWith([]);
  });
});

describe("FilterPicker — chip overflow", () => {
  it("caps the chip row height and scrolls once many are selected", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ value: `u${i}`, label: `User ${i}` }));
    const { container } = render(
      <FilterPicker multiple values={many.map(o => o.value)} onChangeMultiple={() => {}}
        options={many} allLabel="All Users" />,
    );
    // The chip row is the scrollable container holding the remove buttons.
    const chipRow = container.querySelector('[class*="flex-wrap"]') as HTMLElement;
    expect(chipRow).toBeTruthy();
    expect(chipRow.className).toMatch(/overflow-y-auto/);
    expect(chipRow.className).toMatch(/max-h-/);
    // All 8 stay in the DOM — they're reachable by scrolling, not truncated.
    expect(screen.getAllByRole("button", { name: /^remove user/i })).toHaveLength(8);
  });
});
