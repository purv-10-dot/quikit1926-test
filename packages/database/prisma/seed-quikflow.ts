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
