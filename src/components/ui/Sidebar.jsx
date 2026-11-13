import React, { useState, useEffect, useRef } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  X,
  LayoutDashboard,
  BookOpen,
  Activity,
  FileText,
  BarChart3,
  BookMarked,
  Trophy,
  Users,
  Settings,
  Calculator,
  Monitor,
  Share2,
  Crown,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  Plus,
  Plug,
  Check,
} from "lucide-react";
import useIsMobile from "../../hooks/useIsMobile";

// ────────────────────────────────────────────────
// Look & feel (Tradezella-style: always dark purple, in light and dark mode)
// ────────────────────────────────────────────────
// Desktop position is unchanged from the old sidebar so the page layout keeps working.
// For a flush, full-height sidebar like Tradezella use: "left-0 top-0 h-[100dvh]"
const DESKTOP_POS = "left-0 top-0 h-[100dvh]";

const SHELL_BG = "linear-gradient(180deg, #0b0b12 0%, #08080d 100%)";
const NAV_IDLE = "text-[#8b8ba3] hover:bg-white/[0.06] hover:text-white";
const NAV_ACTIVE = "bg-white/[0.09] text-white";
const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b6cff]";

// Same accent list and storage key the Dashboard and Daily Journal use
const ACCENT_HEX = {
  zella: "#6C47FF",
  indigo: "#6366f1",
  emerald: "#10b981",
  cyan: "#06b6d4",
  amber: "#f59e0b",
  rose: "#f43f5e",
};
const readAccent = () => {
  try {
    const saved = localStorage.getItem("forgexAccent");
    return ACCENT_HEX[saved] || ACCENT_HEX.zella;
  } catch {
    return ACCENT_HEX.zella;
  }
};

const MAIN_NAV = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/journal", icon: BookOpen, label: "Daily Journal" },
  { to: "/trades", icon: Activity, label: "Trades" },
  { to: "/playbooks", icon: BookMarked, label: "Playbooks" },
  { to: "/notebook", icon: FileText, label: "Notebook" },
  { to: "/reports", icon: BarChart3, label: "Reports" },
];

const MORE_NAV = [
  { to: "/challenges", icon: Trophy, label: "Challenges" },
  { to: "/mentor", icon: Users, label: "Mentor Mode" },
  { to: "/backtest", icon: Calculator, label: "Backtest" },
  { to: "/replay", icon: Monitor, label: "Replay" },
  { to: "/spaces", icon: Share2, label: "Spaces" },
  { to: "/pricing", icon: Crown, label: "Pricing" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

// Logo mark: a bold "F" cut from two bars
const LogoMark = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <defs>
      <linearGradient id="forgex-mark" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#b9a2ff" />
        <stop offset="1" stopColor="#6C47FF" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="9" fill="url(#forgex-mark)" opacity="0.18" />
    <path d="M10 8h13v4.2h-8.4v3.4H21v4.1h-6.4V25H10z" fill="url(#forgex-mark)" />
  </svg>
);

export default function Sidebar({
  open: openProp,
  setOpen,
  accounts = [],
  currentAccount,
  onSwitchAccount,
}) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  // On phones the sidebar is a slide-out drawer that always shows full labels
  const open = isMobile ? true : openProp;
  const accent = readAccent();

  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);
  const popoverRef = useRef(null);

  // Close the account menu on outside click / Escape
  useEffect(() => {
    if (!isAccountDropdownOpen) return undefined;
    const onDown = (e) => {
      if (e.target.closest?.("[data-account-toggle]")) return; // the toggle buttons handle themselves
      if (popoverRef.current && !popoverRef.current.contains(e.target)) setIsAccountDropdownOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setIsAccountDropdownOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isAccountDropdownOpen]);

  const toggleSidebar = () => {
    setOpen((prev) => !prev);
    setIsAccountDropdownOpen(false);
  };

  const goAddTrade = () => {
    navigate("/add-trade");
    if (isMobile) setOpen(false);
  };

  // ─── Pieces ───────────────────────────────────────────────────────
  const navLink = (item, compact = false) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      title={compact ? item.label : undefined}
      aria-label={compact ? item.label : undefined}
      onClick={() => isMobile && setOpen(false)}
      className={({ isActive }) =>
        `flex items-center rounded-lg text-[13px] font-medium transition-colors ${FOCUS} ${
          compact ? "h-10 w-10 justify-center" : "h-9 gap-2.5 px-2.5"
        } ${isActive ? NAV_ACTIVE : NAV_IDLE}`
      }
    >
      <item.icon size={compact ? 18 : 16} className="shrink-0" />
      {!compact && <span className="truncate">{item.label}</span>}
    </NavLink>
  );

  const railBtn = "flex h-10 w-10 items-center justify-center rounded-lg transition-colors";

  const accountAvatar = (
    <span
      className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ backgroundColor: accent }}
    >
      {currentAccount?.name?.charAt(0)?.toUpperCase() || "A"}
    </span>
  );

  // Account menu (opens beside the rail on desktop, inside the drawer on phones)
  const accountPopover = isAccountDropdownOpen && (
    <div
      ref={popoverRef}
      role="menu"
      aria-label="Accounts"
      className={`absolute bottom-0 z-[1100] w-64 overflow-hidden rounded-xl border border-white/10 bg-[#140a30] shadow-2xl shadow-black/50 ${
        isMobile ? "left-12" : "left-[calc(100%+0.5rem)]"
      }`}
    >
      <div className="border-b border-white/10 px-4 py-3">
        <div className="text-[11px] font-medium text-[#a99fd1]">Active account</div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-white">{currentAccount?.name || "Account"}</span>
          {currentAccount?.starting_balance && (
            <span className="text-xs tabular-nums text-[#a99fd1]">
              ${Number(currentAccount.starting_balance).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      <div className="max-h-48 overflow-y-auto p-1.5">
        {accounts.length === 0 ? (
          <div className="p-3 text-center text-xs text-[#a99fd1]">No accounts yet</div>
        ) : (
          accounts.map((account) => {
            const active = currentAccount?.id === account.id;
            return (
              <button
                key={account.id}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onSwitchAccount(account.id);
                  setIsAccountDropdownOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${FOCUS} ${
                  active ? NAV_ACTIVE : NAV_IDLE
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {active ? <Check size={14} className="shrink-0" style={{ color: accent }} /> : <span className="w-3.5" />}
                  <span className="truncate">{account.name}</span>
                  {account.mt5Connected && <Plug size={12} className="shrink-0 text-emerald-400" aria-label="MT5 connected" />}
                </span>
                {account.starting_balance && (
                  <span className="text-[11px] tabular-nums text-[#8579b8]">
                    ${Number(account.starting_balance).toLocaleString()}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      <div className="space-y-1.5 border-t border-white/10 p-2.5" />
    </div>
  );

  // ─── Layout ───────────────────────────────────────────────────────
  return (
    <>
      {/* Phone only: dark backdrop – tap to close the drawer */}
      {isMobile && openProp && (
        <div className="fixed inset-0 z-[999] bg-black/60" onClick={() => setOpen(false)} />
      )}

      <aside
        aria-label="Main navigation"
        className={`fixed transition-all duration-300 ${
          isMobile
            ? `left-0 top-0 h-[100dvh] w-64 z-[1001] ${openProp ? "translate-x-0" : "-translate-x-full"}`
            : `${DESKTOP_POS} z-[1000] ${open ? "w-48" : "w-16"}`
        }`}
        style={{ minWidth: isMobile ? undefined : open ? "12rem" : "4rem" }}
      >
        {/* Background lives on its own layer so the account menu can overflow the sidebar */}
        <div
          className={`absolute inset-0 overflow-hidden border border-[#1e1e28] shadow-2xl shadow-black/40 ${
            ""
          }`}
          style={{ background: SHELL_BG }}
        />

        <div className="relative flex h-full">
          {/* ───────── Icon rail ───────── */}
          <div
            className={`relative flex shrink-0 flex-col items-center gap-1.5 border-r border-[#1e1e28] bg-black/20 py-3 ${
              open ? "w-11" : "w-full"
            } ${isMobile ? "" : "rounded-l-2xl"} ${!open && !isMobile ? "rounded-r-2xl" : ""}`}
          >
            <button
              onClick={() => navigate("/")}
              aria-label="Forgex home"
              className={`mb-1 flex h-9 w-9 items-center justify-center rounded-lg ${FOCUS}`}
            >
              <LogoMark />
            </button>

            {!open && (
              <>
                <button
                  onClick={toggleSidebar}
                  aria-label="Expand sidebar"
                  title="Expand sidebar"
                  className={`${railBtn} ${NAV_IDLE} ${FOCUS}`}
                >
                  <ChevronsRight size={18} />
                </button>
                <button
                  onClick={goAddTrade}
                  aria-label="Add trade"
                  title="Add trade"
                  style={{ backgroundColor: accent }}
                  className={`${railBtn} text-white hover:brightness-110 ${FOCUS}`}
                >
                  <Plus size={18} />
                </button>
                <nav className="mt-2 flex flex-col items-center gap-1" aria-label="Pages">
                  {[...MAIN_NAV, ...MORE_NAV].map((item) => navLink(item, true))}
                </nav>
              </>
            )}

            {/* Rail tools */}
            <div className="mt-auto flex flex-col items-center gap-1.5">
              <div className="relative">
                <button
                  onClick={() => setIsAccountDropdownOpen((v) => !v)}
                  data-account-toggle
                  aria-haspopup="menu"
                  aria-expanded={isAccountDropdownOpen}
                  aria-label="Switch account"
                  title={currentAccount?.name || "Accounts"}
                  className={`${railBtn} ${isAccountDropdownOpen ? NAV_ACTIVE : NAV_IDLE} ${FOCUS}`}
                >
                  {accountAvatar}
                </button>
                {accountPopover}
              </div>
            </div>
          </div>

          {/* ───────── Menu panel ───────── */}
          {open && (
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center justify-between px-3 pb-2 pt-4">
                <span
                  className="select-none font-serif text-[15px] uppercase text-[#cfc6f0]"
                  style={{ letterSpacing: "0.22em" }}
                >
                  Forgex
                </span>
                <button
                  onClick={toggleSidebar}
                  aria-label={isMobile ? "Close menu" : "Collapse sidebar"}
                  className={`rounded-md p-1 text-[#a99fd1] transition-colors hover:bg-white/[0.08] hover:text-white ${FOCUS}`}
                >
                  {isMobile ? <X size={18} /> : <ChevronsLeft size={18} />}
                </button>
              </div>

              <div className="px-2.5 pb-3">
                <button
                  onClick={goAddTrade}
                  className={`flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-white/10 text-[13px] font-semibold text-white transition hover:brightness-125 ${FOCUS}`}
                  style={{ backgroundColor: accent + "99" }}
                >
                  <Plus size={15} />
                  Add Trade
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto px-2.5 pb-4" aria-label="Pages">
                <div className="flex flex-col gap-0.5">{MAIN_NAV.map((item) => navLink(item))}</div>
                <div className="my-3 border-t border-white/10" />
                <div className="flex flex-col gap-0.5">{MORE_NAV.map((item) => navLink(item))}</div>
              </nav>

              {/* Account summary */}
              <button
                onClick={() => setIsAccountDropdownOpen((v) => !v)}
                className={`mx-2.5 mb-3 flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.08] ${FOCUS}`}
                aria-label="Switch account"
                data-account-toggle
              >
                {accountAvatar}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-white">
                    {currentAccount?.name || "Account"}
                  </span>
                  {currentAccount?.starting_balance && (
                    <span className="block text-[10px] tabular-nums text-[#a99fd1]">
                      ${Number(currentAccount.starting_balance).toLocaleString()}
                    </span>
                  )}
                </span>
                <ChevronDown size={14} className="shrink-0 text-[#a99fd1]" />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
