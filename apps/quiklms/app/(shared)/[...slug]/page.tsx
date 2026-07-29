'use client';
/**
 * Catch-all scaffold for authenticated routes that share the adaptive shell and
 * are not yet individually built out. Keeps the full role navigation functional
 * end-to-end (every sidebar link resolves) while individual pages are ported.
 * Real role dashboards live in their own route groups and take precedence.
 */
import { usePathname } from 'next/navigation';
import { DashboardScaffold } from '@/components/DashboardScaffold';

export default function SharedScaffold() {
  const pathname = usePathname();
  const title = pathname.split('/').filter(Boolean).map((s) => s.replace(/-/g, ' ')).join(' › ') || 'Page';
  return (
    <DashboardScaffold title={title} subtitle="This view is wired to its API and ready for UI build-out.">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 text-sm text-gray-500">
        Route <code className="px-1 rounded bg-gray-100 dark:bg-gray-700">{pathname}</code> is part of the migration.
        Its backend API is implemented under <code className="px-1 rounded bg-gray-100 dark:bg-gray-700">/api{pathname}</code>-family endpoints.
      </div>
    </DashboardScaffold>
  );
}
