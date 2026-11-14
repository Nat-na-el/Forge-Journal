// src/lib/marketData.js
// Candle history for the trade chart.
//
// The live TradingView panel is an iframe: we can show it, but we cannot draw
// our own entry/exit markers inside it. So the trade view draws its own chart
// from real candles. Browsers are blocked from the public chart feed by CORS,
// which is why the request goes through /.netlify/functions/candles.

export const CANDLE_INTERVALS = [
  { key: "1", label: "1m", seconds: 60, yahoo: "1m", maxDays: 7 },
  { key: "5", label: "5m", seconds: 300, yahoo: "5m", maxDays: 60 },
  { key: "15", label: "15m", seconds: 900, yahoo: "15m", maxDays: 60 },
  { key: "60", label: "1h", seconds: 3600, yahoo: "60m", maxDays: 730 },
  { key: "D", label: "1D", seconds: 86400, yahoo: "1d", maxDays: 3650 },
];

export const intervalByKey = (key) =>
  CANDLE_INTERVALS.find((entry) => entry.key === key) || CANDLE_INTERVALS[1];

// A handful of journal pairs have a different ticker on the chart feed. Gold
// and silver only exist as futures there, so the panel labels them as proxies.
const SYMBOL_MAP = {
  XAUUSD: "GC=F",
  XAGUSD: "SI=F",
  NAS100: "^NDX",
  US30: "^DJI",
  SPX500: "^GSPC",
  US2000: "^RUT",
  GER40: "^GDAXI",
  UK100: "^FTSE",
  JP225: "^N225",
  BTCUSD: "BTC-USD",
  ETHUSD: "ETH-USD",
};

export const PROXY_SYMBOLS = {
  "GC=F": "COMEX gold futures",
  "SI=F": "COMEX silver futures",
};

export function yahooSymbolFor(pair) {
  const key = String(pair || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (SYMBOL_MAP[key]) return SYMBOL_MAP[key];
  if (/^[A-Z]{6}$/.test(key)) return `${key}=X`;
  return key || "EURUSD=X";
}

export function priceDigitsFor(pair) {
  const key = String(pair || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (/^(XAU|XAG)USD$/.test(key)) return 2;
  if (/JPY$/.test(key)) return 3;
  if (/^[A-Z]{6}$/.test(key)) return 5;
  if (/^(NAS100|US30|SPX500|US2000|GER40|UK100|JP225)$/.test(key)) return 1;
  if (/^(BTC|ETH)USD$/.test(key)) return 1;
  return 2;
}

export function formatPrice(value, pair) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const digits = priceDigitsFor(pair);
  return number.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export const MARKET_DATA_UNAVAILABLE = "MARKET_DATA_UNAVAILABLE";

const parseTime = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

const hashSeed = (text) => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const seededRandom = (seed) => {
  let state = seed || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Candles for the sample trades of `?preview=1`.
 * The demo journal is synthetic, so its prices do not line up with today's
 * market. Drawing real candles would put the markers miles from the price, so
 * the preview gets a deterministic path anchored on the trade's own entry and
 * exit. It is labelled "Demo candles" in the panel and never used for real data.
 */
export function demoCandlesFor({ trade, intervalKey = "5" }) {
  const spec = intervalByKey(intervalKey);
  const step = spec.seconds * 1000;
  const entryTime = parseTime(trade?.openDateTime) || Date.now() - 45 * 60000;
  let exitTime = parseTime(trade?.closeDateTime) || entryTime + 45 * 60000;
  if (exitTime <= entryTime) exitTime = entryTime + step * 8;

  const entry = Number(trade?.entry) || 100;
  const exit = Number(trade?.exit) || entry;
  const trend = exit >= entry ? 1 : -1;
  const span = Math.abs(exit - entry) || Math.abs(entry) * 0.0015 || 0.001;

  const before = 36;
  const during = Math.max(5, Math.min(110, Math.round((exitTime - entryTime) / step)));
  const after = 26;
  const total = before + during + after;
  const rand = seededRandom(hashSeed(`${trade?.id || "trade"}-${intervalKey}`));

  const closes = [];
  for (let index = 0; index < total; index += 1) {
    let base;
    if (index <= before) {
      // A drift into the entry so the setup has context before the fill.
      base = entry - trend * span * (0.35 + 0.3 * Math.sin(index / 4));
    } else if (index <= before + during) {
      base = entry + ((exit - entry) * (index - before)) / during;
    } else {
      base = exit + trend * span * 0.12 * ((index - before - during) / Math.max(1, after));
    }
    const noise = (rand() - 0.5) * span * 0.45;
    closes.push(index === before ? entry : index === before + during ? exit : base + noise);
  }

  const startTime = entryTime - before * step;
  const candles = closes.map((close, index) => {
    const open = index === 0 ? close - trend * span * 0.25 : closes[index - 1];
    const wick = span * (0.08 + rand() * 0.16);
    let high = Math.max(open, close) + wick * rand();
    let low = Math.min(open, close) - wick * rand();
    if (index === before) {
      high = Math.max(high, entry);
      low = Math.min(low, entry);
    }
    if (index === before + during) {
      high = Math.max(high, exit);
      low = Math.min(low, exit);
    }
    return {
      t: Math.floor((startTime + index * step) / 1000),
      o: open,
      h: high,
      l: low,
      c: close,
    };
  });

  return {
    symbol: yahooSymbolFor(trade?.pair),
    timezone: "local",
    interval: spec.key,
    source: "Demo candles",
    candles,
  };
}

/**
 * Load candles for a pair between two instants.
 * Resolves with { symbol, timezone, interval, candles: [{ t, o, h, l, c }] }.
 * Throws Error(MARKET_DATA_UNAVAILABLE) when the endpoint is missing, which is
 * what happens on a plain `npm start` without the Netlify functions.
 */
export async function fetchCandles({ pair, interval, from, to, signal }) {
  const symbol = yahooSymbolFor(pair);
  const spec = intervalByKey(interval);
  const params = new URLSearchParams({
    symbol,
    interval: spec.key,
    from: String(Math.round(from)),
    to: String(Math.round(to)),
  });

  let res;
  try {
    res = await fetch(`/.netlify/functions/candles?${params.toString()}`, {
      signal,
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new Error(MARKET_DATA_UNAVAILABLE);
  }

  const type = res.headers.get("content-type") || "";
  if (!type.includes("application/json")) {
    // The static dev server answers unknown paths with index.html, not JSON.
    throw new Error(MARKET_DATA_UNAVAILABLE);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || "Market history could not be loaded.");
  }
  if (!Array.isArray(data?.candles)) {
    throw new Error("Market history came back empty.");
  }

  return {
    symbol: data.symbol || symbol,
    timezone: data.timezone || "UTC",
    interval: data.interval || spec.key,
    source: data.source || "Yahoo Finance",
    candles: data.candles,
  };
}
