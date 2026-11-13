// src/pages/AccountSelectionPage.jsx
// Entry point of the Add Trade workflow: every trading account connected to
// this journal, with broker, sync state, balance and quick actions. Accounts
// are chosen here before a trade is logged; new ones come from /add-trade/add-account.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { auth, db } from "../firebase";
import { syncMT5Account } from "../lib/mt5client";
import { findBroker } from "../lib/brokers";
import demoAccounts from "../lib/demoAccounts";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  ChevronDown,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Wallet,
} from "lucide-react";
import {
  AT_ACCENT,
  AT_DIVIDER,
  AT_FAINT,
  AT_FOCUS,
  AT_GHOST,
  AT_ICON_BTN,
  AT_MUTED,
  AT_NEG,
  AT_PAGE,
  AT_PANEL,
  AT_PANEL_HEAD,
  AT_POS,
  AT_PRIMARY,
  AT_ROW,
  AT_TD,
  AT_TH,
  AT_TILE,
  AT_WRAP,
} from "../lib/addTradeTheme";

const asDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const pad = (n) => String(n).padStart(2, "0");

const fmtStamp = (value) => {
  const date = asDate(value);
  if (!date) return "—";
  let hours = date.getHours();
  const meridiem = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()} ${pad(hours)}:${pad(
    date.getMinutes()
  )}${meridiem}`;
};

const money = (value) =>
  Number(value || 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const createdMs = (account) => asDate(account.createdAt)?.getTime() || 0;

const brokerOf = (account) => {
  const fromMeta = account.mt5AccountInfo?.broker;
  if (fromMeta) return findBroker(fromMeta) || { name: fromMeta, mark: fromMeta.slice(0, 2).toUpperCase(), bg: "#1f1f2b", fg: "#ffffff" };
  if (account.broker) return findBroker(account.broker) || { name: account.broker, mark: account.broker.slice(0, 2).toUpperCase(), bg: "#1f1f2b", fg: "#ffffff" };
  if (account.mt5Connected || account.mt5Server) {
    const guess = String(account.mt5Server || "MetaTrader").split("-")[0];
    return findBroker(guess) || { name: guess, mark: "MT", bg: "#1F6FEB", fg: "#ffffff" };
  }
  return { name: "Custom", mark: "C", bg: "#1f1f2b", fg: "#ffffff" };
};

const StatusPill = ({ account }) => {
  if (account.mt5Status === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-medium" style={{ color: AT_NEG }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: AT_NEG }} />
        Error
      </span>
    );
  }
  if (account.mt5Connected) {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-medium" style={{ color: AT_POS }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: AT_POS }} />
        Synced
      </span>
    );
  }
  return <span className={`text-[12px] font-medium ${AT_MUTED}`}>Manual</span>;
};

export default function AccountSelectionPage({ onDeleteAccount, onResetAccount, onRenameAccount }) {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [syncingAll, setSyncingAll] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [menuPos, setMenuPos] = useState(null);
  const [notice, setNotice] = useState(null);
  const noticeTimer = useRef(null);

  const activeAccountId = (() => {
    try {
      return localStorage.getItem("currentAccountId");
    } catch {
      return null;
    }
  })();

  const flash = useCallback((type, text) => {
    setNotice({ type, text });
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 5000);
  }, []);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  const load = useCallback(async () => {
    const user = auth.currentUser;
    const isPreview = new URLSearchParams(window.location.search).get("preview") === "1";
    if (!user) {
      if (isPreview) setAccounts(demoAccounts());
      setLoading(false);
      return;
    }
    try {
      const snap = await getDocs(
        query(collection(db, "users", user.uid, "accounts"), orderBy("createdAt", "desc"))
      );
      const loaded = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => createdMs(b) - createdMs(a));
      setAccounts(loaded);
      setError("");
    } catch (err) {
      console.error("Load accounts error:", err);
      setError("We couldn't load your accounts. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!menuPos) return;
    const close = () => setMenuPos(null);
    document.addEventListener("click", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("click", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menuPos]);

  const activate = (account) => {
    try {
      localStorage.setItem("currentAccountId", account.id);
    } catch {
      /* storage can be blocked; the trade form still receives the id */
    }
    window.dispatchEvent(new Event("forgex:accounts-changed"));
  };

  const openTradeForm = (account) => {
    activate(account);
    navigate(`/trades/new?accountId=${account.id}`);
  };

  const syncOne = async (account) => {
    if (!account.mt5Login) {
      flash("error", "This account isn't linked to MetaTrader yet, so there is nothing to sync.");
      return;
    }
    setBusyId(account.id);
    try {
      const result = await syncMT5Account({ login: account.mt5Login, server: account.mt5Server });
      await load();
      flash("success", `Synced ${account.name}: ${result.added} new, ${result.updated} updated.`);
    } catch (err) {
      flash("error", err.message || "Sync failed. Try again in a moment.");
    } finally {
      setBusyId(null);
    }
  };

  const syncSelected = async () => {
    const targets = accounts.filter((a) => selectedIds.includes(a.id) && a.mt5Connected && a.mt5Login);
    if (targets.length === 0) {
      flash("error", "Select at least one linked MetaTrader account to sync.");
      return;
    }
    setSyncingAll(true);
    let added = 0;
    let failed = 0;
    for (const account of targets) {
      try {
        const result = await syncMT5Account({ login: account.mt5Login, server: account.mt5Server });
        added += result.added;
      } catch {
        failed += 1;
      }
    }
    await load();
    setSyncingAll(false);
    if (failed) flash("error", `${targets.length - failed} synced, ${failed} failed. Try the failed ones again.`);
    else flash("success", `Synced ${targets.length} account${targets.length === 1 ? "" : "s"}, ${added} new trade${added === 1 ? "" : "s"}.`);
  };

  const handleRename = async (account) => {
    setMenuPos(null);
    if (!onRenameAccount) return;
    const next = window.prompt("Rename this account", account.name);
    if (!next || !next.trim() || next.trim() === account.name) return;
    try {
      await onRenameAccount(account.id, next.trim());
      await load();
      flash("success", "Account renamed.");
    } catch {
      flash("error", "Couldn't rename the account. Try again.");
    }
  };

  const handleReset = async (account) => {
    setMenuPos(null);
    if (!onResetAccount) return;
    const done = await onResetAccount(account.id);
    if (done === false) return;
    await load();
    flash("success", `${account.name} was reset to its starting balance.`);
  };

  const handleDelete = async (account) => {
    setMenuPos(null);
    if (!onDeleteAccount) return;
    const done = await onDeleteAccount(account.id);
    if (done === false) return;
    setSelectedIds((prev) => prev.filter((id) => id !== account.id));
    await load();
    flash("success", `${account.name} was deleted.`);
  };

  const toggleAll = (checked) => setSelectedIds(checked ? accounts.map((a) => a.id) : []);

  const allSelected = accounts.length > 0 && selectedIds.length === accounts.length;

  const nextUpdate = (account) => {
    if (!account.mt5Connected) return "—";
    const last = asDate(account.mt5LastSync);
    if (!last) return "—";
    return fmtStamp(new Date(last.getTime() + 60 * 60 * 1000));
  };

  const summary = useMemo(() => {
    const linked = accounts.filter((a) => a.mt5Connected).length;
    const manual = accounts.length - linked;
    return { linked, manual };
  }, [accounts]);

  return (
    <div className={AT_PAGE}>
      <div className={AT_WRAP}>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-white">My trading accounts</h1>
            <p className={`mt-1 text-[13px] ${AT_MUTED}`}>
              {loading
                ? "Loading your accounts…"
                : `${accounts.length} account${accounts.length === 1 ? "" : "s"} · ${summary.linked} auto-syncing · ${summary.manual} manual`}
            </p>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-lg border border-[#f2556e]/35 bg-[#f2556e]/10 px-3 py-2.5 text-[13px]"
            style={{ color: AT_NEG }}
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={load} className={`${AT_FOCUS} rounded px-2 py-0.5 text-xs font-semibold`}>
              Retry
            </button>
          </div>
        )}

        <div className={AT_PANEL}>
          <div className={AT_PANEL_HEAD}>
            <h2 className="text-[15px] font-semibold text-white">Active accounts</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={syncSelected}
                disabled={syncingAll || selectedIds.length === 0}
                className={`${AT_GHOST} ${AT_FOCUS}`}
              >
                <RefreshCw size={14} className={syncingAll ? "animate-spin" : ""} />
                {syncingAll ? "Syncing…" : "Sync selected"}
              </button>
              <button
                type="button"
                onClick={() => navigate("/add-trade/add-account")}
                className={`${AT_PRIMARY} h-9 text-[13px]`}
              >
                <Plus size={15} />
                Add new account
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse">
              <thead>
                <tr className={`border-y ${AT_DIVIDER} bg-[#111119]`}>
                  <th scope="col" className="w-9 px-2.5 py-2.5">
                    <input
                      type="checkbox"
                      aria-label="Select all accounts"
                      checked={allSelected}
                      onChange={(e) => toggleAll(e.target.checked)}
                      className="h-3.5 w-3.5 cursor-pointer rounded border-[#33334a] bg-transparent accent-[#6C47FF]"
                    />
                  </th>
                  <th scope="col" className={AT_TH}>Account name</th>
                  <th scope="col" className={AT_TH}>Broker</th>
                  <th scope="col" className={AT_TH}>Type</th>
                  <th scope="col" className={AT_TH}>Status</th>
                  <th scope="col" className={`${AT_TH} text-right`}>Balance</th>
                  <th scope="col" className={`${AT_TH} w-[150px]`}>Profit calculation method</th>
                  <th scope="col" className={AT_TH}>Last update</th>
                  <th scope="col" className={AT_TH}>Next update</th>
                  <th scope="col" className={`${AT_TH} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading &&
                  Array.from({ length: 5 }).map((_, index) => (
                    <tr key={`skeleton-${index}`} className={AT_ROW}>
                      {Array.from({ length: 10 }).map((__, cell) => (
                        <td key={cell} className="px-3 py-3">
                          <div className="h-3 animate-pulse rounded bg-[#1a1a26]" style={{ width: cell === 1 ? "70%" : "55%" }} />
                        </td>
                      ))}
                    </tr>
                  ))}

                {!loading && accounts.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-14">
                      <div className="flex flex-col items-center text-center">
                        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#6C47FF]/15" style={{ color: AT_ACCENT }}>
                          <Wallet size={20} />
                        </span>
                        <p className="text-[15px] font-semibold text-white">No trading accounts yet</p>
                        <p className={`mt-1 max-w-[380px] text-[13px] ${AT_MUTED}`}>
                          Link MetaTrader to import trades automatically, or create an account to start logging by hand.
                        </p>
                        <button
                          type="button"
                          onClick={() => navigate("/add-trade/add-account")}
                          className={`${AT_PRIMARY} mt-4`}
                        >
                          <Plus size={15} />
                          Add your first account
                        </button>
                      </div>
                    </td>
                  </tr>
                )}

                {!loading &&
                  accounts.map((account) => {
                    const broker = brokerOf(account);
                    const balance = account.current_balance ?? account.starting_balance ?? 0;
                    const isActive = account.id === activeAccountId;
                    const busy = busyId === account.id;
                    return (
                      <tr key={account.id} className={AT_ROW}>
                        <td className="px-2.5 py-2.5">
                          <input
                            type="checkbox"
                            aria-label={`Select ${account.name}`}
                            checked={selectedIds.includes(account.id)}
                            onChange={(e) =>
                              setSelectedIds((prev) =>
                                e.target.checked ? [...prev, account.id] : prev.filter((id) => id !== account.id)
                              )
                            }
                            className="h-3.5 w-3.5 cursor-pointer rounded border-[#33334a] bg-transparent accent-[#6C47FF]"
                          />
                        </td>
                        <td className="px-2.5 py-2.5">
                          <button
                            type="button"
                            onClick={() => openTradeForm(account)}
                            className={`group flex max-w-[190px] items-center gap-2 text-left ${AT_FOCUS}`}
                            title={`Log a trade on ${account.name}`}
                          >
                            <span
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                              style={{ backgroundColor: AT_ACCENT }}
                            >
                              {account.name?.charAt(0)?.toUpperCase() || "A"}
                            </span>
                            <span className="truncate text-[13px] font-medium text-[#e8e9f7] group-hover:text-white">
                              {account.name}
                            </span>
                            {isActive && (
                              <span className="shrink-0 rounded bg-[#6C47FF]/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide" style={{ color: "#b9a6ff" }}>
                                Active
                              </span>
                            )}
                          </button>
                        </td>
                        <td className={AT_TD}>
                          <span className="flex items-center gap-2">
                            <span
                              className={`${AT_TILE} !h-5 !w-5 !rounded-md !text-[8px]`}
                              style={{ backgroundColor: broker.bg, color: broker.fg }}
                              aria-hidden="true"
                            >
                              {broker.mark}
                            </span>
                            <span className="max-w-[125px] truncate">{broker.name}</span>
                          </span>
                        </td>
                        <td className={AT_TD}>{account.mt5Connected ? "Auto sync" : "Manual"}</td>
                        <td className="px-2.5 py-2.5">
                          {account.mt5Connected ? (
                            <span className="flex items-center gap-2">
                              <StatusPill account={account} />
                              <button
                                type="button"
                                onClick={() => syncOne(account)}
                                disabled={busy}
                                aria-label={`Sync ${account.name} now`}
                                title="Sync now"
                                className={`${AT_ICON_BTN} h-5 w-5 ${AT_FOCUS}`}
                              >
                                <RefreshCw size={11} className={busy ? "animate-spin" : ""} style={{ color: AT_ACCENT }} />
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openTradeForm(account)}
                              className={`rounded text-[12px] font-medium hover:underline ${AT_FOCUS}`}
                              style={{ color: "#a48bff" }}
                            >
                              Add trades
                            </button>
                          )}
                        </td>
                        <td
                          className={`${AT_TD} text-right tabular-nums`}
                          style={{ color: Number(balance) < 0 ? AT_NEG : "#e8e9f7" }}
                        >
                          {money(balance)}
                        </td>
                        <td className={AT_TD}>{account.profitCalculation || "FIFO"}</td>
                        <td className={`${AT_TD} text-[#8a8fb5]`}>{fmtStamp(account.mt5LastSync || account.updatedAt || account.createdAt)}</td>
                        <td className={`${AT_TD} text-[#8a8fb5]`}>{nextUpdate(account)}</td>
                        <td className="px-2.5 py-2.5">
                          <div className="flex items-center justify-end gap-0.5">
                            {account.mt5Connected ? (
                              <button
                                type="button"
                                onClick={() => syncOne(account)}
                                disabled={busy}
                                aria-label={`Sync ${account.name}`}
                                className={`${AT_ICON_BTN} ${AT_FOCUS}`}
                              >
                                <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openTradeForm(account)}
                                aria-label={`Log a trade on ${account.name}`}
                                className={`${AT_ICON_BTN} ${AT_FOCUS}`}
                              >
                                <ArrowUpRight size={15} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                const menuHeight = 224;
                                const top =
                                  rect.bottom + 4 + menuHeight > window.innerHeight
                                    ? Math.max(8, rect.top - menuHeight - 4)
                                    : rect.bottom + 4;
                                setMenuPos((current) =>
                                  current?.id === account.id ? null : { id: account.id, top, left: rect.right }
                                );
                              }}
                              aria-label={`More actions for ${account.name}`}
                              aria-haspopup="menu"
                              aria-expanded={menuPos?.id === account.id}
                              className={`${AT_ICON_BTN} ${AT_FOCUS}`}
                            >
                              <MoreVertical size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <p className={`text-[11px] ${AT_FAINT}`}>
              Auto-sync accounts refresh from MetaTrader every hour. Manual accounts import through CSV or the trade form.
            </p>
            <button
              type="button"
              onClick={() => navigate("/add-trade/add-account")}
              className={`flex items-center gap-1.5 text-[12px] font-medium ${AT_MUTED} hover:text-white ${AT_FOCUS} rounded`}
            >
              Add another account <ChevronDown size={12} className="-rotate-90" />
            </button>
          </div>
        </div>
      </div>

      {menuPos &&
        (() => {
          const account = accounts.find((a) => a.id === menuPos.id);
          if (!account) return null;
          const isActive = account.id === activeAccountId;
          const item =
            "flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-[#d4d6e6] hover:bg-[#1e1e2b] " + AT_FOCUS;
          return (
            <div
              role="menu"
              onClick={(e) => e.stopPropagation()}
              className="fixed z-50 w-52 overflow-hidden rounded-lg border border-[#262633] bg-[#15151f] py-1 shadow-xl shadow-black/50"
              style={{ top: menuPos.top, left: Math.max(8, menuPos.left - 208) }}
            >
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setMenuPos(null);
                  openTradeForm(account);
                }}
                className={item}
              >
                <ArrowUpRight size={13} /> Log a trade
              </button>
              {account.mt5Connected && (
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setMenuPos(null);
                    syncOne(account);
                  }}
                  className={item}
                >
                  <RefreshCw size={13} /> Sync now
                </button>
              )}
              {!isActive && (
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setMenuPos(null);
                    activate(account);
                    flash("success", `${account.name} is now your active account.`);
                  }}
                  className={item}
                >
                  <Check size={13} /> Set as active
                </button>
              )}
              {(onRenameAccount || onResetAccount || onDeleteAccount) && (
                <div className="my-1 border-t border-[#262633]" />
              )}
              {onRenameAccount && (
                <button role="menuitem" type="button" onClick={() => handleRename(account)} className={item}>
                  <Pencil size={13} /> Rename account
                </button>
              )}
              {onResetAccount && (
                <button role="menuitem" type="button" onClick={() => handleReset(account)} className={item}>
                  <RotateCcw size={13} /> Reset trades
                </button>
              )}
              {onDeleteAccount && (
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => handleDelete(account)}
                  className={`${item} !text-[#ff6b86] hover:!bg-[#f2556e]/10`}
                >
                  <Trash2 size={13} /> Delete account
                </button>
              )}
            </div>
          );
        })()}

      {notice && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 flex max-w-[360px] items-start gap-2 rounded-lg border px-3.5 py-2.5 text-[13px] shadow-xl shadow-black/50"
          style={{
            backgroundColor: "#15151f",
            borderColor: notice.type === "error" ? "rgba(242,85,110,0.45)" : "rgba(34,196,147,0.45)",
            color: notice.type === "error" ? AT_NEG : AT_POS,
          }}
        >
          {notice.type === "error" ? <AlertCircle size={15} className="mt-0.5 shrink-0" /> : <Check size={15} className="mt-0.5 shrink-0" />}
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
            className={`${AT_ICON_BTN} ml-1 h-5 w-5 ${AT_FOCUS}`}
          >
            ×
          </button>
        </div>
      )}

      {syncingAll && (
        <span className="sr-only" role="status">
          <Loader2 className="animate-spin" /> Syncing selected accounts
        </span>
      )}
    </div>
  );
}
