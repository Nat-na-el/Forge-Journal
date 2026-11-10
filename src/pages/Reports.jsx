// src/pages/Reports.jsx
// Trade reports built on the same Firestore trades the rest of the app uses.
// Tabs: Performance · Symbols · Sessions · Tags · Risk.
import React, { useEffect, useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, subMonths, isWithinInterval } from "date-fns";
import { collection, getDocs } from "firebase/firestore";
import { auth, db } from "../firebase";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { useTheme } from "../Theme-provider";
import useAccent from "../hooks/useAccent";
import AccentPicker from "../components/ui/AccentPicker";
import {
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BarChart3,
  Calendar,
  Clock,
  Download,
  Layers,
  Percent,
  Receipt,
  Shield,
  Tag,
  Target,
  TrendingUp,
} from "lucide-react";
import {
  POS,
  NEG,
  POS_T,
  NEG_T,
  MUTED,
  HEAD,
  DIVIDER,
  CARD,
  FOCUS,
} from "../lib/uiTokens";
import {
  DAYS,
  HOUR_BUCKETS,
  SESSIONS,
  avg,
  dayHourHeatmap,
  dayOfWeek,
  drawdown,
  equityCurve,
  excursionStats,
  feeStats,
  formatDuration,
  groupStats,
  holdMinutes,
  holdTimeDistribution,
  hourBucket,
  mistakeBreakdown,
  money,
  pct,
  ratio,
  realisedR,
  rDistribution,
  ratingBreakdown,
  sessionOf,
  streaks,
  tradeDate,
  tradeStats,
} from "../lib/analytics";
import { StarRating } from "../components/ui/TradeGrading";

// ─── Shared bits ─────────────────────────────────────────────────────────────

const PERIODS = [
  ["this-month", "This month"],
  ["last-30", "Last 30 days"],
  ["this-year", "This year"],
  ["all", "All time"],
];

// Breakeven band: results inside ±N R count as a scratch instead of a win/loss.
const BAND_KEY = "forgexBreakevenBand";
const BAND_OPTIONS = [
  [0, "Off"],
  [0.05, "±0.05R"],
  [0.1, "±0.10R"],
  [0.2, "±0.20R"],
  [0.3, "±0.30R"],
  [0.5, "±0.50R"],
];

const readBand = () => {
  try {
    const saved = Number(localStorage.getItem(BAND_KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : 0;
  } catch {
    return 0;
  }
};

const TABS = [
  ["performance", "Performance", TrendingUp],
  ["symbols", "Symbols", BarChart3],
  ["sessions", "Sessions", Clock],
  ["tags", "Tags & playbooks", Tag],
  ["discipline", "Discipline", Award],
  ["risk", "Risk", Shield],
];

const TH = `px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide ${MUTED}`;
const TD = "px-3 py-2.5 text-sm tabular-nums";

function Kpi({ label, value, tone = HEAD, sub }) {
  return (
    <div className="bg-white px-4 py-4 dark:bg-[#15152b]">
      <div className={`text-[11px] font-medium ${MUTED}`}>{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums sm:text-2xl ${tone}`}>{value}</div>
      {sub ? <div className={`mt-0.5 text-[11px] ${MUTED}`}>{sub}</div> : null}
    </div>
  );
}

function Panel({ title, icon: Icon, accent, right, children, className = "" }) {
  return (
    <Card className={`${CARD} ${className}`}>
      <div className={`flex items-center justify-between gap-3 border-b px-4 py-3 ${DIVIDER}`}>
        <h3 className={`flex items-center gap-2 text-[15px] font-semibold ${HEAD}`}>
          {Icon ? <Icon size={16} style={{ color: accent }} /> : null}
          {title}
        </h3>
        {right ? <span className={`text-xs ${MUTED}`}>{right}</span> : null}
      </div>
      {children}
    </Card>
  );
}

function Empty({ icon: Icon = BarChart3, title, hint }) {
  return (
    <div className="px-4 py-12 text-center">
      <Icon size={32} className={`mx-auto mb-3 opacity-40 ${MUTED}`} />
      <p className={`text-sm font-semibold ${HEAD}`}>{title}</p>
      {hint ? <p className={`mx-auto mt-1 max-w-sm text-xs ${MUTED}`}>{hint}</p> : null}
    </div>
  );
}

/** Tint a table cell by signed net P&L intensity (0..1 → green / red). */
function heatTint(net, maxAbs) {
  const t = Math.max(0, Math.min(1, Math.abs(net) / maxAbs));
  const g = Math.round(34 + 160 * t);
  const r = Math.round(242 - 120 * t);
  const b = Math.round(85 + 80 * t);
  return net >= 0 ? `rgb(${r},${g},${b})` : `rgb(${r},${g - 40},${b - 30})`;
}

function EquityChart({ points, color }) {
  if (points.length < 2) {
    return (
      <div className="flex h-56 items-center justify-center">
        <p className={`text-sm ${MUTED}`}>Log at least two closed trades to see your equity curve.</p>
      </div>
    );
  }

  const W = 800;
  const H = 240;
  const PAD = 10;
  const values = points.map((p) => p.value);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const x = (i) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (v) => PAD + (1 - (v - min) / span) * (H - PAD * 2);

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(min).toFixed(1)} L${x(0).toFixed(1)},${y(min).toFixed(1)} Z`;
  const zeroY = y(0);
  const last = points[points.length - 1].value;

  return (
    <div className="p-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full" preserveAspectRatio="none" role="img" aria-label="Cumulative P&L curve">
        <defs>
          <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={0} x2={W} y1={zeroY} y2={zeroY} stroke="currentColor" strokeOpacity="0.15" strokeDasharray="4 4" />
        <path d={area} fill="url(#equityFill)" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className={`mt-3 flex items-center justify-between border-t pt-3 text-xs ${DIVIDER}`}>
        <span className={MUTED}>
          {points.length} closed trades
          {points[0].date && points[points.length - 1].date
            ? ` · ${format(points[0].date, "d MMM yy")} → ${format(points[points.length - 1].date, "d MMM yy")}`
            : ""}
        </span>
        <span className={`font-bold tabular-nums ${last >= 0 ? POS_T : NEG_T}`}>{money(last)}</span>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Reports({ currentAccount }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { accent, setAccent, ac } = useAccent();

  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("this-month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [tab, setTab] = useState("performance");
  const [beBand, setBeBand] = useState(readBand);

  const accountId = currentAccount?.id;

  useEffect(() => {
    try {
      localStorage.setItem(BAND_KEY, String(beBand));
    } catch {
      // Storage can be blocked; the band simply resets next visit.
    }
  }, [beBand]);

  const statOptions = useMemo(() => ({ breakevenBand: beBand }), [beBand]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const user = auth.currentUser;
      if (!user || !accountId) {
        if (!cancelled) {
          setTrades([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError("");
      try {
        // Not ordered on purpose: Firestore drops documents missing the orderBy
        // field, and older trades have no `createdAt`. Sort client-side instead.
        const snap = await getDocs(
          collection(db, "users", user.uid, "accounts", accountId, "trades")
        );
        if (!cancelled) {
          setTrades(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
      } catch (err) {
        console.error("Reports fetch error:", err);
        if (!cancelled) {
          setError("Could not load your trades. Check your connection and try again.");
          setTrades([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const filteredTrades = useMemo(() => {
    const now = new Date();
    let start;
    let end;

    if (period === "this-month") {
      start = startOfMonth(now);
      end = endOfMonth(now);
    } else if (period === "last-30") {
      start = subMonths(now, 1);
      end = now;
    } else if (period === "this-year") {
      start = new Date(now.getFullYear(), 0, 1);
      end = now;
    } else if (period === "custom") {
      if (!customStart || !customEnd) return trades;
      start = new Date(`${customStart}T00:00:00`);
      end = new Date(`${customEnd}T23:59:59`);
    } else {
      return trades;
    }

    return trades.filter((trade) => {
      const date = tradeDate(trade);
      if (!date) return false;
      return isWithinInterval(date, { start, end });
    });
  }, [trades, period, customStart, customEnd]);

  const stats = useMemo(() => tradeStats(filteredTrades, statOptions), [filteredTrades, statOptions]);
  const curve = useMemo(() => equityCurve(filteredTrades), [filteredTrades]);
  const maxDD = useMemo(() => drawdown(filteredTrades), [filteredTrades]);
  const runs = useMemo(() => streaks(filteredTrades), [filteredTrades]);

  const symbolRows = useMemo(
    () => groupStats(filteredTrades, (t) => (t.pair || "").toUpperCase().trim(), statOptions),
    [filteredTrades, statOptions]
  );

  const dayRows = useMemo(() => {
    const groups = groupStats(
      filteredTrades.filter((t) => tradeDate(t)),
      (t) => dayOfWeek(tradeDate(t)),
      statOptions
    );
    const byKey = Object.fromEntries(groups.map((g) => [g.key, g]));
    return DAYS.map((day) => byKey[day] || { key: day, count: 0, winRate: 0, net: 0 });
  }, [filteredTrades, statOptions]);

  const hourRows = useMemo(() => {
    const groups = groupStats(
      filteredTrades.filter((t) => tradeDate(t)),
      (t) => hourBucket(tradeDate(t)),
      statOptions
    );
    const byKey = Object.fromEntries(groups.map((g) => [g.key, g]));
    return HOUR_BUCKETS.map((bucket) => byKey[bucket] || { key: bucket, count: 0, winRate: 0, net: 0 });
  }, [filteredTrades, statOptions]);

  const sessionRows = useMemo(() => {
    const groups = groupStats(
      filteredTrades.filter((t) => tradeDate(t)),
      (t) => sessionOf(tradeDate(t))?.key,
      statOptions
    );
    const byKey = Object.fromEntries(groups.map((g) => [g.key, g]));
    return SESSIONS.map((s) => ({ ...s, ...(byKey[s.key] || { count: 0, winRate: 0, net: 0 }) }));
  }, [filteredTrades, statOptions]);

  const tagRows = useMemo(() => {
    const tagged = [];
    filteredTrades.forEach((trade) => {
      const tags = Array.isArray(trade.confluences) ? trade.confluences : [];
      tags.forEach((tag) => tagged.push({ ...trade, __tag: tag }));
    });
    return groupStats(tagged, (t) => t.__tag, statOptions).slice(0, 20);
  }, [filteredTrades, statOptions]);

  // Prefer the linked playbook name, then fall back to free-text strategy so
  // trades logged before playbooks existed still group sensibly.
  const playbookRows = useMemo(
    () => groupStats(filteredTrades, (t) => (t.playbook || t.strategy || "").trim(), statOptions),
    [filteredTrades, statOptions]
  );

  const rRows = useMemo(() => rDistribution(filteredTrades), [filteredTrades]);
  const maxRBucket = Math.max(1, ...rRows.map((b) => b.count));

  const ratingData = useMemo(
    () => ratingBreakdown(filteredTrades, statOptions),
    [filteredTrades, statOptions]
  );
  const mistakeRows = useMemo(
    () => mistakeBreakdown(filteredTrades, statOptions),
    [filteredTrades, statOptions]
  );
  const heatmap = useMemo(() => dayHourHeatmap(filteredTrades), [filteredTrades]);
  const heatMax = Math.max(1, ...heatmap.grid.flat().map((cell) => Math.abs(cell.net)));
  const fees = useMemo(() => feeStats(filteredTrades), [filteredTrades]);
  const excursions = useMemo(() => excursionStats(filteredTrades), [filteredTrades]);
  const holdRows = useMemo(() => holdTimeDistribution(filteredTrades), [filteredTrades]);
  const maxHoldBucket = Math.max(1, ...holdRows.map((b) => b.count));
  const goodNet = ratingData.buckets
    .filter((b) => b.rating >= 4)
    .reduce((sum, b) => sum + b.net, 0);
  const badNet = ratingData.buckets
    .filter((b) => b.rating <= 2)
    .reduce((sum, b) => sum + b.net, 0);

  const longShort = useMemo(() => {
    const side = (label, re) => {
      const group = filteredTrades.filter((t) => re.test(t.direction || ""));
      return { label, ...tradeStats(group, statOptions) };
    };
    return [side("Long", /^(long|buy)/i), side("Short", /^(short|sell)/i)];
  }, [filteredTrades, statOptions]);

  const avgHold = useMemo(() => {
    const durations = filteredTrades.map(holdMinutes).filter((v) => v !== null);
    return durations.length ? avg(durations) : null;
  }, [filteredTrades]);

  const monthlyTrend = useMemo(() => {
    const months = [];
    for (let i = 11; i >= 0; i -= 1) {
      const d = subMonths(new Date(), i);
      months.push({ key: format(d, "yyyy-MM"), label: format(d, "MMM"), pnl: 0 });
    }
    const byKey = Object.fromEntries(months.map((m) => [m.key, m]));
    trades.forEach((trade) => {
      const date = tradeDate(trade);
      if (!date) return;
      const bucket = byKey[format(date, "yyyy-MM")];
      if (bucket) bucket.pnl += Number(trade.pnl) || 0;
    });
    const maxAbs = Math.max(1, ...months.map((m) => Math.abs(m.pnl)));
    return { months, maxAbs };
  }, [trades]);

  const exportReport = () => {
    if (!filteredTrades.length) return;

    const headers = [
      "Date",
      "Symbol",
      "Direction",
      "Entry",
      "Exit",
      "Stop loss",
      "Take profit",
      "PnL",
      "R",
      "Realised R",
      "Commission",
      "Swap",
      "MAE (R)",
      "MFE (R)",
      "Playbook",
      "Strategy",
      "Tags",
      "Rating",
      "Mistakes",
      "Notes",
    ];

    const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

    const rows = filteredTrades.map((t) => {
      const date = tradeDate(t);
      const r = realisedR(t);
      return [
        date ? format(date, "yyyy-MM-dd HH:mm") : "",
        t.pair || "",
        t.direction || "",
        t.entry ?? "",
        t.exit ?? "",
        t.stopLoss ?? "",
        t.takeProfit ?? "",
        t.pnl ?? 0,
        t.rr ?? "",
        r === null ? "" : r.toFixed(2),
        t.commission ?? "",
        t.swap ?? "",
        t.mae ?? "",
        t.mfe ?? "",
        escape(t.playbook || ""),
        escape(t.strategy || ""),
        escape((t.confluences || []).join(" | ")),
        t.rating || "",
        escape((t.mistakes || []).join(" | ")),
        escape(t.notes || ""),
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `report-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const winAngle = Math.max(0, Math.min(360, Math.round((stats.winRate / 100) * 360)));
  const netTone = stats.net >= 0 ? POS_T : NEG_T;

  return (
    <div
      className={`${isDark ? "dark bg-[#0b0b19] text-[#e8e9f7]" : "bg-[#f4f5fa] text-[#14142b]"} min-h-screen w-full p-3 sm:p-6 lg:p-8`}
    >
      <div className="mx-auto max-w-[1600px]">
        {/* Header */}
        <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <h1 className={`text-2xl font-bold tracking-tight sm:text-3xl ${HEAD}`}>Reports</h1>
            <p className={`mt-1 text-sm ${MUTED}`}>
              Performance, symbols, sessions and risk — straight from your trade log
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <AccentPicker accent={accent} setAccent={setAccent} className="mr-1" />
            <Button
              onClick={exportReport}
              disabled={!filteredTrades.length || loading}
              style={{ backgroundColor: ac.hex }}
              className="font-semibold text-white hover:brightness-110 disabled:opacity-50"
            >
              <Download size={16} className="mr-2" /> Export CSV
            </Button>
          </div>
        </div>

        {/* Period toolbar */}
        <Card className={`${CARD} mb-4 p-3 sm:p-4`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex items-center gap-2">
              <Calendar size={16} className={MUTED} />
              <span className={`text-xs font-semibold ${MUTED}`}>Time period</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg bg-[#e9eaf4] p-1 text-xs dark:bg-[#101024]" role="group" aria-label="Time period">
                {PERIODS.map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setPeriod(key)}
                    aria-pressed={period === key}
                    className={`rounded-md px-3 py-1.5 font-semibold transition-colors ${FOCUS} ${
                      period === key ? "text-white shadow-sm" : `${MUTED} hover:text-[#14142b] dark:hover:text-white`
                    }`}
                    style={period === key ? { backgroundColor: ac.hex } : undefined}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => {
                    setCustomStart(e.target.value);
                    setPeriod("custom");
                  }}
                  className={`h-9 rounded-lg border ${DIVIDER} bg-white px-2.5 text-xs outline-none focus:ring-2 focus:ring-[#6C47FF] dark:bg-[#101024]`}
                  aria-label="Custom start date"
                />
                <span className={`text-xs ${MUTED}`}>to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => {
                    setCustomEnd(e.target.value);
                    setPeriod("custom");
                  }}
                  className={`h-9 rounded-lg border ${DIVIDER} bg-white px-2.5 text-xs outline-none focus:ring-2 focus:ring-[#6C47FF] dark:bg-[#101024]`}
                  aria-label="Custom end date"
                />
              </div>

              <label className="flex items-center gap-1.5 text-xs">
                <span className={`font-semibold ${MUTED}`}>Breakeven band</span>
                <select
                  value={beBand}
                  onChange={(e) => setBeBand(Number(e.target.value))}
                  className={`h-9 rounded-lg border ${DIVIDER} bg-white px-2 text-xs outline-none focus:ring-2 focus:ring-[#6C47FF] dark:bg-[#101024]`}
                  aria-label="Breakeven band in R"
                >
                  {BAND_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <span className={`ml-auto text-xs font-medium ${MUTED}`}>
                {filteredTrades.length} trades in range
              </span>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <div className="mb-4 flex flex-wrap gap-1.5 overflow-x-auto">
          {TABS.map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors ${FOCUS} ${
                tab === key
                  ? "border-transparent text-white shadow-sm"
                  : `${DIVIDER} bg-white ${MUTED} hover:text-[#14142b] dark:bg-[#15152b] dark:hover:text-white`
              }`}
              style={tab === key ? { backgroundColor: ac.hex } : undefined}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex h-72 items-center justify-center">
            <div
              className="h-10 w-10 animate-spin rounded-full border-2 border-[#e6e8f2] dark:border-[#262645]"
              style={{ borderTopColor: ac.hex }}
              role="progressbar"
              aria-label="Loading reports"
            />
          </div>
        ) : error ? (
          <Card className={`${CARD} p-10 text-center`}>
            <p className={`text-sm font-semibold ${HEAD}`}>{error}</p>
          </Card>
        ) : filteredTrades.length === 0 ? (
          <Card className={`${CARD} p-10 text-center`}>
            <BarChart3 size={36} className={`mx-auto mb-3 opacity-40 ${MUTED}`} />
            <p className={`text-lg font-semibold ${HEAD}`}>No trades for this period</p>
            <p className={`mx-auto mb-5 mt-1 max-w-md text-sm ${MUTED}`}>
              Pick another time range, or log a trade and it will show up here immediately.
            </p>
            <Button
              onClick={() => setPeriod("all")}
              style={{ backgroundColor: ac.hex }}
              className="font-semibold text-white hover:brightness-110"
            >
              Show all time
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* KPI strip — shared by every tab */}
            <Card className={`${CARD} overflow-hidden`}>
              <div className="grid grid-cols-2 gap-px bg-[#e6e8f2] dark:bg-[#262645] md:grid-cols-3 lg:grid-cols-6">
                <Kpi label="Net P&L" value={money(stats.net)} tone={netTone} sub={`${stats.count} closed`} />
                <Kpi label="Win rate" value={pct(stats.winRate)} sub={`${stats.wins}W · ${stats.losses}L · ${stats.breakeven}BE`} />
                <Kpi label="Profit factor" value={ratio(stats.profitFactor)} />
                <Kpi label="Expectancy" value={money(stats.expectancy)} tone={stats.expectancy >= 0 ? POS_T : NEG_T} sub="per trade" />
                <Kpi label="Avg win / loss" value={`${money(stats.avgWin)} / ${money(-stats.avgLoss)}`} />
                <Kpi label="Max drawdown" value={money(-maxDD)} tone={maxDD > 0 ? NEG_T : HEAD} />
              </div>
            </Card>

            {/* ── Performance ─────────────────────────────────────────── */}
            {tab === "performance" && (
              <>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                  <Panel title="Equity curve" icon={TrendingUp} accent={ac.hex} right="Cumulative P&L">
                    <EquityChart points={curve} color={ac.hex} />
                  </Panel>

                  <Panel title="Win / loss split" icon={Percent} accent={ac.hex} right={`${stats.count} trades`}>
                    <div className="flex flex-col items-center gap-5 p-5 sm:flex-row">
                      <div
                        className="relative h-36 w-36 shrink-0 rounded-full"
                        style={{ background: `conic-gradient(${POS} 0deg ${winAngle}deg, ${NEG} ${winAngle}deg 360deg)` }}
                      >
                        <div className="absolute inset-[14px] flex flex-col items-center justify-center rounded-full bg-white dark:bg-[#15152b]">
                          <span className={`text-3xl font-bold tabular-nums ${HEAD}`}>{Math.round(stats.winRate)}%</span>
                          <span className={`text-[10px] uppercase tracking-wider ${MUTED}`}>win rate</span>
                        </div>
                      </div>
                      <div className="w-full space-y-3">
                        {[
                          ["Wins", stats.wins, POS_T],
                          ["Losses", stats.losses, NEG_T],
                          ["Break-even", stats.breakeven, HEAD],
                        ].map(([label, value, tone]) => (
                          <div key={label} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${DIVIDER}`}>
                            <span className={`text-sm ${MUTED}`}>{label}</span>
                            <span className={`text-sm font-bold tabular-nums ${tone}`}>{value}</span>
                          </div>
                        ))}
                        <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${DIVIDER}`}>
                          <span className={`text-sm ${MUTED}`}>Payoff ratio</span>
                          <span className={`text-sm font-bold tabular-nums ${HEAD}`}>{ratio(stats.payoff)}</span>
                        </div>
                      </div>
                    </div>
                  </Panel>
                </div>

                <Panel title="Monthly P&L" icon={Calendar} accent={ac.hex} right="Last 12 months">
                  <div className="p-4">
                    <div className="flex h-56 items-end gap-1.5 sm:gap-2.5">
                      {monthlyTrend.months.map((m) => {
                        const h = Math.max(3, (Math.abs(m.pnl) / monthlyTrend.maxAbs) * 100);
                        return (
                          <div key={m.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                            <div className="group relative flex w-full flex-1 items-end justify-center">
                              <div
                                className="w-full rounded-t transition-all duration-500"
                                style={{
                                  height: `${h}%`,
                                  backgroundColor: m.pnl >= 0 ? POS : NEG,
                                  opacity: m.pnl === 0 ? 0.25 : 0.9,
                                }}
                                title={`${m.label}: ${money(m.pnl)}`}
                              />
                            </div>
                            <span className={`text-[10px] font-medium ${MUTED}`}>{m.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Panel>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Panel title="Best trade" icon={ArrowUpRight} accent={POS}>
                    <div className="p-4">
                      <div className={`text-2xl font-bold tabular-nums ${POS_T}`}>{money(stats.best)}</div>
                      <p className={`mt-1 text-xs ${MUTED}`}>Largest single winner in this period</p>
                    </div>
                  </Panel>
                  <Panel title="Worst trade" icon={ArrowDownRight} accent={NEG}>
                    <div className="p-4">
                      <div className={`text-2xl font-bold tabular-nums ${NEG_T}`}>{money(stats.worst)}</div>
                      <p className={`mt-1 text-xs ${MUTED}`}>Largest single loss in this period</p>
                    </div>
                  </Panel>
                </div>
              </>
            )}

            {/* ── Symbols ─────────────────────────────────────────────── */}
            {tab === "symbols" && (
              <Panel title="Symbol performance" icon={BarChart3} accent={ac.hex} right={`${symbolRows.length} symbols`}>
                {symbolRows.length === 0 ? (
                  <Empty title="No symbol data yet" hint="Symbols appear once trades have a pair." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] border-collapse">
                      <thead>
                        <tr className={`border-b ${DIVIDER}`}>
                          <th className={TH}>Symbol</th>
                          <th className={`${TH} text-right`}>Trades</th>
                          <th className={`${TH} text-right`}>Win %</th>
                          <th className={`${TH} text-right`}>PF</th>
                          <th className={`${TH} text-right`}>Net P&L</th>
                          <th className={`${TH} text-right`}>Avg trade</th>
                          <th className={`${TH} text-right`}>Best</th>
                          <th className={`${TH} text-right`}>Worst</th>
                        </tr>
                      </thead>
                      <tbody>
                        {symbolRows.map((row) => (
                          <tr key={row.key} className={`border-b last:border-0 ${DIVIDER}`}>
                            <td className={`${TD} font-semibold ${HEAD}`}>{row.key}</td>
                            <td className={`${TD} text-right ${MUTED}`}>{row.count}</td>
                            <td className={`${TD} text-right ${HEAD}`}>{pct(row.winRate)}</td>
                            <td className={`${TD} text-right ${HEAD}`}>{ratio(row.profitFactor)}</td>
                            <td className={`${TD} text-right font-semibold ${row.net >= 0 ? POS_T : NEG_T}`}>{money(row.net)}</td>
                            <td className={`${TD} text-right ${row.avgPnl >= 0 ? POS_T : NEG_T}`}>{money(row.avgPnl)}</td>
                            <td className={`${TD} text-right ${POS_T}`}>{money(row.best)}</td>
                            <td className={`${TD} text-right ${NEG_T}`}>{money(row.worst)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            )}

            {/* ── Sessions ────────────────────────────────────────────── */}
            {tab === "sessions" && (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {sessionRows.map((s) => (
                    <Card key={s.key} className={`${CARD} p-4`}>
                      <div className="flex items-baseline justify-between">
                        <span className={`text-sm font-semibold ${HEAD}`}>{s.label}</span>
                        <span className={`text-[11px] ${MUTED}`}>{s.range}</span>
                      </div>
                      <div className={`mt-2 text-2xl font-bold tabular-nums ${s.net >= 0 ? POS_T : NEG_T}`}>
                        {money(s.net)}
                      </div>
                      <div className={`mt-1 text-xs ${MUTED}`}>
                        {s.count} trades · {pct(s.winRate)} win rate
                      </div>
                    </Card>
                  ))}
                </div>

                <Panel title="Day of week" icon={Calendar} accent={ac.hex} right="Local trade time">
                  <div className="p-4">
                    <div className="flex h-44 items-end gap-2">
                      {dayRows.map((d) => {
                        const maxAbs = Math.max(1, ...dayRows.map((x) => Math.abs(x.net)));
                        const h = Math.max(3, (Math.abs(d.net) / maxAbs) * 100);
                        return (
                          <div key={d.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                            <div className="flex w-full flex-1 items-end justify-center">
                              <div
                                className="w-full rounded-t"
                                style={{
                                  height: `${h}%`,
                                  backgroundColor: d.net >= 0 ? POS : NEG,
                                  opacity: d.count === 0 ? 0.2 : 0.9,
                                }}
                                title={`${d.key}: ${money(d.net)} · ${d.count} trades`}
                              />
                            </div>
                            <span className={`text-[10px] font-medium ${MUTED}`}>{d.key}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Panel>

                <Panel title="Time of day" icon={Clock} accent={ac.hex} right="Entry hour, local time">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] border-collapse">
                      <thead>
                        <tr className={`border-b ${DIVIDER}`}>
                          <th className={TH}>Hours</th>
                          <th className={`${TH} text-right`}>Trades</th>
                          <th className={`${TH} text-right`}>Win %</th>
                          <th className={`${TH} text-right`}>Net P&L</th>
                          <th className={`${TH} text-right`}>Avg trade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hourRows.map((row) => (
                          <tr key={row.key} className={`border-b last:border-0 ${DIVIDER}`}>
                            <td className={`${TD} font-semibold ${HEAD}`}>{row.key}</td>
                            <td className={`${TD} text-right ${MUTED}`}>{row.count}</td>
                            <td className={`${TD} text-right ${HEAD}`}>{row.count ? pct(row.winRate) : "—"}</td>
                            <td className={`${TD} text-right font-semibold ${row.net >= 0 ? POS_T : NEG_T}`}>
                              {money(row.net)}
                            </td>
                            <td className={`${TD} text-right ${MUTED}`}>{row.count ? money(row.avgPnl) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>

                {/* Day × hour heatmap of net P&L */}
                <Panel title="Day × hour heatmap" icon={BarChart3} accent={ac.hex} right="Local trade time">
                  <div className="p-4">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] border-collapse text-[11px]">
                        <thead>
                          <tr className={`border-b ${DIVIDER}`}>
                            <th className={TH}>Day \ Hour</th>
                            {heatmap.buckets.map((b) => (
                              <th key={b} className={`${TH} text-right`}>{b}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {heatmap.days.map((day, di) => (
                            <tr key={day} className={`border-b last:border-0 ${DIVIDER}`}>
                              <th className={`${TD} font-semibold ${HEAD}`}>{day}</th>
                              {heatmap.grid[di].map((cell, bi) => {
                                const label = `${day} ${cell.count === 0 ? "no trades" : `${cell.count} trade${cell.count === 1 ? "" : "s"} · ${money(cell.net)}`}`;
                                return (
                                  <td
                                    key={bi}
                                    className={`${TD} text-right h-8`}
                                    title={label}
                                  >
                                  {cell.count > 0 ? (
                                    <div
                                      className="flex items-center justify-end pr-1"
                                      style={{
                                        backgroundColor: heatTint(cell.net, heatMax),
                                        opacity: cell.count ? 0.9 : 0.35,
                                      }}
                                    >
                                      <span className="tabular-nums font-semibold">{money(cell.net, false)}</span>
                                    </div>
                                  ) : (
                                    <span className={MUTED}>—</span>
                                  )}
                                </td>
                              )})}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className={`mt-2 text-[10px] ${MUTED}`}>
                      Cell colour shows net P&L (green up, red down). Empty cells had no trades in that bucket.
                    </p>
                  </div>
                </Panel>
              </>
            )}

            {/* ── Tags & playbooks ────────────────────────────────────── */}
            {tab === "tags" && (
              <>
                <Panel title="Confluence / tag performance" icon={Tag} accent={ac.hex} right={`${tagRows.length} tags`}>
                  {tagRows.length === 0 ? (
                    <Empty
                      icon={Tag}
                      title="No tags on these trades"
                      hint="Add confluences when logging a trade and they will be ranked here by net P&L."
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[680px] border-collapse">
                        <thead>
                          <tr className={`border-b ${DIVIDER}`}>
                            <th className={TH}>Tag</th>
                            <th className={`${TH} text-right`}>Trades</th>
                            <th className={`${TH} text-right`}>Win %</th>
                            <th className={`${TH} text-right`}>PF</th>
                            <th className={`${TH} text-right`}>Net P&L</th>
                            <th className={`${TH} text-right`}>Avg trade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tagRows.map((row) => (
                            <tr key={row.key} className={`border-b last:border-0 ${DIVIDER}`}>
                              <td className={`${TD} font-semibold ${HEAD}`}>
                                <span
                                  className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold"
                                  style={{ backgroundColor: `${ac.hex}14`, color: ac.hex }}
                                >
                                  {row.key}
                                </span>
                              </td>
                              <td className={`${TD} text-right ${MUTED}`}>{row.count}</td>
                              <td className={`${TD} text-right ${HEAD}`}>{pct(row.winRate)}</td>
                              <td className={`${TD} text-right ${HEAD}`}>{ratio(row.profitFactor)}</td>
                              <td className={`${TD} text-right font-semibold ${row.net >= 0 ? POS_T : NEG_T}`}>{money(row.net)}</td>
                              <td className={`${TD} text-right ${row.avgPnl >= 0 ? POS_T : NEG_T}`}>{money(row.avgPnl)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>

                <Panel title="Playbook / strategy performance" icon={Layers} accent={ac.hex} right={`${playbookRows.length} setups`}>
                  <div className="border-b px-4 py-2.5">
                    <p className={`text-[11px] ${MUTED}`}>
                      Grouped by linked playbook, falling back to the strategy field. Link trades on the Playbooks page to compare setups here.
                    </p>
                  </div>
                  {playbookRows.length === 0 ? (
                    <Empty
                      icon={Layers}
                      title="No strategies recorded"
                      hint="Strategy can be set on the trade form, or imported from MT5 / CSV."
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[680px] border-collapse">
                        <thead>
                          <tr className={`border-b ${DIVIDER}`}>
                            <th className={TH}>Setup</th>
                            <th className={`${TH} text-right`}>Trades</th>
                            <th className={`${TH} text-right`}>Win %</th>
                            <th className={`${TH} text-right`}>PF</th>
                            <th className={`${TH} text-right`}>Expectancy</th>
                            <th className={`${TH} text-right`}>Net P&L</th>
                          </tr>
                        </thead>
                        <tbody>
                          {playbookRows.map((row) => (
                            <tr key={row.key} className={`border-b last:border-0 ${DIVIDER}`}>
                              <td className={`${TD} font-semibold ${HEAD}`}>{row.key}</td>
                              <td className={`${TD} text-right ${MUTED}`}>{row.count}</td>
                              <td className={`${TD} text-right ${HEAD}`}>{pct(row.winRate)}</td>
                              <td className={`${TD} text-right ${HEAD}`}>{ratio(row.profitFactor)}</td>
                              <td className={`${TD} text-right ${row.expectancy >= 0 ? POS_T : NEG_T}`}>{money(row.expectancy)}</td>
                              <td className={`${TD} text-right font-semibold ${row.net >= 0 ? POS_T : NEG_T}`}>{money(row.net)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>
              </>
            )}

            {/* ── Discipline ──────────────────────────────────────────── */}
            {tab === "discipline" && (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Card className={`${CARD} p-4`}>
                    <div className={`text-[11px] font-medium ${MUTED}`}>Average rating</div>
                    <div className="mt-2">
                      <StarRating value={ratingData.avgRating} accent={ac.hex} readOnly size={20} />
                    </div>
                    <div className={`mt-2 text-xs ${MUTED}`}>
                      {ratingData.ratedCount
                        ? `${ratingData.avgRating.toFixed(1)}/5 across ${ratingData.ratedCount} rated trade${ratingData.ratedCount === 1 ? "" : "s"}`
                        : "No trades rated yet"}
                    </div>
                  </Card>

                  <Card className={`${CARD} p-4`}>
                    <div className={`text-[11px] font-medium ${MUTED}`}>Rated trades</div>
                    <div className={`mt-1 text-2xl font-bold tabular-nums ${HEAD}`}>
                      {pct(stats.count ? (ratingData.ratedCount / stats.count) * 100 : 0)}
                    </div>
                    <div className={`mt-1 text-xs ${MUTED}`}>
                      {ratingData.ratedCount} of {stats.count} closed trades
                    </div>
                  </Card>

                  <Card className={`${CARD} p-4`}>
                    <div className={`text-[11px] font-medium ${MUTED}`}>Good (4–5★) vs poor (1–2★)</div>
                    <div className={`mt-1 text-2xl font-bold tabular-nums ${goodNet >= 0 ? POS_T : NEG_T}`}>
                      {money(goodNet)}
                    </div>
                    <div className={`mt-1 text-xs font-semibold tabular-nums ${badNet >= 0 ? POS_T : NEG_T}`}>
                      {money(badNet)} on poor-rated trades
                    </div>
                  </Card>
                </div>

                <Panel title="Performance by rating" icon={Award} accent={ac.hex} right="4–5★ should be your template">
                  {ratingData.ratedCount === 0 ? (
                    <Empty
                      icon={Award}
                      title="No rated trades yet"
                      hint="Rate a trade 1–5 stars when you log or edit it. This table then shows which grades actually make money."
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[680px] border-collapse">
                        <thead>
                          <tr className={`border-b ${DIVIDER}`}>
                            <th className={TH}>Rating</th>
                            <th className={`${TH} text-right`}>Trades</th>
                            <th className={`${TH} text-right`}>Win %</th>
                            <th className={`${TH} text-right`}>PF</th>
                            <th className={`${TH} text-right`}>Net P&L</th>
                            <th className={`${TH} text-right`}>Avg trade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ratingData.buckets.map((row) => (
                            <tr key={row.key} className={`border-b last:border-0 ${DIVIDER}`}>
                              <td className={TD}>
                                <div className="flex items-center gap-2">
                                  <StarRating value={row.rating} accent={ac.hex} readOnly size={13} />
                                  <span className={`text-xs font-semibold ${HEAD}`}>{row.word}</span>
                                </div>
                              </td>
                              <td className={`${TD} text-right ${MUTED}`}>{row.count}</td>
                              <td className={`${TD} text-right ${HEAD}`}>{row.count ? pct(row.winRate) : "—"}</td>
                              <td className={`${TD} text-right ${HEAD}`}>{row.count ? ratio(row.profitFactor) : "—"}</td>
                              <td className={`${TD} text-right font-semibold ${row.net >= 0 ? POS_T : NEG_T}`}>
                                {row.count ? money(row.net) : "—"}
                              </td>
                              <td className={`${TD} text-right ${row.count ? (row.avgPnl >= 0 ? POS_T : NEG_T) : MUTED}`}>
                                {row.count ? money(row.avgPnl) : "—"}
                              </td>
                            </tr>
                          ))}
                          {ratingData.unrated.count > 0 && (
                            <tr className={`border-t ${DIVIDER}`}>
                              <td className={`${TD} text-xs font-semibold ${MUTED}`}>Not rated</td>
                              <td className={`${TD} text-right ${MUTED}`}>{ratingData.unrated.count}</td>
                              <td className={`${TD} text-right ${HEAD}`}>{pct(ratingData.unrated.winRate)}</td>
                              <td className={`${TD} text-right ${HEAD}`}>{ratio(ratingData.unrated.profitFactor)}</td>
                              <td className={`${TD} text-right font-semibold ${ratingData.unrated.net >= 0 ? POS_T : NEG_T}`}>
                                {money(ratingData.unrated.net)}
                              </td>
                              <td className={`${TD} text-right ${MUTED}`}>{money(ratingData.unrated.avgPnl)}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>

                <Panel title="Cost of mistakes" icon={Shield} accent={NEG} right="Most expensive first">
                  {mistakeRows.length === 0 ? (
                    <Empty
                      icon={Shield}
                      title="No mistakes tagged"
                      hint="Tag mistakes like FOMO or moved stop on a trade. This table totals what each habit has cost you."
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[600px] border-collapse">
                        <thead>
                          <tr className={`border-b ${DIVIDER}`}>
                            <th className={TH}>Mistake</th>
                            <th className={`${TH} text-right`}>Times</th>
                            <th className={`${TH} text-right`}>Net P&L</th>
                            <th className={`${TH} text-right`}>Avg trade</th>
                            <th className={TH}>Damage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mistakeRows.map((row) => {
                            const worst = Math.min(0, ...mistakeRows.map((r) => r.net));
                            const width = worst < 0 ? (row.net / worst) * 100 : 0;
                            return (
                              <tr key={row.key} className={`border-b last:border-0 ${DIVIDER}`}>
                                <td className={`${TD} font-semibold ${HEAD}`}>{row.key}</td>
                                <td className={`${TD} text-right ${MUTED}`}>{row.count}</td>
                                <td className={`${TD} text-right font-semibold ${row.net >= 0 ? POS_T : NEG_T}`}>
                                  {money(row.net)}
                                </td>
                                <td className={`${TD} text-right ${row.avgPnl >= 0 ? POS_T : NEG_T}`}>
                                  {money(row.avgPnl)}
                                </td>
                                <td className="w-32 px-3 py-2.5">
                                  <div className="h-2 overflow-hidden rounded bg-[#eef0f8] dark:bg-[#101024]">
                                    <div
                                      className="h-full rounded"
                                      style={{
                                        width: `${Math.max(0, Math.min(100, width))}%`,
                                        backgroundColor: row.net < 0 ? NEG : POS,
                                        opacity: 0.85,
                                      }}
                                    />
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>

                <Panel title="What this means" icon={Award} accent={ac.hex} right="Read before your next session">
                  <div className={`px-4 py-3 text-sm ${MUTED}`}>
                    {ratingData.ratedCount < 10 ? (
                      <>
                        Rate at least ten trades before drawing conclusions. You currently have{" "}
                        <span className={`font-semibold ${HEAD}`}>{ratingData.ratedCount}</span> rated.
                      </>
                    ) : goodNet > 0 && badNet < 0 ? (
                      <>
                        Your 4–5★ trades made{" "}
                        <span className={`font-semibold ${POS_T}`}>{money(goodNet)}</span> while 1–2★ trades lost{" "}
                        <span className={`font-semibold ${NEG_T}`}>{money(badNet)}</span>. The edge is in repeating
                        the good setup and cutting the bad one, not in a new strategy.
                      </>
                    ) : (
                      <>
                        Good-rated trades are not carrying the account yet. Compare the win rate and profit factor
                        rows above before trusting your own grading.
                      </>
                    )}
                  </div>
                </Panel>
              </>
            )}

            {/* ── Risk ────────────────────────────────────────────────── */}
            {tab === "risk" && (
              <>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
                  {[
                    ["Max drawdown", money(-maxDD), maxDD > 0 ? NEG_T : HEAD],
                    ["Longest win run", runs.longestWin, POS_T],
                    ["Longest loss run", runs.longestLoss, NEG_T],
                    ["Payoff ratio", ratio(stats.payoff), HEAD],
                    ["Avg hold time", formatDuration(avgHold), HEAD],
                    ["Expectancy", money(stats.expectancy), stats.expectancy >= 0 ? POS_T : NEG_T],
                  ].map(([label, value, tone]) => (
                    <Card key={label} className={`${CARD} p-4`}>
                      <div className={`text-[11px] font-medium ${MUTED}`}>{label}</div>
                      <div className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>{value}</div>
                    </Card>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <Panel title="R-multiple distribution" icon={Target} accent={ac.hex} right="From the R column">
                    {rRows.every((b) => b.count === 0) ? (
                      <Empty
                        icon={Target}
                        title="No R data yet"
                        hint="R is stored when a trade has entry, stop loss and take profit. Add them to unlock this chart."
                      />
                    ) : (
                      <div className="space-y-2.5 p-4">
                        {rRows.map((bucket) => (
                          <div key={bucket.key} className="flex items-center gap-3">
                            <span className={`w-24 shrink-0 text-right text-[11px] tabular-nums ${MUTED}`}>{bucket.label}</span>
                            <div className="h-5 flex-1 overflow-hidden rounded bg-[#eef0f8] dark:bg-[#101024]">
                              <div
                                className="h-full rounded"
                                style={{
                                  width: `${(bucket.count / maxRBucket) * 100}%`,
                                  backgroundColor: bucket.max <= 0 ? NEG : POS,
                                  opacity: bucket.count ? 0.9 : 0,
                                }}
                              />
                            </div>
                            <span className={`w-8 shrink-0 text-xs font-semibold tabular-nums ${HEAD}`}>{bucket.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Panel>

                  <Panel title="Long vs short" icon={Percent} accent={ac.hex} right="Direction edge">
                    <div className="space-y-3 p-4">
                      {longShort.map((side) => (
                        <div key={side.label} className={`rounded-xl border p-4 ${DIVIDER}`}>
                          <div className="flex items-center justify-between">
                            <span className={`text-sm font-semibold ${HEAD}`}>{side.label}</span>
                            <span className={`text-sm font-bold tabular-nums ${side.net >= 0 ? POS_T : NEG_T}`}>
                              {money(side.net)}
                            </span>
                          </div>
                          <div className={`mt-1 text-xs ${MUTED}`}>
                            {side.count} trades · {pct(side.winRate)} win rate · PF {ratio(side.profitFactor)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Panel>
                </div>

                <Panel title="Losses in focus" icon={Shield} accent={ac.hex} right="What to fix next">
                  <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
                    <div>
                      <div className={`text-[11px] font-medium ${MUTED}`}>Average loss</div>
                      <div className={`mt-1 text-lg font-bold tabular-nums ${NEG_T}`}>{money(-stats.avgLoss)}</div>
                    </div>
                    <div>
                      <div className={`text-[11px] font-medium ${MUTED}`}>Gross loss</div>
                      <div className={`mt-1 text-lg font-bold tabular-nums ${NEG_T}`}>{money(-stats.grossLoss)}</div>
                    </div>
                    <div>
                      <div className={`text-[11px] font-medium ${MUTED}`}>Loss rate</div>
                      <div className={`mt-1 text-lg font-bold tabular-nums ${HEAD}`}>{pct(stats.lossRate)}</div>
                    </div>
                  </div>
                  <div className={`border-t px-4 py-3 text-[11px] ${DIVIDER} ${MUTED}`}>
                    {stats.count < 20
                      ? `Only ${stats.count} closed trades in this period — treat these numbers as directional, not proven.`
                      : "Sample size is workable. Compare this period with the previous one before changing your rules."}
                  </div>
                </Panel>

                {/* Costs and execution quality */}
                <Panel title="Costs & execution" icon={Receipt} accent={ac.hex} right="Commission + swap">
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4 p-4">
                    {[
                      ["Commission", money(fees.commission), fees.commission < 0 ? NEG_T : HEAD],
                      ["Swap", money(fees.swap), fees.swap < 0 ? NEG_T : HEAD],
                      ["Total fees", money(fees.fees), fees.fees < 0 ? NEG_T : HEAD],
                      ["Share of gross profit", pct(fees.shareOfGross, 1), HEAD],
                    ].map(([label, value, tone]) => (
                      <div key={label} className={`rounded-xl border p-3 ${DIVIDER}`}>
                        <div className={`text-[11px] font-medium ${MUTED}`}>{label}</div>
                        <div className={`mt-0.5 text-lg font-bold tabular-nums ${tone}`}>{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className={`border-t px-4 py-3 text-[11px] ${DIVIDER} ${MUTED}`}>
                    {fees.recorded} of {fees.count} executed trades record commission or swap. Average cost per trade:
                    {money(fees.avgPerTrade)}. Gross P&L is P&L before fees ({money(fees.gross)}); net is after fees
                    ({money(fees.net)}).
                  </div>
                </Panel>

                {/* MAE / MFE capture */}
                <Panel title="MAE / MFE capture" icon={Target} accent={ac.hex} right="How much of the move you keep">
                  {excursions.count === 0 ? (
                    <Empty
                      icon={Target}
                      title="No MAE / MFE data yet"
                      hint="Enter MAE and MFE (in R) when you log or edit a trade to see capture and missed R."
                    />
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 p-4">
                        {[
                          ["Avg MFE (R)", ratio(excursions.avgMfe), HEAD],
                          ["Avg MAE (R)", ratio(excursions.avgMae), HEAD],
                          ["Avg capture", pct(excursions.avgCapture * 100), HEAD],
                          ["Missed R", money(excursions.missedR, true), HEAD],
                        ].map(([label, value, tone]) => (
                          <div key={label} className={`rounded-xl border p-3 ${DIVIDER}`}>
                            <div className={`text-[11px] font-medium ${MUTED}`}>{label}</div>
                            <div className={`mt-0.5 text-lg font-bold tabular-nums ${tone}`}>{value}</div>
                          </div>
                        ))}
                      </div>
                      <div className={`border-t px-4 py-3 text-[11px] ${DIVIDER} ${MUTED}`}>
                        {excursions.worst.length > 0 ? (
                          <>
                            Biggest missed move:{" "}
                            <span className={`font-semibold ${NEG_T}`}>
                              {money(excursions.worst[0].missed, true)}
                            </span>{" "}
                            ({excursions.worst[0].trade.pair || "—"}). Capture is realised R ÷ MFE; missed R is MFE −
                            realised R.
                          </>
                        ) : (
                          "Log MAE / MFE on your trades to see which winners you cut too early."
                        )}
                      </div>
                    </>
                  )
                }
                </Panel>

                {/* Hold-time buckets */}
                <Panel title="Hold-time distribution" icon={Clock} accent={ac.hex} right="Entry → close duration">
                  {holdRows.every((b) => b.count === 0) ? (
                    <Empty
                      icon={Clock}
                      title="No hold-time data yet"
                      hint="Enter close times on your trades to see how long you typically hold positions."
                    />
                  ) : (
                    <div className="space-y-2.5 p-4">
                      {holdRows.map((bucket) => (
                        <div key={bucket.key} className="flex items-center gap-3">
                          <span className={`w-20 shrink-0 text-right text-[11px] tabular-nums ${MUTED}`}>
                            {bucket.label}
                          </span>
                          <div className="h-5 flex-1 overflow-hidden rounded bg-[#eef0f8] dark:bg-[#101024]">
                            <div
                              className="h-full rounded"
                              style={{
                                width: `${(bucket.count / maxHoldBucket) * 100}%`,
                                backgroundColor: POS,
                                opacity: bucket.count ? 0.9 : 0,
                              }}
                            />
                          </div>
                          <span className={`w-8 shrink-0 text-xs font-semibold tabular-nums ${HEAD}`}>
                            {bucket.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
