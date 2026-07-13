import Link from "next/link";
import { ShieldX } from "lucide-react";
import { PORTALS } from "@/lib/portal/nav";
import type { PortalKey } from "@/lib/portal/hosts";

export function PortalAccessDenied({ portal, message }: { portal: PortalKey; message: string }) {
  const meta = PORTALS[portal];
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md rounded-3xl border bg-card p-8 text-center shadow-card">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600"><ShieldX className="h-6 w-6" /></span>
        <h1 className="mt-4 text-lg font-bold">No access to {meta.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <Link href="/login" className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Back to sign in</Link>
      </div>
    </div>
  );
}
