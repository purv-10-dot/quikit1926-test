import Link from "next/link";
import { UserCog, ChevronRight } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="p-4 sm:p-6 space-y-4">
      <Link
        href="/settings/user-management"
        className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-5 transition-colors hover:border-accent-300 hover:bg-accent-50/40"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-100 text-accent-600">
            <UserCog className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-800">User Management</h2>
            <p className="text-xs text-gray-500">
              Invite members, assign roles, and configure permissions for QuikAsset.
            </p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
      </Link>

      <div className="rounded-xl border border-gray-200 bg-white p-8 space-y-2">
        <h2 className="text-sm font-semibold text-gray-800">Organization &amp; Theme</h2>
        <p className="text-xs text-gray-500 leading-relaxed">
          Organization and theme settings are managed by the QuikAsset platform shell.
          Your accent color and branding are applied automatically across the app.
        </p>
        <p className="text-xs text-gray-400">
          Authentication and access are handled centrally.
        </p>
      </div>
    </div>
  );
}
