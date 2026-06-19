import {
  LayoutDashboard,
  BarChart3,
  Wallet,
  Calendar,
  Mail,
  MessageCircle,
  Settings,
  Shield,
  Cloud,
  Search,
  Bell,
  FileText,
  Folder,
  User,
  Camera,
  MapPin,
  Rocket,
  Star,
  Music,
  Gift,
  Smartphone,
  Lock,
  Clock,
  Trophy,
  Flame,
  CreditCard,
  Image as ImageIcon,
  Video,
  Bookmark,
  Key,
  Globe,
  Briefcase,
  type LucideIcon,
} from "lucide-react";

/**
 * Professional project-icon set: a rounded gradient tile with a clean white
 * glyph (à la modern app icons). The project's `icon` field stores one of
 * these keys. Legacy projects store an emoji string instead — `SpaceIcon`
 * renders that as a fallback, so no data migration is required.
 */
export interface ProjectIconDef {
  key: string;
  label: string;
  Icon: LucideIcon;
  /** Tailwind `bg-gradient-to-br` stops. */
  gradient: string;
}

export const PROJECT_ICONS: ProjectIconDef[] = [
  { key: "dashboard", label: "Dashboard", Icon: LayoutDashboard, gradient: "from-blue-500 to-indigo-500" },
  { key: "analytics", label: "Analytics", Icon: BarChart3, gradient: "from-emerald-500 to-teal-500" },
  { key: "wallet", label: "Wallet", Icon: Wallet, gradient: "from-violet-500 to-purple-500" },
  { key: "calendar", label: "Calendar", Icon: Calendar, gradient: "from-rose-500 to-red-500" },
  { key: "mail", label: "Mail", Icon: Mail, gradient: "from-sky-500 to-blue-500" },
  { key: "chat", label: "Chat", Icon: MessageCircle, gradient: "from-green-500 to-emerald-500" },
  { key: "settings", label: "Settings", Icon: Settings, gradient: "from-slate-500 to-gray-600" },
  { key: "shield", label: "Shield", Icon: Shield, gradient: "from-emerald-500 to-green-600" },
  { key: "cloud", label: "Cloud", Icon: Cloud, gradient: "from-sky-400 to-cyan-500" },
  { key: "search", label: "Search", Icon: Search, gradient: "from-indigo-500 to-violet-500" },
  { key: "bell", label: "Bell", Icon: Bell, gradient: "from-amber-400 to-orange-500" },
  { key: "document", label: "Document", Icon: FileText, gradient: "from-gray-400 to-slate-500" },
  { key: "folder", label: "Folder", Icon: Folder, gradient: "from-amber-400 to-yellow-500" },
  { key: "profile", label: "Profile", Icon: User, gradient: "from-pink-500 to-rose-500" },
  { key: "camera", label: "Camera", Icon: Camera, gradient: "from-cyan-500 to-sky-600" },
  { key: "location", label: "Location", Icon: MapPin, gradient: "from-rose-500 to-pink-600" },
  { key: "rocket", label: "Rocket", Icon: Rocket, gradient: "from-orange-500 to-red-500" },
  { key: "star", label: "Star", Icon: Star, gradient: "from-amber-400 to-yellow-500" },
  { key: "music", label: "Music", Icon: Music, gradient: "from-violet-500 to-fuchsia-500" },
  { key: "gift", label: "Gift", Icon: Gift, gradient: "from-red-500 to-rose-500" },
  { key: "phone", label: "Phone", Icon: Smartphone, gradient: "from-green-500 to-teal-500" },
  { key: "lock", label: "Lock", Icon: Lock, gradient: "from-amber-500 to-orange-600" },
  { key: "clock", label: "Clock", Icon: Clock, gradient: "from-blue-500 to-cyan-500" },
  { key: "trophy", label: "Trophy", Icon: Trophy, gradient: "from-yellow-400 to-amber-500" },
  { key: "flame", label: "Flame", Icon: Flame, gradient: "from-orange-500 to-red-600" },
  { key: "card", label: "Card", Icon: CreditCard, gradient: "from-indigo-500 to-blue-600" },
  { key: "image", label: "Image", Icon: ImageIcon, gradient: "from-green-500 to-emerald-600" },
  { key: "video", label: "Video", Icon: Video, gradient: "from-red-500 to-rose-600" },
  { key: "bookmark", label: "Bookmark", Icon: Bookmark, gradient: "from-orange-400 to-amber-500" },
  { key: "key", label: "Key", Icon: Key, gradient: "from-amber-400 to-yellow-600" },
  { key: "globe", label: "Globe", Icon: Globe, gradient: "from-teal-500 to-cyan-600" },
  { key: "briefcase", label: "Briefcase", Icon: Briefcase, gradient: "from-slate-500 to-blue-600" },
];

const ICON_BY_KEY = new Map(PROJECT_ICONS.map((i) => [i.key, i] as const));

export function isProjectIconKey(value: string | null | undefined): boolean {
  return !!value && ICON_BY_KEY.has(value);
}

/** A random professional icon key — used as the default for new spaces. */
export function randomProjectIconKey(): string {
  return PROJECT_ICONS[Math.floor(Math.random() * PROJECT_ICONS.length)]!.key;
}

/**
 * Renders a project/space icon at any size. Resolution order:
 *  1. Known professional icon key → gradient tile + glyph.
 *  2. Any other non-empty string → treated as a legacy emoji.
 *  3. Empty → a colored initial derived from the name.
 */
export function SpaceIcon({
  icon,
  name,
  color,
  size = 24,
  radius = 8,
  className = "",
}: {
  icon?: string | null;
  name?: string | null;
  color?: string | null;
  /** Tile edge length in px. */
  size?: number;
  /** Corner radius in px. */
  radius?: number;
  className?: string;
}) {
  const def = icon ? ICON_BY_KEY.get(icon) : undefined;

  if (def) {
    const Glyph = def.Icon;
    return (
      <span
        className={`inline-flex items-center justify-center bg-gradient-to-br ${def.gradient} text-white shrink-0 ${className}`}
        style={{ width: size, height: size, borderRadius: radius }}
      >
        <Glyph style={{ width: size * 0.56, height: size * 0.56 }} strokeWidth={2.1} />
      </span>
    );
  }

  if (icon) {
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 leading-none ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.7 }}
      >
        {icon}
      </span>
    );
  }

  const letter = (name?.trim()?.[0] ?? "?").toUpperCase();
  return (
    <span
      className={`inline-flex items-center justify-center text-white font-semibold shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: color || "#2563eb",
        fontSize: size * 0.42,
      }}
    >
      {letter}
    </span>
  );
}
