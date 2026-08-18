// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TqlEditor } from "@/app/(dashboard)/filters/[id]/_components/tql-editor";

describe("TqlEditor", () => {
  it("renders the current value in the input", () => {
    render(<TqlEditor value='status = "Done"' onChange={() => {}} error={null} />);
    expect(screen.getByRole("textbox")).toHaveValue('status = "Done"');
  });

  it("debounces onChange — typing doesn't fire immediately", async () => {
    const onChange = vi.fn();
    render(<TqlEditor value="" onChange={onChange} error={null} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: 'status = "Done"' } });
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('status = "Done"'), { timeout: 1000 });
  });

  it("shows an inline error message with line/col when provided", () => {
    render(
      <TqlEditor
        value="status ="
        onChange={() => {}}
        error={{ message: "Expected a value", position: { pos: 8, line: 1, col: 9 } }}
      />,
    );
    expect(screen.getByText(/Expected a value/)).toBeInTheDocument();
    expect(screen.getByText(/line 1, col 9/)).toBeInTheDocument();
  });

  it("renders no error text when error is null", () => {
    render(<TqlEditor value="" onChange={() => {}} error={null} />);
    expect(screen.queryByText(/line \d+, col \d+/)).not.toBeInTheDocument();
  });

  it("the Syntax help link points to /settings/tql-help and opens in a new tab", () => {
    render(<TqlEditor value="" onChange={() => {}} error={null} />);
    const link = screen.getByRole("link", { name: /syntax help/i });
    expect(link).toHaveAttribute("href", "/settings/tql-help");
    expect(link).toHaveAttribute("target", "_blank");
  });
});
