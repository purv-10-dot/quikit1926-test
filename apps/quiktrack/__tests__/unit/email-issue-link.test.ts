import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression: notification emails deep-linked to
 * `/spaces/<projectId>/board?issue=<id>`. The board route
 * (`app/(dashboard)/spaces/[id]/board/page.tsx`) takes only `params` and never
 * `searchParams`, so the query string was silently dropped and the recipient
 * landed on the project board instead of the ticket they were sent.
 *
 * Emails must point at the canonical readable work-item URL, `/browse/<KEY>`,
 * which resolves key → issue server-side and renders the full-page view.
 */

const sendMail = vi.fn(async (_opts: { html: string; subject: string }) => ({
  messageId: "test-message-id",
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail,
      verify: async () => true,
    }),
  },
}));

const ISSUE = {
  id: "issue-uuid-1",
  key: "SCRUM-58",
  title: "Login button does nothing",
  projectId: "project-uuid-1",
  projectName: "Scrum Board",
  orgId: "org-uuid-b",
};

/** The captured `html` of the single email the template sent. */
function sentHtml(): string {
  expect(sendMail).toHaveBeenCalledTimes(1);
  const call = sendMail.mock.calls[0];
  if (!call) throw new Error("no email was sent");
  return call[0].html;
}

describe("notification email deep-links", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    sendMail.mockClear();
    // An IP host skips the DNS-resolve path in buildTransport; createTransport
    // is mocked, so nothing touches the network.
    process.env = {
      ...OLD_ENV,
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "587",
      SMTP_USER: "bot@quikit.ai",
      SMTP_PASS: "secret",
      QUIKTRACK_URL: "https://track.quikit.ai",
    };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("points the assignment email at the work item, not the board", async () => {
    const { emailIssueAssigned } = await import("@/lib/email/sendEmail");
    await emailIssueAssigned({
      to: "dev@quikit.ai",
      assigneeName: "Pravin",
      issue: ISSUE,
      reassignedBy: "Akhilesh",
    });

    const html = sentHtml();
    expect(html).toContain("https://track.quikit.ai/browse/SCRUM-58");
    // The exact shape of the old bug — must never come back.
    expect(html).not.toContain("/board?issue=");
    expect(html).not.toContain("/board");
  });

  it("uses the work-item link for both the key and the CTA button", async () => {
    const { emailIssueAssigned } = await import("@/lib/email/sendEmail");
    await emailIssueAssigned({
      to: "dev@quikit.ai",
      assigneeName: null,
      issue: ISSUE,
      reassignedBy: null,
    });

    const html = sentHtml();
    const links = html.match(/https:\/\/track\.quikit\.ai\/browse\/SCRUM-58/g) ?? [];
    // Once for the monospace key link, once for the "View task" CTA.
    expect(links.length).toBeGreaterThanOrEqual(2);
  });

  it("deep-links status-change, mention and overdue emails the same way", async () => {
    const mod = await import("@/lib/email/sendEmail");

    await mod.emailIssueStatusChanged({
      to: "dev@quikit.ai",
      recipientName: "Pravin",
      issue: ISSUE,
      fromStatus: "To Do",
      toStatus: "In Progress",
      changedBy: "Akhilesh",
    });
    expect(sentHtml()).toContain("https://track.quikit.ai/browse/SCRUM-58");
    sendMail.mockClear();

    await mod.emailIssueMention({
      to: "dev@quikit.ai",
      recipientName: "Pravin",
      issue: ISSUE,
      mentionedBy: "Akhilesh",
      context: "comment",
      excerpt: "can you take a look?",
    });
    expect(sentHtml()).toContain("https://track.quikit.ai/browse/SCRUM-58");
    sendMail.mockClear();

    await mod.emailIssueOverdue({
      to: "dev@quikit.ai",
      recipientName: "Pravin",
      issue: { ...ISSUE, dueDate: "2026-01-15" },
    });
    expect(sentHtml()).toContain("https://track.quikit.ai/browse/SCRUM-58");
  });

  it("names the owning org so a multi-org recipient lands on the right workspace", async () => {
    const { emailIssueAssigned } = await import("@/lib/email/sendEmail");
    await emailIssueAssigned({
      to: "dev@quikit.ai",
      assigneeName: "Pravin",
      issue: ISSUE,
      reassignedBy: null,
    });

    // Without `?org=`, the link resolves against whichever org the recipient's
    // session happens to be on — a 404 whenever that isn't the issue's org.
    expect(sentHtml()).toContain(
      "https://track.quikit.ai/browse/SCRUM-58?org=org-uuid-b",
    );
  });

  it("omits the org param when the caller didn't supply one", async () => {
    const { emailIssueAssigned } = await import("@/lib/email/sendEmail");
    const { orgId: _orgId, ...noOrg } = ISSUE;
    await emailIssueAssigned({
      to: "dev@quikit.ai",
      assigneeName: null,
      issue: noOrg,
      reassignedBy: null,
    });

    const html = sentHtml();
    expect(html).toContain("https://track.quikit.ai/browse/SCRUM-58");
    expect(html).not.toContain("?org=");
  });

  it("URL-encodes the issue key", async () => {
    const { emailIssueAssigned } = await import("@/lib/email/sendEmail");
    await emailIssueAssigned({
      to: "dev@quikit.ai",
      assigneeName: null,
      issue: { ...ISSUE, key: "MY PROJ-9" },
      reassignedBy: null,
    });

    expect(sentHtml()).toContain("https://track.quikit.ai/browse/MY%20PROJ-9");
  });
});
