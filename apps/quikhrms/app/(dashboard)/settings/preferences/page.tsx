"use client";

import { ThemeToggle } from "@/components/hrms/theme-toggle";
import { Palette } from "lucide-react";

export default function PreferencesPage() {
  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Preferences</h1>
        <p className="text-sm text-gray-500 mt-1">Personal display settings.</p>
      </div>

      <section className="surface-card p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center shrink-0">
            <Palette size={18} className="text-amber-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Appearance</h2>
            <p className="text-xs text-gray-500 mt-0.5">Switch between light and dark theme.</p>
          </div>
          <ThemeToggle />
        </div>
      </section>
    </div>
  );
}
