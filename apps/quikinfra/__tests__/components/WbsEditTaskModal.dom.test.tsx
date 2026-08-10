// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TestProviders } from "../helpers/TestProviders";
import { WbsEditTaskModal } from "@/components/WbsEditTaskModal";
import type { WbsTask } from "@/hooks/use-wbs";

const task: WbsTask = {
  id: "t1",
  parentId: null,
  wbsCode: "1.1",
  name: "Excavation",
  startDate: "2026-01-01",
  endDate: "2026-01-10",
  status: "in_progress",
  progress: 40,
  predecessors: [],
};

const other: WbsTask = {
  id: "t2",
  parentId: null,
  wbsCode: "1.2",
  name: "Foundation",
  startDate: "2026-01-11",
  endDate: "2026-01-20",
  status: "not_started",
  progress: 0,
  predecessors: [],
};

function setup(over: Partial<React.ComponentProps<typeof WbsEditTaskModal>> = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <WbsEditTaskModal
      open
      projectId="proj-1"
      task={task}
      allTasks={[task, other]}
      onClose={onClose}
      onSaved={onSaved}
      {...over}
    />,
    { wrapper: TestProviders },
  );
  return { onClose, onSaved };
}

beforeEach(() => {
  // The save path calls useUpdateWbsTask → fetch PATCH. Stub a success.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { ...task } }),
      text: async () => "",
    })),
  );
});

describe("WbsEditTaskModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <WbsEditTaskModal
        open={false}
        projectId="p"
        task={task}
        allTasks={[task]}
        onClose={() => {}}
      />,
      { wrapper: TestProviders },
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when task is null", () => {
    const { container } = render(
      <WbsEditTaskModal
        open
        projectId="p"
        task={null}
        allTasks={[]}
        onClose={() => {}}
      />,
      { wrapper: TestProviders },
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("prefills the form fields from the task prop", () => {
    setup();
    expect(screen.getByText("Edit Task")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1.1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Excavation")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-01-01")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-01-10")).toBeInTheDocument();
    expect(screen.getByDisplayValue("40")).toBeInTheDocument();
  });

  it("fires onClose when Cancel is clicked", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("fires onClose when the X (close) button is clicked", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: /^close$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables Save when the task name is cleared", () => {
    setup();
    fireEvent.change(screen.getByDisplayValue("Excavation"), {
      target: { value: "" },
    });
    expect(screen.getByRole("button", { name: /save changes/i })).toBeDisabled();
  });

  // An end date before the start date used to only grey out Save, with no
  // explanation anywhere on the form.
  describe("end-date validation", () => {
    /** Set End Date to a day before the task's 2026-01-01 start. */
    const setInvalidEndDate = () =>
      fireEvent.change(screen.getByDisplayValue("2026-01-10"), {
        target: { value: "2025-12-31" },
      });

    it("shows an inline message under End Date", () => {
      setup();
      setInvalidEndDate();
      expect(
        screen.getByText(/end date must be on or after the start date/i),
      ).toBeInTheDocument();
    });

    it("marks the End Date input invalid", () => {
      setup();
      setInvalidEndDate();
      expect(screen.getByDisplayValue("2025-12-31")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
    });

    it("blocks saving until the range is corrected", async () => {
      setup();
      setInvalidEndDate();
      const save = screen.getByRole("button", { name: /save changes/i });
      expect(save).toBeDisabled();

      fireEvent.change(screen.getByDisplayValue("2025-12-31"), {
        target: { value: "2026-01-05" },
      });
      expect(
        screen.queryByText(/end date must be on or after the start date/i),
      ).not.toBeInTheDocument();
      expect(save).toBeEnabled();
    });

    it("accepts an end date equal to the start date (zero-duration task)", () => {
      setup();
      fireEvent.change(screen.getByDisplayValue("2026-01-10"), {
        target: { value: "2026-01-01" },
      });
      expect(
        screen.queryByText(/end date must be on or after the start date/i),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /save changes/i })).toBeEnabled();
    });
  });

  it("saving fires the update mutation then onSaved + onClose", async () => {
    const { onClose, onSaved } = setup();
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    // Wait for the async mutateAsync chain to settle.
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toContain("/api/projects/proj-1/wbs/tasks/t1");
    expect(init.method).toBe("PATCH");
  });
});
