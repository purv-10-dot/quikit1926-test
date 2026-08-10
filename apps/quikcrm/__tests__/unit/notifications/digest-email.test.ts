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
    emailReplies: [
      {
        time: new Date("2026-07-19T10:42:00.000Z"),
        from: "Rahul Sharma",
        subject: "Re: Proposal",
        originalEmail: "Proposal Sent",
        replyReceived: "Yes",
      },
    ],
    emailRepliesTotal: 1,
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
    otherSections: [],
    otherTotal: 0,
    leadSummary: [
      { leadId: "l1", leadName: "ABC Pvt Ltd", total: 8, breakdown: "3 Emails, 2 Replies, 1 Task" },
      { leadId: "l2", leadName: "XYZ Industries", total: 5, breakdown: "2 Tasks, 1 Meeting, 2 Emails" },
    ],
    leadSummaryTotal: 2,
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
    emailReplies: [],
    emailRepliesTotal: 0,
    meetings: [],
    meetingsTotal: 0,
    tasks: [],
    tasksTotal: 0,
    otherSections: [],
    otherTotal: 0,
    leadSummary: [],
    leadSummaryTotal: 0,
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

  // ── Email Replies section ──────────────────────────────────────────────────
  it("renders the 📩 Email Replies section with all five columns and real values", () => {
    const { html } = renderDigestEmail(sampleDigest());
    expect(html).toMatch(/Email Replies \(1\)/);
    expect(html).toContain("Original Email");
    expect(html).toContain("Reply Received");
    expect(html).toContain("Re: Proposal");
    expect(html).toContain("Proposal Sent");
  });

  it("Email Replies appears immediately after the Emails section, before Meetings", () => {
    const { html } = renderDigestEmail(sampleDigest());
    const emails = html.search(/Emails \(1\)/);
    const replies = html.search(/Email Replies \(1\)/);
    const meetings = html.search(/Meetings \(1\)/);
    expect(emails).toBeGreaterThanOrEqual(0);
    expect(replies).toBeGreaterThan(emails);
    expect(meetings).toBeGreaterThan(replies);
  });

  it("zero replies → honest 'No Email Replies' empty state", () => {
    const { html } = renderDigestEmail(sampleDigest());
    expect(html).toMatch(/No Email Replies/);
  });

  it("renames the summary row to 'Emails Sent' and adds an 'Email Replies' row", () => {
    const { html } = renderDigestEmail(sampleDigest());
    expect(html).toContain("Emails Sent");
    expect(html).toContain("Email Replies");
  });

  it("EXCLUDES email replies from Total Activities (a reply is not rep-logged work)", () => {
    // rep one: 1 call + 1 email + 1 meeting + 1 task = 4, plus 1 reply that must NOT count.
    const { text } = renderDigestEmail(sampleDigest());
    expect(text).toContain("Email Replies: 1");
    expect(text).toContain("Total: 4");
    expect(text).not.toContain("Total: 5");
  });

  it("a fixture omitting the reply fields still renders (defensive ?? guards)", () => {
    const legacy = sampleDigest();
    // Simulate a caller built before this field existed.
    const u = legacy.userDetails[0] as unknown as Record<string, unknown>;
    delete u.emailReplies;
    delete u.emailRepliesTotal;
    const { html } = renderDigestEmail(legacy);
    expect(html).toMatch(/Email Replies \(0\)/);
    expect(html).toMatch(/No Email Replies/);
  });

  // ── Lead Activity Summary section ──────────────────────────────────────────
  it("renders the 📊 Lead Activity Summary with all three columns and real values", () => {
    const { html } = renderDigestEmail(sampleDigest());
    expect(html).toMatch(/Lead Activity Summary \(2\)/);
    expect(html).toContain("Lead Name");
    expect(html).toContain("Total Activities");
    expect(html).toContain("Activity Breakdown");
    expect(html).toContain("ABC Pvt Ltd");
    expect(html).toContain("3 Emails, 2 Replies, 1 Task");
  });

  it("Lead Activity Summary is LAST in the user block (after Tasks and dynamic types)", () => {
    const { html } = renderDigestEmail(sampleDigest());
    const tasks = html.search(/Tasks Completed \(1\)/);
    const lead = html.search(/Lead Activity Summary/);
    expect(tasks).toBeGreaterThanOrEqual(0);
    expect(lead).toBeGreaterThan(tasks);
  });

  it("lists most-active leads first (sorted by total desc)", () => {
    const { html } = renderDigestEmail(sampleDigest());
    expect(html.search(/ABC Pvt Ltd/)).toBeLessThan(html.search(/XYZ Industries/));
  });

  it("no lead activity → honest empty state, not a fabricated row", () => {
    const { html } = renderDigestEmail(sampleDigest());
    expect(html).toContain("No lead activity recorded during this reporting period.");
  });

  it("EXCLUDES the lead rollup from Total Activities (it would double-count)", () => {
    // rep one: 4 real activities; leadSummary totals 13 and must not leak in.
    const { text } = renderDigestEmail(sampleDigest());
    expect(text).toContain("Total: 4");
  });

  it("reuses the shared overflow note when the lead list is capped", () => {
    const d = sampleDigest();
    d.userDetails[0].leadSummaryTotal = 60; // 2 shown, 60 distinct leads
    const { html } = renderDigestEmail(d);
    expect(html).toMatch(/\+58 more leads not shown/);
  });

  it("a fixture omitting the lead fields still renders (defensive ?? guards)", () => {
    const legacy = sampleDigest();
    const u = legacy.userDetails[0] as unknown as Record<string, unknown>;
    delete u.leadSummary;
    delete u.leadSummaryTotal;
    const { html } = renderDigestEmail(legacy);
    expect(html).toMatch(/Lead Activity Summary \(0\)/);
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

/**
 * DYNAMIC ACTIVITY TYPES in the rendered email. The template must render one
 * section per discovered type and count them all in the totals — with no
 * hardcoded type list. Regression for: only Calls/Emails/Meetings/Tasks were
 * rendered, so custom types never reached the inbox.
 */
describe("renderDigestEmail — dynamic activity type sections", () => {
  function repWithCustomTypes(): UserActivityDetail {
    return {
      ...repTwoEmpty(),
      userName: "Adarsh Jain",
      otherSections: [
        {
          typeLabel: "Bidding",
          total: 2,
          rows: [
            {
              time: new Date("2026-07-19T09:00:00.000Z"),
              relatedRecord: "ACME Corp",
              subject: "Portal bid",
              outcome: "Submitted",
              notes: "Bid #4471",
            },
          ],
        },
        {
          typeLabel: "Client Interviews",
          total: 1,
          rows: [
            {
              time: new Date("2026-07-19T12:00:00.000Z"),
              relatedRecord: "Globex",
              subject: "Panel round",
              outcome: "Shortlisted",
              notes: "2 candidates",
            },
          ],
        },
      ],
      otherTotal: 3,
    };
  }

  it("renders a section per custom activity type with its records", () => {
    const { html } = renderDigestEmail(sampleDigest({ userDetails: [repWithCustomTypes()] }));
    expect(html).toMatch(/Bidding \(2\)/);
    expect(html).toMatch(/Client Interviews \(1\)/);
    expect(html).toContain("Portal bid");
    expect(html).toContain("ACME Corp");
    expect(html).toContain("Shortlisted");
  });

  it("counts custom types in the per-user summary and Total Activities", () => {
    const { html } = renderDigestEmail(sampleDigest({ userDetails: [repWithCustomTypes()] }));
    // repTwoEmpty has 0 of the four fixed types; the 3 custom ones are the total.
    expect(html).toMatch(/Total Activities/);
    expect(html).toContain("Bidding");
    expect(html).toContain("Client Interviews");
    const totalCell = html.match(/>3<\/strong>/);
    expect(totalCell).not.toBeNull();
  });

  it("counts custom types in the org-wide totals strip", () => {
    const { html } = renderDigestEmail(sampleDigest({ userDetails: [repWithCustomTypes()] }));
    expect(html).toContain("Other");
    // Total = 3 (all custom); rendered in the highlighted total cell.
    expect(html).toMatch(/>3<\/div>/);
  });

  it("includes custom types in the plain-text fallback", () => {
    const { text } = renderDigestEmail(sampleDigest({ userDetails: [repWithCustomTypes()] }));
    expect(text).toContain("Bidding: 2");
    expect(text).toContain("Client Interviews: 1");
    expect(text).toContain("Total: 3");
  });

  it("a user with no dynamic sections renders unchanged (no 'Other' cell)", () => {
    const { html } = renderDigestEmail(sampleDigest());
    expect(html).not.toContain(">Other<");
  });

  /**
   * SUMMARY vs DETAIL split. digest-detail pads otherSections with zero-count
   * placeholders for every active configured type; the summary band lists them
   * all (a 0 is information) while the detail band renders only types with
   * records (no empty "Demo (0) / No Demo" block).
   */
  describe("zero-count types: listed in the summary, omitted from the detail", () => {
    function repWithZeroTypes(): UserActivityDetail {
      return {
        ...repTwoEmpty(),
        userName: "Saniya Tharwani",
        callsTotal: 1,
        calls: [
          {
            time: new Date("2026-07-19T10:30:00.000Z"),
            contact: "ABC",
            company: "XYZ",
            durationLabel: "12 min",
            outcome: "Connected",
            notes: "—",
          },
        ],
        otherSections: [
          {
            typeLabel: "WhatsApp",
            total: 2,
            rows: [
              {
                time: new Date("2026-07-19T11:00:00.000Z"),
                relatedRecord: "Lead A",
                subject: "Brochure",
                outcome: "Read",
                notes: "—",
              },
            ],
          },
          // Configured but not logged today — summary row only.
          { typeLabel: "Demo", total: 0, rows: [] },
          { typeLabel: "Site Visit", total: 0, rows: [] },
        ],
        otherTotal: 2,
      };
    }

    it("summary lists zero-count types; detail omits their sections entirely", () => {
      const { html } = renderDigestEmail(sampleDigest({ userDetails: [repWithZeroTypes()] }));
      // Both labels appear (summary rows)…
      expect(html).toContain("Demo");
      expect(html).toContain("Site Visit");
      // …but never as a detail section heading or an empty-state line.
      expect(html).not.toMatch(/Demo \(0\)/);
      expect(html).not.toMatch(/Site Visit \(0\)/);
      expect(html).not.toMatch(/No Demo/);
      expect(html).not.toMatch(/No Site Visit/);
    });

    it("a logged type still renders its detail section", () => {
      const { html } = renderDigestEmail(sampleDigest({ userDetails: [repWithZeroTypes()] }));
      expect(html).toMatch(/WhatsApp \(2\)/);
      expect(html).toContain("Brochure");
    });

    it("the four specialized sections keep their empty states", () => {
      const { html } = renderDigestEmail(sampleDigest({ userDetails: [repWithZeroTypes()] }));
      expect(html).toMatch(/No Emails/);
      expect(html).toMatch(/No Meetings/);
      expect(html).toMatch(/No Tasks/);
    });

    it("zero-count placeholders do not inflate any total", () => {
      const { html, text } = renderDigestEmail(sampleDigest({ userDetails: [repWithZeroTypes()] }));
      // 1 call + 2 WhatsApp = 3; the two zero types must contribute nothing.
      expect(text).toContain("Total: 3");
      expect(text).toContain("Demo: 0");
      expect(html).toMatch(/Total Activities/);
    });
  });

  it("escapes custom type labels (no HTML injection from a type name)", () => {
    const rep = {
      ...repTwoEmpty(),
      otherSections: [
        { typeLabel: "<img src=x onerror=alert(1)>", total: 1, rows: [] },
      ],
      otherTotal: 1,
    };
    const { html } = renderDigestEmail(sampleDigest({ userDetails: [rep] }));
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });
});
