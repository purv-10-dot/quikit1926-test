/**
 * Shared Prisma client + helpdesk compatibility adapter.
 *
 * The helpdesk source was authored against a standalone Prisma client with
 * un-prefixed models (`prisma.user`, `prisma.ticket`, …). In the QuikIT
 * monorepo those models live under the `Hd*` prefix in the shared
 * `@quikit/database` client (schema `app_quiksupport`). The `prisma` export
 * below maps the original model names onto the prefixed delegates so the
 * helpdesk code runs unchanged. Always import from "@/lib/db" inside this app.
 */
export { db } from "@quikit/database";
import { db } from "@quikit/database";

export const prisma = {
  tenant: db.hdTenant,
  app: db.hdApp,
  user: db.hdUser,
  category: db.hdCategory,
  subcategory: db.hdSubcategory,
  categoryAgent: db.hdCategoryAgent,
  ticket: db.hdTicket,
  message: db.hdMessage,
  attachment: db.hdAttachment,
  statusHistory: db.hdStatusHistory,
  slaConfig: db.hdSlaConfig,
  notification: db.hdNotification,
  role: db.hdRole,
  permission: db.hdPermission,
  rolePermission: db.hdRolePermission,
  userMapping: db.hdUserMapping,
  auditLog: db.hdAuditLog,
  $transaction: db.$transaction.bind(db),
  $queryRaw: db.$queryRaw.bind(db),
  $queryRawUnsafe: db.$queryRawUnsafe.bind(db),
  $executeRaw: db.$executeRaw.bind(db),
  $executeRawUnsafe: db.$executeRawUnsafe.bind(db),
};
