/**
 * Seed QuikFlow's global template gallery (app_quikflow.WfTemplate).
 *
 * Run: cd packages/database && npx tsx prisma/seed-quikflow.ts
 *
 * Templates are org-agnostic starting points shown on the Templates page.
 * Idempotent — upserts by (name). Safe to re-run.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEMPLATES = [
  {
    name: "KPI at-risk → alert lead",
    app: "quikscale",
    category: "Performance",
    description: "When a KPI drops below target, notify the team lead.",
    triggerLabel: "KPI below target",
    actionLabel: "Slack the team lead",
  },
  {
    name: "New lead → Slack + assign",
    app: "quikcrm",
    category: "Sales",
    description: "When a new lead is added, assign a rep and post to #sales.",
    triggerLabel: "New lead added",
    actionLabel: "Assign + post to #sales",
  },
  {
    name: "Leave approved → notify team",
    app: "quikhrms",
    category: "HR",
    description: "When leave is approved, email the team.",
    triggerLabel: "Leave approved",
    actionLabel: "Email the team",
  },
  {
    name: "Big PO → finance sign-off",
    app: "quikinfra",
    category: "Construction",
    description: "When a large PO is raised, request finance approval.",
    triggerLabel: "PO over ₹5L",
    actionLabel: "Request approval",
  },
  {
    name: "Deal won → start onboarding",
    app: "quikcrm",
    category: "Sales",
    description: "When a deal is marked won, create the HR onboarding checklist.",
    triggerLabel: "Deal marked won",
    actionLabel: "Create HR onboarding",
  },
  {
    name: "Weekly KPI digest",
    app: "quikscale",
    category: "Performance",
    description: "Every Monday, compile KPI status and email it.",
    triggerLabel: "Every Monday 9am",
    actionLabel: "Compile + email",
  },
  {
    name: "Campaign done → log to Sheet",
    app: "quiksocial",
    category: "Marketing",
    description: "When a campaign completes, append a row to a sheet.",
    triggerLabel: "Campaign completed",
    actionLabel: "Append a row",
  },
  {
    name: "New hire → welcome pack",
    app: "quikhrms",
    category: "HR",
    description: "When a new employee is added, send Slack + email + create a task.",
    triggerLabel: "New employee added",
    actionLabel: "Slack + email + task",
  },
  {
    name: "Overdue task → nudge owner",
    app: "quiktrack",
    category: "Projects",
    description: "When a task is overdue, Slack the owner.",
    triggerLabel: "Task overdue",
    actionLabel: "Slack the owner",
  },
  {
    // Real, prefilled starting point: seeds the trigger + two calendar actions so
    // "Use template" opens a ready-to-activate Client Master → Teams workflow.
    name: "Client Master → Teams meetings",
    app: "quikscale",
    category: "Meeting Rhythm",
    isTested: true,
    description:
      "When a client is added, create recurring Daily Huddle (Mon–Fri) & Weekly Meeting Teams online meetings on the connected calendar.",
    triggerLabel: "A client is created",
    actionLabel: "Create 2 Teams meetings",
    graphNodes: [
      {
        id: "trigger",
        kind: "trigger",
        label: "A client is created",
        config: { app: "quikscale", module: "clientMaster", event: "clientMaster.created" },
      },
      {
        id: "step_1",
        kind: "action",
        label: "Daily Huddle (Teams)",
        config: {
          actionId: "calendar.event.create",
          params: {
            subject: "Daily Huddle — {{trigger.name}}",
            kind: "daily",
            start_time: "{{trigger.dailyStartTime}}",
            end_time: "{{trigger.dailyEndTime}}",
            attendees: "{{trigger.teamMemberEmails}}",
            optional_attendees: "{{trigger.optionalMemberEmails}}",
            date: "{{trigger.startDate}}",
            recurrence: "weekdays",
            recurrence_days: "{{trigger.dailyDays}}",
            recurrence_until: "{{trigger.meetingUntil}}",
            online_meeting: "true",
          },
        },
      },
      {
        id: "step_2",
        kind: "action",
        label: "Weekly Meeting (Teams)",
        config: {
          actionId: "calendar.event.create",
          params: {
            subject: "Weekly Meeting — {{trigger.name}}",
            kind: "weekly",
            start_time: "{{trigger.weeklyStartTime}}",
            end_time: "{{trigger.weeklyEndTime}}",
            attendees: "{{trigger.teamMemberEmails}}",
            optional_attendees: "{{trigger.optionalMemberEmails}}",
            date: "{{trigger.startDate}}",
            recurrence: "weekly",
            recurrence_days: "{{trigger.weeklyDay}}",
            recurrence_until: "{{trigger.meetingUntil}}",
            online_meeting: "true",
          },
        },
      },
    ],
    graphEdges: [
      { from: "trigger", to: "step_1" },
      { from: "step_1", to: "step_2" },
    ],
  },
  {
    // Cleanup counterpart: tears down the meetings the create template made.
    name: "Client removed → remove Teams meetings",
    app: "quikscale",
    category: "Meeting Rhythm",
    isTested: true,
    description:
      "When a client is deleted, remove the Daily Huddle & Weekly Meeting Teams events created for it.",
    triggerLabel: "A client is deleted",
    actionLabel: "Delete Teams meetings",
    graphNodes: [
      {
        id: "trigger",
        kind: "trigger",
        label: "A client is deleted",
        config: { app: "quikscale", module: "clientMaster", event: "clientMaster.deleted" },
      },
      {
        id: "step_1",
        kind: "action",
        label: "Delete Teams meetings",
        // No params → deletes every event (all kinds) linked to the deleted client.
        config: { actionId: "calendar.event.delete", params: {} },
      },
    ],
    graphEdges: [{ from: "trigger", to: "step_1" }],
  },
  {
    // Real, prefilled starting point: Fathom finishes a transcript → save it
    // into QuikScale Meeting Rhythm (client/type/date matching happens
    // server-side, idempotent on (orgId, recordingId)).
    name: "Fathom transcript → Meeting Rhythm",
    app: "fathom",
    category: "Meeting Rhythm",
    isTested: true,
    description:
      "When Fathom finishes transcribing a meeting, save the transcript into the matching QuikScale Meeting Rhythm record.",
    triggerLabel: "A meeting transcript is ready",
    actionLabel: "Save transcript to QuikScale",
    graphNodes: [
      {
        id: "trigger",
        kind: "trigger",
        label: "A meeting transcript is ready",
        config: { app: "fathom", module: "Meetings", event: "fathom.meeting.transcribed" },
      },
      {
        id: "step_1",
        kind: "action",
        label: "Save transcript to QuikScale",
        config: { actionId: "quikscale.save_transcript", params: {} },
      },
    ],
    graphEdges: [{ from: "trigger", to: "step_1" }],
  },
  {
    // Real, prefilled starting point: any inbound Gmail message auto-replies
    // from the org's connected Gmail account.
    name: "New Gmail → auto-reply",
    app: "mail",
    category: "Sales",
    description: "When a new email lands in a connected Gmail inbox, send an automatic reply.",
    triggerLabel: "A new Gmail email is received",
    actionLabel: "Reply via Gmail",
    graphNodes: [
      {
        id: "trigger",
        kind: "trigger",
        label: "A new Gmail email is received",
        config: {
          app: "mail",
          module: "Email",
          event: "mail.email.received",
          filter: { combine: "and", rules: [{ field: "trigger.provider", operator: "eq", value: "gmail" }] },
        },
      },
      {
        id: "step_1",
        kind: "action",
        label: "Reply via Gmail",
        config: {
          actionId: "gmail.send",
          params: {
            to: "{{trigger.from}}",
            subject: "Re: {{trigger.subject}}",
            body: "Thanks for your email — we've received it and will get back to you shortly.",
          },
        },
      },
    ],
    graphEdges: [{ from: "trigger", to: "step_1" }],
  },
  {
    // Real, prefilled starting point: any inbound Outlook message auto-replies
    // from the org's connected Outlook account.
    name: "New Outlook email → auto-reply",
    app: "mail",
    category: "Sales",
    description: "When a new email lands in a connected Outlook inbox, send an automatic reply.",
    triggerLabel: "A new Outlook email is received",
    actionLabel: "Reply via Outlook",
    graphNodes: [
      {
        id: "trigger",
        kind: "trigger",
        label: "A new Outlook email is received",
        config: {
          app: "mail",
          module: "Email",
          event: "mail.email.received",
          filter: { combine: "and", rules: [{ field: "trigger.provider", operator: "eq", value: "outlook" }] },
        },
      },
      {
        id: "step_1",
        kind: "action",
        label: "Reply via Outlook",
        config: {
          actionId: "outlook.send",
          params: {
            to: "{{trigger.from}}",
            subject: "Re: {{trigger.subject}}",
            body: "Thanks for your email — we've received it and will get back to you shortly.",
          },
        },
      },
    ],
    graphEdges: [{ from: "trigger", to: "step_1" }],
  },
];

async function main() {
  for (const t of TEMPLATES) {
    const existing = await prisma.wfTemplate.findFirst({ where: { name: t.name } });
    if (existing) {
      await prisma.wfTemplate.update({ where: { id: existing.id }, data: t });
    } else {
      await prisma.wfTemplate.create({ data: t });
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[seed-quikflow] upserted ${TEMPLATES.length} templates`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
