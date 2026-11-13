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
  Activity,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Copy,
  Calculator,
  DollarSign,
  Filter,
  FolderOpen,
  Info,
  Lock,
  Mic,
  Upload,
  Download,
  Percent,
  Ruler,
  Save,
  Settings,
  Sparkles,
  Sunrise,
  Waves,
  X,
} from "lucide-react";
import useAccent from "../hooks/useAccent";
import demoDashboardTrades from "../lib/demoDashboardData";

// ─── Palette (matches the reference dashboard) ───────────────────────────────
const BG = "#0a0a10";
const CARD_ALT = "#191922";
const BORDER = "#23232f";
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
const TOOLBAR_BTN = `flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#23232f] bg-[#13131b] px-3 text-[12px] font-medium text-[#c7c7d6] transition-colors hover:border-[#33334a] hover:text-white ${FOCUS}`;
const ICON_BTN = `flex h-9 w-9 items-center justify-center rounded-lg border border-[#23232f] bg-[#13131b] text-[#8b8ba3] transition-colors hover:text-white ${FOCUS}`;
const PANEL = `rounded-xl border border-[#23232f] bg-[#13131b]`;

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

// ─── Display units (the currency / $ selector in the toolbar) ────────────────
const priceDelta = (trade) => {
  const entry = Number(trade.entry);
  const exit = Number(trade.exit);
  if (!Number.isFinite(entry) || !Number.isFinite(exit)) return 0;
  const direction = /short|sell/i.test(trade.direction || "") ? -1 : 1;
  return (exit - entry) * direction;
};

const riskAmount = (trade) => {
  const entry = Number(trade.entry);
  const stop = Number(trade.stopLoss);
  const lots = Number(trade.lotSize) || 1;
  if (!Number.isFinite(entry) || !Number.isFinite(stop) || entry === stop) return 0;
  return Math.abs(entry - stop) * 100000 * lots;
};

const DISPLAY_UNITS = [
  ["dollar", "Dollar", "$", DollarSign],
  ["percent", "Percentage", "%", Percent],
  ["r", "R-multiple", "R", Ruler, "Uses the stop loss saved with each trade."],
  ["ticks", "Ticks", "Ticks", Activity, "For futures — derived from the price move."],
  ["pips", "Pips", "Pips", Waves, "For forex — derived from the price move."],
  ["points", "Points", "Pts", CircleDot, "For indices and metals — from the price move."],
];

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
          {items.map((item) =>
            item.divider ? (
              <div key={item.divider} className="my-1 h-px" style={{ backgroundColor: "#26263a" }} />
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onClick?.();
                }}
                className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-[12px] transition-colors hover:bg-[#1c1c28] ${
                  item.active ? "text-white" : "text-[#b9b9cc]"
                }`}
              >
                <span className="flex min-w-0 items-start gap-2">
                  {item.icon ? <item.icon size={13} className="mt-0.5 shrink-0" /> : null}
                  <span className="flex min-w-0 flex-col">
                    <span>{item.label}</span>
                    {item.description ? (
                      <span
                        className="mt-0.5 text-[10px] font-normal leading-snug"
                        style={{ color: FAINT }}
                      >
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                </span>
                {item.active ? (
                  <Check size={13} className="mt-0.5 shrink-0" style={{ color: item.accent || BE }} />
                ) : null}
              </button>
            )
          )}
        </div>
      ) : null}
    </div>
  );
}

function KpiCard({ title, hint, value, tone = TEXT, children, className = "" }) {
  return (
    <div className={`${PANEL} px-4 py-4 sm:px-5 ${className}`}>
      <div className="flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: MUTED }}>
        <span title={hint}>{title}</span>
        {hint ? <Info size={12} className="opacity-50" aria-hidden="true" /> : null}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="text-[26px] font-bold leading-none tracking-tight sm:text-[28px]" style={{ color: tone }}>
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

function EquityChart({ points, formatAxis = usdAxis }) {
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
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(
    0
  ).toFixed(1)} Z`;
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
        <linearGradient id="dashEquityPos" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={POS} stopOpacity="0.32" />
          <stop offset="100%" stopColor={POS} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="dashEquityNeg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={NEG} stopOpacity="0" />
          <stop offset="100%" stopColor={NEG} stopOpacity="0.32" />
        </linearGradient>
        <clipPath id="dashEquityAbove">
          <rect x="0" y="0" width={W} height={y(0)} />
        </clipPath>
        <clipPath id="dashEquityBelow">
          <rect x="0" y={y(0)} width={W} height={H - y(0)} />
        </clipPath>
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
            {formatAxis(tick)}
          </text>
        </g>
      ))}

      <g clipPath="url(#dashEquityAbove)">
        <path d={area} fill="url(#dashEquityPos)" />
      </g>
      <g clipPath="url(#dashEquityBelow)">
        <path d={area} fill="url(#dashEquityNeg)" />
      </g>
      <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="#2c2c3a" />

      <path
        d={line}
        fill="none"
        stroke="#8b7cf6"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={x(points.length - 1)} cy={y(values[values.length - 1])} r="3.5" fill="#8b7cf6" />

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

/** Net daily P&L: green / red bars around a dashed zero line with a $ axis. */
function NetDailyChart({ bars, formatAxis = usdAxis }) {
  const W = 460;
  const H = 210;
  const PAD = { left: 48, right: 8, top: 12, bottom: 24 };
  const top = Math.max(0, ...bars.map((bar) => bar.net));
  const low = Math.min(0, ...bars.map((bar) => bar.net));
  const span = top - low || 1;
  const x = (index) => PAD.left + (index + 0.5) * ((W - PAD.left - PAD.right) / Math.max(1, bars.length));
  const y = (value) => PAD.top + (1 - (value - low) / span) * (H - PAD.top - PAD.bottom);
  const barW = Math.max(3, ((W - PAD.left - PAD.right) / Math.max(1, bars.length)) * 0.5);
  const ticks = [0, 1, 2, 3].map((index) => low + (span * index) / 3);
  const labelIndexes = [0, Math.floor((bars.length - 1) / 2), bars.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-full w-full"
      role="img"
      aria-label="Net daily profit and loss"
    >
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
            {formatAxis(tick)}
          </text>
        </g>
      ))}
      <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="#2c2c3a" />

      {bars.map((bar, index) => {
        const zero = y(0);
        const value = y(bar.net);
        return (
          <rect
            key={format(bar.date, "yyyy-MM-dd")}
            x={x(index) - barW / 2}
            y={Math.min(zero, value)}
            width={barW}
            height={Math.max(2, Math.abs(zero - value))}
            rx="2"
            fill={bar.net > 0 ? POS : bar.net < 0 ? NEG : "#2c2c3a"}
          >
            <title>{`${format(bar.date, "d MMM")}: ${usd(bar.net)}`}</title>
          </rect>
        );
      })}

      {labelIndexes.map((index) => (
        <text
          key={index}
          x={x(index)}
          y={H - 6}
          textAnchor={index === 0 ? "start" : index === bars.length - 1 ? "end" : "middle"}
          fontSize="9.5"
          fill={FAINT}
        >
          {format(bars[index].date, "MM/dd/yy")}
        </text>
      ))}
    </svg>
  );
}

/** Performance by hour of day — the reference "Trade time" panel. */
function TradeTimeChart({ trades, formatAxis = usdAxis }) {
  const W = 460;
  const H = 190;
  const PAD = { left: 48, right: 8, top: 12, bottom: 24 };
  const buckets = useMemo(() => {
    const map = new Map();
    for (let hour = 8; hour <= 22; hour += 1) map.set(hour, 0);
    trades.forEach((trade) => {
      const date = tradeDateOf(trade);
      if (!date) return;
      const hour = date.getHours();
      if (!map.has(hour)) map.set(hour, 0);
      map.set(hour, map.get(hour) + (Number(trade.pnl) || 0));
    });
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([hour, net]) => ({ hour, net }));
  }, [trades]);

  const top = Math.max(0, ...buckets.map((bucket) => bucket.net));
  const low = Math.min(0, ...buckets.map((bucket) => bucket.net));
  const span = top - low || 1;
  const x = (index) => PAD.left + (index + 0.5) * ((W - PAD.left - PAD.right) / Math.max(1, buckets.length));
  const y = (value) => PAD.top + (1 - (value - low) / span) * (H - PAD.top - PAD.bottom);
  const barW = Math.max(3, ((W - PAD.left - PAD.right) / Math.max(1, buckets.length)) * 0.5);
  const ticks = [0, 1, 2, 3].map((index) => low + (span * index) / 3);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-full w-full"
      role="img"
      aria-label="Performance by hour of day"
    >
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
            {formatAxis(tick)}
          </text>
        </g>
      ))}
      <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="#2c2c3a" />

      {buckets.map((bucket, index) => {
        const zero = y(0);
        const value = y(bucket.net);
        return (
          <g key={bucket.hour}>
            <rect
              x={x(index) - barW / 2}
              y={Math.min(zero, value)}
              width={barW}
              height={Math.max(1.5, Math.abs(zero - value))}
              rx="1.5"
              fill={bucket.net > 0 ? POS : bucket.net < 0 ? NEG : "#2c2c3a"}
            />
            <text x={x(index)} y={H - 6} textAnchor="middle" fontSize="8.5" fill={FAINT}>
              {bucket.hour}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function DayCurve({ points, tone }) {
  const W = 320;
  const H = 112;
  const PAD = { left: 34, right: 6, top: 8, bottom: 8 };
  if (!points || points.length < 2) {
    return (
      <div className="flex h-[112px] items-center justify-center text-[11px]" style={{ color: MUTED }}>
        One trade — no curve yet.
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
  const gradientId = `dayCurve-${tone === POS ? "pos" : "neg"}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[112px] w-full" role="img" aria-label="Day cumulative P&L">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone} stopOpacity="0.32" />
          <stop offset="100%" stopColor={tone} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="#2c2c3a" />
      <text x={PAD.left - 6} y={y(high) + 4} textAnchor="end" fontSize="9" fill={FAINT}>
        {usdAxis(high)}
      </text>
      <text x={PAD.left - 6} y={y(low) + 4} textAnchor="end" fontSize="9" fill={FAINT}>
        {usdAxis(low)}
      </text>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={tone} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Click a calendar day: the reference trade-detail sheet. */
function DayDetailModal({ day, trades, onClose, onOpenTrades, onAddNote }) {
  const dayStats = useMemo(() => summarize(trades || []), [trades]);
  const curve = useMemo(() => equitySeries(trades || []), [trades]);
  const commissions = (trades || []).reduce((sum, trade) => sum + (Number(trade.commission) || 0), 0);
  const swap = (trades || []).reduce((sum, trade) => sum + (Number(trade.swap) || 0), 0);
  const volume = (trades || []).reduce((sum, trade) => sum + (Number(trade.lotSize) || 0), 0);
  const tone = dayStats.net >= 0 ? POS : NEG;

  const [note, setNote] = useState("");
  const [voiceListening, setVoiceListening] = useState(false);

  const stats = [
    ["Total trades", String(dayStats.count)],
    ["Winners", String(dayStats.wins)],
    ["Gross P&L", usd(dayStats.net + commissions + swap)],
    ["Commissions", usd(commissions + swap)],
    ["Winrate", pct(dayStats.winRate, 0)],
    ["Losers", String(dayStats.losses)],
    ["Volume", volume ? volume.toFixed(2) : "0"],
    ["Profit factor", (Number(dayStats.profitFactor) || 0).toFixed(2)],
  ];

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSave = () => {
    onAddNote(note);
  };

  const handleVoice = () => {
    setVoiceListening((prev) => !prev);
  };

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Trades on ${format(day, "EEEE, d MMMM yyyy")}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[960px] overflow-hidden rounded-xl border shadow-2xl shadow-black/70"
        style={{ backgroundColor: "#141420", borderColor: "#2c2c3d" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b" style={{ borderColor: "#23232f" }}>
          <div className="flex flex-wrap items-baseline gap-2 text-[15px] font-semibold">
            <span>{format(day, "EEE, MMM dd, yyyy")}</span>
            <span style={{ color: "#5b5b72" }}>•</span>
            <span style={{ color: MUTED }}>Net P&L</span>
            <span style={{ color: tone }}>{usd(dayStats.net)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!note.trim()}
              className={`flex h-9 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold text-white transition ${FOCUS}`}
              style={{ backgroundColor: !note.trim() ? "#2c254a" : "#6C47FF", opacity: !note.trim() ? 0.5 : 1 }}
            >
              <Save size={13} /> Save
            </button>
            <button
              type="button"
              onClick={handleVoice}
              aria-label={voiceListening ? "Stop voice" : "Voice note"}
              className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${FOCUS}`}
              style={{
                backgroundColor: voiceListening ? "#f2556e" : "#1e1e28",
                color: voiceListening ? "#ffffff" : "#b9b9cc",
              }}
            >
              <Mic size={14} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close day details"
              className="flex h-8 w-8 items-center justify-center rounded-md text-[#9a9aae] transition-colors hover:bg-white/5 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Rich note editor */}
        <div className="px-5 py-3 border-b" style={{ borderColor: "#23232f" }}>
          <div className="flex items-center gap-2 mb-2 overflow-x-auto px-1">
            <button type="button" className="flex h-6 w-6 items-center justify-center rounded text-[10px] text-[#b9b9cc] hover:text-white" aria-label="Undo" title="Undo">
              <ArrowUpRight size={12} />
            </button>
            <button type="button" className="flex h-6 w-6 items-center justify-center rounded text-[10px] text-[#b9b9cc] hover:text-white" aria-label="Redo" title="Redo">
              <ArrowUpRight size={12} />
            </button>
            <div className="flex items-center gap-1 text-[10px] text-[#b9b9cc] border-r border-[#23232f] pr-1">
              <span className="flex items-center gap-1">Normal</span>
              <ChevronDown size={10} />
            </div>
            <div className="flex items-center gap-1 text-[10px] text-[#b9b9cc] border-r border-[#23232f] pr-1">
              <span className="flex items-center gap-1">Arial</span>
              <ChevronDown size={10} />
            </div>
            <div className="flex items-center gap-1 text-[10px] text-[#b9b9cc] border-r border-[#23232f] pr-1">
              <span>15</span>
              <button type="button" className="ml-0.5 text-[#b9b9cc] hover:text-white" title="Increase">+</button>
              <button type="button" className="ml-0.5 text-[#b9b9cc] hover:text-white" title="Decrease">−</button>
            </div>
            <button type="button" className="flex items-center gap-1 text-[10px] font-medium text-[#b9b9cc] hover:text-white" aria-label="Bold" title="Bold">B</button>
            <button type="button" className="flex items-center gap-1 text-[10px] font-medium text-[#b9b9cc] hover:text-white" aria-label="Italic" title="Italic">I</button>
            <button type="button" className="flex items-center gap-1 text-[10px] font-medium text-[#b9b9cc] hover:text-white" aria-label="Underline" title="Underline">U</button>
            <button type="button" className="flex items-center gap-1 text-[10px] font-medium text-[#b9b9cc] hover:text-white" aria-label="Strikethrough" title="Strikethrough">S</button>
            <div className="flex items-center gap-1 text-[10px] text-[#b9b9cc] border-r border-[#23232f] pr-1">
              <span>Left Align</span>
              <ChevronDown size={10} />
            </div>
            <div className="flex items-center gap-1 text-[10px] text-[#b9b9cc] border-r border-[#23232f] pr-1">
              <span>Insert</span>
              <ChevronDown size={10} />
            </div>
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Enter some text..."
            className="w-full min-h-[110px] resize-y rounded-lg border border-[#23232f] bg-[#0a0a10] p-3 text-sm outline-none focus:ring-2 focus:ring-[#6C47FF] text-[#e9e9f2]"
          />
          <div className="flex items-center gap-2 mt-2">
            <button type="button" onClick={handleVoice} aria-label={voiceListening ? "Stop voice" : "Start voice recording"} title={voiceListening ? "Stop voice" : "Voice note"} className="flex h-7 w-7 items-center justify-center rounded-full transition-colors" style={{ backgroundColor: voiceListening ? "#f2556e" : "#1e1e28" }}>
              <Mic size={13} />
            </button>
            <button type="button" className="flex h-7 w-7 items-center justify-center rounded-full text-[#b9b9cc] hover:text-white" title="Upload" aria-label="Upload file"><Upload size={13} /></button>
            <button type="button" className="flex h-7 w-7 items-center justify-center rounded-full text-[#b9b9cc] hover:text-white" title="Download" aria-label="Download note"><Download size={13} /></button>
            <button type="button" className="flex h-7 w-7 items-center justify-center rounded-full text-[#b9b9cc] hover:text-white" title="Share" aria-label="Share note"><Copy size={13} /></button>
            <button type="button" className="ml-auto flex h-7 w-7 items-center justify-center rounded-full text-[#b9b9cc] hover:text-[#f2556e]" title="Delete note" aria-label="Delete note"><X size={13} /></button>
          </div>
        </div>

        <div className="border-t" style={{ borderColor: "#23232f" }}>
          <div className="grid grid-cols-1 gap-5 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <DayCurve points={curve} tone={tone} />

            <div className="grid grid-cols-2 gap-x-6 gap-y-3.5 sm:grid-cols-4">
              {stats.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <div className="truncate text-[10px]" style={{ color: FAINT }}>
                    {label}
                  </div>
                  <div
                    className="mt-0.5 truncate text-[13px] font-semibold tabular-nums"
                    style={{
                      color:
                        label === "Gross P&L"
                          ? dayStats.net >= 0
                            ? POS
                            : NEG
                          : TEXT,
                    }}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto border-t" style={{ borderColor: "#23232f" }}>
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide" style={{ backgroundColor: "#191926", color: FAINT }}>
                  {["Open time", "Ticker", "Side", "Instrument", "Net P&L", "Net ROI", "Realized R", "Playbook"].map(
                    (label) => (
                      <th key={label} className="px-3 py-2 font-semibold">
                        {label}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {trades.map((trade, index) => {
                  const pnl = Number(trade.pnl) || 0;
                  const notional =
                    (Number(trade.entry) || 0) * (Number(trade.lotSize) || 1) * 100000;
                  const roi = notional ? (pnl / notional) * 100 : null;
                  const rr = Number(trade.rr);
                  return (
                    <tr
                      key={trade.id || index}
                      className="border-t text-[11.5px]"
                      style={{ borderColor: "#1d1d2a", backgroundColor: index % 2 ? "#16161f" : "transparent" }}
                    >
                      <td className="px-3 py-2" style={{ color: "#b9b9c9" }}>
                        {tradeDateOf(trade) ? format(tradeDateOf(trade), "HH:mm:ss") : "—"}
                      </td>
                      <td className="px-3 py-2 font-semibold">{trade.pair || "—"}</td>
                      <td className="px-3 py-2" style={{ color: "#b9b9c9" }}>
                        {(trade.direction || "—").toUpperCase()}
                      </td>
                      <td className="px-3 py-2" style={{ color: "#b9b9c9" }}>
                        {trade.pair || "—"}
                      </td>
                      <td className="px-3 py-2 font-semibold tabular-nums" style={{ color: pnl >= 0 ? POS : NEG }}>
                        {usd(pnl)}
                      </td>
                      <td className="px-3 py-2 tabular-nums" style={{ color: "#9a9aae" }}>
                        {roi === null ? "—" : `(${roi.toFixed(2)}%)`}
                      </td>
                      <td className="px-3 py-2 tabular-nums" style={{ color: "#9a9aae" }}>
                        {Number.isFinite(rr) ? `${rr.toFixed(2)}R` : "—"}
                      </td>
                      <td className="px-3 py-2" style={{ color: "#9a9aae" }}>
                        {trade.playbook?.name || trade.strategy || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "#23232f" }}>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-[12px] font-semibold text-[#c7c7d6] transition-colors hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onOpenTrades}
              className="rounded-lg px-4 py-2 text-[12px] font-semibold text-white transition hover:brightness-110"
              style={{ backgroundColor: "#4b3fa8" }}
            >
              View Details
            </button>
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
  const [copied, setCopied] = useState("");
  const [displayMode, setDisplayMode] = useState("dollar");
  const [privacy, setPrivacy] = useState(false);
  const [tradeFilter, setTradeFilter] = useState("all");
  const [selectedDay, setSelectedDay] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [demoMode, setDemoMode] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("demo") === "1";
    } catch {
      return false;
    }
  });

  const accountId = currentAccount?.id;
  const startingBalance = Number(currentAccount?.starting_balance) || 10000;

  const load = async () => {
    // Demo mode shows bundled sample trades; it never writes to Firestore.
    if (demoMode) {
      setTrades(demoDashboardTrades());
      setError("");
      setLoading(false);
      return;
    }
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
  }, [accountId, demoMode]);

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

  // Convert every trade's P&L into the selected display unit once, so the KPIs,
  // charts and calendar all speak the same language.
  const unitTrades = useMemo(
    () =>
      trades.map((trade) => {
        const pnl = Number(trade.pnl) || 0;
        let value = pnl;
        if (displayMode === "percent") value = (pnl / (startingBalance || 1)) * 100;
        else if (displayMode === "r") {
          const risk = riskAmount(trade);
          const rr = Number(trade.rr);
          value = risk ? pnl / risk : Number.isFinite(rr) ? rr : 0;
        } else if (displayMode === "pips") value = priceDelta(trade) * 10000;
        else if (displayMode === "points") value = priceDelta(trade) * 100;
        else if (displayMode === "ticks") value = priceDelta(trade) * 400;
        return { ...trade, pnl: Number(value.toFixed(4)) };
      }),
    [trades, displayMode, startingBalance]
  );

  const matchesFilter = (trade) => {
    const pnl = Number(trade.pnl) || 0;
    if (tradeFilter === "wins") return pnl > 0;
    if (tradeFilter === "losses") return pnl < 0;
    if (tradeFilter === "breakeven") return pnl === 0;
    return true;
  };

  const executed = useMemo(
    () => unitTrades.filter((t) => t.status !== "pending" && matchesFilter(t)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unitTrades, tradeFilter]
  );
  const openPositions = useMemo(() => trades.filter((t) => t.status === "pending"), [trades]);

  const periodTrades = useMemo(() => {
    if (period === "all") return executed;
    const now = new Date();
    const start =
      period === "this-month"
        ? startOfMonth(now)
        : period === "this-year"
        ? new Date(now.getFullYear(), 0, 1)
        : subDays(now, 29);
    const end = period === "this-month" ? endOfMonth(now) : now;
    return executed.filter((trade) => {
      const date = tradeDateOf(trade);
      return date && isWithinInterval(date, { start, end });
    });
  }, [executed, period]);

  const stats = useMemo(() => summarize(periodTrades), [periodTrades]);
  const rangeLabel = useMemo(() => {
    const dates = periodTrades.map(tradeDateOf).filter(Boolean).sort((a, b) => a - b);
    if (!dates.length) return "Date range";
    return `${format(dates[0], "MMM dd, yyyy")}-${format(dates[dates.length - 1], "MMM dd, yyyy")}`;
  }, [periodTrades]);
  const curve = useMemo(() => equitySeries(periodTrades), [periodTrades]);
  const board = useMemo(() => scoreMetrics(unitTrades, curve), [unitTrades, curve]);
  const score = board.metrics.reduce((sum, metric) => sum + metric.value, 0) / board.metrics.length;

  const daysMap = useMemo(() => dayPnL(unitTrades), [unitTrades]);

  const formatValue = (value, signed = false) => {
    if (privacy) return "••••";
    const n = Number(value) || 0;
    const sign = n < 0 ? "-" : signed && n > 0 ? "+" : "";
    const abs = Math.abs(n);
    if (displayMode === "percent") return `${sign}${abs.toFixed(2)}%`;
    if (displayMode === "r") return `${sign}${abs.toFixed(2)}R`;
    if (displayMode === "pips") return `${sign}${abs.toFixed(1)} pips`;
    if (displayMode === "points") return `${sign}${abs.toFixed(1)} pts`;
    if (displayMode === "ticks") return `${sign}${Math.round(abs)} ticks`;
    return `${sign}$${abs.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatCell = (value) => {
    if (privacy) return "••••";
    if (displayMode === "dollar") return usdCell(value);
    return formatValue(value, true).replace(/\s(pips|pts|ticks)$/, "").replace(/(\.\d\d)0+$/, "$1");
  };

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

  const avgTotal = stats.avgWin + stats.avgLoss;
  const winShare = avgTotal ? (stats.avgWin / avgTotal) * 100 : 50;

  const copyValue = async (key, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
    } catch {
      // Clipboard can be blocked; leave the icon untouched.
    }
  };

  const axis = (value) => (displayMode === "dollar" ? usdAxis(value) : formatValue(value));

  const dayTrades = useMemo(() => {
    if (!selectedDay) return [];
    const key = format(selectedDay, "yyyy-MM-dd");
    return trades.filter((trade) => {
      const date = tradeDateOf(trade);
      return date && format(date, "yyyy-MM-dd") === key;
    });
  }, [trades, selectedDay]);

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
          <h1 className="text-[22px] font-semibold tracking-tight sm:text-[24px]">Dashboard</h1>

          <div className="flex flex-wrap items-center gap-2">
            <Dropdown
              label={DISPLAY_UNITS.find(([key]) => key === displayMode)?.[2] || "$"}
              width="w-64"
              items={[
                ...DISPLAY_UNITS.map(([key, label, , Icon, description]) => ({
                  label,
                  icon: Icon,
                  description,
                  active: displayMode === key,
                  accent,
                  onClick: () => setDisplayMode(key),
                })),
                { divider: "privacy" },
                {
                  label: "Privacy",
                  icon: Lock,
                  description: "Hide P&L figures while sharing your screen.",
                  active: privacy,
                  accent,
                  onClick: () => setPrivacy((value) => !value),
                },
              ]}
            />

            <Dropdown
              label="Filters"
              icon={Filter}
              width="w-48"
              items={[
                { key: "all", label: "All trades", description: "No P&L filter applied." },
                { key: "wins", label: "Winners only", description: "Trades that ended in profit." },
                { key: "losses", label: "Losers only", description: "Trades that ended at a loss." },
                { key: "breakeven", label: "Breakeven", description: "Trades that closed flat." },
              ].map((item) => ({
                label: item.label,
                description: item.description,
                active: tradeFilter === item.key,
                accent,
                onClick: () => setTradeFilter(item.key),
              }))}
            />

            <Dropdown
              label={rangeLabel}
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
                {
                  label: demoMode ? "Back to my data" : "Show demo dashboard",
                  icon: Sparkles,
                  active: demoMode,
                  accent,
                  onClick: () => setDemoMode((value) => !value),
                },
                { label: "Open Backtest lab", icon: Calculator, onClick: () => navigate("/backtest") },
                { label: "Import trades (CSV)", icon: FolderOpen, onClick: () => navigate("/trades") },
              ]}
            />
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
          {demoMode ? (
            <span className="flex items-center gap-1.5 rounded-md border border-[#3a2d6b] bg-[#1b1436] px-2 py-0.5 text-[10px] font-semibold text-[#cbbcff]">
              Demo data
              <button
                type="button"
                onClick={() => setDemoMode(false)}
                className="hover:text-white"
                aria-label="Exit demo data"
              >
                ×
              </button>
            </span>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
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
            value={formatValue(stats.net)}
            tone={stats.net >= 0 ? POS : NEG}
          >
            <button
              type="button"
              onClick={() => copyValue("net", formatValue(stats.net))}
              aria-label="Copy net P&L"
              className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:brightness-125"
              style={{ borderColor: "#2f2560", backgroundColor: "#1a1433", color: "#a78bfa" }}
            >
              {copied === "net" ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </KpiCard>

          <KpiCard
            title="Trade expectancy"
            hint="Average result per trade in the selected period."
            value={formatValue(stats.avgPnl)}
            tone={stats.avgPnl >= 0 ? TEXT : NEG}
          >
            <button
              type="button"
              onClick={() => copyValue("expectancy", formatValue(stats.avgPnl, true))}
              aria-label="Copy trade expectancy"
              className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:brightness-125"
              style={{ borderColor: "#2f2560", backgroundColor: "#1a1433", color: "#a78bfa" }}
            >
              {copied === "expectancy" ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </KpiCard>

          <KpiCard
            title="Profit factor"
            hint="Gross profit divided by gross loss."
            value={(Number(stats.profitFactor) || 0).toFixed(2)}
          >
            <PfRing value={stats.profitFactor} />
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
            <div className="w-[54%] min-w-[112px]">
              <div className="flex h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: "#1e1e28" }}>
                <span style={{ width: `${winShare}%`, backgroundColor: POS }} />
                <span style={{ flex: 1, backgroundColor: NEG }} />
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] font-semibold tabular-nums">
                <span style={{ color: POS }}>{formatCell(stats.avgWin)}</span>
                <span style={{ color: NEG }}>{`-${formatCell(stats.avgLoss)}`}</span>
              </div>
            </div>
          </KpiCard>
        </div>

        {/* Zella score / cumulative P&L / net daily P&L */}
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          <div className={`${PANEL} flex flex-col p-4`}>
            <div className="flex items-center gap-1.5 text-[13px] font-semibold">
              Zella score
              <Info size={12} style={{ color: FAINT }} aria-hidden="true" />
            </div>
            <RadarChart metrics={board.metrics} accent={accent} />
            <ScoreBar score={score} />
          </div>

          <div className={`${PANEL} flex flex-col p-4`}>
            <div className="flex items-center gap-1.5 text-[13px] font-semibold">
              Daily net cumulative P&L
              <Info size={12} style={{ color: FAINT }} aria-hidden="true" />
            </div>
            <div className="mt-1 flex-1">
              <EquityChart points={curve} formatAxis={axis} />
            </div>
          </div>

          <div className={`${PANEL} flex flex-col p-4`}>
            <div className="flex items-center gap-1.5 text-[13px] font-semibold">
              Net daily P&L
              <Info size={12} style={{ color: FAINT }} aria-hidden="true" />
            </div>
            <div className="mt-1 min-h-[196px] flex-1">
              <NetDailyChart bars={dailyBars} formatAxis={axis} />
            </div>
          </div>
        </div>

        {/* Recent trades + trade time | calendar */}
        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex flex-col gap-3">
            <div className={`${PANEL} flex flex-col p-4`}>
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
                    style={{ color: bottomTab === key ? "#a78bfa" : MUTED }}
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

              <div className="mt-3 overflow-hidden rounded-lg border" style={{ borderColor: "#1f1f2b" }}>
                <div
                  className="grid grid-cols-[1fr_0.75fr_0.9fr] text-[10px] uppercase tracking-wide"
                  style={{ backgroundColor: CARD_ALT, color: MUTED }}
                >
                  <span className="px-3 py-2">{bottomTab === "open" ? "Open date" : "Close date"}</span>
                  <span className="px-3 py-2">Symbol</span>
                  <span className="px-3 py-2 text-right">{bottomTab === "open" ? "Status" : "Net P&L"}</span>
                </div>

                {rows.length === 0 ? (
                  <div className="px-3 py-8 text-center text-[12px]" style={{ color: MUTED }}>
                    {bottomTab === "recent"
                      ? "No closed trades yet — log your first one to fill this dashboard."
                      : "No open positions right now."}
                  </div>
                ) : (
                  rows.map((trade, index) => {
                    const pnl = Number(trade.pnl) || 0;
                    const date = tradeDateOf(trade);
                    return (
                      <button
                        key={trade.id || index}
                        type="button"
                        onClick={() => navigate("/trades")}
                        className="grid w-full grid-cols-[1fr_0.75fr_0.9fr] border-t text-left text-[11.5px] transition-colors hover:bg-white/[0.03]"
                        style={{
                          borderColor: "#1d1d29",
                          backgroundColor: index % 2 ? "rgba(255,255,255,0.018)" : "transparent",
                        }}
                      >
                        <span className="px-3 py-2.5 tabular-nums" style={{ color: "#b9b9c9" }}>
                          {date ? format(date, "MM/dd/yyyy") : "—"}
                        </span>
                        <span className="truncate px-3 py-2.5 font-semibold">{trade.pair || "—"}</span>
                        <span
                          className="px-3 py-2.5 text-right font-semibold tabular-nums"
                          style={{ color: bottomTab === "open" ? MUTED : pnl >= 0 ? POS : NEG }}
                        >
                          {bottomTab === "open" ? "Open" : formatValue(pnl, true)}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className={`${PANEL} flex flex-col p-4`}>
              <div className="flex items-center gap-1.5 text-[13px] font-semibold">
                Trade time
                <Info size={12} style={{ color: FAINT }} aria-hidden="true" />
              </div>
              <div className="mt-2 h-[190px] flex-1">
                <TradeTimeChart trades={periodTrades} formatAxis={axis} />
              </div>
            </div>
          </div>

          <div className={`${PANEL} flex flex-col p-4`} data-testid="trade-calendar">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setViewDate((current) => addMonths(current, -1))}
                className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[#1c1c28]"
                style={{ color: MUTED }}
                aria-label="Previous month"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="min-w-[112px] text-center text-[13.5px] font-semibold">
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
                className={`ml-1 rounded-md border px-2.5 py-1 text-[11px] font-medium text-[#c7c7d6] transition-colors hover:text-white ${FOCUS}`}
                style={{ borderColor: "#2a2a3a" }}
              >
                This month
              </button>

              <div className="ml-auto flex items-center gap-2.5">
                <div className="text-[11px]" style={{ color: MUTED }}>
                  Monthly stats:{" "}
                  <span className="font-semibold" style={{ color: monthNet >= 0 ? POS : NEG }}>
                    {formatCell(monthNet)}
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
              </div>
            </div>

            <div className="mt-3 flex min-h-0 flex-1 items-stretch gap-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="mb-1.5 grid grid-cols-7 gap-1.5">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                    <div
                      key={label}
                      className="rounded-md py-1.5 text-center text-[10.5px] font-medium"
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
                              className="h-full min-h-[72px] rounded-md"
                              style={{ backgroundColor: "#0f0f17" }}
                            />
                          );
                        }

                        const key = format(day, "yyyy-MM-dd");
                        const cell = daysMap.get(key);
                        const winRate = cell && cell.count ? (cell.wins / cell.count) * 100 : 0;
                        const empty = !cell;
                        const tone = cell ? (cell.net > 0 ? POS : cell.net < 0 ? NEG : TEXT) : TEXT;

                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setSelectedDay(day)}
                            title={
                              cell
                                ? `${format(day, "eee, d MMM")}: ${formatValue(cell.net)} · ${cell.count} trade${
                                    cell.count === 1 ? "" : "s"
                                  }`
                                : format(day, "eee, d MMM")
                            }
                            className="relative flex h-full min-h-[72px] flex-col items-center justify-start rounded-md px-1 pb-1.5 pt-[22px] text-center transition hover:brightness-125"
                            style={{
                              backgroundColor: empty
                                ? "#15151d"
                                : cell.net > 0
                                ? "rgba(34,196,147,0.16)"
                                : cell.net < 0
                                ? "rgba(242,85,110,0.18)"
                                : "rgba(70,110,220,0.22)",
                              border: `1px solid ${empty ? "#1d1d29" : "rgba(255,255,255,0.05)"}`,
                            }}
                          >
                            <span
                              className="absolute inset-x-0 top-1 text-center text-[10.5px] tabular-nums"
                              style={{ color: empty ? FAINT : "#d5d5e2" }}
                            >
                              {format(day, "d")}
                            </span>
                            {cell ? (
                              <>
                                <div className="mt-0.5 text-[11.5px] font-semibold tabular-nums" style={{ color: tone }}>
                                  {formatCell(cell.net)}
                                </div>
                                <div className="text-[9px] leading-tight" style={{ color: "#cfcfdd" }}>
                                  {cell.count} trade{cell.count === 1 ? "" : "s"}
                                </div>
                                <div className="text-[9px] leading-tight" style={{ color: "#cfcfdd" }}>
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

              <div className="mt-[28px] hidden w-[92px] shrink-0 flex-col gap-1.5 lg:flex">
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
                      className="flex flex-1 flex-col justify-start rounded-md border px-2.5 py-2"
                      style={{ borderColor: "#232331", backgroundColor: CARD_ALT }}
                    >
                      <div className="text-[9.5px]" style={{ color: MUTED }}>
                        Week {index + 1}
                      </div>
                      <div className="text-[12px] font-semibold tabular-nums">{formatCell(weekStats.net)}</div>
                      <div className="text-[9px]" style={{ color: FAINT }}>
                        {weekStats.days} day{weekStats.days === 1 ? "" : "s"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {selectedDay ? (
        <DayDetailModal
          day={selectedDay}
          trades={dayTrades}
          onClose={() => setSelectedDay(null)}
          onOpenTrades={() => {
            const key = format(selectedDay, "yyyy-MM-dd");
            setSelectedDay(null);
            navigate(`/trades?date=${key}`);
          }}
          onAddNote={() => {
            const key = format(selectedDay, "yyyy-MM-dd");
            setSelectedDay(null);
            navigate(`/journal?date=${key}`);
          }}
        />
      ) : null}
    </div>
  );
}
