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
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  Plus,
  Plug,
  RefreshCw,
  Check,
} from "lucide-react";
import { db, auth } from "../../firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import ConnectMT5Modal from "./ConnectMT5Modal";
import { syncMT5Account } from "../../lib/mt5client";
import useIsMobile from "../../hooks/useIsMobile";

// ────────────────────────────────────────────────
// Look & feel (Tradezella-style: always dark purple, in light and dark mode)
// ────────────────────────────────────────────────
// Desktop position is unchanged from the old sidebar so the page layout keeps working.
// For a flush, full-height sidebar like Tradezella use: "left-0 top-0 h-[100dvh]"
const DESKTOP_POS = "left-0 top-0 h-[100dvh]";

const SHELL_BG = "linear-gradient(180deg, #0b0518 0%, #160a36 38%, #2a1566 100%)";
const NAV_IDLE = "text-[#a99fd1] hover:bg-white/[0.05] hover:text-white";
const NAV_ACTIVE = "bg-white/[0.08] text-white";
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
  onCreateAccount,
  onShowManage,
}) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  // On phones the sidebar is a slide-out drawer that always shows full labels
  const open = isMobile ? true : openProp;
  const accent = readAccent();

  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountBalance, setNewAccountBalance] = useState("");
  const [newAccountLeverage, setNewAccountLeverage] = useState("100");
  const [createError, setCreateError] = useState("");
  const [connectSuccess, setConnectSuccess] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const popoverRef = useRef(null);
  const hasAutoCreated = useRef(false);

  const handleSyncMT5 = async () => {
    if (!currentAccount?.mt5Login) return;
    setSyncing(true);
    try {
      const r = await syncMT5Account({ login: currentAccount.mt5Login, server: currentAccount.mt5Server });
      alert(`MetaTrader synced: ${r.added} new, ${r.updated} updated.`);
      window.location.reload();
    } catch (err) {
      alert(err.message || "Sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  // ─── Automatically create a default account if none exist ─────────
  useEffect(() => {
    const createDefaultAccount = async () => {
      const user = auth.currentUser;
      if (!user || accounts.length > 0 || hasAutoCreated.current) return;
      hasAutoCreated.current = true;
      try {
        const defaultAccount = {
          name: "Main Account",
          starting_balance: 10000,
          current_balance: 10000,
          leverage: 100,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        };
        const docRef = await addDoc(collection(db, "users", user.uid, "accounts"), defaultAccount);
        const newAccount = { id: docRef.id, ...defaultAccount };
        onCreateAccount(newAccount);
        onSwitchAccount(docRef.id);
      } catch (error) {
        console.error("Error creating default account:", error);
      }
    };
    createDefaultAccount();
  }, [accounts, onCreateAccount, onSwitchAccount]);

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

  // ─── Create new account from modal ────────────────────────────────
  const handleCreateAccount = async () => {
    const user = auth.currentUser;
    if (!user) {
      alert("You must be logged in to create an account.");
      return;
    }

    const name = newAccountName.trim();
    if (!name) {
      setCreateError("Account name is required.");
      return;
    }

    const balance = parseFloat(newAccountBalance);
    if (isNaN(balance) || balance <= 0) {
      setCreateError("Starting balance must be a positive number.");
      return;
    }

    const leverage = parseFloat(newAccountLeverage);
    if (isNaN(leverage) || leverage < 1) {
      setCreateError("Leverage must be a positive number (at least 1).");
      return;
    }

    try {
      const accountData = {
        name,
        starting_balance: balance,
        current_balance: balance,
        leverage,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      };

      const docRef = await addDoc(collection(db, "users", user.uid, "accounts"), accountData);

      const newAccount = { id: docRef.id, ...accountData };
      onCreateAccount(newAccount);
      onSwitchAccount(docRef.id);

      setNewAccountName("");
      setNewAccountBalance("");
      setNewAccountLeverage("100");
      setCreateError("");
      setShowCreateModal(false);
      setIsAccountDropdownOpen(false);
    } catch (error) {
      console.error("Error creating account:", error);
      setCreateError("Failed to create account. Please try again.");
    }
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setNewAccountName("");
    setNewAccountBalance("");
    setNewAccountLeverage("100");
    setCreateError("");
  };

  const goAddTrade = () => {
    navigate("/trades/new");
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
          compact ? "h-10 w-10 justify-center" : "h-9 gap-3 px-3"
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

      <div className="space-y-1.5 border-t border-white/10 p-2.5">
        <button
          onClick={() => {
            setShowCreateModal(true);
            setIsAccountDropdownOpen(false);
          }}
          className={`w-full rounded-lg bg-white/[0.07] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/[0.12] ${FOCUS}`}
        >
          New account
        </button>
        <button
          onClick={() => {
            onShowManage();
            setIsAccountDropdownOpen(false);
          }}
          className={`w-full rounded-lg bg-white/[0.07] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/[0.12] ${FOCUS}`}
        >
          Manage accounts
        </button>
        {/* MetaTrader 5: connect a new MT5 account (becomes its own journal account) */}
        <button
          onClick={() => {
            setShowConnectModal(true);
            setIsAccountDropdownOpen(false);
          }}
          style={{ backgroundColor: accent }}
          className={`flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110 ${FOCUS}`}
        >
          <Plug size={13} />
          Connect MT5 account
        </button>
        {currentAccount?.mt5Connected && (
          <button
            onClick={handleSyncMT5}
            disabled={syncing}
            className={`flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50 ${FOCUS}`}
          >
            <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Sync MT5 trades"}
          </button>
        )}
      </div>
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
          className={`absolute inset-0 overflow-hidden border border-white/10 shadow-2xl shadow-black/40 ${
            ""
          }`}
          style={{ background: SHELL_BG }}
        />

        <div className="relative flex h-full">
          {/* ───────── Icon rail ───────── */}
          <div
            className={`relative flex shrink-0 flex-col items-center gap-1.5 border-r border-white/10 bg-black/20 py-3 ${
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
              {currentAccount?.mt5Connected && (
                <button
                  onClick={handleSyncMT5}
                  disabled={syncing}
                  aria-label="Sync MT5 trades"
                  title="Sync MT5 trades"
                  className={`${railBtn} ${NAV_IDLE} disabled:opacity-50 ${FOCUS}`}
                >
                  <RefreshCw size={17} className={syncing ? "animate-spin" : ""} />
                </button>
              )}
              {open && (
                <button
                  onClick={() => {
                    setShowConnectModal(true);
                    setIsAccountDropdownOpen(false);
                  }}
                  aria-label="Connect MT5 account"
                  title="Connect MT5 account"
                  className={`${railBtn} ${NAV_IDLE} ${FOCUS}`}
                >
                  <Plug size={17} />
                </button>
              )}
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

      {/* CREATE ACCOUNT MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Create new account"
            className="w-full max-w-md rounded-2xl border border-[#262645] bg-[#15152b] shadow-2xl"
          >
            <div className="p-6">
              <h3 className="mb-4 text-lg font-bold text-white">Create new account</h3>
              <div className="space-y-4">
                {[
                  ["Account name", "text", newAccountName, setNewAccountName, "e.g. Live EURUSD, Demo NAS100", {}],
                  ["Starting balance (USD)", "number", newAccountBalance, setNewAccountBalance, "10000", { min: "0.01", step: "0.01" }],
                  ["Leverage (e.g. 100)", "number", newAccountLeverage, setNewAccountLeverage, "100", { min: "1", step: "1" }],
                ].map(([label, type, value, setter, placeholder, extra]) => (
                  <div key={label}>
                    <label className="mb-1 block text-sm text-[#8a8fb5]">{label}</label>
                    <input
                      type={type}
                      value={value}
                      onChange={(e) => setter(e.target.value)}
                      placeholder={placeholder}
                      {...extra}
                      className="w-full rounded-lg border border-[#262645] bg-[#101024] px-4 py-2 text-sm text-gray-100 outline-none focus:ring-2 focus:ring-[#6C47FF]"
                    />
                  </div>
                ))}
                {createError && <div className="text-sm text-[#ff6b86]">{createError}</div>}
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={closeCreateModal}
                  className={`rounded-lg border border-[#262645] px-4 py-2 text-sm font-semibold text-gray-200 transition-colors hover:bg-[#1e1e3a] ${FOCUS}`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateAccount}
                  style={{ backgroundColor: accent }}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 ${FOCUS}`}
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONNECT MT5 MODAL */}
      {showConnectModal && (
        <ConnectMT5Modal
          isOpen={showConnectModal}
          onClose={(success, result) => {
            setShowConnectModal(false);
            if (success && result?.accountId) {
              localStorage.setItem("currentAccountId", result.accountId);
              setConnectSuccess(true);
              setTimeout(() => window.location.reload(), 600);
            }
          }}
        />
      )}

      {/* Success toast */}
      {connectSuccess && (
        <div
          role="status"
          className="fixed bottom-4 right-4 z-[2000] rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg"
        >
          MT5 connected successfully!
        </div>
      )}
    </>
  );
}
