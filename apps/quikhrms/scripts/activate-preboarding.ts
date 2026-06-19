import { prisma } from "@/lib/prisma";

async function main() {
  const before = await prisma.employee.count({
    where: { status: "PreBoarding", deletedAt: null },
  });
  console.log(`PreBoarding before: ${before}`);

  const result = await prisma.employee.updateMany({
    where: { status: "PreBoarding", deletedAt: null },
    data: { status: "Active" },
  });
  console.log(`Updated rows: ${result.count}`);

  const after = await prisma.employee.count({
    where: { status: "PreBoarding", deletedAt: null },
  });
  console.log(`PreBoarding after: ${after}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
