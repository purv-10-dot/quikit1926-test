"use client";

/**
 * App Launcher — /apps
 *
 * The central hub of QuikIT. Shows apps the user's org has access to
 * ("Installed") and apps available in the registry ("Available").
 *
 * Each app card shows: icon, name, description, status, "Launch" button.
 * Clicking "Launch" initiates the OAuth flow → redirects to the app's
 * baseUrl with an auth code.
 *
 * Admin users see an "Enable" button on Available apps that creates
 * UserAppAccess records for their org.
 */

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import {
  Rocket, Grid3X3, Search, ExternalLink, Plus,
  CheckCircle2, Clock, Sparkles,
} from "lucide-react";

interface AppInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  iconUrl: string | null;
  baseUrl: string;
  status: string;
  installed: boolean;
  role?: string;
}

type Tab = "installed" | "available";

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  active: { label: "Active", icon: CheckCircle2, color: "text-green-600 bg-green-50 border-green-200" },
  beta: { label: "Beta", icon: Sparkles, color: "text-purple-600 bg-purple-50 border-purple-200" },
  coming_soon: { label: "Coming Soon", icon: Clock, color: "text-amber-600 bg-amber-50 border-amber-200" },
};

const ICON_FALLBACKS: Record<string, string> = {
  quikscale: "📊",
  admin: "⚙️",
  quikhr: "👥",
  quikfinance: "💰",
  quiksales: "📈",
  quikproject: "📋",
};

export default function AppLauncherPage() {
  const { data: session } = useSession();
  const [tab, setTab] = useState<Tab>("installed");
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const isAdmin =
    session?.user?.membershipRole === "admin" ||
    session?.user?.membershipRole === "super_admin";

  useEffect(() => {
    fetch("/api/apps/launcher")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setApps(j.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const installed = apps.filter((a) => a.installed);
  const available = apps.filter((a) => !a.installed);
  const displayed = tab === "installed" ? installed : available;
  const filtered = search
    ? displayed.filter(
        (a) =>
          a.name.toLowerCase().includes(search.toLowerCase()) ||
          (a.description ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : displayed;

  async function handleEnable(appId: string) {
    const res = await fetch("/api/apps/enable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId }),
    });
    const j = await res.json();
    if (j.success) {
      setApps((prev) =>
        prev.map((a) => (a.id === appId ? { ...a, installed: true } : a)),
      );
    }
  }

  function handleLaunch(app: AppInfo) {
    // Initiate OAuth flow by redirecting to the app's baseUrl
    // The app's middleware will detect no session and redirect to
    // QuikIT's /api/oauth/authorize, which handles the code exchange
    window.location.href = app.baseUrl;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white">
                <Grid3X3 className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">QuikIT Apps</h1>
                <p className="text-sm text-gray-500">
                  {session?.user?.name
                    ? `Welcome back, ${session.user.name.split(" ")[0]}`
                    : "Your app dashboard"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search apps..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 w-64"
                />
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-200 -mb-px">
            <button
              onClick={() => setTab("installed")}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === "installed"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Installed ({installed.length})
            </button>
            <button
              onClick={() => setTab("available")}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === "available"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Available ({available.length})
            </button>
          </div>
        </div>
      </header>

      {/* App grid */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {loading && (
          <div className="text-sm text-gray-400 text-center py-20">
            Loading apps…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-20">
            <Rocket className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              {tab === "installed"
                ? "No apps installed yet. Check the Available tab."
                : "No more apps available."}
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              isAdmin={isAdmin}
              onLaunch={() => handleLaunch(app)}
              onEnable={() => handleEnable(app.id)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function AppCard({
  app,
  isAdmin,
  onLaunch,
  onEnable,
}: {
  app: AppInfo;
  isAdmin: boolean;
  onLaunch: () => void;
  onEnable: () => void;
}) {
  const statusCfg = STATUS_CONFIG[app.status] ?? STATUS_CONFIG.active;
  const StatusIcon = statusCfg.icon;
  const icon = app.iconUrl ?? ICON_FALLBACKS[app.slug] ?? "📦";
  const isEmoji = !app.iconUrl;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-indigo-300 hover:shadow-md transition-all group">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {isEmoji ? (
            <div className="h-12 w-12 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-2xl">
              {icon}
            </div>
          ) : (
            <img
              src={icon}
              alt={app.name}
              className="h-12 w-12 rounded-xl object-cover"
            />
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 truncate">
              {app.name}
            </h3>
            <span
              className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium ${statusCfg.color}`}
            >
              <StatusIcon className="h-2.5 w-2.5" />
              {statusCfg.label}
            </span>
          </div>
        </div>
      </div>

      {app.description && (
        <p className="text-xs text-gray-600 mb-4 line-clamp-2">
          {app.description}
        </p>
      )}

      <div className="flex items-center gap-2">
        {app.installed ? (
          <button
            onClick={onLaunch}
            disabled={app.status === "coming_soon"}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Launch
          </button>
        ) : isAdmin ? (
          <button
            onClick={onEnable}
            disabled={app.status === "coming_soon"}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl border border-indigo-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-3.5 w-3.5" />
            Enable for org
          </button>
        ) : (
          <span className="flex-1 text-center text-xs text-gray-400 py-2">
            Contact admin to enable
          </span>
        )}
      </div>
    </div>
  );
}
