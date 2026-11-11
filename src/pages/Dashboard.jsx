// src/pages/Dashboard.jsx
// TradeZella-style dashboard: KPI strip, cumulative P&L, Zella score radar,
// monthly P&L calendar and the recent-trade strip. The reference dashboard is
// dark in every theme, so this page keeps its own dark surface.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isWithinInterval,
  startOfMonth,
  subDays,
} from "date-fns";
import { collection, getDocs } from "firebase/firestore";
import { auth, db } from "../firebase";
import {
  ArrowUpRight,
  BarChart3,
  BookMarked,
  Calculator,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Filter,
  FolderOpen,
  Info,
  Settings,
  Sparkles,
  Sunrise,
} from "lucide-react";
import useAccent from "../hooks/useAccent";

// ─── Palette (matches the reference dashboard) ───────────────────────────────
const BG = "#08080d";
const CARD = "#101016";
const CARD_ALT = "#15151d";
const BORDER = "#1e1e28";
const TEXT = "#e9e9f2";
const MUTED = "#8b8ba3";
const FAINT = "#66667c";
const POS = "#22c493";
const NEG = "#f2556e";
const BE = "#6C47FF";

const PERIODS = [
  ["this-month", "This month"],
  ["last-30", "Last 30 days"],
  ["this-year", "This year"],
  ["all", "All time"],
];

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6C47FF]";
const TOOLBAR_BTN = `flex h-9 items-center gap-1.5 rounded-lg border border-[#242433] bg-[#101016] px-3 text-[12px] font-medium text-[#c7c7d6] transition-colors hover:border-[#33334a] hover:text-white ${FOCUS}`;
const ICON_BTN = `flex h-9 w-9 items-center justify-center rounded-lg border border-[#242433] bg-[#101016] text-[#8b8ba3] transition-colors hover:text-white ${FOCUS}`;
const PANEL = `rounded-xl border border-[#1e1e28] bg-[#101016]`;

// ─── Numbers & dates ─────────────────────────────────────────────────────────
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));

const usd = (value, signed = false) => {
  const n = Number(value) || 0;
  const sign = n < 0 ? "-" : signed && n > 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const usdAxis = (value) => {
  const n = Number(value) || 0;
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
};

// "$1.05K", "-$638", "$37.5" — the calendar / weekly rail style.
const usdCell = (value) => {
  const n = Number(value) || 0;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1000) {
    return `${sign}$${(abs / 1000).toFixed(2).replace(/\.?0+$/, "")}K`;
  }
  if (abs >= 100) return `${sign}$${Math.round(abs)}`;
  return `${sign}$${abs.toFixed(1).replace(/\.0$/, "")}`;
};

const pct = (value, digits = 2) => `${(Number(value) || 0).toFixed(digits)}%`;

const parseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const text = String(value);
  const d = new Date(text.length <= 10 ? `${text}T12:00:00` : text);
  return Number.isNaN(d.getTime()) ? null : d;
};

const tradeDateOf = (trade) =>
  parseDate(trade?.closeDateTime) || parseDate(trade?.openDateTime) || parseDate(trade?.date);

// ─── Aggregation ─────────────────────────────────────────────────────────────
function summarize(trades) {
  const executed = trades.filter((t) => t && t.status !== "pending");
  const pnls = executed.map((t) => Number(t.pnl) || 0);
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p < 0);
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const net = pnls.reduce((a, b) => a + b, 0);
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;

  return {
    count: executed.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: executed.length - wins.length - losses.length,
    winRate: executed.length ? (wins.length / executed.length) * 100 : 0,
    net,
    grossWin,
    grossLoss,
    avgWin,
    avgLoss,
    avgPnl: executed.length ? net / executed.length : 0,
    payoff: avgLoss ? avgWin / avgLoss : avgWin ? 3 : 0,
    profitFactor: grossLoss ? grossWin / grossLoss : grossWin ? 3 : 0,
    best: pnls.length ? Math.max(...pnls) : 0,
    worst: pnls.length ? Math.min(...pnls) : 0,
  };
}

function equitySeries(trades) {
  const points = [];
  let running = 0;
  trades
    .filter((t) => t && t.status !== "pending" && tradeDateOf(t))
    .slice()
    .sort((a, b) => tradeDateOf(a) - tradeDateOf(b))
    .forEach((trade) => {
      running += Number(trade.pnl) || 0;
      points.push({ date: tradeDateOf(trade), value: Number(running.toFixed(2)) });
    });
  return points;
}

function maxDrawdown(points) {
  let peak = 0;
  let worst = 0;
  points.forEach((point) => {
    peak = Math.max(peak, point.value);
    worst = Math.max(worst, peak - point.value);
  });
  return worst;
}

/** Net P&L, trade count and wins per calendar day. */
function dayPnL(trades) {
  const map = new Map();
  trades
    .filter((t) => t && t.status !== "pending")
    .forEach((trade) => {
      const date = tradeDateOf(trade);
      if (!date) return;
      const key = format(date, "yyyy-MM-dd");
      const cell = map.get(key) || { net: 0, count: 0, wins: 0 };
      const pnl = Number(trade.pnl) || 0;
      cell.net += pnl;
      cell.count += 1;
      if (pnl > 0) cell.wins += 1;
      map.set(key, cell);
    });
  return map;
}

function streakStats(trades) {
  const ordered = trades
    .filter((t) => t && t.status !== "pending" && tradeDateOf(t))
    .slice()
    .sort((a, b) => tradeDateOf(a) - tradeDateOf(b));

  let win = 0;
  let loss = 0;
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const pnl = Number(ordered[i].pnl) || 0;
    if (pnl > 0 && loss === 0) win += 1;
    else if (pnl < 0 && win === 0) loss += 1;
    else break;
  }

  const days = [...dayPnL(ordered).entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  let greenDays = 0;
  let redDays = 0;
  for (const [, cell] of days) {
    if (cell.net > 0 && redDays === 0) greenDays += 1;
    else if (cell.net < 0 && greenDays === 0) redDays += 1;
    else break;
  }

  return { win, loss, greenDays, redDays };
}

function scoreMetrics(trades, curve) {
  const stats = summarize(trades);
  const drawdown = maxDrawdown(curve);
  const recovery = drawdown ? stats.net / drawdown : stats.net > 0 ? 3 : 0;
  const ddScore = stats.grossWin > 0
    ? clamp(100 - (drawdown / stats.grossWin) * 100)
    : drawdown > 0
    ? 20
    : 100;

  const days = [...dayPnL(trades).values()];
  const greenShare = days.length ? (days.filter((d) => d.net > 0).length / days.length) * 100 : 0;

  const metrics = [
    { label: "Win %", value: clamp(stats.winRate) },
    { label: "Profit factor", value: clamp((stats.profitFactor / 3) * 100) },
    { label: "Avg win/loss", value: clamp((stats.payoff / 3) * 100) },
    { label: "Recovery factor", value: clamp((recovery / 3) * 100) },
    { label: "Max drawdown", value: ddScore },
    { label: "Consistency", value: clamp(greenShare) },
  ];

  return { metrics };
}

// ─── Small UI pieces ─────────────────────────────────────────────────────────
function Dropdown({ label, icon: Icon, items, align = "right", width = "w-52" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={TOOLBAR_BTN}
      >
        {Icon ? <Icon size={14} /> : null}
        <span>{label}</span>
        <ChevronDown size={12} className="opacity-60" />
      </button>

      {open ? (
        <div
          role="menu"
          className={`absolute ${align === "right" ? "right-0" : "left-0"} z-40 mt-1.5 ${width} overflow-hidden rounded-lg border border-[#26263a] bg-[#12121b] py-1 shadow-2xl shadow-black/60`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick?.();
              }}
              className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[12px] transition-colors hover:bg-[#1c1c28] ${
                item.active ? "text-white" : "text-[#b9b9cc]"
              }`}
            >
              <span className="flex items-center gap-2">
                {item.icon ? <item.icon size={13} /> : null}
                {item.label}
              </span>
              {item.active ? <Check size={13} style={{ color: item.accent || BE }} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function KpiCard({ title, hint, value, tone = TEXT, children, className = "" }) {
  return (
    <div className={`${PANEL} px-4 py-3.5 sm:px-5 ${className}`}>
      <div className="flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: MUTED }}>
        <span title={hint}>{title}</span>
        {hint ? <Info size={12} className="opacity-50" aria-hidden="true" /> : null}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="text-[24px] font-bold leading-none tracking-tight sm:text-[26px]" style={{ color: tone }}>
          {value}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Half-donut win / breakeven / loss split with counts underneath. */
function SemiGauge({ win, be, loss }) {
  const total = Math.max(1, win + be + loss);
  const cx = 58;
  const cy = 56;
  const r = 40;
  const width = 9;
  const arc = (from, to) => {
    const steps = Math.max(2, Math.ceil((to - from) * 60));
    const points = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = from + ((to - from) * i) / steps;
      const angle = Math.PI * (1 - t);
      points.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy - r * Math.sin(angle)).toFixed(2)}`);
    }
    return `M${points.join(" L")}`;
  };

  const parts = [
    { value: win, color: POS },
    { value: be, color: BE },
    { value: loss, color: NEG },
  ].filter((part) => part.value > 0);

  let acc = 0;
  const arcs = parts.map((part) => {
    const from = acc / total;
    acc += part.value;
    return { ...part, from, to: acc / total };
  });

  return (
    <div className="flex shrink-0 flex-col items-center">
      <svg width="116" height="62" viewBox="0 0 116 62" aria-hidden="true">
        <path d={arc(0, 1)} fill="none" stroke="#1e1e28" strokeWidth={width} strokeLinecap="round" />
        {arcs.map((part) => (
          <path
            key={part.color}
            d={arc(part.from, part.to)}
            fill="none"
            stroke={part.color}
            strokeWidth={width}
          />
        ))}
      </svg>
      <div className="mt-0.5 flex w-[102px] items-center justify-between text-[11px] font-semibold tabular-nums">
        <span style={{ color: POS }}>{win}</span>
        <span style={{ color: BE }}>{be}</span>
        <span style={{ color: NEG }}>{loss}</span>
      </div>
    </div>
  );
}

function PfRing({ value }) {
  const ratio = Math.max(0, Math.min(1, (Number(value) || 0) / 3));
  const r = 25;
  const circumference = 2 * Math.PI * r;
  return (
    <svg width="60" height="60" viewBox="0 0 62 62" aria-hidden="true" className="shrink-0">
      <circle cx="31" cy="31" r={r} fill="none" stroke="#23232f" strokeWidth="7" />
      <circle
        cx="31"
        cy="31"
        r={r}
        fill="none"
        stroke={POS}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${circumference * ratio} ${circumference}`}
        transform="rotate(-90 31 31)"
      />
      <circle
        cx="31"
        cy="31"
        r={r}
        fill="none"
        stroke={BE}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${circumference * 0.08} ${circumference}`}
        strokeDashoffset={-circumference * ratio}
        transform="rotate(-90 31 31)"
      />
    </svg>
  );
}

function StreakRing({ count, label, tone }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold tabular-nums"
        style={{ color: tone, boxShadow: `inset 0 0 0 1.5px ${tone}80` }}
      >
        {count}
      </span>
      <span className="whitespace-nowrap text-[11px]" style={{ color: MUTED }}>
        {label}
      </span>
    </div>
  );
}

function EquityChart({ points }) {
  const W = 640;
  const H = 250;
  const PAD = { left: 54, right: 10, top: 14, bottom: 26 };

  if (!points || points.length < 2) {
    return (
      <div className="flex h-[250px] items-center justify-center px-6 text-center text-[12px]" style={{ color: MUTED }}>
        Close at least two trades to see your cumulative P&L.
      </div>
    );
  }

  const values = points.map((point) => point.value);
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  const span = high - low || 1;
  const x = (index) => PAD.left + (index / (points.length - 1)) * (W - PAD.left - PAD.right);
  const y = (value) => PAD.top + (1 - (value - low) / span) * (H - PAD.top - PAD.bottom);
  const line = points
    .map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(low).toFixed(1)} L${x(0).toFixed(1)},${y(low).toFixed(1)} Z`;
  const ticks = [0, 1, 2, 3, 4].map((index) => low + (span * index) / 4);
  const labelIndexes = [
    0,
    Math.floor((points.length - 1) / 3),
    Math.floor((2 * (points.length - 1)) / 3),
    points.length - 1,
  ].filter((value2, index, all) => all.indexOf(value2) === index);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-[250px] w-full"
      role="img"
      aria-label="Daily net cumulative profit and loss"
    >
      <defs>
        <linearGradient id="dashEquityFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={POS} stopOpacity="0.34" />
          <stop offset="100%" stopColor={POS} stopOpacity="0" />
        </linearGradient>
      </defs>

      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(tick)}
            y2={y(tick)}
            stroke="#20202c"
            strokeDasharray="3 4"
          />
          <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" fontSize="10" fill={FAINT}>
            {usdAxis(tick)}
          </text>
        </g>
      ))}

      <path d={area} fill="url(#dashEquityFill)" />
      <path
        d={line}
        fill="none"
        stroke={POS}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={x(points.length - 1)} cy={y(values[values.length - 1])} r="3.5" fill={POS} />

      {labelIndexes.map((index) => (
        <text
          key={index}
          x={x(index)}
          y={H - 6}
          textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
          fontSize="10"
          fill={FAINT}
        >
          {format(points[index].date, "MM/dd/yy")}
        </text>
      ))}
    </svg>
  );
}

function RadarChart({ metrics, accent }) {
  const size = 300;
  const cx = size / 2;
  const cy = size / 2 - 2;
  const radius = 86;
  const count = metrics.length;
  const angleOf = (index) => -Math.PI / 2 + (index * 2 * Math.PI) / count;
  const pointAt = (index, value) => [
    cx + Math.cos(angleOf(index)) * radius * (value / 100),
    cy + Math.sin(angleOf(index)) * radius * (value / 100),
  ];
  const polygon = (values) =>
    values
      .map((value, index) => pointAt(index, value).map((n) => n.toFixed(1)).join(","))
      .join(" ");

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="h-[256px] w-full"
      role="img"
      aria-label="Zella score across six categories"
    >
      {[20, 40, 60, 80, 100].map((ring) => (
        <polygon
          key={ring}
          points={polygon(metrics.map(() => ring))}
          fill="none"
          stroke="#26263a"
          strokeWidth="1"
        />
      ))}

      {metrics.map((metric, index) => {
        const [px, py] = pointAt(index, 100);
        return <line key={metric.label} x1={cx} y1={cy} x2={px} y2={py} stroke="#26263a" strokeWidth="1" />;
      })}

      <polygon
        points={polygon(metrics.map((metric) => Math.max(6, metric.value)))}
        fill={accent}
        fillOpacity="0.42"
        stroke={accent}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {metrics.map((metric, index) => {
        const [px, py] = pointAt(index, metric.value);
        return <circle key={metric.label} cx={px} cy={py} r="2.6" fill="#cbbcff" />;
      })}

      {metrics.map((metric, index) => {
        const [px, py] = pointAt(index, 122);
        const angle = angleOf(index);
        const anchor = Math.abs(Math.cos(angle)) < 0.2 ? "middle" : Math.cos(angle) > 0 ? "start" : "end";
        return (
          <text key={metric.label} x={px} y={py + 3} textAnchor={anchor} fontSize="10.5" fill={MUTED}>
            {metric.label}
          </text>
        );
      })}
    </svg>
  );
}

function ScoreBar({ score }) {
  const value = clamp(score);
  return (
    <div className="mt-auto">
      <div className="text-[11px] font-medium" style={{ color: MUTED }}>
        Your Zella Score
      </div>
      <div className="mt-2 flex items-center gap-3">
        <span className="text-[24px] font-bold leading-none" style={{ color: TEXT }}>
          {Number(score).toFixed(2)}
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="relative h-2.5 rounded-full"
            style={{ background: "linear-gradient(90deg,#ef4444,#f59e0b 45%,#22c493 74%,#a3e635)" }}
          >
            <span
              className="absolute -top-[3px] h-[16px] w-[2px] rounded bg-white"
              style={{ left: `${value}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[9px]" style={{ color: FAINT }}>
            {[0, 20, 40, 60, 80, 100].map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ currentAccount }) {
  const navigate = useNavigate();
  const { ac } = useAccent();
  const accent = ac.hex;

  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("all");
  const [viewDate, setViewDate] = useState(() => new Date());
  const [bottomTab, setBottomTab] = useState("recent");
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const accountId = currentAccount?.id;
  const currency = currentAccount?.currency || "USD";

  const load = async () => {
    const user = auth.currentUser;
    if (!user || !accountId) {
      setTrades([]);
      setLoading(false);
      return;
    }
    try {
      // No orderBy: Firestore drops documents that lack the ordered field, and
      // older trades have no createdAt. Everything is sorted client-side.
      const snap = await getDocs(collection(db, "users", user.uid, "accounts", accountId, "trades"));
      setTrades(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setError("");
    } catch (err) {
      console.error("Dashboard load failed:", err);
      setError("Could not load your dashboard. Check your connection and try again.");
      setTrades([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  // Rotate the "copied" tick back to the copy icon.
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleResync = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const executed = useMemo(() => trades.filter((t) => t.status !== "pending"), [trades]);
  const openPositions = useMemo(() => trades.filter((t) => t.status === "pending"), [trades]);

  const periodTrades = useMemo(() => {
    if (period === "all") return trades;
    const now = new Date();
    const start =
      period === "this-month"
        ? startOfMonth(now)
        : period === "this-year"
        ? new Date(now.getFullYear(), 0, 1)
        : subDays(now, 29);
    const end = period === "this-month" ? endOfMonth(now) : now;
    return trades.filter((trade) => {
      const date = tradeDateOf(trade);
      return date && isWithinInterval(date, { start, end });
    });
  }, [trades, period]);

  const stats = useMemo(() => summarize(periodTrades), [periodTrades]);
  const curve = useMemo(() => equitySeries(periodTrades), [periodTrades]);
  const streak = useMemo(() => streakStats(executed), [executed]);
  const board = useMemo(() => scoreMetrics(trades, curve), [trades, curve]);
  const score = board.metrics.reduce((sum, metric) => sum + metric.value, 0) / board.metrics.length;

  const daysMap = useMemo(() => dayPnL(trades), [trades]);

  const weeks = useMemo(() => {
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const cells = Array(start.getDay()).fill(null).concat(days);
    while (cells.length % 7 !== 0) cells.push(null);
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [viewDate]);

  const monthDays = useMemo(() => weeks.flat().filter(Boolean), [weeks]);
  const monthNet = monthDays.reduce((sum, day) => {
    const cell = daysMap.get(format(day, "yyyy-MM-dd"));
    return sum + (cell?.net || 0);
  }, 0);
  const monthTraded = monthDays.filter((day) => daysMap.has(format(day, "yyyy-MM-dd"))).length;
  const monthMax = Math.max(
    1,
    ...monthDays.map((day) => Math.abs(daysMap.get(format(day, "yyyy-MM-dd"))?.net || 0))
  );

  const lastImport = useMemo(() => {
    const stamps = trades
      .map((trade) => parseDate(trade.updatedAt) || parseDate(trade.createdAt) || tradeDateOf(trade))
      .filter(Boolean);
    if (!stamps.length) return null;
    return new Date(Math.max(...stamps.map((date) => date.getTime())));
  }, [trades]);

  const recent = useMemo(
    () =>
      executed
        .slice()
        .sort((a, b) => (tradeDateOf(b)?.getTime() || 0) - (tradeDateOf(a)?.getTime() || 0))
        .slice(0, 6),
    [executed]
  );

  const dailyBars = useMemo(() => {
    const bars = [];
    for (let i = 13; i >= 0; i -= 1) {
      const day = subDays(new Date(), i);
      const cell = daysMap.get(format(day, "yyyy-MM-dd"));
      bars.push({ date: day, net: cell?.net || 0, count: cell?.count || 0 });
    }
    return bars;
  }, [daysMap]);

  const maxDaily = Math.max(1, ...dailyBars.map((bar) => Math.abs(bar.net)));
  const bestDay = dailyBars.reduce((best, bar) => (bar.net > best.net ? bar : best), dailyBars[0]);
  const worstDay = dailyBars.reduce((worst, bar) => (bar.net < worst.net ? bar : worst), dailyBars[0]);

  const avgTotal = stats.avgWin + stats.avgLoss;
  const winShare = avgTotal ? (stats.avgWin / avgTotal) * 100 : 50;

  const copyNet = async () => {
    try {
      await navigator.clipboard.writeText(usd(stats.net));
      setCopied(true);
    } catch {
      // Clipboard can be blocked; leave the icon untouched.
    }
  };

  const cellBg = (net, maxAbs) => {
    if (!net) return CARD_ALT;
    const ratio = Math.min(1, Math.abs(net) / (maxAbs || 1));
    if (ratio < 0.18) return net > 0 ? "rgba(34,196,147,0.10)" : "rgba(74,110,196,0.22)";
    return net > 0
      ? `rgba(34,196,147,${(0.12 + ratio * 0.3).toFixed(2)})`
      : `rgba(242,85,110,${(0.12 + ratio * 0.3).toFixed(2)})`;
  };

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center" style={{ backgroundColor: BG }}>
        <div
          className="h-10 w-10 animate-spin rounded-full border-2"
          style={{ borderColor: BORDER, borderTopColor: accent }}
          role="progressbar"
          aria-label="Loading dashboard"
        />
      </div>
    );
  }

  const rows = bottomTab === "recent" ? recent : openPositions.slice(0, 6);

  return (
    <div className="-m-1 min-h-screen sm:-m-3" style={{ backgroundColor: BG, color: TEXT }}>
      <div className="mx-auto max-w-[1600px] p-3 sm:p-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[21px] font-semibold tracking-tight sm:text-[22px]">Dashboard</h1>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={TOOLBAR_BTN} title={`Account currency: ${currency}`}>
              <span className="text-[13px] font-semibold">$</span>
              <span className="hidden text-[11px] sm:inline" style={{ color: MUTED }}>
                {currency}
              </span>
              <ChevronDown size={12} className="opacity-60" />
            </button>

            <button type="button" className={TOOLBAR_BTN} onClick={() => navigate("/trades")}>
              <Filter size={14} />
              Filters
            </button>

            <Dropdown
              label="Date range"
              icon={CalendarDays}
              items={PERIODS.map(([key, label]) => ({
                label,
                active: period === key,
                accent,
                onClick: () => setPeriod(key),
              }))}
            />

            <Dropdown
              label="Demo Data"
              icon={FolderOpen}
              items={[
                { label: "Open Backtest lab", icon: Calculator, onClick: () => navigate("/backtest") },
                { label: "Import trades (CSV)", icon: FolderOpen, onClick: () => navigate("/trades") },
              ]}
            />

            <button
              type="button"
              onClick={() => navigate("/mentor")}
              className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-semibold transition-colors ${FOCUS}`}
              style={{ borderColor: "#4b3a9e", backgroundColor: "#1b1436", color: "#cbbcff" }}
            >
              <Sparkles size={14} />
              <span>Ask Zella AI</span>
            </button>

            <button
              type="button"
              onClick={() => navigate("/journal")}
              className={`flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[12px] font-semibold text-white transition hover:brightness-110 ${FOCUS}`}
              style={{ backgroundColor: accent }}
            >
              <Sunrise size={14} />
              Start my day
            </button>

            <button
              type="button"
              className={ICON_BTN}
              onClick={() => navigate("/settings")}
              aria-label="Dashboard settings"
            >
              <Settings size={15} />
            </button>
          </div>
        </div>

        {/* Import line */}
        <div className="mb-4 mt-2 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: MUTED }}>
          <span>
            Last import:{" "}
            <span style={{ color: "#b9b9cc" }}>
              {lastImport ? format(lastImport, "MMM d, yyyy hh:mm a") : "no trades yet"}
            </span>
          </span>
          <button
            type="button"
            onClick={handleResync}
            disabled={refreshing}
            className={`font-semibold transition-opacity hover:underline disabled:opacity-50 ${FOCUS}`}
            style={{ color: "#b7a6ff" }}
          >
            {refreshing ? "Resyncing…" : "Resync"}
          </button>
          <span className="hidden text-[10.5px] sm:inline" style={{ color: FAINT }}>
            · Synced from your broker once a day
          </span>
        </div>

        {error ? (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-[#f2556e]/40 bg-[#f2556e]/10 px-3 py-2 text-[12px]">
            <span style={{ color: "#ff9bad" }}>{error}</span>
            <button type="button" className="font-semibold text-white hover:underline" onClick={handleResync}>
              Retry
            </button>
          </div>
        ) : null}

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          <KpiCard
            title="Net P&L"
            hint="Realised profit and loss for the selected period."
            value={usd(stats.net)}
            tone={stats.net >= 0 ? POS : NEG}
          >
            <button
              type="button"
              onClick={copyNet}
              aria-label="Copy net P&L"
              className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:brightness-125"
              style={{ borderColor: "#2f2560", backgroundColor: "#1a1433", color: "#a78bfa" }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </KpiCard>

          <KpiCard
            title="Trade win %"
            hint="Winning trades as a share of closed trades in the period."
            value={pct(stats.winRate)}
          >
            <SemiGauge win={stats.wins} be={stats.breakeven} loss={stats.losses} />
          </KpiCard>

          <KpiCard
            title="Avg win/loss trade"
            hint="Average winner divided by average loser. Above 1 is healthy."
            value={(Number(stats.payoff) || 0).toFixed(2)}
          >
            <div className="w-[46%] min-w-[104px]">
              <div className="flex h-2 overflow-hidden rounded-full" style={{ backgroundColor: "#1e1e28" }}>
                <span style={{ width: `${winShare}%`, backgroundColor: POS }} />
                <span style={{ flex: 1, backgroundColor: NEG }} />
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] font-semibold tabular-nums">
                <span style={{ color: POS }}>{usdCell(stats.avgWin)}</span>
                <span style={{ color: NEG }}>{`-${usdCell(stats.avgLoss)}`}</span>
              </div>
            </div>
          </KpiCard>

          <KpiCard
            title="Profit factor"
            hint="Gross profit divided by gross loss."
            value={(Number(stats.profitFactor) || 0).toFixed(2)}
          >
            <PfRing value={stats.profitFactor} />
          </KpiCard>

          <div className={`${PANEL} px-4 py-3.5 sm:px-5`}>
            <div className="flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: MUTED }}>
              <span title="Consecutive green days and winning trades at the end of the period.">
                Current streak
              </span>
              <Info size={12} className="opacity-50" aria-hidden="true" />
            </div>
            <div className="mt-2.5 grid grid-cols-[auto_1px_auto] items-center gap-3">
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.08em]" style={{ color: FAINT }}>
                  Days
                </div>
                <div className="mt-1.5 space-y-1.5">
                  <StreakRing
                    count={streak.greenDays}
                    label={`${streak.greenDays} day${streak.greenDays === 1 ? "" : "s"}`}
                    tone={POS}
                  />
                  <StreakRing
                    count={streak.redDays}
                    label={`${streak.redDays} day${streak.redDays === 1 ? "" : "s"}`}
                    tone="#7c8cf8"
                  />
                </div>
              </div>
              <div className="h-14 w-px" style={{ backgroundColor: BORDER }} />
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.08em]" style={{ color: FAINT }}>
                  Trades
                </div>
                <div className="mt-1.5 space-y-1.5">
                  <StreakRing
                    count={streak.win}
                    label={`${streak.win} trade${streak.win === 1 ? "" : "s"}`}
                    tone={POS}
                  />
                  <StreakRing
                    count={streak.loss}
                    label={`${streak.loss} trade${streak.loss === 1 ? "" : "s"}`}
                    tone="#7c8cf8"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Chart + radar + calendar */}
        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="space-y-3">
            <div className={`${PANEL} p-4`}>
              <div className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold">
                Daily net cumulative P&L
                <Info size={12} style={{ color: FAINT }} aria-hidden="true" />
              </div>
              <EquityChart points={curve} />
            </div>

            <div className={`${PANEL} flex flex-col p-4`}>
              <div className="flex items-center gap-1.5 text-[13px] font-semibold">
                Zella score
                <Info size={12} style={{ color: FAINT }} aria-hidden="true" />
              </div>
              <RadarChart metrics={board.metrics} accent={accent} />
              <ScoreBar score={score} />
            </div>
          </div>

          <div className={`${PANEL} flex flex-col p-3 sm:p-4`}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setViewDate((current) => addMonths(current, -1))}
                className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[#1c1c28]"
                style={{ color: MUTED }}
                aria-label="Previous month"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="min-w-[108px] text-center text-[14.5px] font-semibold">
                {format(viewDate, "MMMM yyyy")}
              </span>
              <button
                type="button"
                onClick={() => setViewDate((current) => addMonths(current, 1))}
                className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[#1c1c28]"
                style={{ color: MUTED }}
                aria-label="Next month"
              >
                <ChevronRight size={16} />
              </button>

              <button
                type="button"
                onClick={() => setViewDate(new Date())}
                className={`ml-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors hover:text-white ${FOCUS}`}
                style={{ borderColor: "#242433", color: "#c7c7d6" }}
              >
                This month
              </button>

              <div className="ml-auto flex items-center gap-2.5">
                <div className="text-[11px]" style={{ color: MUTED }}>
                  Monthly stats:{" "}
                  <span className="font-semibold" style={{ color: monthNet >= 0 ? POS : NEG }}>
                    {usdCell(monthNet)}
                  </span>{" "}
                  <span className="ml-1">{monthTraded} days</span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/settings")}
                  aria-label="Calendar settings"
                  className="transition-colors hover:text-white"
                  style={{ color: MUTED }}
                >
                  <Settings size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewDate(new Date())}
                  aria-label="Jump to current month"
                  className="transition-colors hover:text-white"
                  style={{ color: MUTED }}
                >
                  <CalendarDays size={14} />
                </button>
                <span
                  title="Each cell shows that day's net P&L, trade count and win rate."
                  style={{ color: MUTED }}
                >
                  <Info size={14} />
                </span>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 items-stretch gap-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="mb-1.5 grid grid-cols-7 gap-1.5">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                    <div
                      key={label}
                      className="rounded-md py-1.5 text-center text-[11px] font-medium"
                      style={{ backgroundColor: CARD_ALT, color: "#9a9ab0" }}
                    >
                      {label}
                    </div>
                  ))}
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                  {weeks.map((week, weekIndex) => (
                    <div key={weekIndex} className="grid flex-1 grid-cols-7 gap-1.5">
                      {week.map((day, dayIndex) => {
                        if (!day) {
                          return (
                            <div
                              key={`blank-${weekIndex}-${dayIndex}`}
                              className="h-full min-h-[62px] rounded-md sm:min-h-[86px]"
                              style={{ backgroundColor: "#0c0c12" }}
                            />
                          );
                        }

                        const key = format(day, "yyyy-MM-dd");
                        const cell = daysMap.get(key);
                        const winRate = cell && cell.count ? (cell.wins / cell.count) * 100 : 0;

                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => navigate(`/trades?date=${key}`)}
                            title={
                              cell
                                ? `${format(day, "eee, d MMM")}: ${usd(cell.net)} · ${cell.count} trade${
                                    cell.count === 1 ? "" : "s"
                                  }`
                                : format(day, "eee, d MMM")
                            }
                            className="relative flex h-full min-h-[62px] flex-col items-center justify-center rounded-md border px-1 py-1.5 text-center transition hover:brightness-125 sm:min-h-[86px]"
                            style={{
                              backgroundColor: cellBg(cell?.net || 0, monthMax),
                              borderColor: cell ? "#20202c" : "#14141c",
                            }}
                          >
                            <span
                              className="absolute left-1.5 top-1 text-[10px] tabular-nums"
                              style={{ color: FAINT }}
                            >
                              {format(day, "d")}
                            </span>
                            {cell ? (
                              <>
                                <div className="mt-2 text-[11.5px] font-bold tabular-nums sm:text-[12.5px]">
                                  {usdCell(cell.net)}
                                </div>
                                <div className="text-[9px] leading-tight sm:text-[9.5px]" style={{ color: "#b9b9c9" }}>
                                  {cell.count} trade{cell.count === 1 ? "" : "s"}
                                </div>
                                <div className="text-[9px] leading-tight sm:text-[9.5px]" style={{ color: "#b9b9c9" }}>
                                  {pct(winRate, 1)}
                                </div>
                              </>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-[30px] hidden w-[128px] shrink-0 flex-col gap-1.5 lg:flex">
                {weeks.map((week, index) => {
                  const weekStats = week.filter(Boolean).reduce(
                    (acc, day) => {
                      const cell = daysMap.get(format(day, "yyyy-MM-dd"));
                      if (cell) {
                        acc.net += cell.net;
                        acc.days += 1;
                      }
                      return acc;
                    },
                    { net: 0, days: 0 }
                  );
                  return (
                    <div
                      key={index}
                      className="flex flex-1 flex-col justify-center rounded-md border px-3 py-2"
                      style={{ borderColor: BORDER, backgroundColor: CARD }}
                    >
                      <div className="text-[10px]" style={{ color: MUTED }}>
                        Week {index + 1}
                      </div>
                      <div className="text-[13px] font-semibold tabular-nums">{usdCell(weekStats.net)}</div>
                      <div className="text-[9.5px]" style={{ color: FAINT }}>
                        {weekStats.days} day{weekStats.days === 1 ? "" : "s"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom strip */}
        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[1.5fr_1fr_1fr]">
          <div className={`${PANEL} p-4`}>
            <div className="flex items-center gap-4 border-b pb-2.5" style={{ borderColor: BORDER }}>
              {[
                ["recent", "Recent trades"],
                ["open", "Open positions"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setBottomTab(key)}
                  aria-pressed={bottomTab === key}
                  className="relative pb-1 text-[12px] font-semibold transition-colors"
                  style={{ color: bottomTab === key ? TEXT : MUTED }}
                >
                  {label}
                  {bottomTab === key ? (
                    <span
                      className="absolute inset-x-0 -bottom-[11px] h-[2px] rounded"
                      style={{ backgroundColor: accent }}
                    />
                  ) : null}
                </button>
              ))}
              <button
                type="button"
                onClick={() => navigate("/trades")}
                aria-label="Open all trades"
                className="ml-auto transition-colors hover:text-white"
                style={{ color: MUTED }}
              >
                <ArrowUpRight size={15} />
              </button>
            </div>

            {rows.length === 0 ? (
              <div className="py-8 text-center text-[12px]" style={{ color: MUTED }}>
                {bottomTab === "recent"
                  ? "No closed trades yet — log your first one to fill this dashboard."
                  : "No open positions right now."}
              </div>
            ) : (
              rows.map((trade) => {
                const pnl = Number(trade.pnl) || 0;
                const isShort = /short|sell/i.test(trade.direction || "");
                const date = tradeDateOf(trade);
                return (
                  <button
                    key={trade.id}
                    type="button"
                    onClick={() => navigate("/trades")}
                    className="flex w-full items-center gap-3 border-b py-2.5 text-left last:border-0"
                    style={{ borderColor: "#171720" }}
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold uppercase"
                      style={{
                        backgroundColor: isShort ? "rgba(242,85,110,0.14)" : "rgba(34,196,147,0.14)",
                        color: isShort ? NEG : POS,
                      }}
                    >
                      {(trade.pair || "—").slice(0, 2)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold">
                        {trade.pair || "—"} <span style={{ color: MUTED }}>· {trade.direction || "—"}</span>
                      </span>
                      <span className="block text-[10.5px]" style={{ color: FAINT }}>
                        {date ? format(date, "d MMM yyyy") : "—"}
                      </span>
                    </span>
                    <span
                      className="text-[12px] font-semibold tabular-nums"
                      style={{ color: bottomTab === "open" ? MUTED : pnl >= 0 ? POS : NEG }}
                    >
                      {bottomTab === "open" ? "Open" : usd(pnl, true)}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className={`${PANEL} flex flex-col p-4`}>
            <div className="flex items-center gap-1.5 text-[13px] font-semibold">
              Net daily P&L
              <Info size={12} style={{ color: FAINT }} aria-hidden="true" />
            </div>
            <div className="mt-4 flex min-h-[120px] max-h-[168px] flex-1 items-end gap-[3px]">
              {dailyBars.map((bar) => {
                const height = Math.max(bar.net === 0 ? 2 : 4, (Math.abs(bar.net) / maxDaily) * 140);
                return (
                  <div
                    key={format(bar.date, "yyyy-MM-dd")}
                    title={`${format(bar.date, "d MMM")}: ${usd(bar.net)} · ${bar.count} trades`}
                    className="flex-1 rounded-t-[2px]"
                    style={{
                      height: `${Math.round(height)}px`,
                      backgroundColor: bar.net > 0 ? POS : bar.net < 0 ? NEG : "#23232f",
                    }}
                  />
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-[9px]" style={{ color: FAINT }}>
              <span>{format(dailyBars[0].date, "d MMM")}</span>
              <span>{format(dailyBars[dailyBars.length - 1].date, "d MMM")}</span>
            </div>
            <div className="mt-auto flex items-end justify-between gap-3 border-t pt-3" style={{ borderColor: "#171720" }}>
              <div>
                <div className="text-[9.5px] uppercase tracking-wide" style={{ color: FAINT }}>
                  Best day
                </div>
                <div className="text-[12.5px] font-semibold tabular-nums" style={{ color: POS }}>
                  {usd(bestDay.net, true)}
                </div>
                <div className="text-[9.5px]" style={{ color: FAINT }}>
                  {format(bestDay.date, "d MMM")}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[9.5px] uppercase tracking-wide" style={{ color: FAINT }}>
                  Worst day
                </div>
                <div className="text-[12.5px] font-semibold tabular-nums" style={{ color: NEG }}>
                  {usd(worstDay.net, true)}
                </div>
                <div className="text-[9.5px]" style={{ color: FAINT }}>
                  {format(worstDay.date, "d MMM")}
                </div>
              </div>
            </div>
          </div>

          <div className={`${PANEL} flex flex-col p-4`}>
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-semibold">External links</div>
              <button
                type="button"
                onClick={() => navigate("/settings")}
                aria-label="Link settings"
                className="transition-colors hover:text-white"
                style={{ color: MUTED }}
              >
                <Settings size={14} />
              </button>
            </div>

            <div className="mt-1.5 flex flex-1 flex-col">
              {[
                { label: "Weekly performance report", to: "/reports", icon: BarChart3 },
                { label: "Playbook library", to: "/playbooks", icon: BookMarked },
                { label: "Backtest lab", to: "/backtest", icon: Calculator },
                { label: "TradingView chart", to: "/trades", icon: ExternalLink },
              ].map((link) => (
                <button
                  key={link.label}
                  type="button"
                  onClick={() => navigate(link.to)}
                  className="flex w-full items-center gap-2.5 border-b py-2.5 text-left last:border-0"
                  style={{ borderColor: "#171720" }}
                >
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-md"
                    style={{ backgroundColor: CARD_ALT, color: "#a8a8ff" }}
                  >
                    <link.icon size={14} />
                  </span>
                  <span className="flex-1 text-[12px]" style={{ color: "#cfcfdd" }}>
                    {link.label}
                  </span>
                  <ExternalLink size={12} style={{ color: FAINT }} />
                </button>
              ))}

              <div
                className="mt-auto rounded-lg border px-3 py-2.5"
                style={{ borderColor: "#242433", backgroundColor: "#0d0d15" }}
              >
                <div className="text-[11px] font-semibold" style={{ color: "#cfcfdd" }}>
                  Connect your broker
                </div>
                <div className="mt-0.5 text-[10px] leading-snug" style={{ color: FAINT }}>
                  Import MT4, MT5 or CSV trades to keep this dashboard in sync automatically.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
