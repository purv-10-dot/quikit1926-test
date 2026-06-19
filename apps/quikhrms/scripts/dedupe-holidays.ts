import { PrismaClient } from "@quikit/database";
import "dotenv/config";

const prisma = new PrismaClient();

async function main() {
  // Holidays now live in the single flat CompanyHoliday table (the former
  // calendar-grouped Holiday table was merged in and dropped).
  const companySql = `
    DELETE FROM "CompanyHoliday" a
    USING (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY "orgId", "date", "name"
        ORDER BY "createdAt" ASC
      ) AS rn
      FROM "CompanyHoliday"
      WHERE "deletedAt" IS NULL
    ) dups
    WHERE a.id = dups.id AND dups.rn > 1
  `;
  const c = await prisma.$executeRawUnsafe(companySql);
  console.log(`CompanyHoliday dedupe: removed ${c} duplicate rows`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
