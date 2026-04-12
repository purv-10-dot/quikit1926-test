"use client";

/**
 * Super Admin: App Registry — /apps-admin
 *
 * Manage the platform's app catalog. Publish/unpublish apps,
 * view OAuth client details, manage app metadata.
 */

import { useState, useEffect } from "react";
import { LayoutGrid, Plus, ExternalLink, Key } from "lucide-react";

interface AppInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  baseUrl: string;
  status: string;
  createdAt: string;
  hasOAuthClient: boolean;
}

export default function AppRegistryPage() {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/super/apps")
      .then((r) => r.json())
      .then((j) => { if (j.success) setApps(j.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-gray-900">App Registry</h1>
          <p className="text-sm text-gray-500">
            {apps.length} apps registered on the platform
          </p>
        </div>
        <button className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl">
          <Plus className="h-4 w-4" /> Register App
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-12 text-center">Loading…</div>
      ) : apps.length === 0 ? (
        <div className="text-center py-12">
          <LayoutGrid className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No apps registered yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {apps.map((app) => (
            <div key={app.id} className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{app.name}</h3>
                  <p className="text-xs text-gray-500">{app.slug}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  app.status === "active" ? "bg-green-50 text-green-700" :
                  app.status === "coming_soon" ? "bg-amber-50 text-amber-700" :
                  "bg-gray-100 text-gray-600"
                }`}>
                  {app.status}
                </span>
              </div>
              {app.description && (
                <p className="text-xs text-gray-600 mb-3">{app.description}</p>
              )}
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" /> {app.baseUrl}
                </span>
                {app.hasOAuthClient && (
                  <span className="flex items-center gap-1 text-green-600">
                    <Key className="h-3 w-3" /> OAuth configured
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
