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
  Upload,
  X,
  FileText,
  Edit,
  Check,
  AlertCircle,
  PlusCircle,
  Tag,
  BarChart3,
  TrendingUp,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import DeleteConfirmModal from "../components/ui/DeleteConfirmModal";
import CsvImportModal from "../components/ui/CsvImportModal";
import { GradingSummary, MistakePicker, StarRating } from "../components/ui/TradeGrading";
import useAccent from "../hooks/useAccent";
import AccentPicker from "../components/ui/AccentPicker";
import {
  POS_T,
  NEG_T,
  MUTED,
  HEAD,
  DIVIDER,
  CARD,
  PANEL,
  FIELD,
  FOCUS,
} from "../lib/uiTokens";
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

const POS = POS_T;
const NEG = NEG_T;
const toneOf = (n) => (n > 0 ? POS : n < 0 ? NEG : HEAD);

const Panel = ({ title, action, children, className = "" }) => (
  <div className={`${CARD} ${className}`}>
    {title && (
      <div className={`flex items-center justify-between border-b px-4 py-3 ${DIVIDER}`}>
        <h3 className={`text-[15px] font-semibold ${HEAD}`}>{title}</h3>
        {action}
      </div>
    )}
    <div className="p-4">{children}</div>
  </div>
);

const Kpi = ({ label, value, sub, tone }) => (
  <div className={`${CARD} p-4`}>
    <div className={`text-[11px] font-medium ${MUTED}`}>{label}</div>
    <div className={`mt-1 text-xl font-bold tabular-nums sm:text-2xl ${tone || HEAD}`}>
      {value}
    </div>
    {sub && <div className={`mt-1 text-xs ${MUTED}`}>{sub}</div>}
  </div>
);

const StatRow = ({ label, value, tone }) => (
  <div className={`flex items-center justify-between border-b py-2 text-sm last:border-0 ${DIVIDER}`}>
    <span className={MUTED}>{label}</span>
    <span className={`font-semibold tabular-nums ${tone || HEAD}`}>{value}</span>
  </div>
);

const Donut = ({ wins, losses, be }) => {
  const total = wins + losses + be;
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const segs = [
    { v: wins, col: "#22c493" },
    { v: be, col: "#94a3b8" },
    { v: losses, col: "#f2556e" },
  ];
  return (
    <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90 shrink-0">
      <circle cx="50" cy="50" r={r} fill="none" strokeWidth="10" stroke="currentColor" className="text-[#e6e8f2] dark:text-[#262645]" />
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
  const nav = `rounded-lg border p-1.5 ${DIVIDER} ${MUTED} transition-colors hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a]`;

  return (
    <Panel
      title={`${month.toLocaleString("en-US", { month: "long", year: "numeric" })} · ${money(monthTotal, true)}`}
      action={
        <div className="flex gap-1.5">
          <button type="button" className={nav} onClick={() => onMonth(new Date(y, m - 1, 1))} aria-label="Previous month">
            <ChevronLeft size={16} />
          </button>
          <button type="button" className={nav} onClick={() => onMonth(new Date(y, m + 1, 1))} aria-label="Next month">
            <ChevronRight size={16} />
          </button>
        </div>
      }
    >
      <div className={`mb-1.5 grid grid-cols-8 gap-1.5 text-center text-[10px] font-semibold uppercase tracking-wider ${MUTED}`}>
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
                  ? `${DIVIDER} ${MUTED} opacity-70`
                  : rec.pnl > 0
                  ? "border-[#22c493]/30 bg-[#22c493]/10"
                  : rec.pnl < 0
                  ? "border-[#f2556e]/30 bg-[#f2556e]/10"
                  : "border-amber-500/30 bg-amber-500/10";
                return (
                  <button
                    key={di}
                    type="button"
                    onClick={() => rec && onPick(keyOf(d))}
                    className={`min-h-[60px] rounded-lg border p-1.5 text-left transition ${tone} ${
                      selected === keyOf(d) ? "ring-2 ring-[#6C47FF]" : ""
                    } ${rec ? "cursor-pointer hover:brightness-110" : "cursor-default"}`}
                  >
                    <div className={`text-[11px] ${MUTED}`}>{d}</div>
                    {rec && (
                      <>
                        <div className={`text-xs font-semibold tabular-nums ${toneOf(rec.pnl)}`}>
                          {money(rec.pnl, true)}
                        </div>
                        <div className={`text-[10px] ${MUTED}`}>
                          {rec.count} trade{rec.count > 1 ? "s" : ""}
                        </div>
                      </>
                    )}
                  </button>
                );
              })}
              <div className={`flex min-h-[60px] flex-col justify-center rounded-lg border p-1.5 text-center ${DIVIDER}`}>
                {weekCount > 0 ? (
                  <>
                    <div className={`text-xs font-semibold tabular-nums ${toneOf(weekTotal)}`}>{money(weekTotal, true)}</div>
                    <div className={`text-[10px] ${MUTED}`}>{weekCount} trades</div>
                  </>
                ) : (
                  <div className={`text-[11px] ${MUTED}`}>—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
};

const ConfluenceTags = ({ tags, onChange, accent = "#6C47FF" }) => {
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
    onChange(tags.filter((tag) => tag !== tagToRemove));
  };

  return (
    <div className="space-y-2">
      <div className={`flex min-h-[48px] flex-wrap items-center gap-2 rounded-lg border p-2 ${DIVIDER} bg-white dark:bg-[#101024]`}>
        {tags.map((tag, idx) => (
          <span
            key={idx}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold"
            style={{ backgroundColor: `${accent}22`, color: accent }}
          >
            <Tag size={11} />
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="ml-0.5 opacity-70 hover:opacity-100"
              aria-label={`Remove ${tag}`}
            >
              <X size={13} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? "Type a confluence and press Enter" : ""}
          className="min-w-[120px] flex-1 border-none bg-transparent p-1 text-sm outline-none"
        />
      </div>
      <p className={`text-xs ${MUTED}`}>Press Enter or comma to add a tag</p>
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
    strategy: "",
    playbookId: "",
    playbook: "",
    rating: 0,
    mistakes: [],
    openDateTime: "",
    closeDateTime: "",
  });
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [tradeToDelete, setTradeToDelete] = useState(null);
  const [user, setUser] = useState(null);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [playbooks, setPlaybooks] = useState([]);

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

  // Playbooks available for linking in the edit modal.
  useEffect(() => {
    const accountId = currentAccount?.id;
    if (!user || !accountId) {
      setPlaybooks([]);
      return undefined;
    }
    let cancelled = false;
    getDocs(collection(db, "users", user.uid, "accounts", accountId, "playbooks"))
      .then((snap) => {
        if (!cancelled) setPlaybooks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentAccount?.id, user]);

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
          t.confluences?.some((c) => c.toLowerCase().includes(q))
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
    let run = 0,
      peak = 0,
      maxDD = 0,
      curW = 0,
      curL = 0,
      maxW = 0,
      maxL = 0;
    const equity = chrono.map((t) => {
      const p = pnlOf(t);
      run += p;
      peak = Math.max(peak, run);
      maxDD = Math.max(maxDD, peak - run);
      if (p > 0) {
        curW += 1;
        curL = 0;
      } else if (p < 0) {
        curL += 1;
        curW = 0;
      } else {
        curW = 0;
        curL = 0;
      }
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
      strategy: trade.strategy || "",
      playbookId: trade.playbookId || "",
      playbook: trade.playbook || "",
      rating: Number(trade.rating) || 0,
      mistakes: trade.mistakes || [],
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
        playbook: playbooks.find((p) => p.id === editForm.playbookId)?.name || "",
        strategy:
          (editForm.strategy || "").trim() ||
          playbooks.find((p) => p.id === editForm.playbookId)?.name ||
          "",
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
      await deleteDoc(doc(db, "users", user.uid, "accounts", currentAccount.id, "trades", id));
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
      "Playbook",
      "Strategy",
      "Confluences",
      "Rating",
      "Mistakes",
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
      t.playbook || "",
      t.strategy || "",
      (t.confluences || []).join("; "),
      Number(t.rating) || "",
      (t.mistakes || []).join("; "),
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
        const newRef = doc(collection(db, "users", user.uid, "accounts", currentAccount.id, "trades"));
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
      <div className="flex min-h-screen w-full items-center justify-center bg-[#f4f5fa] p-8 dark:bg-[#0b0b19]">
        <Card className={`${CARD} max-w-md p-8 text-center`}>
          <AlertCircle size={40} className="mx-auto mb-4 text-amber-500" />
          <h2 className={`mb-2 text-xl font-bold ${HEAD}`}>No account selected</h2>
          <p className={`text-sm ${MUTED}`}>
            Please create or select an account from the sidebar to view your trades.
          </p>
        </Card>
      </div>
    );
  }

  const grid = isDark ? "rgba(148,163,184,0.12)" : "rgba(100,116,139,0.15)";
  const tick = isDark ? "#8a8fb5" : "#6b7090";
  const pfText = analytics.profitFactor === Infinity ? "∞" : analytics.profitFactor.toFixed(2);
  const payoffText = analytics.payoff === Infinity ? "∞" : analytics.payoff.toFixed(2);
  const dailyKeys = Object.keys(analytics.daily).sort().slice(-30);
  const inputCls = `h-10 rounded-lg border ${DIVIDER} bg-white dark:bg-[#101024] px-3 text-sm outline-none focus:ring-2 focus:ring-[#6C47FF] text-[#14142b] dark:text-[#e8e9f7]`;

  return (
    <div className="min-h-screen w-full bg-[#f4f5fa] p-3 text-[#14142b] transition-colors dark:bg-[#0b0b19] dark:text-[#e8e9f7] sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1600px] space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className={`text-2xl font-bold tracking-tight sm:text-3xl ${HEAD}`}>{currentAccount.name}</h1>
            <p className={`mt-1 text-sm ${MUTED}`}>Performance dashboard · trade log · analytics</p>
            {selectedDate && (
              <button
                type="button"
                onClick={() => setSearchParams({})}
                className={`mt-2 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-medium ${DIVIDER} ${MUTED} hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${FOCUS}`}
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
              className="font-semibold text-white hover:brightness-110"
            >
              <PlusCircle size={16} className="mr-2" /> Add trade
            </Button>
            <Button
              onClick={() => setCsvModalOpen(true)}
              variant="outline"
              className={`border ${DIVIDER} font-semibold`}
            >
              <Upload size={16} className="mr-2" /> Import CSV
            </Button>
            <Button
              onClick={exportCSV}
              disabled={!filteredTrades.length || loading}
              variant="outline"
              className={`border ${DIVIDER} font-semibold disabled:opacity-50`}
            >
              <Download size={16} className="mr-2" /> Export
            </Button>
            <Button onClick={migrateOldTrades} variant="outline" className={`border ${DIVIDER} font-semibold`}>
              Migrate
            </Button>
          </div>
        </div>

        {/* Feedback */}
        {message.text && (
          <div
            role={message.type === "error" ? "alert" : "status"}
            className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium ${
              message.type === "success"
                ? "border-[#22c493]/30 bg-[#22c493]/10 text-[#0e9f77] dark:text-[#2dd4a0]"
                : "border-[#f2556e]/30 bg-[#f2556e]/10 text-[#d93a57] dark:text-[#ff6b86]"
            }`}
          >
            {message.type === "success" ? <Check size={16} /> : <AlertCircle size={16} />}
            {message.text}
          </div>
        )}

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi
            label="Net P&L"
            value={money(analytics.net, true)}
            tone={toneOf(analytics.net)}
            sub={`${analytics.total} closed${analytics.pending ? ` · ${analytics.pending} pending` : ""}`}
          />
          <Kpi
            label="Win rate"
            value={`${analytics.winRate.toFixed(1)}%`}
            sub={`${analytics.wins}W · ${analytics.be}BE · ${analytics.losses}L`}
          />
          <Kpi label="Profit factor" value={pfText} sub={`${money(analytics.grossWin)} / ${money(analytics.grossLoss)}`} />
          <Kpi label="Avg win / loss" value={payoffText} sub={`${money(analytics.avgWin)} / ${money(analytics.avgLoss)}`} />
          <Kpi label="Expectancy" value={money(analytics.expectancy, true)} tone={toneOf(analytics.expectancy)} sub="per trade" />
          <Kpi
            label="Max drawdown"
            value={analytics.maxDD ? money(-analytics.maxDD) : "$0.00"}
            tone={analytics.maxDD ? NEG : undefined}
            sub="peak to trough"
          />
        </div>

        {/* Equity curve + win breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Panel className="lg:col-span-2" title="Equity curve" action={<TrendingUp size={16} style={{ color: ac.hex }} />}>
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
              <div className={`flex h-64 items-center justify-center text-sm ${MUTED}`}>
                Close a trade to start your equity curve
              </div>
            )}
          </Panel>

          <Panel title="Win / loss breakdown">
            <div className="flex items-center gap-5">
              <div className="relative">
                <Donut wins={analytics.wins} losses={analytics.losses} be={analytics.be} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className={`text-xl font-semibold tabular-nums ${HEAD}`}>{analytics.winRate.toFixed(0)}%</div>
                  <div className={`text-[10px] uppercase tracking-wider ${MUTED}`}>win rate</div>
                </div>
              </div>
              <div className="flex-1 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className={MUTED}>Wins</span>
                  <span className={POS}>{analytics.wins}</span>
                </div>
                <div className="flex justify-between">
                  <span className={MUTED}>Break-even</span>
                  <span className={HEAD}>{analytics.be}</span>
                </div>
                <div className="flex justify-between">
                  <span className={MUTED}>Losses</span>
                  <span className={NEG}>{analytics.losses}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                ["Long", analytics.long],
                ["Short", analytics.short],
              ].map(([name, sd]) => (
                <div key={name} className={`rounded-lg border p-3 ${DIVIDER}`}>
                  <div className={`text-[11px] font-medium ${MUTED}`}>{name}</div>
                  <div className={`mt-1 text-base font-bold tabular-nums ${toneOf(sd.pnl)}`}>{money(sd.pnl, true)}</div>
                  <div className={`text-xs ${MUTED}`}>
                    {sd.count} trades · {sd.winRate.toFixed(0)}% win
                  </div>
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
                        backgroundColor: dailyKeys.map((k) => (analytics.daily[k].pnl >= 0 ? "#22c493" : "#f2556e")),
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
                        backgroundColor: pairPnL.map((x) => (x.pnl >= 0 ? "#22c493" : "#f2556e")),
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
            <h2 className={`text-[15px] font-semibold ${HEAD}`}>Trade log</h2>
            <span className={`text-xs ${MUTED}`}>{filteredTrades.length} trades</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className={`relative flex items-center gap-2 rounded-lg border px-3 py-2 ${DIVIDER} bg-white dark:bg-[#15152b]`}>
              <Search size={15} className={MUTED} />
              <input
                type="text"
                placeholder="Search pair, notes, tags…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48 bg-transparent text-sm outline-none sm:w-60"
              />
            </div>
            <input
              type="date"
              value={selectedDate || ""}
              onChange={(e) => setSearchParams(e.target.value ? { date: e.target.value } : {})}
              className={inputCls}
              aria-label="Filter by date"
            />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className={inputCls} aria-label="Sort trades">
              <option value="date-desc">Newest first</option>
              <option value="date-asc">Oldest first</option>
              <option value="pnl-desc">Highest P&L</option>
              <option value="pnl-asc">Lowest P&L</option>
              <option value="pair">Pair A–Z</option>
            </select>
          </div>
        </div>

        {/* Trades List */}
        {loading ? (
          <div className="flex h-72 items-center justify-center">
            <div
              className="h-10 w-10 animate-spin rounded-full border-2 border-[#e6e8f2] dark:border-[#262645]"
              style={{ borderTopColor: ac.hex }}
              role="progressbar"
              aria-label="Loading trades"
            />
          </div>
        ) : error ? (
          <Card className={`${CARD} p-8 text-center`}>
            <AlertCircle size={32} className="mx-auto mb-3 text-amber-500 opacity-80" />
            <p className={`text-sm font-medium ${MUTED}`}>{error}</p>
          </Card>
        ) : filteredTrades.length === 0 ? (
          <Card className={`${CARD} p-10 text-center`}>
            <AlertCircle size={36} className="mx-auto mb-3 text-amber-500 opacity-80" />
            <p className={`text-lg font-semibold ${HEAD}`}>No trades yet in {currentAccount.name}</p>
            <p className={`mb-5 mt-1 text-sm ${MUTED}`}>Start building your performance history.</p>
            <div className="flex flex-col justify-center gap-2.5 sm:flex-row">
              <Button
                style={{ backgroundColor: ac.hex }}
                className="font-semibold text-white hover:brightness-110"
                onClick={() => navigate("/trades/new")}
              >
                <PlusCircle size={16} className="mr-2" />
                Add new trade
              </Button>
              <Button
                variant="outline"
                className={`border ${DIVIDER} font-semibold`}
                onClick={() => setCsvModalOpen(true)}
              >
                <Upload size={16} className="mr-2" />
                Import CSV
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredTrades.map((trade) => {
              const pending = trade.status === "pending";
              const pnl = Number(trade.pnl || 0);
              return (
                <Card key={trade.id} className={`${CARD} overflow-hidden p-0`}>
                  <div className="flex flex-col justify-between gap-4 p-4 lg:flex-row lg:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-3">
                        <div
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                          style={{
                            backgroundColor: pending
                              ? "rgba(245,158,11,0.14)"
                              : pnl >= 0
                              ? "rgba(34,196,147,0.14)"
                              : "rgba(242,85,110,0.14)",
                            color: pending ? "#b45309" : pnl >= 0 ? "#0e9f77" : "#d93a57",
                          }}
                        >
                          {trade.pair?.slice(0, 2) || "?"}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-[15px] font-semibold ${HEAD}`}>
                              {trade.pair || "—"} · {trade.direction || "—"}
                            </span>
                            {pending && (
                              <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-[#b45309] dark:text-[#fbbf24]">
                                Pending
                              </span>
                            )}
                            {Number(trade.rating) > 0 && (
                              <StarRating value={trade.rating} accent={ac.hex} readOnly size={12} />
                            )}
                            {trade.mistakes?.length > 0 && (
                              <span className="rounded-md bg-[#f2556e]/10 px-2 py-0.5 text-[11px] font-semibold text-[#d93a57] dark:text-[#ff6b86]">
                                {trade.mistakes.length} mistake{trade.mistakes.length === 1 ? "" : "s"}
                              </span>
                            )}
                          </div>
                          <div className={`mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs ${MUTED}`}>
                            <span>Open: {trade.openDateTime ? new Date(trade.openDateTime).toLocaleString() : "—"}</span>
                            {!pending && trade.closeDateTime && (
                              <span>Close: {new Date(trade.closeDateTime).toLocaleString()}</span>
                            )}
                            <span>Lot: {trade.lotSize || "—"}</span>
                            {!pending && trade.rr && <span>R:R {trade.rr}</span>}
                          </div>
                        </div>
                      </div>

                      {trade.confluences?.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {trade.confluences.map((conf, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold"
                              style={{ backgroundColor: `${ac.hex}1f`, color: ac.hex }}
                            >
                              <Tag size={11} />
                              {conf}
                            </span>
                          ))}
                        </div>
                      )}

                      {trade.notes && (
                        <div className={`mt-2 line-clamp-2 text-sm ${MUTED}`}>
                          <FileText size={13} className="mr-1 inline" />
                          {trade.notes}
                        </div>
                      )}

                      {trade.screenshotUrl && (
                        <a
                          href={trade.screenshotUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-block"
                        >
                          <img
                            src={trade.screenshotUrl}
                            alt="Chart"
                            className={`h-16 w-16 rounded-lg border object-cover transition hover:opacity-80 ${DIVIDER}`}
                          />
                        </a>
                      )}
                    </div>

                    <div className="flex w-full items-center justify-between gap-6 lg:w-auto lg:justify-end">
                      <div className="text-left sm:min-w-[100px] sm:text-right">
                        {pending ? (
                          <div className="text-lg font-bold text-[#b45309] dark:text-[#fbbf24]">Pending</div>
                        ) : (
                          <>
                            <div className={`text-xl font-bold tabular-nums ${pnl >= 0 ? POS : NEG}`}>
                              {money(pnl, true)}
                            </div>
                            {trade.rr && <div className={`text-xs ${MUTED}`}>R:R {trade.rr}</div>}
                          </>
                        )}
                      </div>

                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setSelectedTrade(trade)}
                          aria-label="View trade"
                          className={`rounded-lg border p-2 ${DIVIDER} ${MUTED} transition-colors hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${FOCUS}`}
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => openEdit(trade)}
                          aria-label="Edit trade"
                          className={`rounded-lg border p-2 ${DIVIDER} ${MUTED} transition-colors hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${FOCUS}`}
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => {
                            setTradeToDelete(trade);
                            setDeleteModalOpen(true);
                          }}
                          aria-label="Delete trade"
                          className={`rounded-lg border border-[#f2556e]/40 p-2 text-[#d93a57] transition-colors hover:bg-[#f2556e]/10 dark:text-[#ff6b86] ${FOCUS}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* View Details Modal */}
        {selectedTrade && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-[#e6e8f2] bg-white text-[#14142b] shadow-2xl dark:border-[#262645] dark:bg-[#15152b] dark:text-white">
              <div className={`flex items-center justify-between border-b px-4 py-3 ${DIVIDER}`}>
                <h2 className={`text-[15px] font-semibold ${HEAD}`}>Trade details</h2>
                <button
                  onClick={() => setSelectedTrade(null)}
                  aria-label="Close"
                  className={`rounded-md p-1.5 ${MUTED} hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${FOCUS}`}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="max-h-[75vh] overflow-y-auto p-4 sm:p-5">
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div className="space-y-3.5">
                    {[
                      ["Pair & direction", `${selectedTrade.pair || "—"} · ${selectedTrade.direction || "—"}`],
                      ["Open date & time", selectedTrade.openDateTime ? new Date(selectedTrade.openDateTime).toLocaleString() : "—"],
                      ["Close date & time", selectedTrade.closeDateTime ? new Date(selectedTrade.closeDateTime).toLocaleString() : selectedTrade.status === "pending" ? "Pending" : "—"],
                      ["Entry", selectedTrade.entry || "—"],
                      ["Exit", selectedTrade.status === "pending" ? "Pending" : selectedTrade.exit || "—"],
                      ["Stop loss", selectedTrade.stopLoss || "—"],
                      ["Take profit", selectedTrade.takeProfit || "—"],
                      ["Risk : reward", selectedTrade.status === "pending" ? "—" : selectedTrade.rr || "—"],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <div className={`text-[11px] font-medium ${MUTED}`}>{label}</div>
                        <div className={`mt-0.5 text-sm font-semibold ${HEAD}`}>{value}</div>
                      </div>
                    ))}

                    <div>
                      <div className={`text-[11px] font-medium ${MUTED}`}>Status</div>
                      <div className={`mt-0.5 text-sm font-semibold ${selectedTrade.status === "pending" ? "text-[#b45309] dark:text-[#fbbf24]" : POS}`}>
                        {selectedTrade.status === "pending" ? "Pending" : "Executed"}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className={`rounded-xl border p-4 ${DIVIDER}`}>
                      <div className={`text-[11px] font-medium ${MUTED}`}>Profit & loss</div>
                      <div
                        className={`mt-1 text-3xl font-bold tabular-nums ${
                          selectedTrade.status === "pending"
                            ? MUTED
                            : Number(selectedTrade.pnl || 0) >= 0
                            ? POS
                            : NEG
                        }`}
                      >
                        {selectedTrade.status === "pending" ? "Pending" : money(Number(selectedTrade.pnl || 0), true)}
                      </div>
                    </div>

                    {(Number(selectedTrade.rating) > 0 || selectedTrade.mistakes?.length > 0) && (
                      <div className={`rounded-xl border p-4 ${DIVIDER}`}>
                        <GradingSummary
                          rating={selectedTrade.rating}
                          mistakes={selectedTrade.mistakes}
                          accent={ac.hex}
                        />
                      </div>
                    )}

                    {selectedTrade.confluences?.length > 0 && (
                      <div>
                        <div className={`mb-2 text-[11px] font-medium ${MUTED}`}>Confluences</div>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedTrade.confluences.map((conf, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center rounded-md px-2 py-1 text-[11px] font-semibold"
                              style={{ backgroundColor: `${ac.hex}1f`, color: ac.hex }}
                            >
                              {conf}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedTrade.notes && (
                      <div>
                        <div className={`mb-2 flex items-center gap-1.5 text-[11px] font-medium ${MUTED}`}>
                          <FileText size={13} /> Notes
                        </div>
                        <div className={`whitespace-pre-wrap rounded-xl border p-3 text-sm ${DIVIDER} ${PANEL}`}>
                          {selectedTrade.notes}
                        </div>
                      </div>
                    )}

                    {selectedTrade.screenshotUrl && (
                      <div>
                        <div className={`mb-2 text-[11px] font-medium ${MUTED}`}>Chart</div>
                        <a href={selectedTrade.screenshotUrl} target="_blank" rel="noopener noreferrer">
                          <img
                            src={selectedTrade.screenshotUrl}
                            alt="Chart"
                            className={`max-h-48 rounded-lg border ${DIVIDER}`}
                          />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className={`flex justify-end gap-2 border-t px-4 py-3 ${DIVIDER}`}>
                <Button variant="outline" onClick={() => openEdit(selectedTrade)} className={`border ${DIVIDER} font-semibold`}>
                  <Edit size={15} className="mr-2" /> Edit trade
                </Button>
                <Button variant="outline" onClick={() => setSelectedTrade(null)} className={`border ${DIVIDER} font-semibold`}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editModalOpen && editingTrade && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[#e6e8f2] bg-white text-[#14142b] shadow-2xl dark:border-[#262645] dark:bg-[#15152b] dark:text-white">
              <div className={`flex items-center justify-between border-b px-4 py-3 ${DIVIDER}`}>
                <h2 className={`text-[15px] font-semibold ${HEAD}`}>Edit trade</h2>
                <button
                  onClick={() => setEditModalOpen(false)}
                  aria-label="Close"
                  className={`rounded-md p-1.5 ${MUTED} hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${FOCUS}`}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={saveEdit} className="max-h-[80vh] space-y-4 overflow-y-auto p-4 sm:p-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Pair</label>
                    <input
                      value={editForm.pair}
                      onChange={(e) => setEditForm({ ...editForm, pair: e.target.value })}
                      className={FIELD}
                    />
                  </div>
                  <div>
                    <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Direction</label>
                    <select
                      value={editForm.direction}
                      onChange={(e) => setEditForm({ ...editForm, direction: e.target.value })}
                      className={FIELD}
                    >
                      <option value="Long">Long</option>
                      <option value="Short">Short</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Open date / time</label>
                    <input
                      type="datetime-local"
                      value={editForm.openDateTime}
                      onChange={(e) => setEditForm({ ...editForm, openDateTime: e.target.value })}
                      className={FIELD}
                    />
                  </div>
                  <div>
                    <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Close date / time</label>
                    <input
                      type="datetime-local"
                      value={editForm.closeDateTime}
                      onChange={(e) => setEditForm({ ...editForm, closeDateTime: e.target.value })}
                      disabled={editForm.status === "pending"}
                      className={`${FIELD} disabled:cursor-not-allowed disabled:opacity-60`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Entry</label>
                    <input
                      type="number"
                      step="0.00001"
                      value={editForm.entry}
                      onChange={(e) => setEditForm({ ...editForm, entry: e.target.value })}
                      className={FIELD}
                    />
                  </div>
                  <div>
                    <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Exit</label>
                    <input
                      type="number"
                      step="0.00001"
                      value={editForm.exit}
                      onChange={(e) => setEditForm({ ...editForm, exit: e.target.value })}
                      disabled={editForm.status === "pending"}
                      className={`${FIELD} disabled:cursor-not-allowed disabled:opacity-60`}
                    />
                  </div>
                  <div>
                    <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>PnL</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.pnl}
                      onChange={(e) => setEditForm({ ...editForm, pnl: e.target.value })}
                      disabled={editForm.status === "pending"}
                      className={`${FIELD} disabled:cursor-not-allowed disabled:opacity-60`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Stop loss</label>
                    <input
                      type="number"
                      step="0.00001"
                      value={editForm.stopLoss}
                      onChange={(e) => setEditForm({ ...editForm, stopLoss: e.target.value })}
                      className={FIELD}
                    />
                  </div>
                  <div>
                    <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Take profit</label>
                    <input
                      type="number"
                      step="0.00001"
                      value={editForm.takeProfit}
                      onChange={(e) => setEditForm({ ...editForm, takeProfit: e.target.value })}
                      className={FIELD}
                    />
                  </div>
                  <div>
                    <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>R:R</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editForm.rr}
                      onChange={(e) => setEditForm({ ...editForm, rr: e.target.value })}
                      disabled={editForm.status === "pending"}
                      className={`${FIELD} disabled:cursor-not-allowed disabled:opacity-60`}
                    />
                  </div>
                </div>

                <div>
                  <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className={FIELD}
                  >
                    <option value="executed">Executed</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>

                <div>
                  <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Playbook</label>
                  <select
                    value={editForm.playbookId || ""}
                    onChange={(e) => setEditForm({ ...editForm, playbookId: e.target.value })}
                    className={FIELD}
                  >
                    <option value="">No playbook</option>
                    {playbooks.map((playbook) => (
                      <option key={playbook.id} value={playbook.id}>
                        {playbook.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Strategy / playbook</label>
                  <input
                    type="text"
                    value={editForm.strategy || ""}
                    onChange={(e) => setEditForm({ ...editForm, strategy: e.target.value })}
                    placeholder="e.g. London breakout"
                    list="forge-strategies-edit"
                    className={FIELD}
                  />
                  <datalist id="forge-strategies-edit">
                    <option value="London breakout" />
                    <option value="Asian range breakout" />
                    <option value="Liquidity sweep" />
                    <option value="Trend continuation" />
                    <option value="Support/Resistance reversal" />
                    <option value="News" />
                  </datalist>
                </div>

                <div>
                  <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Confluences</label>
                  <ConfluenceTags
                    tags={editForm.confluences}
                    accent={ac.hex}
                    onChange={(newTags) => setEditForm({ ...editForm, confluences: newTags })}
                  />
                </div>

                <div>
                  <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Trade rating</label>
                  <StarRating
                    value={Number(editForm.rating) || 0}
                    onChange={(value) => setEditForm({ ...editForm, rating: value })}
                    accent={ac.hex}
                    size={22}
                  />
                </div>

                <div>
                  <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Mistakes</label>
                  <MistakePicker
                    value={editForm.mistakes || []}
                    onChange={(next) => setEditForm({ ...editForm, mistakes: next })}
                    accent={ac.hex}
                  />
                </div>

                <div>
                  <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Screenshot URL</label>
                  <input
                    type="url"
                    value={editForm.screenshotUrl}
                    onChange={(e) => setEditForm({ ...editForm, screenshotUrl: e.target.value })}
                    placeholder="https://i.imgur.com/your-image.png"
                    className={FIELD}
                  />
                </div>

                <div>
                  <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Notes</label>
                  <textarea
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    className={`${FIELD} min-h-[80px] resize-y py-3`}
                    placeholder="What did you learn from this trade?"
                  />
                </div>

                <div className={`flex gap-2.5 border-t pt-4 ${DIVIDER}`}>
                  <Button
                    type="submit"
                    style={{ backgroundColor: ac.hex }}
                    className="flex-1 font-semibold text-white hover:brightness-110"
                  >
                    Save changes
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditModalOpen(false)}
                    className={`flex-1 border ${DIVIDER} font-semibold`}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* CSV Import Modal */}
        {csvModalOpen && (
          <CsvImportModal
            currentAccount={currentAccount}
            onClose={() => setCsvModalOpen(false)}
            onImported={(count) => {
              setCsvModalOpen(false);
              refreshTrades();
              setMessage({
                text: `Successfully imported ${count} trade${count === 1 ? "" : "s"}!`,
                type: "success",
              });
              setTimeout(() => setMessage({ text: "", type: "success" }), 4000);
            }}
          />
        )}

        {/* Delete Confirmation */}
        {deleteModalOpen && tradeToDelete && (
          <DeleteConfirmModal
            onConfirm={() => deleteTrade(tradeToDelete.id)}
            onCancel={() => {
              setDeleteModalOpen(false);
              setTradeToDelete(null);
            }}
            title="Delete trade?"
            message={`Are you sure you want to delete this ${tradeToDelete.pair || ""} trade? This cannot be undone.`}
          />
        )}
      </div>
    </div>
  );
}
