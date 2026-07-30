/** Fullscreen group — NO sidebar/topbar shell (course player, exam taking). */
export default function FullscreenLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-black text-white">{children}</div>;
}
