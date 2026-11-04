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
                 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-t border-gray-200 dark:border-gray-700"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {tabs.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium ${
              isActive
                ? "text-indigo-600 dark:text-indigo-400"
                : "text-gray-500 dark:text-gray-400"
            }`
          }
        >
          <Icon size={22} />
          {label}
        </NavLink>
      ))}
      <button
        onClick={onMenuClick}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium text-gray-500 dark:text-gray-400"
      >
        <Menu size={22} />
        More
      </button>
    </nav>
  );
}
