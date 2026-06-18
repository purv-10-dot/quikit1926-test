import type { Metadata } from "next";
import { PublicDoc } from "./_components/public-doc";

// Public, no-auth shared-doc page. Whitelisted in middleware via the `/share`
// prefix. Not indexable — these are unguessable, revocable links.
export const metadata: Metadata = {
  title: "Shared document · QuikTrack",
  robots: { index: false, follow: false },
};

export default function SharedDocPage({ params }: { params: { token: string } }) {
  return <PublicDoc token={params.token} />;
}
