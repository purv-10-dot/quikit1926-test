/**
 * Notification center — full feed for the current user.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDevAwareSession } from "@/lib/dev-session";
import { db } from "@/lib/db";

export default async function NotificationsPage() {
  const session = await getDevAwareSession();
  const orgId = session?.user?.orgId;
  const userId = session?.user?.id;
  if (!orgId || !userId) notFound();

  const items = await db.vCNotification.findMany({
    where: { orgId, userId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, type: true, title: true, body: true, href: true, readAt: true, createdAt: true },
  });

  return (
    <div className="px-6 py-6 max-w-3xl mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Notifications</h1>
        <p className="text-sm text-gray-500 mt-1">{items.length} most recent</p>
      </header>

      {items.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-500">No notifications yet.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <ul>
            {items.map((n) => (
              <li key={n.id} className="border-b border-gray-100 last:border-b-0">
                <Link
                  href={n.href ?? "#"}
                  className={`block px-5 py-4 hover:bg-gray-50 ${!n.readAt ? "bg-blue-50/30" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{n.title}</p>
                      {n.body && <p className="text-xs text-gray-600 mt-1">{n.body}</p>}
                    </div>
                    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-gray-100 text-gray-600 whitespace-nowrap">
                      {n.type}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2">
                    {new Date(n.createdAt).toLocaleString("en-GB", {
                      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
