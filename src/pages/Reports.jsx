// src/pages/Reports.jsx
// Reports Ã¢â‚¬â€ overview statistics, per-dimension reports, group comparison and a
// P&L calendar. Every number is computed from the same trades the rest of the
// app logs; nothing is duplicated into a second store.
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { collection, getDocs } from "firebase/firestore";
import { auth, db } from "../firebase";
import {
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Filter,
  Info,
  Layers,
  Loader2,
  MoreHorizontal,
  Plus,
  Tag,
  Target,
  Wallet,
  X,
} from "lucide-react";
import demoDashboardTrades from "../lib/demoDashboardData";
import {
  DAYS,
  HOLD_BUCKETS,
  HOUR_BUCKETS,
  avg,
  chronological,
  dayOfWeek,
  holdMinutes,
  hourBucket,
  isExecuted,
  money,
  pct,
  pnlOf,
  ratio,
  realisedR,
  tradeDate,
  tradeStats,
} from "../lib/analytics";
import { FOCUS, HEAD, MUTED, NEG, NEG_T, POS, POS_T } from "../lib/uiTokens";

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Look & feel Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// The reports surface is a light, dense data view. Colours stay ours: violet
// accent, green profit, red loss, hairline dividers.
const ACCENT = "#6C47FF";
const PANEL_BG = "bg-white dark:bg-[#13131f]";
const PANEL_BORDER = "border-[#eceef4] dark:border-[#252538]";
const CARD_BASE = `rounded-lg border ${PANEL_BORDER} ${PANEL_BG}`;
const TITLE = "text-[11px] font-bold uppercase tracking-[0.045em] text-[#3f4354] dark:text-[#c9cbe0]";
const SUBTITLE = "text-[10px] font-semibold uppercase tracking-[0.035em] text-[#9aa1b1] dark:text-[#7e84a3]";
const ROW_LABEL = "text-[12.5px] leading-5 text-[#4b5162] dark:text-[#a4a8c0]";
const ROW_VALUE = "text-[12.5px] font-semibold leading-5 tabular-nums text-[#14142b] dark:text-white";
const ROW_LINE = "border-[#f4f5f9] dark:border-[#202033]";

const METRICS = [
  ["net", "Net P&L"],
  ["gross", "Gross P&L"],
  ["volume", "Volume"],
  ["commissions", "Commissions"],
];

const metricValue = (trade, metric) => {
  if (metric === "gross") return pnlOf(trade) - (Number(trade.commission) || 0) - (Number(trade.swap) || 0);
  if (metric === "volume") return Number(trade.lotSize) || 0;
  if (metric === "commissions") return Number(trade.commission) || 0;
  return pnlOf(trade);
};

const metricTitle = (metric) => {
  if (metric === "gross") return "DAILY NET CUMULATIVE GROSS P&L";
  if (metric === "volume") return "DAILY NET CUMULATIVE VOLUME";
  if (metric === "commissions") return "DAILY NET CUMULATIVE COMMISSIONS";
  return "DAILY NET CUMULATIVE P&L";
};

const metricDailyTitle = (metric) => {
  if (metric === "gross") return "NET DAILY GROSS P&L";
  if (metric === "volume") return "NET DAILY VOLUME";
  if (metric === "commissions") return "NET DAILY COMMISSIONS";
  return "NET DAILY P&L";
};

const TABS = [
  { key: "overview", label: "Overview", icon: Layers },
  { key: "reports", label: "Reports", icon: FileText, dropdown: true },
  { key: "compare", label: "Compare", icon: BarChart3 },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
];

// Every sub-report groups trades along one dimension and renders the same
// distribution / performance / summary trio.
const REPORT_GROUPS = [
  {
    label: "Date & Time",
    items: [
      { key: "days", label: "Days", blurb: "Trade distribution by day of week" },
      { key: "weeks", label: "Weeks", blurb: "Trade distribution by week" },
      { key: "months", label: "Months", blurb: "Trade distribution by month" },
      { key: "trade-time", label: "Trade time", blurb: "Trade distribution by hour of day" },
      { key: "trade-duration", label: "Trade duration", blurb: "Trade distribution by hold time" },
    ],
  },
  {
    label: "Price & Quantity",
    items: [
      { key: "price", label: "Price", blurb: "Trade distribution by entry price band" },
      { key: "volume", label: "Volume", blurb: "Trade distribution by lot size" },
      { key: "instrument", label: "Instrument", blurb: "Trade distribution by symbol" },
    ],
  },
  {
    label: "Options",
    items: [{ key: "expiry", label: "Days till expiration", blurb: "Options expiry buckets" }],
  },
  {
    label: "Risk",
    items: [
      { key: "r-multiple", label: "R-Multiple", blurb: "Trade distribution by realised R" },
      { key: "position-size", label: "Position Size", blurb: "Trade distribution by position risk" },
    ],
  },
  {
    label: "Wins vs Losses",
    items: [{ key: "outcome", label: "Wins vs Losses", blurb: "Winners against losers" }],
  },
  {
    label: "Tags",
    items: [
      { key: "setups", label: "Setups", blurb: "Trade distribution by setup" },
      { key: "mistakes", label: "Mistakes", blurb: "Trade distribution by tagged mistake" },
      { key: "custom-tags", label: "Custom Tags", blurb: "Trade distribution by custom tag" },
    ],
  },
];

const ALL_REPORTS = REPORT_GROUPS.flatMap((group) =>
  group.items.map((item) => ({ ...item, group: group.label }))
);

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Small formatting helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const axisMoney = (value) => {
  const n = Number(value) || 0;
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const shortDate = (date) => (date ? format(date, "MM/dd/yy") : "");

const rangeText = (start, end) =>
  `${format(start, "MMM dd, yyyy")}-${format(end, "MMM dd, yyyy")}`;

const monthText = (date) => format(date, "MMM yyyy");

/** Calendar chips are narrow, so drop the cents there. */
const compactMoney = (value) => {
  const n = Number(value) || 0;
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  })}`;
};

/** Evenly spaced, human-friendly axis ticks covering min..max. */
function niceScale(min, max, targetTicks = 4) {
  let lo = Number.isFinite(min) ? min : 0;
  let hi = Number.isFinite(max) ? max : 0;
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const rawStep = (hi - lo) / Math.max(1, targetTicks);
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(rawStep) || 1)));
  const normalised = rawStep / magnitude;
  const step =
    (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10) * magnitude;
  const niceMin = Math.floor(lo / step) * step;
  const niceMax = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let value = niceMin; value <= niceMax + step / 2; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }
  return { min: niceMin, max: niceMax, ticks };
}

const dayKeyOf = (date) => format(date, "yyyy-MM-dd");

/** One row per day that has trades, oldest first. */
function dailySeries(trades, metric) {
  const map = new Map();
  trades.filter(isExecuted).forEach((trade) => {
    const date = tradeDate(trade);
    if (!date) return;
    const key = dayKeyOf(date);
    const entry = map.get(key) || { key, date, value: 0, count: 0 };
    entry.value += metricValue(trade, metric);
    entry.count += 1;
    map.set(key, entry);
  });
  return [...map.values()].sort((a, b) => a.date - b.date);
}

/** Running total of the daily series, used for the cumulative chart. */
function cumulativeSeries(days) {
  let running = 0;
  return days.map((day) => {
    running += day.value;
    return { date: day.date, value: Number(running.toFixed(2)) };
  });
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Dropdown menu Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function Menu({ button, children, align = "right", width = "w-60" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="relative" ref={ref}>
      {button({ open, toggle: () => setOpen((value) => !value) })}
      {open && (
        <div
          className={`absolute z-40 mt-1.5 ${align === "right" ? "right-0" : "left-0"} ${width} rounded-lg border ${PANEL_BORDER} ${PANEL_BG} p-1.5 shadow-xl dark:shadow-black/40`}
          role="menu"
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}

function MenuItem({ children, onClick, active = false, icon: Icon, tone = "" }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-medium transition-colors ${FOCUS} ${
        active
          ? "bg-[#f1efff] text-[#4b2fe0] dark:bg-[#6C47FF]/15 dark:text-[#b7a6ff]"
          : `text-[#4b5162] hover:bg-[#f5f6fb] dark:text-[#a4a8c0] dark:hover:bg-white/5 ${tone}`
      }`}
    >
      {Icon ? <Icon size={14} className="shrink-0 opacity-75" /> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {active ? <Check size={13} className="shrink-0" /> : null}
    </button>
  );
}

function MenuLabel({ children }) {
  return (
    <div className={`px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.06em] ${SUBTITLE}`}>
      {children}
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Charts Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

const AXIS_TEXT = "fill-[#9aa1b1] dark:fill-[#7e84a3]";
const GRID_LINE = "text-[#eef0f5] dark:text-[#232338]";

function AreaChart({ points, color = ACCENT, ariaLabel = "Cumulative chart" }) {
  const uid = useId().replace(/[:]/g, "");

  if (!points || points.length < 2) {
    return (
      <div className="flex h-[210px] items-center justify-center px-6 text-center">
        <p className={`text-[12.5px] ${MUTED}`}>Log at least two closed trades to draw this chart.</p>
      </div>
    );
  }

  const W = 760;
  const H = 220;
  const PL = 58;
  const PR = 12;
  const PT = 12;
  const PB = 26;
  const values = points.map((point) => point.value);
  const scale = niceScale(Math.min(0, ...values), Math.max(0, ...values), 4);
  const x = (index) => PL + (index / (points.length - 1)) * (W - PL - PR);
  const y = (value) => PT + (1 - (value - scale.min) / (scale.max - scale.min)) * (H - PT - PB);
  const zeroY = clamp(y(0), PT, H - PB);
  const line = points
    .map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${zeroY.toFixed(1)} L${x(0).toFixed(1)},${zeroY.toFixed(1)} Z`;

  const labelIndexes = [...new Set([
    0,
    Math.round((points.length - 1) / 3),
    Math.round(((points.length - 1) * 2) / 3),
    points.length - 1,
  ])];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={ariaLabel}>
      <defs>
        <linearGradient id={`pos-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={POS} stopOpacity="0.42" />
          <stop offset="100%" stopColor={POS} stopOpacity="0.04" />
        </linearGradient>
        <linearGradient id={`neg-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={NEG} stopOpacity="0.06" />
          <stop offset="100%" stopColor={NEG} stopOpacity="0.38" />
        </linearGradient>
        <clipPath id={`above-${uid}`}>
          <rect x="0" y="0" width={W} height={zeroY} />
        </clipPath>
        <clipPath id={`below-${uid}`}>
          <rect x="0" y={zeroY} width={W} height={H - zeroY} />
        </clipPath>
      </defs>

      {scale.ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={PL}
            x2={W - PR}
            y1={y(tick)}
            y2={y(tick)}
            stroke="currentColor"
            className={GRID_LINE}
            strokeDasharray="3 4"
            strokeWidth="1"
          />
          <text x={PL - 8} y={y(tick) + 3.5} textAnchor="end" className={AXIS_TEXT} style={{ fontSize: 12 }}>
            {axisMoney(tick)}
          </text>
        </g>
      ))}

      <path d={area} fill={`url(#pos-${uid})`} clipPath={`url(#above-${uid})`} />
      <path d={area} fill={`url(#neg-${uid})`} clipPath={`url(#below-${uid})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />

      {labelIndexes.map((index) => (
        <text
          key={index}
          x={x(index)}
          y={H - 6}
          textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
          className={AXIS_TEXT}
          style={{ fontSize: 12 }}
        >
          {shortDate(points[index].date)}
        </text>
      ))}
    </svg>
  );
}

function BarsChart({ points, ariaLabel = "Daily bars chart" }) {
  if (!points || points.length < 1) {
    return (
      <div className="flex h-[210px] items-center justify-center px-6 text-center">
        <p className={`text-[12.5px] ${MUTED}`}>No closed trades in this range yet.</p>
      </div>
    );
  }

  const W = 760;
  const H = 220;
  const PL = 58;
  const PR = 12;
  const PT = 12;
  const PB = 26;
  const values = points.map((point) => point.value);
  const scale = niceScale(Math.min(0, ...values), Math.max(0, ...values), 4);
  const plotWidth = W - PL - PR;
  const slot = plotWidth / points.length;
  const barWidth = Math.max(3, Math.min(22, slot * 0.52));
  const y = (value) => PT + (1 - (value - scale.min) / (scale.max - scale.min)) * (H - PT - PB);
  const zeroY = clamp(y(0), PT, H - PB);

  const labelIndexes = [...new Set([
    0,
    Math.round((points.length - 1) / 3),
    Math.round(((points.length - 1) * 2) / 3),
    points.length - 1,
  ])];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={ariaLabel}>
      {scale.ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={PL}
            x2={W - PR}
            y1={y(tick)}
            y2={y(tick)}
            stroke="currentColor"
            className={GRID_LINE}
            strokeDasharray="3 4"
            strokeWidth="1"
          />
          <text x={PL - 8} y={y(tick) + 3.5} textAnchor="end" className={AXIS_TEXT} style={{ fontSize: 12 }}>
            {axisMoney(tick)}
          </text>
        </g>
      ))}

      {points.map((point, index) => {
        const centre = PL + slot * index + slot / 2;
        const top = Math.min(y(point.value), zeroY);
        const height = Math.max(1.5, Math.abs(y(point.value) - zeroY));
        return (
          <rect
            key={point.key || index}
            x={centre - barWidth / 2}
            y={top}
            width={barWidth}
            height={height}
            rx="1"
            fill={point.value >= 0 ? POS : NEG}
            opacity="0.92"
          >
            <title>{`${shortDate(point.date)}: ${money(point.value)}`}</title>
          </rect>
        );
      })}

      {labelIndexes.map((index) => {
        const centre = PL + slot * index + slot / 2;
        return (
          <text
            key={index}
            x={centre}
            y={H - 6}
            textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
            className={AXIS_TEXT}
            style={{ fontSize: 12 }}
          >
            {shortDate(points[index].date)}
          </text>
        );
      })}
    </svg>
  );
}

function WinDonut({ winRate, wins, losses }) {
  const rate = clamp(Number(winRate) || 0, 0, 100);
  const angle = (rate / 100) * 360;
  return (
    <div className="flex flex-col items-center justify-center gap-6 px-5 py-8 sm:flex-row sm:gap-10">
      <div
        className="relative h-[132px] w-[132px] shrink-0 rounded-full"
        style={{ background: `conic-gradient(${POS} 0deg ${angle}deg, ${NEG} ${angle}deg 360deg)` }}
        role="img"
        aria-label={`${Math.round(rate)} percent win rate`}
      >
        <div className={`absolute inset-[15px] flex flex-col items-center justify-center rounded-full ${PANEL_BG}`}>
          <span className={`text-[26px] font-bold leading-none tabular-nums ${POS_T}`}>{Math.round(rate)}</span>
          <span className={`mt-1 text-[8px] font-semibold uppercase tracking-[0.12em] ${SUBTITLE}`}>winrate</span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-start gap-2.5">
          <span className="mt-1 h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: POS }} />
          <div>
            <div className={`text-[13px] font-semibold tabular-nums text-[#14142b] dark:text-white`}>{wins}</div>
            <div className={`text-[10px] ${SUBTITLE}`}>winners</div>
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <span className="mt-1 h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: NEG }} />
          <div>
            <div className={`text-[13px] font-semibold tabular-nums text-[#14142b] dark:text-white`}>{losses}</div>
            <div className={`text-[10px] ${SUBTITLE}`}>losers</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Report primitives Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function ReportCard({ title, subtitle, right, children, className = "" }) {
  return (
    <section className={`${CARD_BASE} ${className}`}>
      <header className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <h3 className={TITLE}>{title}</h3>
          {subtitle ? <p className={`mt-1 ${SUBTITLE}`}>{subtitle}</p> : null}
        </div>
        {right ? <div className="flex shrink-0 items-center gap-1.5">{right}</div> : null}
      </header>
      {children}
    </section>
  );
}

function StatRow({ label, value, tone = "", tint = "" }) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 border-b ${ROW_LINE} px-4 py-[5px] last:border-0 ${tint}`}
    >
      <span className={ROW_LABEL}>{label}</span>
      <span className={`${ROW_VALUE} ${tone}`}>{value}</span>
    </div>
  );
}

function DistributionRow({ label, value, max }) {
  const width = max > 0 ? clamp((value / max) * 100, 0, 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className={`w-28 shrink-0 truncate text-right text-[11.5px] ${MUTED}`}>{label}</span>
      <div className="h-[22px] flex-1">
        <div
          className="h-full"
          style={{
            width: `${width}%`,
            minWidth: value > 0 ? 2 : 0,
            backgroundColor: POS,
            opacity: 0.92,
            borderRadius: "1px 3px 3px 1px",
          }}
        />
      </div>
    </div>
  );
}

function PerformanceRow({ label, value, min, max }) {
  const span = max - min || 1;
  const zero = ((0 - min) / span) * 100;
  const start = value >= 0 ? zero : zero + (value / span) * 100;
  const width = (Math.abs(value) / span) * 100;
  return (
    <div className="flex items-center gap-3">
      <span className={`w-28 shrink-0 truncate text-right text-[11.5px] ${MUTED}`}>{label}</span>
      <div className="relative h-[22px] flex-1">
        <span
          className="absolute inset-y-0 border-l border-dashed border-[#cfd3e1] dark:border-[#3c3c55]"
          style={{ left: `${clamp(zero, 0, 100)}%` }}
        />
        <span
          className="absolute top-0 h-full"
          style={{
            left: `${clamp(start, 0, 100)}%`,
            width: `${clamp(width, value === 0 ? 0 : 0.6, 100)}%`,
            backgroundColor: value >= 0 ? POS : NEG,
            opacity: 0.92,
          }}
          title={money(value)}
        />
      </div>
    </div>
  );
}

function AxisBelow({ min, max, ticks }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="w-28 shrink-0" />
      <div className="relative h-4 flex-1">
        {ticks.map((tick) => (
          <span
            key={tick}
            className={`absolute top-0 -translate-x-1/2 text-[10px] tabular-nums ${SUBTITLE}`}
            style={{ left: `${((tick - min) / (max - min || 1)) * 100}%` }}
          >
            {axisMoney(tick)}
          </span>
        ))}
      </div>
    </div>
  );
}

function WinBar({ wins, losses, count }) {
  const total = count || wins + losses || 1;
  return (
    <div className="flex h-[7px] w-[112px] overflow-hidden rounded-sm bg-[#eef0f5] dark:bg-[#26263a]">
      <span style={{ width: `${(losses / total) * 100}%`, backgroundColor: NEG }} />
      <span style={{ width: `${(wins / total) * 100}%`, backgroundColor: POS }} />
    </div>
  );
}

function EmptyReport({ title, hint, icon: Icon = BarChart3 }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <Icon size={26} className={`mb-3 opacity-40 ${MUTED}`} />
      <p className={`text-[13px] font-semibold ${HEAD}`}>{title}</p>
      {hint ? <p className={`mt-1 max-w-sm text-[11.5px] ${MUTED}`}>{hint}</p> : null}
    </div>
  );
}

function InfoDot({ text }) {
  return (
    <span title={text} className="inline-flex cursor-help items-center">
      <Info size={12} className="text-[#7c6cf0]" />
    </span>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Page Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

const BAND_KEY = "forgexBreakevenBand";

const readBand = () => {
  try {
    const saved = Number(localStorage.getItem(BAND_KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : 0;
  } catch {
    return 0;
  }
};

const emptyGroup = () => ({
  symbol: "",
  tags: [],
  side: "any",
  pnl: "any",
  start: "",
  end: "",
});

const TINT_POS = "bg-[#f2fbf7] dark:bg-[#22c493]/[0.07]";
const TINT_NEG = "bg-[#fdf2f4] dark:bg-[#f2556e]/[0.07]";

/** Long-form duration so a row reads "11 days, 2 hours, 26 minutes". */
function longDuration(minutes) {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return "N/A";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = Math.round(minutes % 60);
  const parts = [];
  if (days) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (mins || !parts.length) parts.push(`${mins} minute${mins === 1 ? "" : "s"}`);
  return parts.join(", ");
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Report dimensions Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Every sub-report answers the same question: bucket these trades along one
// dimension, then show how many landed in each bucket and what each was worth.

const DAY_FULL = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

const HOUR_LABELS = ["00 - 03", "03 - 06", "06 - 09", "09 - 12", "12 - 15", "15 - 18", "18 - 21", "21 - 24"];

const DURATION_LABELS = {
  under30m: "< 30 min",
  "30m-1h": "30 min - 1 h",
  "1h-4h": "1 - 4 h",
  "4h-24h": "4 - 24 h",
  over24h: "> 24 h",
};

const PRICE_BANDS = [
  { label: "< $1", min: -Infinity, max: 1 },
  { label: "$1 - $10", min: 1, max: 10 },
  { label: "$10 - $100", min: 10, max: 100 },
  { label: "$100 - $1k", min: 100, max: 1000 },
  { label: "$1k - $10k", min: 1000, max: 10000 },
  { label: "> $10k", min: 10000, max: Infinity },
];

const LOT_BANDS = [
  { label: "< 0.25 lots", min: -Infinity, max: 0.25 },
  { label: "0.25 - 0.5 lots", min: 0.25, max: 0.5 },
  { label: "0.5 - 1 lot", min: 0.5, max: 1 },
  { label: "1 - 2 lots", min: 1, max: 2 },
  { label: "2 - 5 lots", min: 2, max: 5 },
  { label: "> 5 lots", min: 5, max: Infinity },
];

const SIZE_BANDS = [
  { label: "< $50k", min: -Infinity, max: 50000 },
  { label: "$50k - $250k", min: 50000, max: 250000 },
  { label: "$250k - $1m", min: 250000, max: 1000000 },
  { label: "$1m - $5m", min: 1000000, max: 5000000 },
  { label: "> $5m", min: 5000000, max: Infinity },
];

const R_BANDS = [
  { label: "< -3R", min: -Infinity, max: -3 },
  { label: "-3R to -2R", min: -3, max: -2 },
  { label: "-2R to -1R", min: -2, max: -1 },
  { label: "-1R to 0R", min: -1, max: 0 },
  { label: "0R to 1R", min: 0, max: 1 },
  { label: "1R to 2R", min: 1, max: 2 },
  { label: "2R to 3R", min: 2, max: 3 },
  { label: "> 3R", min: 3, max: Infinity },
];

const EXPIRY_BANDS = [
  { label: "Expired", min: -Infinity, max: 0 },
  { label: "1 - 3 days", min: 0, max: 3 },
  { label: "4 - 7 days", min: 3, max: 7 },
  { label: "8 - 30 days", min: 7, max: 30 },
  { label: "> 30 days", min: 30, max: Infinity },
];

/** Card headings: tag reports read as CUSTOM_TAGS, the rest keep their words. */
const reportHeading = (label) =>
  label === "Custom Tags" ? "CUSTOM_TAGS" : label.toUpperCase();

const SUMMARY_HEAD = {
  days: "Day",
  weeks: "Week",
  months: "Month",
  "trade-time": "Trade time",
  "trade-duration": "Duration",
  price: "Price",
  volume: "Volume",
  instrument: "Instrument",
  expiry: "Days till expiration",
  "r-multiple": "R-Multiple",
  "position-size": "Position size",
  outcome: "Outcome",
  setups: "Setup",
  mistakes: "Mistake",
  "custom-tags": "Custom tag",
};

const dayKeyFromDate = (date) => format(date, "yyyy-MM-dd");

const expiryOf = (trade) => {
  const raw = trade.expiryDate || trade.expiration || trade.expiry;
  if (!raw) return null;
  const date = typeof raw?.toDate === "function" ? raw.toDate() : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

const tradeTagList = (trade) =>
  [
    ...(trade.confluences || []),
    ...(trade.tags || []),
    trade.strategy,
    trade.playbook,
    ...(trade.mistakes || []),
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

/** Does a trade satisfy one compare group's filters? */
function matchGroup(trade, group) {
  if (!isExecuted(trade)) return false;

  if (group.symbol) {
    const needle = group.symbol.trim().toUpperCase();
    if (needle && !String(trade.pair || "").toUpperCase().includes(needle)) return false;
  }

  if (group.tags && group.tags.length) {
    const list = tradeTagList(trade);
    const all = group.tags.every((tag) => list.includes(String(tag).trim().toLowerCase()));
    if (!all) return false;
  }

  if (group.side && group.side !== "any") {
    const direction = String(trade.direction || "").toLowerCase();
    if (group.side === "long" && direction !== "long") return false;
    if (group.side === "short" && direction !== "short") return false;
  }

  const pnl = pnlOf(trade);
  if (group.pnl === "wins" && pnl <= 0) return false;
  if (group.pnl === "losses" && pnl >= 0) return false;

  const date = tradeDate(trade);
  if (group.start) {
    if (!date || date < new Date(`${group.start}T00:00:00`)) return false;
  }
  if (group.end) {
    if (!date || date > new Date(`${group.end}T23:59:59`)) return false;
  }

  return true;
}

/** Longest run of winning / losing trades in a list. */
function tradeStreaks(trades) {
  let win = 0;
  let loss = 0;
  let current = 0;
  let kind = null;

  chronological(trades).forEach((trade) => {
    const value = pnlOf(trade);
    const next = value > 0 ? "win" : value < 0 ? "loss" : null;
    if (!next) {
      current = 0;
      kind = null;
      return;
    }
    current = next === kind ? current + 1 : 1;
    kind = next;
    if (next === "win") win = Math.max(win, current);
    else loss = Math.max(loss, current);
  });

  return { win, loss };
}

function bucketTrades(key, trades, options = {}) {
  const executed = trades.filter(isExecuted);

  const rowsFrom = (entries) =>
    entries.map(({ label, list }) => {
      const volume = list.reduce((sum, trade) => sum + (Number(trade.lotSize) || 0), 0);
      return { label, trades: list, volume, ...tradeStats(list, options) };
    });

  const groupBy = (labelOf) => {
    const map = new Map();
    executed.forEach((trade) => {
      const label = labelOf(trade);
      if (!label) return;
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(trade);
    });
    return map;
  };

  const groupByMany = (labelsOf) => {
    const map = new Map();
    executed.forEach((trade) => {
      (labelsOf(trade) || []).forEach((raw) => {
        const label = String(raw || "").trim();
        if (!label) return;
        if (!map.has(label)) map.set(label, []);
        map.get(label).push(trade);
      });
    });
    return map;
  };

  const fixed = (labels, labelOf) => {
    const map = groupBy(labelOf);
    return rowsFrom(
      labels.filter((label) => map.has(label)).map((label) => ({ label, list: map.get(label) }))
    );
  };

  const banded = (bands, valueOf) => {
    const entries = bands.map((band) => ({ label: band.label, list: [] }));
    executed.forEach((trade) => {
      const value = valueOf(trade);
      if (!Number.isFinite(value)) return;
      const index = bands.findIndex((band) => value > band.min && value <= band.max);
      if (index >= 0) entries[index].list.push(trade);
    });
    return rowsFrom(entries.filter((entry) => entry.list.length > 0));
  };

  const byCount = (map) =>
    rowsFrom(
      [...map.entries()]
        .map(([label, list]) => ({ label, list }))
        .sort((a, b) => b.list.length - a.list.length)
    );

  switch (key) {
    case "days":
      return fixed(DAYS.map((day) => DAY_FULL[day]), (trade) => DAY_FULL[dayOfWeek(tradeDate(trade))]);

    case "weeks": {
      const map = new Map();
      executed.forEach((trade) => {
        const date = tradeDate(trade);
        if (!date) return;
        const start = startOfWeek(date, { weekStartsOn: 1 });
        const bucketKey = dayKeyFromDate(start);
        if (!map.has(bucketKey)) map.set(bucketKey, { start, list: [] });
        map.get(bucketKey).list.push(trade);
      });
      return rowsFrom(
        [...map.values()]
          .sort((a, b) => a.start - b.start)
          .map((entry) => ({ label: format(entry.start, "MMM dd"), list: entry.list }))
      );
    }

    case "months": {
      const map = new Map();
      executed.forEach((trade) => {
        const date = tradeDate(trade);
        if (!date) return;
        const bucketKey = format(date, "yyyy-MM");
        if (!map.has(bucketKey)) map.set(bucketKey, { date: startOfMonth(date), list: [] });
        map.get(bucketKey).list.push(trade);
      });
      return rowsFrom(
        [...map.values()]
          .sort((a, b) => a.date - b.date)
          .map((entry) => ({ label: format(entry.date, "MMM yyyy"), list: entry.list }))
      );
    }

    case "trade-time":
      return fixed(HOUR_LABELS, (trade) => {
        const date = tradeDate(trade);
        const index = date ? HOUR_BUCKETS.indexOf(hourBucket(date)) : -1;
        return index >= 0 ? HOUR_LABELS[index] : null;
      });

    case "trade-duration":
      return fixed(
        HOLD_BUCKETS.map((bucket) => DURATION_LABELS[bucket.key]),
        (trade) => {
          const minutes = holdMinutes(trade);
          if (minutes === null) return null;
          const bucket = HOLD_BUCKETS.find((item) => minutes > item.min && minutes <= item.max);
          return bucket ? DURATION_LABELS[bucket.key] : null;
        }
      );

    case "price":
      return banded(PRICE_BANDS, (trade) => Number(trade.entry));

    case "volume":
      return banded(LOT_BANDS, (trade) => Number(trade.lotSize));

    case "instrument":
      return byCount(groupBy((trade) => trade.pair || null));

    case "expiry":
      return banded(EXPIRY_BANDS, (trade) => {
        const expiry = expiryOf(trade);
        const date = tradeDate(trade);
        if (!expiry || !date) return NaN;
        return Math.round((expiry.getTime() - date.getTime()) / 86400000);
      });

    case "r-multiple":
      return banded(R_BANDS, (trade) => {
        const realised = realisedR(trade);
        if (Number.isFinite(realised)) return realised;
        const planned = Number(trade.rr);
        return Number.isFinite(planned) && planned !== 0 ? planned : NaN;
      });

    case "position-size":
      return banded(SIZE_BANDS, (trade) => {
        const lots = Number(trade.lotSize);
        const price = Number(trade.entry);
        if (!Number.isFinite(lots) || !Number.isFinite(price)) return NaN;
        return lots * 100000 * price;
      });

    case "outcome":
      return fixed(["Winners", "Losers", "Breakeven"], (trade) => {
        const value = pnlOf(trade);
        return value > 0 ? "Winners" : value < 0 ? "Losers" : "Breakeven";
      });

    case "setups":
      return byCount(groupBy((trade) => trade.strategy || trade.playbook || null));

    case "mistakes":
      return byCount(groupByMany((trade) => trade.mistakes || []));

    case "custom-tags":
      return byCount(groupByMany((trade) => [...(trade.confluences || []), ...(trade.tags || [])]));

    default:
      return [];
  }
}

/** Rows shown in the comparison statistics cards. */
function compareStatRows(result) {
  return [
    { label: "Total P&L", value: money(result.stats.net, false), tone: result.stats.net >= 0 ? POS_T : NEG_T },
    { label: "Average daily volume", value: result.avgVolume.toFixed(2) },
    {
      label: "Average winning trade",
      value: result.stats.wins ? money(result.stats.avgWin, false) : "N/A",
      tone: result.stats.wins ? POS_T : "",
    },
    {
      label: "Average losing trade",
      value: result.stats.losses ? money(-result.stats.avgLoss, false) : "N/A",
      tone: result.stats.losses ? NEG_T : "",
    },
    { label: "Number of winning trades", value: result.stats.wins },
    { label: "Number of losing trades", value: result.stats.losses },
    {
      label: "Total commissions",
      value: money(result.commission, false),
    },
    { label: "Max consecutive wins", value: result.streaks.win },
    { label: "Max consecutive losses", value: result.streaks.loss },
  ];
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Small form + axis pieces Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function FieldRow({ label, children }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`w-[74px] shrink-0 text-[11.5px] ${ROW_LABEL}`}>{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function TagListInput({ value, onChange, placeholder = "Add tag" }) {
  const [draft, setDraft] = useState("");

  const commit = (raw) => {
    const next = raw.trim();
    if (!next) return;
    if (!value.some((tag) => tag.toLowerCase() === next.toLowerCase())) onChange([...value, next]);
    setDraft("");
  };

  return (
    <div
      className={`flex min-h-8 w-full flex-wrap items-center gap-1 rounded-[5px] border ${PANEL_BORDER} bg-white px-1.5 py-1 dark:bg-[#0b0b16]`}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex max-w-full items-center gap-1 rounded bg-[#f1efff] px-1.5 py-0.5 text-[10.5px] font-semibold text-[#4b2fe0] dark:bg-[#6C47FF]/20 dark:text-[#b7a6ff]"
        >
          <span className="truncate">{tag}</span>
          <button
            type="button"
            onClick={() => onChange(value.filter((item) => item !== tag))}
            aria-label={`Remove tag ${tag}`}
            className="shrink-0 opacity-70 hover:opacity-100"
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            commit(draft);
          }
          if (event.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => commit(draft)}
        placeholder={value.length ? "" : placeholder}
        aria-label="Add tag"
        className="min-w-[54px] flex-1 bg-transparent px-0.5 py-0.5 text-[11.5px] text-[#14142b] outline-none placeholder:text-[#9aa1b1] dark:text-white"
      />
    </div>
  );
}

function CountAxis({ max }) {
  const top = Math.max(1, max);
  const step = top <= 4 ? 1 : Math.max(1, Math.ceil(top / 4));
  const ticks = [];
  for (let value = 0; value <= top; value += step) ticks.push(value);
  if (ticks[ticks.length - 1] !== top) ticks.push(top);

  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0" />
      <div className="relative h-4 flex-1">
        {ticks.map((tick) => (
          <span
            key={tick}
            className={`absolute top-0 -translate-x-1/2 text-[10px] tabular-nums ${SUBTITLE}`}
            style={{ left: `${max > 0 ? (tick / max) * 100 : 0}%` }}
          >
            {tick}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Reports({ currentAccount }) {
  const navigate = useNavigate();

  const [PREVIEW] = useState(
    () =>
      typeof window !== "undefined" &&
      process.env.NODE_ENV !== "production" &&
      new URLSearchParams(window.location.search).get("preview") === "1"
  );

  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("this-month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [tab, setTab] = useState("overview");
  const [reportKey, setReportKey] = useState("custom-tags");
  const [metric, setMetric] = useState("net");
  const [beBand, setBeBand] = useState(readBand);
  const [groups, setGroups] = useState([emptyGroup(), emptyGroup()]);
  const [comparison, setComparison] = useState(null);
  const [calMonth, setCalMonth] = useState(() => new Date());
  const [toast, setToast] = useState("");

  const accountId = currentAccount?.id;

  useEffect(() => {
    try {
      localStorage.setItem(BAND_KEY, String(beBand));
    } catch {
      // Storage can be blocked; the band simply resets next visit.
    }
  }, [beBand]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const statOptions = useMemo(() => ({ breakevenBand: beBand }), [beBand]);

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Load trades Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (PREVIEW) {
        if (!cancelled) {
          setTrades(demoDashboardTrades());
          setLoading(false);
        }
        return;
      }

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
          setTrades(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
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
  }, [accountId, PREVIEW]);

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Range + filtered trades Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const range = useMemo(() => {
    const now = new Date();
    if (period === "last-30") {
      const start = subMonths(now, 1);
      return { start, end: now, label: rangeText(start, now) };
    }
    if (period === "this-year") {
      const start = new Date(now.getFullYear(), 0, 1);
      return { start, end: now, label: rangeText(start, now) };
    }
    if (period === "all") {
      const dates = trades.map(tradeDate).filter(Boolean).sort((a, b) => a - b);
      const start = dates[0] || startOfMonth(now);
      return {
        start,
        end: now,
        label: dates.length ? rangeText(start, now) : "All time",
      };
    }
    if (period === "custom" && customStart && customEnd) {
      const start = new Date(`${customStart}T00:00:00`);
      const end = new Date(`${customEnd}T23:59:59`);
      return { start, end, label: rangeText(start, end) };
    }
    const start = startOfMonth(now);
    const end = endOfMonth(now);
    return { start, end, label: rangeText(start, end) };
  }, [period, customStart, customEnd, trades]);

  const filteredTrades = useMemo(
    () =>
      trades.filter((trade) => {
        const date = tradeDate(trade);
        return !!date && date >= range.start && date <= range.end;
      }),
    [trades, range]
  );

  const executed = useMemo(() => filteredTrades.filter(isExecuted), [filteredTrades]);
  const stats = useMemo(() => tradeStats(filteredTrades, statOptions), [filteredTrades, statOptions]);

  // Daily buckets drive the day stats, both charts and the calendar.
  const days = useMemo(() => dailySeries(executed, "net"), [executed]);
  const metricDays = useMemo(() => dailySeries(executed, metric), [executed, metric]);
  const cumulative = useMemo(() => cumulativeSeries(metricDays), [metricDays]);

  const dayStatsBlock = useMemo(() => {
    const winDays = days.filter((day) => day.value > 0);
    const lossDays = days.filter((day) => day.value < 0);
    const flatDays = days.filter((day) => day.value === 0);
    const sum = (list) => list.reduce((total, day) => total + day.value, 0);
    let winRun = 0;
    let lossRun = 0;
    let current = 0;
    let kind = null;
    days.forEach((day) => {
      const next = day.value > 0 ? "win" : day.value < 0 ? "loss" : null;
      if (!next) {
        current = 0;
        kind = null;
        return;
      }
      current = next === kind ? current + 1 : 1;
      kind = next;
      if (next === "win") winRun = Math.max(winRun, current);
      else lossRun = Math.max(lossRun, current);
    });
    return {
      tradingDays: days.length,
      winDays: winDays.length,
      lossDays: lossDays.length,
      flatDays: flatDays.length,
      net: sum(days),
      best: days.length ? Math.max(...days.map((day) => day.value)) : 0,
      worst: days.length ? Math.min(...days.map((day) => day.value)) : 0,
      avgWin: winDays.length ? sum(winDays) / winDays.length : 0,
      avgLoss: lossDays.length ? sum(lossDays) / lossDays.length : 0,
      winRun,
      lossRun,
    };
  }, [days]);

  const tradeRuns = useMemo(() => {
    let win = 0;
    let loss = 0;
    let current = 0;
    let kind = null;
    chronological(executed).forEach((trade) => {
      const value = pnlOf(trade);
      const next = value > 0 ? "win" : value < 0 ? "loss" : null;
      if (!next) {
        current = 0;
        kind = null;
        return;
      }
      current = next === kind ? current + 1 : 1;
      kind = next;
      if (next === "win") win = Math.max(win, current);
      else loss = Math.max(loss, current);
    });
    return { win, loss };
  }, [executed]);

  const risk = useMemo(() => {
    let running = 0;
    let peak = 0;
    let max = 0;
    let maxPct = 0;
    let sum = 0;
    let count = 0;
    let peakAtMax = 0;
    chronological(executed).forEach((trade) => {
      running += pnlOf(trade);
      peak = Math.max(peak, running);
      const diff = peak - running;
      if (diff > 0.0001) {
        sum += diff;
        count += 1;
      }
      if (diff > max) {
        max = diff;
        peakAtMax = peak;
        maxPct = peak > 0 ? (diff / peak) * 100 : 0;
      }
    });
    const average = count ? sum / count : 0;
    return {
      max,
      maxPct,
      average,
      averagePct: peakAtMax > 0 ? (average / peakAtMax) * 100 : 0,
    };
  }, [executed]);

  const costs = useMemo(() => {
    const commission = executed.reduce((total, trade) => total + (Number(trade.commission) || 0), 0);
    const swap = executed.reduce((total, trade) => total + (Number(trade.swap) || 0), 0);
    const fees = executed.reduce((total, trade) => total + (Number(trade.fees) || 0), 0);
    const volume = executed.reduce((total, trade) => total + (Number(trade.lotSize) || 0), 0);
    return { commission, swap, fees, volume };
  }, [executed]);

  const holds = useMemo(() => {
    const durationsFor = (list) => list.map(holdMinutes).filter((value) => value !== null);
    const winners = executed.filter((trade) => pnlOf(trade) > 0);
    const losers = executed.filter((trade) => pnlOf(trade) < 0);
    const scratches = executed.filter((trade) => pnlOf(trade) === 0);
    const all = durationsFor(executed);
    return {
      all: all.length ? avg(all) : null,
      wins: durationsFor(winners).length ? avg(durationsFor(winners)) : null,
      losses: durationsFor(losers).length ? avg(durationsFor(losers)) : null,
      scratches: durationsFor(scratches).length ? avg(durationsFor(scratches)) : null,
    };
  }, [executed]);

  const rMultiples = useMemo(() => {
    const realised = executed.map(realisedR).filter((value) => Number.isFinite(value));
    const planned = executed
      .map((trade) => Number(trade.rr))
      .filter((value) => Number.isFinite(value) && value > 0);
    return {
      planned: planned.length ? avg(planned) : null,
      realised: realised.length ? avg(realised) : null,
    };
  }, [executed]);

  // Best / lowest / average month read across the whole trade history, not just
  // the selected range, so a single-month range does not repeat one value three
  // times.
  const monthly = useMemo(() => {
    const map = new Map();
    trades.filter(isExecuted).forEach((trade) => {
      const date = tradeDate(trade);
      if (!date) return;
      const key = format(date, "yyyy-MM");
      const entry = map.get(key) || { key, date: startOfMonth(date), value: 0 };
      entry.value += pnlOf(trade);
      map.set(key, entry);
    });
    return [...map.values()].sort((a, b) => a.date - b.date);
  }, [trades]);

  const bestMonth = monthly.length ? monthly.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  const worstMonth = monthly.length ? monthly.reduce((a, b) => (b.value < a.value ? b : a)) : null;
  const averageMonth = monthly.length
    ? monthly.reduce((total, month) => total + month.value, 0) / monthly.length
    : 0;

  const logicalDays = useMemo(
    () =>
      new Set(
        executed
          .filter((trade) => (trade.notes || trade.strategy || "").trim().length > 0)
          .map((trade) => {
            const date = tradeDate(trade);
            return date ? dayKeyOf(date) : null;
          })
          .filter(Boolean)
      ).size,
    [executed]
  );

  const flash = (message) => setToast(message);

  const copySummary = async () => {
    const lines = [
      `Reports ${range.label}`,
      `Net P&L: ${money(stats.net)}`,
      `Trades: ${stats.count}`,
      `Win rate: ${pct(stats.winRate)}`,
      `Profit factor: ${ratio(stats.profitFactor)}`,
      `Expectancy: ${money(stats.expectancy)}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(lines);
      flash("Summary copied to clipboard");
    } catch {
      flash("Clipboard is blocked in this browser");
    }
  };

  const exportReport = () => {
    if (!executed.length) {
      flash("Nothing to export in this range");
      return;
    }

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
      "Lots",
      "Playbook",
      "Strategy",
      "Tags",
      "Rating",
      "Mistakes",
      "Notes",
    ];
    const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

    const rows = executed.map((trade) => {
      const date = tradeDate(trade);
      const realised = realisedR(trade);
      return [
        date ? format(date, "yyyy-MM-dd HH:mm") : "",
        trade.pair || "",
        trade.direction || "",
        trade.entry ?? "",
        trade.exit ?? "",
        trade.stopLoss ?? "",
        trade.takeProfit ?? "",
        trade.pnl ?? 0,
        trade.rr ?? "",
        realised === null ? "" : realised.toFixed(2),
        trade.commission ?? "",
        trade.swap ?? "",
        trade.lotSize ?? "",
        escape(trade.playbook || ""),
        escape(trade.strategy || ""),
        escape((trade.confluences || []).join(" | ")),
        trade.rating || "",
        escape((trade.mistakes || []).join(" | ")),
        escape(trade.notes || ""),
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
    flash(`Exported ${executed.length} trades`);
  };

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Overview rows Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const metricLabel = (METRICS.find(([key]) => key === metric) || METRICS[0])[1];
  const metricTotal = useMemo(
    () => executed.reduce((total, trade) => total + metricValue(trade, metric), 0),
    [executed, metric]
  );

  const leftRows = [
    {
      label: metric === "net" ? "Total P&L" : `Total ${metricLabel.toLowerCase()}`,
      value: money(metricTotal),
      tone: metricTotal >= 0 ? POS_T : NEG_T,
    },
    {
      label: "Average daily volume",
      value: dayStatsBlock.tradingDays ? (costs.volume / dayStatsBlock.tradingDays).toFixed(2) : "0.00",
    },
    { label: "Average winning trade", value: money(stats.avgWin), tone: POS_T, tint: TINT_POS },
    { label: "Average losing trade", value: money(-stats.avgLoss), tone: NEG_T, tint: TINT_NEG },
    { label: "Total number of trades", value: stats.count },
    { label: "Number of winning trades", value: stats.wins, tint: TINT_POS },
    { label: "Number of losing trades", value: stats.losses, tint: TINT_NEG },
    { label: "Number of break even trades", value: stats.breakeven },
    { label: "Max consecutive wins", value: tradeRuns.win, tint: TINT_POS },
    { label: "Max consecutive losses", value: tradeRuns.loss, tint: TINT_NEG },
    { label: "Total commissions", value: money(costs.commission) },
    { label: "Total fees", value: money(costs.fees) },
    { label: "Total swap", value: money(costs.swap), tone: costs.swap < 0 ? NEG_T : "" },
    { label: "Largest profit", value: money(stats.best), tone: POS_T, tint: TINT_POS },
    { label: "Largest loss", value: money(stats.worst), tone: NEG_T, tint: TINT_NEG },
    { label: "Average hold time (All trades)", value: longDuration(holds.all) },
    { label: "Average hold time (Winning trades)", value: longDuration(holds.wins) },
    { label: "Average hold time (Losing trades)", value: longDuration(holds.losses) },
    { label: "Average hold time (Scratch trades)", value: longDuration(holds.scratches) },
    { label: "Average trade P&L", value: money(stats.avgPnl), tone: stats.avgPnl >= 0 ? POS_T : NEG_T },
    { label: "Profit factor", value: ratio(stats.profitFactor) },
  ];

  const rightRows = [
    { label: "Open trades", value: stats.pending },
    { label: "Total trading days", value: dayStatsBlock.tradingDays },
    { label: "Winning days", value: dayStatsBlock.winDays, tint: TINT_POS },
    { label: "Losing days", value: dayStatsBlock.lossDays, tint: TINT_NEG },
    { label: "Breakeven days", value: dayStatsBlock.flatDays },
    { label: "Logged days", value: logicalDays },
    { label: "Max consecutive winning days", value: dayStatsBlock.winRun, tint: TINT_POS },
    { label: "Max consecutive losing days", value: dayStatsBlock.lossRun, tint: TINT_NEG },
    {
      label: "Average daily P&L",
      value: dayStatsBlock.tradingDays ? money(stats.net / dayStatsBlock.tradingDays) : "Ã¢â‚¬â€",
      tone: stats.net >= 0 ? POS_T : NEG_T,
    },
    {
      label: "Average winning day P&L",
      value: dayStatsBlock.winDays ? money(dayStatsBlock.avgWin) : "N/A",
      tone: POS_T,
      tint: TINT_POS,
    },
    {
      label: "Average losing day P&L",
      value: dayStatsBlock.lossDays ? money(dayStatsBlock.avgLoss) : "N/A",
      tone: NEG_T,
      tint: TINT_NEG,
    },
    { label: "Largest profitable day (Profits)", value: money(dayStatsBlock.best), tone: POS_T },
    { label: "Largest losing day (Losses)", value: money(dayStatsBlock.worst), tone: NEG_T },
    {
      label: "Average planned R-Multiple",
      value: rMultiples.planned === null ? "N/A" : `${rMultiples.planned.toFixed(2)}R`,
    },
    {
      label: "Average realized R-Multiple",
      value: rMultiples.realised === null ? "N/A" : `${rMultiples.realised.toFixed(2)}R`,
    },
    { label: "Trade expectancy", value: money(stats.expectancy), tone: stats.expectancy >= 0 ? POS_T : NEG_T },
    { label: "Max drawdown", value: money(-risk.max), tone: NEG_T },
    { label: "Max drawdown, %", value: pct(-risk.maxPct), tone: NEG_T },
    { label: "Average drawdown", value: money(-risk.average), tone: NEG_T },
    { label: "Average drawdown, %", value: pct(-risk.averagePct), tone: NEG_T },
  ];

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Reports tab Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const reportMeta = ALL_REPORTS.find((item) => item.key === reportKey) || ALL_REPORTS[0];

  const report = useMemo(() => {
    const rows = bucketTrades(reportKey, filteredTrades, statOptions);
    const capped =
      rows.length > 14
        ? reportKey === "weeks" || reportKey === "months"
          ? rows.slice(-14)
          : rows.slice(0, 14)
        : rows;
    const maxCount = capped.reduce((max, row) => Math.max(max, row.count), 0);
    const nets = capped.map((row) => row.net);
    const scale = niceScale(Math.min(0, ...nets), Math.max(0, ...nets), 4);
    return { rows: capped, total: rows.length, maxCount: Math.max(1, maxCount), scale };
  }, [reportKey, filteredTrades, statOptions]);

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Compare tab Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const groupCounts = useMemo(
    () => groups.map((group) => filteredTrades.filter((trade) => matchGroup(trade, group)).length),
    [groups, filteredTrades]
  );

  const compareResults = useMemo(() => {
    if (!comparison) return null;
    return comparison.map((group) => {
      const list = filteredTrades.filter((trade) => matchGroup(trade, group));
      const dayRows = dailySeries(list, "net");
      const dayKeys = new Set(
        list
          .map((trade) => {
            const date = tradeDate(trade);
            return date ? dayKeyFromDate(date) : null;
          })
          .filter(Boolean)
      );
      const volume = list.reduce((sum, trade) => sum + (Number(trade.lotSize) || 0), 0);
      const commission = list.reduce((sum, trade) => sum + (Number(trade.commission) || 0), 0);
      return {
        group,
        stats: tradeStats(list, statOptions),
        series: cumulativeSeries(dayRows),
        avgVolume: dayKeys.size ? volume / dayKeys.size : 0,
        commission,
        streaks: tradeStreaks(list),
      };
    });
  }, [comparison, filteredTrades, statOptions]);

  const updateGroup = (index, patch) =>
    setGroups((list) =>
      list.map((group, position) => (position === index ? { ...group, ...patch } : group))
    );

  const generateComparison = () => {
    setComparison(groups.map((group) => ({ ...group, tags: [...group.tags] })));
    flash("Comparison generated");
  };

  const resetComparison = () => {
    setGroups([emptyGroup(), emptyGroup()]);
    setComparison(null);
    flash("Comparison reset");
  };

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Calendar tab Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const calendarMap = useMemo(() => {
    const map = new Map();
    trades.filter(isExecuted).forEach((trade) => {
      const date = tradeDate(trade);
      if (!date) return;
      const key = dayKeyFromDate(date);
      const entry = map.get(key) || { value: 0, count: 0 };
      entry.value += pnlOf(trade);
      entry.count += 1;
      map.set(key, entry);
    });
    return map;
  }, [trades]);

  const calendar = useMemo(() => {
    const start = startOfWeek(startOfMonth(calMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(calMonth), { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start, end }).map((date) => {
      const entry = calendarMap.get(dayKeyFromDate(date));
      return {
        date,
        key: dayKeyFromDate(date),
        inMonth: isSameMonth(date, calMonth),
        value: entry ? entry.value : null,
        count: entry ? entry.count : 0,
      };
    });
    const weeks = [];
    for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));

    const monthDays = days.filter((day) => day.inMonth && day.count > 0);
    const totals = {
      net: monthDays.reduce((sum, day) => sum + day.value, 0),
      tradingDays: monthDays.length,
      winDays: monthDays.filter((day) => day.value > 0).length,
      lossDays: monthDays.filter((day) => day.value < 0).length,
      trades: monthDays.reduce((sum, day) => sum + day.count, 0),
    };
    return { weeks, totals };
  }, [calMonth, calendarMap]);

  const rangeSubtitle = `(FROM ${range.label.toUpperCase()})`;

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Filters menu (shared by the Filter button and date pill) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const filtersContent = (close) => (
    <>
      <MenuLabel>Time period</MenuLabel>
      {[
        ["this-month", "This month"],
        ["last-30", "Last 30 days"],
        ["this-year", "This year"],
        ["all", "All time"],
      ].map(([key, label]) => (
        <MenuItem
          key={key}
          active={period === key}
          onClick={() => {
            setPeriod(key);
            close();
          }}
        >
          {label}
        </MenuItem>
      ))}

      <div className="my-1.5 border-t border-[#f0f1f6] dark:border-[#252538]" />
      <MenuLabel>Custom range</MenuLabel>
      <div className="space-y-1.5 px-2 pb-1">
        <input
          type="date"
          value={customStart}
          onChange={(event) => {
            setCustomStart(event.target.value);
            if (event.target.value) setPeriod("custom");
          }}
          aria-label="Custom start date"
          className={`h-8 w-full rounded-md border ${PANEL_BORDER} bg-white px-2 text-[11.5px] outline-none focus:ring-2 focus:ring-[#6C47FF] dark:bg-[#0b0b16] dark:text-white`}
        />
        <input
          type="date"
          value={customEnd}
          onChange={(event) => {
            setCustomEnd(event.target.value);
            if (event.target.value) setPeriod("custom");
          }}
          aria-label="Custom end date"
          className={`h-8 w-full rounded-md border ${PANEL_BORDER} bg-white px-2 text-[11.5px] outline-none focus:ring-2 focus:ring-[#6C47FF] dark:bg-[#0b0b16] dark:text-white`}
        />
        {period === "custom" && (!customStart || !customEnd) ? (
          <p className={`px-1 text-[10px] ${MUTED}`}>Pick both dates to apply the range.</p>
        ) : null}
      </div>

      <div className="my-1.5 border-t border-[#f0f1f6] dark:border-[#252538]" />
      <MenuLabel>Breakeven band</MenuLabel>
      <div className="px-2 pb-1">
        <select
          value={beBand}
          onChange={(event) => setBeBand(Number(event.target.value))}
          aria-label="Breakeven band in R"
          className={`h-8 w-full rounded-md border ${PANEL_BORDER} bg-white px-2 text-[11.5px] outline-none focus:ring-2 focus:ring-[#6C47FF] dark:bg-[#0b0b16] dark:text-white`}
        >
          {[[0, "Off"], [0.05, "Ã‚Â±0.05R"], [0.1, "Ã‚Â±0.10R"], [0.2, "Ã‚Â±0.20R"], [0.3, "Ã‚Â±0.30R"], [0.5, "Ã‚Â±0.50R"]].map(
            ([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            )
          )}
        </select>
      </div>

      <div className="my-1.5 border-t border-[#f0f1f6] dark:border-[#252538]" />
      <MenuItem
        onClick={() => {
          setPeriod("this-month");
          setCustomStart("");
          setCustomEnd("");
          setBeBand(0);
          close();
          flash("Filters reset");
        }}
      >
        Reset filters
      </MenuItem>
    </>
  );

  const iconButton = `flex h-8 w-8 items-center justify-center rounded-md border ${PANEL_BORDER} bg-white text-[#6b7090] transition-colors hover:bg-[#f5f6fb] dark:bg-[#13131f] dark:text-[#8a8fb5] dark:hover:bg-white/5 ${FOCUS}`;

  return (
    <div className="min-h-full bg-[#f7f8fb] px-3 pb-12 pt-3 text-[#14142b] dark:bg-[#0b0b19] dark:text-[#e8e9f7] sm:px-5">
      <div className="mx-auto max-w-[1500px]">
        {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Header + tabs Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <div className="-mx-3 border-b border-[#eceef4] bg-white px-3 pt-1 dark:border-[#252538] dark:bg-[#0b0b16] sm:-mx-5 sm:px-5">
          <div className="flex flex-col justify-between gap-3 pb-2 lg:flex-row lg:items-center">
            <h1 className="text-[21px] font-bold tracking-tight text-[#14142b] dark:text-white">Reports</h1>

            <div className="flex flex-wrap items-center gap-2">
              <Menu
                width="w-64"
                button={({ toggle }) => (
                  <button
                    type="button"
                    onClick={toggle}
                    className={`flex h-8 items-center gap-1.5 rounded-md border ${PANEL_BORDER} bg-white px-2.5 text-[12px] font-medium text-[#4b5162] transition-colors hover:bg-[#f5f6fb] dark:bg-[#13131f] dark:text-[#c9cbe0] dark:hover:bg-white/5 ${FOCUS}`}
                    aria-label="Filters"
                  >
                    <Filter size={13} className="text-[#7c6cf0]" />
                    Filters
                    <ChevronDown size={12} className="opacity-60" />
                  </button>
                )}
              >
                {(close) => filtersContent(close)}
              </Menu>

              <Menu
                width="w-64"
                button={({ toggle }) => (
                  <button
                    type="button"
                    onClick={toggle}
                    className={`flex h-8 items-center gap-1.5 rounded-md border ${PANEL_BORDER} bg-white px-2.5 text-[12px] font-medium tabular-nums text-[#4b5162] transition-colors hover:bg-[#f5f6fb] dark:bg-[#13131f] dark:text-[#c9cbe0] dark:hover:bg-white/5 ${FOCUS}`}
                    aria-label={`Date range ${range.label}`}
                  >
                    <CalendarDays size={13} className="text-[#7c6cf0]" />
                    {range.label}
                    <ChevronDown size={12} className="opacity-60" />
                  </button>
                )}
              >
                {(close) => filtersContent(close)}
              </Menu>

              <Menu
                width="w-64"
                button={({ toggle }) => (
                  <button
                    type="button"
                    onClick={toggle}
                    className={`flex h-8 items-center gap-1.5 rounded-md border ${PANEL_BORDER} bg-white px-2.5 text-[12px] font-medium text-[#4b5162] transition-colors hover:bg-[#f5f6fb] dark:bg-[#13131f] dark:text-[#c9cbe0] dark:hover:bg-white/5 ${FOCUS}`}
                    aria-label="Account filter"
                  >
                    <Wallet size={13} className="text-[#7c6cf0]" />
                    <span className="max-w-[130px] truncate">{currentAccount?.name || "All accounts"}</span>
                    <ChevronDown size={12} className="opacity-60" />
                  </button>
                )}
              >
                {(close) => (
                  <>
                    <MenuLabel>Accounts</MenuLabel>
                    <MenuItem active onClick={close} icon={Check}>
                      {currentAccount?.name || "All accounts"}
                    </MenuItem>
                    <div className="my-1.5 border-t border-[#f0f1f6] dark:border-[#252538]" />
                    <MenuItem
                      icon={Plus}
                      onClick={() => {
                        close();
                        navigate("/add-trade");
                      }}
                    >
                      Manage accounts
                    </MenuItem>
                  </>
                )}
              </Menu>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto">
            {TABS.map(({ key, label, icon: Icon, dropdown }) =>
              dropdown ? (
                <Menu
                  key={key}
                  width="w-72"
                  align="left"
                  button={({ toggle }) => (
                    <button
                      type="button"
                      onClick={() => {
                        setTab("reports");
                        toggle();
                      }}
                      aria-pressed={tab === key}
                      className={`relative flex shrink-0 items-center gap-1.5 px-2.5 py-2.5 text-[12px] font-semibold transition-colors sm:px-3 sm:text-[12.5px] ${FOCUS} ${
                        tab === key
                          ? "text-[#5a3cff] dark:text-[#b7a6ff]"
                          : "text-[#6b7090] hover:text-[#14142b] dark:text-[#8a8fb5] dark:hover:text-white"
                      }`}
                    >
                      <Icon size={14} className="hidden sm:block" />
                      {label}
                      <ChevronDown size={12} className="opacity-70" />
                      {tab === key ? (
                        <span className="absolute inset-x-2 -bottom-[1px] h-[2px] rounded-t bg-[#6C47FF]" />
                      ) : null}
                    </button>
                  )}
                >
                  {(close) => (
                    <>
                      {REPORT_GROUPS.map((group) => (
                        <div key={group.label}>
                          <MenuLabel>{group.label}</MenuLabel>
                          {group.items.map((item) => (
                            <MenuItem
                              key={item.key}
                              active={reportKey === item.key}
                              onClick={() => {
                                setReportKey(item.key);
                                setTab("reports");
                                close();
                              }}
                            >
                              {item.label}
                            </MenuItem>
                          ))}
                        </div>
                      ))}
                    </>
                  )}
                </Menu>
              ) : (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  aria-pressed={tab === key}
                  className={`relative flex shrink-0 items-center gap-1.5 px-2.5 py-2.5 text-[12px] font-semibold transition-colors sm:px-3 sm:text-[12.5px] ${FOCUS} ${
                    tab === key
                      ? "text-[#5a3cff] dark:text-[#b7a6ff]"
                      : "text-[#6b7090] hover:text-[#14142b] dark:text-[#8a8fb5] dark:hover:text-white"
                  }`}
                >
                  <Icon size={14} className="hidden sm:block" />
                  {label}
                  {tab === key ? (
                    <span className="absolute inset-x-2 -bottom-[1px] h-[2px] rounded-t bg-[#6C47FF]" />
                  ) : null}
                </button>
              )
            )}
          </div>
        </div>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Body Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <div className="pt-4">
          {!currentAccount && !PREVIEW ? (
            <div className={`${CARD_BASE} shadow-sm`}>
              <EmptyReport
                icon={Wallet}
                title="No account selected"
                hint="Pick a trading account from the sidebar to build reports from its trade log."
              />
            </div>
          ) : loading ? (
            <div className="flex h-72 items-center justify-center">
              <Loader2 size={26} className="animate-spin text-[#6C47FF]" aria-label="Loading reports" />
            </div>
          ) : error ? (
            <div className={`${CARD_BASE} shadow-sm`}>
              <EmptyReport icon={Info} title="Could not load trades" hint={error} />
            </div>
          ) : (
            <>
              {(tab === "overview" || tab === "reports") && (
                <div className="mb-1 flex items-center gap-2 px-1">
                  <span className={SUBTITLE}>P&L SHOWING</span>
                  <Menu
                    width="w-44"
                    align="left"
                    button={({ toggle }) => (
                      <button
                        type="button"
                        onClick={toggle}
                        className={`flex h-7 items-center gap-1.5 rounded-md border ${PANEL_BORDER} bg-white px-2 text-[11.5px] font-semibold text-[#3f4354] hover:bg-[#f5f6fb] dark:bg-[#13131f] dark:text-[#c9cbe0] dark:hover:bg-white/5 ${FOCUS}`}
                      >
                        {metricLabel.toUpperCase()}
                        <ChevronDown size={11} className="opacity-60" />
                      </button>
                    )}
                  >
                    {(close) => (
                      <>
                        {METRICS.map(([key, label]) => (
                          <MenuItem
                            key={key}
                            active={metric === key}
                            onClick={() => {
                              setMetric(key);
                              close();
                            }}
                          >
                            {label}
                          </MenuItem>
                        ))}
                      </>
                    )}
                  </Menu>
                </div>
              )}

              {tab === "overview" && (
                <>
                  <section className={`${CARD_BASE} mb-4 shadow-sm`}>
                    <div className="flex items-start justify-between gap-3 px-5 pt-4">
                      <div>
                        <h2 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.045em] text-[#3f4354] dark:text-[#c9cbe0]">
                          Your stats
                          <InfoDot text="Every number is calculated from the trades in the selected range." />
                        </h2>
                        <p className={`mt-0.5 ${SUBTITLE}`}>{rangeSubtitle}</p>
                      </div>
                      <Menu
                        width="w-52"
                        button={({ toggle }) => (
                          <button
                            type="button"
                            onClick={toggle}
                            aria-label="Stats actions"
                            className={`flex h-7 w-7 items-center justify-center rounded-md text-[#8a90a2] hover:bg-[#f2f3f8] dark:hover:bg-white/5 ${FOCUS}`}
                          >
                            <MoreHorizontal size={16} />
                          </button>
                        )}
                      >
                        {(close) => (
                          <>
                            <MenuItem
                              icon={Download}
                              onClick={() => {
                                close();
                                exportReport();
                              }}
                            >
                              Export trades (CSV)
                            </MenuItem>
                            <MenuItem
                              icon={FileText}
                              onClick={() => {
                                close();
                                copySummary();
                              }}
                            >
                              Copy summary
                            </MenuItem>
                            <MenuItem
                              icon={Filter}
                              onClick={() => {
                                close();
                                setPeriod("this-month");
                                setCustomStart("");
                                setCustomEnd("");
                                setBeBand(0);
                                flash("Filters reset");
                              }}
                            >
                              Reset filters
                            </MenuItem>
                          </>
                        )}
                      </Menu>
                    </div>

                    <div className="grid grid-cols-3 gap-4 px-5 pb-4 pt-3">
                      {[
                        ["Best month", bestMonth, "in"],
                        ["Lowest month", worstMonth, "in"],
                        ["Average", null, "per Month"],
                      ].map(([label, month, suffix]) => {
                        const value = month ? month.value : averageMonth;
                        return (
                          <div key={label} className="min-w-0">
                            <div className={`text-[10.5px] font-semibold ${SUBTITLE}`}>{label}</div>
                            <div
                              className={`mt-0.5 truncate text-[15px] font-bold tabular-nums ${
                                value >= 0 ? POS_T : NEG_T
                              }`}
                              title={money(value)}
                            >
                              {money(value)}
                            </div>
                            <div className={`mt-0.5 truncate text-[10px] ${MUTED}`}>
                              {month ? `${suffix} ${monthText(month.date)}` : suffix}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-1 gap-x-10 px-2 pb-2 md:grid-cols-2">
                      <div>
                        {leftRows.map((row) => (
                          <StatRow
                            key={row.label}
                            label={row.label}
                            value={row.value}
                            tone={row.tone}
                            tint={row.tint}
                          />
                        ))}
                      </div>
                      <div>
                        {rightRows.map((row) => (
                          <StatRow
                            key={row.label}
                            label={row.label}
                            value={row.value}
                            tone={row.tone}
                            tint={row.tint}
                          />
                        ))}
                      </div>
                    </div>
                  </section>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <ReportCard
                      title={metricTitle(metric)}
                      subtitle={rangeSubtitle}
                      right={<InfoDot text="Running total across every trading day in range." />}
                      className="shadow-sm"
                    >
                      <div className="px-2 pb-2 pt-3">
                        <AreaChart points={cumulative} ariaLabel="Daily net cumulative P&L" />
                      </div>
                    </ReportCard>

                    <ReportCard
                      title={metricDailyTitle(metric)}
                      subtitle={rangeSubtitle}
                      right={<InfoDot text="Each bar is one trading day." />}
                      className="shadow-sm"
                    >
                      <div className="px-2 pb-2 pt-3">
                        <BarsChart points={metricDays} ariaLabel="Net daily P&L" />
                      </div>
                    </ReportCard>
                  </div>
                </>
              )}

              {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Reports tab Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
              {tab === "reports" && (
                <>
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <ReportCard
                      title={`Trade distribution by ${reportHeading(reportMeta.label)}`}
                      subtitle={rangeSubtitle}
                      right={<InfoDot text={reportMeta.blurb} />}
                      className="shadow-sm"
                    >
                      {report.rows.length ? (
                        <div className="px-4 pb-2 pt-5">
                          <div className="space-y-3">
                            {report.rows.map((row) => (
                              <DistributionRow
                                key={row.label}
                                label={row.label}
                                value={row.count}
                                max={report.maxCount}
                              />
                            ))}
                          </div>
                          <div className="pt-4">
                            <CountAxis max={report.maxCount} />
                          </div>
                        </div>
                      ) : (
                        <EmptyReport
                          icon={Tag}
                          title="Nothing to group yet"
                          hint={`Closed trades in ${range.label} would be grouped here by ${reportMeta.label.toLowerCase()}.`}
                        />
                      )}
                    </ReportCard>

                    <ReportCard
                      title={`Performance by ${reportHeading(reportMeta.label)}`}
                      subtitle={rangeSubtitle}
                      right={<InfoDot text="Net P&L per bucket. Bars left of the dashed line lost money." />}
                      className="shadow-sm"
                    >
                      {report.rows.length ? (
                        <div className="px-4 pb-2 pt-5">
                          <div className="space-y-3">
                            {report.rows.map((row) => (
                              <PerformanceRow
                                key={row.label}
                                label={row.label}
                                value={row.net}
                                min={report.scale.min}
                                max={report.scale.max}
                              />
                            ))}
                          </div>
                          <div className="pt-4">
                            <AxisBelow
                              min={report.scale.min}
                              max={report.scale.max}
                              ticks={report.scale.ticks}
                            />
                          </div>
                        </div>
                      ) : (
                        <EmptyReport
                          icon={BarChart3}
                          title="No performance to show"
                          hint="Log a closed trade and its result will land in the matching bucket."
                        />
                      )}
                    </ReportCard>
                  </div>

                  <section className={`${CARD_BASE} mt-4 shadow-sm`}>
                    <header className="flex items-start justify-between gap-3 px-5 pt-4">
                      <div>
                        <h3 className={TITLE}>Summary</h3>
                        <p className={`mt-1 ${SUBTITLE}`}>
                          {report.rows.length} {report.rows.length === 1 ? "bucket" : "buckets"}
                          {report.total > report.rows.length ? ` of ${report.total}` : ""} Ã‚Â·{" "}
                          {reportMeta.label}
                        </p>
                      </div>
                      <InfoDot text="Net P&L, win rate, gross profit and loss, trade count and volume for every bucket." />
                    </header>

                    {report.rows.length ? (
                      <div className="overflow-x-auto px-2 pb-4 pt-3">
                        <table className="w-full min-w-[880px] border-collapse">
                          <thead>
                            <tr className={`text-[10px] uppercase tracking-[0.03em] ${SUBTITLE}`}>
                              <th className="px-3 py-2 text-left font-semibold">
                                {SUMMARY_HEAD[reportKey] || "Bucket"}
                              </th>
                              <th className="px-3 py-2 text-right font-semibold">Net profits</th>
                              <th className="px-3 py-2 text-center font-semibold">Winning %</th>
                              <th className="px-3 py-2 text-right font-semibold">Total profits</th>
                              <th className="px-3 py-2 text-right font-semibold">Total loss</th>
                              <th className="px-3 py-2 text-right font-semibold">Trades</th>
                              <th className="px-3 py-2 text-right font-semibold">Volume</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.rows.map((row, index) => (
                              <tr
                                key={row.label}
                                className={
                                  index % 2
                                    ? "bg-[#fafbfd] dark:bg-white/[0.02]"
                                    : "bg-transparent"
                                }
                              >
                                <td className="max-w-[280px] truncate px-3 py-[7px] text-[11.5px] font-medium text-[#14142b] dark:text-white">
                                  {row.label}
                                </td>
                                <td
                                  className={`px-3 py-[7px] text-right text-[11.5px] font-semibold tabular-nums ${
                                    row.net >= 0 ? POS_T : NEG_T
                                  }`}
                                >
                                  {money(row.net, false)}
                                </td>
                                <td className="px-3 py-[7px]">
                                  <div className="flex items-center justify-center gap-2">
                                    <WinBar wins={row.wins} losses={row.losses} count={row.count} />
                                    <span className={`w-9 text-right text-[10.5px] tabular-nums ${MUTED}`}>
                                      {pct(row.winRate)}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-3 py-[7px] text-right text-[11.5px] tabular-nums text-[#4b5162] dark:text-[#a4a8c0]">
                                  {money(row.grossWin, false)}
                                </td>
                                <td className="px-3 py-[7px] text-right text-[11.5px] tabular-nums text-[#4b5162] dark:text-[#a4a8c0]">
                                  {money(-row.grossLoss, false)}
                                </td>
                                <td className="px-3 py-[7px] text-right text-[11.5px] tabular-nums text-[#14142b] dark:text-white">
                                  {row.count}
                                </td>
                                <td className="px-3 py-[7px] text-right text-[11.5px] tabular-nums text-[#4b5162] dark:text-[#a4a8c0]">
                                  {row.volume.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <EmptyReport
                        icon={FileText}
                        title="No groups in this range"
                        hint="Widen the date range or log a trade to populate this report."
                      />
                    )}
                  </section>
                </>
              )}

              {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Compare tab Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
              {tab === "compare" && (
                <>
                  <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={resetComparison}
                      className={`h-8 rounded-md border border-[#e2ddfb] bg-white px-3 text-[10.5px] font-bold uppercase tracking-[0.04em] text-[#5a3cff] transition-colors hover:bg-[#f7f5ff] dark:border-[#38336b] dark:bg-[#13131f] dark:text-[#b7a6ff] dark:hover:bg-white/5 ${FOCUS}`}
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={generateComparison}
                      className={`h-8 rounded-md bg-[#6C47FF] px-3 text-[10.5px] font-bold uppercase tracking-[0.04em] text-white transition-colors hover:bg-[#5a38ea] ${FOCUS}`}
                    >
                      Generate report
                    </button>
                  </div>

                  {!compareResults ? (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      {groups.map((group, index) => (
                        <section key={index} className={`${CARD_BASE} px-5 pb-4 pt-4 shadow-sm`}>
                          <h3 className={TITLE}>Group #{index + 1}</h3>

                          <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 lg:grid-cols-2">
                            <FieldRow label="Symbol">
                              <input
                                value={group.symbol}
                                onChange={(event) =>
                                  updateGroup(index, { symbol: event.target.value.toUpperCase() })
                                }
                                placeholder="e.g. EURUSD"
                                aria-label={`Group ${index + 1} symbol`}
                                className={`h-8 w-full rounded-[5px] border ${PANEL_BORDER} bg-white px-2.5 text-[11.5px] text-[#14142b] outline-none transition-colors placeholder:text-[#a6abbd] focus:border-[#b9a9ff] focus:ring-2 focus:ring-[#6C47FF]/25 dark:bg-[#0b0b16] dark:text-white`}
                              />
                            </FieldRow>

                            <FieldRow label="Tags">
                              <TagListInput
                                value={group.tags}
                                onChange={(tags) => updateGroup(index, { tags })}
                                placeholder="Add tag"
                              />
                            </FieldRow>

                            <FieldRow label="Side">
                              <select
                                value={group.side}
                                onChange={(event) => updateGroup(index, { side: event.target.value })}
                                aria-label={`Group ${index + 1} side`}
                                className={`h-8 w-full rounded-[5px] border ${PANEL_BORDER} bg-white px-2 text-[11.5px] text-[#14142b] outline-none focus:ring-2 focus:ring-[#6C47FF]/25 dark:bg-[#0b0b16] dark:text-white`}
                              >
                                <option value="any">Any side</option>
                                <option value="long">Long only</option>
                                <option value="short">Short only</option>
                              </select>
                            </FieldRow>

                            <FieldRow label="Start date">
                              <input
                                type="date"
                                value={group.start}
                                onChange={(event) => updateGroup(index, { start: event.target.value })}
                                aria-label={`Group ${index + 1} start date`}
                                className={`h-8 w-full rounded-[5px] border ${PANEL_BORDER} bg-white px-2 text-[11.5px] text-[#14142b] outline-none focus:ring-2 focus:ring-[#6C47FF]/25 dark:bg-[#0b0b16] dark:text-white`}
                              />
                            </FieldRow>

                            <FieldRow label="Trade P&L">
                              <select
                                value={group.pnl}
                                onChange={(event) => updateGroup(index, { pnl: event.target.value })}
                                aria-label={`Group ${index + 1} trade result`}
                                className={`h-8 w-full rounded-[5px] border ${PANEL_BORDER} bg-white px-2 text-[11.5px] text-[#14142b] outline-none focus:ring-2 focus:ring-[#6C47FF]/25 dark:bg-[#0b0b16] dark:text-white`}
                              >
                                <option value="any">Any result</option>
                                <option value="wins">Winners only</option>
                                <option value="losses">Losers only</option>
                              </select>
                            </FieldRow>

                            <FieldRow label="End date">
                              <input
                                type="date"
                                value={group.end}
                                onChange={(event) => updateGroup(index, { end: event.target.value })}
                                aria-label={`Group ${index + 1} end date`}
                                className={`h-8 w-full rounded-[5px] border ${PANEL_BORDER} bg-white px-2 text-[11.5px] text-[#14142b] outline-none focus:ring-2 focus:ring-[#6C47FF]/25 dark:bg-[#0b0b16] dark:text-white`}
                              />
                            </FieldRow>
                          </div>

                          <p className={`mt-3 text-[10.5px] ${MUTED}`}>
                            <span className="font-semibold text-[#14142b] dark:text-white">
                              {groupCounts[index]}
                            </span>{" "}
                            {groupCounts[index] === 1 ? "trade matches" : "trades match"} this group in{" "}
                            {range.label}
                          </p>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      {compareResults.map((result, index) => (
                        <section key={`stats-${index}`} className={`${CARD_BASE} shadow-sm`}>
                          <header className="px-5 pt-4">
                            <h3 className={TITLE}>Statistics (Group #{index + 1})</h3>
                            <p className={`mt-1 ${SUBTITLE}`}>{rangeSubtitle}</p>
                          </header>
                          <div className="px-2 pb-3 pt-2">
                            {compareStatRows(result).map((row) => (
                              <StatRow key={row.label} label={row.label} value={row.value} tone={row.tone} />
                            ))}
                          </div>
                        </section>
                      ))}

                      {compareResults.map((result, index) => (
                        <section key={`eval-${index}`} className={`${CARD_BASE} shadow-sm`}>
                          <header className="px-5 pt-4">
                            <h3 className={TITLE}>Overall evaluation (Group #{index + 1})</h3>
                            <p className={`mt-1 ${SUBTITLE}`}>{rangeSubtitle}</p>
                          </header>
                          {result.stats.count ? (
                            <WinDonut
                              winRate={result.stats.winRate}
                              wins={result.stats.wins}
                              losses={result.stats.losses}
                            />
                          ) : (
                            <EmptyReport
                              icon={Target}
                              title="No trades in this group"
                              hint="Change the group filters above, then generate the report again."
                            />
                          )}
                        </section>
                      ))}

                      {compareResults.map((result, index) => (
                        <ReportCard
                          key={`chart-${index}`}
                          title={`Daily net cumulative P&L (Group #${index + 1})`}
                          subtitle={rangeSubtitle}
                          right={<InfoDot text="Running total of net P&L for this group's trades." />}
                          className="shadow-sm"
                        >
                          <div className="px-2 pb-2 pt-3">
                            <AreaChart
                              points={result.series}
                              ariaLabel={`Group ${index + 1} cumulative P&L`}
                            />
                          </div>
                        </ReportCard>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Calendar tab Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
              {tab === "calendar" && (
                <section className={`${CARD_BASE} overflow-hidden shadow-sm`}>
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
                    <div>
                      <h3 className={`text-[13px] font-bold ${HEAD}`}>{format(calMonth, "MMMM yyyy")}</h3>
                      <p className={`mt-1 ${SUBTITLE}`}>Click any day to open its journal entry</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCalMonth(addMonths(calMonth, -1))}
                        aria-label="Previous month"
                        className={iconButton}
                      >
                        <ChevronLeft size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setCalMonth(new Date())}
                        className={`flex h-8 items-center rounded-md border ${PANEL_BORDER} bg-white px-2.5 text-[11.5px] font-medium text-[#4b5162] transition-colors hover:bg-[#f5f6fb] dark:bg-[#13131f] dark:text-[#c9cbe0] dark:hover:bg-white/5 ${FOCUS}`}
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        onClick={() => setCalMonth(addMonths(calMonth, 1))}
                        aria-label="Next month"
                        className={iconButton}
                      >
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  </div>

                  <div className="px-3 pb-4 pt-4 sm:px-4">
                    <div className="grid grid-cols-7 gap-1 pb-1">
                      {DAYS.map((day) => (
                        <div key={day} className={`pb-1 text-center text-[10px] font-semibold uppercase ${SUBTITLE}`}>
                          {day}
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                      {calendar.weeks.flat().map((day) => (
                        <button
                          key={day.key}
                          type="button"
                          onClick={() => navigate(`/journal?date=${day.key}`)}
                          aria-label={`Open journal for ${format(day.date, "MMMM d, yyyy")}`}
                          className={`flex min-h-[58px] flex-col rounded-md border p-1 text-left transition-colors sm:min-h-[80px] sm:p-1.5 ${FOCUS} ${
                            day.inMonth
                              ? "border-[#eff0f6] bg-white hover:border-[#d8d0ff] hover:bg-[#faf9ff] dark:border-[#232338] dark:bg-[#13131f] dark:hover:bg-white/5"
                              : "border-transparent bg-transparent opacity-40 hover:opacity-70"
                          }`}
                        >
                          <span className="text-[10px] font-semibold tabular-nums text-[#4b5162] dark:text-[#a4a8c0] sm:text-[10.5px]">
                            {format(day.date, "d")}
                          </span>
                          {day.value !== null ? (
                            <span
                              className={`mt-1 block w-full truncate rounded px-0.5 py-0.5 text-center text-[9.5px] font-bold tabular-nums sm:px-1 sm:text-[10px] ${
                                day.value >= 0
                                  ? "bg-[#eafaf3] text-[#0e9f77] dark:bg-[#22c493]/15 dark:text-[#2dd4a0]"
                                  : "bg-[#fdeef1] text-[#d93a57] dark:bg-[#f2556e]/15 dark:text-[#ff6b86]"
                              }`}
                            >
                              <span className="sm:hidden">{compactMoney(day.value)}</span>
                              <span className="hidden sm:inline">{money(day.value, false)}</span>
                            </span>
                          ) : null}
                          {day.count ? (
                            <span className={`mt-1 hidden text-[9px] sm:block ${SUBTITLE}`}>
                              {day.count} {day.count === 1 ? "trade" : "trades"}
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-px border-t border-[#eceef4] bg-[#eceef4] dark:border-[#252538] dark:bg-[#252538] sm:grid-cols-4">
                    {[
                      [
                        "Month P&L",
                        money(calendar.totals.net, false),
                        calendar.totals.net >= 0 ? POS_T : NEG_T,
                      ],
                      ["Trading days", calendar.totals.tradingDays, ""],
                      ["Winning days", calendar.totals.winDays, POS_T],
                      ["Losing days", calendar.totals.lossDays, NEG_T],
                    ].map(([label, value, tone]) => (
                      <div key={label} className="bg-white px-4 py-3 dark:bg-[#13131f]">
                        <div className={`text-[10px] font-semibold uppercase tracking-[0.03em] ${SUBTITLE}`}>
                          {label}
                        </div>
                        <div className={`mt-0.5 text-[13px] font-bold tabular-nums ${tone || HEAD}`}>
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>

      {toast ? (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-[1200] flex items-center gap-2 rounded-lg border border-[#d9f2e6] bg-white px-3.5 py-2.5 text-[12.5px] font-semibold text-[#0e9f77] shadow-lg dark:border-[#22c493]/30 dark:bg-[#13131f] dark:text-[#2dd4a0]"
        >
          <Check size={14} />
          {toast}
        </div>
      ) : null}
    </div>
  );
}

