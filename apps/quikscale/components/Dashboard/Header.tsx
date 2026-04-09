"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, LogOut, Settings, ChevronDown, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { data: session, update: updateSession } = useSession();
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const fullName = session?.user?.name || session?.user?.email?.split("@")[0] || "User";
  const email = session?.user?.email || "";
  const roleLine = email.split("@")[0] || "User";

  // Generate initials
  const initials = fullName
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  const handleSwitchOrg = async () => {
    setDropdownOpen(false);
    // Clear tenantId from session, then redirect to org selection
    await updateSession({ tenantId: null, membershipRole: null });
    router.push("/select-org");
  };

  return (
    <header className="relative z-[100] bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      {/* Left — mobile menu + welcome */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="md:hidden p-1.5 rounded-md hover:bg-gray-100 text-gray-600"
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold text-gray-900">
          Welcome, {fullName.split(" ")[0]}!
        </h1>
      </div>

      {/* Right — user info */}
      <div className="relative">
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-2.5 hover:bg-gray-50 rounded-lg px-2 py-1.5 transition-colors"
        >
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-sm font-medium text-gray-900 leading-tight">{fullName}</p>
            <p className="text-xs text-gray-500 leading-tight">{roleLine}</p>
          </div>
          <ChevronDown className={cn("h-3.5 w-3.5 text-gray-400 transition-transform", dropdownOpen && "rotate-180")} />
        </button>

        {/* Dropdown */}
        {dropdownOpen && mounted && (
          <>
            <div className="fixed inset-0 z-[999]" onClick={() => setDropdownOpen(false)} />
            <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-[1000] py-1 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-900">{fullName}</p>
                <p className="text-xs text-gray-500 truncate">{email}</p>
              </div>
              <button
                onClick={handleSwitchOrg}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Building2 className="h-4 w-4 text-gray-400" />
                Switch Organisation
              </button>
              <button className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                <Settings className="h-4 w-4 text-gray-400" />
                Settings
              </button>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
