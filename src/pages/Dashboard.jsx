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
  subWeeks,
} from "date-fns";
import { Card } from "../components/ui/card";
import { useNavigate } from "react-router-dom";
import { syncMT5Account } from "../lib/mt5client";
import { useTheme } from "../Theme-provider";
import {
  TrendingUp,
  Activity,
  Percent,
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
  Target,
  LineChart as LineChartIcon,
} from "lucide-react";
import {
  Chart as ChartJS,
  RadialLinearScale,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { Radar, Line } from "react-chartjs-2";
import { db, auth } from "../firebase";
import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  getDoc,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";

// ────────────────────────────────────────────────
// Animated number component
// ────────────────────────────────────────────────
const AnimatedNumber = ({ value, duration = 1500, decimals = 2 }) => {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const step = (timestamp) => {
      const progress = Math.min((timestamp - start) / duration, 1);
      setDisplay(value * progress);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [value, duration]);

  return <>{Number(display).toFixed(decimals)}</>;
};

// Helper to format numbers with commas and 2 decimals
const formatNumber = (num) => {
  if (num === undefined || num === null) return "0.00";
  return Number(num).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

ChartJS.register(
  RadialLinearScale,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

// Accent themes (the light / dark mode still follows the app theme)
const ACCENTS = {
  indigo: { name: "Indigo", hex: "#6366f1", hex2: "#a855f7" },
  emerald: { name: "Emerald", hex: "#10b981", hex2: "#06b6d4" },
  cyan: { name: "Ocean", hex: "#06b6d4", hex2: "#3b82f6" },
  amber: { name: "Amber", hex: "#f59e0b", hex2: "#ef4444" },
  rose: { name: "Rose", hex: "#f43f5e", hex2: "#ec4899" },
};

// A trade's date, whichever field the page that saved it used
const tDate = (t) => t?.date || t?.openDateTime || t?.closeDateTime || "";

const CARD =
  "rounded-2xl bg-white/80 dark:bg-gray-800/60 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg hover:shadow-xl transition-all duration-200";

const RADAR_LABELS = ["Win Rate", "Profit Factor", "Avg R:R", "Payoff", "Green Days", "Recovery"];

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
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState({ text: "", type: "" });
  const [accent, setAccent] = useState(() => {
    try {
      const saved = localStorage.getItem("forgexAccent");
      return ACCENTS[saved] ? saved : "indigo";
    } catch {
      return "indigo";
    }
  });
  const [curveRange, setCurveRange] = useState("month");
  const ac = ACCENTS[accent] || ACCENTS.indigo;

  useEffect(() => {
    try {
      localStorage.setItem("forgexAccent", accent);
    } catch {}
  }, [accent]);

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
      // Fetch account metadata
      const meta = await fetchAccountMeta(user, currentAccount.id);
      setAccountMeta(meta);

      // Fetch trades from the account's trades subcollection
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

    // Check if MT5 is connected
    if (!currentAccount.mt5Connected) {
      setSyncMessage({ 
        text: "Please connect your MT5 account first (open the account menu and tap 'Connect MT5 account')", 
        type: "error" 
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
      // New MetaApi-based sync (read-only investor connection). Never creates duplicates.
      const r = await syncMT5Account({ login: currentAccount.mt5Login, server: currentAccount.mt5Server });

      setSyncMessage({
        text: `Synced from MT5: ${r.added} new trade${r.added === 1 ? "" : "s"}, ${r.updated} updated.`,
        type: "success"
      });

      // Refresh the trades display
      await refreshTrades();

    } catch (error) {
      console.error('Sync failed:', error);
      setSyncMessage({ 
        text: error.message || 'Failed to sync trades from MT5', 
        type: "error" 
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
      } else if (
        (pnl > 0 && current === "Win") ||
        (pnl < 0 && current === "Loss")
      ) {
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
      const bestEntry = entries.reduce((max, curr) =>
        curr[1] > max[1] ? curr : max
      );
      const worstEntry = entries.reduce((min, curr) =>
        curr[1] < min[1] ? curr : min
      );
      bestDayPnL = bestEntry[1].toFixed(2);
      bestDayDate = format(new Date(bestEntry[0]), "dd MMM");
      worstDayPnL = worstEntry[1].toFixed(2);
      worstDayDate = format(new Date(worstEntry[0]), "dd MMM");

      const winningDays = entries.filter(([, pnl]) => pnl > 0);
      if (winningDays.length) {
        bestWinningDayPnl = Math.max(...winningDays.map(([, pnl]) => pnl));
      }
    }

    const totalRR = monthlyTrades.reduce(
      (sum, t) => sum + (Number(t.rr) || 0),
      0
    );
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
      avgPnL: (
        monthlyTrades.reduce((a, b) => a + Number(b.pnl || 0), 0) / total
      ).toFixed(2),
      bestDayPnL,
      bestDayDate,
      worstDayPnL,
      worstDayDate,
      avgRR,
      consistencyScore: consistencyScore.toFixed(1),
    };
  }, [monthlyTrades]);

  // ─── Monthly asset‑specific stats ─────────────────────────────
  const monthlyAssetStats = useMemo(() => {
    if (!monthlyTrades.length) {
      return {
        topPair: "—",
        totalLots: 0,
        assetPnL: [],
      };
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

    // Most traded pair
    let topPair = "—";
    let maxCount = 0;
    Object.entries(pairCount).forEach(([p, c]) => {
      if (c > maxCount) {
        maxCount = c;
        topPair = p;
      }
    });

    // Top 5 assets by absolute PnL
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
      weeks.push({
        label: format(weekStart, "dd MMM"),
        wins,
        losses,
        breakeven,
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
    return [...trades]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);
  }, [trades]);

  // ─── All-time total PnL ──────────────────────────────────────
  const allTimePnL = useMemo(() => {
    if (!trades.length) return 0;
    return trades.reduce((sum, t) => sum + Number(t.pnl || 0), 0).toFixed(2);
  }, [trades]);

  // ─── Account data ────────────────────────────────────────────
  const initialBalance = accountMeta?.starting_balance || 10000;
  const accountCreatedAt = accountMeta?.createdAt?.toDate?.() || new Date("2024-01-01");

  // ─── Account growth percentage ───────────────────────────────
  const accountGrowth = useMemo(() => {
    if (initialBalance <= 0) return 0;
    return ((allTimePnL / initialBalance) * 100).toFixed(1);
  }, [allTimePnL, initialBalance]);

  // ─── Quick Analysis Modal Content (unchanged) ────────────────
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

  const chartText = isDark ? "#9ca3af" : "#4b5563";
  const chartGrid = isDark ? "rgba(148,163,184,0.16)" : "rgba(100,116,139,0.2)";

  const radarChartData = {
    labels: RADAR_LABELS,
    datasets: [
      radarAll && {
        label: "All-time",
        data: radarAll.scores,
        borderColor: isDark ? "rgba(156,163,175,0.9)" : "rgba(107,114,128,0.9)",
        backgroundColor: "rgba(156,163,175,0.08)",
        borderDash: [5, 4],
        borderWidth: 1.5,
        pointRadius: 0,
      },
      radarMonth && {
        label: format(viewDate, "MMM yyyy"),
        data: radarMonth.scores,
        borderColor: ac.hex,
        backgroundColor: ac.hex + "40",
        borderWidth: 2.5,
        pointBackgroundColor: ac.hex,
        pointBorderColor: "#fff",
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
      tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${Math.round(c.parsed.r)}/100` } },
    },
  };

  const equityChartData = {
    labels: equity.labels,
    datasets: [
      {
        data: equity.values,
        borderColor: ac.hex,
        backgroundColor: ac.hex + "22",
        fill: true,
        tension: 0.35,
        borderWidth: 2.5,
        pointRadius: equity.count > 40 ? 0 : 3,
        pointHoverRadius: 5,
        pointBackgroundColor: ac.hex,
      },
    ],
  };

  const equityOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (c) => ` $${Number(c.parsed.y).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: chartText, maxTicksLimit: 6, maxRotation: 0 } },
      y: { grid: { color: chartGrid }, ticks: { color: chartText, maxTicksLimit: 5 } },
    },
  };

  const equityNet = equity.values[equity.values.length - 1] - equity.values[0];

  const quickAnalysisContent = () => {
    if (!monthlyTrades.length) {
      return (
        <div className="text-center py-10 px-4">
          <AlertCircle size={64} className="mx-auto text-indigo-400 mb-6 opacity-80" />
          <h3 className="text-2xl font-semibold mb-4 text-gray-200">
            No trades recorded this month
          </h3>
          <p className="text-gray-400 max-w-lg mx-auto leading-relaxed">
            Add some trades to unlock real-time performance insights, pattern detection,
            and personalized trading suggestions.
          </p>
          <button
            onClick={() => {
              setShowQuickAnalysis(false);
              navigate("/trades/new");
            }}
            className="mt-8 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md transition-all"
          >
            Add Your First Trade
          </button>
        </div>
      );
    }

    const winRate = Number(monthlyStats.winRate);
    const totalPnL = Number(monthlyStats.totalPnL);
    const avgRR = Number(monthlyStats.avgRR);
    const totalTrades = monthlyStats.totalTrades;

    return (
      <div className="space-y-8">
        {/* Performance Snapshot */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="p-6 bg-gray-900/70 rounded-2xl border border-gray-700 shadow-inner">
            <div className="text-sm text-gray-400 mb-2">Win Rate</div>
            <div className="text-4xl font-bold text-indigo-300">{winRate}%</div>
            <div className="mt-3 text-sm opacity-80 flex items-center gap-2">
              {winRate >= 60 ? (
                <CheckCircle className="text-emerald-400" size={18} />
              ) : winRate >= 45 ? (
                <AlertCircle className="text-amber-400" size={18} />
              ) : (
                <AlertCircle className="text-rose-400" size={18} />
              )}
              {winRate >= 60
                ? "Strong performance — protect your edge"
                : winRate >= 45
                ? "Solid base — improve reward:risk"
                : "Needs attention — focus on high-probability entries"}
            </div>
          </div>

          <div className="p-6 bg-gray-900/70 rounded-2xl border border-gray-700 shadow-inner">
            <div className="text-sm text-gray-400 mb-2">Net Result</div>
            <div
              className={`text-4xl font-bold ${
                totalPnL >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {totalPnL >= 0 ? "+" : ""}${Math.abs(totalPnL).toFixed(2)}
            </div>
            <div className="mt-3 text-sm opacity-80 flex items-center gap-2">
              {totalPnL >= 0 ? (
                <ArrowUpRight className="text-emerald-400" size={18} />
              ) : (
                <ArrowDownRight className="text-rose-400" size={18} />
              )}
              {totalPnL >= 0 ? "Positive month — manage greed" : "Drawdown — tighten risk now"}
            </div>
          </div>

          <div className="p-6 bg-gray-900/70 rounded-2xl border border-gray-700 shadow-inner">
            <div className="text-sm text-gray-400 mb-2">Average R:R</div>
            <div className="text-4xl font-bold text-purple-300">{avgRR}</div>
            <div className="mt-3 text-sm opacity-80 flex items-center gap-2">
              {avgRR >= 2.5 ? (
                <CheckCircle className="text-emerald-400" size={18} />
              ) : (
                <AlertCircle className="text-amber-400" size={18} />
              )}
              {avgRR >= 2.5
                ? "Excellent asymmetry — keep hunting"
                : "Can improve — aim for 1:3+ setups"}
            </div>
          </div>
        </div>

        {/* Personalized Suggestions */}
        <div className="p-6 bg-gradient-to-br from-gray-950 to-gray-900 rounded-2xl border border-gray-700 shadow-inner">
          <h4 className="text-xl font-semibold mb-5 flex items-center gap-3 text-gray-200">
            <Lightbulb size={22} className="text-yellow-400" />
            Instant Coaching Insights
          </h4>
          <div className="space-y-4 text-gray-300 text-sm leading-relaxed">
            {totalTrades < 15 && (
              <div className="flex items-start gap-3">
                <AlertCircle className="text-amber-400 mt-1 shrink-0" size={18} />
                <p>
                  Sample size still small ({totalTrades} trades). Aim for at least 20–30 trades before drawing strong conclusions.
                </p>
              </div>
            )}
            {winRate < 50 && (
              <div className="flex items-start gap-3">
                <AlertCircle className="text-rose-400 mt-1 shrink-0" size={18} />
                <p>
                  Win rate below 50% — be extra selective this week. Only take A+ setups.
                </p>
              </div>
            )}
            {avgRR < 2 && (
              <div className="flex items-start gap-3">
                <AlertCircle className="text-amber-400 mt-1 shrink-0" size={18} />
                <p>
                  Average reward:risk is low ({avgRR}). Focus on trades with minimum 1:2.5.
                </p>
              </div>
            )}
            <div className="flex items-start gap-3">
              <CheckCircle className="text-emerald-400 mt-1 shrink-0" size={18} />
              <p>Review your last 5 losing trades in detail. Fix one repeating mistake.</p>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="text-emerald-400 mt-1 shrink-0" size={18} />
              <p>Maintain risk at ≤1% per trade until win rate exceeds 55%.</p>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="text-emerald-400 mt-1 shrink-0" size={18} />
              <p>Journal every trade’s emotion and confidence level (1–10).</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // If no account is selected, show a message
  if (!currentAccount) {
    return (
      <div className={`min-h-screen w-full p-8 flex items-center justify-center ${isDark ? "bg-gray-950" : "bg-gray-50"}`}>
        <Card className="p-8 max-w-md text-center bg-white/80 dark:bg-gray-800/60 backdrop-blur-md">
          <AlertCircle size={48} className="mx-auto text-amber-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">No Account Selected</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Please create or select an account from the sidebar to view your dashboard.
          </p>
          <button
            onClick={() => {}}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
          >
            Create Account
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className={`relative min-h-screen w-full p-2 sm:p-6 lg:p-8 text-gray-100 ${isDark ? "bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950" : "bg-gradient-to-br from-gray-50 via-white to-gray-100"}`}>
      {/* Header + Account Details */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1
              className="text-3xl sm:text-4xl lg:text-5xl font-extrabold bg-clip-text text-transparent"
              style={{ backgroundImage: `linear-gradient(90deg, ${ac.hex}, ${ac.hex2})` }}
            >
              Forgex Dashboard
            </h1>
            <p className="mt-1.5 text-gray-400">
              {format(viewDate, "MMMM yyyy")} • {currentAccount?.name || "Account"}
              {currentAccount.mt5Connected && (
                <span className="ml-2 text-xs bg-green-600/20 text-green-400 px-2 py-1 rounded-full">
                  MT5 Connected
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-col gap-3 w-full sm:w-auto sm:items-end">
            {/* Accent theme picker */}
            <div className="flex items-center gap-2" role="radiogroup" aria-label="Accent theme">
              <Palette size={16} className="text-gray-400" />
              {Object.entries(ACCENTS).map(([key, a]) => (
                <button
                  key={key}
                  onClick={() => setAccent(key)}
                  title={a.name}
                  aria-label={`${a.name} theme`}
                  aria-pressed={accent === key}
                  className={`h-6 w-6 rounded-full transition-transform ${
                    accent === key
                      ? "ring-2 ring-offset-2 ring-offset-transparent ring-gray-500 dark:ring-white/70 scale-110"
                      : "opacity-80 hover:scale-110"
                  }`}
                  style={{ backgroundImage: `linear-gradient(135deg, ${a.hex}, ${a.hex2})` }}
                />
              ))}
            </div>
          <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={syncFromMT5}
              disabled={syncing}
              className={`flex flex-1 sm:flex-none justify-center items-center gap-2 px-3 sm:px-6 py-3 sm:py-3.5 text-sm sm:text-base rounded-xl shadow-md transition-all duration-200 ${
                syncing 
                  ? 'bg-gray-500 cursor-not-allowed' 
                  : currentAccount.mt5Connected
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-gray-600 hover:bg-gray-700 text-white opacity-50 cursor-not-allowed'
              }`}
              title={!currentAccount.mt5Connected ? 'Connect MT5 first in sidebar' : ''}
            >
              <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing...' : 'Sync from MT5'}
            </button>

            <button
              onClick={() => setShowQuickAnalysis(true)}
              style={{ backgroundColor: ac.hex }}
              className="flex flex-1 sm:flex-none justify-center items-center gap-2 px-3 sm:px-6 py-3 sm:py-3.5 text-sm sm:text-base hover:brightness-110 text-white rounded-xl shadow-md transition-all duration-200"
            >
              <Zap size={18} />
              Quick Analysis
            </button>
          </div>
          </div>
        </div>

        {/* Sync Message */}
        {syncMessage.text && (
          <div className={`mb-4 p-3 rounded-lg ${
            syncMessage.type === 'success' ? 'bg-green-500/20 text-green-200' :
            syncMessage.type === 'error' ? 'bg-red-500/20 text-red-200' :
            'bg-blue-500/20 text-blue-200'
          }`}>
            {syncMessage.text}
          </div>
        )}

        {/* Account Overview Card */}
        <Card className="p-4 sm:p-6 rounded-2xl bg-white/80 dark:bg-gray-800/60 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
          <h3 className="text-lg font-semibold mb-5 flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <DollarSign className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
            Account Overview
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Total PnL (All Time)</div>
              <div
                className={`text-2xl font-bold mt-1 ${
                  allTimePnL >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {allTimePnL >= 0 ? "+" : ""}${Math.abs(allTimePnL)}
              </div>
            </div>

            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Starting Balance</div>
              <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                ${initialBalance.toLocaleString()}
              </div>
            </div>

            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Account Growth</div>
              <div
                className={`text-2xl font-bold mt-1 ${
                  accountGrowth >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {accountGrowth}%
              </div>
            </div>

            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Created</div>
              <div className="text-xl font-medium text-gray-700 dark:text-gray-300 mt-1">
                {format(accountCreatedAt, "dd MMM yyyy")}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
        </div>
      ) : error ? (
        <div className="text-center p-8 text-rose-400">
          {error}
        </div>
      ) : (
        <>
          {/* Stats Cards (core metrics) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 lg:gap-5 mb-8">
            {[
              {
                title: "Monthly P&L",
                value: Number(monthlyStats.totalPnL),
                prefix: Number(monthlyStats.totalPnL) >= 0 ? "+" : "-",
                color: Number(monthlyStats.totalPnL) >= 0 ? "emerald" : "rose",
                icon: TrendingUp,
              },
              {
                title: "Win Rate",
                value: Number(monthlyStats.winRate),
                suffix: "%",
                color: "indigo",
                icon: Percent,
                animated: true,
              },
              {
                title: "Profit Factor",
                value: monthlyStats.profitFactor,
                color: "cyan",
                icon: Activity,
              },
              {
                title: "Consistency Score",
                value: Number(monthlyStats.consistencyScore),
                suffix: "%",
                color: "violet",
                icon: Zap,
                animated: true,
              },
              {
                title: "Total Trades",
                value: monthlyStats.totalTrades,
                color: "violet",
                icon: BarChart3,
                animated: true,
              },
              {
                title: "Expectancy",
                value: Number(monthlyStats.expectancy),
                prefix: "$",
                color: "teal",
                icon: DollarSign,
              },
            ].map((stat, i) => (
              <Card
                key={i}
                className="p-5 rounded-2xl bg-white/80 dark:bg-gray-800/60 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg hover:shadow-xl transition-all duration-200 group"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-medium text-gray-600 dark:text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                    {stat.title}
                  </div>
                  <stat.icon className="h-5 w-5 text-gray-500 dark:text-gray-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors" />
                </div>
                <div
                  className={`text-2xl sm:text-3xl font-extrabold ${
                    stat.color === "emerald"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : stat.color === "rose"
                      ? "text-rose-600 dark:text-rose-400"
                      : stat.color === "indigo"
                      ? "text-indigo-600 dark:text-indigo-400"
                      : stat.color === "cyan"
                      ? "text-cyan-600 dark:text-cyan-400"
                      : stat.color === "violet"
                      ? "text-violet-600 dark:text-violet-400"
                      : "text-teal-600 dark:text-teal-400"
                  }`}
                >
                  {stat.animated ? (
                    <AnimatedNumber value={stat.value} decimals={stat.decimals || 0} />
                  ) : (
                    <>
                      {stat.prefix || ""}
                      {stat.value}
                      {stat.suffix || ""}
                    </>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {/* New Row: Asset‑specific stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5 mb-8">
            {/* Most Traded Pair */}
            <Card className="p-5 rounded-2xl bg-white/80 dark:bg-gray-800/60 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg hover:shadow-xl transition-all duration-200">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Most Traded Pair</h3>
              <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                {monthlyAssetStats.topPair}
              </div>
              {monthlyAssetStats.topPairCount > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {monthlyAssetStats.topPairCount} trades this month
                </p>
              )}
            </Card>

            {/* Total Lot Size */}
            <Card className="p-5 rounded-2xl bg-white/80 dark:bg-gray-800/60 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg hover:shadow-xl transition-all duration-200">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Total Lot Size (Monthly)</h3>
              <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                {monthlyAssetStats.totalLots}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {monthlyTrades.length} trades
              </p>
            </Card>

            {/* Top Performing Assets */}
            <Card className="p-5 rounded-2xl bg-white/80 dark:bg-gray-800/60 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg hover:shadow-xl transition-all duration-200">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Top Assets by PnL</h3>
              <div className="space-y-2">
                {monthlyAssetStats.assetPnL.length > 0 ? (
                  monthlyAssetStats.assetPnL.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center text-sm">
                      <span className="font-medium truncate max-w-[100px]">{item.pair}</span>
                      <span
                        className={`font-bold ${
                          item.pnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {item.pnl >= 0 ? "+" : ""}${formatNumber(Math.abs(item.pnl))}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
                    No asset data
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Performance Radar + Equity Curve */}
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 lg:gap-6 mb-8">
            <Card className={`${CARD} xl:col-span-2 p-4 sm:p-6`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100">
                    <Target className="h-5 w-5" style={{ color: ac.hex }} />
                    Performance Radar
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {radarMonth ? `${format(viewDate, "MMMM yyyy")} vs all-time` : "All-time (no trades this month)"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Edge Score</div>
                  <div className="text-3xl font-extrabold leading-none mt-1" style={{ color: ac.hex }}>
                    {radarMain ? radarMain.edge : "—"}
                    <span className="text-sm font-semibold text-gray-400">/100</span>
                  </div>
                </div>
              </div>

              {radarMain ? (
                <>
                  <div className="relative h-72 sm:h-80">
                    <Radar data={radarChartData} options={radarOptions} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-4">
                    {RADAR_LABELS.map((label, i) => (
                      <div
                        key={label}
                        className="rounded-xl bg-gray-100/70 dark:bg-gray-900/40 px-2 py-2 text-center"
                      >
                        <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">{label}</div>
                        <div className="text-sm sm:text-base font-bold text-gray-900 dark:text-gray-100">
                          {radarMain.raw[i]}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="h-72 flex flex-col items-center justify-center text-center text-gray-500 dark:text-gray-400 gap-2">
                  <Target size={40} className="opacity-40" />
                  <p className="text-sm">Add trades to see your performance radar.</p>
                </div>
              )}
            </Card>

            <Card className={`${CARD} xl:col-span-3 p-4 sm:p-6`}>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100">
                    <LineChartIcon className="h-5 w-5" style={{ color: ac.hex }} />
                    Equity Curve
                  </h3>
                  <p
                    className={`text-sm font-semibold mt-1 ${
                      equityNet >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {equityNet >= 0 ? "+" : "-"}${formatNumber(Math.abs(equityNet))}
                    <span className="font-normal text-gray-500 dark:text-gray-400">
                      {" "}
                      · {equity.count} trades
                    </span>
                  </p>
                </div>
                <div className="flex rounded-xl bg-gray-100 dark:bg-gray-900/50 p-1 text-sm">
                  {[
                    ["month", "This month"],
                    ["all", "All-time"],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setCurveRange(key)}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                        curveRange === key
                          ? "text-white shadow"
                          : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                      }`}
                      style={curveRange === key ? { backgroundColor: ac.hex } : undefined}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {equity.count ? (
                <div className="relative h-64 sm:h-80 xl:h-[22rem]">
                  <Line data={equityChartData} options={equityOptions} />
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-center text-gray-500 dark:text-gray-400 gap-2">
                  <LineChartIcon size={40} className="opacity-40" />
                  <p className="text-sm">No trades in this range yet.</p>
                </div>
              )}
            </Card>
          </div>

          {/* Recent Trades + Weekly Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
            <Card className="lg:col-span-2 p-3 sm:p-5 lg:p-6 rounded-2xl bg-white/80 dark:bg-gray-800/60 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg hover:shadow-xl transition-all duration-200">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100">
                  <Activity className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
                  Recent Trades
                </h3>
                <button
                  onClick={() => navigate("/trades")}
                  className="text-sm flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                >
                  View All →
                </button>
              </div>

              {recentTrades.length === 0 ? (
                <div className="text-center py-12 rounded-xl bg-white/50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400">
                  No recent trades yet
                </div>
              ) : (
                <div className="space-y-3">
                  {recentTrades.map((trade, i) => (
                    <div
                      key={i}
                      onClick={() => navigate(`/trades?date=${format(new Date(trade.date), "yyyy-MM-dd")}`)}
                      className="flex items-center justify-between p-4 rounded-xl bg-white/60 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700/60 transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-12 h-12 rounded-xl flex items-center justify-center text-base font-bold shadow-sm ${
                            trade.pnl >= 0
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                              : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                          }`}
                        >
                          {trade.pair?.slice(0, 2) || "T"}
                        </div>
                        <div>
                          <div className="font-semibold text-gray-900 dark:text-gray-100">
                            {trade.pair} {trade.direction}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            {format(new Date(trade.date), "dd MMM yyyy • HH:mm")}
                          </div>
                        </div>
                      </div>
                      <div
                        className={`font-bold text-lg ${
                          trade.pnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {trade.pnl >= 0 ? "+" : ""}${Math.abs(Number(trade.pnl || 0)).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Weekly Breakdown Card */}
            <Card className="p-3 sm:p-5 lg:p-6 rounded-2xl bg-white/80 dark:bg-gray-800/60 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg hover:shadow-xl transition-all duration-200">
              <h3 className="text-lg font-semibold mb-5 flex items-center gap-2 text-gray-900 dark:text-gray-100">
                <BarChart3 className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
                Weekly Performance
              </h3>

              <div className="space-y-4">
                {weeklyBreakdown.map((week, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span className="text-gray-400 w-16">{week.label}</span>
                    <div className="flex gap-3">
                      <span className="text-emerald-400 font-medium">{week.wins}W</span>
                      <span className="text-rose-400 font-medium">{week.losses}L</span>
                      <span className="text-gray-500 font-medium">{week.breakeven}B</span>
                    </div>
                    <span className="text-gray-300 font-semibold">
                      {week.total} trades
                    </span>
                  </div>
                ))}
                {weeklyBreakdown.every((w) => w.total === 0) && (
                  <div className="text-center py-6 text-gray-500">No trades in last 4 weeks</div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-gray-700">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">Current Streak</span>
                  <span
                    className={`font-bold ${
                      currentStreak.type === "Win"
                        ? "text-emerald-400"
                        : currentStreak.type === "Loss"
                        ? "text-rose-400"
                        : "text-gray-400"
                    }`}
                  >
                    {currentStreak.type === "None" ? "—" : `${currentStreak.count} ${currentStreak.type}`}
                  </span>
                </div>
              </div>
            </Card>
          </div>

          {/* Calendar (unchanged) */}
          <Card className="p-3 sm:p-5 lg:p-6 rounded-2xl bg-white/80 dark:bg-gray-800/60 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={prevMonth}
                  className={`p-3 rounded-xl transition-all shadow-sm hover:shadow-md ${
                    isDark ? "bg-gray-800 text-gray-300 hover:bg-gray-700" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  ◀
                </button>
                <button
                  onClick={() => {
                    const res = prompt("Enter month (YYYY-MM)");
                    if (res && /^\d{4}-\d{2}$/.test(res)) {
                      const [y, m] = res.split("-").map(Number);
                      jumpTo(y, m);
                    }
                  }}
                  className={`px-5 py-3 rounded-xl border transition-all shadow-sm hover:shadow-md ${
                    isDark ? "bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700" : "bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {format(viewDate, "MMMM yyyy")}
                </button>
                <button
                  onClick={nextMonth}
                  className={`p-3 rounded-xl transition-all shadow-sm hover:shadow-md ${
                    isDark ? "bg-gray-800 text-gray-300 hover:bg-gray-700" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  ▶
                </button>
              </div>
              <span className="text-sm font-medium text-gray-400 dark:text-gray-400">
                Tap a day to view trades
              </span>
            </div>

            <div className="sm:overflow-x-auto">
              <div className="grid grid-cols-7 sm:grid-cols-8 sm:min-w-[640px] gap-1 sm:gap-2">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Wk"].map((d) => (
                  <div
                    key={d}
                    className={`text-[10px] sm:text-xs font-medium text-center py-2 sm:py-3 ${d === "Wk" ? "hidden sm:block" : ""} ${isDark ? "text-gray-400" : "text-gray-600"}`}
                  >
                    {d === "Wk" ? d : d.slice(0, 1)}<span className="hidden sm:inline">{d === "Wk" ? "" : d.slice(1)}</span>
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
                        const intensity = Math.min(Math.abs(pnl) / 1500, 0.6);

                        return (
                          <div
                            key={di}
                            onClick={() => openDay(dayObj)}
                            className={`
                              cursor-pointer aspect-square rounded-lg sm:rounded-xl p-0.5 sm:p-2 flex flex-col justify-between border transition-all duration-300
                              ${isCur
                                ? isDark
                                  ? "bg-gray-900/70 border-indigo-500/30"
                                  : "bg-white/80 border-gray-200"
                                : isDark
                                ? "bg-transparent border-dashed border-gray-700/40"
                                : "bg-transparent border-dashed border-gray-300"}
                              hover:shadow-xl hover:scale-[1.03] hover:border-indigo-400
                            `}
                            style={{
                              backgroundColor: pnl > 0
                                ? `rgba(34, 197, 94, ${intensity})`
                                : pnl < 0
                                ? `rgba(239, 68, 68, ${intensity})`
                                : undefined,
                            }}
                          >
                            <div className={`text-xs text-center ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                              {format(dayObj, "d")}
                            </div>
                            <div className="flex-1 flex flex-col items-center justify-center text-center">
                              {ds ? (
                                <>
                                  <div
                                    className={`font-bold text-[10px] sm:text-sm leading-tight ${
                                      pnl >= 0
                                        ? "text-emerald-400"
                                        : "text-rose-400"
                                    }`}
                                  >
                                    <span className="sm:hidden">{pnl >= 0 ? "+" : "-"}{Math.abs(pnl).toFixed(0)}</span>
                                    <span className="hidden sm:inline">{pnl >= 0 ? "+" : ""}${Math.abs(pnl).toFixed(2)}</span>
                                  </div>
                                  <div className={`hidden sm:block text-[10px] ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                                    {ds.count}t • {ds.winRate}%
                                  </div>
                                </>
                              ) : (
                                <div className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>—</div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Weekly Summary */}
                      <div
                        className={`hidden sm:flex aspect-square rounded-xl p-1.5 sm:p-2 flex-col justify-center items-center border ${
                          isDark ? "bg-gray-800/50 border-gray-700" : "bg-gray-100/50 border-gray-200"
                        }`}
                      >
                        <div className={`text-xs mb-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                          W{wi + 1}
                        </div>
                        <div
                          className={`text-sm font-bold ${
                            wSum.pnl >= 0
                              ? "text-emerald-400"
                              : "text-rose-400"
                          }`}
                        >
                          {wSum.pnl >= 0 ? "+" : ""}${Math.abs(wSum.pnl).toFixed(2)}
                        </div>
                        <div className={`text-[10px] ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                          {wSum.count}t • {wSum.winRate}%
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* Floating Quick Add Button */}
          <button
            onClick={() => navigate("/trades/new")}
            style={{ backgroundColor: ac.hex }}
            className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-[1000] w-14 h-14 rounded-full hover:brightness-110 text-white shadow-lg transition-all duration-200 flex items-center justify-center transform hover:scale-110 active:scale-95"
            aria-label="Add New Trade"
          >
            <span className="text-3xl font-bold leading-none">+</span>
          </button>

          {/* Quick Analysis Modal */}
          {showQuickAnalysis && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[2000] p-4">
              <div className="w-full max-w-3xl rounded-2xl bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-2xl overflow-hidden">
                <div className="p-6 sm:p-8">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent">
                      Quick Analysis
                    </h2>
                    <button
                      onClick={() => setShowQuickAnalysis(false)}
                      className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      <X size={28} />
                    </button>
                  </div>

                  {quickAnalysisContent()}

                  <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                    <button
                      onClick={() => setShowQuickAnalysis(false)}
                      className="px-6 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-xl transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
