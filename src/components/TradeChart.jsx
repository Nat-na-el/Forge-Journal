// src/components/TradeChart.jsx
// Candles for one trade, with the entry and exit placed on the exact candle
// they happened in. Long: entry points up, exit points down. Short: the
// reverse. The live TradingView panel cannot be drawn on (it is an iframe),
// so this chart is the one that carries the markers.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, RotateCw } from "lucide-react";
import {
  MARKET_DATA_UNAVAILABLE,
  PROXY_SYMBOLS,
  demoCandlesFor,
  fetchCandles,
  formatPrice,
  intervalByKey,
} from "../lib/marketData";

const POS = "#34d399";
const NEG = "#fb7185";
const GRID = "rgba(148, 163, 184, 0.10)";
const AXIS = "#71738b";
const DIM = "#5d5f75";
const TEXT = "#e8e9f7";

const UP_PANEL = "#0b0b13";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9d86ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b13]";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

const clockOf = (date) =>
  date ? `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}` : "—";

const dayOf = (date) => (date ? `${MONTHS[date.getMonth()]} ${date.getDate()}` : "—");

const axisTime = (ms, spanMs) => {
  const date = new Date(ms);
  if (spanMs > 2 * 86400000) return dayOf(date);
  return clockOf(date);
};

function useBox(ref) {
  const [box, setBox] = useState({ w: 720, h: 300 });

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setBox((prev) =>
          Math.abs(prev.w - rect.width) > 1 || Math.abs(prev.h - rect.height) > 1
            ? { w: rect.width, h: rect.height }
            : prev
        );
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return box;
}

function Arrow({ x, y, up, colour }) {
  const points = up
    ? `${x},${y - 5} ${x - 6.5},${y - 18} ${x + 6.5},${y - 18}`
    : `${x},${y + 5} ${x - 6.5},${y + 18} ${x + 6.5},${y + 18}`;
  return <polygon points={points} fill={colour} stroke={UP_PANEL} strokeWidth="1" />;
}

function Marker({ x, y, price, pair, up, colour, above, plotWidth, leftEdge }) {
  const label = `${up ? "↑" : "↓"} ${formatPrice(price, pair)}`;
  const width = label.length * 6 + 12;
  const labelX = clamp(x - width / 2, leftEdge, leftEdge + plotWidth - width);
  const labelY = above ? y - 32 : y + 20;

  return (
    <g>
      <Arrow x={x} y={y} up={up} colour={colour} />
      <rect
        x={labelX}
        y={labelY}
        width={width}
        height={16}
        rx={4}
        fill={colour}
        fillOpacity="0.16"
        stroke={colour}
        strokeOpacity="0.55"
      />
      <text
        x={labelX + width / 2}
        y={labelY + 11}
        textAnchor="middle"
        fontSize="9.5"
        fontWeight="600"
        fill={colour}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {label}
      </text>
    </g>
  );
}

export default function TradeChart({
  trade,
  intervalKey = "5",
  accent = "#6C47FF",
  demo = false,
  onOpenLive,
}) {
  const wrapRef = useRef(null);
  const box = useBox(wrapRef);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ status: "idle", data: null, error: "" });
  const [hover, setHover] = useState(null);

  const openDate = useMemo(() => toDate(trade?.openDateTime), [trade?.openDateTime]);
  const closeDate = useMemo(() => toDate(trade?.closeDateTime), [trade?.closeDateTime]);
  const entryTime = openDate ? openDate.getTime() : null;
  const exitTime = closeDate ? closeDate.getTime() : null;
  const entryPrice = Number(trade?.entry) || null;
  const exitPrice = Number(trade?.exit) || null;
  const stopPrice = Number(trade?.stopLoss) || null;
  const targetPrice = Number(trade?.takeProfit) || null;
  const short = /short|sell/i.test(trade?.direction || "");
  const pending = !exitTime || trade?.status === "pending";
  const spec = intervalByKey(intervalKey);
  const intervalMs = spec.seconds * 1000;

  const canPlot = !!(entryTime && entryPrice);

  useEffect(() => {
    if (!canPlot) {
      setResult({ status: "nodata", data: null, error: "" });
      return undefined;
    }

    if (demo) {
      setResult({ status: "ready", data: demoCandlesFor({ trade, intervalKey }), error: "" });
      return undefined;
    }

    const pad = intervalMs * 14;
    const from = entryTime - pad;
    const to = (exitTime || Date.now()) + pad;
    const controller = new AbortController();
    let alive = true;

    setResult({ status: "loading", data: null, error: "" });
    fetchCandles({
      pair: trade?.pair,
      interval: intervalKey,
      from,
      to,
      signal: controller.signal,
    })
      .then((data) => {
        if (!alive) return;
        setResult({
          status: data.candles.length ? "ready" : "empty",
          data,
          error: data.candles.length ? "" : "No candles for this market in that window.",
        });
      })
      .catch((error) => {
        if (!alive || error?.name === "AbortError") return;
        const missing = error?.message === MARKET_DATA_UNAVAILABLE;
        setResult({
          status: "error",
          data: null,
          error: missing
            ? "Market history is served by a Netlify function, which is not running here."
            : error?.message || "Market history could not be loaded.",
        });
      });

    return () => {
      alive = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPlot, entryTime, exitTime, intervalKey, trade?.pair, demo, attempt, intervalMs]);

  const data = result.data;
  const candles = data?.candles || [];

  const geometry = useMemo(() => {
    if (!canPlot || !box.w) return null;

    const padL = 8;
    const padR = 60;
    const padT = 14;
    const padB = 22;
    const plotW = Math.max(40, box.w - padL - padR);
    const plotH = Math.max(40, box.h - padT - padB);

    const candleMs = candles.map((candle) => ({ ...candle, ms: candle.t * 1000 }));
    const firstMs = candleMs.length ? candleMs[0].ms : entryTime;
    const lastMs = candleMs.length ? candleMs[candleMs.length - 1].ms + intervalMs : exitTime || entryTime;

    const tMin = Math.min(firstMs, entryTime, exitTime || entryTime);
    const tMax = Math.max(lastMs, exitTime || entryTime, entryTime + intervalMs);
    const tSpan = Math.max(intervalMs, tMax - tMin);

    const prices = [entryPrice];
    if (exitPrice) prices.push(exitPrice);
    candleMs.forEach((candle) => prices.push(candle.h, candle.l));
    if (stopPrice && Math.abs(stopPrice - entryPrice) < Math.abs(entryPrice) * 0.25) prices.push(stopPrice);
    if (targetPrice && Math.abs(targetPrice - entryPrice) < Math.abs(entryPrice) * 0.25) prices.push(targetPrice);

    let low = Math.min(...prices);
    let high = Math.max(...prices);
    if (!Number.isFinite(low) || !Number.isFinite(high)) {
      low = entryPrice * 0.999;
      high = entryPrice * 1.001;
    }
    const spread = high - low || Math.abs(high) * 0.002 || 1;
    low -= spread * 0.1;
    high += spread * 0.1;

    const xOfTime = (ms) => padL + ((ms - tMin) / tSpan) * plotW;
    const xToTime = (x) => tMin + ((x - padL) / plotW) * tSpan;
    const yOfPrice = (price) => padT + ((high - price) / (high - low)) * plotH;

    const nearest = (ms) => {
      if (!candleMs.length) return null;
      let best = 0;
      let bestDist = Infinity;
      candleMs.forEach((candle, index) => {
        const distance = Math.abs(candle.ms + intervalMs / 2 - ms);
        if (distance < bestDist) {
          bestDist = distance;
          best = index;
        }
      });
      return best;
    };

    const step = candleMs.length ? plotW / candleMs.length : plotW;
    const bodyW = clamp(step * 0.62, 1, 13);

    const markerX = (ms) => {
      const index = nearest(ms);
      if (index == null) return xOfTime(ms);
      return xOfTime(candleMs[index].ms + intervalMs / 2);
    };

    const entryX = clamp(markerX(entryTime), padL + 2, padL + plotW - 2);
    const exitX = exitTime ? clamp(markerX(exitTime), padL + 2, padL + plotW - 2) : null;

    return {
      padL,
      padR,
      padT,
      padB,
      plotW,
      plotH,
      low,
      high,
      tSpan,
      candleMs,
      step,
      bodyW,
      xOfTime,
      xToTime,
      yOfPrice,
      entryX,
      exitX,
      bodyLeft: (index) => padL + index * step + (step - bodyW) / 2,
    };
  }, [
    canPlot,
    box.w,
    box.h,
    candles,
    entryTime,
    exitTime,
    entryPrice,
    exitPrice,
    stopPrice,
    targetPrice,
    intervalMs,
  ]);

  const tone = useMemo(() => {
    const pnl = Number(trade?.pnl);
    if (Number.isFinite(pnl) && pnl !== 0) return pnl > 0 ? POS : NEG;
    if (exitPrice && entryPrice) {
      const up = exitPrice >= entryPrice;
      return up ? POS : NEG;
    }
    return AXIS;
  }, [trade?.pnl, entryPrice, exitPrice]);

  const hovered = hover != null ? geometry?.candleMs?.[hover] : null;
  const source = data?.source || "";
  const proxyNote = PROXY_SYMBOLS[data?.symbol] || "";

  const overlay = (() => {
    if (!canPlot) {
      return {
        title: "Nothing to plot yet",
        body: "Add an entry price and an entry time to this trade and its entry and exit will appear on candles.",
        live: true,
      };
    }
    if (result.status === "loading") return null;
    if (result.status === "empty") {
      return {
        title: "No candles in that window",
        body:
          "This market was closed, or the trade is older than the history this interval keeps. Try a higher timeframe.",
        retry: true,
      };
    }
    if (result.status === "error") {
      return {
        title: "Candles could not load",
        body: result.error,
        retry: true,
        live: true,
      };
    }
    return null;
  })();

  return (
    <div className="flex h-full w-full flex-col" style={{ backgroundColor: UP_PANEL }}>
      <div className="flex min-h-[30px] flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#1b1b26] px-3 py-1.5">
        <span className="flex items-center gap-1 text-[10.5px] font-semibold tabular-nums" style={{ color: accent }}>
          <span aria-hidden="true">{short ? "↓" : "↑"}</span>
          Entry {entryPrice ? formatPrice(entryPrice, trade?.pair) : "—"}
          <span className="font-normal" style={{ color: DIM }}>
            {clockOf(openDate)}
          </span>
        </span>
        <span className="flex items-center gap-1 text-[10.5px] font-semibold tabular-nums" style={{ color: tone }}>
          <span aria-hidden="true">{pending ? "•" : short ? "↑" : "↓"}</span>
          {pending ? "Open" : "Exit"} {!pending && exitPrice ? formatPrice(exitPrice, trade?.pair) : ""}
          <span className="font-normal" style={{ color: DIM }}>
            {pending ? "still running" : clockOf(closeDate)}
          </span>
        </span>

        <span className="ml-auto flex items-center gap-2 text-[10px]" style={{ color: DIM }}>
          {hovered ? (
            <span className="tabular-nums">
              {dayOf(new Date(hovered.ms))} {clockOf(new Date(hovered.ms))} · O{" "}
              {formatPrice(hovered.o, trade?.pair)} H {formatPrice(hovered.h, trade?.pair)} L{" "}
              {formatPrice(hovered.l, trade?.pair)} C {formatPrice(hovered.c, trade?.pair)}
            </span>
          ) : (
            <span>
              {source === "Demo candles"
                ? "Demo candles"
                : candles.length
                ? `${candles.length} candles · ${spec.label}`
                : spec.label}
              {proxyNote ? ` · ${proxyNote} proxy` : ""}
            </span>
          )}
        </span>
      </div>

      <div ref={wrapRef} className="relative min-h-0 flex-1">
        {geometry ? (
          <svg
            width={box.w}
            height={box.h}
            role="img"
            aria-label={`${trade?.pair || "Trade"} candles with entry and exit marked`}
            className="block"
            onMouseMove={(event) => {
              if (!geometry.candleMs.length) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const time = geometry.xToTime(event.clientX - rect.left);
              let best = 0;
              let bestDist = Infinity;
              geometry.candleMs.forEach((candle, index) => {
                const distance = Math.abs(candle.ms + intervalMs / 2 - time);
                if (distance < bestDist) {
                  bestDist = distance;
                  best = index;
                }
              });
              setHover(best);
            }}
            onMouseLeave={() => setHover(null)}
          >
            {/* Grid and price axis */}
            {[0, 1, 2, 3, 4].map((tick) => {
              const price = geometry.high - ((geometry.high - geometry.low) * tick) / 4;
              const y = geometry.yOfPrice(price);
              return (
                <g key={tick}>
                  <line
                    x1={geometry.padL}
                    x2={geometry.padL + geometry.plotW}
                    y1={y}
                    y2={y}
                    stroke={GRID}
                    strokeWidth="1"
                  />
                  <text
                    x={geometry.padL + geometry.plotW + 6}
                    y={y + 3}
                    fontSize="9.5"
                    fill={AXIS}
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {formatPrice(price, trade?.pair)}
                  </text>
                </g>
              );
            })}

            {/* Time axis */}
            {geometry.candleMs.length
              ? [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                  const index = Math.round((geometry.candleMs.length - 1) * ratio);
                  const candle = geometry.candleMs[index];
                  if (!candle) return null;
                  const x = geometry.xOfTime(candle.ms + intervalMs / 2);
                  return (
                    <text
                      key={ratio}
                      x={clamp(x, geometry.padL + 12, geometry.padL + geometry.plotW - 12)}
                      y={box.h - 6}
                      fontSize="9.5"
                      fill={AXIS}
                      textAnchor="middle"
                    >
                      {axisTime(candle.ms, geometry.tSpan)}
                    </text>
                  );
                })
              : null}

            {/* In-trade band */}
            {geometry.exitX != null && geometry.exitX > geometry.entryX ? (
              <rect
                x={geometry.entryX}
                y={geometry.padT}
                width={geometry.exitX - geometry.entryX}
                height={geometry.plotH}
                fill={accent}
                fillOpacity="0.06"
              />
            ) : null}

            {/* Candles */}
            {geometry.candleMs.map((candle, index) => {
              const x = geometry.xOfTime(candle.ms + intervalMs / 2);
              const up = candle.c >= candle.o;
              const colour = up ? POS : NEG;
              const top = geometry.yOfPrice(Math.max(candle.o, candle.c));
              const bottom = geometry.yOfPrice(Math.min(candle.o, candle.c));
              return (
                <g key={candle.ms}>
                  <line
                    x1={x}
                    x2={x}
                    y1={geometry.yOfPrice(candle.h)}
                    y2={geometry.yOfPrice(candle.l)}
                    stroke={colour}
                    strokeWidth="1"
                    strokeOpacity="0.8"
                  />
                  <rect
                    x={geometry.bodyLeft(index)}
                    y={top}
                    width={geometry.bodyW}
                    height={Math.max(1, bottom - top)}
                    fill={colour}
                    fillOpacity={up ? 0.85 : 0.9}
                  />
                </g>
              );
            })}

            {/* Stop and target, only when they sit near the visible range */}
            {stopPrice && geometry.yOfPrice(stopPrice) > geometry.padT && geometry.yOfPrice(stopPrice) < geometry.padT + geometry.plotH ? (
              <g>
                <line
                  x1={geometry.padL}
                  x2={geometry.padL + geometry.plotW}
                  y1={geometry.yOfPrice(stopPrice)}
                  y2={geometry.yOfPrice(stopPrice)}
                  stroke={NEG}
                  strokeWidth="1"
                  strokeDasharray="2 4"
                  strokeOpacity="0.55"
                />
                <text
                  x={geometry.padL + geometry.plotW + 6}
                  y={geometry.yOfPrice(stopPrice) + 3}
                  fontSize="9"
                  fill={NEG}
                  fillOpacity="0.8"
                >
                  SL
                </text>
              </g>
            ) : null}
            {targetPrice && geometry.yOfPrice(targetPrice) > geometry.padT && geometry.yOfPrice(targetPrice) < geometry.padT + geometry.plotH ? (
              <g>
                <line
                  x1={geometry.padL}
                  x2={geometry.padL + geometry.plotW}
                  y1={geometry.yOfPrice(targetPrice)}
                  y2={geometry.yOfPrice(targetPrice)}
                  stroke={POS}
                  strokeWidth="1"
                  strokeDasharray="2 4"
                  strokeOpacity="0.55"
                />
                <text
                  x={geometry.padL + geometry.plotW + 6}
                  y={geometry.yOfPrice(targetPrice) + 3}
                  fontSize="9"
                  fill={POS}
                  fillOpacity="0.8"
                >
                  TP
                </text>
              </g>
            ) : null}

            {/* Entry and exit price lines */}
            <line
              x1={geometry.padL}
              x2={geometry.padL + geometry.plotW}
              y1={geometry.yOfPrice(entryPrice)}
              y2={geometry.yOfPrice(entryPrice)}
              stroke={accent}
              strokeWidth="1"
              strokeDasharray="4 4"
              strokeOpacity="0.6"
            />
            {!pending && exitPrice ? (
              <line
                x1={geometry.padL}
                x2={geometry.padL + geometry.plotW}
                y1={geometry.yOfPrice(exitPrice)}
                y2={geometry.yOfPrice(exitPrice)}
                stroke={tone}
                strokeWidth="1"
                strokeDasharray="4 4"
                strokeOpacity="0.6"
              />
            ) : null}

            {/* Hover crosshair */}
            {hovered ? (
              <line
                x1={geometry.xOfTime(hovered.ms + intervalMs / 2)}
                x2={geometry.xOfTime(hovered.ms + intervalMs / 2)}
                y1={geometry.padT}
                y2={geometry.padT + geometry.plotH}
                stroke="#8f8fa6"
                strokeWidth="1"
                strokeDasharray="2 3"
                strokeOpacity="0.6"
              />
            ) : null}

            {/* Markers: entry points up for a long, down for a short */}
            <Marker
              x={geometry.entryX}
              y={geometry.yOfPrice(entryPrice)}
              price={entryPrice}
              pair={trade?.pair}
              up={!short}
              colour={accent}
              above={!short}
              plotWidth={geometry.plotW}
              leftEdge={geometry.padL}
            />
            {!pending && exitPrice && geometry.exitX != null ? (
              <Marker
                x={geometry.exitX}
                y={geometry.yOfPrice(exitPrice)}
                price={exitPrice}
                pair={trade?.pair}
                up={short}
                colour={tone}
                above={short}
                plotWidth={geometry.plotW}
                leftEdge={geometry.padL}
              />
            ) : null}
          </svg>
        ) : null}

        {result.status === "loading" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ backgroundColor: UP_PANEL }}>
            <Loader2 size={20} className="animate-spin" style={{ color: accent }} />
            <p className="text-[11.5px]" style={{ color: AXIS }}>
              Loading candles…
            </p>
          </div>
        ) : null}

        {overlay ? (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center"
            style={{ backgroundColor: "rgba(11, 11, 19, 0.94)" }}
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{ backgroundColor: `${accent}22`, color: accent }}
            >
              <AlertTriangle size={16} />
            </span>
            <p className="text-[12.5px] font-semibold" style={{ color: TEXT }}>
              {overlay.title}
            </p>
            <p className="max-w-[360px] text-[11px] leading-relaxed" style={{ color: AXIS }}>
              {overlay.body}
            </p>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
              {overlay.retry ? (
                <button
                  type="button"
                  onClick={() => setAttempt((value) => value + 1)}
                  className={`inline-flex items-center gap-1.5 rounded-md border border-[#2a2a3a] px-2.5 py-1.5 text-[11px] font-semibold text-[#c9c9dc] transition-colors hover:bg-white/5 hover:text-white ${FOCUS}`}
                >
                  <RotateCw size={11} /> Try again
                </button>
              ) : null}
              {overlay.live && onOpenLive ? (
                <button
                  type="button"
                  onClick={onOpenLive}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:brightness-110 ${FOCUS}`}
                  style={{ backgroundColor: accent }}
                >
                  Open live chart
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#1b1b26] px-3 py-1">
        <span className="text-[9.5px]" style={{ color: DIM }}>
          {source === "Demo candles"
            ? "Sample data, so the candles are generated around this trade."
            : candles.length
            ? `${source} · times in your timezone`
            : "Entry and exit are placed on the candle they happened in."}
        </span>
        <span className="ml-auto text-[9.5px]" style={{ color: DIM }}>
          {short ? "Short" : "Long"} · {pending ? "open" : `${spec.label} chart`}
        </span>
      </div>
    </div>
  );
}
