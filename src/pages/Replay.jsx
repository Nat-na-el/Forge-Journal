// src/pages/Replay.jsx
// Bar replay: step through 1-second candles, play/pause, change speed,
// and journal the trade you would have taken at any moment.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Clock,
  Monitor,
  Plus,
} from "lucide-react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { useTheme } from "../Theme-provider";
import useAccent from "../hooks/useAccent";
import AccentPicker from "../components/ui/AccentPicker";
import {
  MUTED,
  HEAD,
  DIVIDER,
  CARD,
  FIELD,
  POS_T,
  NEG_T,
} from "../lib/uiTokens";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip
);

const SPEEDS = [1, 2, 5, 10, 20];

const createRNG = (seed) => {
  let s = ((seed >>> 0) * 16807 + 12345) % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

// 600 one-second candles (~10 minutes of price action), deterministic per seed.
const generateSymbolData = (symbol, seconds = 600, seed = null) => {
  const rng = seed != null ? createRNG(seed) : Math.random;
  const data = [];
  let price = symbol === "UK100" ? 7500 : symbol === "NAS100" ? 15000 : 28000;
  const start = new Date();
  start.setSeconds(start.getSeconds() - seconds);
  start.setMilliseconds(0);
  for (let i = 0; i < seconds; i++) {
    const time = new Date(start.getTime() + i * 1000);
    const hour = time.getUTCHours();
    let vol = 1.5;
    if (hour >= 8 && hour < 16) vol = 3.0;
    if (hour >= 13 && hour < 21) vol = 3.5;
    if (hour >= 21 || hour < 1) vol = 1.0;
    const change = (rng() - 0.5) * vol;
    price += change;
    price = Math.max(price, 1000);
    const open = price;
    const close = price + (rng() - 0.5) * vol * 0.5;
    const high = Math.max(open, close) + rng() * vol * 0.3;
    const low = Math.min(open, close) - rng() * vol * 0.3;
    data.push({
      datetime: time.toISOString(),
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
    });
  }
  return data;
};

export default function Replay({ currentAccount }) {
  const { accent, setAccent, ac } = useAccent();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [symbol, setSymbol] = useState("UK100");
  const [candles, setCandles] = useState([]);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [journalOpen, setJournalOpen] = useState(false);
  const [journalNote, setJournalNote] = useState("");
  const [message, setMessage] = useState({ text: "", type: "info" });

  const timerRef = useRef(null);

  useEffect(() => {
    setCandles(generateSymbolData(symbol, 600, "replay-" + symbol));
    setIndex(0);
    setJournalOpen(false);
    setJournalNote("");
  }, [symbol]);

  useEffect(() => {
    if (!isPlaying) return;
    const ms = Math.max(50, 1000 / speed);
    timerRef.current = setInterval(() => {
      setIndex((i) => (i >= candles.length - 1 ? candles.length - 1 : i + 1));
    }, ms);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, speed, candles.length]);

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const handleKey = (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.code === "Space") {
      e.preventDefault();
      setIsPlaying((p) => !p);
    } else if (e.code === "ArrowRight") {
      setIndex((i) => Math.min(candles.length - 1, i + 1));
    } else if (e.code === "ArrowLeft") {
      setIndex((i) => Math.max(0, i - 1));
    }
  };

  const current = candles.length ? candles[index] : null;
  const progress = candles.length ? ((index + 1) / candles.length) * 100 : 0;

  const chartData = useMemo(() => {
    if (!candles.length) return { labels: [], datasets: [] };
    const visible = candles.slice(0, index + 1);
    return {
      labels: visible.map((c) => c.datetime.slice(11, 19)),
      datasets: [
        {
          label: symbol,
          data: visible.map((c) => c.close),
          borderColor: ac.hex,
          backgroundColor: ac.hex + "1a",
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.2,
          fill: false,
        },
      ],
    };
  }, [candles, index, symbol, ac.hex]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: "index",
        intersect: false,
        callbacks: {
          label: (c) => "$" + c.parsed.y.toFixed(2),
        },
      },
    },
    scales: {
      x: { display: false },
      y: {
        grid: {
          color: isDark
            ? "rgba(148,163,184,0.12)"
            : "rgba(100,116,139,0.15)",
        },
        ticks: {
          color: isDark ? "#8a8fb5" : "#6b7090",
          callback: (v) => "$" + v,
        },
      },
    },
  };

  const journalTrade = () => {
    if (!current) return;
    if (!journalNote.trim()) {
      setMessage({ text: "Add a note before journaling.", type: "warn" });
      return;
    }
    setMessage({
      text:
        "Journaled " +
        symbol +
        " @ $" +
        current.close.toFixed(2) +
        " \u2014 " +
        journalNote,
      type: "success",
    });
    setJournalOpen(false);
    setJournalNote("");
    setTimeout(() => setMessage({ text: "", type: "info" }), 4000);
  };

  const formatTime = (iso) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour12: false });
    } catch {
      return "\u2014";
    }
  };

  if (!currentAccount) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f5fa] p-8 dark:bg-[#0b0b19]">
        <Card className={CARD + " max-w-md p-8 text-center"}>
          <Monitor size={40} className="mx-auto mb-4 text-amber-500" />
          <h2 className={"mb-2 text-xl font-bold " + HEAD}>
            No account selected
          </h2>
          <p className={"text-sm " + MUTED}>
            Please create or select an account from the sidebar to use Replay.
          </p>
        </Card>
      </div>
    );
  }

  const closeTone =
    current && current.close >= current.open ? POS_T : NEG_T;

  return (
    <div className="min-h-screen w-full bg-[#f4f5fa] p-3 text-[#14142b] dark:bg-[#0b0b19] dark:text-[#e8e9f7] sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1400px]">
        {/* Header */}
        <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <h1 className={"text-2xl font-bold tracking-tight sm:text-3xl " + HEAD}>
              Replay
            </h1>
            <p className={"mt-1 text-sm " + MUTED}>
              Step through 1-second candles and journal the trades you would take.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AccentPicker accent={accent} setAccent={setAccent} className="mr-1" />
            <div>
              <label className={"mb-1 block text-[11px] font-semibold uppercase tracking-wide " + MUTED}>
                Symbol
              </label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className={FIELD}
              >
                <option value="UK100">UK100</option>
                <option value="NAS100">NAS100</option>
                <option value="JAP225">JAP225</option>
              </select>
            </div>
          </div>
        </div>

        {message.text && (
          <div
            role={message.type === "warn" ? "alert" : "status"}
            className={
              "mb-4 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium " +
              (message.type === "success"
                ? "border-[#22c493]/30 bg-[#22c493]/10 text-[#0e9f77] dark:text-[#2dd4a0]"
                : "border-[#f2556e]/30 bg-[#f2556e]/10 text-[#d93a57] dark:text-[#ff6b86]")
            }
          >
            {message.type === "success" ? <Plus size={16} /> : <Clock size={16} />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Chart */}
        <Card className={CARD + " mb-4 h-[400px] lg:h-[520px] p-0 overflow-hidden"}>
          <div className="h-[360px] lg:h-[460px]">
            {candles.length ? (
              <Line data={chartData} options={chartOptions} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className={"text-sm " + MUTED}>Loading price data…</p>
              </div>
            )}
          </div>
          {/* Playhead position bar */}
          <div className="h-2 bg-[#e6e8f2] dark:bg-[#262645] relative overflow-hidden">
            <div
              className="h-full"
              style={{
                width: Math.min(100, progress) + "%",
                backgroundColor: isPlaying ? "#22c493" : ac.hex,
                transition: "width 0.2s linear",
              }}
            />
            <div
              className="absolute h-2 w-2 -top-1 rounded-full border-2 border-white dark:border-[#0b0b19]"
              style={{
                left: Math.min(100, progress) + "%",
                transform: "translateX(-50%)",
                backgroundColor: isPlaying ? "#22c493" : ac.hex,
              }}
            />
          </div>
        </Card>

        {/* Controls */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
          {/* Candle info */}
          <div className="sm:col-span-4">
            <Card className={CARD + " p-4"}>
              <div className={"text-[11px] font-medium uppercase tracking-wide " + MUTED}>
                Current candle
              </div>
              <div className="mt-2 space-y-2">
                {current ? (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className={MUTED}>Time</span>
                      <span className="HEAD tabular-nums">{formatTime(current.datetime)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className={MUTED}>Open</span>
                      <span className="HEAD tabular-nums">${current.open.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className={MUTED}>High</span>
                      <span className="HEAD tabular-nums">${current.high.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className={MUTED}>Low</span>
                      <span className="HEAD tabular-nums">${current.low.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className={MUTED}>Close</span>
                      <span className={"HEAD tabular-nums " + closeTone}>
                        ${current.close.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className={MUTED}>Position</span>
                      <span className="HEAD tabular-nums">{index + 1} / {candles.length}</span>
                    </div>
                  </>
                ) : (
                  <p className={"text-sm " + MUTED}>No data</p>
                )}
              </div>
            </Card>
          </div>

          {/* Playback controls */}
          <div className="sm:col-span-6 lg:col-span-8">
            <Card className={CARD + " p-4"}>
              <div className="flex items-center justify-between mb-3">
                <span className={"text-[11px] font-medium uppercase tracking-wide " + MUTED}>
                  Playback
                </span>
                <span className={"text-xs font-medium " + MUTED}>
                  {isPlaying ? "Playing" : "Paused"} · {speed}x
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setIndex(0)}
                  disabled={index === 0 || isPlaying}
                  variant="outline"
                  className={"border font-semibold " + DIVIDER}
                >
                  <SkipBack size={16} className="mr-2" /> Reset
                </Button>
                <Button
                  onClick={() => setIsPlaying((p) => !p)}
                  style={{ backgroundColor: ac.hex }}
                  className="font-semibold text-white hover:brightness-110"
                >
                  {isPlaying ? (
                    <>
                      <Pause size={18} className="mr-2" /> Pause
                    </>
                  ) : (
                    <>
                      <Play size={18} className="mr-2" /> Play
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => setIndex((i) => Math.min(candles.length - 1, i + 1))}
                  disabled={index >= candles.length - 1 || isPlaying}
                  variant="outline"
                  className={"border font-semibold " + DIVIDER}
                >
                  <SkipForward size={16} className="mr-2" /> Next candle
                </Button>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <span className={"text-xs " + MUTED}>Speed</span>
                <select
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className={FIELD}
                >
                  {SPEEDS.map((s) => (
                    <option key={s} value={s}>{s}x</option>
                  ))}
                </select>
                <span className={"ml-auto text-[10px] " + MUTED}>
                  Spacebar · ← → step
                </span>
              </div>
            </Card>
          </div>

          {/* Journal this moment */}
          <div className="sm:col-span-2">
            <Card className={CARD + " p-4 h-full"}>
              <div className={"text-[11px] font-medium uppercase tracking-wide " + MUTED}>
                Journal this moment
              </div>
              <div className="mt-3">
                <textarea
                  value={journalNote}
                  onChange={(e) => setJournalNote(e.target.value)}
                  placeholder="What would you do here?"
                  rows={3}
                  className={FIELD + " min-h-[60px] resize-y"}
                />
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className={MUTED}>Entry price</span>
                  <span className="HEAD tabular-nums">
                    {current ? "$" + current.close.toFixed(2) : "\u2014"}
                  </span>
                </div>
                <Button
                  onClick={journalTrade}
                  disabled={!current || !journalNote.trim() || journalOpen}
                  style={{ backgroundColor: ac.hex }}
                  className="w-full font-semibold text-white hover:brightness-110 disabled:opacity-50"
                >
                  {journalOpen ? "Journaled" : "Journal trade"}
                </Button>
                {journalOpen && (
                  <p className={"mt-2 text-[11px] " + MUTED}>
                    Observation recorded. Open Trades to log it formally.
                  </p>
                )}
              </div>
            </Card>
          </div>
        </div>

        <p className={"mt-4 text-center text-xs " + MUTED}>
          Deterministic seeded price data — change the symbol to get a new random walk.
        </p>
      </div>
    </div>
  );
}
