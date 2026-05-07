// QuikConstruction login page — temporarily disabled.
//
// To restore the original UI:
//   git show HEAD:apps/quikconstruction/app/login/page.tsx > apps/quikconstruction/app/login/page.tsx
// (or revert this file via your IDE's git history view).

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="max-w-md w-full text-center bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">
          Login disabled
        </h1>
        <p className="text-sm text-slate-500 leading-relaxed">
          The QuikConstruction login page is currently disabled.
        </p>
      </div>
    </div>
  );
}
