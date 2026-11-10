// src/lib/analytics.js
// Shared trade analytics. Pure functions only — no React, no Firebase — so every
// report page computes the same numbers from the same rules.
//
// A trade is a Firestore document under users/{uid}/accounts/{accountId}/trades with:
//   openDateTime, closeDateTime, pair, direction, entry, exit, stopLoss, takeProfit,
//   pnl, rr, lotSize, notes, status ("executed" | "pending" | ...), confluences[],
//   screenshotUrl, strategy?, createdAt

export const pnlOf = (trade) => Number(trade?.pnl) || 0;

export const isExecuted = (trade) => !!trade && trade.status !== "pending";

export const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

// The date a trade counts towards: close time (realised) falling back to open time.
export const tradeDate = (trade) =>
  toDate(trade?.closeDateTime) || toDate(trade?.openDateTime) || toDate(trade?.date);

export const money = (value, signed = true) => {
  const n = Number(value) || 0;
  const sign = n < 0 ? "-" : signed && n > 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const pct = (value, digits = 0) => `${(Number(value) || 0).toFixed(digits)}%`;

export const ratio = (value, digits = 2) => {
  if (value === Infinity) return "∞";
  if (!Number.isFinite(value)) return "—";
  return Number(value).toFixed(digits);
};

export const avg = (values) =>
  values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;

const safeDiv = (a, b) => (b ? a / b : 0);

/**
 * Core statistics for a set of trades.
 * Pending trades are ignored everywhere (no realised P&L yet).
 */
export function tradeStats(trades = []) {
  const executed = trades.filter(isExecuted);
  const pnls = executed.map(pnlOf);
  const wins = executed.filter((t) => pnlOf(t) > 0);
  const losses = executed.filter((t) => pnlOf(t) < 0);
  const breakeven = executed.length - wins.length - losses.length;

  const grossWin = wins.reduce((sum, t) => sum + pnlOf(t), 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + pnlOf(t), 0));
  const net = grossWin - grossLoss;
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;

  return {
    total: trades.length,
    count: executed.length,
    pending: trades.length - executed.length,
    wins: wins.length,
    losses: losses.length,
    breakeven,
    grossWin,
    grossLoss,
    net,
    avgWin,
    avgLoss,
    avgPnl: safeDiv(net, executed.length),
    winRate: executed.length ? (wins.length / executed.length) * 100 : 0,
    lossRate: executed.length ? (losses.length / executed.length) * 100 : 0,
    profitFactor: grossLoss ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    payoff: avgLoss ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0,
    expectancy: safeDiv(net, executed.length),
    best: pnls.length ? Math.max(...pnls) : 0,
    worst: pnls.length ? Math.min(...pnls) : 0,
    avgRR: avg(executed.map((t) => Number(t.rr) || 0).filter((v) => v > 0)),
  };
}

/** Executed trades in chronological order (oldest first). */
export function chronological(trades = []) {
  return trades
    .filter(isExecuted)
    .slice()
    .sort((a, b) => (tradeDate(a)?.getTime() || 0) - (tradeDate(b)?.getTime() || 0));
}

/** Cumulative P&L points: [{ date, value }]. */
export function equityCurve(trades = []) {
  const points = [];
  let running = 0;
  chronological(trades).forEach((trade) => {
    running += pnlOf(trade);
    points.push({
      date: tradeDate(trade),
      value: Number(running.toFixed(2)),
    });
  });
  return points;
}

/** Peak-to-trough drawdown of the cumulative P&L curve. */
export function drawdown(trades = []) {
  let running = 0;
  let peak = 0;
  let max = 0;
  chronological(trades).forEach((trade) => {
    running += pnlOf(trade);
    peak = Math.max(peak, running);
    max = Math.max(max, peak - running);
  });
  return max;
}

/** Longest run of consecutive wins / losses. */
export function streaks(trades = []) {
  let win = 0;
  let loss = 0;
  let current = 0;
  let kind = null;

  chronological(trades).forEach((trade) => {
    const p = pnlOf(trade);
    const next = p > 0 ? "win" : p < 0 ? "loss" : null;
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

  return { longestWin: win, longestLoss: loss };
}

/** Group trades by a key and return stats per group, best net P&L first. */
export function groupStats(trades = [], keyOf = () => "—") {
  const groups = new Map();

  trades.forEach((trade) => {
    const key = keyOf(trade);
    if (key === null || key === undefined || key === "") return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(trade);
  });

  return [...groups.entries()]
    .map(([key, list]) => ({ key, ...tradeStats(list) }))
    .sort((a, b) => b.net - a.net);
}

// ─── Time buckets ────────────────────────────────────────────────────────────
// Everything below uses the trader's local clock, which is what a journal should
// reflect. The TradingView-style "session" names are approximations, labelled with
// their hour ranges in the UI so nobody is misled.

export const SESSIONS = [
  { key: "asia", label: "Asia", range: "00–08", from: 0, to: 7 },
  { key: "london", label: "London", range: "08–13", from: 8, to: 12 },
  { key: "newyork", label: "New York", range: "13–21", from: 13, to: 20 },
  { key: "late", label: "Late / off-hours", range: "21–24", from: 21, to: 23 },
];

export function sessionOf(date) {
  if (!date) return null;
  const hour = date.getHours();
  return SESSIONS.find((s) => hour >= s.from && hour <= s.to) || SESSIONS[3];
}

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function dayOfWeek(date) {
  if (!date) return null;
  // getDay(): 0 = Sunday … 6 = Saturday → shift so Monday is first
  return DAYS[(date.getDay() + 6) % 7];
}

export const HOUR_BUCKETS = [
  "00–03",
  "03–06",
  "06–09",
  "09–12",
  "12–15",
  "15–18",
  "18–21",
  "21–24",
];

export function hourBucket(date) {
  if (!date) return null;
  return HOUR_BUCKETS[Math.floor(date.getHours() / 3)];
}

/** Trade duration in minutes (null when the close time is missing). */
export function holdMinutes(trade) {
  const open = toDate(trade?.openDateTime);
  const close = toDate(trade?.closeDateTime);
  if (!open || !close) return null;
  const diff = (close.getTime() - open.getTime()) / 60000;
  return diff > 0 ? diff : null;
}

export function formatDuration(minutes) {
  if (minutes === null || minutes === undefined) return "—";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 60 * 24) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(minutes / (60 * 24));
  const h = Math.round((minutes % (60 * 24)) / 60);
  return h ? `${d}d ${h}h` : `${d}d`;
}

// ─── R multiples ─────────────────────────────────────────────────────────────

export const R_BUCKETS = [
  { key: "loss3", label: "≤ -3R", min: -Infinity, max: -3 },
  { key: "loss2", label: "-3R … -2R", min: -3, max: -2 },
  { key: "loss1", label: "-2R … -1R", min: -2, max: -1 },
  { key: "loss0", label: "-1R … 0", min: -1, max: 0 },
  { key: "win0", label: "0 … 1R", min: 0, max: 1 },
  { key: "win1", label: "1R … 2R", min: 1, max: 2 },
  { key: "win2", label: "2R … 3R", min: 2, max: 3 },
  { key: "win3", label: "≥ 3R", min: 3, max: Infinity },
];

export function rDistribution(trades = []) {
  const values = trades
    .filter(isExecuted)
    .map((t) => Number(t.rr))
    .filter((v) => Number.isFinite(v) && v !== 0);

  return R_BUCKETS.map((bucket) => ({
    ...bucket,
    count: values.filter((v) => v > bucket.min && v <= bucket.max).length,
  }));
}
