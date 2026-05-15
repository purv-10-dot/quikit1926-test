import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StaticPage } from "./_components/static-page";
import { loadPage } from "./_lib/load-page";
import { buildMetadata } from "./_lib/seo";

export const revalidate = 60;

export const metadata: Metadata = buildMetadata("index");

export default async function MarketingHome() {
  const page = await loadPage("index");
  if (!page) notFound();
  return <StaticPage page={page} />;
}
