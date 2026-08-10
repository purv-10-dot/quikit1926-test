/**
 * RBAC v2 query helpers — replace dropped Employee.role chained queries.
 *
 * Old:  prisma.employee.findFirst({ where: { role: { code: { in: ["x"] } } } })
 * New:  prisma.employee.findFirst({ where: { ...whereEmployeeHasAnyRole(["x"]) } })
 */

import type { Prisma } from "@quikit/database";
import { APP_ID, rolePriority } from "./registry";

export function whereEmployeeHasAnyRole(roleNames: string[]): Prisma.EmployeeWhereInput {
  return {
    appRoles: {
      some: { role: { appId: APP_ID, name: { in: roleNames } } },
    },
  };
}


/** Sort a fetched-with-appRoles list by max role priority descending. */
export function sortByMaxRolePriorityDesc<
  T extends { appRoles: { role: { name: string } }[] },
>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => {
    const pa = a.appRoles.reduce((m, ar) => Math.max(m, rolePriority(ar.role.name)), 0);
    const pb = b.appRoles.reduce((m, ar) => Math.max(m, rolePriority(ar.role.name)), 0);
    return pb - pa;
  });
}

/** Convenience select shape for the appRoles join when you just want role names. */
export const appRolesNameSelect = {
  appRoles: {
    where: { role: { appId: APP_ID } },
    select: { role: { select: { name: true } } },
  },
} as const;
