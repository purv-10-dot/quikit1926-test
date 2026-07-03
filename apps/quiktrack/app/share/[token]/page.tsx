import type { Metadata } from "next";
import { loadPublicSharedDoc } from "@/lib/docs/public-share";
import { PublicDoc } from "./_components/public-doc";
import { PublicDocView, PublicDocUnavailable } from "./_components/public-doc-view";

// Public, no-auth shared-doc page. Whitelisted in middleware via the `/share`
// prefix. Not indexable — these are unguessable, revocable links.
export const metadata: Metadata = {
  title: "Shared document · QuikTrack",
  robots: { index: false, follow: false },
};

// Always resolve the token per request against the live doc/share state.
export const dynamic = "force-dynamic";

export default async function SharedDocPage({ params }: { params: { token: string } }) {
  // Resolve on the SERVER so a plain view renders without any client JS — this
  // is what makes the link open in mobile in-app browsers. Edit mode needs the
  // rich-text editor, so it hands off to the client component (seeded with the
  // doc so it needn't refetch).
  const doc = await loadPublicSharedDoc(params.token);
  if (!doc) return <PublicDocUnavailable />;
  if (doc.shareMode === "edit") return <PublicDoc token={params.token} initialDoc={doc} />;
  return <PublicDocView doc={doc} />;
}
