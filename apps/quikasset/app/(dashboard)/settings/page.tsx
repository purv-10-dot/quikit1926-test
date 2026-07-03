export default function SettingsPage() {
  return (
    <div className="p-4 sm:p-6">
      <div className="bg-white rounded-xl border border-gray-200 p-8 space-y-2">
        <h2 className="text-sm font-semibold text-gray-800">Settings</h2>
        <p className="text-xs text-gray-500 leading-relaxed">
          Organization and theme settings are managed by the QuikAsset platform shell.
          Your accent color and branding are applied automatically across the app.
        </p>
        <p className="text-xs text-gray-400">
          Authentication and access are handled centrally — there is nothing to configure here yet.
        </p>
      </div>
    </div>
  )
}
