import { PrismaClient } from "@quikit/database";
import "dotenv/config";

const prisma = new PrismaClient();
const TENANT = "tenant_dev_001";
const KEEP_SLUGS = ["eng", "hr", "sales", "mkt", "fin", "ops"];

async function run() {
  const obsolete = await prisma.ticketCategory.findMany({
    where: { orgId: TENANT, slug: { notIn: KEEP_SLUGS } },
    select: { id: true, slug: true },
  });
  if (obsolete.length === 0) {
    console.log("No obsolete categories.");
    return;
  }
  const ids = obsolete.map((c) => c.id);
  const ticketsDel = await prisma.ticketActivity.deleteMany({
    where: { orgId: TENANT, ticket: { categoryId: { in: ids } } },
  });
  const attDel = await prisma.ticketAttachment.deleteMany({
    where: { orgId: TENANT, ticket: { categoryId: { in: ids } } },
  });
  const commentsDel = await prisma.ticketComment.deleteMany({
    where: { orgId: TENANT, ticket: { categoryId: { in: ids } } },
  });
  const ticketsRemoved = await prisma.ticket.deleteMany({
    where: { orgId: TENANT, categoryId: { in: ids } },
  });
  const removed = await prisma.ticketCategory.deleteMany({
    where: { id: { in: ids } },
  });
  console.log(`Activities: ${ticketsDel.count}, Attachments: ${attDel.count}, Comments: ${commentsDel.count}, Tickets: ${ticketsRemoved.count}, Categories: ${removed.count}`);
}

run()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
