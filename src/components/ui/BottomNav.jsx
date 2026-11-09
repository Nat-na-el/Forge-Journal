import React from "react";
import { NavLink } from "react-router-dom";
import { Home, BookOpen, Activity, FileText, Menu } from "lucide-react";

// Phone-only bottom tab bar (hidden from the `md` breakpoint up)
const tabs = [
  { to: "/dashboard", icon: Home, label: "Home" },
  { to: "/journal", icon: BookOpen, label: "Journal" },
  { to: "/trades", icon: Activity, label: "Trades" },
  { to: "/notebook", icon: FileText, label: "Notes" },
];

export default function BottomNav({ onMenuClick }) {
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-[900] flex items-stretch justify-around
                 border-t border-[#e6e8f2] bg-white/95 backdrop-blur dark:border-[#262645] dark:bg-[#0b0b19]/95"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {tabs.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold transition-colors ${
              isActive
                ? "text-[#6C47FF] dark:text-[#9b7bff]"
                : "text-[#6b7090] dark:text-[#8a8fb5]"
            }`
          }
        >
          <Icon size={22} />
          {label}
        </NavLink>
      ))}
      <button
        onClick={onMenuClick}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold text-[#6b7090] dark:text-[#8a8fb5]"
      >
        <Menu size={22} />
        More
      </button>
    </nav>
  );
}
