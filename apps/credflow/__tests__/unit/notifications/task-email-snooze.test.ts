import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildEmailContent } from "@/lib/notifications/email-templates";
import type { NotificationPayload } from "@/lib/notifications/types";

/**
 * Task notification emails gain Open-task + login-gated Snooze deep-links.
 * Lead notifications must keep the plain "View in QuikCRM" CTA untouched.
 */
describe("buildEmailContent — task deep-links", () => {
  let savedAppUrl: string | undefined;

  beforeEach(() => {
    savedAppUrl = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://crm.test";
  });

  afterEach(() => {
    if (savedAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = savedAppUrl;
  });

  const base: Omit<NotificationPayload, "type" | "metadata"> = {
    tenantId: "t1",
    userId: "u1",
    category: "lead",
    title: "Task assigned to you",
    body: "Follow up with Acme. Due: today.",
    link: "/tasks",
  };

  it("adds Open + Snooze 1h/1d deep-links for an assigned task", () => {
    const { html, text } = buildEmailContent({
      ...base,
      type: "lead_assigned",
      metadata: { type: "task_assigned", taskId: "task-123" },
    });

    const open = "https://crm.test/tasks?focus=task-123";
    expect(html).toContain(open);
    // In HTML attributes the `&` is escaped to `&amp;` (valid HTML; clients decode it).
    expect(html).toContain(`${open}&amp;snooze=60`);
    expect(html).toContain(`${open}&amp;snooze=1440`);
    expect(html).toContain("Open task");
    expect(html).toContain("Snooze 1 hour");
    expect(html).toContain("Snooze 1 day");
    // The generic CTA is replaced, not duplicated.
    expect(html).not.toContain("View in QuikCRM →");

    expect(text).toContain(`Open task: ${open}`);
    expect(text).toContain(`Snooze 1 hour: ${open}&snooze=60`);
    expect(text).toContain(`Snooze 1 day: ${open}&snooze=1440`);
  });

  it("offers Open but NOT Snooze for a completed task (terminal event)", () => {
    const { html, text } = buildEmailContent({
      ...base,
      title: "Task marked as completed",
      type: "lead_converted",
      metadata: { type: "task_completed", taskId: "task-9" },
    });

    expect(html).toContain("https://crm.test/tasks?focus=task-9");
    expect(html).toContain("Open task");
    expect(html).not.toContain("Snooze");
    expect(text).not.toContain("Snooze");
  });

  it("leaves lead notifications on the plain View CTA (no task buttons)", () => {
    const { html, text } = buildEmailContent({
      ...base,
      title: "Lead assigned to you",
      link: "/leads/abc",
      type: "lead_assigned",
      metadata: { type: "lead_assigned", leadId: "abc", leadName: "Acme", assignedByName: "Sam" },
    });

    expect(html).toContain("View in QuikCRM →");
    expect(html).not.toContain("Open task");
    expect(html).not.toContain("Snooze");
    expect(text).toContain("View in QuikCRM: https://crm.test/leads/abc");
  });
});
