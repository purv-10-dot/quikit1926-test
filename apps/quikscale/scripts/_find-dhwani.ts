import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
(async () => {
  const users = await db.user.findMany({
    where: {
      OR: [
        { firstName: { contains: "Dhwani", mode: "insensitive" } },
        { lastName: { contains: "Sharma", mode: "insensitive" } },
        { email: { contains: "dhwani", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      isSuperAdmin: true,
      memberships: {
        select: { orgId: true, role: true, status: true, org: { select: { name: true, slug: true } } },
      },
    },
  });
  console.log(JSON.stringify(users, null, 2));
  await db.$disconnect();
})();
