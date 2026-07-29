import { PageBackground } from "@/components/hrms/page-background";

export default function PreferencesPage() {
  return (
    <div className="max-w-3xl space-y-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div>
        <h1 className="text-base font-semibold text-gray-900">Preferences</h1>
        <p className="text-xs text-gray-500 mt-1">Personal display settings.</p>
      </div>

      <section className="surface-card p-8 text-center">
        <p className="text-sm text-gray-500">No personal preferences to configure yet.</p>
      </section>
    </div>
  );
}
