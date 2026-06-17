import { config } from "dotenv";
config();

import { PrismaClient } from "@quikit/database";

const prisma = new PrismaClient();

const TENANT = "tenant_dev_001";

const updates: Array<{ firstName: string; lastName: string; oldEmail: string; newEmail: string }> = [
  { firstName: "Rohit",   lastName: "Kumar", oldEmail: "rohit.k@example.com",   newEmail: "gourav.chandel+rohit@moreyeahs.com" },
  { firstName: "Aisha",   lastName: "Khan",  oldEmail: "aisha.k@example.com",   newEmail: "gourav.chandel+aisha@moreyeahs.com" },
  { firstName: "Deepak",  lastName: "Yadav", oldEmail: "deepak.y@example.com",  newEmail: "gourav.chandel+deepak@moreyeahs.com" },
  { firstName: "Meera",   lastName: "Nair",  oldEmail: "meera.n@example.com",   newEmail: "gourav.chandel+meera@moreyeahs.com" },
  { firstName: "Sandeep", lastName: "Joshi", oldEmail: "sandeep.j@example.com", newEmail: "gourav.chandel+sandeep@moreyeahs.com" },
];

async function main() {
  let updated = 0, skipped = 0, missing = 0;
  for (const u of updates) {
    const cand = await prisma.candidate.findFirst({
      where: { orgId: TENANT, firstName: u.firstName, lastName: u.lastName, deletedAt: null },
      select: { id: true, email: true },
    });
    if (!cand) {
      console.log(`  ✗ ${u.firstName} ${u.lastName} — not found`);
      missing++;
      continue;
    }
    if (cand.email === u.newEmail) {
      console.log(`  · ${u.firstName} ${u.lastName} — already ${u.newEmail}`);
      skipped++;
      continue;
    }
    await prisma.candidate.update({
      where: { id: cand.id },
      data: { email: u.newEmail },
    });
    console.log(`  ✓ ${u.firstName} ${u.lastName} — ${cand.email} → ${u.newEmail}`);
    updated++;
  }
  console.log(`\nDone. Updated ${updated}, skipped ${skipped}, missing ${missing}.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
