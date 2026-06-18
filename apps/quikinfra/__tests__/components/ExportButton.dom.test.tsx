// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExportButton, type ExportColumn } from "@/components/ui/ExportButton";

interface Row {
  name: string;
  amount: number;
}

const columns: ExportColumn<Row>[] = [
  { header: "Name", get: (r) => r.name },
  { header: "Amount", get: (r) => r.amount },
];

describe("ExportButton", () => {
  beforeEach(() => {
    // jsdom doesn't implement these — stub so the download path runs.
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the default label", () => {
    render(<ExportButton filename="vendors" rows={[]} columns={columns} />);
    expect(
      screen.getByRole("button", { name: /export csv/i }),
    ).toBeInTheDocument();
  });

  it("renders a custom label", () => {
    render(
      <ExportButton
        filename="vendors"
        rows={[{ name: "A", amount: 1 }]}
        columns={columns}
        label="Download"
      />,
    );
    expect(screen.getByRole("button", { name: /download/i })).toBeInTheDocument();
  });

  it("is disabled when there are no rows", () => {
    render(<ExportButton filename="vendors" rows={[]} columns={columns} />);
    const btn = screen.getByRole("button", { name: /export csv/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "Nothing to export");
  });

  it("is disabled when the disabled prop is set even with rows", () => {
    render(
      <ExportButton
        filename="vendors"
        rows={[{ name: "A", amount: 1 }]}
        columns={columns}
        disabled
      />,
    );
    expect(screen.getByRole("button", { name: /export csv/i })).toBeDisabled();
  });

  it("triggers a CSV download when clicked with rows", () => {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    render(
      <ExportButton
        filename="my report!"
        rows={[{ name: "A", amount: 1 }]}
        columns={columns}
      />,
    );
    const btn = screen.getByRole("button", { name: /export csv/i });
    expect(btn).toBeEnabled();
    expect(btn).toHaveAttribute("title", "Download 1 rows as CSV");

    fireEvent.click(btn);

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("renders a download icon", () => {
    render(<ExportButton filename="v" rows={[]} columns={columns} />);
    expect(
      screen.getByRole("button").querySelector("svg"),
    ).toBeInTheDocument();
  });
});
