import type { Metadata } from "next";
import { KnowledgeBase } from "./components/KnowledgeBase";

export const metadata: Metadata = {
  title: "Knowledge Base · QuikScale",
  description: "The complete guide to running QuikScale, module by module.",
};

/**
 * /help — the Knowledge Base.
 *
 * Deliberately ungated: it documents the product, not the tenant's data, so
 * every signed-in user can read it regardless of which modules their role
 * grants. It sits inside the dashboard route group so the sidebar and header
 * stay in place while reading.
 */
export default function HelpPage() {
  return (
    <div className="h-[calc(100vh-57px)] bg-white">
      <KnowledgeBase />
    </div>
  );
}
