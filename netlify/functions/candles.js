// netlify/functions/candles.js
// Read-only candle proxy for the trade chart.
//
// The chart feed this app uses does not send CORS headers, so the browser cannot
// call it directly. This function validates the request, clamps it to the feed's
// history limits, and returns a small normalised candle array.
//
// GET /.netlify/functions/candles?symbol=EURUSD%3DX&interval=5&from=<ms>&to=<ms>

const INTERVALS = {
  "1": { feed: "1m", maxDays: 7 },
  "5": { feed: "5m", maxDays: 60 },
  "15": { feed: "15m", maxDays: 60 },
  "60": { feed: "60m", maxDays: 730 },
  D: { feed: "1d", maxDays: 3650 },
};

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    ...HEADERS,
    "Content-Type": "application/json",
    "Cache-Control": statusCode === 200 ? "public, max-age=60" : "no-store",
  },
  body: JSON.stringify(body),
});

const HOSTS = ["query2.finance.yahoo.com", "query1.finance.yahoo.com"];

async function load(host, symbol, feed, period1, period2) {
  const url =
    `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=${feed}&period1=${period1}&period2=${period2}` +
    "&includePrePost=false&events=div%2Csplits";

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
  });

  if (!res.ok) {
    const error = new Error(`Chart feed replied ${res.status}.`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: HEADERS, body: "" };
  }
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Use GET." });
  }

  const query = event.queryStringParameters || {};
  const symbol = String(query.symbol || "").trim();
  if (!/^[A-Za-z0-9^=.\-]{1,20}$/.test(symbol)) {
    return json(400, { error: "Send a valid symbol." });
  }

  const intervalKey = INTERVALS[query.interval] ? query.interval : "5";
  const spec = INTERVALS[intervalKey];
  const now = Date.now();

  let to = Number(query.to);
  if (!Number.isFinite(to) || to <= 0) to = now;
  to = Math.min(to, now + 86400000);

  let from = Number(query.from);
  if (!Number.isFinite(from) || from <= 0) from = to - 5 * 86400000;
  if (from >= to) from = to - 2 * 86400000;

  const maxSpan = spec.maxDays * 86400000;
  if (to - from > maxSpan) from = to - maxSpan;

  // One extra bar either side so the window never starts mid-candle.
  const period1 = Math.floor((from - 2 * 60000) / 1000);
  const period2 = Math.ceil((to + 2 * 60000) / 1000);

  let payload = null;
  let lastError = null;
  for (const host of HOSTS) {
    try {
      payload = await load(host, symbol, spec.feed, period1, period2);
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!payload) {
    const rateLimited = lastError?.status === 429;
    return json(rateLimited ? 429 : 502, {
      error: rateLimited
        ? "The chart feed is rate limiting requests. Try again in a minute."
        : "The chart feed did not answer. Try again.",
    });
  }

  const result = payload?.chart?.result?.[0];
  if (!result) {
    return json(404, {
      error: payload?.chart?.error?.description || "No candles for this market.",
    });
  }

  const stamps = result.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  const candles = [];

  for (let index = 0; index < stamps.length; index += 1) {
    const open = quote.open?.[index];
    const high = quote.high?.[index];
    const low = quote.low?.[index];
    const close = quote.close?.[index];
    if (![open, high, low, close].every(Number.isFinite)) continue;
    candles.push({
      t: stamps[index],
      o: open,
      h: high,
      l: low,
      c: close,
    });
  }

  if (!candles.length) {
    return json(404, {
      error: "No candles for this market in that window.",
    });
  }

  return json(200, {
    symbol: result?.meta?.symbol || symbol,
    timezone: result?.meta?.exchangeTimezoneName || "UTC",
    interval: intervalKey,
    source: "Yahoo Finance",
    candles,
  });
};
