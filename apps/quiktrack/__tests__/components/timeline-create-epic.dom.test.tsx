// @vitest-environment jsdom
/**
 * Timeline "+ Create Epic" inline row. Blur on the title input means "save",
 * which made the assignee button unusable: the button took focus on mousedown,
 * the blur fired before its click handler, and the epic was created instead of
 * the picker opening.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TimelineCreateEpic } from "@/app/(dashboard)/spaces/[id]/timeline/_components/timeline-create-epic";

const MEMBERS = [
  {
    userId: "u1",
    user: { id: "u1", firstName: "Sameena", lastName: "Khan", email: "s@x.io", avatar: null },
  },
  {
    userId: "u2",
    user: { id: "u2", firstName: "Pravin", lastName: "Sharma", email: "p@x.io", avatar: null },
  },
];

let postBody: Record<string, unknown> | null = null;

beforeEach(() => {
  postBody = null;
  global.fetch = vi.fn((_url: string, init?: RequestInit) => {
    postBody = init?.body ? JSON.parse(String(init.body)) : null;
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: {} }) });
  }) as unknown as typeof fetch;
});

function setup() {
  const onCreated = vi.fn();
  render(
    <TimelineCreateEpic
      projectId="p1"
      members={MEMBERS}
      currentUserId="u2"
      columns={[]}
      onCreated={onCreated}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /create epic/i }));
  const input = screen.getByPlaceholderText(/what needs to be done/i);
  fireEvent.change(input, { target: { value: "New Testing" } });
  return { input, onCreated, assign: () => screen.getByRole("button", { name: /assign/i }) };
}

/** What a browser actually does when you click the assignee button: mousedown
 *  (which would move focus and blur the input), then click. */
function clickAssignee(button: HTMLElement, input: HTMLElement) {
  const md = fireEvent.mouseDown(button);
  // Not prevented → focus moves off the input, firing its blur handler.
  if (md) fireEvent.blur(input, { relatedTarget: button });
  fireEvent.click(button);
}

describe("<TimelineCreateEpic /> assignee picker", () => {
  it("opens the picker instead of creating the epic", async () => {
    const { input, onCreated, assign } = setup();

    clickAssignee(assign(), input);

    expect(await screen.findByPlaceholderText(/search assignee/i)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("does not save when focus moves from the title input into the picker", async () => {
    const { input, assign } = setup();
    clickAssignee(assign(), input);
    const search = await screen.findByPlaceholderText(/search assignee/i);

    fireEvent.blur(input, { relatedTarget: search });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("creates the epic with the picked assignee once the title is committed", async () => {
    const { input, assign } = setup();
    clickAssignee(assign(), input);
    await screen.findByPlaceholderText(/search assignee/i);

    fireEvent.click(screen.getByText("Sameena Khan"));
    // Picker closed and focus handed back to the title input.
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/search assignee/i)).not.toBeInTheDocument(),
    );

    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(postBody).toMatchObject({
      projectId: "p1",
      title: "New Testing",
      type: "EPIC",
      assigneeId: "u1",
    });
  });

  it("renders the picker outside the row's sticky stacking context", async () => {
    const { input, assign } = setup();
    const trigger = assign();
    clickAssignee(trigger, input);
    const picker = (await screen.findByPlaceholderText(/search assignee/i)).closest(
      "div[style]",
    ) as HTMLElement;

    // The frozen cell is `sticky … z-[15]`; an absolutely positioned panel
    // inside it painted *behind* the epic rows below (same z, later in the DOM).
    // Portaling to <body> with fixed positioning is what lifts it clear.
    expect(picker.style.position).toBe("fixed");
    expect(document.body.contains(picker)).toBe(true);
    const stickyCell = trigger.closest(".sticky");
    expect(stickyCell?.contains(picker) ?? false).toBe(false);
  });

  it("still saves on a genuine click away from the editor", async () => {
    const { input } = setup();

    fireEvent.blur(input, { relatedTarget: document.body });

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(postBody).toMatchObject({ title: "New Testing", type: "EPIC" });
  });
});
