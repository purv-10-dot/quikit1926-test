import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./marketing.css";


/**
 * Marketing route-group layout — wraps the public landing page at `/`.
 *
 * Providers, <html>/<body> and globals.css are owned by the root layout; this
 * layout only adds the landing fonts (scoped via CSS variables on the
 * `.lp-root` wrapper, never on <body>) and imports marketing.css, which loads
 * after globals.css so its rules win inside the landing zone only.
 */


const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-inter",
});

// The landing's serif display face. The root layout loads Fraunces too, but
// without italics — the landing's `.serif-italic` accents need the real
// italic cuts, so we load our own instance under a separate variable.
const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["500", "600", "700"],
  variable: "--font-fraunces-lp",
});

export const metadata: Metadata = {
  title: "QuikHRMS — The all-in-one HR platform for modern teams",
  description:
    "QuikHRMS unifies the entire employee lifecycle — hire, onboard, pay, manage, engage and grow — in one secure, multi-tenant platform. India-ready payroll, ATS, performance, automation and more.",
};

// Applies the saved landing theme (or OS preference) before first paint to
// avoid a flash. Uses its own `quikhrms-theme` key + `data-theme` attribute —
// deliberately separate from the dashboard's `hrms.theme` + `.dark` system.
const THEME_SCRIPT = `try{var t=localStorage.getItem('quikhrms-theme');if(!t)t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.setAttribute('data-theme',t);}catch(e){}`;

export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`lp-root ${inter.variable} ${fraunces.variable}`}>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      {children}
    </div>
  );
}
