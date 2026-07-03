// @ts-nocheck — callback param types resolve after prisma generate
import { type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { withHelpdeskAuth } from '@/lib/api/withHelpdeskAuth'
import { successResponse, errorResponse } from '@/lib/api'
import { subDays, format } from 'date-fns'

export const GET = withHelpdeskAuth(async ({ tenantId, user }, req: NextRequest) => {
  if (user.role === 'CUSTOMER') return errorResponse('Access denied', 403)

  const url   = new URL(req.url)
  const type  = url.searchParams.get('type') || 'dashboard'
  const days  = parseInt(url.searchParams.get('days') || '30')
  const appId = url.searchParams.get('app_id') || undefined

  const since = subDays(new Date(), days)
  const base  = {
    tenant_id: tenantId,
    ...(appId && { app_id: appId }),
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
  if (type === 'dashboard') {

    // Build raw queries before transaction (can't nest template literals)
    const dailyCreatedQuery = appId
      ? prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
          SELECT DATE_TRUNC('day', created_at) AS date, COUNT(*) AS count
          FROM   app_quiksupport.tickets
          WHERE  tenant_id = ${tenantId}
            AND  created_at >= ${since}
            AND  app_id = ${appId}
          GROUP BY DATE_TRUNC('day', created_at)
          ORDER BY date ASC`
      : prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
          SELECT DATE_TRUNC('day', created_at) AS date, COUNT(*) AS count
          FROM   app_quiksupport.tickets
          WHERE  tenant_id = ${tenantId}
            AND  created_at >= ${since}
          GROUP BY DATE_TRUNC('day', created_at)
          ORDER BY date ASC`

    const dailyResolvedQuery = appId
      ? prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
          SELECT DATE_TRUNC('day', resolved_at) AS date, COUNT(*) AS count
          FROM   app_quiksupport.tickets
          WHERE  tenant_id = ${tenantId}
            AND  resolved_at IS NOT NULL
            AND  resolved_at >= ${since}
            AND  app_id = ${appId}
          GROUP BY DATE_TRUNC('day', resolved_at)
          ORDER BY date ASC`
      : prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
          SELECT DATE_TRUNC('day', resolved_at) AS date, COUNT(*) AS count
          FROM   app_quiksupport.tickets
          WHERE  tenant_id = ${tenantId}
            AND  resolved_at IS NOT NULL
            AND  resolved_at >= ${since}
          GROUP BY DATE_TRUNC('day', resolved_at)
          ORDER BY date ASC`

    const [
      total, openCount, inProgressCount, resolvedCount, closedCount,
      slaBreachCount, categoryBreakdown, agentLoadRaw,
      dailyCreated, dailyResolved,
    ] = await prisma.$transaction([
      prisma.ticket.count({ where: { ...base, created_at: { gte: since } } }),
      prisma.ticket.count({ where: { ...base, created_at: { gte: since }, status: 'open' } }),
      prisma.ticket.count({ where: { ...base, created_at: { gte: since }, status: 'in_progress' } }),
      prisma.ticket.count({ where: { ...base, created_at: { gte: since }, status: 'resolved' } }),
      prisma.ticket.count({ where: { ...base, created_at: { gte: since }, status: 'closed' } }),
      prisma.ticket.count({
        where: { ...base, created_at: { gte: since }, sla_due_at: { lt: new Date(), not: null } },
      }),
      prisma.category.findMany({
        where: { tenant_id: tenantId },
        select: {
          id: true, name: true, icon: true,
          tickets: {
            where: { ...base, created_at: { gte: since } },
            select: { id: true, status: true },
          },
        },
      }),
      prisma.user.findMany({
        where: { tenant_id: tenantId, role: { in: ['HELPDESK_ADMIN', 'CATEGORY_LEAD', 'AGENT'] }, is_active: true },
        select: {
          id: true, name: true, email: true, color: true, avatar_url: true,
          tickets_assigned: {
            where: { ...base, created_at: { gte: since } },
            select: { id: true, status: true },
          },
        },
      }),
      dailyCreatedQuery,
      dailyResolvedQuery,
    ])

    // Avg resolution hours for the period
    const resolvedWithTimestamps = await prisma.ticket.findMany({
      where: { ...base, created_at: { gte: since }, status: { in: ['resolved', 'closed'] }, resolved_at: { not: null } },
      select: { created_at: true, resolved_at: true },
    })
    const avgResolutionHrs = resolvedWithTimestamps.length
      ? resolvedWithTimestamps.reduce(
          (sum, t) => sum + (t.resolved_at!.getTime() - t.created_at.getTime()), 0
        ) / resolvedWithTimestamps.length / 3_600_000
      : null

    // Priority groupBy
    const priorityStats = await prisma.ticket.groupBy({
      by:    ['priority'],
      where: { ...base, created_at: { gte: since } },
      _count: true,
    })

    // byCategory
    const byCategory = categoryBreakdown
      .filter(c => c.tickets.length > 0)
      .map(c => ({
        name:     c.name,
        icon:     c.icon,
        total:    c.tickets.length,
        open:     c.tickets.filter(t => t.status === 'open').length,
        resolved: c.tickets.filter(t => ['resolved', 'closed'].includes(t.status)).length,
      }))
      .sort((a, b) => b.total - a.total)

    // byPriority
    const byPriority = priorityStats.map(p => ({
      priority: p.priority,
      count:    p._count,
    }))

    // agentLoad
    const agentLoad = agentLoadRaw
      .map(a => ({
        agent:    { id: a.id, name: a.name, email: a.email, color: a.color, avatar_url: a.avatar_url ?? null },
        assigned: a.tickets_assigned.length,
        resolved: a.tickets_assigned.filter(t => ['resolved', 'closed'].includes(t.status)).length,
      }))
      .filter(a => a.assigned > 0)
      .sort((a, b) => b.assigned - a.assigned)

    // dailyVolume — merge created + resolved per day
    const createdMap  = new Map<string, number>()
    const resolvedMap = new Map<string, number>()
    ;(dailyCreated  as Array<{ date: Date; count: bigint }>).forEach(d => {
      createdMap.set(format(new Date(d.date), 'yyyy-MM-dd'), Number(d.count))
    })
    ;(dailyResolved as Array<{ date: Date; count: bigint }>).forEach(d => {
      resolvedMap.set(format(new Date(d.date), 'yyyy-MM-dd'), Number(d.count))
    })
    const allDates = [...new Set([...createdMap.keys(), ...resolvedMap.keys()])].sort()
    const dailyVolume = allDates.map(date => ({
      date,
      created:  createdMap.get(date)  || 0,
      resolved: resolvedMap.get(date) || 0,
    }))

    return successResponse({
      summary: {
        total,
        open:                        openCount,
        in_progress:                 inProgressCount,
        resolved:                    resolvedCount,
        closed:                      closedCount,
        avg_resolution_hrs:          avgResolutionHrs,
        sla_breach_count:            slaBreachCount,
        first_response_breach_count: 0,   // not yet tracked per-ticket
      },
      byCategory,
      byPriority,
      agentLoad,
      dailyVolume,
    })
  }

  // ── Agents ────────────────────────────────────────────────────────────────
  if (type === 'agents') {
    const rawAgents = await prisma.user.findMany({
      where: { tenant_id: tenantId, role: { in: ['HELPDESK_ADMIN', 'CATEGORY_LEAD', 'AGENT'] }, is_active: true },
      select: { id: true, name: true, email: true, color: true, avatar_url: true, title: true },
    })

    const agents = await Promise.all(
      rawAgents.map(async a => {
        const tickets = await prisma.ticket.findMany({
          where:  { ...base, assigned_to_id: a.id, created_at: { gte: since } },
          select: { id: true, status: true, created_at: true, resolved_at: true },
        })

        const resolvedTickets = tickets.filter(t => ['resolved', 'closed'].includes(t.status) && t.resolved_at)
        const avgResolutionMs  = resolvedTickets.length
          ? resolvedTickets.reduce((sum, t) => sum + (t.resolved_at!.getTime() - t.created_at.getTime()), 0)
            / resolvedTickets.length
          : 0

        return {
          agent: {
            id:         a.id,
            name:       a.name,
            email:      a.email,
            color:      a.color,
            avatar_url: a.avatar_url ?? null,
            title:      a.title ?? null,
          },
          total:              tickets.length,
          open:               tickets.filter(t => t.status === 'open').length,
          in_progress:        tickets.filter(t => t.status === 'in_progress').length,
          resolved:           resolvedTickets.length,
          avg_resolution_hrs: avgResolutionMs > 0 ? avgResolutionMs / 3_600_000 : null,
        }
      })
    )

    return successResponse({ agents })
  }

  // ── SLA ───────────────────────────────────────────────────────────────────
  if (type === 'sla') {
    const priorities = ['critical', 'high', 'medium', 'low'] as const

    const byPriority = await Promise.all(
      priorities.map(async p => {
        const [total, breached] = await prisma.$transaction([
          prisma.ticket.count({
            where: { ...base, priority: p, created_at: { gte: since }, sla_due_at: { not: null } },
          }),
          prisma.ticket.count({
            where: { ...base, priority: p, created_at: { gte: since }, sla_due_at: { lt: new Date(), not: null } },
          }),
        ])
        return {
          priority:       p,
          total,
          breached,
          compliance_pct: total > 0 ? ((total - breached) / total) * 100 : 100,
        }
      })
    )

    return successResponse({ byPriority })
  }

  return errorResponse('Unknown report type', 400)
})
