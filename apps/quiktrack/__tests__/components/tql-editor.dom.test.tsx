// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TqlEditor } from "@/app/(dashboard)/filters/[id]/_components/tql-editor";

describe("TqlEditor", () => {
  it("renders the current value in the input", () => {
    render(<TqlEditor value='status = "Done"' onChange={() => {}} error={null} />);
    expect(screen.getByRole("textbox")).toHaveValue('status = "Done"');
  });

  it("typing alone never calls onChange — the query only runs on Enter/Search/blur", async () => {
    const onChange = vi.fn();
    render(<TqlEditor value="" onChange={onChange} error={null} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: 'status = "Done"' } });
    // Give any stray timer a chance to fire — there shouldn't be one.
    await new Promise((r) => setTimeout(r, 300));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows a 'Enter to search' hint while focused and no error is present", () => {
    render(<TqlEditor value="" onChange={() => {}} error={null} />);
    const box = screen.getByRole("textbox");
    expect(screen.queryByText(/enter to search/i)).not.toBeInTheDocument();
    fireEvent.focus(box);
    expect(screen.getByText(/enter to search/i)).toBeInTheDocument();
  });

  it("blurring the box (e.g. clicking away) runs the query", () => {
    const onChange = vi.fn();
    render(<TqlEditor value="" onChange={onChange} error={null} />);
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: 'status = "Done"' } });
    fireEvent.blur(box);
    expect(onChange).toHaveBeenCalledWith('status = "Done"');
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

  it("the Search button runs the current draft immediately", () => {
    const onChange = vi.fn();
    render(<TqlEditor value="" onChange={onChange} error={null} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: 'status = "Done"' } });
    fireEvent.mouseDown(screen.getByRole("button", { name: /search/i }));
    expect(onChange).toHaveBeenCalledWith('status = "Done"');
  });

  it("the Search button runs an empty draft too — clearing the box and searching should be possible", () => {
    const onChange = vi.fn();
    render(<TqlEditor value='status = "Done"' onChange={onChange} error={null} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
    fireEvent.mouseDown(screen.getByRole("button", { name: /search/i }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("clicking Search doesn't also trigger a redundant run via the textarea's blur", () => {
    const onChange = vi.fn();
    render(<TqlEditor value="" onChange={onChange} error={null} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: 'status = "Done"' } });
    fireEvent.mouseDown(screen.getByRole("button", { name: /search/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("pressing Enter (without Shift) runs the query immediately", () => {
    const onChange = vi.fn();
    render(<TqlEditor value="" onChange={onChange} error={null} />);
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: 'type = "BUG"' } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith('type = "BUG"');
  });

  it("the Expand button toggles a taller editor without running the query", () => {
    const onChange = vi.fn();
    render(<TqlEditor value="dfsdf" onChange={onChange} error={null} />);
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(box).toHaveAttribute("rows", "1");
    fireEvent.mouseDown(screen.getByRole("button", { name: /expand editor/i }));
    fireEvent.click(screen.getByRole("button", { name: /expand editor/i }));
    expect(box).toHaveAttribute("rows", "6");
    fireEvent.mouseDown(screen.getByRole("button", { name: /collapse editor/i }));
    fireEvent.click(screen.getByRole("button", { name: /collapse editor/i }));
    expect(box).toHaveAttribute("rows", "1");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("TqlEditor — field-name autocomplete", () => {
  it("shows matching native field suggestions while typing a bare word", async () => {
    render(<TqlEditor value="" onChange={() => {}} error={null} />);
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "assig" } });
    box.setSelectionRange(5, 5);
    fireEvent.click(box); // triggers onCaretMove same as typing would

    await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());
    expect(screen.getByText("assignee")).toBeInTheDocument();
  });

  it("does not show suggestions for an empty word", () => {
    render(<TqlEditor value="" onChange={() => {}} error={null} />);
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "status = " } });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("ArrowDown/Enter picks the active suggestion and inserts it in place of the typed word", async () => {
    render(<TqlEditor value="" onChange={() => {}} error={null} />);
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "assig" } });

    await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());
    fireEvent.keyDown(box, { key: "Enter" });

    expect(box).toHaveValue("assignee");
  });

  it("clicking a suggestion inserts it and closes the dropdown", async () => {
    render(<TqlEditor value="" onChange={() => {}} error={null} />);
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "prior" } });

    await waitFor(() => expect(screen.getByText("priority")).toBeInTheDocument());
    fireEvent.mouseDown(screen.getByText("priority"));

    expect(box).toHaveValue("priority");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("Escape closes the dropdown without changing the text", async () => {
    render(<TqlEditor value="" onChange={() => {}} error={null} />);
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "assig" } });

    await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());
    fireEvent.keyDown(box, { key: "Escape" });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(box).toHaveValue("assig");
  });

  it("blurring the textarea closes the dropdown", async () => {
    render(<TqlEditor value="" onChange={() => {}} error={null} />);
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "assig" } });
    await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());

    fireEvent.blur(box);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
