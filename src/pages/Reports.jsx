import React, { useState, useEffect, useMemo } from "react";
import { format, startOfMonth, endOfMonth, subMonths, isWithinInterval } from "date-fns";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { useTheme } from "../Theme-provider";
import useAccent from "../hooks/useAccent";
import AccentPicker from "../components/ui/AccentPicker";
import {
  TrendingUp,
  BarChart3,
  Percent,
  Calendar,
  Download,
  ArrowUpRight,
  ArrowDownRight,
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

const money = (v, signed = true) => {
  const n = Number(v) || 0;
  const sign = n < 0 ? "-" : signed && n > 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const PERIODS = [
  ["this-month", "This month"],
  ["last-30", "Last 30 days"],
  ["this-year", "This year"],
  ["all", "All time"],
];

export default function Reports() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { accent, setAccent, ac } = useAccent();

  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("this-month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Fetch trades from backend
  useEffect(() => {
    const fetchTrades = async () => {
      setLoading(true);
      try {
        const currentId = localStorage.getItem("currentAccountId") || "default";
        const res = await fetch(
          `https://tradeass-backend.onrender.com/api/trades?accountId=${currentId}`
        );
        if (!res.ok) throw new Error("Failed to load trades");
        const data = await res.json();
        setTrades(data || []);
      } catch (err) {
        console.error("Reports fetch error:", err);
        setTrades([]);
      } finally {
        setLoading(false);
      }
    };

    fetchTrades();
  }, []);

  // Filtered trades based on selected period
  const filteredTrades = useMemo(() => {
    const now = new Date();

    let startDate, endDate;

    if (period === "this-month") {
      startDate = startOfMonth(now);
      endDate = endOfMonth(now);
    } else if (period === "last-30") {
      startDate = subMonths(now, 1);
      endDate = now;
    } else if (period === "this-year") {
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = now;
    } else if (period === "all") {
      startDate = new Date(2000, 0, 1);
      endDate = now;
    } else if (period === "custom" && customStart && customEnd) {
      startDate = new Date(customStart);
      endDate = new Date(customEnd);
    } else {
      return trades;
    }

    return trades.filter((trade) => {
      const tradeDate = new Date(trade.date);
      return isWithinInterval(tradeDate, { start: startDate, end: endDate });
    });
  }, [trades, period, customStart, customEnd]);

  // Calculate report statistics
  const stats = useMemo(() => {
    if (!filteredTrades.length) {
      return {
        totalPnL: 0,
        winRate: 0,
        totalTrades: 0,
        avgRR: 0,
        avgPnL: 0,
        bestTrade: 0,
        worstTrade: 0,
        topPairs: [],
      };
    }

    const totalTrades = filteredTrades.length;
    const wins = filteredTrades.filter((t) => Number(t.pnl || 0) > 0).length;
    const totalPnL = filteredTrades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
    const totalRR = filteredTrades.reduce((sum, t) => sum + Number(t.rr || 0), 0);

    const pnlValues = filteredTrades.map((t) => Number(t.pnl || 0));
    const bestTrade = Math.max(...pnlValues);
    const worstTrade = Math.min(...pnlValues);
    const grossWin = pnlValues.filter((v) => v > 0).reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(pnlValues.filter((v) => v < 0).reduce((a, b) => a + b, 0));
    const profitFactor = grossLoss ? (grossWin / grossLoss).toFixed(2) : grossWin > 0 ? "∞" : "—";

    // Top pairs by PnL
    const pairsMap = {};
    filteredTrades.forEach((t) => {
      if (!t.pair) return;
      if (!pairsMap[t.pair]) {
        pairsMap[t.pair] = { pnl: 0, count: 0 };
      }
      pairsMap[t.pair].pnl += Number(t.pnl || 0);
      pairsMap[t.pair].count += 1;
    });

    const topPairs = Object.entries(pairsMap)
      .map(([pair, data]) => ({
        pair,
        pnl: data.pnl,
        avgPnL: data.count ? (data.pnl / data.count).toFixed(2) : 0,
        trades: data.count,
      }))
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, 5);

    return {
      totalPnL: totalPnL.toFixed(2),
      winRate: totalTrades ? Math.round((wins / totalTrades) * 100) : 0,
      totalTrades,
      avgRR: totalTrades ? (totalRR / totalTrades).toFixed(2) : 0,
      avgPnL: totalTrades ? (totalPnL / totalTrades).toFixed(2) : 0,
      bestTrade: bestTrade.toFixed(2),
      worstTrade: worstTrade.toFixed(2),
      topPairs,
      profitFactor,
      wins,
      losses: totalTrades - wins,
    };
  }, [filteredTrades]);

  // Last 12 months of net P&L (all trades, not just the selected period)
  const monthlyTrend = useMemo(() => {
    const months = [];
    for (let i = 11; i >= 0; i -= 1) {
      const d = subMonths(new Date(), i);
      months.push({ key: format(d, "yyyy-MM"), label: format(d, "MMM"), pnl: 0 });
    }
    const byKey = Object.fromEntries(months.map((m) => [m.key, m]));
    trades.forEach((t) => {
      const d = new Date(t.date);
      if (Number.isNaN(d.getTime())) return;
      const bucket = byKey[format(d, "yyyy-MM")];
      if (bucket) bucket.pnl += Number(t.pnl || 0);
    });
    const maxAbs = Math.max(1, ...months.map((m) => Math.abs(m.pnl)));
    return { months, maxAbs };
  }, [trades]);

  const exportReport = () => {
    if (!filteredTrades.length) return;

    const headers = [
      "Date",
      "Pair",
      "Direction",
      "Entry",
      "Exit",
      "PnL",
      "R:R",
      "Notes",
    ];

    const rows = filteredTrades.map((t) => [
      t.date ? format(new Date(t.date), "yyyy-MM-dd HH:mm") : "",
      t.pair || "",
      t.direction || "",
      t.entry || "",
      t.exit || "",
      t.pnl || 0,
      t.rr || "",
      `"${(t.notes || "").replace(/"/g, '""')}"`,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `trading-report-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
  };

  const statCells = [
    { label: "Net P&L", value: money(stats.totalPnL), tone: Number(stats.totalPnL) >= 0 ? POS_T : NEG_T },
    { label: "Win rate", value: `${stats.winRate}%`, tone: HEAD },
    { label: "Total trades", value: stats.totalTrades, tone: HEAD },
    { label: "Avg R:R", value: stats.avgRR, tone: HEAD },
    { label: "Avg trade", value: money(stats.avgPnL), tone: Number(stats.avgPnL) >= 0 ? POS_T : NEG_T },
  ];

  const winAngle = Math.round((stats.winRate / 100) * 360);

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
              Analyze performance, identify patterns and improve your edge
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <AccentPicker accent={accent} setAccent={setAccent} className="mr-1" />
            <Button
              onClick={exportReport}
              disabled={!filteredTrades.length || loading}
              style={{ backgroundColor: ac.hex }}
              className="text-white font-semibold hover:brightness-110 disabled:opacity-50"
            >
              <Download size={16} className="mr-2" /> Export report
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
                      period === key
                        ? "text-white shadow-sm"
                        : `${MUTED} hover:text-[#14142b] dark:hover:text-white`
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

              <span className={`ml-auto text-xs font-medium ${MUTED}`}>
                {filteredTrades.length} trades in range
              </span>
            </div>
          </div>
        </Card>

        {loading ? (
          <div className="flex h-72 items-center justify-center">
            <div
              className="h-10 w-10 animate-spin rounded-full border-2 border-[#e6e8f2] dark:border-[#262645]"
              style={{ borderTopColor: ac.hex }}
              role="progressbar"
              aria-label="Loading reports"
            />
          </div>
        ) : filteredTrades.length === 0 ? (
          <Card className={`${CARD} p-10 text-center`}>
            <BarChart3 size={36} className={`mx-auto mb-3 opacity-40 ${MUTED}`} />
            <p className={`text-lg font-semibold ${HEAD}`}>No data for this period</p>
            <p className={`mb-5 mt-1 text-sm ${MUTED}`}>
              Try another time range or log some trades to see your report.
            </p>
            <Button
              onClick={() => setPeriod("all")}
              style={{ backgroundColor: ac.hex }}
              className="text-white font-semibold hover:brightness-110"
            >
              Show all time
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* KPI strip */}
            <Card className={`${CARD} overflow-hidden`}>
              <div className="grid grid-cols-2 gap-px bg-[#e6e8f2] dark:bg-[#262645] md:grid-cols-3 lg:grid-cols-5">
                {statCells.map((cell) => (
                  <div key={cell.label} className="bg-white px-4 py-4 dark:bg-[#15152b]">
                    <div className={`text-[11px] font-medium ${MUTED}`}>{cell.label}</div>
                    <div className={`mt-1 text-xl font-bold tabular-nums sm:text-2xl ${cell.tone}`}>
                      {cell.value}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Trend + distribution */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <Card className={`${CARD} p-0`}>
                <div className={`flex items-center justify-between border-b px-4 py-3 ${DIVIDER}`}>
                  <h3 className={`flex items-center gap-2 text-[15px] font-semibold ${HEAD}`}>
                    <TrendingUp size={16} style={{ color: ac.hex }} />
                    Monthly P&L trend
                  </h3>
                  <span className={`text-xs ${MUTED}`}>Last 12 months</span>
                </div>
                <div className="p-4">
                  <div className="flex h-56 items-end gap-1.5 sm:gap-2.5">
                    {monthlyTrend.months.map((m) => {
                      const h = Math.max(3, (Math.abs(m.pnl) / monthlyTrend.maxAbs) * 100);
                      const positive = m.pnl >= 0;
                      return (
                        <div key={m.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                          <div className="group relative flex w-full flex-1 items-end justify-center">
                            <div
                              className="w-full rounded-t transition-all duration-500"
                              style={{
                                height: `${h}%`,
                                backgroundColor: positive ? POS : NEG,
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
                  <div className={`mt-3 flex items-center justify-between border-t pt-3 text-xs ${DIVIDER} ${MUTED}`}>
                    <span className="inline-flex items-center gap-1.5">
                      <i className="h-2 w-2 rounded-sm" style={{ backgroundColor: POS }} /> Green month
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <i className="h-2 w-2 rounded-sm" style={{ backgroundColor: NEG }} /> Red month
                    </span>
                  </div>
                </div>
              </Card>

              <Card className={`${CARD} p-0`}>
                <div className={`flex items-center justify-between border-b px-4 py-3 ${DIVIDER}`}>
                  <h3 className={`flex items-center gap-2 text-[15px] font-semibold ${HEAD}`}>
                    <Percent size={16} style={{ color: ac.hex }} />
                    Win / loss split
                  </h3>
                  <span className={`text-xs ${MUTED}`}>{stats.totalTrades} trades</span>
                </div>
                <div className="flex flex-col items-center gap-5 p-5 sm:flex-row">
                  <div
                    className="relative h-36 w-36 shrink-0 rounded-full"
                    style={{
                      background: `conic-gradient(${POS} 0deg ${winAngle}deg, ${NEG} ${winAngle}deg 360deg)`,
                    }}
                  >
                    <div className="absolute inset-[14px] flex flex-col items-center justify-center rounded-full bg-white dark:bg-[#15152b]">
                      <span className={`text-3xl font-bold tabular-nums ${HEAD}`}>{stats.winRate}%</span>
                      <span className={`text-[10px] uppercase tracking-wider ${MUTED}`}>win rate</span>
                    </div>
                  </div>
                  <div className="w-full space-y-3">
                    <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${DIVIDER}`}>
                      <span className={`flex items-center gap-2 text-sm ${MUTED}`}>
                        <i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: POS }} /> Wins
                      </span>
                      <span className={`text-sm font-bold tabular-nums ${POS_T}`}>{stats.wins}</span>
                    </div>
                    <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${DIVIDER}`}>
                      <span className={`flex items-center gap-2 text-sm ${MUTED}`}>
                        <i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: NEG }} /> Losses
                      </span>
                      <span className={`text-sm font-bold tabular-nums ${NEG_T}`}>{stats.losses}</span>
                    </div>
                    <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${DIVIDER}`}>
                      <span className={`text-sm ${MUTED}`}>Profit factor</span>
                      <span className={`text-sm font-bold tabular-nums ${HEAD}`}>
                        {stats.profitFactor}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Top pairs */}
            <Card className={`${CARD} p-0`}>
              <div className={`flex items-center justify-between border-b px-4 py-3 ${DIVIDER}`}>
                <h3 className={`flex items-center gap-2 text-[15px] font-semibold ${HEAD}`}>
                  <BarChart3 size={16} style={{ color: ac.hex }} />
                  Top performing pairs
                </h3>
                <span className={`text-xs ${MUTED}`}>By net P&L</span>
              </div>

              {stats.topPairs.length === 0 ? (
                <p className={`py-10 text-center text-sm ${MUTED}`}>No pair data available</p>
              ) : (
                <div>
                  {stats.topPairs.map((item, index) => (
                    <div
                      key={item.pair}
                      className={`flex items-center justify-between gap-3 border-b px-4 py-3 last:border-0 ${DIVIDER}`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                          style={{ backgroundColor: ac.hex }}
                        >
                          {index + 1}
                        </div>
                        <div className="min-w-0">
                          <div className={`truncate text-sm font-semibold ${HEAD}`}>{item.pair}</div>
                          <div className={`text-xs ${MUTED}`}>
                            {item.trades} {item.trades === 1 ? "trade" : "trades"} · Avg {money(item.avgPnL)}
                          </div>
                        </div>
                      </div>
                      <div className={`text-right text-sm font-bold tabular-nums ${item.pnl >= 0 ? POS_T : NEG_T}`}>
                        {money(item.pnl)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Best / worst */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Card className={`${CARD} p-0`}>
                <div className={`flex items-center gap-2 border-b px-4 py-3 ${DIVIDER}`}>
                  <ArrowUpRight size={16} className={POS_T} />
                  <h3 className={`text-[15px] font-semibold ${HEAD}`}>Best trade</h3>
                </div>
                <div className="p-4">
                  <div className={`text-2xl font-bold tabular-nums ${POS_T}`}>
                    {money(stats.bestTrade)}
                  </div>
                  <p className={`mt-1 text-xs ${MUTED}`}>Highest single trade profit in period</p>
                </div>
              </Card>

              <Card className={`${CARD} p-0`}>
                <div className={`flex items-center gap-2 border-b px-4 py-3 ${DIVIDER}`}>
                  <ArrowDownRight size={16} className={NEG_T} />
                  <h3 className={`text-[15px] font-semibold ${HEAD}`}>Worst trade</h3>
                </div>
                <div className="p-4">
                  <div className={`text-2xl font-bold tabular-nums ${NEG_T}`}>
                    {money(stats.worstTrade)}
                  </div>
                  <p className={`mt-1 text-xs ${MUTED}`}>Largest single trade loss in period</p>
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
