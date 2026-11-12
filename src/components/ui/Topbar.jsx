import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Sun,
  Moon,
  Settings,
  LogOut,
  Menu,
  Plus,
  ChevronDown,
  Plug,
} from "lucide-react";
import { useTheme } from "../../Theme-provider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./dialog";
import { auth } from "../../firebase";
import useIsMobile from "../../hooks/useIsMobile";

// ────────────────────────────────────────────────
// Look & feel (Tradezella-style: slim, flat, sits beside the sidebar)
// Same palette as Dashboard / Daily Journal / Sidebar
// ────────────────────────────────────────────────
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
    return ACCENT_HEX[localStorage.getItem("forgexAccent")] || ACCENT_HEX.zella;
  } catch {
    return ACCENT_HEX.zella;
  }
};

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6C47FF]";
const ICON_BTN = `flex h-9 w-9 items-center justify-center rounded-lg text-[#6b7090] transition-colors hover:bg-[#f1f2f8] hover:text-[#14142b] dark:text-[#8a8fb5] dark:hover:bg-[#1e1e3a] dark:hover:text-white ${FOCUS}`;

const PAGE_TITLES = {
  "/": "Dashboard",
  "/dashboard": "Dashboard",
  "/journal": "Daily Journal",
  "/trades": "Trades",
  "/trades/new": "Add Trade",
  "/notebook": "Notebook",
  "/reports": "Reports",
  "/challenges": "Challenges",
  "/mentor": "Mentor Mode",
  "/backtest": "Backtest",
  "/settings": "Settings",
  "/quantitative-analysis": "Quantitative Analysis",
  "/edit-balance-pnl": "Account",
};

const money = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

export default function Topbar({
  onMenuClick,
  sidebarOpen = true,
  currentAccount,
}) {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const accent = readAccent();

  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // close the profile menu on outside click / Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const title = PAGE_TITLES[location.pathname] || "Dashboard";
  // The dashboard renders its own heading row, so the top bar keeps only the
  // account / actions cluster there instead of a duplicate title.
  const hideTitle = location.pathname === "/dashboard";
  const accountName = currentAccount?.name || "No account";
  const user = auth.currentUser;
  const initial = (user?.displayName || user?.email || accountName || "F")
    .charAt(0)
    .toUpperCase();

  const handleLogoutConfirm = async () => {
    setShowLogoutDialog(false);
    try {
      // triggers onAuthStateChanged in App.js → redirects to Landing / Login
      await auth.signOut();
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  // Sits right of the sidebar on desktop (12rem open / 4rem collapsed), full width on phones
  const left = isMobile ? 0 : sidebarOpen ? "12rem" : "4rem";

  return (
    <>
      <header
        className={`fixed right-0 top-0 z-50 flex h-14 items-center justify-between gap-3 border-b px-3 backdrop-blur-md transition-[left] duration-300 sm:px-6 ${
          hideTitle
            ? "border-[#1e1e28] bg-[#08080d]/90"
            : "border-[#e6e8f2] bg-white/90 dark:border-[#262645] dark:bg-[#0b0b19]/90"
        }`}
        style={{ left }}
      >
        {/* Left – menu button (phones) + page title */}
        <div className="flex min-w-0 items-center gap-2.5">
          {isMobile && (
            <button
              onClick={onMenuClick}
              className={ICON_BTN}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
          )}
          <h1
            className={`truncate text-[15px] font-semibold tracking-tight text-[#14142b] dark:text-white sm:text-base ${
              hideTitle ? "hidden" : ""
            }`}
          >
            {title}
          </h1>
        </div>

        {/* Right – account, add trade, theme, settings, profile */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Active account pill */}
          <div className="hidden items-center gap-2 rounded-lg border border-[#e6e8f2] bg-[#f7f8fc] px-3 py-1.5 dark:border-[#262645] dark:bg-[#101024] md:flex">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                currentAccount?.mt5Connected ? "bg-[#22c493]" : "bg-[#8a8fb5]"
              }`}
            />
            <span className="max-w-[140px] truncate text-[13px] font-semibold text-[#14142b] dark:text-white">
              {accountName}
            </span>
            {currentAccount?.mt5Connected && (
              <Plug size={12} className="text-[#22c493]" aria-label="MT5 connected" />
            )}
            {currentAccount && (
              <span className="border-l border-[#e6e8f2] pl-2 text-xs font-medium tabular-nums text-[#6b7090] dark:border-[#262645] dark:text-[#8a8fb5]">
                {money(currentAccount.current_balance ?? currentAccount.starting_balance)}
              </span>
            )}
          </div>

          {/* Primary action */}
          <button
            onClick={() => navigate("/trades/new")}
            className={`flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-white transition hover:brightness-110 active:scale-[0.98] ${FOCUS}`}
            style={{ backgroundColor: accent }}
            aria-label="Add trade"
          >
            <Plus size={16} strokeWidth={2.5} />
            <span className="hidden sm:inline">Add Trade</span>
          </button>

          {/* Theme toggle */}
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className={ICON_BTN}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Settings */}
          <button
            onClick={() => navigate("/settings")}
            className={`${ICON_BTN} hidden sm:flex`}
            aria-label="Settings"
          >
            <Settings size={18} />
          </button>

          {/* Profile menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className={`flex h-9 items-center gap-1 rounded-lg pl-1 pr-1.5 transition-colors hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${FOCUS}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Account menu"
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: accent }}
              >
                {initial}
              </span>
              <ChevronDown
                size={14}
                className="hidden text-[#6b7090] dark:text-[#8a8fb5] sm:block"
              />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-11 w-60 overflow-hidden rounded-xl border border-[#e6e8f2] bg-white shadow-xl dark:border-[#262645] dark:bg-[#15152b] dark:shadow-black/50"
              >
                <div className="border-b border-[#e6e8f2] px-4 py-3 dark:border-[#262645]">
                  <div className="truncate text-sm font-semibold text-[#14142b] dark:text-white">
                    {user?.displayName || accountName}
                  </div>
                  {user?.email && (
                    <div className="truncate text-xs text-[#6b7090] dark:text-[#8a8fb5]">
                      {user.email}
                    </div>
                  )}
                </div>
                <div className="p-1.5">
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      navigate("/settings");
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-[#3b3f5e] transition-colors hover:bg-[#f1f2f8] dark:text-[#c9ccea] dark:hover:bg-[#1e1e3a] ${FOCUS}`}
                  >
                    <Settings size={15} /> Settings
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setShowLogoutDialog(true);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-[#d93a57] transition-colors hover:bg-[#f2556e]/10 dark:text-[#ff6b86] ${FOCUS}`}
                  >
                    <LogOut size={15} /> Log out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Logout confirmation */}
      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent className="max-w-sm rounded-2xl border border-[#e6e8f2] bg-white p-6 text-[#14142b] shadow-2xl dark:border-[#262645] dark:bg-[#15152b] dark:text-white">
          <DialogHeader>
            <DialogTitle>Log out of Forgex?</DialogTitle>
            <DialogDescription className="text-[#6b7090] dark:text-[#8a8fb5]">
              You will need to sign in again to see your journal.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-2 sm:space-x-0">
            <button
              onClick={() => setShowLogoutDialog(false)}
              className={`h-9 rounded-lg border border-[#e6e8f2] px-4 text-sm font-semibold text-[#3b3f5e] transition-colors hover:bg-[#f1f2f8] dark:border-[#262645] dark:text-[#c9ccea] dark:hover:bg-[#1e1e3a] ${FOCUS}`}
            >
              Cancel
            </button>
            <button
              onClick={handleLogoutConfirm}
              className={`h-9 rounded-lg bg-[#f2556e] px-4 text-sm font-semibold text-white transition hover:brightness-110 ${FOCUS}`}
            >
              Log out
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
