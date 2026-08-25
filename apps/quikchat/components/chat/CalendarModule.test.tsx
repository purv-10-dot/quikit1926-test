import type { CalendarEventDto } from "@/lib/shared";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = {
  fetchCalendarEvents: vi.fn(),
  createCalendarEvent: vi.fn(),
  updateCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
  fetchOrgUsers: vi.fn(),
  fetchFreeBusy: vi.fn(),
};
vi.mock("@/lib/api", () => ({
  fetchCalendarEvents: (...a: unknown[]) => api.fetchCalendarEvents(...a),
  createCalendarEvent: (...a: unknown[]) => api.createCalendarEvent(...a),
  updateCalendarEvent: (...a: unknown[]) => api.updateCalendarEvent(...a),
  deleteCalendarEvent: (...a: unknown[]) => api.deleteCalendarEvent(...a),
  fetchOrgUsers: (...a: unknown[]) => api.fetchOrgUsers(...a),
  fetchFreeBusy: (...a: unknown[]) => api.fetchFreeBusy(...a),
}));

import { CalendarModule } from "./CalendarModule";

const ME = "u-me";

function editableEvent(overrides: Partial<CalendarEventDto> = {}): CalendarEventDto {
  const start = new Date();
  const end = new Date(start.getTime() + 30 * 60_000);
  return {
    id: "ev-1",
    calendarId: "cal-1",
    source: "event",
    title: "Dentist",
    description: null,
    location: null,
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: false,
    color: "#7c5cff",
    joinUrl: null,
    channelId: null,
    editable: true,
    ...overrides,
  };
}

function meetingOverlay(overrides: Partial<CalendarEventDto> = {}): CalendarEventDto {
  const start = new Date();
  const end = new Date(start.getTime() + 30 * 60_000);
  return {
    id: "meet-1",
    calendarId: null,
    source: "meeting",
    title: "Standup",
    description: null,
    location: null,
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: false,
    color: "#0ea5a4",
    joinUrl: null,
    channelId: "c1",
    editable: false,
    ...overrides,
  };
}

function seedEvents(events: CalendarEventDto[]) {
  api.fetchCalendarEvents.mockResolvedValue(events);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("CalendarModule — create (unchanged)", () => {
  it("still creates via createCalendarEvent, with a disabled/loading submit that can't double-fire", async () => {
    seedEvents([]);
    api.fetchOrgUsers.mockResolvedValue([]);
    api.fetchFreeBusy.mockResolvedValue({ from: "x", to: "y", busy: {}, unknown: [] });
    let resolveCreate!: (v: CalendarEventDto) => void;
    api.createCalendarEvent.mockReturnValue(
      new Promise((res) => {
        resolveCreate = res;
      }),
    );

    render(<CalendarModule currentUserId={ME} />);
    fireEvent.click(await screen.findByRole("button", { name: /New meeting/i }));
    fireEvent.change(screen.getByLabelText("Meeting title"), { target: { value: "Coffee" } });

    const submit = screen.getByRole("button", { name: /Schedule/i });
    fireEvent.click(submit);
    // Pending: disabled, and a second click while pending must not double-call.
    await waitFor(() => expect(submit).toBeDisabled());
    fireEvent.click(submit);
    expect(api.createCalendarEvent).toHaveBeenCalledTimes(1);
    expect(api.updateCalendarEvent).not.toHaveBeenCalled();
    expect(api.deleteCalendarEvent).not.toHaveBeenCalled();

    resolveCreate(editableEvent({ title: "Coffee" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("CalendarModule — edit an existing personal event", () => {
  it("opens in edit mode from the week grid and saves via updateCalendarEvent(id, patch)", async () => {
    seedEvents([editableEvent()]);
    api.updateCalendarEvent.mockResolvedValue(editableEvent({ title: "Dentist (moved)" }));

    render(<CalendarModule currentUserId={ME} />);
    fireEvent.click(await screen.findByLabelText("Event actions"));

    expect(await screen.findByRole("dialog", { name: "Edit event" })).toBeInTheDocument();
    const titleInput = screen.getByLabelText("Meeting title") as HTMLInputElement;
    expect(titleInput.value).toBe("Dentist");
    fireEvent.change(titleInput, { target: { value: "Dentist (moved)" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));

    await waitFor(() => expect(api.updateCalendarEvent).toHaveBeenCalledTimes(1));
    const [id, patch] = api.updateCalendarEvent.mock.calls[0]!;
    expect(id).toBe("ev-1");
    expect(patch.title).toBe("Dentist (moved)");
    expect(api.createCalendarEvent).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("does not offer a conferencing toggle when editing (it has no effect on updateCalendarEvent)", async () => {
    seedEvents([editableEvent()]);
    render(<CalendarModule currentUserId={ME} />);
    fireEvent.click(await screen.findByLabelText("Event actions"));
    await screen.findByRole("dialog", { name: "Edit event" });
    expect(screen.queryByText("Add a video conferencing link")).toBeNull();
  });

  it("carries the id through from Month view too, instead of creating a duplicate", async () => {
    seedEvents([editableEvent()]);
    const { container } = render(<CalendarModule currentUserId={ME} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Month" }));
    // "Dentist" also appears in the "Up next" agenda sidebar — scope to the
    // month grid itself so the query isn't ambiguous.
    const grid = () => container.querySelector(".qc-cal2-month__grid") as HTMLElement;
    await waitFor(() => expect(grid()).not.toBeNull());
    fireEvent.click(within(grid()).getByRole("button", { name: /Dentist/ }));

    expect(await screen.findByRole("dialog", { name: "Edit event" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    await waitFor(() => expect(api.updateCalendarEvent).toHaveBeenCalledWith("ev-1", expect.anything()));
    expect(api.createCalendarEvent).not.toHaveBeenCalled();
  });

  it("surfaces a failed save instead of silently succeeding", async () => {
    seedEvents([editableEvent()]);
    api.updateCalendarEvent.mockRejectedValue(new Error("network down"));

    render(<CalendarModule currentUserId={ME} />);
    fireEvent.click(await screen.findByLabelText("Event actions"));
    await screen.findByRole("dialog", { name: "Edit event" });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));

    await waitFor(() => expect(api.updateCalendarEvent).toHaveBeenCalledTimes(1));
    // Stays open and re-enabled for retry — no false "it worked" close.
    expect(screen.getByRole("dialog", { name: "Edit event" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).not.toBeDisabled();
  });
});

describe("CalendarModule — delete", () => {
  it("requires a second confirm click before calling deleteCalendarEvent", async () => {
    seedEvents([editableEvent()]);
    render(<CalendarModule currentUserId={ME} />);
    fireEvent.click(await screen.findByLabelText("Event actions"));
    await screen.findByRole("dialog", { name: "Edit event" });

    fireEvent.click(screen.getByTestId("delete-event"));
    expect(api.deleteCalendarEvent).not.toHaveBeenCalled();
    const confirmBtn = await screen.findByTestId("confirm-delete-event");

    fireEvent.click(confirmBtn);
    await waitFor(() => expect(api.deleteCalendarEvent).toHaveBeenCalledWith("ev-1"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("surfaces a failed delete instead of silently succeeding", async () => {
    seedEvents([editableEvent()]);
    api.deleteCalendarEvent.mockRejectedValue(new Error("not found"));

    render(<CalendarModule currentUserId={ME} />);
    fireEvent.click(await screen.findByLabelText("Event actions"));
    await screen.findByRole("dialog", { name: "Edit event" });
    fireEvent.click(screen.getByTestId("delete-event"));
    fireEvent.click(await screen.findByTestId("confirm-delete-event"));

    await waitFor(() => expect(api.deleteCalendarEvent).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("dialog", { name: "Edit event" })).toBeInTheDocument();
  });
});

describe("CalendarModule — meeting overlays stay non-editable", () => {
  it("renders a meeting overlay with no edit affordance in the week grid", async () => {
    seedEvents([meetingOverlay()]);
    // "Standup" also appears in the "Up next" agenda sidebar, so wait on the
    // unambiguous week-grid pill class rather than the (duplicated) text.
    const { container } = render(<CalendarModule currentUserId={ME} />);
    await waitFor(() => expect(container.querySelector(".qc-cal2-event")).not.toBeNull());
    expect(screen.queryByLabelText("Event actions")).toBeNull();
  });

  it("renders a meeting overlay as inert (non-button) in Month view", async () => {
    seedEvents([meetingOverlay()]);
    const { container } = render(<CalendarModule currentUserId={ME} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Month" }));
    const cell = await waitFor(() => {
      const el = container.querySelector(".qc-cal2-mev--meeting");
      if (!el) throw new Error("meeting cell not rendered yet");
      return el;
    });
    expect(cell.tagName).toBe("DIV");
    fireEvent.click(cell);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
