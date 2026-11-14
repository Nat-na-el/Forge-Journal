// src/pages/Playbooks.jsx
// Playbooks: one trading setup per record - its mark, its rules and every
// trade that belongs to it. The page is intentionally dark, like the trade
// log, so the reference layout keeps its contrast.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import demoDashboardTrades from "../lib/demoDashboardData";
import { money, pct, ratio, tradeDate, tradeStats } from "../lib/analytics";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  Compass,
  Copy,
  Crosshair,
  Flag,
  Gauge,
  Layers,
  LineChart,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  Share2,
  Shield,
  Target,
  Trash2,
  TrendingUp,
  Wallet,
  X,
  Zap,
} from "lucide-react";

// --- Palette ---------------------------------------------------------------
const BG = "#0a0a10";
const TEXT = "#eef0f8";
const ACCENT = "#6C47FF";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9d86ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a10]";

const FIELD = `w-full rounded-md border border-[#262636] bg-[#10101a] px-3 py-2 text-[13px] text-[#e8e8f4] placeholder:text-[#5f5f78] outline-none transition-colors focus:border-[#6C47FF] focus:ring-1 focus:ring-[#6C47FF] ${FOCUS}`;
const LABEL = "mb-1.5 block text-[11.5px] font-semibold text-[#b9b9cf]";
const GHOST =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-[#2a2a3c] bg-transparent px-3 py-2 text-[12px] font-semibold text-[#c9c9dc] transition-colors hover:bg-white/5 hover:text-white";
const PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-[#6C47FF] px-3.5 py-2 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";

// --- Icons and colours -----------------------------------------------------
const ICON_OPTIONS = [
  { key: "target", label: "Target", Icon: Target },
  { key: "trend", label: "Trend", Icon: TrendingUp },
  { key: "bolt", label: "Impulse", Icon: Zap },
  { key: "compass", label: "Compass", Icon: Compass },
  { key: "shield", label: "Shield", Icon: Shield },
  { key: "clock", label: "Timing", Icon: Clock },
  { key: "crosshair", label: "Precision", Icon: Crosshair },
  { key: "gauge", label: "Momentum", Icon: Gauge },
  { key: "flag", label: "Milestone", Icon: Flag },
  { key: "layers", label: "Stack", Icon: Layers },
  { key: "chart", label: "Chart", Icon: LineChart },
  { key: "book", label: "Book", Icon: BookOpen },
];

const iconFor = (key) =>
  (ICON_OPTIONS.find((option) => option.key === key) || ICON_OPTIONS[0]).Icon;

const COLOURS = [
  { key: "violet", hex: "#6C47FF" },
  { key: "blue", hex: "#3B82F6" },
  { key: "teal", hex: "#14B8A6" },
  { key: "green", hex: "#22C55E" },
  { key: "amber", hex: "#F59E0B" },
  { key: "rose", hex: "#F43F5E" },
  { key: "pink", hex: "#EC4899" },
  { key: "slate", hex: "#64748B" },
];

const colourOf = (playbook) => playbook?.color || ACCENT;

// --- Static lists ----------------------------------------------------------
const MARKETS = ["Forex", "Indices", "Crypto", "Futures", "Stocks", "Commodities"];
const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "Daily", "Weekly"];

const TABS = [
  { key: "mine", label: "My playbook" },
  { key: "shared", label: "Shared playbook" },
  { key: "templates", label: "Templates" },
];

const RANGE_PRESETS = [
  { key: "this-month", label: "This month" },
  { key: "last-30", label: "Last 30 days" },
  { key: "last-90", label: "Last 90 days" },
  { key: "all", label: "All time" },
];

const TEMPLATES = [
  {
    id: "session-breakout",
    name: "Session breakout",
    tagline: "Take the first clean break of the opening range, then stand aside.",
    market: "Indices",
    timeframe: "15m",
    riskPerTrade: 0.5,
    entryCriteria:
      "Mark the opening range during the first 30 minutes. Enter on a close outside the range and a retest that holds, with volume above the 20-period average.",
    exitCriteria:
      "Stop on the far side of the range. Take the first target at one range width and trail the rest under the 9 EMA.",
    rules: [
      "Opening range is marked before any entry",
      "No trade in the first five minutes",
      "Volume expands on the break",
      "One attempt per side per session",
      "Flat before the close",
    ],
    color: "#6C47FF",
    icon: "bolt",
  },
  {
    id: "trend-pullback",
    name: "Trend pullback",
    tagline: "Wait for the pullback into value, then join the trend.",
    market: "Forex",
    timeframe: "1h",
    riskPerTrade: 1,
    entryCriteria:
      "Price holds above the 50 EMA on the 1h chart and pulls back into the 20 EMA. Enter on the first higher low that closes above it.",
    exitCriteria:
      "Stop below the swing low that started the pullback. Take half at the prior high and trail the remainder.",
    rules: [
      "Higher-timeframe trend agrees",
      "Pullback holds the 20 EMA on a close",
      "Risk fixed at 1%",
      "No entry into a fresh news candle",
      "Move the stop to breakeven at 1R",
    ],
    color: "#3B82F6",
    icon: "trend",
  },
  {
    id: "range-fade",
    name: "Range fade",
    tagline: "Sell the edge, buy the edge, leave the middle alone.",
    market: "Indices",
    timeframe: "5m",
    riskPerTrade: 0.25,
    entryCriteria:
      "A range confirmed by at least two touches on each side. Enter on a rejection wick at the edge with momentum divergence.",
    exitCriteria:
      "Stop beyond the rejection wick. Target the middle of the range first, then the far edge.",
    rules: [
      "Range is at least 40 points wide",
      "No trades in the middle third",
      "Rejection wick required at the edge",
      "Skip the range if a data release is due",
      "Two losses and the session is done",
    ],
    color: "#F59E0B",
    icon: "gauge",
  },
  {
    id: "catalyst-day",
    name: "Catalyst day",
    tagline: "Trade the reaction after a release, never the release itself.",
    market: "Stocks",
    timeframe: "5m",
    riskPerTrade: 0.5,
    entryCriteria:
      "Wait for the first five minutes after the release. Enter only if the spike is reclaimed in the direction of the prior trend.",
    exitCriteria:
      "Stop beyond the spike low. Target the pre-release level when momentum fades.",
    rules: [
      "Event time is on the calendar the day before",
      "No position before the release",
      "Wait for the first five minutes",
      "Size at half of normal",
      "Stop for the day after one loss",
    ],
    color: "#F43F5E",
    icon: "flag",
  },
];

// --- Form helpers ----------------------------------------------------------
const blankDraft = () => ({
  name: "",
  description: "",
  market: "",
  timeframe: "",
  riskPerTrade: "",
  entryCriteria: "",
  exitCriteria: "",
  rules: [],
  color: ACCENT,
  icon: "target",
  shared: false,
});

const draftFrom = (source) => ({
  ...blankDraft(),
  ...source,
  rules: Array.isArray(source?.rules) ? [...source.rules] : [],
  riskPerTrade: source?.riskPerTrade ?? "",
  color: source?.color || ACCENT,
  icon: source?.icon || "target",
});

// A trade belongs to a playbook by id. Trades logged before playbooks existed
// fall back to a name match against the free-text strategy, so old data counts.
function collectTrades(playbook, trades) {
  const name = (playbook.name || "").trim().toLowerCase();
  return trades.filter((trade) => {
    if (trade.playbookId) return trade.playbookId === playbook.id;
    return !!name && (trade.strategy || "").trim().toLowerCase() === name;
  });
}

// --- Dates -----------------------------------------------------------------
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDay = (date) =>
  `${MONTHS[date.getMonth()]} ${String(date.getDate()).padStart(2, "0")}, ${date.getFullYear()}`;

function rangeFor(key) {
  const now = new Date();
  if (key === "all") return { key, start: null, end: null, label: "All time" };
  if (key === "last-30" || key === "last-90") {
    const days = key === "last-30" ? 30 : 90;
    const start = new Date(now);
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);
    return { key, start, end: null, label: `${fmtDay(start)}-${fmtDay(now)}` };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { key, start, end, label: `${fmtDay(start)}-${fmtDay(end)}` };
}

function inRange(trade, range) {
  const date = tradeDate(trade);
  if (!date) return !range.start && !range.end;
  if (range.start && date < range.start) return false;
  if (range.end) {
    const last = new Date(range.end);
    last.setHours(23, 59, 59, 999);
    if (date > last) return false;
  }
  return true;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(field);
      return ok;
    } catch {
      return false;
    }
  }
}

function planText(playbook) {
  const lines = [playbook.name, playbook.description || ""];
  lines.push("");
  if (playbook.market) lines.push(`Market: ${playbook.market}`);
  if (playbook.timeframe) lines.push(`Timeframe: ${playbook.timeframe}`);
  if (playbook.riskPerTrade !== "" && playbook.riskPerTrade != null) {
    lines.push(`Risk per trade: ${playbook.riskPerTrade}%`);
  }
  if (playbook.entryCriteria) lines.push("", `Entry: ${playbook.entryCriteria}`);
  if (playbook.exitCriteria) lines.push("", `Exit: ${playbook.exitCriteria}`);
  if (playbook.rules?.length) {
    lines.push("", "Rules:");
    playbook.rules.forEach((rule, index) => lines.push(`${index + 1}. ${rule}`));
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

// --- Small primitives ------------------------------------------------------
function Popover({ trigger, children, width = "w-60", align = "right" }) {
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

  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((value) => !value) })}
      {open ? (
        <div
          role="menu"
          className={`absolute top-[calc(100%+6px)] z-50 ${width} ${
            align === "right" ? "right-0" : "left-0"
          } overflow-hidden rounded-lg border border-[#2a2a3c] bg-[#14141f] p-1.5 shadow-2xl shadow-black/60`}
        >
          {children({ close: () => setOpen(false) })}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({ icon: Icon, children, onClick, active = false, tone = "" }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12.5px] font-medium transition-colors ${FOCUS} ${
        tone === "danger"
          ? "text-[#fb7185] hover:bg-[#fb7185]/10"
          : "text-[#c9c9dc] hover:bg-white/5 hover:text-white"
      } ${active ? "bg-white/[0.06] text-white" : ""}`}
    >
      {Icon ? <Icon size={14} className="shrink-0 opacity-80" /> : null}
      <span className="min-w-0 truncate">{children}</span>
      {active ? <Check size={13} className="ml-auto shrink-0 text-[#a48fff]" /> : null}
    </button>
  );
}

function StepBar({ filled, step }) {
  return (
    <div
      className="h-[3px] w-full overflow-hidden rounded-full"
      style={{ backgroundColor: filled ? ACCENT : "#2c2c3e" }}
      role="progressbar"
      aria-label={`Step ${step} of 2`}
      aria-valuemin={0}
      aria-valuemax={2}
      aria-valuenow={filled ? 2 : step - 1}
    />
  );
}

function Chip({ children, tone = "muted" }) {
  const styles =
    tone === "accent"
      ? "border-[#6C47FF]/40 bg-[#6C47FF]/15 text-[#c3b5ff]"
      : "border-[#2a2a3c] bg-[#161622] text-[#a4a6bd]";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px] font-medium ${styles}`}
    >
      {children}
    </span>
  );
}

function EmptyArt() {
  return (
    <svg
      viewBox="0 0 190 150"
      className="mx-auto h-[130px] w-auto"
      role="img"
      aria-label="An empty playbook page with a new entry badge"
    >
      <rect x="48" y="22" width="78" height="102" rx="9" fill="#16161f" stroke="#34344a" />
      <rect x="61" y="40" width="44" height="6" rx="3" fill="#8f7bff" />
      <rect x="61" y="56" width="52" height="4" rx="2" fill="#31314a" />
      <rect x="61" y="66" width="46" height="4" rx="2" fill="#31314a" />
      <rect x="61" y="76" width="50" height="4" rx="2" fill="#31314a" />
      <rect x="61" y="92" width="28" height="4" rx="2" fill="#2a2a40" />
      <rect x="61" y="106" width="36" height="4" rx="2" fill="#2a2a40" />
      <circle cx="124" cy="42" r="17" fill="#6C47FF" />
      <path d="M124 33v18M115 42h18" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
      <rect x="52" y="132" width="70" height="3" rx="1.5" fill="#23233a" />
      <circle cx="146" cy="118" r="5" fill="#23233a" />
    </svg>
  );
}

function EmptyState({ onCreate, onExplain, explainOpen }) {
  return (
    <div className="flex min-h-[calc(100vh-16rem)] flex-col items-center justify-center px-4 py-12 text-center">
      <EmptyArt />
      <h2 className="mt-4 text-[22px] font-bold tracking-tight text-white sm:text-[26px]">
        Create your first playbook
      </h2>
      <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-[#8f8fa6]">
        Write down the setup you repeat, then track how it actually performs.
      </p>
      <button
        type="button"
        onClick={onExplain}
        aria-expanded={explainOpen}
        className={`mt-3 rounded text-[12.5px] font-medium text-[#a48fff] underline-offset-4 hover:text-white hover:underline ${FOCUS}`}
      >
        {explainOpen ? "Hide how playbooks work" : "See how playbooks work"}
      </button>

      {explainOpen ? (
        <div className="mt-5 grid w-full max-w-3xl gap-3 text-left sm:grid-cols-3">
          {[
            ["One setup per record", "Each playbook holds one repeatable idea, so its numbers are never mixed with another."],
            ["Rules you can audit", "List what must be true before you enter, and check yourself against it later."],
            ["Stats that follow", "Tag a trade with a playbook and its win rate, profit factor and net P&L update here."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-lg border border-[#232332] bg-[#101019] p-3.5">
              <div className="text-[12.5px] font-semibold text-white">{title}</div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-[#8f8fa6]">{body}</p>
            </div>
          ))}
        </div>
      ) : null}

      <button type="button" onClick={onCreate} className={`mt-7 ${PRIMARY}`}>
        <Plus size={15} /> Create playbook
      </button>
    </div>
  );
}

function SharedEmpty({ hasPlaybooks, onGoMine, onExplain, explainOpen }) {
  return (
    <div className="flex min-h-[calc(100vh-16rem)] flex-col items-center justify-center px-4 py-12 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#2a2a3c] bg-[#13131d]">
        <Share2 size={26} className="text-[#a48fff]" />
      </span>
      <h2 className="mt-4 text-[21px] font-bold tracking-tight text-white">Nothing shared yet</h2>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-[#8f8fa6]">
        {hasPlaybooks
          ? "Open a playbook and switch on Share to keep your published plans together here."
          : "Create a playbook first, then share it to keep the published version in one place."}
      </p>
      <button
        type="button"
        onClick={onExplain}
        aria-expanded={explainOpen}
        className={`mt-3 rounded text-[12.5px] font-medium text-[#a48fff] underline-offset-4 hover:text-white hover:underline ${FOCUS}`}
      >
        {explainOpen ? "Hide what sharing does" : "What does sharing do?"}
      </button>
      {explainOpen ? (
        <p className="mt-4 max-w-lg rounded-lg border border-[#232332] bg-[#101019] px-4 py-3 text-[12px] leading-relaxed text-[#a4a6bd]">
          Sharing marks a playbook as published and moves it onto this tab. It does not change the rules or the
          stats, and you can stop sharing at any time. Copy plan puts the whole plan on your clipboard so you can
          paste it wherever you coach.
        </p>
      ) : null}
      <button type="button" onClick={onGoMine} className={`mt-6 ${GHOST}`}>
        Go to my playbooks
      </button>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div key={index} className="rounded-xl border border-[#1c1c28] bg-[#101019] p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-lg bg-[#1c1c2a]" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-2/3 animate-pulse rounded bg-[#1c1c2a]" />
              <div className="h-2.5 w-1/3 animate-pulse rounded bg-[#191926]" />
            </div>
          </div>
          <div className="mt-4 h-2.5 w-full animate-pulse rounded bg-[#191926]" />
          <div className="mt-2 h-2.5 w-4/5 animate-pulse rounded bg-[#191926]" />
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[0, 1, 2].map((cell) => (
              <div key={cell} className="h-12 animate-pulse rounded-md bg-[#15151f]" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PageHeader({ rangeKey, rangeLabel, onRangeChange, accountName, onManageAccounts, currentAccount }) {
  return (
    <div className="-mx-3 flex flex-col justify-between gap-3 border-b border-[#1c1c28] px-3 py-4 sm:-mx-6 sm:px-6 lg:flex-row lg:items-center">
      <h1 className="text-[21px] font-bold tracking-tight text-white sm:text-[22px]">Playbook</h1>

      <div className="flex flex-wrap items-center gap-2">
        <Popover
          width="w-56"
          trigger={({ toggle }) => (
            <button
              type="button"
              onClick={toggle}
              aria-label={`Date range ${rangeLabel}`}
              className={`flex h-8 items-center gap-1.5 rounded-md border border-[#2a2a3c] bg-[#11111a] px-2.5 text-[11.5px] font-medium tabular-nums text-[#b9b9cf] transition-colors hover:bg-[#1a1a27] ${FOCUS}`}
            >
              <CalendarDays size={13} className="text-[#9d86ff]" />
              {rangeLabel}
              <ChevronDown size={12} className="opacity-60" />
            </button>
          )}
        >
          {({ close }) => (
            <>
              <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#6f6f87]">
                Stats range
              </div>
              {RANGE_PRESETS.map((preset) => (
                <MenuItem
                  key={preset.key}
                  active={preset.key === rangeKey}
                  icon={preset.key === rangeKey ? Check : undefined}
                  onClick={() => {
                    onRangeChange(preset.key);
                    close();
                  }}
                >
                  {preset.label}
                </MenuItem>
              ))}
            </>
          )}
        </Popover>

        <Popover
          width="w-64"
          trigger={({ toggle }) => (
            <button
              type="button"
              onClick={toggle}
              aria-label="Account filter"
              className={`flex h-8 items-center gap-1.5 rounded-md border border-[#2a2a3c] bg-[#11111a] px-2.5 text-[11.5px] font-medium text-[#b9b9cf] transition-colors hover:bg-[#1a1a27] ${FOCUS}`}
            >
              <Wallet size={13} className="text-[#9d86ff]" />
              <span className="max-w-[130px] truncate">{accountName}</span>
              <ChevronDown size={12} className="opacity-60" />
            </button>
          )}
        >
          {({ close }) => (
            <>
              <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#6f6f87]">
                Account
              </div>
              <MenuItem icon={Check} active onClick={close}>
                {accountName}
              </MenuItem>
              {currentAccount?.current_balance != null || currentAccount?.starting_balance != null ? (
                <div className="px-2.5 pb-1.5 text-[11px] tabular-nums text-[#74748c]">
                  {money(currentAccount.current_balance ?? currentAccount.starting_balance, false)} balance
                </div>
              ) : null}
              <div className="my-1.5 border-t border-[#2a2a3c]" />
              <MenuItem icon={Plus} onClick={() => { close(); onManageAccounts(); }}>
                Manage accounts
              </MenuItem>
            </>
          )}
        </Popover>
      </div>
    </div>
  );
}

function TabsBar({ tab, onChange, sharedCount, onCreate, showCreate }) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-3.5" role="tablist" aria-label="Playbook views">
      {TABS.map((entry) => {
        const active = tab === entry.key;
        return (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(entry.key)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${FOCUS} ${
              active
                ? "bg-[#6C47FF] text-white"
                : "border border-[#242432] bg-[#11111a] text-[#b9b9cf] hover:bg-[#191924] hover:text-white"
            }`}
          >
            {entry.label}
            {entry.key === "shared" && sharedCount > 0 ? (
              <span
                className={`rounded px-1 text-[10px] font-bold tabular-nums ${
                  active ? "bg-white/20 text-white" : "bg-[#1e1e2c] text-[#a48fff]"
                }`}
              >
                {sharedCount}
              </span>
            ) : null}
          </button>
        );
      })}
      {tab === "mine" && showCreate ? (
        <button
          type="button"
          onClick={onCreate}
          className={`w-full sm:ml-auto sm:w-auto ${PRIMARY}`}
        >
          <Plus size={14} /> Create playbook
        </button>
      ) : null}
    </div>
  );
}

function PlaybookCard({ item, onOpen, onEdit, onShare, onDelete, onCopy }) {
  const { playbook, stats } = item;
  const Icon = iconFor(playbook.icon);
  const colour = colourOf(playbook);

  return (
    <article className="flex flex-col rounded-xl border border-[#21212f] bg-[#101019] p-4 transition-colors hover:border-[#34344d]">
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: colour }}
          aria-hidden="true"
        >
          <Icon size={18} />
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-semibold text-white">{playbook.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {playbook.market ? <Chip>{playbook.market}</Chip> : null}
            {playbook.timeframe ? <Chip>{playbook.timeframe}</Chip> : null}
            {playbook.rules?.length ? <Chip>{playbook.rules.length} rules</Chip> : null}
            {playbook.shared ? (
              <Chip tone="accent">
                <Share2 size={10} /> Shared
              </Chip>
            ) : null}
          </div>
        </div>

        <Popover
          width="w-48"
          trigger={({ toggle }) => (
            <button
              type="button"
              onClick={toggle}
              aria-label={`Actions for ${playbook.name}`}
              className={`-mr-1 -mt-1 rounded-md p-1.5 text-[#74748c] transition-colors hover:bg-white/5 hover:text-white ${FOCUS}`}
            >
              <span className="block leading-none">&#8942;</span>
            </button>
          )}
        >
          {({ close }) => (
            <>
              <MenuItem
                icon={Pencil}
                onClick={() => {
                  close();
                  onEdit(playbook);
                }}
              >
                Edit playbook
              </MenuItem>
              <MenuItem
                icon={Share2}
                onClick={() => {
                  close();
                  onShare(playbook);
                }}
              >
                {playbook.shared ? "Stop sharing" : "Share playbook"}
              </MenuItem>
              <MenuItem
                icon={Copy}
                onClick={() => {
                  close();
                  onCopy(playbook);
                }}
              >
                Copy plan
              </MenuItem>
              <div className="my-1.5 border-t border-[#2a2a3c]" />
              <MenuItem
                tone="danger"
                icon={Trash2}
                onClick={() => {
                  close();
                  onDelete(playbook);
                }}
              >
                Delete playbook
              </MenuItem>
            </>
          )}
        </Popover>
      </div>

      {playbook.description ? (
        <p className="mt-3 line-clamp-2 text-[11.5px] leading-relaxed text-[#8f8fa6]">{playbook.description}</p>
      ) : (
        <p className="mt-3 text-[11.5px] italic leading-relaxed text-[#5f5f78]">No description yet.</p>
      )}

      <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-[#21212f] bg-[#21212f]">
        <div className="bg-[#0d0d15] px-2.5 py-2">
          <div className="text-[10px] font-medium text-[#74748c]">Trades</div>
          <div className="text-[13px] font-bold tabular-nums text-white">{stats.count}</div>
        </div>
        <div className="bg-[#0d0d15] px-2.5 py-2">
          <div className="text-[10px] font-medium text-[#74748c]">Win rate</div>
          <div className="text-[13px] font-bold tabular-nums text-white">{pct(stats.winRate)}</div>
        </div>
        <div className="bg-[#0d0d15] px-2.5 py-2">
          <div className="text-[10px] font-medium text-[#74748c]">Net</div>
          <div className={`text-[13px] font-bold tabular-nums ${stats.net >= 0 ? "text-[#34d399]" : "text-[#fb7185]"}`}>
            {money(stats.net)}
          </div>
        </div>
      </div>

      <div className="mt-auto pt-3.5">
        <button type="button" onClick={() => onOpen(playbook)} className={`w-full ${GHOST}`}>
          Open
        </button>
      </div>
    </article>
  );
}

function Breadcrumb({ current, onRoot }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 py-1 text-[12px]">
      <button
        type="button"
        onClick={onRoot}
        className={`rounded text-[#7c7c95] transition-colors hover:text-white ${FOCUS}`}
      >
        Playbook
      </button>
      <span className="text-[#4b4b60]" aria-hidden="true">
        /
      </span>
      <span className="truncate font-medium text-[#d6d6e4]">{current}</span>
    </nav>
  );
}

function TemplateTab({ onUse }) {
  return (
    <div>
      <p className="mb-4 max-w-2xl text-[12.5px] leading-relaxed text-[#8f8fa6]">
        Start from an outline and make it yours. A template opens in the editor with the market, risk and rules
        already filled in - nothing is saved until you press Create.
      </p>
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
        {TEMPLATES.map((template) => {
          const Icon = iconFor(template.icon);
          return (
            <article
              key={template.id}
              className="flex flex-col rounded-xl border border-[#21212f] bg-[#101019] p-4 transition-colors hover:border-[#34344d]"
            >
              <div className="flex items-start gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
                  style={{ backgroundColor: template.color }}
                  aria-hidden="true"
                >
                  <Icon size={18} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[14px] font-semibold text-white">{template.name}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Chip>{template.market}</Chip>
                    <Chip>{template.timeframe}</Chip>
                    <Chip>{template.riskPerTrade}% risk</Chip>
                  </div>
                </div>
              </div>

              <p className="mt-3 text-[11.5px] leading-relaxed text-[#8f8fa6]">{template.tagline}</p>

              <ul className="mt-3 space-y-1">
                {template.rules.slice(0, 3).map((rule, index) => (
                  <li key={index} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[#a4a6bd]">
                    <Check size={11} className="mt-0.5 shrink-0 text-[#6C47FF]" />
                    <span className="line-clamp-1">{rule}</span>
                  </li>
                ))}
                {template.rules.length > 3 ? (
                  <li className="pl-4 text-[10.5px] text-[#5f5f78]">
                    +{template.rules.length - 3} more rules
                  </li>
                ) : null}
              </ul>

              <div className="mt-auto pt-3.5">
                <button type="button" onClick={() => onUse(template)} className={`w-full ${GHOST}`}>
                  Use template
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function PlaybookWizard({ mode, initial, saving, error, onCancel, onSave }) {
  const [step, setStep] = useState(1);
  const [values, setValues] = useState(initial);
  const [ruleInput, setRuleInput] = useState("");
  const [nameError, setNameError] = useState("");
  const nameRef = useRef(null);

  const Icon = iconFor(values.icon);
  const colour = values.color || ACCENT;

  const set = (patch) => setValues((value) => ({ ...value, ...patch }));

  const next = () => {
    if (!values.name.trim()) {
      setNameError("Give the playbook a name before you continue.");
      if (nameRef.current) nameRef.current.focus();
      return;
    }
    setNameError("");
    setStep(2);
  };

  const addRule = () => {
    const rule = ruleInput.trim();
    if (!rule) return;
    if (values.rules.some((existing) => existing.toLowerCase() === rule.toLowerCase())) {
      setRuleInput("");
      return;
    }
    set({ rules: [...values.rules, rule] });
    setRuleInput("");
  };

  const removeRule = (index) => set({ rules: values.rules.filter((_, i) => i !== index) });

  const submit = (event) => {
    event.preventDefault();
    if (!values.name.trim()) {
      setStep(1);
      setNameError("Give the playbook a name before you save.");
      return;
    }
    onSave({
      name: values.name.trim(),
      description: values.description.trim(),
      market: values.market,
      timeframe: values.timeframe,
      entryCriteria: values.entryCriteria.trim(),
      exitCriteria: values.exitCriteria.trim(),
      riskPerTrade: values.riskPerTrade === "" ? "" : Number(values.riskPerTrade),
      rules: values.rules.map((rule) => rule.trim()).filter(Boolean),
      color: values.color,
      icon: values.icon,
      shared: !!values.shared,
    });
  };

  const stepOne = step === 1;

  return (
    <div className="mx-auto w-full max-w-[920px] pb-16">
      <form onSubmit={submit} className="overflow-hidden rounded-xl border border-[#232332] bg-[#0e0e16] shadow-2xl shadow-black/40">
        <div className="grid gap-x-8 gap-y-9 px-5 pb-8 pt-7 sm:px-8 md:grid-cols-2">
          {/* General information */}
          <section className="min-w-0" aria-labelledby="wizard-general">
            <StepBar filled={!stepOne || mode === "edit"} step={1} />
            <h2 id="wizard-general" className="mt-3 text-[15px] font-semibold text-white">
              General information
            </h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-[#8f8fa6]">
              Pick a mark and a colour, then name the setup in your own words.
            </p>

            {stepOne ? (
              <div className="mt-5 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Popover
                    width="w-64"
                    align="left"
                    trigger={({ toggle }) => (
                      <button
                        type="button"
                        onClick={toggle}
                        aria-haspopup="menu"
                        className={`flex items-center gap-2 rounded-md border border-[#2a2a3c] bg-[#11111a] px-2.5 py-2 text-[12px] font-semibold text-[#d6d6e4] transition-colors hover:bg-[#1a1a27] ${FOCUS}`}
                      >
                        <span
                          className="flex h-6 w-6 items-center justify-center rounded text-white"
                          style={{ backgroundColor: colour }}
                          aria-hidden="true"
                        >
                          <Icon size={13} />
                        </span>
                        Add icon
                        <ChevronDown size={12} className="opacity-60" />
                      </button>
                    )}
                  >
                    {({ close }) => (
                      <div>
                        <div className="px-1.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#6f6f87]">
                          Icon
                        </div>
                        <div className="grid grid-cols-6 gap-1">
                          {ICON_OPTIONS.map((option) => (
                            <button
                              key={option.key}
                              type="button"
                              aria-label={option.label}
                              aria-pressed={values.icon === option.key}
                              onClick={() => {
                                set({ icon: option.key });
                                close();
                              }}
                              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${FOCUS} ${
                                values.icon === option.key
                                  ? "bg-[#6C47FF] text-white"
                                  : "text-[#a4a6bd] hover:bg-white/5 hover:text-white"
                              }`}
                            >
                              <option.Icon size={15} />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </Popover>

                  <Popover
                    width="w-56"
                    align="left"
                    trigger={({ toggle }) => (
                      <button
                        type="button"
                        onClick={toggle}
                        aria-haspopup="menu"
                        className={`flex items-center gap-2 rounded-md border border-[#2a2a3c] bg-[#11111a] px-2.5 py-2 text-[12px] font-semibold text-[#d6d6e4] transition-colors hover:bg-[#1a1a27] ${FOCUS}`}
                      >
                        <span
                          className="h-5 w-5 rounded border border-white/20"
                          style={{ backgroundColor: colour }}
                          aria-hidden="true"
                        />
                        Choose a color
                        <ChevronDown size={12} className="opacity-60" />
                      </button>
                    )}
                  >
                    {({ close }) => (
                      <div>
                        <div className="px-1.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#6f6f87]">
                          Color
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {COLOURS.map((entry) => (
                            <button
                              key={entry.key}
                              type="button"
                              aria-label={entry.key}
                              aria-pressed={colour === entry.hex}
                              onClick={() => {
                                set({ color: entry.hex });
                                close();
                              }}
                              className={`flex h-9 items-center justify-center rounded-md border transition-transform hover:scale-105 ${FOCUS} ${
                                colour === entry.hex ? "border-white" : "border-transparent"
                              }`}
                              style={{ backgroundColor: entry.hex }}
                            >
                              {colour === entry.hex ? <Check size={14} className="text-white" /> : null}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </Popover>
                </div>

                <p className="text-[11px] leading-relaxed text-[#6f6f87]">
                  The icon and colour appear on the card and at the top of the playbook.
                </p>

                <div>
                  <label htmlFor="playbook-name" className={LABEL}>
                    Playbook name
                  </label>
                  <input
                    id="playbook-name"
                    ref={nameRef}
                    value={values.name}
                    onChange={(event) => {
                      set({ name: event.target.value });
                      if (nameError) setNameError("");
                    }}
                    placeholder="Name your trading playbook"
                    maxLength={80}
                    className={FIELD}
                    aria-invalid={!!nameError}
                    aria-describedby={nameError ? "playbook-name-error" : undefined}
                  />
                  {nameError ? (
                    <p id="playbook-name-error" className="mt-1.5 text-[11px] font-medium text-[#fb7185]">
                      {nameError}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label htmlFor="playbook-description" className={LABEL}>
                    Description
                  </label>
                  <textarea
                    id="playbook-description"
                    value={values.description}
                    onChange={(event) => set({ description: event.target.value })}
                    placeholder="Add a description to your trading playbook"
                    rows={3}
                    className={`${FIELD} resize-y`}
                  />
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-lg border border-[#232332] bg-[#11111a] p-4">
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
                    style={{ backgroundColor: colour }}
                    aria-hidden="true"
                  >
                    <Icon size={18} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-semibold text-white">{values.name}</div>
                    <p className="mt-0.5 line-clamp-3 text-[11.5px] leading-relaxed text-[#8f8fa6]">
                      {values.description || "No description yet."}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className={`mt-3 inline-flex items-center gap-1 rounded text-[11.5px] font-semibold text-[#a48fff] transition-colors hover:text-white ${FOCUS}`}
                >
                  <Pencil size={11} /> Edit details
                </button>
              </div>
            )}
          </section>

          {/* Trading playbook rules */}
          <section className="min-w-0" aria-labelledby="wizard-rules">
            <StepBar filled={!stepOne} step={2} />
            <h2 id="wizard-rules" className="mt-3 text-[15px] font-semibold text-white">
              Trading playbook rules
            </h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-[#8f8fa6]">
              List the rules you follow and the stats you want to hold yourself to.
            </p>

            {stepOne ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-lg border border-[#232332] bg-[#0c0c14] p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6f6f87]">
                    Next step
                  </div>
                  <ul className="mt-2.5 space-y-2">
                    {[
                      "Market and timeframe",
                      "Risk per trade",
                      "Entry and exit rules",
                      "A checklist to score the setup",
                    ].map((line) => (
                      <li key={line} className="flex items-center gap-2 text-[12px] text-[#a4a6bd]">
                        <span className="flex h-4 w-4 items-center justify-center rounded-full border border-[#34344a]">
                          <Check size={9} className="text-[#6C47FF]" />
                        </span>
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex items-center gap-3 rounded-lg border border-[#232332] bg-[#101019] px-3 py-2.5">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white"
                    style={{ backgroundColor: colour }}
                    aria-hidden="true"
                  >
                    <Icon size={15} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-semibold text-white">
                      {values.name.trim() || "Your playbook name"}
                    </div>
                    <div className="text-[10.5px] text-[#74748c]">Live preview</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="playbook-market" className={LABEL}>
                      Market
                    </label>
                    <div className="relative">
                      <select
                        id="playbook-market"
                        value={values.market}
                        onChange={(event) => set({ market: event.target.value })}
                        className={`${FIELD} appearance-none pr-8`}
                      >
                        <option value="">Any market</option>
                        {MARKETS.map((market) => (
                          <option key={market} value={market}>
                            {market}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={13}
                        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#74748c]"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="playbook-timeframe" className={LABEL}>
                      Timeframe
                    </label>
                    <div className="relative">
                      <select
                        id="playbook-timeframe"
                        value={values.timeframe}
                        onChange={(event) => set({ timeframe: event.target.value })}
                        className={`${FIELD} appearance-none pr-8`}
                      >
                        <option value="">Any timeframe</option>
                        {TIMEFRAMES.map((timeframe) => (
                          <option key={timeframe} value={timeframe}>
                            {timeframe}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={13}
                        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#74748c]"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="playbook-risk" className={LABEL}>
                    Risk per trade (%)
                  </label>
                  <input
                    id="playbook-risk"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={values.riskPerTrade}
                    onChange={(event) => set({ riskPerTrade: event.target.value })}
                    placeholder="e.g. 1"
                    className={FIELD}
                  />
                </div>

                <div>
                  <label htmlFor="playbook-entry" className={LABEL}>
                    Entry criteria
                  </label>
                  <textarea
                    id="playbook-entry"
                    value={values.entryCriteria}
                    onChange={(event) => set({ entryCriteria: event.target.value })}
                    placeholder="What has to be true before you take this setup?"
                    rows={2}
                    className={`${FIELD} resize-y`}
                  />
                </div>

                <div>
                  <label htmlFor="playbook-exit" className={LABEL}>
                    Exit criteria
                  </label>
                  <textarea
                    id="playbook-exit"
                    value={values.exitCriteria}
                    onChange={(event) => set({ exitCriteria: event.target.value })}
                    placeholder="Where is the stop, where is the target, when do you cut it?"
                    rows={2}
                    className={`${FIELD} resize-y`}
                  />
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11.5px] font-semibold text-[#b9b9cf]">Rules checklist</span>
                    <span className="text-[10.5px] tabular-nums text-[#6f6f87]">
                      {values.rules.length} added
                    </span>
                  </div>
                  <div className="space-y-2">
                    {values.rules.map((rule, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 rounded-md border border-[#262636] bg-[#10101a] px-2.5 py-1.5"
                      >
                        <span className="w-4 shrink-0 text-[11px] font-bold tabular-nums text-[#9d86ff]">
                          {index + 1}
                        </span>
                        <input
                          value={rule}
                          onChange={(event) =>
                            set({
                              rules: values.rules.map((current, i) =>
                                i === index ? event.target.value : current
                              ),
                            })
                          }
                          aria-label={`Rule ${index + 1}`}
                          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[#e8e8f4] outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => removeRule(index)}
                          aria-label={`Remove rule ${index + 1}`}
                          className={`rounded p-1 text-[#6f6f87] transition-colors hover:bg-white/5 hover:text-[#fb7185] ${FOCUS}`}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    {values.rules.length === 0 ? (
                      <p className="rounded-md border border-dashed border-[#2a2a3c] px-3 py-2.5 text-[11.5px] text-[#6f6f87]">
                        No rules yet. Add the first one below.
                      </p>
                    ) : null}
                    <div className="flex gap-2">
                      <input
                        value={ruleInput}
                        onChange={(event) => setRuleInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addRule();
                          }
                        }}
                        placeholder="Add a rule and press Enter"
                        aria-label="New rule"
                        className={FIELD}
                      />
                      <button type="button" onClick={addRule} className={`shrink-0 ${GHOST}`}>
                        <Plus size={13} /> Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        {error ? (
          <div className="mx-5 mb-4 rounded-md border border-[#fb7185]/40 bg-[#fb7185]/10 px-3 py-2 text-[12px] font-medium text-[#fda4af] sm:mx-8">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2 border-t border-[#22222f] bg-[#0b0b12] px-5 py-3.5 sm:px-8">
          {stepOne ? (
            <>
              <button type="button" onClick={onCancel} className={GHOST}>
                Cancel
              </button>
              <button type="button" onClick={next} className={PRIMARY}>
                Next <ArrowRight size={14} />
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setStep(1)} className={GHOST}>
                <ArrowLeft size={14} /> Back
              </button>
              <button type="submit" disabled={saving} className={PRIMARY}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {saving ? "Saving..." : mode === "edit" ? "Save changes" : "Create playbook"}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

function PlaybookDetail({ playbook, linked, stats, onEdit, onShare, onDelete, onCopy }) {
  const Icon = iconFor(playbook.icon);
  const colour = colourOf(playbook);
  const recent = useMemo(
    () =>
      [...linked].sort(
        (a, b) => (tradeDate(b)?.getTime() || 0) - (tradeDate(a)?.getTime() || 0)
      ),
    [linked]
  );

  const mainStats = [
    ["Trades", String(stats.count), "text-white"],
    ["Win rate", pct(stats.winRate), "text-white"],
    ["Profit factor", ratio(stats.profitFactor), "text-white"],
    ["Net P&L", money(stats.net), stats.net >= 0 ? "text-[#34d399]" : "text-[#fb7185]"],
  ];

  const extraStats = [
    ["Average win", stats.wins ? money(stats.avgWin) : "N/A", "text-[#34d399]"],
    ["Average loss", stats.losses ? money(-stats.avgLoss) : "N/A", "text-[#fb7185]"],
    ["Best trade", stats.count ? money(stats.best) : "N/A", "text-[#34d399]"],
    ["Worst trade", stats.count ? money(stats.worst) : "N/A", "text-[#fb7185]"],
  ];

  return (
    <div className="mx-auto w-full max-w-[1060px] pb-16">
      <div className="overflow-hidden rounded-xl border border-[#232332] bg-[#0e0e16] shadow-2xl shadow-black/30">
        <div className="flex flex-col gap-4 border-b border-[#22222f] p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-start gap-3.5">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white"
              style={{ backgroundColor: colour }}
              aria-hidden="true"
            >
              <Icon size={22} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[19px] font-bold tracking-tight text-white sm:text-[21px]">
                {playbook.name}
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {playbook.market ? <Chip>{playbook.market}</Chip> : null}
                {playbook.timeframe ? <Chip>{playbook.timeframe}</Chip> : null}
                {playbook.riskPerTrade !== "" && playbook.riskPerTrade != null ? (
                  <Chip>{playbook.riskPerTrade}% risk</Chip>
                ) : null}
                {playbook.rules?.length ? <Chip>{playbook.rules.length} rules</Chip> : null}
                {playbook.shared ? (
                  <Chip tone="accent">
                    <Share2 size={10} /> Shared
                  </Chip>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onShare}
              aria-pressed={!!playbook.shared}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-[12px] font-semibold transition-colors ${FOCUS} ${
                playbook.shared
                  ? "border-[#6C47FF]/50 bg-[#6C47FF]/15 text-[#c3b5ff]"
                  : "border-[#2a2a3c] text-[#c9c9dc] hover:bg-white/5 hover:text-white"
              }`}
            >
              <Share2 size={13} /> {playbook.shared ? "Shared" : "Share"}
            </button>
            <button
              type="button"
              onClick={onCopy}
              aria-label="Copy plan"
              className={`rounded-md border border-[#2a2a3c] p-2 text-[#a4a6bd] transition-colors hover:bg-white/5 hover:text-white ${FOCUS}`}
            >
              <Copy size={14} />
            </button>
            <button type="button" onClick={onEdit} className={GHOST}>
              <Pencil size={13} /> Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete playbook"
              className={`rounded-md border border-[#fb7185]/30 p-2 text-[#fb7185] transition-colors hover:bg-[#fb7185]/10 ${FOCUS}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px border-b border-[#22222f] bg-[#22222f] sm:grid-cols-4">
          {mainStats.map(([label, value, tone]) => (
            <div key={label} className="bg-[#0e0e16] px-4 py-3.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#74748c]">{label}</div>
              <div className={`mt-0.5 text-[17px] font-bold tabular-nums ${tone}`}>{value}</div>
            </div>
          ))}
        </div>

        <div className="space-y-6 p-5 sm:p-6">
          {playbook.description ? (
            <p className="max-w-3xl text-[13px] leading-relaxed text-[#a4a6bd]">{playbook.description}</p>
          ) : (
            <p className="text-[12.5px] italic text-[#5f5f78]">No description yet. Edit the playbook to add one.</p>
          )}

          {(playbook.entryCriteria || playbook.exitCriteria) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {playbook.entryCriteria ? (
                <div className="rounded-lg border border-[#232332] bg-[#11111a] p-4">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#74748c]">
                    <ArrowRight size={11} className="text-[#34d399]" /> Entry
                  </div>
                  <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#d6d6e4]">
                    {playbook.entryCriteria}
                  </p>
                </div>
              ) : null}
              {playbook.exitCriteria ? (
                <div className="rounded-lg border border-[#232332] bg-[#11111a] p-4">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#74748c]">
                    <ArrowLeft size={11} className="text-[#fb7185]" /> Exit
                  </div>
                  <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#d6d6e4]">
                    {playbook.exitCriteria}
                  </p>
                </div>
              ) : null}
            </div>
          )}

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[#232332] bg-[#232332] sm:grid-cols-4">
            {extraStats.map(([label, value, tone]) => (
              <div key={label} className="bg-[#11111a] px-3 py-2.5">
                <div className="text-[10px] font-medium text-[#74748c]">{label}</div>
                <div className={`text-[12.5px] font-bold tabular-nums ${tone}`}>{value}</div>
              </div>
            ))}
          </div>

          {playbook.rules?.length ? (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#74748c]">
                <ListChecks size={12} /> Rules checklist
              </div>
              <ol className="space-y-1.5">
                {playbook.rules.map((rule, index) => (
                  <li key={index} className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-[#d6d6e4]">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#6C47FF]/15 text-[10px] font-bold tabular-nums text-[#b7a6ff]">
                      {index + 1}
                    </span>
                    {rule}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#74748c]">
                Linked trades ({linked.length})
              </span>
              {linked.length ? (
                <span className="text-[10.5px] text-[#5f5f78]">Newest first</span>
              ) : null}
            </div>
            {linked.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[#2a2a3c] px-4 py-5 text-center text-[12px] leading-relaxed text-[#74748c]">
                No trades yet. Pick this playbook when you log a trade and its numbers will appear here.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-[#232332]">
                {recent.slice(0, 12).map((trade) => {
                  const pnl = Number(trade.pnl) || 0;
                  const when = tradeDate(trade);
                  return (
                    <div
                      key={trade.id}
                      className="flex items-center gap-3 border-b border-[#1f1f2c] px-3 py-2 text-[12px] last:border-0"
                    >
                      <span className="min-w-0 flex-1 truncate font-semibold text-[#e8e8f4]">
                        {trade.pair || "—"}
                        <span className="font-normal text-[#74748c]"> · {trade.direction || "—"}</span>
                      </span>
                      <span className="hidden shrink-0 tabular-nums text-[#74748c] sm:block">
                        {when ? fmtDay(when) : "—"}
                      </span>
                      <span
                        className={`w-24 shrink-0 text-right font-semibold tabular-nums ${
                          pnl >= 0 ? "text-[#34d399]" : "text-[#fb7185]"
                        }`}
                      >
                        {money(pnl)}
                      </span>
                    </div>
                  );
                })}
                {linked.length > 12 ? (
                  <div className="px-3 py-2 text-[11px] text-[#74748c]">+{linked.length - 12} more trades</div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({ playbook, tradeCount, busy, onCancel, onConfirm }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-playbook-title"
        className="w-full max-w-md rounded-xl border border-[#2a2a3c] bg-[#12121c] p-5 shadow-2xl"
      >
        <h2 id="delete-playbook-title" className="text-[15px] font-semibold text-white">
          Delete &ldquo;{playbook.name}&rdquo;?
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-[#a4a6bd]">
          The plan and its rules are removed. {tradeCount} linked trade{tradeCount === 1 ? "" : "s"} stay in your
          journal, but they will no longer point at this playbook.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={GHOST} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#e11d48] px-3.5 py-2 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Delete playbook
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Playbooks({ currentAccount }) {
  const navigate = useNavigate();

  const [PREVIEW] = useState(
    () =>
      typeof window !== "undefined" &&
      process.env.NODE_ENV !== "production" &&
      new URLSearchParams(window.location.search).get("preview") === "1"
  );

  const accountId = currentAccount?.id;

  const [playbooks, setPlaybooks] = useState([]);
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("mine");
  const [rangeKey, setRangeKey] = useState("this-month");
  const [view, setView] = useState({ name: "list" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [toast, setToast] = useState("");
  const [explain, setExplain] = useState(false);

  const range = useMemo(() => rangeFor(rangeKey), [rangeKey]);
  const scopedTrades = useMemo(
    () => trades.filter((trade) => inRange(trade, range)),
    [trades, range]
  );

  const load = async () => {
    if (PREVIEW) {
      setTrades(demoDashboardTrades());
      setPlaybooks([]);
      setLoading(false);
      setError("");
      return;
    }

    const user = auth.currentUser;
    if (!user || !accountId) {
      setPlaybooks([]);
      setTrades([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const base = ["users", user.uid, "accounts", accountId];
      const [playbookSnap, tradeSnap] = await Promise.all([
        getDocs(collection(db, ...base, "playbooks")),
        getDocs(collection(db, ...base, "trades")),
      ]);
      setPlaybooks(playbookSnap.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
      setTrades(tradeSnap.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
    } catch (err) {
      console.error("Playbooks load failed:", err);
      setError("Could not load your playbooks. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, PREVIEW]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const cards = useMemo(
    () =>
      playbooks
        .map((playbook) => {
          const linked = collectTrades(playbook, scopedTrades);
          return { playbook, linked, stats: tradeStats(linked) };
        })
        .sort((a, b) => b.stats.net - a.stats.net),
    [playbooks, scopedTrades]
  );

  const sharedCards = useMemo(() => cards.filter((item) => item.playbook.shared), [cards]);

  const linkedCount = useMemo(() => {
    const ids = new Set();
    playbooks.forEach((playbook) => {
      collectTrades(playbook, scopedTrades).forEach((trade) => ids.add(trade.id));
    });
    return ids.size;
  }, [playbooks, scopedTrades]);

  const detail = view.name === "detail" ? playbooks.find((item) => item.id === view.id) : null;
  const accountName = currentAccount?.name || "All accounts";
  const noAccount = !PREVIEW && !accountId;

  const openCreate = () => {
    setFormError("");
    setView({ name: "wizard", mode: "create", draft: blankDraft() });
  };

  const openEdit = (playbook) => {
    setFormError("");
    setView({ name: "wizard", mode: "edit", id: playbook.id, draft: draftFrom(playbook) });
  };

  const openDetail = (playbook) => {
    setFormError("");
    setView({ name: "detail", id: playbook.id });
  };

  const useTemplate = (template) => {
    setFormError("");
    setView({ name: "wizard", mode: "create", draft: draftFrom(template) });
  };

  const closeWizard = () => {
    setFormError("");
    if (view.name === "wizard" && view.mode === "edit" && view.id) {
      setView({ name: "detail", id: view.id });
    } else {
      setView({ name: "list" });
    }
  };

  const savePlaybook = async (values) => {
    if (view.name !== "wizard") return;
    setSaving(true);
    setFormError("");

    if (PREVIEW) {
      if (view.mode === "create") {
        const id = `local-${Date.now()}`;
        setPlaybooks((list) => [{ id, ...values }, ...list]);
        setView({ name: "detail", id });
        setToast("Playbook created");
      } else {
        setPlaybooks((list) =>
          list.map((item) => (item.id === view.id ? { ...item, ...values } : item))
        );
        setView({ name: "detail", id: view.id });
        setToast("Playbook updated");
      }
      setSaving(false);
      return;
    }

    const user = auth.currentUser;
    if (!user || !accountId) {
      setSaving(false);
      setFormError("Select an account before saving.");
      return;
    }

    try {
      const base = ["users", user.uid, "accounts", accountId];
      const collectionRef = collection(db, ...base, "playbooks");

      if (view.mode === "create") {
        const created = await addDoc(collectionRef, {
          ...values,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await load();
        setView({ name: "detail", id: created.id });
        setToast("Playbook created");
      } else {
        const previous = playbooks.find((item) => item.id === view.id);
        if (!previous) throw new Error("This playbook no longer exists.");
        await updateDoc(doc(collectionRef, previous.id), {
          ...values,
          updatedAt: serverTimestamp(),
        });

        // Keep the trade snapshots in step when the playbook is renamed.
        if (previous.name !== values.name) {
          const affected = trades.filter((trade) => trade.playbookId === previous.id);
          for (let index = 0; index < affected.length; index += 400) {
            const batch = writeBatch(db);
            affected.slice(index, index + 400).forEach((trade) => {
              const patch = { playbook: values.name };
              const currentStrategy = (trade.strategy || "").trim().toLowerCase();
              if (!currentStrategy || currentStrategy === previous.name.trim().toLowerCase()) {
                patch.strategy = values.name;
              }
              batch.update(doc(db, ...base, "trades", trade.id), patch);
            });
            await batch.commit();
          }
        }

        await load();
        setView({ name: "detail", id: previous.id });
        setToast("Playbook updated");
      }
    } catch (err) {
      console.error("Playbook save failed:", err);
      setFormError(err?.message || "Could not save the playbook.");
    } finally {
      setSaving(false);
    }
  };

  const toggleShare = async (playbook) => {
    const next = !playbook.shared;

    if (PREVIEW) {
      setPlaybooks((list) =>
        list.map((item) => (item.id === playbook.id ? { ...item, shared: next } : item))
      );
      setToast(next ? "Playbook shared" : "Removed from shared");
      return;
    }

    const user = auth.currentUser;
    if (!user || !accountId) return;

    try {
      await updateDoc(
        doc(db, "users", user.uid, "accounts", accountId, "playbooks", playbook.id),
        { shared: next, updatedAt: serverTimestamp() }
      );
      setPlaybooks((list) =>
        list.map((item) => (item.id === playbook.id ? { ...item, shared: next } : item))
      );
      setToast(next ? "Playbook shared" : "Removed from shared");
    } catch (err) {
      console.error("Playbook share failed:", err);
      setToast("Could not update sharing.");
    }
  };

  const askDelete = (playbook) =>
    setPendingDelete({ playbook, count: collectTrades(playbook, trades).length });

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { playbook } = pendingDelete;
    setSaving(true);

    try {
      if (PREVIEW) {
        setPlaybooks((list) => list.filter((item) => item.id !== playbook.id));
      } else {
        const user = auth.currentUser;
        if (!user || !accountId) throw new Error("No account selected.");
        await deleteDoc(
          doc(db, "users", user.uid, "accounts", accountId, "playbooks", playbook.id)
        );
        await load();
      }
      setPendingDelete(null);
      setView({ name: "list" });
      setToast("Playbook deleted");
    } catch (err) {
      console.error("Playbook delete failed:", err);
      setToast("Could not delete the playbook.");
    } finally {
      setSaving(false);
    }
  };

  const copyPlan = async (playbook) => {
    const ok = await copyText(planText(playbook));
    setToast(ok ? "Plan copied to clipboard" : "Copy is blocked in this browser");
  };

  let content;
  if (loading) {
    content = <SkeletonGrid />;
  } else if (error) {
    content = (
      <div className="rounded-xl border border-[#2a2a3c] bg-[#0e0e16] p-8 text-center">
        <p className="text-[13px] font-semibold text-white">{error}</p>
        <button type="button" onClick={load} className={`mt-4 ${PRIMARY}`}>
          Try again
        </button>
      </div>
    );
  } else if (noAccount) {
    content = (
      <div className="rounded-xl border border-[#2a2a3c] bg-[#0e0e16] p-8 text-center">
        <Wallet size={28} className="mx-auto text-[#6f6f87]" />
        <p className="mt-3 text-[15px] font-semibold text-white">Connect an account first</p>
        <p className="mx-auto mt-1 max-w-md text-[12.5px] leading-relaxed text-[#8f8fa6]">
          Playbooks live inside an account. Add or pick one and this page will fill in.
        </p>
        <button type="button" onClick={() => navigate("/add-trade")} className={`mt-5 ${PRIMARY}`}>
          Manage accounts
        </button>
      </div>
    );
  } else if (tab === "templates") {
    content = <TemplateTab onUse={useTemplate} />;
  } else if (tab === "shared") {
    content = sharedCards.length ? (
      <>
        <p className="mb-4 max-w-2xl text-[12px] leading-relaxed text-[#8f8fa6]">
          {sharedCards.length} shared playbook{sharedCards.length === 1 ? "" : "s"}. Sharing marks a plan as
          published and lists it here. Copy plan puts the whole plan on your clipboard.
        </p>
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {sharedCards.map((item) => (
            <PlaybookCard
              key={item.playbook.id}
              item={item}
              onOpen={openDetail}
              onEdit={openEdit}
              onShare={toggleShare}
              onDelete={askDelete}
              onCopy={copyPlan}
            />
          ))}
        </div>
      </>
    ) : (
      <SharedEmpty
        hasPlaybooks={playbooks.length > 0}
        onGoMine={() => setTab("mine")}
        onExplain={() => setExplain((value) => !value)}
        explainOpen={explain}
      />
    );
  } else if (!cards.length) {
    content = (
      <EmptyState
        onCreate={openCreate}
        onExplain={() => setExplain((value) => !value)}
        explainOpen={explain}
      />
    );
  } else {
    content = (
      <>
        <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11.5px] text-[#7c7c95]">
          <span>
            {cards.length} playbook{cards.length === 1 ? "" : "s"}
          </span>
          <span>
            {linkedCount} of {scopedTrades.length} trades linked in this range
          </span>
          <span className="ml-auto">Sorted by net P&amp;L</span>
        </div>
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((item) => (
            <PlaybookCard
              key={item.playbook.id}
              item={item}
              onOpen={openDetail}
              onEdit={openEdit}
              onShare={toggleShare}
              onDelete={askDelete}
              onCopy={copyPlan}
            />
          ))}
        </div>
      </>
    );
  }

  return (
    <div className="-m-1 min-h-screen bg-[#0a0a10] sm:-m-3" style={{ backgroundColor: BG, color: TEXT }}>
      <div className="mx-auto w-full max-w-[1600px] px-3 pb-20 sm:px-6">
        <PageHeader
          rangeKey={rangeKey}
          rangeLabel={range.label}
          onRangeChange={setRangeKey}
          accountName={accountName}
          currentAccount={currentAccount}
          onManageAccounts={() => navigate("/add-trade")}
        />

        {view.name === "wizard" ? (
          <>
            <div className="pt-4">
              <Breadcrumb
                current={view.mode === "edit" ? "Edit playbook" : "Create playbook"}
                onRoot={() => setView({ name: "list" })}
              />
            </div>
            <div className="pt-3">
              <PlaybookWizard
                mode={view.mode}
                initial={view.draft || blankDraft()}
                saving={saving}
                error={formError}
                onCancel={closeWizard}
                onSave={savePlaybook}
              />
            </div>
          </>
        ) : view.name === "detail" && detail ? (
          <>
            <div className="pt-4">
              <Breadcrumb current={detail.name} onRoot={() => setView({ name: "list" })} />
            </div>
            <div className="pt-3">
              <PlaybookDetail
                playbook={detail}
                linked={collectTrades(detail, scopedTrades)}
                stats={tradeStats(collectTrades(detail, scopedTrades))}
                onEdit={() => openEdit(detail)}
                onShare={() => toggleShare(detail)}
                onDelete={() => askDelete(detail)}
                onCopy={() => copyPlan(detail)}
              />
            </div>
          </>
        ) : (
          <>
            <TabsBar
              tab={tab}
              sharedCount={sharedCards.length}
              onCreate={openCreate}
              showCreate={cards.length > 0}
              onChange={(key) => {
                setTab(key);
                setExplain(false);
              }}
            />
            {content}
          </>
        )}
      </div>

      {toast ? (
        <div
          role="status"
          className="pointer-events-none fixed bottom-5 left-1/2 z-[900] -translate-x-1/2 rounded-lg border border-[#2a2a3c] bg-[#161622] px-4 py-2 text-[12px] font-medium text-white shadow-xl"
        >
          {toast}
        </div>
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          playbook={pendingDelete.playbook}
          tradeCount={pendingDelete.count}
          busy={saving}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </div>
  );
}





