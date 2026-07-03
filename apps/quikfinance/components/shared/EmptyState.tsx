import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function EmptyState({ title, description, actionLabel, actionHref }: { title: string; description: string; actionLabel?: string; actionHref?: string }) {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center gap-4 rounded-lg border border-dashed bg-card p-8 text-center">
      <Image
        src="https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=480&q=80"
        alt="Accounting documents on a desk"
        width={480}
        height={320}
        className="h-28 w-40 rounded-md object-cover shadow-soft"
      />
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
      {actionLabel && actionHref ? (
        <Button asChild className="mt-1">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      ) : null}
    </div>
  );
}
