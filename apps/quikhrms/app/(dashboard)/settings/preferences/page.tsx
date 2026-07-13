export default function PreferencesPage() {
  return (
    <div className="max-w-3xl space-y-4">
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
