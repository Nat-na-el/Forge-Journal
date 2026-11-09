// src/pages/Trades.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTheme } from "../Theme-provider";
import {
  Trash2,
  Eye,
  Download,
  X,
  FileText,
  Edit,
  Check,
  AlertCircle,
  PlusCircle,
  BookOpen,
  Tag,
  BarChart3,
  TrendingUp,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import DeleteConfirmModal from "../components/ui/DeleteConfirmModal";
import useAccent from "../hooks/useAccent";
import AccentPicker from "../components/ui/AccentPicker";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import { db, auth } from "../firebase";
import {
  collection,
  getDocs,
  query,
  orderBy,
  updateDoc,
  doc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler, Tooltip);

const formatNumber = (num) => {
  if (!num && num !== 0) return "0.00";
  return Number(num).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const money = (n, signed = false) =>
  `${n < 0 ? "-" : signed && n > 0 ? "+" : ""}$${formatNumber(Math.abs(n))}`;

const hexA = (hex, a) => {
  const h = (hex || "#6366f1").replace("#", "");
  if (h.length !== 6) return `rgba(99,102,241,${a})`;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

const PANEL =
  "rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm";
const POS = "text-emerald-600 dark:text-emerald-400";
const NEG = "text-rose-600 dark:text-rose-400";
const toneOf = (n) => (n > 0 ? POS : n < 0 ? NEG : "text-slate-900 dark:text-slate-100");

const Panel = ({ title, action, children, className = "" }) => (
  <div className={`${PANEL} ${className}`}>
    {title && (
      <div className="flex items-center justify-between px-5 pt-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
        {action}
      </div>
    )}
    <div className="px-5 pb-5 pt-3">{children}</div>
  </div>
);

const Kpi = ({ label, value, sub, tone }) => (
  <div className={`${PANEL} p-4`}>
    <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
      {label}
    </div>
    <div className={`mt-2 text-2xl font-semibold tabular-nums ${tone || "text-slate-900 dark:text-slate-100"}`}>
      {value}
    </div>
    {sub && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</div>}
  </div>
);

const StatRow = ({ label, value, tone }) => (
  <div className="flex items-center justify-between py-2 text-sm border-b border-slate-100 dark:border-slate-800 last:border-0">
    <span className="text-slate-500 dark:text-slate-400">{label}</span>
    <span className={`font-medium tabular-nums ${tone || "text-slate-900 dark:text-slate-100"}`}>{value}</span>
  </div>
);

const Donut = ({ wins, losses, be }) => {
  const total = wins + losses + be;
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const segs = [
    { v: wins, col: "#10b981" },
    { v: be, col: "#94a3b8" },
    { v: losses, col: "#f43f5e" },
  ];
  return (
    <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90 shrink-0">
      <circle cx="50" cy="50" r={r} fill="none" strokeWidth="10" stroke="currentColor" className="text-slate-100 dark:text-slate-800" />
      {total > 0 &&
        segs.map((sg, i) => {
          if (!sg.v) return null;
          const len = (sg.v / total) * c;
          const el = (
            <circle key={i} cx="50" cy="50" r={r} fill="none" stroke={sg.col} strokeWidth="10"
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />
          );
          offset += len;
          return el;
        })}
    </svg>
  );
};

const PnLCalendar = ({ month, onMonth, daily, onPick, selected }) => {
  const y = month.getFullYear();
  const m = month.getMonth();
  const lead = new Date(y, m, 1).getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const keyOf = (d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const monthTotal = cells.reduce((sum, d) => sum + (d ? daily[keyOf(d)]?.pnl || 0 : 0), 0);
  const nav = "p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800";

  return (
    <Panel
      title={`${month.toLocaleString("en-US", { month: "long", year: "numeric" })} · ${money(monthTotal, true)}`}
      action={
        <div className="flex gap-1.5">
          <button type="button" className={nav} onClick={() => onMonth(new Date(y, m - 1, 1))}>
            <ChevronLeft size={16} />
          </button>
          <button type="button" className={nav} onClick={() => onMonth(new Date(y, m + 1, 1))}>
            <ChevronRight size={16} />
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-8 gap-1.5 text-center text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1.5">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Week"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="space-y-1.5">
        {weeks.map((wk, wi) => {
          const weekTotal = wk.reduce((sum, d) => sum + (d ? daily[keyOf(d)]?.pnl || 0 : 0), 0);
          const weekCount = wk.reduce((sum, d) => sum + (d ? daily[keyOf(d)]?.count || 0 : 0), 0);
          return (
            <div key={wi} className="grid grid-cols-8 gap-1.5">
              {wk.map((d, di) => {
                if (!d) return <div key={di} />;
                const rec = daily[keyOf(d)];
                const tone = !rec
                  ? "border-slate-100 dark:border-slate-800 text-slate-400"
                  : rec.pnl > 0
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : rec.pnl < 0
                  ? "border-rose-500/30 bg-rose-500/10"
                  : "border-slate-300 dark:border-slate-700 bg-slate-500/10";
                return (
                  <button
                    key={di}
                    type="button"
                    onClick={() => rec && onPick(keyOf(d))}
                    className={`min-h-[62px] rounded-lg border p-1.5 text-left transition ${tone} ${
                      selected === keyOf(d) ? "ring-2 ring-offset-0 ring-slate-400" : ""
                    } ${rec ? "cursor-pointer hover:brightness-110" : "cursor-default"}`}
                  >
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{d}</div>
                    {rec && (
                      <>
                        <div className={`text-xs font-semibold tabular-nums ${toneOf(rec.pnl)}`}>
                          {money(rec.pnl, true)}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          {rec.count} trade{rec.count > 1 ? "s" : ""}
                        </div>
                      </>
                    )}
                  </button>
                );
              })}
              <div className="min-h-[62px] rounded-lg border border-slate-100 dark:border-slate-800 p-1.5 flex flex-col justify-center text-center">
                {weekCount > 0 ? (
                  <>
                    <div className={`text-xs font-semibold tabular-nums ${toneOf(weekTotal)}`}>{money(weekTotal, true)}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">{weekCount} trades</div>
                  </>
                ) : (
                  <div className="text-[11px] text-slate-400">—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
};

// Tag input component for confluences (if editing, but we can keep simple display)
const ConfluenceTags = ({ tags, onChange }) => {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef(null);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const value = inputValue.trim();
      if (value && !tags.includes(value)) {
        onChange([...tags, value]);
        setInputValue("");
      }
    }
  };

  const removeTag = (tagToRemove) => {
    onChange(tags.filter(tag => tag !== tagToRemove));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 p-2 border rounded-xl min-h-[60px] items-center bg-white dark:bg-gray-800">
        {tags.map((tag, idx) => (
          <span
            key={idx}
            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-full bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30"
          >
            <Tag size={12} />
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="ml-1 hover:text-indigo-900 dark:hover:text-indigo-100"
            >
              <X size={14} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? "Type a confluence and press Enter..." : ""}
          className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-sm p-1"
        />
      </div>
      <p className="text-xs opacity-60">Press Enter or comma to add a tag</p>
    </div>
  );
};

export default function Trades({ currentAccount }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { accent, setAccent, ac } = useAccent();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState({ text: "", type: "success" });

  const selectedDate = searchParams.get("date");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("date-desc");

  const [selectedTrade, setSelectedTrade] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);
  const [editForm, setEditForm] = useState({
    pair: "",
    direction: "",
    entry: "",
    exit: "",
    stopLoss: "",
    takeProfit: "",
    rr: "",
    pnl: "",
    notes: "",
    status: "executed",
    confluences: [],
    screenshotUrl: "",
    openDateTime: "",
    closeDateTime: "",
  });
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [tradeToDelete, setTradeToDelete] = useState(null);
  const [user, setUser] = useState(null);

  const isAccountReady = user && currentAccount;

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((authUser) => {
      setUser(authUser);
      if (!authUser) {
        setTrades([]);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const refreshTrades = async () => {
    if (!user || !currentAccount?.id) {
      setTrades([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const tradesRef = collection(
        db,
        "users",
        user.uid,
        "accounts",
        currentAccount.id,
        "trades"
      );
      const q = query(tradesRef, orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      const loaded = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTrades(loaded);
    } catch (err) {
      console.error("Trades fetch failed:", err);
      setError("Could not load trades. Please check your connection.");
      setTrades([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && currentAccount) {
      refreshTrades();
    } else {
      setTrades([]);
      setLoading(false);
    }
  }, [currentAccount, user]);

  const filteredTrades = useMemo(() => {
    let result = [...trades];
    if (selectedDate) {
      result = result.filter((t) => t.openDateTime?.startsWith(selectedDate));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          (t.pair || "").toLowerCase().includes(q) ||
          (t.notes || "").toLowerCase().includes(q) ||
          (t.strategy || "").toLowerCase().includes(q) ||
          (t.confluences?.some(c => c.toLowerCase().includes(q)))
      );
    }
    result.sort((a, b) => {
      if (sortBy === "date-desc") return new Date(b.openDateTime || 0) - new Date(a.openDateTime || 0);
      if (sortBy === "date-asc") return new Date(a.openDateTime || 0) - new Date(b.openDateTime || 0);
      if (sortBy === "pnl-desc") return Number(b.pnl || 0) - Number(a.pnl || 0);
      if (sortBy === "pnl-asc") return Number(a.pnl || 0) - Number(b.pnl || 0);
      if (sortBy === "pair") return (a.pair || "").localeCompare(b.pair || "");
      return 0;
    });
    return result;
  }, [trades, selectedDate, searchQuery, sortBy]);

  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const analytics = useMemo(() => {
    const ex = filteredTrades.filter((t) => t.status !== "pending");
    const pnlOf = (t) => Number(t.pnl) || 0;
    const dayOf = (t) => (t.closeDateTime || t.openDateTime || "").slice(0, 10);
    const wins = ex.filter((t) => pnlOf(t) > 0);
    const losses = ex.filter((t) => pnlOf(t) < 0);
    const be = ex.length - wins.length - losses.length;
    const grossWin = wins.reduce((sum, t) => sum + pnlOf(t), 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + pnlOf(t), 0));
    const net = grossWin - grossLoss;
    const avgWin = wins.length ? grossWin / wins.length : 0;
    const avgLoss = losses.length ? grossLoss / losses.length : 0;

    const chrono = [...ex].sort(
      (x, y) => new Date(x.closeDateTime || x.openDateTime || 0) - new Date(y.closeDateTime || y.openDateTime || 0)
    );
    let run = 0, peak = 0, maxDD = 0, curW = 0, curL = 0, maxW = 0, maxL = 0;
    const equity = chrono.map((t) => {
      const p = pnlOf(t);
      run += p;
      peak = Math.max(peak, run);
      maxDD = Math.max(maxDD, peak - run);
      if (p > 0) { curW += 1; curL = 0; }
      else if (p < 0) { curL += 1; curW = 0; }
      else { curW = 0; curL = 0; }
      maxW = Math.max(maxW, curW);
      maxL = Math.max(maxL, curL);
      return { label: dayOf(t), value: Number(run.toFixed(2)) };
    });

    const daily = {};
    ex.forEach((t) => {
      const k = dayOf(t);
      if (!k) return;
      daily[k] = daily[k] || { pnl: 0, count: 0 };
      daily[k].pnl += pnlOf(t);
      daily[k].count += 1;
    });

    const side = (re) => {
      const g = ex.filter((t) => re.test(t.direction || ""));
      const w = g.filter((t) => pnlOf(t) > 0).length;
      return {
        count: g.length,
        winRate: g.length ? (w / g.length) * 100 : 0,
        pnl: g.reduce((sum, t) => sum + pnlOf(t), 0),
      };
    };

    const pnls = ex.map(pnlOf);
    return {
      total: ex.length,
      pending: filteredTrades.length - ex.length,
      wins: wins.length,
      losses: losses.length,
      be,
      grossWin,
      grossLoss,
      net,
      avgWin,
      avgLoss,
      winRate: ex.length ? (wins.length / ex.length) * 100 : 0,
      profitFactor: grossLoss ? grossWin / grossLoss : grossWin ? Infinity : 0,
      payoff: avgLoss ? avgWin / avgLoss : avgWin ? Infinity : 0,
      expectancy: ex.length ? net / ex.length : 0,
      maxDD,
      maxW,
      maxL,
      best: pnls.length ? Math.max(...pnls) : 0,
      worst: pnls.length ? Math.min(...pnls) : 0,
      avgRR: ex.length ? ex.reduce((sum, t) => sum + (Number(t.rr) || 0), 0) / ex.length : 0,
      equity,
      daily,
      long: side(/^(long|buy)/i),
      short: side(/^(short|sell)/i),
    };
  }, [filteredTrades]);

  // ─── P&L by pair (executed trades in the current filter) ─────────────
  const pairPnL = useMemo(() => {
    const m = {};
    filteredTrades
      .filter((t) => t.status !== "pending")
      .forEach((t) => {
        const k = t.pair || "?";
        m[k] = (m[k] || 0) + (Number(t.pnl) || 0);
      });
    return Object.entries(m)
      .map(([pair, pnl]) => ({ pair, pnl: Number(pnl.toFixed(2)) }))
      .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
      .slice(0, 8);
  }, [filteredTrades]);

  const openEdit = (trade) => {
    setEditingTrade(trade);
    setEditForm({
      pair: trade.pair || "",
      direction: trade.direction || "Long",
      entry: trade.entry || "",
      exit: trade.exit || "",
      stopLoss: trade.stopLoss || "",
      takeProfit: trade.takeProfit || "",
      rr: trade.rr || "",
      pnl: trade.pnl || "",
      notes: trade.notes || "",
      status: trade.status || "executed",
      confluences: trade.confluences || [],
      screenshotUrl: trade.screenshotUrl || "",
      openDateTime: trade.openDateTime || "",
      closeDateTime: trade.closeDateTime || "",
    });
    setEditModalOpen(true);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editingTrade) return;
    if (!user || !currentAccount?.id) {
      setMessage({ text: "No account or user logged in", type: "error" });
      return;
    }
    try {
      const tradeRef = doc(
        db,
        "users",
        user.uid,
        "accounts",
        currentAccount.id,
        "trades",
        editingTrade.id
      );
      await updateDoc(tradeRef, {
        ...editForm,
        updatedAt: serverTimestamp(),
      });
      setMessage({ text: "Trade updated successfully!", type: "success" });
      setTimeout(() => setMessage({ text: "", type: "success" }), 4000);
      setEditModalOpen(false);
      setEditingTrade(null);
      await refreshTrades();
    } catch (err) {
      console.error("Update error:", err);
      setMessage({ text: "Error updating trade: " + err.message, type: "error" });
    }
  };

  const deleteTrade = async (id) => {
    if (!user || !currentAccount?.id) return;
    try {
      await deleteDoc(
        doc(db, "users", user.uid, "accounts", currentAccount.id, "trades", id)
      );
      setMessage({ text: "Trade deleted successfully", type: "success" });
      setTimeout(() => setMessage({ text: "", type: "success" }), 4000);
      await refreshTrades();
    } catch (err) {
      console.error("Delete failed:", err);
      setMessage({ text: "Failed to delete trade: " + err.message, type: "error" });
    }
    setDeleteModalOpen(false);
    setTradeToDelete(null);
  };

  const exportCSV = () => {
    if (!filteredTrades.length) return;
    const headers = [
      "Open Date",
      "Close Date",
      "Pair",
      "Direction",
      "Entry",
      "Exit",
      "Stop Loss",
      "Take Profit",
      "PnL",
      "R:R",
      "Status",
      "Confluences",
      "Notes",
    ];
    const rows = filteredTrades.map((t) => [
      t.openDateTime || "",
      t.closeDateTime || "",
      t.pair || "",
      t.direction || "",
      t.entry || "",
      t.exit || "",
      t.stopLoss || "",
      t.takeProfit || "",
      t.pnl || 0,
      t.rr || "",
      t.status || "executed",
      (t.confluences || []).join("; "),
      `"${(t.notes || "").replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `forgex-trades-${currentAccount?.name || "account"}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const migrateOldTrades = async () => {
    if (!user || !currentAccount?.id) {
      setMessage({ text: "No user or account selected", type: "error" });
      return;
    }
    try {
      const oldTradesSnap = await getDocs(collection(db, "users", user.uid, "trades"));
      if (oldTradesSnap.empty) {
        setMessage({ text: "No old trades found to migrate", type: "info" });
        return;
      }
      const batch = writeBatch(db);
      oldTradesSnap.forEach((oldDoc) => {
        const newRef = doc(
          collection(db, "users", user.uid, "accounts", currentAccount.id, "trades")
        );
        batch.set(newRef, oldDoc.data());
        batch.delete(oldDoc.ref);
      });
      await batch.commit();
      setMessage({
        text: `Migrated ${oldTradesSnap.size} old trades to ${currentAccount.name}!`,
        type: "success",
      });
      await refreshTrades();
    } catch (err) {
      console.error("Migration failed:", err);
      setMessage({ text: "Migration failed: " + err.message, type: "error" });
    }
  };

  if (!currentAccount) {
    return (
      <div className={`min-h-screen w-full p-8 flex items-center justify-center ${isDark ? "bg-slate-950" : "bg-slate-50"}`}>
        <Card className="p-8 max-w-md text-center bg-white/80 dark:bg-gray-800/60 backdrop-blur-md">
          <AlertCircle size={48} className="mx-auto text-amber-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">No Account Selected</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Please create or select an account from the sidebar to view your trades.
          </p>
        </Card>
      </div>
    );
  }

  const grid = isDark ? "rgba(148,163,184,0.12)" : "rgba(100,116,139,0.15)";
  const tick = isDark ? "#94a3b8" : "#64748b";
  const pfText = analytics.profitFactor === Infinity ? "∞" : analytics.profitFactor.toFixed(2);
  const payoffText = analytics.payoff === Infinity ? "∞" : analytics.payoff.toFixed(2);
  const dailyKeys = Object.keys(analytics.daily).sort().slice(-30);
  const inputCls =
    "h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-slate-400/40";

  return (
    <div className="min-h-screen w-full p-4 sm:p-6 lg:p-8 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Performance Dashboard
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight">{currentAccount.name}</h1>
            {selectedDate && (
              <button
                type="button"
                onClick={() => setSearchParams({})}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-slate-300 dark:border-slate-700 px-3 py-1 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Showing {selectedDate} <X size={12} />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AccentPicker accent={accent} setAccent={setAccent} className="mr-1" />
            <Button
              onClick={() => navigate("/trades/new")}
              style={{ backgroundColor: ac.hex }}
              className="text-white hover:brightness-110 shadow-sm"
            >
              <PlusCircle size={16} className="mr-2" /> Add Trade
            </Button>
            <Button
              onClick={exportCSV}
              disabled={!filteredTrades.length || loading}
              variant="outline"
              className="border border-slate-300 dark:border-slate-700 disabled:opacity-50"
            >
              <Download size={16} className="mr-2" /> Export
            </Button>
            <Button
              onClick={migrateOldTrades}
              variant="outline"
              className="border border-slate-300 dark:border-slate-700"
            >
              Migrate
            </Button>
          </div>
        </div>

        {/* Feedback */}
        {message.text && (
          <div
            className={`px-4 py-3 rounded-lg flex items-center gap-3 text-sm border ${
              message.type === "success"
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-900"
                : "bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-900"
            }`}
          >
            {message.type === "success" ? <Check size={18} /> : <AlertCircle size={18} />}
            {message.text}
          </div>
        )}

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Kpi label="Net P&L" value={money(analytics.net, true)} tone={toneOf(analytics.net)}
            sub={`${analytics.total} closed${analytics.pending ? ` · ${analytics.pending} pending` : ""}`} />
          <Kpi label="Win rate" value={`${analytics.winRate.toFixed(1)}%`}
            sub={`${analytics.wins}W · ${analytics.be}BE · ${analytics.losses}L`} />
          <Kpi label="Profit factor" value={pfText}
            sub={`${money(analytics.grossWin)} / ${money(analytics.grossLoss)}`} />
          <Kpi label="Avg win / loss" value={payoffText}
            sub={`${money(analytics.avgWin)} / ${money(analytics.avgLoss)}`} />
          <Kpi label="Expectancy" value={money(analytics.expectancy, true)} tone={toneOf(analytics.expectancy)}
            sub="per trade" />
          <Kpi label="Max drawdown" value={analytics.maxDD ? money(-analytics.maxDD) : "$0.00"}
            tone={analytics.maxDD ? NEG : undefined} sub="peak to trough" />
        </div>

        {/* Equity curve + win breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Panel
            className="lg:col-span-2"
            title="Equity curve"
            action={<TrendingUp size={16} style={{ color: ac.hex }} />}
          >
            {analytics.equity.length ? (
              <div className="relative h-64">
                <Line
                  data={{
                    labels: analytics.equity.map((pt) => pt.label),
                    datasets: [
                      {
                        data: analytics.equity.map((pt) => pt.value),
                        borderColor: ac.hex,
                        backgroundColor: hexA(ac.hex, 0.12),
                        fill: true,
                        tension: 0.3,
                        borderWidth: 2,
                        pointRadius: analytics.equity.length > 40 ? 0 : 3,
                        pointHoverRadius: 5,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: "index", intersect: false },
                    plugins: {
                      legend: { display: false },
                      tooltip: { callbacks: { label: (c) => ` ${money(c.parsed.y, true)}` } },
                    },
                    scales: {
                      x: { grid: { display: false }, ticks: { color: tick, maxTicksLimit: 8 } },
                      y: { grid: { color: grid }, ticks: { color: tick, callback: (v) => `$${v}` } },
                    },
                  }}
                />
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-sm text-slate-400">
                Close a trade to start your equity curve
              </div>
            )}
          </Panel>

          <Panel title="Win / loss breakdown">
            <div className="flex items-center gap-5">
              <div className="relative">
                <Donut wins={analytics.wins} losses={analytics.losses} be={analytics.be} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-xl font-semibold tabular-nums">{analytics.winRate.toFixed(0)}%</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">win rate</div>
                </div>
              </div>
              <div className="flex-1 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Wins</span><span className={POS}>{analytics.wins}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Break-even</span><span>{analytics.be}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Losses</span><span className={NEG}>{analytics.losses}</span></div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[["Long", analytics.long], ["Short", analytics.short]].map(([name, sd]) => (
                <div key={name} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-slate-500">{name}</div>
                  <div className={`mt-1 text-base font-semibold tabular-nums ${toneOf(sd.pnl)}`}>{money(sd.pnl, true)}</div>
                  <div className="text-xs text-slate-500">{sd.count} trades · {sd.winRate.toFixed(0)}% win</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* Calendar + statistics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <PnLCalendar
              month={calMonth}
              onMonth={setCalMonth}
              daily={analytics.daily}
              selected={selectedDate}
              onPick={(day) => setSearchParams({ date: day })}
            />
          </div>
          <Panel title="Trade statistics">
            <StatRow label="Gross profit" value={money(analytics.grossWin)} tone={POS} />
            <StatRow label="Gross loss" value={money(-analytics.grossLoss)} tone={analytics.grossLoss ? NEG : undefined} />
            <StatRow label="Average win" value={money(analytics.avgWin)} tone={POS} />
            <StatRow label="Average loss" value={money(-analytics.avgLoss)} tone={analytics.avgLoss ? NEG : undefined} />
            <StatRow label="Best trade" value={money(analytics.best, true)} tone={toneOf(analytics.best)} />
            <StatRow label="Worst trade" value={money(analytics.worst, true)} tone={toneOf(analytics.worst)} />
            <StatRow label="Avg R:R" value={analytics.avgRR.toFixed(2)} />
            <StatRow label="Max win streak" value={analytics.maxW} />
            <StatRow label="Max loss streak" value={analytics.maxL} />
          </Panel>
        </div>

        {/* Daily P&L + P&L by pair */}
        {!loading && (dailyKeys.length > 0 || pairPnL.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel title="Daily net P&L (last 30 days)">
              <div className="relative h-56">
                <Bar
                  data={{
                    labels: dailyKeys.map((k) => k.slice(5)),
                    datasets: [
                      {
                        data: dailyKeys.map((k) => Number(analytics.daily[k].pnl.toFixed(2))),
                        backgroundColor: dailyKeys.map((k) => (analytics.daily[k].pnl >= 0 ? "#10b981" : "#f43f5e")),
                        borderRadius: 4,
                        maxBarThickness: 18,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: { callbacks: { label: (c) => ` ${money(c.parsed.y, true)}` } },
                    },
                    scales: {
                      x: { grid: { display: false }, ticks: { color: tick, maxTicksLimit: 10 } },
                      y: { grid: { color: grid }, ticks: { color: tick, callback: (v) => `$${v}` } },
                    },
                  }}
                />
              </div>
            </Panel>
            <Panel title="P&L by pair" action={<BarChart3 size={16} style={{ color: ac.hex }} />}>
              <div className="relative" style={{ height: Math.max(224, pairPnL.length * 34 + 40) }}>
                <Bar
                  data={{
                    labels: pairPnL.map((x) => x.pair),
                    datasets: [
                      {
                        data: pairPnL.map((x) => x.pnl),
                        backgroundColor: pairPnL.map((x) => (x.pnl >= 0 ? "#10b981" : "#f43f5e")),
                        borderRadius: 4,
                        maxBarThickness: 20,
                      },
                    ],
                  }}
                  options={{
                    indexAxis: "y",
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: { callbacks: { label: (c) => ` ${money(c.parsed.x, true)}` } },
                    },
                    scales: {
                      x: { grid: { color: grid }, ticks: { color: tick, maxTicksLimit: 6 } },
                      y: { grid: { display: false }, ticks: { color: tick } },
                    },
                  }}
                />
              </div>
            </Panel>
          </div>
        )}

        {/* Trade log toolbar */}
        <div className="flex flex-col gap-3 pt-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-semibold">Trade log</h2>
            <span className="text-sm text-slate-500">{filteredTrades.length} trades</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search pair, notes, tags…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${inputCls} pl-9 w-60`}
              />
            </div>
            <input
              type="date"
              value={selectedDate || ""}
              onChange={(e) => setSearchParams(e.target.value ? { date: e.target.value } : {})}
              className={inputCls}
            />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className={inputCls}>
              <option value="date-desc">Newest first</option>
              <option value="date-asc">Oldest first</option>
              <option value="pnl-desc">Highest P&L</option>
              <option value="pnl-asc">Lowest P&L</option>
              <option value="pair">Pair (A–Z)</option>
            </select>
          </div>
        </div>

        {/* Trades List */}
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
          </div>
        ) : error ? (
          <div className="text-center py-16 text-rose-400 text-xl font-medium">{error}</div>
        ) : filteredTrades.length === 0 ? (
          <Card className="p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm max-w-2xl mx-auto">
            <AlertCircle size={72} className="mx-auto text-amber-500 mb-6 opacity-90" />
            <h2 className="text-3xl font-bold mb-4 text-gray-900 dark:text-gray-100">
              No trades yet in {currentAccount.name}
            </h2>
            <p className="text-lg opacity-80 mb-10 leading-relaxed">
              Start building your performance history.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-6">
              <Button
                size="lg"
                style={{ backgroundColor: ac.hex }}
                className="hover:brightness-110 text-white shadow-lg px-6 py-3 text-base font-medium"
                onClick={() => navigate("/trades/new")}
              >
                <PlusCircle size={24} className="mr-3" />
                Add New Trade
              </Button>
              <Button
                size="lg"
                variant="outline"
                style={{ borderColor: ac.hex, color: ac.hex }}
                className="border-2 hover:bg-black/5 dark:hover:bg-white/5 px-6 py-3 text-base font-medium"
                onClick={() => navigate("/journal")}
              >
                <BookOpen size={24} className="mr-3" />
                Journal Today
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredTrades.map((trade) => (
              <Card
                key={trade.id}
                className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors group"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center text-base font-bold shadow-sm ${
                          trade.status === "pending"
                            ? "bg-gray-300 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                            : Number(trade.pnl || 0) >= 0
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                        }`}
                      >
                        {trade.pair?.slice(0, 2) || "?"}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-lg">
                            {trade.pair || "—"} • {trade.direction || "—"}
                          </span>
                          {trade.status === "pending" && (
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                              Pending
                            </span>
                          )}
                        </div>
                        <div className="text-sm opacity-70 flex flex-wrap gap-3 mt-1">
                          <span>Open: {trade.openDateTime ? new Date(trade.openDateTime).toLocaleString() : "—"}</span>
                          {trade.status === "executed" && trade.closeDateTime && (
                            <span>Close: {new Date(trade.closeDateTime).toLocaleString()}</span>
                          )}
                          <span>Lot: {trade.lotSize || "—"}</span>
                          {trade.status === "executed" && trade.rr && <span>R:R {trade.rr}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Confluences */}
                    {trade.confluences?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {trade.confluences.map((conf, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20"
                          >
                            <Tag size={12} />
                            {conf}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Notes */}
                    {trade.notes && (
                      <div className="text-sm opacity-80 line-clamp-2 mt-2">
                        <FileText size={14} className="inline mr-1" />
                        {trade.notes}
                      </div>
                    )}

                    {/* Screenshot */}
                    {trade.screenshotUrl && (
                      <a
                        href={trade.screenshotUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-2"
                      >
                        <img
                          src={trade.screenshotUrl}
                          alt="Chart"
                          className="h-16 w-16 object-cover rounded-lg border border-gray-300 dark:border-gray-600 hover:opacity-80 transition"
                        />
                      </a>
                    )}
                  </div>

                  <div className="flex items-center justify-between lg:justify-end w-full lg:w-auto gap-6">
                    <div className="text-left sm:text-right sm:min-w-[100px]">
                      {trade.status === "pending" ? (
                        <div className="text-lg font-semibold text-amber-600 dark:text-amber-400">Pending</div>
                      ) : (
                        <>
                          <div
                            className={`text-xl font-bold ${
                              Number(trade.pnl || 0) >= 0
                                ? "text-emerald-700 dark:text-emerald-500"
                                : "text-rose-700 dark:text-rose-500"
                            }`}
                          >
                            {Number(trade.pnl || 0) >= 0 ? "+" : ""}$
                            {Math.abs(Number(trade.pnl || 0)).toFixed(2)}
                          </div>
                          {trade.rr && <div className="text-xs opacity-70">R:R {trade.rr}</div>}
                        </>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => setSelectedTrade(trade)}
                        className="h-10 w-10 rounded-lg border-2 hover:bg-indigo-100 dark:hover:bg-indigo-900"
                      >
                        <Eye size={18} />
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => openEdit(trade)}
                        className="h-10 w-10 rounded-lg border-2 hover:bg-indigo-100 dark:hover:bg-indigo-900"
                      >
                        <Edit size={18} />
                      </Button>
                      <Button
                        size="icon"
                        variant="destructive"
                        onClick={() => {
                          setTradeToDelete(trade.id);
                          setDeleteModalOpen(true);
                        }}
                        className="h-10 w-10 rounded-lg border-2 border-rose-300 dark:border-rose-700 hover:bg-rose-100 dark:hover:bg-rose-900"
                      >
                        <Trash2 size={18} />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* View Details Modal */}
        {selectedTrade && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000] p-4">
            <div
              className={`w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden border
                ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}
            >
              <div className="p-6 max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                  <h2
                    className="text-2xl font-bold bg-clip-text text-transparent"
                    style={{ backgroundImage: `linear-gradient(90deg, ${ac.hex}, ${ac.hex2})` }}
                  >
                    Trade Details
                  </h2>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedTrade(null)}>
                    <X size={24} />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm opacity-70 mb-1">Pair & Direction</div>
                      <div className="text-xl font-semibold">
                        {selectedTrade.pair || "—"} • {selectedTrade.direction || "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm opacity-70 mb-1">Open Date & Time</div>
                      <div className="text-lg">
                        {selectedTrade.openDateTime
                          ? new Date(selectedTrade.openDateTime).toLocaleString()
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm opacity-70 mb-1">Close Date & Time</div>
                      <div className="text-lg">
                        {selectedTrade.closeDateTime
                          ? new Date(selectedTrade.closeDateTime).toLocaleString()
                          : selectedTrade.status === "pending" ? "Pending" : "—"}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm opacity-70 mb-1">Entry</div>
                        <div className="text-lg font-medium">{selectedTrade.entry || "—"}</div>
                      </div>
                      <div>
                        <div className="text-sm opacity-70 mb-1">Exit</div>
                        <div className="text-lg font-medium">
                          {selectedTrade.status === "pending" ? "Pending" : (selectedTrade.exit || "—")}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm opacity-70 mb-1">Stop Loss</div>
                        <div className="text-lg">{selectedTrade.stopLoss || "—"}</div>
                      </div>
                      <div>
                        <div className="text-sm opacity-70 mb-1">Take Profit</div>
                        <div className="text-lg">{selectedTrade.takeProfit || "—"}</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm opacity-70 mb-1">Risk:Reward</div>
                      <div className="text-xl font-bold text-violet-600 dark:text-violet-400">
                        {selectedTrade.status === "pending" ? "—" : (selectedTrade.rr || "—")}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm opacity-70 mb-1">Status</div>
                      <div className={`text-lg font-semibold ${
                        selectedTrade.status === "pending" ? "text-amber-600" : "text-emerald-600"
                      }`}>
                        {selectedTrade.status === "pending" ? "⏳ Pending" : "✅ Executed"}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm opacity-70 mb-1">Profit & Loss</div>
                      <div
                        className={`text-3xl font-bold ${
                          selectedTrade.status === "pending"
                            ? "text-gray-500"
                            : Number(selectedTrade.pnl || 0) >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {selectedTrade.status === "pending"
                          ? "Pending"
                          : `${Number(selectedTrade.pnl || 0) >= 0 ? "+" : ""}$${Math.abs(Number(selectedTrade.pnl || 0)).toFixed(2)}`
                        }
                      </div>
                    </div>
                    {selectedTrade.confluences?.length > 0 && (
                      <div>
                        <div className="text-sm opacity-70 mb-2">Confluences</div>
                        <div className="flex flex-wrap gap-2">
                          {selectedTrade.confluences.map((conf, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-3 py-1 text-xs rounded-full bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30"
                            >
                              {conf}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedTrade.notes && (
                      <div>
                        <div className="text-sm opacity-70 mb-2 flex items-center gap-2">
                          <FileText size={16} /> Notes
                        </div>
                        <div className="p-4 rounded-xl bg-gray-50/80 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 whitespace-pre-wrap text-sm">
                          {selectedTrade.notes}
                        </div>
                      </div>
                    )}
                    {selectedTrade.screenshotUrl && (
                      <div>
                        <div className="text-sm opacity-70 mb-2">Chart</div>
                        <a href={selectedTrade.screenshotUrl} target="_blank" rel="noopener noreferrer">
                          <img
                            src={selectedTrade.screenshotUrl}
                            alt="Chart"
                            className="max-h-48 rounded-lg border border-gray-300 dark:border-gray-600"
                          />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-4">
                <Button variant="outline" onClick={() => openEdit(selectedTrade)}>
                  <Edit size={16} className="mr-2" /> Edit Trade
                </Button>
                <Button variant="outline" onClick={() => setSelectedTrade(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editModalOpen && editingTrade && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000] p-4">
            <div
              className={`w-full max-w-lg rounded-xl shadow-2xl overflow-hidden border
                ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}
            >
              <div className="p-6 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                  <h2
                    className="text-2xl font-bold bg-clip-text text-transparent"
                    style={{ backgroundImage: `linear-gradient(90deg, ${ac.hex}, ${ac.hex2})` }}
                  >
                    Edit Trade
                  </h2>
                  <Button variant="ghost" size="icon" onClick={() => setEditModalOpen(false)}>
                    <X size={24} />
                  </Button>
                </div>
                <form onSubmit={saveEdit} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Pair</label>
                      <input
                        value={editForm.pair}
                        onChange={(e) => setEditForm({ ...editForm, pair: e.target.value })}
                        className={`w-full p-3 rounded-xl border ${
                          isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                        } focus:ring-2 focus:ring-indigo-500 outline-none`}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Direction</label>
                      <select
                        value={editForm.direction}
                        onChange={(e) => setEditForm({ ...editForm, direction: e.target.value })}
                        className={`w-full p-3 rounded-xl border ${
                          isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                        } focus:ring-2 focus:ring-indigo-500 outline-none`}
                      >
                        <option value="Long">Long</option>
                        <option value="Short">Short</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Open Date/Time</label>
                      <input
                        type="datetime-local"
                        value={editForm.openDateTime}
                        onChange={(e) => setEditForm({ ...editForm, openDateTime: e.target.value })}
                        className={`w-full p-3 rounded-xl border ${
                          isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                        } focus:ring-2 focus:ring-indigo-500 outline-none`}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Close Date/Time</label>
                      <input
                        type="datetime-local"
                        value={editForm.closeDateTime}
                        onChange={(e) => setEditForm({ ...editForm, closeDateTime: e.target.value })}
                        disabled={editForm.status === "pending"}
                        className={`w-full p-3 rounded-xl border ${
                          editForm.status === "pending"
                            ? "bg-gray-200 dark:bg-gray-700 cursor-not-allowed"
                            : isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                        } focus:ring-2 focus:ring-indigo-500 outline-none`}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Entry</label>
                      <input
                        type="number"
                        step="0.00001"
                        value={editForm.entry}
                        onChange={(e) => setEditForm({ ...editForm, entry: e.target.value })}
                        className={`w-full p-3 rounded-xl border ${
                          isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                        } focus:ring-2 focus:ring-indigo-500 outline-none`}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Exit</label>
                      <input
                        type="number"
                        step="0.00001"
                        value={editForm.exit}
                        onChange={(e) => setEditForm({ ...editForm, exit: e.target.value })}
                        disabled={editForm.status === "pending"}
                        className={`w-full p-3 rounded-xl border ${
                          editForm.status === "pending"
                            ? "bg-gray-200 dark:bg-gray-700 cursor-not-allowed"
                            : isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                        } focus:ring-2 focus:ring-indigo-500 outline-none`}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">PnL</label>
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.pnl}
                        onChange={(e) => setEditForm({ ...editForm, pnl: e.target.value })}
                        disabled={editForm.status === "pending"}
                        className={`w-full p-3 rounded-xl border ${
                          editForm.status === "pending"
                            ? "bg-gray-200 dark:bg-gray-700 cursor-not-allowed"
                            : isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                        } focus:ring-2 focus:ring-indigo-500 outline-none`}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Stop Loss</label>
                      <input
                        type="number"
                        step="0.00001"
                        value={editForm.stopLoss}
                        onChange={(e) => setEditForm({ ...editForm, stopLoss: e.target.value })}
                        className={`w-full p-3 rounded-xl border ${
                          isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                        } focus:ring-2 focus:ring-indigo-500 outline-none`}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Take Profit</label>
                      <input
                        type="number"
                        step="0.00001"
                        value={editForm.takeProfit}
                        onChange={(e) => setEditForm({ ...editForm, takeProfit: e.target.value })}
                        className={`w-full p-3 rounded-xl border ${
                          isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                        } focus:ring-2 focus:ring-indigo-500 outline-none`}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">R:R</label>
                      <input
                        type="number"
                        step="0.1"
                        value={editForm.rr}
                        onChange={(e) => setEditForm({ ...editForm, rr: e.target.value })}
                        disabled={editForm.status === "pending"}
                        className={`w-full p-3 rounded-xl border ${
                          editForm.status === "pending"
                            ? "bg-gray-200 dark:bg-gray-700 cursor-not-allowed"
                            : isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                        } focus:ring-2 focus:ring-indigo-500 outline-none`}
                      />
                    </div>
                  </div>

                  {/* Status */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Status</label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                      className={`w-full p-3 rounded-xl border ${
                        isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                      } focus:ring-2 focus:ring-indigo-500 outline-none`}
                    >
                      <option value="executed">Executed</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>

                  {/* Confluences */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Confluences</label>
                    <ConfluenceTags
                      tags={editForm.confluences}
                      onChange={(newTags) => setEditForm({ ...editForm, confluences: newTags })}
                    />
                  </div>

                  {/* Screenshot URL */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Screenshot URL</label>
                    <input
                      type="url"
                      value={editForm.screenshotUrl}
                      onChange={(e) => setEditForm({ ...editForm, screenshotUrl: e.target.value })}
                      placeholder="https://i.imgur.com/your-image.png"
                      className={`w-full p-3 rounded-xl border ${
                        isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                      } focus:ring-2 focus:ring-indigo-500 outline-none`}
                    />
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Notes</label>
                    <textarea
                      value={editForm.notes}
                      onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                      className={`w-full p-3 rounded-xl border min-h-[80px] ${
                        isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                      } focus:ring-2 focus:ring-indigo-500 outline-none`}
                      placeholder="What did you learn from this trade?"
                    />
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-4 pt-4">
                    <Button
                      type="submit"
                      style={{ backgroundColor: ac.hex }}
                      className="flex-1 hover:brightness-110 text-white"
                    >
                      Save Changes
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditModalOpen(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation */}
        {deleteModalOpen && (
          <DeleteConfirmModal
            isOpen={deleteModalOpen}
            onClose={() => {
              setDeleteModalOpen(false);
              setTradeToDelete(null);
            }}
            onConfirm={() => deleteTrade(tradeToDelete)}
            title="Delete Trade"
            message="Are you sure you want to delete this trade? This action cannot be undone."
          />
        )}
      </div>
    </div>
  );
}
