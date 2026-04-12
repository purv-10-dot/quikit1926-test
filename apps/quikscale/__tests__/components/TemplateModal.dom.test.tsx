// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { TemplateModal } from "@/app/(dashboard)/meetings/templates/components/TemplateModal";

const noopSave = vi.fn(async () => {});
const noopClose = vi.fn();

function setup(props: Partial<React.ComponentProps<typeof TemplateModal>> = {}) {
  return render(
    <TemplateModal
      open
      mode="create"
      onClose={noopClose}
      onSave={noopSave}
      {...props}
    />,
  );
}

describe("TemplateModal — open/close", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <TemplateModal
        open={false}
        mode="create"
        onClose={noopClose}
        onSave={noopSave}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the create heading in create mode", () => {
    setup();
    expect(screen.getByText(/new meeting template/i)).toBeInTheDocument();
  });

  it("renders the edit heading in edit mode", () => {
    setup({
      mode: "edit",
      initial: {
        name: "Existing",
        cadence: "weekly",
        description: "desc",
        duration: 60,
        sections: ["a", "b"],
      },
    });
    expect(screen.getByText(/edit meeting template/i)).toBeInTheDocument();
  });

  it("calls onClose when the X button is clicked", () => {
    const onClose = vi.fn();
    setup({ onClose });
    // The first svg-only icon button in the header
    const closeButtons = screen.getAllByRole("button");
    // Find the button whose accessible name is "" (close X) by looking for the one near the heading
    const closeBtn = closeButtons.find(
      (b) => b.className.includes("text-gray-400") && b.querySelector("svg"),
    );
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn!);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when the Cancel button is clicked", () => {
    const onClose = vi.fn();
    setup({ onClose });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("TemplateModal — hydration from initial values", () => {
  it("pre-fills form fields in edit mode", () => {
    setup({
      mode: "edit",
      initial: {
        name: "Custom Weekly",
        cadence: "weekly",
        description: "My weekly sync",
        duration: 45,
        sections: ["Kickoff", "Updates", "Close"],
      },
    });
    expect(screen.getByDisplayValue("Custom Weekly")).toBeInTheDocument();
    expect(screen.getByDisplayValue("My weekly sync")).toBeInTheDocument();
    expect(screen.getByDisplayValue("45")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Kickoff")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Updates")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Close")).toBeInTheDocument();
  });

  it("starts with one empty section in create mode", () => {
    setup();
    // The section count label reads "Sections * (1)"
    expect(screen.getByText(/sections/i).textContent).toMatch(/\(1\)/);
  });
});

describe("TemplateModal — section list editing", () => {
  it("adds a new section row when 'Add section' is clicked", () => {
    setup();
    expect(screen.getByText(/sections/i).textContent).toMatch(/\(1\)/);
    fireEvent.click(screen.getByRole("button", { name: /add section/i }));
    expect(screen.getByText(/sections/i).textContent).toMatch(/\(2\)/);
    fireEvent.click(screen.getByRole("button", { name: /add section/i }));
    expect(screen.getByText(/sections/i).textContent).toMatch(/\(3\)/);
  });

  it("disables the remove button when only one section remains", () => {
    setup();
    const removeBtn = screen
      .getAllByTitle(/remove/i)
      .find((b) => b.tagName === "BUTTON");
    expect(removeBtn).toBeTruthy();
    expect(removeBtn).toBeDisabled();
  });

  it("removes a section when a non-last-remaining remove is clicked", () => {
    setup({
      initial: {
        name: "x",
        cadence: "weekly",
        description: "",
        duration: 60,
        sections: ["a", "b", "c"],
      },
    });
    expect(screen.getByText(/sections/i).textContent).toMatch(/\(3\)/);
    const removeButtons = screen.getAllByTitle(/remove/i);
    fireEvent.click(removeButtons[1]); // remove second row
    expect(screen.getByText(/sections/i).textContent).toMatch(/\(2\)/);
    expect(screen.queryByDisplayValue("b")).not.toBeInTheDocument();
  });

  it("moves a section up with the up arrow", () => {
    setup({
      initial: {
        name: "x",
        cadence: "weekly",
        description: "",
        duration: 60,
        sections: ["first", "second", "third"],
      },
    });
    const upButtons = screen.getAllByTitle(/move up/i);
    // Click up on the second row ("second") → should become first
    fireEvent.click(upButtons[1]);
    const inputs = screen.getAllByDisplayValue(/first|second|third/);
    expect(inputs[0]).toHaveValue("second");
    expect(inputs[1]).toHaveValue("first");
  });

  it("disables up arrow on the first row and down arrow on the last row", () => {
    setup({
      initial: {
        name: "x",
        cadence: "weekly",
        description: "",
        duration: 60,
        sections: ["a", "b"],
      },
    });
    const upButtons = screen.getAllByTitle(/move up/i);
    const downButtons = screen.getAllByTitle(/move down/i);
    expect(upButtons[0]).toBeDisabled();
    expect(downButtons[1]).toBeDisabled();
  });
});

describe("TemplateModal — save + validation", () => {
  it("blocks save when name is empty", async () => {
    const onSave = vi.fn();
    setup({ onSave });
    // Section is already non-empty (default "") — wait, default is empty string
    // so this actually tests the "at least one section" path too
    fireEvent.click(screen.getByRole("button", { name: /create template/i }));
    expect(onSave).not.toHaveBeenCalled();
    // An error message appears
    expect(screen.getByText(/name is required/i)).toBeInTheDocument();
  });

  it("blocks save when all sections are empty strings", async () => {
    const onSave = vi.fn();
    setup({
      onSave,
      initial: {
        name: "Valid name",
        cadence: "weekly",
        description: "",
        duration: 60,
        sections: ["   ", ""],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /create template/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/at least one section/i)).toBeInTheDocument();
  });

  it("blocks save when duration is not positive", async () => {
    const onSave = vi.fn();
    setup({
      onSave,
      initial: {
        name: "Valid",
        cadence: "weekly",
        description: "",
        duration: 0,
        sections: ["a"],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /create template/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/duration must be positive/i)).toBeInTheDocument();
  });

  it("calls onSave with trimmed values on a valid submit", async () => {
    type SavePayload = {
      name: string;
      cadence: string;
      description: string;
      duration: number;
      sections: string[];
    };
    const onSave = vi.fn<(values: SavePayload) => Promise<void>>(
      async () => {},
    );
    setup({
      onSave,
      initial: {
        name: "  Trim me  ",
        cadence: "weekly",
        description: "  with spaces  ",
        duration: 60,
        sections: ["  one  ", "two", ""],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /create template/i }));
    // await microtask flush
    await new Promise((r) => setTimeout(r, 0));

    expect(onSave).toHaveBeenCalledOnce();
    const arg = onSave.mock.calls[0]![0];
    expect(arg.name).toBe("Trim me");
    expect(arg.description).toBe("with spaces");
    expect(arg.sections).toEqual(["one", "two"]); // empty section filtered out
  });

  it("renders 'Save changes' label in edit mode", () => {
    setup({ mode: "edit", initial: { name: "x", sections: ["a"], duration: 60 } });
    expect(
      screen.getByRole("button", { name: /save changes/i }),
    ).toBeInTheDocument();
  });

  it("shows saving state label while saving=true", () => {
    setup({ saving: true });
    expect(screen.getByRole("button", { name: /saving/i })).toBeInTheDocument();
  });
});
