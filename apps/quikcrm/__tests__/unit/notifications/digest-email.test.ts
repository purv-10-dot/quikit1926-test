/**
 * Digest email renderer — REDESIGNED detailed per-user layout.
 *
 * renderDigestEmail(assembled) turns one AssembledDigest into an email-client-safe
 * { subject, text, html }:
 *   - table-based layout, INLINE styles only (no <style>, no flex/grid),
 *   - matches the existing email-templates.ts chrome (#1e40af header, escHtml),
 *   - a compact ORG-WIDE totals strip near the top,
 *   - one DETAILED block PER CRM user: 📞 Calls, 📧 Emails, 🤝 Meetings, ✅ Tasks,
 *     each an email-safe table of ACTUAL records (not counts), with an honest
 *     "No Calls"/"No Emails"/… empty state, then a per-user count summary.
 *   - DEMO banner rendered PROMINENTLY at the top when isDemo.
 *
 * HONEST LABELS: email Delivery = "Sent" (model has no delivery tracking); email
 * Reply Status is derived; meeting Status = the meeting outcome.
 *
 * sendDigestEmail(assembled) is CODED but NOT FIRED — no test invokes it.
 */
import { describe, it, expect } from "vitest";
import { renderDigestEmail } from "@/lib/services/notifications/digest-email";
import type { AssembledDigest } from "@/lib/services/notifications/digest-run";
import type { UserActivityDetail } from "@/lib/services/notifications/digest-detail";

function repOne(): UserActivityDetail {
  return {
    userId: "r1",
    userName: "Rahul Sharma",
    calls: [
      {
        time: new Date("2026-07-19T09:15:00.000Z"),
        contact: "Amit Jain",
        company: "ABC Pvt Ltd",
        durationLabel: "12 min",
        outcome: "Interested",
        notes: "Demo scheduled",
      },
    ],
    callsTotal: 1,
    emails: [
      {
        time: new Date("2026-07-19T10:05:00.000Z"),
        to: "amit@abc.com",
        subject: "Product Brochure",
        delivery: "Sent",
        replyStatus: "Customer Replied",
      },
    ],
    emailsTotal: 1,
    meetings: [
      {
        time: new Date("2026-07-19T11:30:00.000Z"),
        client: "XYZ Ltd",
        meetingType: "Demo",
        status: "Positive",
        notes: "Pricing discussed",
      },
    ],
    meetingsTotal: 1,
    tasks: [
      {
        time: new Date("2026-07-19T14:00:00.000Z"),
        task: "Send proposal",
        relatedRecord: "ABC Pvt Ltd",
        status: "Completed",
      },
    ],
    tasksTotal: 1,
  };
}

function repTwoEmpty(): UserActivityDetail {
  return {
    userId: "r2",
    userName: "Aman Verma",
    calls: [],
    callsTotal: 0,
    emails: [],
    emailsTotal: 0,
    meetings: [],
    meetingsTotal: 0,
    tasks: [],
    tasksTotal: 0,
  };
}

function sampleDigest(overrides: Partial<AssembledDigest> = {}): AssembledDigest {
  return {
    recipient: { userId: "u1", orgId: "o1", role: "Administrator", email: "lead@x.co", name: "Lead Person" },
    // Aggregate fields retained on the type; the redesigned template only reads userDetails.
    activitiesByType: [],
    activityByRep: [],
    fieldAggregates: [],
    completedTasksByRep: [],
    completedTasksTotal: 0,
    userDetails: [repOne(), repTwoEmpty()],
    variant: "daily",
    isDemo: false,
    demoBanner: "⚠️ DEMO — all-time totals, daily windowing not built yet; review STRUCTURE, not numbers.",
    ...overrides,
  };
}

describe("renderDigestEmail — detailed per-user layout (redesign)", () => {
  it("returns { subject, text, html }", () => {
    const out = renderDigestEmail(sampleDigest());
    expect(typeof out.subject).toBe("string");
    expect(typeof out.text).toBe("string");
    expect(typeof out.html).toBe("string");
    expect(out.html).toMatch(/<!DOCTYPE html>/i);
  });

  it("renders a per-user block header for every CRM user", () => {
    const { html } = renderDigestEmail(sampleDigest());
    expect(html).toContain("Rahul Sharma");
    expect(html).toContain("Aman Verma");
    // the 👤 person marker precedes each user's name
    expect(html).toMatch(/👤/);
  });

  it("renders the four labelled sections per user (Calls / Emails / Meetings / Tasks)", () => {
    const { html } = renderDigestEmail(sampleDigest());
    expect(html).toMatch(/Calls \(1\)/);
    expect(html).toMatch(/Emails \(1\)/);
    expect(html).toMatch(/Meetings \(1\)/);
    expect(html).toMatch(/Tasks Completed \(1\)/);
  });

  it("Calls table shows actual records with the required columns", () => {
    const { html } = renderDigestEmail(sampleDigest());
    for (const col of ["Contact", "Company", "Duration", "Outcome", "Notes"]) {
      expect(html).toContain(col);
    }
    expect(html).toContain("Amit Jain");
    expect(html).toContain("ABC Pvt Ltd");
    expect(html).toContain("12 min");
    expect(html).toContain("Interested");
    expect(html).toContain("Demo scheduled");
  });

  it("Emails table shows To / Subject / Delivery / Reply Status with real values", () => {
    const { html } = renderDigestEmail(sampleDigest());
    for (const col of ["Subject", "Delivery", "Reply Status"]) {
      expect(html).toContain(col);
    }
    expect(html).toContain("amit@abc.com");
    expect(html).toContain("Product Brochure");
    expect(html).toContain("Sent"); // honest delivery label
    expect(html).toContain("Customer Replied");
  });

  it("Meetings table shows Client / Meeting Type / Status / Notes (status = outcome)", () => {
    const { html } = renderDigestEmail(sampleDigest());
    for (const col of ["Client", "Meeting Type", "Status"]) {
      expect(html).toContain(col);
    }
    expect(html).toContain("XYZ Ltd");
    expect(html).toContain("Positive"); // outcome surfaced as status
  });

  it("Tasks table shows Task / Related Record / Status", () => {
    const { html } = renderDigestEmail(sampleDigest());
    for (const col of ["Task", "Related Record"]) {
      expect(html).toContain(col);
    }
    expect(html).toContain("Send proposal");
  });

  it("empty sections show honest 'No Calls'/'No Emails'/… lines, not fabricated rows", () => {
    const { html } = renderDigestEmail(sampleDigest());
    expect(html).toMatch(/No Calls/);
    expect(html).toMatch(/No Emails/);
    expect(html).toMatch(/No Meetings/);
    expect(html).toMatch(/No Tasks/);
  });

  it("renders a per-user count summary (Calls/Emails/Meetings/Tasks/Total Activities)", () => {
    const { html } = renderDigestEmail(sampleDigest());
    expect(html).toMatch(/Total Activities/);
  });

  it("shows an org-wide totals strip near the top (before the first user block)", () => {
    const { html } = renderDigestEmail(sampleDigest());
    const totalIdx = html.search(/Reps/);
    const firstUserIdx = html.search(/Rahul Sharma/);
    expect(totalIdx).toBeGreaterThanOrEqual(0);
    expect(firstUserIdx).toBeGreaterThan(totalIdx);
  });

  it("does NOT show only counts — actual record cells are present", () => {
    const { html } = renderDigestEmail(sampleDigest());
    // A count-only layout would not contain the contact/subject/client strings.
    expect(html).toContain("Amit Jain");
    expect(html).toContain("Product Brochure");
    expect(html).toContain("XYZ Ltd");
  });

  it("empty overall → honest 'no rep activity' state", () => {
    const { html } = renderDigestEmail(sampleDigest({ userDetails: [] }));
    expect(html).toMatch(/no rep activity/i);
  });

  it("caps a section and notes the overflow", () => {
    const many = repOne();
    many.callsTotal = 63; // > MAX_ROWS_PER_SECTION (50); calls array holds only shown rows
    const { html } = renderDigestEmail(sampleDigest({ userDetails: [many] }));
    expect(html).toMatch(/\+62 more calls not shown/i);
  });

  it("renders the DEMO banner PROMINENTLY near the top when isDemo", () => {
    const { html } = renderDigestEmail(sampleDigest({ isDemo: true }));
    expect(html).toMatch(/DEMO/);
    const bannerIdx = html.search(/DEMO/);
    const firstUserIdx = html.search(/Rahul Sharma/);
    expect(bannerIdx).toBeGreaterThanOrEqual(0);
    expect(firstUserIdx).toBeGreaterThan(bannerIdx);
  });

  it("isDemo:false → no DEMO banner", () => {
    const { html } = renderDigestEmail(sampleDigest({ isDemo: false }));
    expect(html).not.toMatch(/DEMO/);
  });

  it("escapes HTML in dynamic values (injection-safe)", () => {
    const evil = repOne();
    evil.calls[0].contact = "<script>alert(1)</script>";
    const { html } = renderDigestEmail(sampleDigest({ userDetails: [evil] }));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toMatch(/&lt;script&gt;/);
  });

  it("uses table-based layout only — no flex/grid, no <style> block", () => {
    const { html } = renderDigestEmail(sampleDigest());
    expect(html).toMatch(/<table/i);
    expect(html).not.toMatch(/display:\s*flex/i);
    expect(html).not.toMatch(/display:\s*grid/i);
    expect(html).not.toMatch(/<style[\s>]/i);
  });

  it("subject names the digest", () => {
    const { subject } = renderDigestEmail(sampleDigest());
    expect(subject).toMatch(/digest/i);
  });

  describe("variant framing — weekly distinguishable from daily", () => {
    it("weekly: subject + header reflect the weekly variant", () => {
      const { subject, html } = renderDigestEmail(sampleDigest({ variant: "weekly", isDemo: false }));
      expect(subject).toMatch(/weekly summary/i);
      expect(subject).toMatch(/last 7 days/i);
      expect(html).toMatch(/weekly summary/i);
    });

    it("daily: subject/header stay 'Activity Digest' — NOT weekly", () => {
      const { subject, html } = renderDigestEmail(sampleDigest({ variant: "daily", isDemo: false }));
      expect(subject).toMatch(/activity digest/i);
      expect(subject).not.toMatch(/weekly/i);
      expect(html).not.toMatch(/weekly summary/i);
    });
  });
});
