# QuikIT — Launcher + IdP + Super Admin

## Cron schedules

`vercel.json` contains **only Hobby-compliant crons** (once-per-day or less frequent).

Vercel Hobby tier limit: 1 cron execution per day maximum.

### Scheduled by Vercel
- `/api/super/cron/cleanup-api-calls` — daily 3 AM UTC (retention cleanup)
- `/api/super/cron/generate-invoices` — monthly 1st at 1 AM UTC

### NOT scheduled by Vercel (fire on-demand from super admin UI)
The following 3 cron endpoints are triggered by buttons on the super admin
pages instead of a scheduled Vercel cron, because their natural cadence
(hourly / every 15 min) exceeds the Hobby tier daily limit:

- `/api/super/cron/rollup-api-calls` — fired from `/analytics` "Refresh data" button
- `/api/super/cron/health-check` — fired from `/app-registry` "Probe all" button
- `/api/super/cron/evaluate-alerts` — fired from `/analytics` "Refresh data" button

All 3 endpoints accept **either** `Authorization: Bearer $CRON_SECRET` (for
future external scheduler integration) **or** a valid super-admin session
cookie (for the UI buttons). See `apps/quikit/lib/requireCronOrSuperAdmin.ts`.

### Upgrade path

To restore sub-daily scheduling without depending on manual clicks:

- **Vercel Pro ($20/mo)**: add the 3 sub-daily crons back to `vercel.json`.
- **UptimeRobot (free)**: create 3 HTTP monitors with `?secret=$CRON_SECRET`
  at desired cadences.
- **GitHub Actions** scheduled workflow: `on: schedule: - cron: ...`.
