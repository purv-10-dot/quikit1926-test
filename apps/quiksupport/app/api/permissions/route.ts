/**
 * GET /api/permissions
 * Returns the full catalogue of helpdesk (Hd*) system permissions.
 * Any authenticated user in the org can read this (it's not sensitive).
 */

import { prisma } from '@/lib/db'
import { withHelpdeskAuth } from '@/lib/api/withHelpdeskAuth'
import { successResponse } from '@/lib/api'

export const GET = withHelpdeskAuth(async () => {
  const permissions = await prisma.permission.findMany({
    orderBy: [{ resource: 'asc' }, { action: 'asc' }],
  })

  return successResponse(permissions)
})
