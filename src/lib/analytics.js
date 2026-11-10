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
 *
 * `options.breakevenBand` (R) reclassifies small results as breakeven so a
 * scratch trade stops counting as a win or a loss. Net P&L always includes
 * every executed trade, so a band never changes money — only the ratios.
 */
export function tradeStats(trades = [], options = {}) {
  const breakevenBand = Number(options.breakevenBand) || 0;
  const executed = trades.filter(isExecuted);
  const pnls = executed.map(pnlOf);
  const wins = executed.filter((t) => outcomeOf(t, breakevenBand) === "win");
  const losses = executed.filter((t) => outcomeOf(t, breakevenBand) === "loss");
  const breakeven = executed.length - wins.length - losses.length;

  const grossWin = wins.reduce((sum, t) => sum + pnlOf(t), 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + pnlOf(t), 0));
  const net = executed.reduce((sum, t) => sum + pnlOf(t), 0);
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;

  return {
    total: trades.length,
    count: executed.length,
    pending: trades.length - executed.length,
    wins: wins.length,
    losses: losses.length,
    breakeven,
    breakevenBand,
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
export function groupStats(trades = [], keyOf = () => "—", options = {}) {
  const groups = new Map();

  trades.forEach((trade) => {
    const key = keyOf(trade);
    if (key === null || key === undefined || key === "") return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(trade);
  });

  return [...groups.entries()]
    .map(([key, list]) => ({ key, ...tradeStats(list, options) }))
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

// ─── Hold-time buckets ───────────────────────────────────────────────────────

export const HOLD_BUCKETS = [
  { key: "under30m", label: "< 30 min", min: 0, max: 30 },
  { key: "30m-1h", label: "30 min – 1 h", min: 30, max: 60 },
  { key: "1h-4h", label: "1 – 4 h", min: 60, max: 240 },
  { key: "4h-24h", label: "4 – 24 h", min: 240, max: 1440 },
  { key: "over24h", label: "> 24 h", min: 1440, max: Infinity },
];

/** Count of executed trades per hold-time bucket. */
export function holdTimeDistribution(trades = []) {
  const values = trades
    .filter(isExecuted)
    .map(holdMinutes)
    .filter((v) => v !== null);

  return HOLD_BUCKETS.map((bucket) => ({
    ...bucket,
    count: values.filter((v) => v > bucket.min && v <= bucket.max).length,
  }));
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

// ─── Trade grading ───────────────────────────────────────────────────────────

export const RATING_WORDS = {
  5: "Excellent",
  4: "Good",
  3: "Average",
  2: "Poor",
  1: "Bad",
};

/** One row per star rating (5 → 1) plus the unrated remainder. */
export function ratingBreakdown(trades = [], options = {}) {
  const buckets = [5, 4, 3, 2, 1].map((rating) => {
    const group = trades.filter((t) => Number(t.rating) === rating);
    return { key: String(rating), rating, word: RATING_WORDS[rating], ...tradeStats(group, options) };
  });

  const rated = trades.filter((t) => Number(t.rating) > 0);

  return {
    buckets,
    unrated: tradeStats(trades.filter((t) => !Number(t.rating)), options),
    ratedCount: rated.length,
    avgRating: rated.length ? avg(rated.map((t) => Number(t.rating))) : 0,
  };
}

/** Every mistake tag with the trades that carried it, most costly first. */
export function mistakeBreakdown(trades = [], options = {}) {
  const tagged = [];
  trades.forEach((trade) => {
    const mistakes = Array.isArray(trade.mistakes) ? trade.mistakes : [];
    mistakes.forEach((mistake) => tagged.push({ ...trade, __mistake: mistake }));
  });

  return groupStats(tagged, (t) => t.__mistake, options).sort((a, b) => a.net - b.net);
}

// ─── Costs, execution quality and breakeven ─────────────────────────────────

/** Signed commission + swap. Broker imports store costs as negative numbers. */
export const feesOf = (trade) =>
  (Number(trade?.commission) || 0) + (Number(trade?.swap) || 0);

/** P&L before commission and swap. */
export const grossPnlOf = (trade) => pnlOf(trade) - feesOf(trade);

/**
 * Realised R-multiple, derived from the trade's own numbers so broker imports
 * and hand-logged trades agree: the value of one price unit is inferred from
 * P&L and the entry→exit move, then applied to the stop distance.
 */
export function realisedR(trade) {
  if (!isExecuted(trade)) return null;
  const entry = Number(trade?.entry);
  const exit = Number(trade?.exit);
  const stop = Number(trade?.stopLoss);
  const pnl = pnlOf(trade);
  if (!entry || !exit || !stop || !pnl) return null;
  const long = /^(long|buy)/i.test(trade?.direction || "");
  const move = long ? exit - entry : entry - exit;
  if (!move) return null;
  const risk = Math.abs(entry - stop) * (pnl / move);
  if (!Number.isFinite(risk) || risk <= 0) return null;
  return pnl / risk;
}

/** "win" | "loss" | "breakeven" | "pending", honouring a breakeven band in R. */
export function outcomeOf(trade, breakevenBand = 0) {
  if (!isExecuted(trade)) return "pending";
  const band = Number(breakevenBand) || 0;
  const pnl = pnlOf(trade);
  if (band > 0) {
    const r = realisedR(trade);
    if (r !== null) {
      if (Math.abs(r) <= band) return "breakeven";
      return r > 0 ? "win" : "loss";
    }
  }
  if (pnl > 0) return "win";
  if (pnl < 0) return "loss";
  return "breakeven";
}

/** Commission / swap totals and the share of gross profit they eat. */
export function feeStats(trades = []) {
  const executed = trades.filter(isExecuted);
  const commission = executed.reduce((sum, t) => sum + (Number(t.commission) || 0), 0);
  const swap = executed.reduce((sum, t) => sum + (Number(t.swap) || 0), 0);
  const fees = commission + swap;
  const net = executed.reduce((sum, t) => sum + pnlOf(t), 0);
  const gross = net - fees;
  const recorded = executed.filter((t) => Number(t.commission) || Number(t.swap)).length;

  return {
    commission,
    swap,
    fees,
    net,
    gross,
    recorded,
    count: executed.length,
    avgPerTrade: executed.length ? fees / executed.length : 0,
    shareOfGross: gross > 0 ? (Math.abs(fees) / gross) * 100 : 0,
  };
}

/**
 * MAE / MFE capture. Both are entered in R by the trader:
 *   mae — how far the trade went against you before working (positive R)
 *   mfe — how far it went in your favour (positive R)
 */
export function excursionStats(trades = []) {
  const rows = trades
    .filter(isExecuted)
    .map((trade) => {
      const mfe = Number(trade.mfe);
      const mae = Number(trade.mae);
      const r = realisedR(trade);
      return {
        trade,
        mfe: Number.isFinite(mfe) ? mfe : null,
        mae: Number.isFinite(mae) ? mae : null,
        r,
        capture: mfe > 0 && r !== null ? r / mfe : null,
        missed: mfe > 0 && r !== null ? mfe - r : null,
      };
    })
    .filter((row) => (row.mfe !== null && row.mfe !== 0) || (row.mae !== null && row.mae !== 0));

  const withMfe = rows.filter((row) => row.mfe > 0);
  const withCapture = withMfe.filter((row) => row.capture !== null);

  return {
    rows,
    count: rows.length,
    avgMfe: avg(withMfe.map((row) => row.mfe)),
    avgMae: avg(rows.filter((row) => row.mae !== null).map((row) => Math.abs(row.mae))),
    avgCapture: avg(withCapture.map((row) => row.capture)),
    missedR: withCapture.reduce((sum, row) => sum + Math.max(0, row.missed), 0),
    worst: withCapture
      .slice()
      .sort((a, b) => (b.missed ?? 0) - (a.missed ?? 0))
      .slice(0, 5),
  };
}

/** Day-of-week × time-of-day grid of net P&L and trade counts. */
export function dayHourHeatmap(trades = []) {
  const grid = DAYS.map(() => HOUR_BUCKETS.map(() => ({ net: 0, count: 0 })));

  trades.filter(isExecuted).forEach((trade) => {
    const date = tradeDate(trade);
    if (!date) return;
    const dayIndex = DAYS.indexOf(dayOfWeek(date));
    const bucketIndex = HOUR_BUCKETS.indexOf(hourBucket(date));
    if (dayIndex < 0 || bucketIndex < 0) return;
    const cell = grid[dayIndex][bucketIndex];
    cell.net += pnlOf(trade);
    cell.count += 1;
  });

  return { days: DAYS, buckets: HOUR_BUCKETS, grid };
}
