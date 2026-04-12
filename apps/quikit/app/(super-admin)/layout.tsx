"use client";

/**
 * Super Admin layout — wraps all /super/* routes.
 *
 * Checks that the user is a super_admin (platform-level, not org-level).
 * If not, redirects to /apps.
 */

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2, LayoutGrid, CreditCard, Users, Shield,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Organizations", href: "/organizations", icon: Building2 },
  { label: "App Registry", href: "/app-registry", icon: LayoutGrid },
  { label: "Pricing & Plans", href: "/pricing", icon: CreditCard },
  { label: "Users", href: "/platform-users", icon: Users },
];

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const isSuperAdmin = session?.user?.isSuperAdmin === true;

  useEffect(() => {
    if (status === "authenticated" && !isSuperAdmin) {
      router.push("/apps");
    }
  }, [status, isSuperAdmin, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Loading…
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-gray-900 text-white flex flex-col">
        <div className="px-4 py-5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-red-600 flex items-center justify-center">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider">
                QuikIT
              </p>
              <p className="text-[10px] text-gray-400">Super Admin</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-white/15 text-white font-medium"
                    : "text-gray-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-3 border-t border-white/10">
          <Link
            href="/apps"
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            ← Back to App Launcher
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
