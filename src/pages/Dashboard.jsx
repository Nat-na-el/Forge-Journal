import React, { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
  subWeeks,
} from "date-fns";
import { Card } from "../components/ui/card";
import { useNavigate } from "react-router-dom";
import { syncMT5Account } from "../lib/mt5client";
import { useTheme } from "../Theme-provider";
import {
  TrendingUp,
  Activity,
  Zap,
  BarChart3,
  DollarSign,
  X,
  Lightbulb,
  AlertCircle,
  CheckCircle,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Palette,
  SlidersHorizontal,
  Target,
  LineChart as LineChartIcon,
  ChevronLeft,
  ChevronRight,
  Flame,
  Wallet,
  CalendarDays,
  Plus,
} from "lucide-react";
import {
  Chart as ChartJS,
  RadialLinearScale,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { Radar, Line, Bar, Doughnut } from "react-chartjs-2";
import { db, auth } from "../firebase";
import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  getDoc,
} from "firebase/firestore";

ChartJS.register(
  RadialLinearScale,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend
);

// ────────────────────────────────────────────────
// Design tokens – Tradezella-style surfaces
// ────────────────────────────────────────────────
const POS = "#22c493";
const NEG = "#f2556e";
const NEUTRAL = "#7c8cf8";

const POS_T = "text-[#0e9f77] dark:text-[#2dd4a0]";
const NEG_T = "text-[#d93a57] dark:text-[#ff6b86]";
const MUTED = "text-[#6b7090] dark:text-[#8a8fb5]";
const HEAD = "text-[#14142b] dark:text-white";
const DIVIDER = "border-[#e6e8f2] dark:border-[#262645]";
const CARD =
  "gap-0 rounded-xl bg-white dark:bg-[#15152b] border border-[#e6e8f2] dark:border-[#262645] shadow-sm dark:shadow-none";
const PANEL =
  "rounded-xl border border-[#e6e8f2] dark:border-[#262645] bg-[#f7f8fc] dark:bg-[#101024]";
const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6C47FF]";

// Accent themes (the light / dark mode still follows the app theme)
const ACCENTS = {
  zella: { name: "Zella", hex: "#6C47FF", hex2: "#9b7bff" },
  indigo: { name: "Indigo", hex: "#6366f1", hex2: "#a855f7" },
  emerald: { name: "Emerald", hex: "#10b981", hex2: "#06b6d4" },
  cyan: { name: "Ocean", hex: "#06b6d4", hex2: "#3b82f6" },
  amber: { name: "Amber", hex: "#f59e0b", hex2: "#ef4444" },
  rose: { name: "Rose", hex: "#f43f5e", hex2: "#ec4899" },
};

const RADAR_LABELS = ["Win Rate", "Profit Factor", "Avg R:R", "Payoff", "Green Days", "Recovery"];

// Right-hand widget column: user-customisable, persisted locally.
const WIDGET_STORAGE_KEY = "forgexDashboardWidgets";
const DEFAULT_WIDGETS = { radar: true, balance: true, winrate: true, expectancy: true };
const WIDGET_OPTIONS = [
  { key: "radar", label: "Zella score radar", desc: "Edge score across six dimensions" },
  { key: "balance", label: "Account balance & P&L", desc: "Live equity, period and all-time P&L" },
  { key: "winrate", label: "Trade win %", desc: "Win / breakeven / loss split" },
  { key: "expectancy", label: "Trade expectancy", desc: "Average expected value per trade" },
];

// A trade's date, whichever field the page that saved it used
const tDate = (t) => t?.date || t?.openDateTime || t?.closeDateTime || "";

// ────────────────────────────────────────────────
// Small helpers
// ────────────────────────────────────────────────
const formatNumber = (num) => {
  if (num === undefined || num === null || Number.isNaN(Number(num))) return "0.00";
  return Number(num).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const money = (v, signed = true) => {
  const n = Number(v) || 0;
  const sign = n < 0 ? "-" : signed && n > 0 ? "+" : "";
  return `${sign}$${formatNumber(Math.abs(n))}`;
};

const pnlClass = (v) => (Number(v) >= 0 ? POS_T : NEG_T);

const fmtAxis = (v) => {
  const a = Math.abs(v);
  const s = a >= 1000 ? `${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k` : a;
  return `${v < 0 ? "-" : ""}$${s}`;
};

// ────────────────────────────────────────────────
// Animated number component
// ────────────────────────────────────────────────
const AnimatedNumber = ({ value, duration = 1200, decimals = 2 }) => {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplay(value);
      return undefined;
    }
    let raf;
    const start = performance.now();
    const step = (timestamp) => {
      const progress = Math.min((timestamp - start) / duration, 1);
      setDisplay(value * progress);
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <>
      {Number(display).toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </>
  );
};

// Half / full ring built on a doughnut chart
const Gauge = ({ values, colors, isDark, half = false }) => {
  const total = values.reduce((a, b) => a + b, 0);
  const empty = isDark ? "#262645" : "#e6e8f2";
  const data = {
    datasets: [
      {
        data: total ? values : [1],
        backgroundColor: total ? colors : [empty],
        borderWidth: 0,
        spacing: total ? 2 : 0,
        borderRadius: total ? 3 : 0,
      },
    ],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "78%",
    rotation: half ? -90 : 0,
    circumference: half ? 180 : 360,
    events: [],
    animation: { duration: 800 },
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
  };
  return <Doughnut data={data} options={options} />;
};

const Chip = ({ color, children }) => (
  <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums bg-[#f1f2f8] dark:bg-[#1e1e3a] text-[#3b3f5e] dark:text-[#c9ccea]">
    <i className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
    {children}
  </span>
);

const CardHead = ({ icon: Icon, title, sub, right, accent }) => (
  <div className={`flex items-start justify-between gap-3 border-b px-4 sm:px-5 py-3.5 ${DIVIDER}`}>
    <div className="min-w-0">
      <h3 className={`flex items-center gap-2 text-[15px] font-semibold ${HEAD}`}>
        {Icon && <Icon className="h-4 w-4 shrink-0" style={{ color: accent }} />}
        {title}
      </h3>
      {sub && <p className={`mt-0.5 text-xs ${MUTED}`}>{sub}</p>}
    </div>
    {right}
  </div>
);

const Kpi = ({ title, hint, badge, value, valueClass, visual, children }) => (
  <Card className={`${CARD} p-4`}>
    <div className="flex items-center justify-between gap-2">
      <span className={`text-[13px] font-medium ${MUTED}`} title={hint}>
        {title}
      </span>
      {badge}
    </div>
    <div className="mt-3 flex items-end justify-between gap-2">
      <div className={`text-[26px] leading-none font-bold tabular-nums ${valueClass}`}>{value}</div>
      {visual}
    </div>
    {children && <div className="mt-3.5">{children}</div>}
  </Card>
);

// Scores a list of trades on six axes (each 0–100) for the spider-web chart
function computeEdge(list) {
  const n = list.length;
  if (!n) return null;
  const sorted = [...list].sort((a, b) => new Date(a.date) - new Date(b.date));
  const pnls = sorted.map((t) => Number(t.pnl) || 0);
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p < 0);
  const grossW = wins.reduce((a, b) => a + b, 0);
  const grossL = Math.abs(losses.reduce((a, b) => a + b, 0));
  const net = grossW - grossL;

  const winRate = (wins.length / n) * 100;
  const pf = grossL ? grossW / grossL : grossW > 0 ? 3 : 0;
  const avgRR = sorted.reduce((a, t) => a + (Number(t.rr) || 0), 0) / n;
  const avgW = wins.length ? grossW / wins.length : 0;
  const avgL = losses.length ? grossL / losses.length : 0;
  const payoff = avgL ? avgW / avgL : avgW > 0 ? 3 : 0;

  const days = {};
  sorted.forEach((t) => {
    const k = String(t.date).slice(0, 10);
    days[k] = (days[k] || 0) + (Number(t.pnl) || 0);
  });
  const dayVals = Object.values(days);
  const greenDays = (dayVals.filter((v) => v > 0).length / dayVals.length) * 100;

  let cum = 0;
  let peak = 0;
  let maxDD = 0;
  pnls.forEach((p) => {
    cum += p;
    peak = Math.max(peak, cum);
    maxDD = Math.max(maxDD, peak - cum);
  });
  const recovery = maxDD ? net / maxDD : net > 0 ? 3 : 0;

  const cap = (v) => Math.min(100, Math.max(0, v));
  const scores = [
    cap(winRate),
    cap((pf / 3) * 100),
    cap((avgRR / 3) * 100),
    cap((payoff / 3) * 100),
    cap(greenDays),
    cap((recovery / 3) * 100),
  ];
  return {
    scores,
    edge: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    raw: [
      `${winRate.toFixed(0)}%`,
      pf >= 3 ? "3+" : pf.toFixed(2),
      avgRR.toFixed(2),
      payoff >= 3 ? "3+" : payoff.toFixed(2),
      `${greenDays.toFixed(0)}%`,
      recovery >= 3 ? "3+" : recovery.toFixed(2),
    ],
  };
}

// ────────────────────────────────────────────────
// Main Dashboard Component – Forgex
// ────────────────────────────────────────────────
export default function Dashboard({ currentAccount }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const navigate = useNavigate();

  const [trades, setTrades] = useState([]);
  const [accountMeta, setAccountMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewDate, setViewDate] = useState(new Date());
  const [showQuickAnalysis, setShowQuickAnalysis] = useState(false);
  const [bottomTab, setBottomTab] = useState("recent");
  const [widgetPanelOpen, setWidgetPanelOpen] = useState(false);
  const [widgets, setWidgets] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(WIDGET_STORAGE_KEY) || "null");
      return saved && typeof saved === "object" ? { ...DEFAULT_WIDGETS, ...saved } : DEFAULT_WIDGETS;
    } catch {
      return DEFAULT_WIDGETS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(widgets));
    } catch {}
  }, [widgets]);

  const toggleWidget = (key) => setWidgets((prev) => ({ ...prev, [key]: !prev[key] }));
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState({ text: "", type: "" });
  const [accent, setAccent] = useState(() => {
    try {
      const saved = localStorage.getItem("forgexAccent");
      return ACCENTS[saved] ? saved : "zella";
    } catch {
      return "zella";
    }
  });
  const [curveRange, setCurveRange] = useState("month");
  const ac = ACCENTS[accent] || ACCENTS.zella;

  useEffect(() => {
    try {
      localStorage.setItem("forgexAccent", accent);
    } catch {}
  }, [accent]);

  useEffect(() => {
    if (!showQuickAnalysis && !widgetPanelOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (widgetPanelOpen) setWidgetPanelOpen(false);
      else setShowQuickAnalysis(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showQuickAnalysis, widgetPanelOpen]);

  // ─── Fetch account metadata ───────────────────────────────────────
  const fetchAccountMeta = async (user, accountId) => {
    if (!user || !accountId) return null;
    try {
      const docRef = doc(db, "users", user.uid, "accounts", accountId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      }
    } catch (err) {
      console.error("Error fetching account meta:", err);
    }
    return null;
  };

  // ─── Fetch trades from the selected account's subcollection ───────
  const refreshTrades = async () => {
    const user = auth.currentUser;
    if (!user) {
      setTrades([]);
      setAccountMeta(null);
      setLoading(false);
      setError("Please log in to view dashboard data");
      return;
    }

    if (!currentAccount?.id) {
      setTrades([]);
      setAccountMeta(null);
      setLoading(false);
      setError("No account selected. Please create or select an account.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const meta = await fetchAccountMeta(user, currentAccount.id);
      setAccountMeta(meta);

      const q = query(
        collection(db, "users", user.uid, "accounts", currentAccount.id, "trades"),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(q);
      const loadedTrades = snapshot.docs.map((d) => {
        const data = d.data();
        const created = data.createdAt?.toDate?.();
        return {
          id: d.id,
          ...data,
          // works for trades saved with `date` or with openDateTime/closeDateTime
          date: tDate(data) || (created ? created.toISOString() : new Date().toISOString()),
        };
      });
      setTrades(loadedTrades);
    } catch (err) {
      console.error("❌ Dashboard fetch error:", err);
      setError("Failed to load trades. " + (err.message || "Check connection"));
      setTrades([]);
    } finally {
      setLoading(false);
    }
  };

  // ─── Sync trades from MT5 using stored credentials ─────────────────
  const syncFromMT5 = async () => {
    if (!currentAccount?.id) {
      setSyncMessage({ text: "No account selected", type: "error" });
      setTimeout(() => setSyncMessage({ text: "", type: "" }), 3000);
      return;
    }

    if (!currentAccount.mt5Connected) {
      setSyncMessage({
        text: "Please connect your MT5 account first (open the account menu and tap 'Connect MT5 account')",
        type: "error",
      });
      setTimeout(() => setSyncMessage({ text: "", type: "" }), 5000);
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setSyncMessage({ text: "Please log in first", type: "error" });
      setTimeout(() => setSyncMessage({ text: "", type: "" }), 3000);
      return;
    }

    setSyncing(true);
    setSyncMessage({ text: "Syncing trades from MT5...", type: "info" });

    try {
      // MetaApi-based sync (read-only investor connection). Never creates duplicates.
      const r = await syncMT5Account({ login: currentAccount.mt5Login, server: currentAccount.mt5Server });

      setSyncMessage({
        text: `Synced from MT5: ${r.added} new trade${r.added === 1 ? "" : "s"}, ${r.updated} updated.`,
        type: "success",
      });

      await refreshTrades();
    } catch (err) {
      console.error("Sync failed:", err);
      setSyncMessage({
        text: err.message || "Failed to sync trades from MT5",
        type: "error",
      });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage({ text: "", type: "" }), 5000);
    }
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        refreshTrades();
      } else {
        setTrades([]);
        setAccountMeta(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [currentAccount]);

  // ─── Calendar month navigation ───────────────────────────────
  const prevMonth = () => setViewDate((d) => subMonths(d, 1));
  const nextMonth = () => setViewDate((d) => addMonths(d, 1));
  const jumpTo = (y, m) => setViewDate(new Date(y, m - 1, 1));
  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);

  // ─── Monthly trades filtering & sorting ─────────────────────
  const monthlyTrades = useMemo(() => {
    return trades
      .filter((t) => {
        const td = new Date(t.date);
        return td >= monthStart && td <= monthEnd;
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [trades, viewDate]);

  // ─── Weekly trades for streak calculation ────────────────────
  const weeklyTrades = useMemo(() => {
    const ws = startOfWeek(new Date(), { weekStartsOn: 1 });
    const we = endOfWeek(new Date(), { weekStartsOn: 1 });
    return trades
      .filter((t) => {
        const td = new Date(t.date);
        return td >= ws && td <= we;
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [trades]);

  // ─── Current streak calculation ──────────────────────────────
  const currentStreak = useMemo(() => {
    let streak = { type: "None", count: 0 };
    let current = null;
    for (const trade of [...weeklyTrades].reverse()) {
      const pnl = Number(trade.pnl) || 0;
      if (pnl === 0) continue;
      if (current === null) {
        current = pnl > 0 ? "Win" : "Loss";
        streak = { type: current, count: 1 };
      } else if ((pnl > 0 && current === "Win") || (pnl < 0 && current === "Loss")) {
        streak.count += 1;
      } else {
        break;
      }
    }
    return streak;
  }, [weeklyTrades]);

  // ─── Monthly stats calculation (core metrics) ────────────────
  const monthlyStats = useMemo(() => {
    if (!monthlyTrades.length) {
      return {
        totalPnL: 0,
        winRate: "0.0",
        profitFactor: "—",
        expectancy: "0.00",
        winCount: 0,
        lossCount: 0,
        totalTrades: 0,
        avgPnL: "0.00",
        bestDayPnL: 0,
        bestDayDate: "—",
        worstDayPnL: 0,
        worstDayDate: "—",
        avgRR: "0.00",
        consistencyScore: 0,
      };
    }

    const profits = monthlyTrades
      .filter((t) => Number(t.pnl || 0) > 0)
      .reduce((a, b) => a + Number(b.pnl || 0), 0);
    const losses = monthlyTrades
      .filter((t) => Number(t.pnl || 0) < 0)
      .reduce((a, b) => a + Math.abs(Number(b.pnl || 0)), 0);
    const profitFactor = losses ? (profits / losses).toFixed(2) : "∞";
    const wins = monthlyTrades.filter((t) => Number(t.pnl || 0) > 0).length;
    const total = monthlyTrades.length;
    const winRate = ((wins / total) * 100).toFixed(1);
    const expectancy = (
      monthlyTrades.reduce((a, b) => a + Number(b.pnl || 0), 0) / total
    ).toFixed(2);
    const dailyPnL = {};
    monthlyTrades.forEach((t) => {
      const day = format(new Date(t.date), "yyyy-MM-dd");
      dailyPnL[day] = (dailyPnL[day] || 0) + Number(t.pnl || 0);
    });
    let bestDayPnL = 0;
    let bestDayDate = "—";
    let worstDayPnL = 0;
    let worstDayDate = "—";
    let bestWinningDayPnl = 0;

    if (Object.keys(dailyPnL).length > 0) {
      const entries = Object.entries(dailyPnL);
      const bestEntry = entries.reduce((max, curr) => (curr[1] > max[1] ? curr : max));
      const worstEntry = entries.reduce((min, curr) => (curr[1] < min[1] ? curr : min));
      bestDayPnL = bestEntry[1].toFixed(2);
      bestDayDate = format(new Date(bestEntry[0]), "dd MMM");
      worstDayPnL = worstEntry[1].toFixed(2);
      worstDayDate = format(new Date(worstEntry[0]), "dd MMM");

      const winningDays = entries.filter(([, pnl]) => pnl > 0);
      if (winningDays.length) {
        bestWinningDayPnl = Math.max(...winningDays.map(([, pnl]) => pnl));
      }
    }

    const totalRR = monthlyTrades.reduce((sum, t) => sum + (Number(t.rr) || 0), 0);
    const avgRR = total ? (totalRR / total).toFixed(2) : "0.00";

    const totalPnLNum = profits - losses;
    let consistencyScore = 0;
    if (totalPnLNum > 0 && bestWinningDayPnl > 0) {
      consistencyScore = Math.min(100, (bestWinningDayPnl / totalPnLNum) * 100);
    }

    return {
      totalPnL: totalPnLNum.toFixed(2),
      winRate,
      profitFactor,
      expectancy,
      winCount: wins,
      lossCount: total - wins,
      totalTrades: total,
      avgPnL: (monthlyTrades.reduce((a, b) => a + Number(b.pnl || 0), 0) / total).toFixed(2),
      bestDayPnL,
      bestDayDate,
      worstDayPnL,
      worstDayDate,
      avgRR,
      consistencyScore: consistencyScore.toFixed(1),
    };
  }, [monthlyTrades]);

  // ─── Detailed breakdown used by the gauges and the daily bar chart ───
  const perf = useMemo(() => {
    const pnls = monthlyTrades.map((t) => Number(t.pnl) || 0);
    const winsArr = pnls.filter((p) => p > 0);
    const lossArr = pnls.filter((p) => p < 0);
    const grossW = winsArr.reduce((a, b) => a + b, 0);
    const grossL = Math.abs(lossArr.reduce((a, b) => a + b, 0));
    const avgWin = winsArr.length ? grossW / winsArr.length : 0;
    const avgLoss = lossArr.length ? grossL / lossArr.length : 0;

    const dayMap = {};
    monthlyTrades.forEach((t) => {
      const k = format(new Date(t.date), "yyyy-MM-dd");
      dayMap[k] = (dayMap[k] || 0) + (Number(t.pnl) || 0);
    });
    const daily = Object.entries(dayMap)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, pnl]) => ({ key, label: format(new Date(key), "dd MMM"), pnl: Number(pnl.toFixed(2)) }));
    const greenDays = daily.filter((d) => d.pnl > 0).length;
    const redDays = daily.filter((d) => d.pnl < 0).length;
    const flatDays = daily.length - greenDays - redDays;

    return {
      wins: winsArr.length,
      losses: lossArr.length,
      breakeven: pnls.length - winsArr.length - lossArr.length,
      grossW,
      grossL,
      avgWin,
      avgLoss,
      payoff: avgLoss ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0,
      daily,
      greenDays,
      redDays,
      flatDays,
      dayWinRate: daily.length ? (greenDays / daily.length) * 100 : 0,
    };
  }, [monthlyTrades]);

  // ─── Monthly asset‑specific stats ─────────────────────────────
  const monthlyAssetStats = useMemo(() => {
    if (!monthlyTrades.length) {
      return { topPair: "—", topPairCount: 0, totalLots: 0, assetPnL: [] };
    }

    const pairCount = {};
    const pairPnL = {};
    let totalLots = 0;

    monthlyTrades.forEach((t) => {
      const pair = t.pair || "Unknown";
      pairCount[pair] = (pairCount[pair] || 0) + 1;
      pairPnL[pair] = (pairPnL[pair] || 0) + Number(t.pnl || 0);
      totalLots += Number(t.lotSize) || 0;
    });

    let topPair = "—";
    let maxCount = 0;
    Object.entries(pairCount).forEach(([p, c]) => {
      if (c > maxCount) {
        maxCount = c;
        topPair = p;
      }
    });

    const assetPnL = Object.entries(pairPnL)
      .map(([pair, pnl]) => ({ pair, pnl }))
      .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
      .slice(0, 5);

    return {
      topPair,
      topPairCount: maxCount,
      totalLots: totalLots.toFixed(2),
      assetPnL,
    };
  }, [monthlyTrades]);

  // ─── Weekly Wins/Losses/Breakeven (last 4 weeks) ───────────────
  const weeklyBreakdown = useMemo(() => {
    const weeks = [];
    const today = new Date();
    for (let i = 0; i < 4; i++) {
      const weekStart = startOfWeek(subWeeks(today, i), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const weekTrades = trades.filter((t) => {
        const td = new Date(t.date);
        return td >= weekStart && td <= weekEnd;
      });
      const wins = weekTrades.filter((t) => Number(t.pnl) > 0).length;
      const losses = weekTrades.filter((t) => Number(t.pnl) < 0).length;
      const breakeven = weekTrades.filter((t) => Number(t.pnl) === 0).length;
      const pnl = weekTrades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
      weeks.push({
        label: format(weekStart, "dd MMM"),
        wins,
        losses,
        breakeven,
        pnl,
        total: weekTrades.length,
      });
    }
    return weeks.reverse();
  }, [trades]);

  // ─── Trades grouped by date for calendar ─────────────────────
  const tradesByDate = useMemo(() => {
    return monthlyTrades.reduce((acc, t) => {
      const d = t.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
      if (!acc[d]) acc[d] = [];
      acc[d].push(t);
      return acc;
    }, {});
  }, [monthlyTrades]);

  // ─── Day summary helper ──────────────────────────────────────
  function daySummary(dateObj) {
    const key = format(dateObj, "yyyy-MM-dd");
    const list = tradesByDate[key] || [];
    if (!list.length) return null;
    const pnl = list.reduce((s, t) => s + Number(t.pnl || 0), 0);
    const count = list.length;
    const wins = list.filter((t) => Number(t.pnl || 0) > 0).length;
    const winRate = Math.round((wins / count) * 100) || 0;
    return { date: key, pnl, count, winRate };
  }

  // ─── Week summary helper ─────────────────────────────────────
  function weekSummary(weekArray) {
    const sums = weekArray.reduce(
      (acc, d) => {
        const ds = daySummary(d);
        if (!ds) return acc;
        acc.count += ds.count;
        acc.pnl += ds.pnl;
        acc.wins += Math.round((ds.winRate / 100) * ds.count);
        return acc;
      },
      { pnl: 0, count: 0, wins: 0 }
    );
    const winRate = sums.count ? Math.round((sums.wins / sums.count) * 100) : 0;
    return { pnl: +sums.pnl.toFixed(2), count: sums.count, winRate };
  }

  // ─── Calendar weeks generation ───────────────────────────────
  const calendarWeeks = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewDate), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(viewDate), { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start, end });
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }
    return weeks;
  }, [viewDate]);

  // ─── Open day detail ─────────────────────────────────────────
  const openDay = (dayObj) => {
    const formattedDate = format(dayObj, "yyyy-MM-dd");
    navigate("/trades?date=" + formattedDate);
  };

  // ─── Recent trades preview ───────────────────────────────────
  const recentTrades = useMemo(() => {
    return [...trades].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);
  }, [trades]);

  // ─── Open positions (trades that have not been closed yet) ────
  const openPositions = useMemo(() => {
    return [...trades]
      .filter((t) => /open|pending|active/i.test(String(t.status || "")))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [trades]);

  // ─── All-time total PnL ──────────────────────────────────────
  const allTimePnL = useMemo(() => {
    if (!trades.length) return 0;
    return trades.reduce((sum, t) => sum + Number(t.pnl || 0), 0).toFixed(2);
  }, [trades]);

  // ─── Account data ────────────────────────────────────────────
  const initialBalance = accountMeta?.starting_balance || 10000;
  const accountCreatedAt = accountMeta?.createdAt?.toDate?.() || new Date("2024-01-01");
  const currentBalance = initialBalance + Number(allTimePnL);

  const accountGrowth = useMemo(() => {
    if (initialBalance <= 0) return 0;
    return ((allTimePnL / initialBalance) * 100).toFixed(1);
  }, [allTimePnL, initialBalance]);

  // ─── Spider-web (radar) data: this month vs all-time ─────────
  const radarMonth = useMemo(() => computeEdge(monthlyTrades), [monthlyTrades]);
  const radarAll = useMemo(() => computeEdge(trades), [trades]);
  const radarMain = radarMonth || radarAll;

  // ─── Equity curve ────────────────────────────────────────────
  const equity = useMemo(() => {
    const src =
      curveRange === "month"
        ? monthlyTrades
        : [...trades].sort((a, b) => new Date(a.date) - new Date(b.date));
    let running = curveRange === "month" ? 0 : initialBalance;
    const labels = ["Start"];
    const values = [running];
    src.forEach((t) => {
      running += Number(t.pnl) || 0;
      labels.push(format(new Date(t.date), "dd MMM"));
      values.push(Number(running.toFixed(2)));
    });
    return { labels, values, count: src.length };
  }, [curveRange, monthlyTrades, trades, initialBalance]);

  // ─── Chart theming ───────────────────────────────────────────
  const chartText = isDark ? "#8a8fb5" : "#6b7090";
  const chartGrid = isDark ? "rgba(138,143,181,0.14)" : "rgba(107,112,144,0.16)";
  const tooltipBase = {
    backgroundColor: isDark ? "#0b0b19" : "#ffffff",
    titleColor: isDark ? "#ffffff" : "#14142b",
    bodyColor: isDark ? "#c9ccea" : "#3b3f5e",
    borderColor: isDark ? "#262645" : "#e6e8f2",
    borderWidth: 1,
    padding: 10,
    cornerRadius: 8,
    displayColors: false,
  };

  const radarChartData = {
    labels: RADAR_LABELS,
    datasets: [
      radarAll && {
        label: "All-time",
        data: radarAll.scores,
        borderColor: isDark ? "rgba(138,143,181,0.85)" : "rgba(107,112,144,0.85)",
        backgroundColor: "rgba(138,143,181,0.07)",
        borderDash: [5, 4],
        borderWidth: 1.5,
        pointRadius: 0,
      },
      radarMonth && {
        label: format(viewDate, "MMM yyyy"),
        data: radarMonth.scores,
        borderColor: ac.hex,
        backgroundColor: ac.hex + "38",
        borderWidth: 2.5,
        pointBackgroundColor: ac.hex,
        pointBorderColor: isDark ? "#15152b" : "#fff",
        pointRadius: 4,
        pointHoverRadius: 6,
      },
    ].filter(Boolean),
  };

  const radarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      r: {
        min: 0,
        max: 100,
        ticks: { display: false, stepSize: 25 },
        grid: { color: chartGrid },
        angleLines: { color: chartGrid },
        pointLabels: { color: chartText, font: { size: 11, weight: "600" } },
      },
    },
    plugins: {
      legend: {
        position: "bottom",
        labels: { color: chartText, usePointStyle: true, boxWidth: 8, padding: 14 },
      },
      tooltip: {
        ...tooltipBase,
        displayColors: true,
        callbacks: { label: (c) => ` ${c.dataset.label}: ${Math.round(c.parsed.r)}/100` },
      },
    },
  };

  const equityChartData = {
    labels: equity.labels,
    datasets: [
      {
        data: equity.values,
        borderColor: ac.hex,
        backgroundColor: (ctx) => {
          const { chart } = ctx;
          const { ctx: c, chartArea } = chart;
          if (!chartArea) return ac.hex + "22";
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, ac.hex + "55");
          g.addColorStop(1, ac.hex + "00");
          return g;
        },
        fill: true,
        tension: 0.3,
        borderWidth: 2.5,
        pointRadius: equity.count > 40 ? 0 : 3,
        pointHoverRadius: 5,
        pointBackgroundColor: ac.hex,
        pointBorderColor: isDark ? "#15152b" : "#fff",
      },
    ],
  };

  const equityOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { ...tooltipBase, callbacks: { label: (c) => ` ${money(c.parsed.y, false)}` } },
    },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: chartText, maxTicksLimit: 7, maxRotation: 0 } },
      y: { grid: { color: chartGrid }, border: { display: false }, ticks: { color: chartText, maxTicksLimit: 5, callback: fmtAxis } },
    },
  };

  const dailyBarData = {
    labels: perf.daily.map((d) => d.label),
    datasets: [
      {
        data: perf.daily.map((d) => d.pnl),
        backgroundColor: perf.daily.map((d) => (d.pnl >= 0 ? POS : NEG)),
        borderRadius: 4,
        maxBarThickness: 28,
      },
    ],
  };

  const dailyBarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { ...tooltipBase, callbacks: { label: (c) => ` ${money(c.parsed.y)}` } },
    },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: chartText, maxTicksLimit: 8, maxRotation: 0 } },
      y: { grid: { color: chartGrid }, border: { display: false }, ticks: { color: chartText, maxTicksLimit: 5, callback: fmtAxis } },
    },
  };

  const equityNet = equity.values[equity.values.length - 1] - equity.values[0];
  const maxAssetAbs = Math.max(1, ...monthlyAssetStats.assetPnL.map((a) => Math.abs(a.pnl)));

  // ─── Quick Analysis Modal Content ────────────────────────────
  const quickAnalysisContent = () => {
    if (!monthlyTrades.length) {
      return (
        <div className="text-center py-10 px-4">
          <AlertCircle size={56} className="mx-auto mb-5" style={{ color: ac.hex }} />
          <h3 className={`text-xl font-semibold mb-3 ${HEAD}`}>No trades recorded this month</h3>
          <p className={`${MUTED} max-w-lg mx-auto leading-relaxed`}>
            Add some trades to unlock performance insights, pattern detection, and coaching suggestions.
          </p>
          <button
            onClick={() => {
              setShowQuickAnalysis(false);
              navigate("/trades/new");
            }}
            style={{ backgroundColor: ac.hex }}
            className={`mt-7 rounded-lg px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 transition ${FOCUS}`}
          >
            Add your first trade
          </button>
        </div>
      );
    }

    const winRate = Number(monthlyStats.winRate);
    const totalPnL = Number(monthlyStats.totalPnL);
    const avgRR = Number(monthlyStats.avgRR);
    const totalTrades = monthlyStats.totalTrades;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className={`${PANEL} p-5`}>
            <div className={`text-sm mb-2 ${MUTED}`}>Win rate</div>
            <div className={`text-3xl font-bold tabular-nums ${HEAD}`}>{winRate}%</div>
            <div className={`mt-3 text-sm flex items-start gap-2 ${MUTED}`}>
              {winRate >= 60 ? (
                <CheckCircle className="mt-0.5 shrink-0 text-[#22c493]" size={16} />
              ) : (
                <AlertCircle className={`mt-0.5 shrink-0 ${winRate >= 45 ? "text-amber-500" : "text-[#f2556e]"}`} size={16} />
              )}
              {winRate >= 60
                ? "Strong performance. Protect your edge."
                : winRate >= 45
                ? "Solid base. Improve reward to risk."
                : "Needs attention. Focus on high-probability entries."}
            </div>
          </div>

          <div className={`${PANEL} p-5`}>
            <div className={`text-sm mb-2 ${MUTED}`}>Net result</div>
            <div className={`text-3xl font-bold tabular-nums ${pnlClass(totalPnL)}`}>{money(totalPnL)}</div>
            <div className={`mt-3 text-sm flex items-start gap-2 ${MUTED}`}>
              {totalPnL >= 0 ? (
                <ArrowUpRight className="mt-0.5 shrink-0 text-[#22c493]" size={16} />
              ) : (
                <ArrowDownRight className="mt-0.5 shrink-0 text-[#f2556e]" size={16} />
              )}
              {totalPnL >= 0 ? "Positive month. Manage greed." : "Drawdown. Tighten risk now."}
            </div>
          </div>

          <div className={`${PANEL} p-5`}>
            <div className={`text-sm mb-2 ${MUTED}`}>Average R:R</div>
            <div className="text-3xl font-bold tabular-nums" style={{ color: ac.hex }}>{avgRR}</div>
            <div className={`mt-3 text-sm flex items-start gap-2 ${MUTED}`}>
              {avgRR >= 2.5 ? (
                <CheckCircle className="mt-0.5 shrink-0 text-[#22c493]" size={16} />
              ) : (
                <AlertCircle className="mt-0.5 shrink-0 text-amber-500" size={16} />
              )}
              {avgRR >= 2.5 ? "Excellent asymmetry. Keep hunting." : "Can improve. Aim for 1:3+ setups."}
            </div>
          </div>
        </div>

        <div className={`${PANEL} p-5 sm:p-6`}>
          <h4 className={`text-base font-semibold mb-4 flex items-center gap-2 ${HEAD}`}>
            <Lightbulb size={18} className="text-amber-500" />
            Coaching insights
          </h4>
          <div className={`space-y-3.5 text-sm leading-relaxed ${isDark ? "text-[#c9ccea]" : "text-[#3b3f5e]"}`}>
            {totalTrades < 15 && (
              <div className="flex items-start gap-3">
                <AlertCircle className="text-amber-500 mt-0.5 shrink-0" size={16} />
                <p>Sample size is still small ({totalTrades} trades). Aim for 20–30 trades before drawing strong conclusions.</p>
              </div>
            )}
            {winRate < 50 && (
              <div className="flex items-start gap-3">
                <AlertCircle className="text-[#f2556e] mt-0.5 shrink-0" size={16} />
                <p>Win rate is below 50%. Be extra selective this week and only take A+ setups.</p>
              </div>
            )}
            {avgRR < 2 && (
              <div className="flex items-start gap-3">
                <AlertCircle className="text-amber-500 mt-0.5 shrink-0" size={16} />
                <p>Average reward to risk is low ({avgRR}). Focus on trades with a minimum of 1:2.5.</p>
              </div>
            )}
            <div className="flex items-start gap-3">
              <CheckCircle className="text-[#22c493] mt-0.5 shrink-0" size={16} />
              <p>Review your last 5 losing trades in detail and fix one repeating mistake.</p>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="text-[#22c493] mt-0.5 shrink-0" size={16} />
              <p>Keep risk at 1% per trade or less until your win rate exceeds 55%.</p>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="text-[#22c493] mt-0.5 shrink-0" size={16} />
              <p>Journal every trade’s emotion and confidence level (1–10).</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ─── No account selected ─────────────────────────────────────
  if (!currentAccount) {
    return (
      <div
        className={`${isDark ? "dark bg-[#0b0b19]" : "bg-[#f4f5fa]"} min-h-screen w-full p-8 flex items-center justify-center`}
      >
        <Card className={`${CARD} p-8 max-w-md text-center`}>
          <AlertCircle size={44} className="mx-auto text-amber-500 mb-4" />
          <h2 className={`text-xl font-bold mb-2 ${HEAD}`}>No account selected</h2>
          <p className={`${MUTED} mb-6`}>
            Create or select an account from the sidebar to view your dashboard.
          </p>
          <button
            onClick={() => {}}
            style={{ backgroundColor: ACCENTS.zella.hex }}
            className={`px-5 py-2.5 text-sm font-semibold text-white rounded-lg hover:brightness-110 transition ${FOCUS}`}
          >
            Create account
          </button>
        </Card>
      </div>
    );
  }

  // ─── Derived display values ──────────────────────────────────
  const netPnl = Number(monthlyStats.totalPnL);
  const payoffText = perf.payoff === Infinity ? "∞" : perf.payoff.toFixed(2);
  const avgTotal = perf.avgWin + perf.avgLoss;

  const glance = [
    { label: "Total trades", value: monthlyStats.totalTrades, sub: `${perf.wins} wins, ${perf.losses} losses` },
    { label: "Expectancy", value: money(monthlyStats.expectancy), sub: "per trade", cls: pnlClass(monthlyStats.expectancy) },
    { label: "Average R:R", value: monthlyStats.avgRR, sub: "reward to risk" },
    { label: "Consistency", value: `${monthlyStats.consistencyScore}%`, sub: "best day vs net P&L" },
    { label: "Best day", value: money(monthlyStats.bestDayPnL), sub: monthlyStats.bestDayDate, cls: pnlClass(monthlyStats.bestDayPnL) },
    { label: "Worst day", value: money(monthlyStats.worstDayPnL), sub: monthlyStats.worstDayDate, cls: pnlClass(monthlyStats.worstDayPnL) },
  ];

  return (
    <div
      className={`${isDark ? "dark bg-[#0b0b19] text-[#e8e9f7]" : "bg-[#f4f5fa] text-[#14142b]"} relative min-h-screen w-full p-3 sm:p-6 lg:p-8`}
    >
      <div className="mx-auto max-w-[1600px]">
        {/* ───────── Header ───────── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div className="min-w-0">
            <h1 className={`text-2xl sm:text-3xl font-bold tracking-tight ${HEAD}`}>Dashboard</h1>
            <p className={`mt-1 text-sm font-semibold ${HEAD}`}>Good morning!</p>
            <p className={`mt-0.5 text-sm flex flex-wrap items-center gap-x-2 gap-y-1 ${MUTED}`}>
              <span>Forgex</span>
              <span aria-hidden="true">/</span>
              <span className="font-medium">{currentAccount?.name || "Account"}</span>
              {currentAccount.mt5Connected && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#22c493]/15 px-2.5 py-0.5 text-xs font-semibold text-[#0e9f77] dark:text-[#2dd4a0]">
                  <i className="h-1.5 w-1.5 rounded-full bg-[#22c493]" />
                  MT5 connected
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            {/* Month stepper */}
            <div className={`flex items-center rounded-lg border ${DIVIDER} bg-white dark:bg-[#15152b]`}>
              <button
                onClick={prevMonth}
                aria-label="Previous month"
                className={`p-2.5 rounded-l-lg ${MUTED} hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] transition-colors ${FOCUS}`}
              >
                <ChevronLeft size={16} />
              </button>
              <span className={`min-w-[8.5rem] px-2 text-center text-sm font-semibold ${HEAD}`}>
                {format(viewDate, "MMMM yyyy")}
              </span>
              <button
                onClick={nextMonth}
                aria-label="Next month"
                className={`p-2.5 rounded-r-lg ${MUTED} hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] transition-colors ${FOCUS}`}
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <button
              onClick={syncFromMT5}
              disabled={syncing}
              title={!currentAccount.mt5Connected ? "Connect MT5 first in the sidebar" : "Sync trades from MT5"}
              className={`flex items-center gap-2 rounded-lg border ${DIVIDER} bg-white dark:bg-[#15152b] px-3.5 py-2.5 text-sm font-semibold transition-colors hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${HEAD} ${
                syncing || !currentAccount.mt5Connected ? "opacity-60" : ""
              } ${syncing ? "cursor-not-allowed" : ""} ${FOCUS}`}
            >
              <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Syncing..." : "Sync MT5"}
            </button>

            <button
              onClick={() => setShowQuickAnalysis(true)}
              style={{ backgroundColor: ac.hex }}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 ${FOCUS}`}
            >
              <Zap size={15} />
              Ask Zella AI
            </button>

            <button
              onClick={() => navigate("/trades/new")}
              className={`flex items-center gap-2 rounded-lg bg-[#6C47FF] px-3.5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5b37e8] ${FOCUS}`}
            >
              <Plus size={15} />
              Import your trades
            </button>

            {/* Accent picker */}
            <div className="flex items-center gap-1.5 pl-1" role="radiogroup" aria-label="Accent theme">
              <Palette size={15} className={MUTED} />
              {Object.entries(ACCENTS).map(([key, a]) => (
                <button
                  key={key}
                  role="radio"
                  aria-checked={accent === key}
                  onClick={() => setAccent(key)}
                  title={a.name}
                  aria-label={`${a.name} theme`}
                  className={`h-5 w-5 rounded-full transition-transform ${FOCUS} ${
                    accent === key
                      ? "scale-110 ring-2 ring-offset-2 ring-[#8a8fb5] ring-offset-[#f4f5fa] dark:ring-white/70 dark:ring-offset-[#0b0b19]"
                      : "opacity-75 hover:scale-110 hover:opacity-100"
                  }`}
                  style={{ backgroundImage: `linear-gradient(135deg, ${a.hex}, ${a.hex2})` }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Sync message */}
        {syncMessage.text && (
          <div
            role="status"
            className={`mb-5 flex items-center gap-2.5 rounded-lg border px-4 py-3 text-sm font-medium ${
              syncMessage.type === "success"
                ? "border-[#22c493]/30 bg-[#22c493]/10 text-[#0e9f77] dark:text-[#2dd4a0]"
                : syncMessage.type === "error"
                ? "border-[#f2556e]/30 bg-[#f2556e]/10 text-[#d93a57] dark:text-[#ff6b86]"
                : "border-[#7c8cf8]/30 bg-[#7c8cf8]/10 text-[#4a56c9] dark:text-[#aab4ff]"
            }`}
          >
            {syncMessage.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            {syncMessage.text}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center h-72">
            <div
              className="h-10 w-10 animate-spin rounded-full border-2 border-[#e6e8f2] dark:border-[#262645]"
              style={{ borderTopColor: ac.hex }}
              role="progressbar"
              aria-label="Loading trades"
            />
          </div>
        ) : error ? (
          <Card className={`${CARD} mx-auto max-w-md p-8 text-center`}>
            <AlertCircle size={36} className="mx-auto mb-3 text-[#f2556e]" />
            <p className={`mb-5 text-sm ${MUTED}`}>{error}</p>
            <button
              onClick={refreshTrades}
              style={{ backgroundColor: ac.hex }}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white hover:brightness-110 transition ${FOCUS}`}
            >
              Try again
            </button>
          </Card>
        ) : (
          <>
            {/* ───────── KPI row ───────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4 mb-4">
              <Kpi
                title="Net P&L"
                hint="Total profit and loss for the selected month"
                badge={
                  <span className="rounded-md bg-[#f1f2f8] dark:bg-[#1e1e3a] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[#3b3f5e] dark:text-[#c9ccea]">
                    {monthlyStats.totalTrades}
                  </span>
                }
                value={
                  <>
                    {netPnl < 0 ? "-" : ""}$<AnimatedNumber value={Math.abs(netPnl)} />
                  </>
                }
                valueClass={pnlClass(netPnl)}
              >
                <div className={`text-xs ${MUTED}`}>
                  Account growth{" "}
                  <span className={`font-semibold ${pnlClass(accountGrowth)}`}>
                    {Number(accountGrowth) >= 0 ? "+" : ""}
                    {accountGrowth}%
                  </span>{" "}
                  all-time
                </div>
              </Kpi>

              <Kpi
                title="Trade win %"
                hint="Share of trades closed in profit"
                value={<><AnimatedNumber value={Number(monthlyStats.winRate)} decimals={1} />%</>}
                valueClass={HEAD}
                visual={
                  <div className="h-[56px] w-[104px]">
                    <Gauge
                      half
                      isDark={isDark}
                      values={[perf.wins, perf.breakeven, perf.losses]}
                      colors={[POS, NEUTRAL, NEG]}
                    />
                  </div>
                }
              >
                <div className="flex flex-wrap gap-1.5">
                  <Chip color={POS}>{perf.wins}</Chip>
                  <Chip color={NEUTRAL}>{perf.breakeven}</Chip>
                  <Chip color={NEG}>{perf.losses}</Chip>
                </div>
              </Kpi>

              <Kpi
                title="Profit factor"
                hint="Gross profit divided by gross loss"
                value={monthlyStats.profitFactor}
                valueClass={HEAD}
                visual={
                  <div className="h-[56px] w-[56px]">
                    <Gauge isDark={isDark} values={[perf.grossW, perf.grossL]} colors={[POS, NEG]} />
                  </div>
                }
              >
                <div className={`text-xs ${MUTED}`}>
                  <span className={`font-semibold ${POS_T}`}>{money(perf.grossW, false)}</span> won,{" "}
                  <span className={`font-semibold ${NEG_T}`}>{money(perf.grossL, false)}</span> lost
                </div>
              </Kpi>

              <Kpi
                title="Day win %"
                hint="Share of trading days that closed green"
                value={<><AnimatedNumber value={perf.dayWinRate} decimals={1} />%</>}
                valueClass={HEAD}
                visual={
                  <div className="h-[56px] w-[104px]">
                    <Gauge
                      half
                      isDark={isDark}
                      values={[perf.greenDays, perf.flatDays, perf.redDays]}
                      colors={[POS, NEUTRAL, NEG]}
                    />
                  </div>
                }
              >
                <div className="flex flex-wrap gap-1.5">
                  <Chip color={POS}>{perf.greenDays}</Chip>
                  <Chip color={NEUTRAL}>{perf.flatDays}</Chip>
                  <Chip color={NEG}>{perf.redDays}</Chip>
                </div>
              </Kpi>

              <Kpi
                title="Avg win / loss trade"
                hint="Average winning trade divided by average losing trade"
                value={payoffText}
                valueClass={HEAD}
              >
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#e6e8f2] dark:bg-[#262645] flex">
                  <div
                    className="h-full"
                    style={{ width: `${avgTotal ? (perf.avgWin / avgTotal) * 100 : 50}%`, backgroundColor: POS }}
                  />
                  <div className="h-full flex-1" style={{ backgroundColor: avgTotal ? NEG : "transparent" }} />
                </div>
                <div className="mt-2 flex justify-between text-xs font-semibold tabular-nums">
                  <span className={POS_T}>{money(perf.avgWin, false)}</span>
                  <span className={NEG_T}>-{money(perf.avgLoss, false)}</span>
                </div>
              </Kpi>

              <Kpi
                title="Current streak"
                hint="Consecutive winning or losing trades"
                value={
                  currentStreak.type === "None"
                    ? "—"
                    : `${currentStreak.count} ${currentStreak.type}${currentStreak.count === 1 ? "" : "s"}`
                }
                valueClass={
                  currentStreak.type === "Win" ? POS_T : currentStreak.type === "Loss" ? NEG_T : HEAD
                }
                visual={
                  <Flame
                    size={26}
                    className={
                      currentStreak.type === "Win"
                        ? "text-[#22c493]"
                        : currentStreak.type === "Loss"
                        ? "text-[#f2556e]"
                        : "opacity-30"
                    }
                  />
                }
              >
                <div className={`text-xs ${MUTED}`}>Most recent closed trades</div>
              </Kpi>
            </div>

            {/* ───────── Month at a glance ───────── */}
            <div className={`mb-4 overflow-hidden rounded-xl border ${DIVIDER} bg-[#e6e8f2] dark:bg-[#262645]`}>
              <div className="grid grid-cols-2 gap-px sm:grid-cols-3 xl:grid-cols-6">
                {glance.map((g) => (
                  <div key={g.label} className="bg-white dark:bg-[#15152b] px-4 py-3.5">
                    <div className={`text-xs font-medium ${MUTED}`}>{g.label}</div>
                    <div className={`mt-1 text-lg font-bold tabular-nums ${g.cls || HEAD}`}>{g.value}</div>
                    <div className={`text-[11px] ${MUTED}`}>{g.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ───────── Cumulative P&L + side widget column ───────── */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 mb-4">
              <div className="order-2 flex flex-col gap-4 xl:order-2 xl:col-span-4">
              {widgets.radar && (
              <Card className={`${CARD} p-0`}>
                <CardHead
                  icon={Target}
                  accent={ac.hex}
                  title="Performance radar"
                  sub={radarMonth ? `${format(viewDate, "MMMM yyyy")} vs all-time` : "All-time (no trades this month)"}
                  right={
                    <div className="text-right shrink-0">
                      <div className={`text-[11px] ${MUTED}`}>Edge score</div>
                      <div className="text-2xl font-bold leading-none mt-1 tabular-nums" style={{ color: ac.hex }}>
                        {radarMain ? radarMain.edge : "—"}
                        <span className={`text-xs font-semibold ${MUTED}`}>/100</span>
                      </div>
                    </div>
                  }
                />
                <div className="p-4 sm:p-5">
                  {radarMain ? (
                    <>
                      <div className="relative h-72">
                        <Radar data={radarChartData} options={radarOptions} />
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-4">
                        {RADAR_LABELS.map((label, i) => (
                          <div key={label} className={`${PANEL} px-2 py-2 text-center`}>
                            <div className={`text-[10px] sm:text-[11px] truncate ${MUTED}`}>{label}</div>
                            <div className={`text-sm font-bold tabular-nums ${HEAD}`}>{radarMain.raw[i]}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className={`h-72 flex flex-col items-center justify-center text-center gap-2 ${MUTED}`}>
                      <Target size={36} className="opacity-40" />
                      <p className="text-sm">Add trades to see your performance radar.</p>
                    </div>
                  )}
                </div>
              </Card>
              )}

              {/* Account balance & P&L */}
              {widgets.balance && (
              <Card className={`${CARD} p-0`}>
                <CardHead
                  icon={Wallet}
                  accent={ac.hex}
                  title="Account balance"
                  sub="Live account equity"
                  right={
                    <span
                      className={`rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums ${
                        Number(accountGrowth) >= 0
                          ? "bg-[#22c493]/15 text-[#0e9f77] dark:text-[#2dd4a0]"
                          : "bg-[#f2556e]/15 text-[#d93a57] dark:text-[#ff6b86]"
                      }`}
                    >
                      {Number(accountGrowth) >= 0 ? "+" : ""}
                      {accountGrowth}%
                    </span>
                  }
                />
                <div className="p-4 sm:p-5">
                  <div className={`text-2xl font-bold tabular-nums ${HEAD}`}>${formatNumber(currentBalance)}</div>
                  <div className={`mt-4 flex items-center justify-between border-t pt-3 text-sm ${DIVIDER}`}>
                    <div>
                      <div className={`text-[11px] ${MUTED}`}>Period P&L</div>
                      <div className={`font-semibold tabular-nums ${pnlClass(netPnl)}`}>{money(netPnl)}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-[11px] ${MUTED}`}>All-time P&L</div>
                      <div className={`font-semibold tabular-nums ${pnlClass(allTimePnL)}`}>{money(allTimePnL)}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className={`flex items-center gap-1.5 text-xs ${MUTED}`}>
                      <Flame
                        size={14}
                        className={
                          currentStreak.type === "Win"
                            ? "text-[#22c493]"
                            : currentStreak.type === "Loss"
                            ? "text-[#f2556e]"
                            : ""
                        }
                      />
                      Current streak
                    </span>
                    <span
                      className={`text-xs font-bold ${
                        currentStreak.type === "Win" ? POS_T : currentStreak.type === "Loss" ? NEG_T : MUTED
                      }`}
                    >
                      {currentStreak.type === "None" ? "—" : `${currentStreak.count} ${currentStreak.type}`}
                    </span>
                  </div>
                </div>
              </Card>
              )}

              {/* Win % + expectancy mini cards */}
              <div className={`grid gap-4 ${widgets.winrate && widgets.expectancy ? "grid-cols-2" : "grid-cols-1"}`}>
                {widgets.winrate && (
                <Card className={`${CARD} p-4`}>
                  <div className={`text-[11px] font-medium ${MUTED}`}>Trade win %</div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-[44px] w-[64px] shrink-0">
                      <Gauge half isDark={isDark} values={[perf.wins, perf.breakeven, perf.losses]} colors={[POS, NEUTRAL, NEG]} />
                    </div>
                    <div className={`text-xl font-bold tabular-nums ${HEAD}`}>{Number(monthlyStats.winRate).toFixed(0)}%</div>
                  </div>
                  <div className={`mt-1 text-[10px] ${MUTED}`}>{perf.wins}W · {perf.losses}L</div>
                </Card>
                )}
                {widgets.expectancy && (
                <Card className={`${CARD} p-4`}>
                  <div className={`text-[11px] font-medium ${MUTED}`}>Trade expectancy</div>
                  <div className={`mt-1 text-xl font-bold tabular-nums ${pnlClass(monthlyStats.expectancy)}`}>
                    {money(monthlyStats.expectancy)}
                  </div>
                  <div className={`mt-1 text-[10px] ${MUTED}`}>avg R:R {monthlyStats.avgRR}</div>
                </Card>
                )}
              </div>
              {!widgets.radar && !widgets.balance && !widgets.winrate && !widgets.expectancy && (
                <Card className={`${CARD} p-6 text-center`}>
                  <SlidersHorizontal size={32} className={`mx-auto mb-2 ${MUTED}`} />
                  <p className={`text-sm ${MUTED}`}>No widgets selected.</p>
                  <button
                    onClick={() => setWidgetPanelOpen(true)}
                    className={`mt-3 rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 ${FOCUS}`}
                    style={{ backgroundColor: ac.hex }}
                  >
                    Choose widgets
                  </button>
                </Card>
              )}
              </div>

              <Card className={`${CARD} order-1 xl:order-1 xl:col-span-8 p-0`}>
                <CardHead
                  icon={LineChartIcon}
                  accent={ac.hex}
                  title="Cumulative P&L"
                  sub={
                    <>
                      <span className={`font-semibold ${pnlClass(equityNet)}`}>{money(equityNet)}</span>
                      {` across ${equity.count} trades`}
                    </>
                  }
                  right={
                    <div className="flex rounded-lg bg-[#f1f2f8] dark:bg-[#0f0f22] p-1 text-xs">
                      {[
                        ["month", "This month"],
                        ["all", "All-time"],
                      ].map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => setCurveRange(key)}
                          aria-pressed={curveRange === key}
                          className={`rounded-md px-3 py-1.5 font-semibold transition-colors ${FOCUS} ${
                            curveRange === key ? "text-white shadow-sm" : `${MUTED} hover:text-[#14142b] dark:hover:text-white`
                          }`}
                          style={curveRange === key ? { backgroundColor: ac.hex } : undefined}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  }
                />
                <div className="p-4 sm:p-5">
                  {equity.count ? (
                    <div className="relative h-72 sm:h-80 xl:h-[26rem]">
                      <Line data={equityChartData} options={equityOptions} />
                    </div>
                  ) : (
                    <div className={`h-72 flex flex-col items-center justify-center text-center gap-2 ${MUTED}`}>
                      <LineChartIcon size={36} className="opacity-40" />
                      <p className="text-sm">No trades in this range yet.</p>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* ───────── Net daily P&L + Account overview ───────── */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 mb-4">
              <Card className={`${CARD} xl:col-span-8 p-0`}>
                <CardHead
                  icon={BarChart3}
                  accent={ac.hex}
                  title="Net daily P&L"
                  sub={`${perf.greenDays} green and ${perf.redDays} red days in ${format(viewDate, "MMMM")}`}
                />
                <div className="p-4 sm:p-5">
                  {perf.daily.length ? (
                    <div className="relative h-64">
                      <Bar data={dailyBarData} options={dailyBarOptions} />
                    </div>
                  ) : (
                    <div className={`h-64 flex flex-col items-center justify-center text-center gap-2 ${MUTED}`}>
                      <BarChart3 size={36} className="opacity-40" />
                      <p className="text-sm">No trading days this month.</p>
                    </div>
                  )}
                </div>
              </Card>

              <Card className={`${CARD} xl:col-span-4 p-0`}>
                <CardHead icon={Activity} accent={ac.hex} title="Trade expectancy" />
                <div className="p-4 sm:p-5">
                  <div className={`text-xs ${MUTED}`}>Expected value per trade</div>
                  <div className={`mt-1 text-3xl font-bold tabular-nums ${pnlClass(monthlyStats.expectancy)}`}>
                    {money(monthlyStats.expectancy)}
                  </div>
                  <div className="mt-5 space-y-3.5 text-sm">
                    {[
                      ["Average win", money(perf.avgWin, false), POS_T],
                      ["Average loss", `-${money(perf.avgLoss, false)}`, NEG_T],
                      ["Win / loss ratio", payoffText, HEAD],
                      ["Profit factor", monthlyStats.profitFactor, HEAD],
                    ].map(([label, value, cls]) => (
                      <div key={label} className={`flex items-center justify-between border-b pb-3 last:border-0 last:pb-0 ${DIVIDER}`}>
                        <span className={MUTED}>{label}</span>
                        <span className={`font-semibold tabular-nums ${cls}`}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>

            {/* ───────── Calendar + side widgets ───────── */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 mb-4">
              <Card className={`${CARD} xl:col-span-8 p-0`}>
                <CardHead
                  icon={CalendarDays}
                  accent={ac.hex}
                  title="Trading calendar"
                  sub="Select a day to view its trades"
                  right={
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={prevMonth}
                        aria-label="Previous month"
                        className={`rounded-lg p-2 ${MUTED} hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] transition-colors ${FOCUS}`}
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        onClick={() => {
                          const res = prompt("Enter month (YYYY-MM)");
                          if (res && /^\d{4}-\d{2}$/.test(res)) {
                            const [y, m] = res.split("-").map(Number);
                            jumpTo(y, m);
                          }
                        }}
                        title="Jump to a month"
                        className={`rounded-lg border ${DIVIDER} px-3 py-1.5 text-sm font-semibold ${HEAD} hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] transition-colors ${FOCUS}`}
                      >
                        {format(viewDate, "MMM yyyy")}
                      </button>
                      <button
                        onClick={nextMonth}
                        aria-label="Next month"
                        className={`rounded-lg p-2 ${MUTED} hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] transition-colors ${FOCUS}`}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  }
                />

                <div className="p-3 sm:p-5">
                  <div className="sm:overflow-x-auto">
                    <div className="grid grid-cols-7 sm:grid-cols-8 sm:min-w-[640px] gap-1 sm:gap-1.5">
                      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Week"].map((d) => (
                        <div
                          key={d}
                          className={`text-[10px] sm:text-xs font-semibold text-center py-1.5 ${MUTED} ${
                            d === "Week" ? "hidden sm:block" : ""
                          }`}
                        >
                          {d === "Week" ? d : d.slice(0, 1)}
                          <span className="hidden sm:inline">{d === "Week" ? "" : d.slice(1)}</span>
                        </div>
                      ))}

                      {calendarWeeks.map((week, wi) => {
                        const wSum = weekSummary(week);
                        return (
                          <React.Fragment key={wi}>
                            {week.map((dayObj, di) => {
                              const ds = daySummary(dayObj);
                              const isCur = isSameMonth(dayObj, viewDate);
                              const pnl = ds?.pnl || 0;
                              const alpha = 0.1 + Math.min(Math.abs(pnl) / 1500, 1) * 0.26;
                              const today = isToday(dayObj);

                              return (
                                <div
                                  key={di}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => openDay(dayObj)}
                                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openDay(dayObj)}
                                  aria-label={`${format(dayObj, "d MMMM")}${ds ? `, ${money(pnl)}` : ", no trades"}`}
                                  className={`cursor-pointer min-h-[54px] sm:min-h-[92px] rounded-lg p-1 sm:p-2 flex flex-col justify-between border transition-colors ${FOCUS} ${
                                    isCur
                                      ? "bg-white dark:bg-[#101024] border-[#e6e8f2] dark:border-[#262645]"
                                      : "bg-transparent border-dashed border-[#e6e8f2]/70 dark:border-[#262645]/60 opacity-60"
                                  } hover:border-[#6C47FF]`}
                                  style={{
                                    backgroundColor: ds
                                      ? pnl >= 0
                                        ? `rgba(34, 196, 147, ${alpha})`
                                        : pnl < 0
                                        ? `rgba(242, 85, 110, ${alpha})`
                                        : undefined
                                      : undefined,
                                    boxShadow: today ? `inset 0 0 0 2px ${ac.hex}` : undefined,
                                  }}
                                >
                                  <div className={`text-[10px] sm:text-xs text-right font-medium ${MUTED}`}>
                                    {format(dayObj, "d")}
                                  </div>
                                  <div className="flex flex-col items-center justify-center text-center">
                                    {ds ? (
                                      <>
                                        <div className={`font-bold text-[10px] sm:text-sm leading-tight tabular-nums ${pnlClass(pnl)}`}>
                                          <span className="sm:hidden">
                                            {pnl >= 0 ? "+" : "-"}
                                            {Math.abs(pnl).toFixed(0)}
                                          </span>
                                          <span className="hidden sm:inline">{money(pnl)}</span>
                                        </div>
                                        <div className={`hidden sm:block text-[10px] ${MUTED}`}>
                                          {ds.count} {ds.count === 1 ? "trade" : "trades"}, {ds.winRate}%
                                        </div>
                                      </>
                                    ) : (
                                      <div className={`text-xs ${MUTED} opacity-50`}>—</div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}

                            {/* Weekly summary */}
                            <div
                              className={`hidden sm:flex min-h-[92px] flex-col items-center justify-center rounded-lg border p-2 bg-[#f7f8fc] dark:bg-[#1b1b36] ${DIVIDER}`}
                            >
                              <div className={`text-xs font-medium mb-1 ${MUTED}`}>Week {wi + 1}</div>
                              <div className={`text-sm font-bold tabular-nums ${wSum.count ? pnlClass(wSum.pnl) : MUTED}`}>
                                {wSum.count ? money(wSum.pnl) : "—"}
                              </div>
                              <div className={`text-[10px] ${MUTED}`}>
                                {wSum.count} {wSum.count === 1 ? "trade" : "trades"}, {wSum.winRate}%
                              </div>
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </Card>

              <div className="xl:col-span-4 flex flex-col gap-4">
                {/* Weekly performance */}
                <Card className={`${CARD} p-0`}>
                  <CardHead
                    icon={BarChart3}
                    accent={ac.hex}
                    title="Weekly performance"
                    sub="Last 4 weeks"
                  />
                  <div className="p-4 sm:p-5 space-y-4">
                    {weeklyBreakdown.map((week, idx) => (
                      <div key={idx}>
                        <div className="flex items-center justify-between text-sm">
                          <span className={`font-medium ${HEAD}`}>Week of {week.label}</span>
                          <span className={`font-semibold tabular-nums ${week.total ? pnlClass(week.pnl) : MUTED}`}>
                            {week.total ? money(week.pnl) : "—"}
                          </span>
                        </div>
                        <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-[#e6e8f2] dark:bg-[#262645]">
                          {week.total > 0 && (
                            <>
                              <div style={{ width: `${(week.wins / week.total) * 100}%`, backgroundColor: POS }} />
                              <div style={{ width: `${(week.breakeven / week.total) * 100}%`, backgroundColor: NEUTRAL }} />
                              <div style={{ width: `${(week.losses / week.total) * 100}%`, backgroundColor: NEG }} />
                            </>
                          )}
                        </div>
                        <div className={`mt-1.5 flex gap-3 text-xs tabular-nums ${MUTED}`}>
                          <span>{week.wins}W</span>
                          <span>{week.losses}L</span>
                          <span>{week.breakeven}B</span>
                          <span className="ml-auto">{week.total} trades</span>
                        </div>
                      </div>
                    ))}
                    {weeklyBreakdown.every((w) => w.total === 0) && (
                      <div className={`text-center py-4 text-sm ${MUTED}`}>No trades in the last 4 weeks</div>
                    )}

                    <div className={`flex items-center justify-between border-t pt-4 ${DIVIDER}`}>
                      <span className={`flex items-center gap-2 text-sm ${MUTED}`}>
                        <Flame size={16} className={currentStreak.type === "Win" ? "text-[#22c493]" : currentStreak.type === "Loss" ? "text-[#f2556e]" : ""} />
                        Current streak
                      </span>
                      <span
                        className={`text-sm font-bold ${
                          currentStreak.type === "Win" ? POS_T : currentStreak.type === "Loss" ? NEG_T : MUTED
                        }`}
                      >
                        {currentStreak.type === "None" ? "—" : `${currentStreak.count} ${currentStreak.type}`}
                      </span>
                    </div>
                  </div>
                </Card>

                {/* Top assets */}
                <Card className={`${CARD} p-0 flex-1`}>
                  <CardHead
                    icon={TrendingUp}
                    accent={ac.hex}
                    title="Top assets by P&L"
                    sub={
                      monthlyAssetStats.topPairCount > 0
                        ? `Most traded: ${monthlyAssetStats.topPair} (${monthlyAssetStats.topPairCount}), ${monthlyAssetStats.totalLots} lots`
                        : "No trades this month"
                    }
                  />
                  <div className="p-4 sm:p-5 space-y-3.5">
                    {monthlyAssetStats.assetPnL.length > 0 ? (
                      monthlyAssetStats.assetPnL.map((item) => (
                        <div key={item.pair}>
                          <div className="flex items-center justify-between text-sm">
                            <span className={`font-medium truncate max-w-[55%] ${HEAD}`}>{item.pair}</span>
                            <span className={`font-semibold tabular-nums ${pnlClass(item.pnl)}`}>{money(item.pnl)}</span>
                          </div>
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#e6e8f2] dark:bg-[#262645]">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${(Math.abs(item.pnl) / maxAssetAbs) * 100}%`,
                                backgroundColor: item.pnl >= 0 ? POS : NEG,
                              }}
                            />
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className={`text-center py-4 text-sm ${MUTED}`}>No asset data</div>
                    )}
                  </div>
                </Card>
              </div>
            </div>

            {/* ───────── Recent trades ───────── */}
            <Card className={`${CARD} p-0 mb-10`}>
              <div className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5 ${DIVIDER}`}>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setBottomTab("recent")}
                    aria-pressed={bottomTab === "recent"}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${FOCUS} ${
                      bottomTab === "recent"
                        ? "bg-[#f1f2f8] dark:bg-[#1e1e3a] " + HEAD
                        : MUTED + " hover:text-[#14142b] dark:hover:text-white"
                    }`}
                  >
                    Recent trades
                  </button>
                  <button
                    onClick={() => setBottomTab("open")}
                    aria-pressed={bottomTab === "open"}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${FOCUS} ${
                      bottomTab === "open"
                        ? "bg-[#f1f2f8] dark:bg-[#1e1e3a] " + HEAD
                        : MUTED + " hover:text-[#14142b] dark:hover:text-white"
                    }`}
                  >
                    Open positions
                    {openPositions.length > 0 && (
                      <span className="ml-1.5 rounded-md bg-[#22c493]/15 px-1.5 py-0.5 text-[10px] tabular-nums text-[#0e9f77] dark:text-[#2dd4a0]">
                        {openPositions.length}
                      </span>
                    )}
                  </button>
                </div>
                <button
                  onClick={() => navigate("/trades")}
                  className={`flex items-center gap-1 rounded text-sm font-semibold hover:underline ${FOCUS}`}
                  style={{ color: ac.hex }}
                >
                  View all
                  <ChevronRight size={15} />
                </button>
              </div>

              {bottomTab === "recent" ? (
                recentTrades.length === 0 ? (
                <div className={`py-14 text-center text-sm ${MUTED}`}>No trades yet. Add one with the + button.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className={`border-b text-left text-xs font-medium ${MUTED} ${DIVIDER}`}>
                        <th className="px-4 sm:px-5 py-3 font-medium">Date</th>
                        <th className="px-3 py-3 font-medium">Symbol</th>
                        <th className="px-3 py-3 font-medium">Side</th>
                        <th className="px-3 py-3 font-medium hidden sm:table-cell text-right">Lots</th>
                        <th className="px-3 py-3 font-medium hidden sm:table-cell text-right">R:R</th>
                        <th className="px-4 sm:px-5 py-3 font-medium text-right">Net P&L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentTrades.map((trade, i) => {
                        const p = Number(trade.pnl) || 0;
                        const isLong = /buy|long/i.test(String(trade.direction || ""));
                        return (
                          <tr
                            key={trade.id || i}
                            onClick={() => navigate(`/trades?date=${format(new Date(trade.date), "yyyy-MM-dd")}`)}
                            className={`cursor-pointer border-b last:border-0 transition-colors hover:bg-[#f7f8fc] dark:hover:bg-[#1b1b36] ${DIVIDER}`}
                          >
                            <td className={`px-4 sm:px-5 py-3.5 whitespace-nowrap ${MUTED}`}>
                              {format(new Date(trade.date), "dd MMM yyyy, HH:mm")}
                            </td>
                            <td className={`px-3 py-3.5 font-semibold ${HEAD}`}>{trade.pair || "—"}</td>
                            <td className="px-3 py-3.5">
                              <span
                                className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${
                                  isLong
                                    ? "bg-[#22c493]/15 text-[#0e9f77] dark:text-[#2dd4a0]"
                                    : "bg-[#f2556e]/15 text-[#d93a57] dark:text-[#ff6b86]"
                                }`}
                              >
                                {trade.direction || "—"}
                              </span>
                            </td>
                            <td className={`px-3 py-3.5 hidden sm:table-cell text-right tabular-nums ${MUTED}`}>
                              {trade.lotSize ?? "—"}
                            </td>
                            <td className={`px-3 py-3.5 hidden sm:table-cell text-right tabular-nums ${MUTED}`}>
                              {trade.rr ? Number(trade.rr).toFixed(2) : "—"}
                            </td>
                            <td className={`px-4 sm:px-5 py-3.5 text-right font-bold tabular-nums ${pnlClass(p)}`}>
                              {money(p)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
              ) : openPositions.length === 0 ? (
                <div className={`py-14 text-center text-sm ${MUTED}`}>
                  No open positions. Trades appear here while they are still running.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className={`border-b text-left text-xs font-medium ${MUTED} ${DIVIDER}`}>
                        <th className="px-4 sm:px-5 py-3 font-medium">Opened</th>
                        <th className="px-3 py-3 font-medium">Symbol</th>
                        <th className="px-3 py-3 font-medium">Side</th>
                        <th className="px-3 py-3 font-medium hidden sm:table-cell text-right">Lots</th>
                        <th className="px-3 py-3 font-medium hidden sm:table-cell text-right">R:R</th>
                        <th className="px-4 sm:px-5 py-3 font-medium text-right">Unrealised</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openPositions.map((trade, i) => {
                        const p = Number(trade.pnl) || 0;
                        const isLong = /buy|long/i.test(String(trade.direction || ""));
                        return (
                          <tr
                            key={trade.id || i}
                            onClick={() => navigate(`/trades?date=${format(new Date(trade.date), "yyyy-MM-dd")}`)}
                            className={`cursor-pointer border-b last:border-0 transition-colors hover:bg-[#f7f8fc] dark:hover:bg-[#1b1b36] ${DIVIDER}`}
                          >
                            <td className={`px-4 sm:px-5 py-3.5 whitespace-nowrap ${MUTED}`}>
                              {format(new Date(trade.date), "dd MMM yyyy, HH:mm")}
                            </td>
                            <td className={`px-3 py-3.5 font-semibold ${HEAD}`}>{trade.pair || "—"}</td>
                            <td className="px-3 py-3.5">
                              <span
                                className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${
                                  isLong
                                    ? "bg-[#22c493]/15 text-[#0e9f77] dark:text-[#2dd4a0]"
                                    : "bg-[#f2556e]/15 text-[#d93a57] dark:text-[#ff6b86]"
                                }`}
                              >
                                {trade.direction || "—"}
                              </span>
                            </td>
                            <td className={`px-3 py-3.5 hidden sm:table-cell text-right tabular-nums ${MUTED}`}>
                              {trade.lotSize ?? "—"}
                            </td>
                            <td className={`px-3 py-3.5 hidden sm:table-cell text-right tabular-nums ${MUTED}`}>
                              {trade.rr ? Number(trade.rr).toFixed(2) : "—"}
                            </td>
                            <td className={`px-4 sm:px-5 py-3.5 text-right font-bold tabular-nums ${pnlClass(p)}`}>
                              {money(p)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Floating Quick Add Button */}
            <button
              onClick={() => navigate("/trades/new")}
              style={{ backgroundColor: ac.hex }}
              className={`fixed bottom-24 md:bottom-6 right-4 md:right-6 z-[1000] flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg shadow-black/25 transition hover:brightness-110 active:scale-95 ${FOCUS}`}
              aria-label="Add new trade"
            >
              <Plus size={26} strokeWidth={2.5} />
            </button>

            {/* Floating widget customiser */}
            <button
              onClick={() => setWidgetPanelOpen(true)}
              title="Customize widgets"
              aria-label="Customize dashboard widgets"
              className={`fixed bottom-40 md:bottom-24 right-4 md:right-6 z-[1000] flex h-11 w-11 items-center justify-center rounded-full border bg-white dark:bg-[#15152b] shadow-lg transition hover:brightness-110 active:scale-95 ${DIVIDER} ${HEAD} ${FOCUS}`}
            >
              <SlidersHorizontal size={18} />
            </button>

            {/* Widget customiser drawer */}
            {widgetPanelOpen && (
              <div
                className="fixed inset-0 z-[2100] flex justify-end bg-black/50"
                onClick={() => setWidgetPanelOpen(false)}
              >
                <aside
                  role="dialog"
                  aria-modal="true"
                  aria-label="Customize dashboard widgets"
                  onClick={(e) => e.stopPropagation()}
                  className={`h-full w-full max-w-sm overflow-y-auto border-l bg-white dark:bg-[#15152b] shadow-2xl ${DIVIDER}`}
                >
                  <div className={`flex items-start justify-between border-b px-5 py-4 ${DIVIDER}`}>
                    <div>
                      <h2 className={`flex items-center gap-2 text-lg font-bold ${HEAD}`}>
                        <SlidersHorizontal size={18} style={{ color: ac.hex }} />
                        Customize widgets
                      </h2>
                      <p className={`mt-0.5 text-xs ${MUTED}`}>
                        Choose what appears in your right-hand column.
                      </p>
                    </div>
                    <button
                      onClick={() => setWidgetPanelOpen(false)}
                      aria-label="Close"
                      className={`rounded-lg p-2 ${MUTED} hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] transition-colors ${FOCUS}`}
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="space-y-3 p-5">
                    {WIDGET_OPTIONS.map((opt) => {
                      const on = !!widgets[opt.key];
                      return (
                        <button
                          key={opt.key}
                          onClick={() => toggleWidget(opt.key)}
                          role="switch"
                          aria-checked={on}
                          className={`flex w-full items-center justify-between gap-4 rounded-xl border bg-[#f7f8fc] dark:bg-[#101024] p-4 text-left transition-colors hover:border-[#6C47FF] ${DIVIDER} ${FOCUS}`}
                        >
                          <span className="min-w-0">
                            <span className={`block text-sm font-semibold ${HEAD}`}>{opt.label}</span>
                            <span className={`mt-0.5 block text-xs ${MUTED}`}>{opt.desc}</span>
                          </span>
                          <span
                            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                              on ? "" : "bg-[#d5d8e6] dark:bg-[#2a2a4a]"
                            }`}
                            style={on ? { backgroundColor: ac.hex } : undefined}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                on ? "translate-x-6" : "translate-x-1"
                              }`}
                            />
                          </span>
                        </button>
                      );
                    })}
                    <p className={`pt-2 text-[11px] ${MUTED}`}>Your selection is saved on this device.</p>
                  </div>
                </aside>
              </div>
            )}

            {/* Quick Analysis Modal */}
            {showQuickAnalysis && (
              <div
                className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4"
                onClick={() => setShowQuickAnalysis(false)}
              >
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-label="Quick analysis"
                  onClick={(e) => e.stopPropagation()}
                  className={`max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border bg-white dark:bg-[#15152b] shadow-2xl ${DIVIDER}`}
                >
                  <div className={`flex items-center justify-between border-b px-5 sm:px-7 py-4 ${DIVIDER}`}>
                    <div>
                      <h2 className={`flex items-center gap-2 text-lg font-bold ${HEAD}`}>
                        <Zap size={18} style={{ color: ac.hex }} />
                        Quick analysis
                      </h2>
                      <p className={`text-xs mt-0.5 ${MUTED}`}>{format(viewDate, "MMMM yyyy")}</p>
                    </div>
                    <button
                      onClick={() => setShowQuickAnalysis(false)}
                      aria-label="Close"
                      className={`rounded-lg p-2 ${MUTED} hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] transition-colors ${FOCUS}`}
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="p-5 sm:p-7">{quickAnalysisContent()}</div>

                  <div className={`flex justify-end border-t px-5 sm:px-7 py-4 ${DIVIDER}`}>
                    <button
                      onClick={() => setShowQuickAnalysis(false)}
                      className={`rounded-lg border ${DIVIDER} px-5 py-2 text-sm font-semibold ${HEAD} hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] transition-colors ${FOCUS}`}
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
