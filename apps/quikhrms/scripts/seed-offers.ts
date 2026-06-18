import { config } from "dotenv";
config();

import { PrismaClient } from "@quikit/database";

const prisma = new PrismaClient();

const TENANT = "tenant_dev_001";
const USER = "user_dev_001";

async function main() {
  // Pick active applications that don't already have an offer.
  const apps = await prisma.jobApplication.findMany({
    where: {
      orgId: TENANT,
      deletedAt: null,
      status: { in: ["AppActive", "AppHired"] },
      offerStatus: null,
    },
    include: {
      candidate: { select: { firstName: true, lastName: true, expectedCTC: true } },
      requisition: { select: { title: true, salaryMax: true } },
    },
    take: 5,
  });

  if (apps.length === 0) {
    console.log("No eligible applications found (need active apps without offers).");
    return;
  }

  // Build plan — alternate statuses so UI shows Send / Accept / Decline actions.
  const statusPlan: Array<"OfferDraft" | "OfferSent" | "OfferAccepted" | "OfferDeclined"> = [
    "OfferDraft",
    "OfferDraft",
    "OfferSent",
    "OfferSent",
    "OfferAccepted",
  ];

  const today = new Date();
  const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  let created = 0;
  for (let i = 0; i < apps.length; i++) {
    const app = apps[i];
    const plannedStatus = statusPlan[i] ?? "OfferDraft";
    const baseCTC = Number(app.candidate.expectedCTC ?? app.requisition.salaryMax ?? 0);
    const offeredCTC = baseCTC > 0 ? baseCTC : 1500000 + i * 200000;

    // Offer now lives on the application row; set offer* fields + mirror the
    // application status for sent/accepted/declined.
    const appStatus =
      plannedStatus === "OfferSent" ? "AppOffered" as const
      : plannedStatus === "OfferAccepted" ? "AppHired" as const
      : plannedStatus === "OfferDeclined" ? "AppDeclined" as const
      : undefined;

    await prisma.jobApplication.update({
      where: { id: app.id },
      data: {
        offerStatus: plannedStatus,
        offerDesignation: app.requisition.title,
        offeredCTC,
        offerJoiningBonus: i === 0 ? 100000 : null,
        offerRelocationBonus: i === 2 ? 50000 : null,
        offerEquityGrant: i === 3 ? "0.05% vested over 4 years" : null,
        offerJoiningDate: addDays(today, 30 + i * 3),
        offerExpiresAt: addDays(today, 7),
        offerSentAt: plannedStatus === "OfferDraft" ? null : addDays(today, -2),
        offerRespondedAt: plannedStatus === "OfferAccepted" || plannedStatus === "OfferDeclined" ? addDays(today, -1) : null,
        offerCreatedAt: today,
        offerCreatedBy: USER,
        ...(appStatus ? { status: appStatus } : {}),
        updatedBy: USER,
      },
    });

    console.log(`  ${app.candidate.firstName} ${app.candidate.lastName} → ${plannedStatus} · ₹${offeredCTC.toLocaleString("en-IN")}`);
    created++;
  }

  console.log(`Seeded ${created} offers.`);
}

main().finally(() => prisma.$disconnect());
