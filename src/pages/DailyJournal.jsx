// src/pages/DailyJournal.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Trash2,
  Plus,
  Loader2,
  Check,
  AlertCircle,
  FileText,
  X,
  Pencil,
  Tag,
  Upload,
  Link,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Palette,
  Target,
  Search,
  Flame,
  CalendarDays,
  Settings,
  DollarSign,
  Percent,
  Clock,
  CreditCard,
  Maximize,
  Edit,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Star,
  RefreshCw,
  List,
  Image,
  Sparkles,
  Play,
  ExternalLink,
  MoreHorizontal,
  ListChecks,
  BookOpen,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  ListOrdered,
  Highlighter,
  LayoutTemplate,
  Filter,
  Trophy,
  User,
} from "lucide-react";
import {
  format,
  subDays,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  parseISO,
  isSameMonth,
  isToday,
} from "date-fns";
import {
  Chart as ChartJS,
  RadialLinearScale,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { Radar, Line } from "react-chartjs-2";
import { useTheme } from "../Theme-provider";
import demoDashboardTrades from "../lib/demoDashboardData";
import DeleteConfirmModal from "../components/ui/DeleteConfirmModal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db, auth, storage } from "../firebase";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  doc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

ChartJS.register(
  RadialLinearScale,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

// ────────────────────────────────────────────────
// Design tokens (same as the Dashboard)
// ────────────────────────────────────────────────
const POS = "#22c493";
const NEG = "#f2556e";
const POS_T = "text-[#0e9f77] dark:text-[#2dd4a0]";
const NEG_T = "text-[#d93a57] dark:text-[#ff6b86]";
const MUTED = "text-[#6b7090] dark:text-[#8a8fb5]";
const HEAD = "text-[#14142b] dark:text-white";
const DIVIDER = "border-[#e6e8f2] dark:border-[#262645]";
const CARD =
  "gap-0 rounded-[10px] bg-white dark:bg-[#15152b] border border-[#e6e8f2] dark:border-[#262645] shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:shadow-none";
const PANEL =
  "rounded-xl border border-[#e6e8f2] dark:border-[#262645] bg-[#f7f8fc] dark:bg-[#101024]";
const FIELD =
  "w-full h-10 rounded-lg border border-[#e6e8f2] dark:border-[#262645] bg-white dark:bg-[#101024] px-3 text-sm outline-none focus:ring-2 focus:ring-[#6C47FF]";
const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6C47FF]";
const ICON_BTN =
  "flex h-9 w-9 items-center justify-center rounded-lg text-[#6b7090] transition-colors hover:bg-[#f1f2f8] hover:text-[#14142b] dark:text-[#8a8fb5] dark:hover:bg-[#1e1e3a] dark:hover:text-white " +
  FOCUS;
const GHOST_BTN =
  "inline-flex items-center gap-1.5 rounded-lg border border-[#e6e8f2] px-2.5 py-1.5 text-[11.5px] font-medium text-[#14142b] transition-colors hover:bg-[#f1f2f8] dark:border-[#262645] dark:text-[#e8e9f7] dark:hover:bg-[#1e1e3a] " +
  FOCUS;
const TOOL_BTN =
  "inline-flex h-8 items-center gap-1.5 rounded-md border border-[#e6e8f2] bg-white px-2.5 text-[12px] font-medium text-[#475467] transition-colors hover:bg-[#f9fafb] dark:border-[#262645] dark:bg-[#15152b] dark:text-[#c9ccea] dark:hover:bg-[#1e1e3a] " +
  FOCUS;
const CARD_BTN =
  "inline-flex h-7 items-center gap-1.5 rounded-md border border-[#e6e8f2] bg-white px-2 text-[11.5px] font-medium text-[#344054] transition-colors hover:bg-[#f9fafb] dark:border-[#262645] dark:bg-[#15152b] dark:text-[#e8e9f7] dark:hover:bg-[#1e1e3a] " +
  FOCUS;

// Same accent palette + storage key as the Dashboard and Sidebar
const ACCENTS = {
  zella: { name: "Zella", hex: "#6C47FF", hex2: "#9b7bff" },
  indigo: { name: "Indigo", hex: "#6366f1", hex2: "#a855f7" },
  emerald: { name: "Emerald", hex: "#10b981", hex2: "#06b6d4" },
  cyan: { name: "Ocean", hex: "#06b6d4", hex2: "#3b82f6" },
  amber: { name: "Amber", hex: "#f59e0b", hex2: "#ef4444" },
  rose: { name: "Rose", hex: "#f43f5e", hex2: "#ec4899" },
};

const MOODS = ["Disciplined", "Focused", "Confident", "Neutral", "Anxious", "FOMO", "Revenge", "Tired"];
const SCORE_LABELS = ["Win Rate", "Notes", "Screenshots", "Confluences", "Risk Plan", "R:R ≥ 1.5"];

// Preview builds have no Firestore session, so the picker gets these instead
const DEMO_PLAYBOOKS = [
  {
    id: "demo-london-breakout",
    name: "London breakout",
    rules: [
      "Wait for the London open (08:00–10:00)",
      "Trade only in the direction of the H1 trend",
      "Risk a maximum of 0.5% per trade",
      "No entry inside the Asian range",
    ],
  },
  {
    id: "demo-trend-pullback",
    name: "Trend pullback",
    rules: [
      "Price respects the 20 EMA",
      "Lower timeframe prints a reversal candle",
      "Stop goes beyond the swing",
    ],
  },
];

const COMMON_ASSETS = [
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "NZDUSD", "USDCHF",
  "EURGBP", "EURJPY", "GBPJPY", "AUDJPY", "CADJPY", "CHFJPY",
  "UK100", "US30", "NAS100", "SPX500", "DE40", "JP225", "FRA40", "AUS200",
  "HSI", "CHINA50", "UK100.cash", "US30.cash", "NAS100.cash",
  "AAPL", "TSLA", "AMZN", "GOOGL", "MSFT", "NVDA", "META", "NFLX", "AMD", "INTC",
  "BABA", "PDD", "JD", "SHOP", "SQ", "PYPL", "DIS", "BA", "GE", "F",
];

// ────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────
const dayKey = (d) => format(d, "yyyy-MM-dd");
// Local calendar day of an entry (new entries use openDateTime, old ones used `date`)
const entryDay = (e) => String(e.openDateTime || e.date || "").slice(0, 10);
// Entries saved before the status field existed count as executed
const isExec = (e) => e.status !== "pending";
const entryStamp = (e) => String(e.openDateTime || e.date || "");

const timeOf = (e) => {
  const s = entryStamp(e);
  if (s.length <= 10) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "HH:mm");
};

const formatDateTimeLocal = (d = new Date()) => {
  const pad = (n) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const formatNumber = (num) => {
  if (!num && num !== 0) return "";
  return Number(num).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const money = (v, signed = true) => {
  const n = Number(v) || 0;
  const sign = n < 0 ? "-" : signed && n > 0 ? "+" : "";
  return `${sign}$${formatNumber(Math.abs(n))}`;
};

const pnlClass = (v) => (Number(v) >= 0 ? POS_T : NEG_T);

const fmtAxis = (v) => {
  const a = Math.abs(v);
  const s = a >= 1000 ? `${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k` : a;
  return `${v < 0 ? "-" : ""}$${s}`;
};

const emptyForm = (base = formatDateTimeLocal()) => ({
  openDateTime: base,
  closeDateTime: base,
  pair: "",
  direction: "Long",
  entry: "",
  exit: "",
  stopLoss: "",
  takeProfit: "",
  notes: "",
  pnl: "",
  rr: "",
  lotSize: "0.1",
  status: "executed",
  confluences: [],
  screenshotUrl: "",
  playbookId: "",
  playbookRules: [],
  playbookChecks: [],
});

// Helper: compress image before upload
const compressImage = (file, maxWidth = 1200, quality = 0.8) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new window.Image();
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("Canvas to blob failed"));
            resolve(new File([blob], file.name, { type: "image/jpeg" }));
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

// Scores a set of entries on six journalling-discipline axes (each 0–100)
function scoreEntries(list) {
  const n = list.length;
  if (!n) return null;
  const ex = list.filter(isExec);
  const pct = (c, t) => (t ? (c / t) * 100 : 0);
  const scores = [
    pct(ex.filter((e) => Number(e.pnl) > 0).length, ex.length),
    pct(list.filter((e) => (e.notes || "").trim().length > 0).length, n),
    pct(list.filter((e) => e.screenshotUrl).length, n),
    pct(list.filter((e) => Array.isArray(e.confluences) && e.confluences.length > 0).length, n),
    pct(list.filter((e) => Number(e.stopLoss) > 0 && Number(e.takeProfit) > 0).length, n),
    pct(ex.filter((e) => e.rr === "∞" || Number(e.rr) >= 1.5).length, ex.length),
  ].map(Math.round);
  return { scores, score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) };
}

// Stats for one list of entries (a day or a month)
function dayStats(list) {
  const ex = list.filter(isExec);
  const pnls = ex.map((e) => Number(e.pnl) || 0);
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p < 0);
  const grossW = wins.reduce((a, b) => a + b, 0);
  const grossL = Math.abs(losses.reduce((a, b) => a + b, 0));
  const rrVals = ex
    .map((e) => (e.rr === "" || e.rr === "∞" || e.rr == null ? NaN : Number(e.rr)))
    .filter((v) => Number.isFinite(v));
  const commission = list.reduce((s, e) => s + (Number(e.commission) || 0), 0);
  const gross = grossW - grossL;
  return {
    count: list.length,
    executed: ex.length,
    pending: list.length - ex.length,
    wins: wins.length,
    losses: losses.length,
    net: gross - commission,
    gross,
    grossW,
    grossL,
    lots: list.reduce((s, e) => s + (Number(e.lotSize) || 0), 0),
    commission,
    winRate: ex.length ? Math.round((wins.length / ex.length) * 100) : 0,
    pf: grossL ? (grossW / grossL).toFixed(2) : grossW > 0 ? "∞" : "—",
    avgRR: rrVals.length ? (rrVals.reduce((a, b) => a + b, 0) / rrVals.length).toFixed(2) : "—",
  };
}

// Running P&L through the day, trade by trade
function intraday(list) {
  let run = 0;
  const labels = ["Open"];
  const values = [0];
  list.filter(isExec).forEach((e) => {
    run += Number(e.pnl) || 0;
    labels.push(timeOf(e));
    values.push(Number(run.toFixed(2)));
  });
  return { labels, values };
}

// ────────────────────────────────────────────────
// Confluence tag input
// ────────────────────────────────────────────────
const ConfluenceTags = ({ tags, onChange, accent }) => {
  const [inputValue, setInputValue] = useState("");

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const value = inputValue.trim();
      if (value && !tags.includes(value)) {
        onChange([...tags, value]);
        setInputValue("");
      }
    }
  };

  return (
    <div className="space-y-1.5">
      <div className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 min-h-[48px] bg-white dark:bg-[#101024] ${DIVIDER}`}>
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold"
            style={{ backgroundColor: accent + "22", color: accent }}
          >
            <Tag size={11} />
            {tag}
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              className="ml-0.5 opacity-70 hover:opacity-100"
            >
              <X size={13} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? "Type a confluence and press Enter" : ""}
          className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-sm p-1"
        />
      </div>
      <p className={`text-xs ${MUTED}`}>Press Enter or comma to add a tag</p>
    </div>
  );
};

// ────────────────────────────────────────────────
// Day note (mood, reflection, reviewed flag) – like Tradezella's daily note
// ────────────────────────────────────────────────
const DayNoteModal = ({ dateKey, saved, stats, accent, onSave, onClose }) => {
  const navigate = useNavigate();
  const savedPlan = saved?.plan || {};
  const savedRecap = saved?.recap || {};
  const [note, setNote] = useState(saved?.note || "");
  const [reviewed, setReviewed] = useState(!!saved?.reviewed);
  const [plan, setPlan] = useState({
    watchlist: savedPlan.watchlist || "",
    economic: savedPlan.economic || "",
    bias: savedPlan.bias || "",
    levels: savedPlan.levels || "",
    gameplan: savedPlan.gameplan || "",
  });
  const [recap, setRecap] = useState({
    overall: savedRecap.overall || "",
    plusMinus: savedRecap.plusMinus || "",
  });
  const [busy, setBusy] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [templatesNote, setTemplatesNote] = useState("");
  const [openSections, setOpenSections] = useState({ plan: true, session: true, recap: true });
  const [openItems, setOpenItems] = useState({});

  const dateObj = parseISO(dateKey);
  const net = Number(stats?.net) || 0;
  const hadTrades = (stats?.executed || 0) > 0;

  const dirty =
    note !== (saved?.note || "") ||
    reviewed !== !!saved?.reviewed ||
    Object.keys(plan).some((key) => plan[key] !== (savedPlan[key] || "")) ||
    Object.keys(recap).some((key) => recap[key] !== (savedRecap[key] || ""));

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleSection = (key) => setOpenSections((cur) => ({ ...cur, [key]: !cur[key] }));
  const toggleItem = (key) => setOpenItems((cur) => ({ ...cur, [key]: !cur[key] }));

  const applyTemplate = (kind) => {
    if (kind === "plan") {
      setPlan((cur) => ({
        watchlist: cur.watchlist || "EURUSD, GBPUSD, XAUUSD",
        economic: cur.economic || "High-impact releases to sit out:",
        bias: cur.bias || "Daily bias:\nWeekly bias:",
        levels: cur.levels || "Key levels:\n- Support:\n- Resistance:",
        gameplan: cur.gameplan || "If price ..., then I will ...",
      }));
      setTemplatesNote("Pre-market plan added to the empty fields.");
    } else {
      setRecap((cur) => ({
        overall: cur.overall || "What worked:\nWhat I would repeat:\nWhat to fix:",
        plusMinus: cur.plusMinus || "Plus:\n- \nMinus:\n- ",
      }));
      setTemplatesNote("End-of-day review added to the empty fields.");
    }
    setTemplatesOpen(false);
  };

  const save = async () => {
    setBusy(true);
    await onSave(dateKey, { note, reviewed, plan, recap });
    setBusy(false);
    onClose();
  };

  const planItems = [
    ["watchlist", "Watchlist"],
    ["economic", "Economic events"],
    ["bias", "Daily/Weekly Bias"],
    ["levels", "Levels to Watch"],
    ["gameplan", "Gameplan"],
  ];
  const recapItems = [
    ["overall", "Overall Day Recap"],
    ["plusMinus", 'The "Plus/Minus"'],
  ];

  const headerBtn = `inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${DIVIDER} ${HEAD} ${FOCUS}`;
  const toolIcon = `flex h-7 w-7 items-center justify-center rounded-md ${MUTED}`;
  const area = `w-full resize-y rounded-lg border bg-[#f7f8fc] px-3 py-2 text-[12.5px] leading-relaxed outline-none focus:ring-2 focus:ring-[#6C47FF] dark:bg-[#101024] ${DIVIDER}`;

  const renderItem = (group, key, label) => {
    const value = group === "plan" ? plan[key] : recap[key];
    const open = !!openItems[key];
    return (
      <div key={key}>
        <button
          type="button"
          onClick={() => toggleItem(key)}
          aria-expanded={open}
          className={`flex w-full items-center gap-1.5 rounded-md py-1.5 pl-4 pr-2 text-left text-[12.5px] font-medium transition-colors hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${HEAD} ${FOCUS}`}
        >
          <ChevronRight size={12} className={`shrink-0 transition-transform ${MUTED} ${open ? "rotate-90" : ""}`} />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {value.trim() ? <Check size={11} style={{ color: accent }} /> : null}
        </button>
        {open ? (
          <textarea
            value={value}
            onChange={(event) => {
              const next = event.target.value;
              if (group === "plan") setPlan((cur) => ({ ...cur, [key]: next }));
              else setRecap((cur) => ({ ...cur, [key]: next }));
            }}
            placeholder={`Write your ${label.toLowerCase()}…`}
            aria-label={label}
            rows={3}
            className={`${area} mb-1.5 ml-4 w-[calc(100%-1rem)]`}
            style={{ "--tw-ring-color": accent }}
          />
        ) : null}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[1600] flex items-start justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Day view for ${format(dateObj, "d MMMM yyyy")}`}
        className={`relative w-full max-w-3xl overflow-hidden rounded-2xl border bg-white shadow-2xl dark:bg-[#15152b] ${DIVIDER}`}
      >
        {/* Header */}
        <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-5 ${DIVIDER}`}>
          <h2 className={`text-[17px] font-semibold ${HEAD}`}>Day view</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative">
              <button
                type="button"
                onClick={() => setTemplatesOpen((open) => !open)}
                aria-expanded={templatesOpen}
                className={headerBtn}
              >
                <LayoutTemplate size={13} /> Templates
              </button>
              {templatesOpen ? (
                <div className={`absolute right-0 top-full z-10 mt-1 w-56 overflow-hidden rounded-lg border bg-white shadow-xl dark:bg-[#15152b] ${DIVIDER}`}>
                  <button
                    type="button"
                    onClick={() => applyTemplate("plan")}
                    className={`block w-full px-3 py-2 text-left text-[12px] font-medium hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${HEAD}`}
                  >
                    Pre-market plan
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplate("recap")}
                    className={`block w-full px-3 py-2 text-left text-[12px] font-medium hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${HEAD}`}
                  >
                    End-of-day review
                  </button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate(`/notebook?date=${dateKey}`);
              }}
              className={headerBtn}
            >
              View in Notebook <ExternalLink size={12} />
            </button>
            <button
              type="button"
              onClick={() => setReviewed((value) => !value)}
              aria-pressed={reviewed}
              aria-label={reviewed ? "Remove reviewed mark" : "Mark day as reviewed"}
              title={reviewed ? "Marked as reviewed" : "Mark day as reviewed"}
              className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${DIVIDER} ${FOCUS}`}
              style={{ color: reviewed ? accent : undefined }}
            >
              <Star size={14} fill={reviewed ? "currentColor" : "none"} />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMoreOpen((open) => !open)}
                aria-expanded={moreOpen}
                aria-label="More options"
                className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${DIVIDER} ${MUTED} ${FOCUS}`}
              >
                <MoreHorizontal size={15} />
              </button>
              {moreOpen ? (
                <div className={`absolute right-0 top-full z-10 mt-1 w-52 overflow-hidden rounded-lg border bg-white shadow-xl dark:bg-[#15152b] ${DIVIDER}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setReviewed((value) => !value);
                      setMoreOpen(false);
                    }}
                    className={`block w-full px-3 py-2 text-left text-[12px] font-medium hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${HEAD}`}
                  >
                    {reviewed ? "Remove reviewed mark" : "Mark day as reviewed"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNote("");
                      setPlan({ watchlist: "", economic: "", bias: "", levels: "", gameplan: "" });
                      setRecap({ overall: "", plusMinus: "" });
                      setMoreOpen(false);
                      setTemplatesNote("All note fields cleared. Save to keep it.");
                    }}
                    className="block w-full px-3 py-2 text-left text-[12px] font-medium text-[#d93a57] hover:bg-[#f2556e]/10 dark:text-[#ff6b86]"
                  >
                    Clear note fields
                  </button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close day view"
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${MUTED} ${FOCUS}`}
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[min(78dvh,780px)] overflow-y-auto px-4 py-3 sm:px-5">
          {/* Day summary */}
          <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 ${DIVIDER}`}>
            <ChevronRight size={13} className={`mt-1 shrink-0 ${MUTED}`} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[13px] font-semibold ${HEAD}`}>{format(dateObj, "EEE, MMM d, yyyy")}</span>
                <span className={MUTED}>·</span>
                <span className={`text-[13px] font-semibold ${hadTrades ? pnlClass(net) : MUTED}`}>
                  Net P&L {hadTrades ? money(net) : "—"}
                </span>
              </div>
              <div className={`mt-0.5 text-[11px] ${MUTED}`}>
                {stats?.count || 0} {stats?.count === 1 ? "trade" : "trades"}
                {stats?.executed ? ` · ${stats.winRate}% win rate` : ""}
              </div>
            </div>
          </div>

          {/* Text toolbar (decorative: the note is plain text) */}
          <div className={`mt-3 flex flex-wrap items-center gap-0.5 rounded-lg border px-1.5 py-1 ${DIVIDER}`} aria-hidden="true">
            <span className={toolIcon}><ListOrdered size={13} /></span>
            <span className={toolIcon}><AlignLeft size={13} /></span>
            <span className={`mx-1 h-4 w-px ${DIVIDER} border-l`} />
            <span className={toolIcon}><Bold size={13} /></span>
            <span className={toolIcon}><Italic size={13} /></span>
            <span className={toolIcon}><Underline size={13} /></span>
            <span className={toolIcon}><Highlighter size={13} /></span>
            <span className={`mx-1 h-4 w-px ${DIVIDER} border-l`} />
            <span className={`rounded-md border px-1.5 py-0.5 text-[11px] ${DIVIDER} ${MUTED}`}>Arial</span>
            <span className={`rounded-md border px-1.5 py-0.5 text-[11px] ${DIVIDER} ${MUTED}`}>14</span>
            <span className={toolIcon}><List size={13} /></span>
            <span className={toolIcon}><Image size={13} /></span>
            <span className="ml-auto flex items-center gap-1">
              <span className={toolIcon}><RefreshCw size={12} /></span>
              <span className={toolIcon}><Star size={12} /></span>
            </span>
          </div>

          {templatesNote ? <p className={`mt-2 text-[11px] ${MUTED}`}>{templatesNote}</p> : null}

          {/* Preparation & Game plan */}
          <section className="mt-2">
            <button
              type="button"
              onClick={() => toggleSection("plan")}
              aria-expanded={openSections.plan}
              className={`flex w-full items-center gap-1.5 py-1.5 text-left ${FOCUS}`}
            >
              <ChevronDown size={13} className={`transition-transform ${MUTED} ${openSections.plan ? "" : "-rotate-90"}`} />
              <Target size={15} style={{ color: NEG }} />
              <span className={`text-[13px] font-semibold ${HEAD}`}>Preparation &amp; Game plan</span>
            </button>
            {openSections.plan ? (
              <div className="space-y-0.5">{planItems.map(([key, label]) => renderItem("plan", key, label))}</div>
            ) : null}
          </section>

          <div className={`my-2 border-t ${DIVIDER}`} />

          {/* Session log */}
          <section>
            <button
              type="button"
              onClick={() => toggleSection("session")}
              aria-expanded={openSections.session}
              className={`flex w-full items-center gap-1.5 py-1.5 text-left ${FOCUS}`}
            >
              <ChevronDown size={13} className={`transition-transform ${MUTED} ${openSections.session ? "" : "-rotate-90"}`} />
              <FileText size={15} style={{ color: accent }} />
              <span className={`text-[13px] font-semibold ${HEAD}`}>Session log</span>
            </button>
            {openSections.session ? (
              <>
                <p className={`pl-6 text-[11px] leading-relaxed ${MUTED}`}>
                  Log your thoughts with timestamps for future recaps. Use voice-to-text to help you.
                </p>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Log your thoughts with timestamps for future recaps."
                  aria-label="Session log"
                  rows={4}
                  className={`${area} mt-2`}
                  style={{ "--tw-ring-color": accent }}
                />
              </>
            ) : null}
          </section>

          <div className={`my-2 border-t ${DIVIDER}`} />

          {/* EOD performance recap */}
          <section>
            <button
              type="button"
              onClick={() => toggleSection("recap")}
              aria-expanded={openSections.recap}
              className={`flex w-full items-center gap-1.5 py-1.5 text-left ${FOCUS}`}
            >
              <ChevronDown size={13} className={`transition-transform ${MUTED} ${openSections.recap ? "" : "-rotate-90"}`} />
              <BarChart3 size={15} style={{ color: POS }} />
              <span className={`text-[11.5px] font-bold uppercase tracking-wide ${HEAD}`}>EOD Performance Recap</span>
            </button>
            {openSections.recap ? (
              <div className="space-y-0.5">{recapItems.map(([key, label]) => renderItem("recap", key, label))}</div>
            ) : null}
          </section>
        </div>

        {/* Footer */}
        <div className={`flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-5 ${DIVIDER}`}>
          <div className={`flex flex-wrap items-center gap-3 text-[11px] ${MUTED}`}>
            <span className="inline-flex items-center gap-1.5">
              <ListChecks size={12} /> {stats?.count || 0} {stats?.count === 1 ? "trade" : "trades"} logged
            </span>
            {dirty ? <span>Unsaved changes</span> : null}
          </div>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            style={{ backgroundColor: accent }}
            className={`inline-flex items-center gap-2 rounded-lg px-5 py-2 text-[12.5px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`}
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : null}
            Save
          </button>
        </div>
      </div>
    </div>
  );
};


// ────────────────────────────────────────────────
// Main page
// ────────────────────────────────────────────────
export default function DailyJournal({ currentAccount }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [entries, setEntries] = useState([]);
  const [dayNotes, setDayNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState(null);
  const [clearDayKey, setClearDayKey] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [user, setUser] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => dayKey(new Date()));
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [filter, setFilter] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedDay, setExpandedDay] = useState({});
  const [bannerOpen, setBannerOpen] = useState(() => {
    try {
      return localStorage.getItem("forgexDayViewBanner") !== "off";
    } catch {
      return true;
    }
  });
  const [viewMode, setViewMode] = useState("day");
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteDateKey, setNoteDateKey] = useState(selectedDate);
  const [accent, setAccent] = useState(() => {
    try {
      const saved = localStorage.getItem("forgexAccent");
      return ACCENTS[saved] ? saved : "zella";
    } catch {
      return "zella";
    }
  });
  const ac = ACCENTS[accent] || ACCENTS.zella;
  const [PREVIEW] = useState(
    () =>
      typeof window !== "undefined" &&
      process.env.NODE_ENV !== "production" &&
      new URLSearchParams(window.location.search).get("preview") === "1"
  );
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm());
  const [playbooks, setPlaybooks] = useState([]);
  const [newPlaybookOpen, setNewPlaybookOpen] = useState(false);
  const [newPlaybookName, setNewPlaybookName] = useState("");
  const [savingPlaybook, setSavingPlaybook] = useState(false);
  const [playbookError, setPlaybookError] = useState("");

  const modalContentRef = useRef(null);
  const uploadRef = useRef(null);
  const accountLeverage = currentAccount?.leverage || 100;
  const isAccountReady = (user || PREVIEW) && currentAccount;
  const todayKey = dayKey(new Date());

  useEffect(() => {
    try {
      localStorage.setItem("forgexAccent", accent);
    } catch {}
  }, [accent]);

  useEffect(() => {
    if (!successMsg) return undefined;
    const t = setTimeout(() => setSuccessMsg(null), 3500);
    return () => clearTimeout(t);
  }, [successMsg]);

  // ─── Image upload handler with compression ─────────────────────────
  const handleImageUpload = async (file) => {
    if (!file || !user || !currentAccount?.id) return;
    setUploadingImage(true);
    try {
      const compressedFile = await compressImage(file);
      const storageRef = ref(
        storage,
        `users/${user.uid}/accounts/${currentAccount.id}/trades/${Date.now()}_${file.name}`
      );
      await uploadBytes(storageRef, compressedFile);
      const url = await getDownloadURL(storageRef);
      setForm((prev) => ({ ...prev, screenshotUrl: url }));
      setSuccessMsg("Image uploaded successfully!");
    } catch (err) {
      console.error("Upload failed:", err);
      setError("Failed to upload image. Try a smaller file or use URL.");
    } finally {
      setUploadingImage(false);
    }
  };

  uploadRef.current = handleImageUpload;

  // ─── Handle paste (images only) on the modal ───────────────────────
  useEffect(() => {
    if (!modalOpen) return undefined;
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.indexOf("image") !== -1) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) uploadRef.current?.(file);
          break;
        }
      }
    };
    const currentModal = modalContentRef.current;
    if (currentModal) currentModal.addEventListener("paste", handlePaste);
    return () => {
      if (currentModal) currentModal.removeEventListener("paste", handlePaste);
    };
  }, [modalOpen]);

  // ─── Fetch journal entries + day notes ─────────────────────────────
  const refreshEntries = async () => {
    if (!currentAccount?.id) {
      setEntries([]);
      setLoading(false);
      return;
    }
    if (PREVIEW) {
      setEntries(demoDashboardTrades());
      setDayNotes({});
      setLoading(false);
      return;
    }
    if (!user) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const entriesRef = collection(db, "users", user.uid, "accounts", currentAccount.id, "trades");
      const snapshot = await getDocs(query(entriesRef, orderBy("createdAt", "desc")));
      setEntries(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("❌ Journal fetch error:", err);
      setError("Could not load journal entries. " + (err.message || ""));
      setEntries([]);
    } finally {
      setLoading(false);
    }

    // Day notes live in their own collection; a failure here must not hide the trades
    try {
      const notesSnap = await getDocs(
        collection(db, "users", user.uid, "accounts", currentAccount.id, "journal")
      );
      const map = {};
      notesSnap.docs.forEach((d) => {
        map[d.id] = d.data();
      });
      setDayNotes(map);
    } catch (err) {
      console.warn("Day notes could not be loaded:", err);
      setDayNotes({});
    }
  };

  // ─── Auth listener ─────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((authUser) => {
      setUser(authUser);
      if (!authUser && !PREVIEW) {
        setEntries([]);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (currentAccount && (user || PREVIEW)) refreshEntries();
  }, [currentAccount, user, PREVIEW]);

  // ─── Playbooks for this account (shown in the entry form) ──────────
  useEffect(() => {
    if (!currentAccount?.id) {
      setPlaybooks([]);
      return undefined;
    }
    if (PREVIEW) {
      setPlaybooks(DEMO_PLAYBOOKS);
      return undefined;
    }
    if (!user) return undefined;
    let cancelled = false;
    getDocs(collection(db, "users", user.uid, "accounts", currentAccount.id, "playbooks"))
      .then((snap) => {
        if (!cancelled) setPlaybooks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      })
      .catch((err) => console.warn("Playbooks could not be loaded:", err));
    return () => {
      cancelled = true;
    };
  }, [currentAccount?.id, user, PREVIEW]);

  const selectedPlaybook = useMemo(
    () => playbooks.find((playbook) => playbook.id === form.playbookId) || null,
    [playbooks, form.playbookId]
  );
  // Entries keep a snapshot of the rules so the checklist still reads right
  // after a playbook is edited or deleted.
  const activeRules = form.playbookRules?.length ? form.playbookRules : selectedPlaybook?.rules || [];

  const resetPlaybookForm = () => {
    setNewPlaybookOpen(false);
    setNewPlaybookName("");
    setPlaybookError("");
  };

  const choosePlaybook = (id) => {
    const playbook = playbooks.find((item) => item.id === id);
    setForm((prev) => ({
      ...prev,
      playbookId: id,
      playbookRules: playbook?.rules || [],
      playbookChecks: [],
    }));
  };

  const togglePlaybookRule = (rule) => {
    setForm((prev) => {
      const checks = Array.isArray(prev.playbookChecks) ? prev.playbookChecks : [];
      return {
        ...prev,
        playbookChecks: checks.includes(rule) ? checks.filter((item) => item !== rule) : [...checks, rule],
      };
    });
  };

  // Create a playbook without leaving the entry form; only the name is asked
  // for here, the rules are edited on the Playbooks page.
  const createPlaybook = async () => {
    const name = newPlaybookName.trim();
    if (!name) {
      setPlaybookError("Give the playbook a name first.");
      return;
    }
    if (playbooks.some((item) => String(item.name || "").trim().toLowerCase() === name.toLowerCase())) {
      setPlaybookError("You already have a playbook with that name.");
      return;
    }
    setPlaybookError("");

    if (!user || !currentAccount?.id) {
      const id = `local-${Date.now()}`;
      setPlaybooks((list) => [...list, { id, name, rules: [] }]);
      choosePlaybook(id);
      resetPlaybookForm();
      return;
    }

    setSavingPlaybook(true);
    try {
      const created = await addDoc(
        collection(db, "users", user.uid, "accounts", currentAccount.id, "playbooks"),
        {
          name,
          description: "",
          market: "",
          timeframe: "",
          riskPerTrade: "",
          entryCriteria: "",
          exitCriteria: "",
          rules: [],
          color: ac.hex,
          icon: "target",
          shared: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
      );
      setPlaybooks((list) => [...list, { id: created.id, name, rules: [] }]);
      setForm((prev) => ({ ...prev, playbookId: created.id, playbookRules: [], playbookChecks: [] }));
      resetPlaybookForm();
    } catch (err) {
      console.error("Create playbook error:", err);
      setPlaybookError("Couldn't save the playbook. Check your connection and try again.");
    } finally {
      setSavingPlaybook(false);
    }
  };

  // ─── Auto‑calculate PnL and R:R (only if executed and exit given) ─
  useEffect(() => {
    if (form.status === "pending" || !form.exit) {
      setForm((prev) => ({ ...prev, pnl: "", rr: "" }));
      return;
    }
    const entry = Number(form.entry) || 0;
    const exitPrice = Number(form.exit) || 0;
    const sl = Number(form.stopLoss) || 0;
    const tp = Number(form.takeProfit) || 0;
    const lot = Number(form.lotSize) || 0.1;

    let calculatedPnL = "";
    if (entry && exitPrice && lot && accountLeverage) {
      const priceDiff = form.direction === "Long" ? exitPrice - entry : entry - exitPrice;
      calculatedPnL = (priceDiff * lot * accountLeverage * 100).toFixed(2);
    }

    let calculatedRR = "";
    if (entry && sl && tp) {
      const risk = form.direction === "Long" ? entry - sl : sl - entry;
      const reward = form.direction === "Long" ? tp - entry : entry - tp;
      if (risk !== 0) calculatedRR = (reward / risk).toFixed(2);
      else if (reward > 0) calculatedRR = "∞";
    }

    setForm((prev) => ({ ...prev, pnl: calculatedPnL, rr: calculatedRR }));
  }, [form.entry, form.exit, form.stopLoss, form.takeProfit, form.lotSize, form.direction, form.status, accountLeverage]);

  // ─── Derived data ───────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const m = {};
    entries.forEach((e) => {
      const k = entryDay(e);
      if (!k) return;
      (m[k] || (m[k] = [])).push(e);
    });
    Object.values(m).forEach((l) => l.sort((a, b) => entryStamp(a).localeCompare(entryStamp(b))));
    return m;
  }, [entries]);

  // ─── Open the day passed via ?date= (e.g. from the dashboard day-detail modal) ─
  const dateParamHandled = useRef(false);
  const { search: locationSearch } = useLocation();
  useEffect(() => {
    if (
      !user ||
      !currentAccount ||
      entries.length === 0 ||
      dateParamHandled.current
    )
      return;
    const params = new URLSearchParams(locationSearch);
    const date = params.get("date");
    if (!date) return;
    const key = String(date).slice(0, 10);
    if (!grouped[key] && !dayNotes[key]) return;
    dateParamHandled.current = true;
    selectDay(key);
  }, [user, currentAccount, entries.length, locationSearch, grouped, dayNotes]);

  const dayTotals = useMemo(() => {
    const m = {};
    Object.entries(grouped).forEach(([k, list]) => {
      const s = dayStats(list);
      m[k] = { count: s.count, executed: s.executed, net: s.net };
    });
    return m;
  }, [grouped]);

  const monthStartKey = dayKey(startOfMonth(viewMonth));
  const monthEndKey = dayKey(endOfMonth(viewMonth));
  const inMonth = (k) => k >= monthStartKey && k <= monthEndKey;

  const hasNote = (n) =>
    !!n &&
    ((n.note || "").trim().length > 0 ||
      (n.moods || []).length > 0 ||
      n.reviewed ||
      Object.values(n.plan || {}).some((value) => String(value || "").trim().length > 0) ||
      Object.values(n.recap || {}).some((value) => String(value || "").trim().length > 0));

  // Journal streak: consecutive days (ending today) with entries or a note
  const journaledSet = useMemo(() => {
    const s = new Set(Object.keys(grouped));
    Object.entries(dayNotes).forEach(([k, n]) => hasNote(n) && s.add(k));
    return s;
  }, [grouped, dayNotes]);

  const streak = useMemo(() => {
    let count = 0;
    let d = new Date();
    if (!journaledSet.has(dayKey(d))) d = subDays(d, 1); // today not logged yet doesn't break it
    while (journaledSet.has(dayKey(d))) {
      count++;
      d = subDays(d, 1);
    }
    return count;
  }, [journaledSet]);

  const monthJournaled = [...journaledSet].filter(inMonth).length;
  const monthDaysElapsed = isSameMonth(viewMonth, new Date())
    ? new Date().getDate()
    : endOfMonth(viewMonth).getDate();

  // The feed: newest day first
  const feedDays = useMemo(() => {
    const keys = new Set(Object.keys(grouped).filter(inMonth));
    Object.entries(dayNotes).forEach(([k, n]) => inMonth(k) && hasNote(n) && keys.add(k));
    const filtering = filter !== "all" || search.trim();
    if (!filtering && inMonth(selectedDate)) keys.add(selectedDate);

    const term = search.trim().toLowerCase();
    return [...keys]
      .sort()
      .reverse()
      .map((k) => {
        const list = grouped[k] || [];
        return { key: k, list, stats: dayStats(list), note: dayNotes[k] };
      })
      .filter((d) => {
        if (filter === "win" && !(d.stats.net > 0)) return false;
        if (filter === "loss" && !(d.stats.net < 0)) return false;
        if (filter === "noted" && !hasNote(d.note)) return false;
        if (term && !d.list.some((e) => String(e.pair || "").toLowerCase().includes(term))) return false;
        return true;
      });
  }, [grouped, dayNotes, filter, search, selectedDate, monthStartKey, monthEndKey]);

  // ─── Scorecard: selected day vs last 30 days ────────────────────────
  const selectedList = grouped[selectedDate] || [];
  const scoreDay = useMemo(() => scoreEntries(selectedList), [selectedList]);
  const score30 = useMemo(() => {
    const from = dayKey(subDays(new Date(), 29));
    return scoreEntries(entries.filter((e) => entryDay(e) >= from && entryDay(e) <= todayKey));
  }, [entries, todayKey]);
  const scoreMain = scoreDay || score30;
  const selectedIsToday = selectedDate === todayKey;

  // ─── Calendar (right rail) ──────────────────────────────────────────
  const calendarDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 0 }),
        end: endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 0 }),
      }),
    [viewMonth]
  );

  // ─── Chart theming ───────────────────────────────────────────────────
  const chartText = isDark ? "#8a8fb5" : "#6b7090";
  const chartGrid = isDark ? "rgba(138,143,181,0.14)" : "rgba(107,112,144,0.16)";
  const tooltipBase = {
    backgroundColor: isDark ? "#0b0b19" : "#ffffff",
    titleColor: isDark ? "#ffffff" : "#14142b",
    bodyColor: isDark ? "#c9ccea" : "#3b3f5e",
    borderColor: isDark ? "#262645" : "#e6e8f2",
    borderWidth: 1,
    padding: 10,
    cornerRadius: 8,
    displayColors: false,
  };

  const radarData = {
    labels: SCORE_LABELS,
    datasets: [
      score30 && {
        label: "Last 30 days",
        data: score30.scores,
        borderColor: isDark ? "rgba(138,143,181,0.85)" : "rgba(107,112,144,0.85)",
        backgroundColor: "rgba(138,143,181,0.07)",
        borderDash: [5, 4],
        borderWidth: 1.5,
        pointRadius: 0,
      },
      scoreDay && {
        label: selectedIsToday ? "Today" : format(parseISO(selectedDate), "d MMM"),
        data: scoreDay.scores,
        borderColor: ac.hex,
        backgroundColor: ac.hex + "38",
        borderWidth: 2.5,
        pointBackgroundColor: ac.hex,
        pointBorderColor: isDark ? "#15152b" : "#fff",
        pointRadius: 4,
        pointHoverRadius: 6,
      },
    ].filter(Boolean),
  };

  const radarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      r: {
        min: 0,
        max: 100,
        ticks: { display: false, stepSize: 25 },
        grid: { color: chartGrid },
        angleLines: { color: chartGrid },
        pointLabels: { color: chartText, font: { size: 10, weight: "600" } },
      },
    },
    plugins: {
      legend: {
        position: "bottom",
        labels: { color: chartText, usePointStyle: true, boxWidth: 8, padding: 12 },
      },
      tooltip: {
        ...tooltipBase,
        displayColors: true,
        callbacks: { label: (c) => ` ${c.dataset.label}: ${Math.round(c.parsed.r)}%` },
      },
    },
  };

  const sparkOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { ...tooltipBase, callbacks: { label: (c) => ` ${money(c.parsed.y, false)}` } },
    },
    scales: {
      x: { display: false },
      y: {
        grid: { color: isDark ? "rgba(255,255,255,0.05)" : "#eef0f4", drawTicks: false },
        border: { display: false },
        ticks: {
          color: isDark ? "#6b7090" : "#98a2b3",
          font: { size: 10 },
          maxTicksLimit: 4,
          padding: 6,
          callback: (value) => `${Number(value) < 0 ? "-" : ""}$${Math.abs(Number(value)).toLocaleString()}`,
        },
      },
    },
  };

  const sparkData = (list, net) => {
    const { labels, values } = intraday(list);
    const color = net >= 0 ? POS : NEG;
    return {
      labels,
      datasets: [
        {
          data: values,
          borderColor: color,
          backgroundColor: (ctx) => {
            const { chart } = ctx;
            const { ctx: c, chartArea } = chart;
            if (!chartArea) return color + "22";
            const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            g.addColorStop(0, color + "55");
            g.addColorStop(1, color + "00");
            return g;
          },
          fill: true,
          tension: 0.25,
          borderWidth: 2.25,
          pointRadius: values.length > 12 ? 0 : 3,
          pointHoverRadius: 5,
          pointBackgroundColor: color,
          pointBorderColor: isDark ? "#15152b" : "#fff",
        },
      ],
    };
  };

  // ─── Navigation helpers ──────────────────────────────────────────────
  const selectDay = (key) => {
    setSelectedDate(key);
    setViewMonth(startOfMonth(parseISO(key)));
    setTimeout(() => {
      document.getElementById(`day-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 140);
  };

  // ─── Entry modal helpers ─────────────────────────────────────────────
  const openNewEntry = (dateKey = selectedDate) => {
    if (!isAccountReady) return;
    const now = formatDateTimeLocal();
    const base = dateKey === todayKey ? now : `${dateKey}T${now.slice(11)}`;
    setEditingEntry(null);
    setForm(emptyForm(base));
    resetPlaybookForm();
    setModalOpen(true);
  };

  const openEdit = (entry) => {
    setEditingEntry(entry);
    setForm({
      openDateTime:
        entry.openDateTime ||
        (entry.date ? `${String(entry.date).slice(0, 10)}T00:00` : formatDateTimeLocal()),
      closeDateTime: entry.closeDateTime || formatDateTimeLocal(),
      pair: entry.pair || "",
      direction: entry.direction || "Long",
      entry: entry.entry?.toString() || "",
      exit: entry.exit?.toString() || "",
      stopLoss: entry.stopLoss?.toString() || "",
      takeProfit: entry.takeProfit?.toString() || "",
      notes: entry.notes || "",
      pnl: entry.pnl?.toString() || "",
      rr: entry.rr || "",
      lotSize: entry.lotSize?.toString() || "0.1",
      status: entry.status || "executed",
      confluences: Array.isArray(entry.confluences) ? entry.confluences : [],
      screenshotUrl: entry.screenshotUrl || "",
      playbookId: entry.playbookId || "",
      playbookRules: Array.isArray(entry.playbookRules) ? entry.playbookRules : [],
      playbookChecks: Array.isArray(entry.playbookChecks) ? entry.playbookChecks : [],
    });
    resetPlaybookForm();
    setModalOpen(true);
  };

  // ─── Save entry ────────────────────────────────────────────────────
  const saveEntry = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!currentAccount?.id) {
      setError("Please select an account");
      return;
    }
    if (PREVIEW) {
      setSuccessMsg("Entry saved (preview mode – not persisted)");
      setModalOpen(false);
      setEditingEntry(null);
      setForm(emptyForm());
      return;
    }
    if (!user) {
      setError("Please log in and select an account");
      return;
    }

    const payload = {
      openDateTime: form.openDateTime || formatDateTimeLocal(),
      closeDateTime: form.status === "pending" ? null : form.closeDateTime || null,
      pair: form.pair?.toUpperCase() || "",
      direction: form.direction || "Long",
      entry: Number(form.entry) || 0,
      exit: form.status === "pending" ? 0 : Number(form.exit) || 0,
      stopLoss: Number(form.stopLoss) || 0,
      takeProfit: Number(form.takeProfit) || 0,
      pnl: form.status === "pending" ? 0 : Number(form.pnl) || 0,
      rr: form.status === "pending" ? "" : form.rr,
      lotSize: Number(form.lotSize) || 0.1,
      notes: form.notes || "",
      status: form.status || "executed",
      confluences: form.confluences || [],
      screenshotUrl: form.screenshotUrl || "",
      playbookId: form.playbookId || "",
      playbook: form.playbookId ? selectedPlaybook?.name || editingEntry?.playbook || "" : "",
      playbookRules: activeRules,
      playbookChecks: form.playbookChecks || [],
    };
    // New trades record the setup name as their strategy; edits only touch it
    // when a playbook is actually chosen, so handwritten strategies survive.
    if (!editingEntry || form.playbookId) {
      payload.strategy = form.playbookId ? selectedPlaybook?.name || "" : "";
    }

    try {
      if (editingEntry) {
        await updateDoc(
          doc(db, "users", user.uid, "accounts", currentAccount.id, "trades", editingEntry.id),
          { ...payload, updatedAt: serverTimestamp() }
        );
        setSuccessMsg("Entry updated successfully!");
      } else {
        await addDoc(collection(db, "users", user.uid, "accounts", currentAccount.id, "trades"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setSuccessMsg("Entry added successfully!");
      }
      const savedDay = String(payload.openDateTime).slice(0, 10);
      setSelectedDate(savedDay);
      setViewMonth(startOfMonth(parseISO(savedDay)));
      setModalOpen(false);
      setEditingEntry(null);
      setForm(emptyForm());
      await refreshEntries();
    } catch (err) {
      console.error("Save error:", err);
      setError("Failed to save entry: " + err.message);
    }
  };

  // ─── Save day note ─────────────────────────────────────────────────
  const saveDayNote = async (key, data) => {
    if (!currentAccount?.id) return;
    if (PREVIEW) {
      setDayNotes((m) => ({ ...m, [key]: { ...(m[key] || {}), ...data, date: key } }));
      setSuccessMsg("Note saved (preview mode – not persisted)");
      return;
    }
    if (!user) return;
    try {
      await setDoc(
        doc(db, "users", user.uid, "accounts", currentAccount.id, "journal", key),
        { ...data, date: key, updatedAt: serverTimestamp() },
        { merge: true }
      );
      setDayNotes((m) => ({ ...m, [key]: { ...(m[key] || {}), ...data, date: key } }));
      setSuccessMsg("Day note saved");
    } catch (err) {
      console.error("Day note save failed:", err);
      setError("Could not save the day note: " + (err.message || "check Firestore rules for the journal collection"));
    }
  };

  // ─── Delete entry ──────────────────────────────────────────────────
  const deleteEntry = async (id) => {
    if (!user || !currentAccount?.id) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "accounts", currentAccount.id, "trades", id));
      setSuccessMsg("Entry deleted successfully");
      await refreshEntries();
    } catch (err) {
      console.error("Delete failed:", err);
      setError("Failed to delete entry");
    }
    setDeleteModalOpen(false);
    setEntryToDelete(null);
  };

  // ─── Clear all entries of one day ──────────────────────────────────
  const clearDay = async () => {
    if (!user || !currentAccount?.id || !clearDayKey) return;
    try {
      await Promise.all(
        (grouped[clearDayKey] || []).map((e) =>
          deleteDoc(doc(db, "users", user.uid, "accounts", currentAccount.id, "trades", e.id))
        )
      );
      setSuccessMsg("Entries cleared successfully");
      await refreshEntries();
    } catch (err) {
      console.error("Batch delete failed:", err);
      setError("Failed to clear entries");
    }
    setDeleteModalOpen(false);
    setClearDayKey(null);
  };

  // ─── If no account selected ───────────────────────────────────────
  if (!currentAccount) {
    return (
      <div className={`${isDark ? "dark bg-[#0b0b19]" : "bg-[#f4f5fa]"} min-h-screen w-full p-8 flex items-center justify-center`}>
        <Card className={`${CARD} p-8 max-w-md text-center`}>
          <AlertCircle size={44} className="mx-auto text-amber-500 mb-4" />
          <h2 className={`text-xl font-bold mb-2 ${HEAD}`}>No account selected</h2>
          <p className={MUTED}>Create or select an account from the sidebar to start journaling.</p>
        </Card>
      </div>
    );
  }

  const monthLabel = format(viewMonth, "MMMM yyyy");
  const monthToneMax = (() => {
    const prefix = format(viewMonth, "yyyy-MM");
    return Object.entries(dayTotals).reduce(
      (max, [key, value]) =>
        key.startsWith(prefix) && value.executed ? Math.max(max, Math.abs(value.net)) : max,
      1
    );
  })();
  const FILTERS = [
    ["all", "All days"],
    ["win", "Green"],
    ["loss", "Red"],
    ["noted", "With notes"],
  ];

  return (
    <div
      className={`${isDark ? "dark bg-[#0b0b19] text-[#e8e9f7]" : "bg-[#f8f9fc] text-[#14142b]"} min-h-screen w-full p-3 sm:p-5 lg:p-6`}
    >
      <div className="mx-auto max-w-[1600px]">
        {/* ───────── Page header + toolbar ───────── */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className={`text-[15px] font-semibold tracking-tight ${HEAD}`}>Day View</h1>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => selectDay(todayKey)}
              title="Jump to today"
              aria-label="Jump to today"
              className={TOOL_BTN}
            >
              <DollarSign size={14} />
            </button>

            <div className="relative">
              <div className={`${TOOL_BTN} gap-2`}>
                <Filter size={13} />
                <span className="tabular-nums">
                  {(filter !== "all" ? 1 : 0) + (search ? 1 : 0) || 1} filter
                </span>
                <button
                  type="button"
                  onClick={() => setFilterOpen((open) => !open)}
                  aria-expanded={filterOpen}
                  aria-label="Filter days"
                  className="rounded p-0.5 opacity-70 transition-opacity hover:opacity-100"
                >
                  <Settings size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilter("all");
                    setSearch("");
                  }}
                  aria-label="Clear filters"
                  className="rounded p-0.5 opacity-70 transition-opacity hover:opacity-100"
                >
                  <X size={12} />
                </button>
              </div>

              {filterOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setFilterOpen(false)} />
                  <div className={`absolute right-0 top-full z-40 mt-1 w-60 rounded-lg border bg-white p-2 shadow-xl dark:bg-[#15152b] ${DIVIDER}`}>
                    <div className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${DIVIDER}`}>
                      <Search size={13} className={MUTED} />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search symbol"
                        aria-label="Search by symbol"
                        className="w-full bg-transparent text-[12px] outline-none"
                        autoFocus
                      />
                    </div>
                    <div className="mt-1.5 space-y-0.5">
                      {FILTERS.map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setFilter(key);
                            setFilterOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${
                            filter === key ? "font-semibold" : ""
                          } ${HEAD} ${FOCUS}`}
                        >
                          {label}
                          {filter === key ? <Check size={12} style={{ color: ac.hex }} /> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => selectDay(todayKey)}
              className={TOOL_BTN}
            >
              <CalendarDays size={13} />
              {format(subDays(new Date(), 30), "MMM dd, yyyy")}-{format(new Date(), "MMM dd, yyyy")}
              <ChevronDown size={13} className="opacity-60" />
            </button>

            <button
              type="button"
              onClick={() => navigate("/add-trade")}
              title="Switch trading account"
              className={TOOL_BTN}
            >
              <User size={13} />
              <span className="max-w-[140px] truncate">{currentAccount.name}</span>
              <ChevronDown size={13} className="opacity-60" />
            </button>
          </div>
        </div>

        {/* ───────── Announcement ───────── */}
        {bannerOpen && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-[#ddd6fe] bg-gradient-to-r from-[#f6f3ff] via-white to-white px-3 py-2 dark:border-[#392f66] dark:from-[#191233] dark:via-[#15152b] dark:to-[#15152b]">
            <span className="rounded bg-[#6C47FF] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              New
            </span>
            <p className={`min-w-0 flex-1 text-[12.5px] ${HEAD}`}>
              Generate in-depth analysis for your existing accounts and receive monthly performance reports
            </p>
            <button
              type="button"
              onClick={() => navigate("/add-trade")}
              className={`rounded-md px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110 ${FOCUS}`}
              style={{ backgroundColor: ac.hex }}
            >
              To Accounts
            </button>
            <button
              type="button"
              onClick={() => {
                setBannerOpen(false);
                try {
                  localStorage.setItem("forgexDayViewBanner", "off");
                } catch {}
              }}
              aria-label="Dismiss announcement"
              className={`${MUTED} transition-colors hover:text-[#14142b] dark:hover:text-white ${FOCUS}`}
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* Feedback */}
        {error && (
          <div role="alert" className="mb-4 flex items-center gap-3 rounded-lg border border-[#f2556e]/30 bg-[#f2556e]/10 px-4 py-3 text-sm font-medium text-[#d93a57] dark:text-[#ff6b86]">
            <AlertCircle size={16} className="shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss"><X size={15} /></button>
          </div>
        )}
        {successMsg && (
          <div role="status" className="mb-4 flex items-center gap-3 rounded-lg border border-[#22c493]/30 bg-[#22c493]/10 px-4 py-3 text-sm font-medium text-[#0e9f77] dark:text-[#2dd4a0]">
            <Check size={16} className="shrink-0" />
            {successMsg}
          </div>
        )}

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_236px]">
            {/* ───────── Right rail (first on phones) ───────── */}
            <div className="order-first lg:order-last flex flex-col gap-4 lg:sticky lg:top-20">
              {/* Month calendar */}
              <Card className={`${CARD} p-0`}>
                <div className="flex items-center justify-between px-2.5 pb-1 pt-2.5">
                  <button
                    type="button"
                    onClick={() => setViewMonth(subMonths(viewMonth, 1))}
                    aria-label="Previous month"
                    className={`flex h-6 w-6 items-center justify-center rounded-md ${MUTED} hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${FOCUS}`}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <h3 className={`text-[12.5px] font-semibold ${HEAD}`}>{monthLabel}</h3>
                  <button
                    type="button"
                    onClick={() => setViewMonth(addMonths(viewMonth, 1))}
                    aria-label="Next month"
                    className={`flex h-6 w-6 items-center justify-center rounded-md ${MUTED} hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${FOCUS}`}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
                <div className="px-2.5 pb-3 pt-1">
                  <div className="grid grid-cols-7 gap-[3px]">
                    {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                      <div key={d} className={`pb-1 text-center text-[9.5px] font-medium ${MUTED}`}>
                        {d}
                      </div>
                    ))}
                    {calendarDays.map((d) => {
                      const k = dayKey(d);
                      const t = dayTotals[k];
                      const cur = isSameMonth(d, viewMonth);
                      const sel = k === selectedDate;
                      const ratio = t && t.executed ? Math.min(1, Math.abs(t.net) / monthToneMax) : 0;
                      let tone;
                      if (t && t.executed) {
                        tone = `rgba(${t.net >= 0 ? "18,183,106" : "240,68,56"},${(0.16 + ratio * 0.28).toFixed(2)})`;
                      } else if (t) {
                        tone = "rgba(245,158,11,0.14)";
                      } else if (cur) {
                        tone = isDark ? "rgba(255,255,255,0.05)" : "#f6f7f9";
                      }
                      return (
                        <button
                          key={k}
                          onClick={() => selectDay(k)}
                          aria-label={`${format(d, "d MMMM")}${t ? `, ${t.count} entries` : ""}`}
                          aria-current={isToday(d) ? "date" : undefined}
                          className={`relative flex h-7 items-center justify-center rounded-md text-[11px] font-medium tabular-nums transition-colors hover:brightness-95 dark:hover:brightness-110 ${FOCUS} ${
                            cur ? HEAD : `${MUTED} opacity-40`
                          }`}
                          style={{
                            backgroundColor: sel
                              ? isDark
                                ? "#101024"
                                : "#ffffff"
                              : tone,
                            boxShadow: sel
                              ? `inset 0 0 0 1.5px ${ac.hex}`
                              : isToday(d)
                              ? `inset 0 0 0 1px ${ac.hex}66`
                              : undefined,
                          }}
                        >
                          {format(d, "d")}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Card>
            </div>

            {/* ───────── Day feed ───────── */}
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className={`flex items-center gap-0.5 rounded-md border ${DIVIDER} bg-white p-0.5 dark:bg-[#15152b]`}>
                  {[
                    ["day", "Day"],
                    ["week", "Week"],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setViewMode(key)}
                      aria-pressed={viewMode === key}
                      className={`rounded-[4px] px-3 py-1.5 text-[12px] transition-colors ${FOCUS} ${
                        viewMode === key
                          ? "bg-[#f2f3f7] font-medium dark:bg-[#1e1e3a] " + HEAD
                          : MUTED
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNoteDateKey(selectedDate);
                      setNoteModalOpen(true);
                    }}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold text-white transition hover:brightness-110 active:scale-[0.98] ${FOCUS}`}
                    style={{ backgroundColor: ac.hex }}
                  >
                    <Sparkles size={13} />
                    Start my day
                  </button>
                  <button
                    onClick={() => navigate("/settings")}
                    className={`flex h-8 w-8 items-center justify-center rounded-md border text-[#6b7090] transition-colors hover:bg-[#f9fafb] hover:text-[#14142b] dark:border-[#262645] dark:text-[#8a8fb5] dark:hover:bg-[#1e1e3a] dark:hover:text-white ${
                      isDark ? "border-[#262645]" : "border-[#e6e8f2]"
                    } ${FOCUS}`}
                    aria-label="Settings"
                  >
                    <Settings size={15} />
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="flex h-60 items-center justify-center">
                  <div
                    className="h-9 w-9 animate-spin rounded-full border-2 border-[#e6e8f2] dark:border-[#262645]"
                    style={{ borderTopColor: ac.hex }}
                    role="progressbar"
                    aria-label="Loading journal"
                  />
                </div>
              ) : !isAccountReady ? (
                <Card className={`${CARD} p-8 text-center`}>
                  <p className={`text-lg font-semibold ${HEAD}`}>Preparing your account...</p>
                  <p className={`mt-1 text-sm ${MUTED}`}>Please wait while we set up your journal.</p>
                </Card>
              ) : feedDays.length === 0 ? (
                <Card className={`${CARD} p-10 text-center`}>
                  <CalendarDays size={36} className={`mx-auto mb-3 opacity-40 ${MUTED}`} />
                  <p className={`text-lg font-semibold ${HEAD}`}>
                    {filter !== "all" || search ? "No days match your filters" : `No entries in ${monthLabel}`}
                  </p>
                  <p className={`mt-1 mb-5 text-sm ${MUTED}`}>
                    {filter !== "all" || search
                      ? "Clear the filters to see every day."
                      : "Log a trade or write a day note to start your journal for this month."}
                  </p>
                  {filter !== "all" || search ? (
                    <button
                      onClick={() => {
                        setFilter("all");
                        setSearch("");
                      }}
                      className={`rounded-lg border ${DIVIDER} px-4 py-2 text-sm font-semibold ${HEAD} hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${FOCUS}`}
                    >
                      Clear filters
                    </button>
                  ) : (
                    <Button
                      onClick={() => openNewEntry(selectedDate)}
                      style={{ backgroundColor: ac.hex }}
                      className="text-white font-semibold hover:brightness-110"
                    >
                      <Plus size={16} className="mr-2" /> Log first entry
                    </Button>
                  )}
                </Card>
              ) : (
                                feedDays.map((d) => {
                  const s = d.stats;
                  const isExpanded = !!expandedDay[d.key];
                  const dateObj = parseISO(d.key);
                  const pnl = Number(s.net) || 0;
                  const hadTrades = s.executed > 0;
                  const noted = hasNote(d.note);
                  const stats = [
                    ["Total Trades", s.count],
                    ["Gross P&L", hadTrades ? money(s.gross, false) : "—"],
                    ["Winners/Losers", s.executed ? `${s.wins}/${s.losses}` : "—"],
                    ["Commissions", money(s.commission, false)],
                    ["Win Rate", s.executed ? `${s.winRate}%` : "—"],
                    ["Volume", Number(s.lots.toFixed(2))],
                    ["Profit Factor", s.pf],
                  ];
                  return (
                    <Card
                      key={d.key}
                      id={`day-${d.key}`}
                      className={`${CARD} scroll-mt-6 overflow-hidden p-0`}
                    >
                      {/* Day header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
                        <button
                          type="button"
                          onClick={() => setExpandedDay((c) => ({ ...c, [d.key]: !c[d.key] }))}
                          aria-expanded={isExpanded}
                          aria-label={`Toggle trades for ${format(dateObj, "EEE, MMM d, yyyy")}`}
                          className={`flex min-w-0 flex-1 items-center gap-2 rounded-md py-0.5 text-left ${FOCUS}`}
                        >
                          <ChevronRight
                            size={14}
                            className={`shrink-0 transition-transform ${MUTED} ${isExpanded ? "rotate-90" : ""}`}
                          />
                          <span className={`truncate text-[13.5px] font-semibold ${HEAD}`}>
                            {format(dateObj, "EEE, MMM d, yyyy")}
                          </span>
                          <span className={`text-[13px] ${MUTED}`}>·</span>
                          <span className="whitespace-nowrap text-[13px]">
                            <span className={`font-medium ${HEAD}`}>Net P&amp;L </span>
                            <span className={`font-semibold tabular-nums ${hadTrades ? pnlClass(pnl) : MUTED}`}>
                              {hadTrades ? money(pnl, false) : "—"}
                            </span>
                          </span>
                          {isToday(dateObj) && (
                            <span
                              className="rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-white"
                              style={{ backgroundColor: ac.hex }}
                            >
                              Today
                            </span>
                          )}
                        </button>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => navigate(`/mentor?date=${d.key}`)}
                            className={CARD_BTN}
                          >
                            <Trophy size={12} style={{ color: ac.hex }} /> Review with AI
                          </button>
                          <button
                            type="button"
                            onClick={() => navigate(`/replay?date=${d.key}`)}
                            className={CARD_BTN}
                          >
                            <Play size={11} style={{ color: ac.hex }} /> Replay
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setNoteDateKey(d.key);
                              setNoteModalOpen(true);
                            }}
                            className={CARD_BTN}
                          >
                            <Plus size={12} style={{ color: ac.hex }} /> Add note
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setNoteDateKey(d.key);
                              setNoteModalOpen(true);
                            }}
                            aria-label={`Day note for ${format(dateObj, "d MMMM")}`}
                            title={noted ? "Open day note" : "Write day note"}
                            className={`ml-0.5 flex h-7 w-7 items-center justify-center rounded-md ${MUTED} transition-colors hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${FOCUS}`}
                          >
                            <FileText size={14} />
                          </button>
                        </div>
                      </div>

                      {!isExpanded ? null : d.list.length === 0 ? (
                        <div className="px-5 pb-5 text-center">
                          {noted ? (
                            <p className={`mx-auto max-w-xl whitespace-pre-line text-left text-[12.5px] leading-relaxed ${MUTED}`}>
                              {(d.note?.note || "").trim().slice(0, 320) || "Day note saved."}
                            </p>
                          ) : (
                            <p className={`text-[12.5px] ${MUTED}`}>No trades logged on this day.</p>
                          )}
                          <button
                            type="button"
                            onClick={() => openNewEntry(d.key)}
                            disabled={!isAccountReady}
                            style={{ color: ac.hex }}
                            className={`mt-2 rounded text-[12.5px] font-semibold hover:underline ${FOCUS} disabled:cursor-not-allowed disabled:opacity-40`}
                          >
                            + Log an entry
                          </button>
                        </div>
                      ) : (
                        <>
                          {/* Sparkline + stats */}
                          <div className="grid grid-cols-1 gap-0 pb-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,2fr)]">
                            <div className="px-4 pb-2 pt-1 sm:px-5">
                              <div className="relative h-[132px]">
                                <Line data={sparkData(d.list, s.net)} options={sparkOptions} />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-x-5 gap-y-6 px-4 pb-5 pt-2 sm:grid-cols-4 sm:px-5">
                              {stats.map(([label, value]) => (
                                <div key={label}>
                                  <div className={`text-[10.5px] ${MUTED}`}>{label}</div>
                                  <div className={`mt-1 text-[12.5px] font-semibold tabular-nums ${HEAD}`}>
                                    {value}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {isExpanded && (
                            <>
                              {/* Trades table */}
                              <div className={`overflow-x-auto border-t ${DIVIDER}`}>
                                <table className="w-full min-w-[560px] text-sm">
                                  <thead>
                                    <tr className={`border-b text-left text-[11px] ${MUTED} ${DIVIDER}`}>
                                      <th className="px-4 py-2 font-medium sm:px-5">Time</th>
                                      <th className="px-3 py-2 font-medium">Symbol</th>
                                      <th className="px-3 py-2 font-medium">Side</th>
                                      <th className="px-3 py-2 text-right font-medium">Lots</th>
                                      <th className="px-3 py-2 text-right font-medium">R:R</th>
                                      <th className="px-3 py-2 text-right font-medium">Net P&L</th>
                                      <th className="px-4 py-2 text-right font-medium sm:px-5">
                                        <span className="sr-only">Actions</span>
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {d.list.map((entry) => {
                                      const pending = entry.status === "pending";
                                      const p = Number(entry.pnl) || 0;
                                      const isLong = /buy|long/i.test(String(entry.direction || ""));
                                      const extras =
                                        entry.notes ||
                                        entry.screenshotUrl ||
                                        (entry.confluences || []).length > 0 ||
                                        entry.playbook ||
                                        entry.strategy ||
                                        (entry.playbookRules || []).length > 0;
                                      return (
                                        <React.Fragment key={entry.id}>
                                          <tr
                                            className={`border-b ${DIVIDER} ${extras ? "border-b-0" : ""} transition-colors hover:bg-[#f7f8fc] dark:hover:bg-[#1b1b36]`}
                                          >
                                            <td className={`whitespace-nowrap px-4 py-2.5 tabular-nums sm:px-5 ${MUTED}`}>
                                              {timeOf(entry)}
                                            </td>
                                            <td className={`px-3 py-2.5 text-[12.5px] font-semibold ${HEAD}`}>
                                              {entry.pair || "—"}
                                            </td>
                                            <td className="px-3 py-2.5">
                                              <span
                                                className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                                                  isLong
                                                    ? "bg-[#22c493]/15 text-[#0e9f77] dark:text-[#2dd4a0]"
                                                    : "bg-[#f2556e]/15 text-[#d93a57] dark:text-[#ff6b86]"
                                                }`}
                                              >
                                                {entry.direction || "—"}
                                              </span>
                                            </td>
                                            <td className={`px-3 py-2.5 text-right text-[12px] tabular-nums ${MUTED}`}>
                                              {entry.lotSize || "—"}
                                            </td>
                                            <td className={`px-3 py-2.5 text-right text-[12px] tabular-nums ${MUTED}`}>
                                              {!pending && entry.rr ? entry.rr : "—"}
                                            </td>
                                            <td
                                              className={`px-3 py-2.5 text-right text-[12px] font-bold tabular-nums ${
                                                pending ? "text-amber-600 dark:text-amber-400" : pnlClass(p)
                                              }`}
                                            >
                                              {pending ? "Pending" : money(p)}
                                            </td>
                                            <td className="px-4 py-2.5 sm:px-5">
                                              <div className="flex justify-end gap-0.5">
                                                <button
                                                  onClick={() => openEdit(entry)}
                                                  aria-label="Edit entry"
                                                  className={`rounded-md p-1.5 ${MUTED} hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${FOCUS}`}
                                                >
                                                  <Pencil size={13} />
                                                </button>
                                                <button
                                                  onClick={() => {
                                                    setClearDayKey(null);
                                                    setEntryToDelete(entry.id);
                                                    setDeleteModalOpen(true);
                                                  }}
                                                  aria-label="Delete entry"
                                                  className={`rounded-md p-1.5 text-[#d93a57] hover:bg-[#f2556e]/10 dark:text-[#ff6b86] ${FOCUS}`}
                                                >
                                                  <Trash2 size={13} />
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                          {extras && (
                                            <tr className={`border-b ${DIVIDER}`}>
                                              <td colSpan={7} className="px-4 pb-3 pt-0 sm:px-5">
                                                <div className="flex flex-wrap items-start gap-3">
                                                  {entry.screenshotUrl && (
                                                    <a
                                                      href={entry.screenshotUrl}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                      className="shrink-0"
                                                    >
                                                      <img
                                                        src={entry.screenshotUrl}
                                                        alt={`${entry.pair || "Trade"} chart`}
                                                        className={`h-16 w-24 rounded-lg border object-cover transition hover:opacity-80 ${DIVIDER}`}
                                                      />
                                                    </a>
                                                  )}
                                                  <div className="min-w-0 flex-1 space-y-2">
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                      {(entry.playbook || entry.strategy) && (
                                                        <span
                                                          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold"
                                                          style={{ backgroundColor: ac.hex + "22", color: ac.hex }}
                                                        >
                                                          <ListChecks size={10} />
                                                          {entry.playbook || entry.strategy}
                                                        </span>
                                                      )}
                                                      {(entry.confluences || []).map((c) => (
                                                        <span
                                                          key={c}
                                                          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold"
                                                          style={{ backgroundColor: ac.hex + "22", color: ac.hex }}
                                                        >
                                                          <Tag size={10} />
                                                          {c}
                                                        </span>
                                                      ))}
                                                    </div>
                                                    {(entry.playbookRules || []).length > 0 && (
                                                      <ul className="space-y-1">
                                                        {(entry.playbookRules || []).map((rule) => {
                                                          const done = (entry.playbookChecks || []).includes(rule);
                                                          return (
                                                            <li key={rule} className="flex items-start gap-1.5 text-[11.5px]">
                                                              <span
                                                                className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border ${
                                                                  done ? "border-transparent" : DIVIDER
                                                                }`}
                                                                style={done ? { backgroundColor: POS } : undefined}
                                                              >
                                                                {done && <Check size={9} className="text-white" />}
                                                              </span>
                                                              <span className={done ? MUTED : HEAD}>{rule}</span>
                                                            </li>
                                                          );
                                                        })}
                                                      </ul>
                                                    )}
                                                    {entry.notes && (
                                                      <p className={`line-clamp-3 text-[12.5px] leading-relaxed ${MUTED}`}>{entry.notes}</p>
                                                    )}
                                                  </div>
                                                </div>
                                              </td>
                                            </tr>
                                          )}
                                        </React.Fragment>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>

                              {d.list.length > 0 && (
                            <div className={`flex items-center justify-between gap-3 border-t px-4 py-2 ${DIVIDER}`}>
                              <button
                                type="button"
                                onClick={() => {
                                  setNoteDateKey(d.key);
                                  setNoteModalOpen(true);
                                }}
                                className={`inline-flex items-center gap-1.5 rounded text-[11px] font-medium hover:underline ${MUTED} ${FOCUS}`}
                              >
                                <BookOpen size={11} /> {noted ? "Open day note" : "Write day note"}
                              </button>
                              <button
                                onClick={() => {
                                  setEntryToDelete(null);
                                  setClearDayKey(d.key);
                                  setDeleteModalOpen(true);
                                }}
                                className={`rounded text-[11px] font-semibold text-[#d93a57] hover:underline dark:text-[#ff6b86] ${FOCUS}`}
                              >
                                Clear this day's entries
                              </button>
                            </div>
                          )}
                        </>
                      )}
                      </>
                    )}
                    </Card>
                  );
                })
              )}
            </div>
          </div>

        {/* ───────── Day view note dialog ───────── */}
        {noteModalOpen && (
          <DayNoteModal
            key={noteDateKey}
            dateKey={noteDateKey}
            saved={dayNotes[noteDateKey]}
            stats={dayStats(grouped[noteDateKey] || [])}
            accent={ac.hex}
            onSave={saveDayNote}
            onClose={() => setNoteModalOpen(false)}
          />
        )}

        {/* ───────── Add / Edit Entry Modal ───────── */}
        {modalOpen && (
          <div className="fixed inset-0 z-[1500] flex items-end sm:items-center justify-center overflow-y-auto bg-black/70 p-0 sm:p-4">
            <div
              ref={modalContentRef}
              role="dialog"
              aria-modal="true"
              aria-label={editingEntry ? "Edit entry" : "Add entry"}
              className={`w-full max-w-2xl overflow-hidden rounded-t-2xl sm:rounded-2xl border bg-white dark:bg-[#15152b] shadow-2xl ${DIVIDER}`}
            >
              <div className="max-h-[92dvh] overflow-y-auto">
                <div className={`sticky top-0 z-10 flex items-center justify-between border-b bg-white dark:bg-[#15152b] px-5 sm:px-6 py-4 ${DIVIDER}`}>
                  <div>
                    <h2 className={`text-lg font-bold ${HEAD}`}>{editingEntry ? "Edit entry" : "Add entry"}</h2>
                    <p className={`text-xs mt-0.5 ${MUTED}`}>You can paste a chart screenshot anywhere in this window.</p>
                  </div>
                  <button
                    onClick={() => setModalOpen(false)}
                    aria-label="Close"
                    className={`rounded-lg p-2 ${MUTED} hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${FOCUS}`}
                  >
                    <X size={20} />
                  </button>
                </div>

                <form onSubmit={saveEntry} className="space-y-4 p-5 sm:p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="block text-sm font-medium mb-1.5">Open date & time</Label>
                      <Input
                        type="datetime-local"
                        value={form.openDateTime}
                        onChange={(e) => setForm({ ...form, openDateTime: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="block text-sm font-medium mb-1.5">Close date & time</Label>
                      <Input
                        type="datetime-local"
                        value={form.closeDateTime}
                        onChange={(e) => setForm({ ...form, closeDateTime: e.target.value })}
                        disabled={form.status === "pending"}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <Label className="block text-sm font-medium mb-1.5">Pair / asset</Label>
                      <Input
                        list="assets-list"
                        value={form.pair}
                        onChange={(e) => setForm({ ...form, pair: e.target.value.toUpperCase() })}
                        placeholder="Type or select"
                      />
                      <datalist id="assets-list">
                        {COMMON_ASSETS.map((asset) => (
                          <option key={asset} value={asset} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <Label className="block text-sm font-medium mb-1.5">Direction</Label>
                      <select
                        value={form.direction}
                        onChange={(e) => setForm({ ...form, direction: e.target.value })}
                        className={FIELD}
                      >
                        <option value="Long">Long</option>
                        <option value="Short">Short</option>
                      </select>
                    </div>
                    <div>
                      <Label className="block text-sm font-medium mb-1.5">Status</Label>
                      <select
                        value={form.status}
                        onChange={(e) => setForm({ ...form, status: e.target.value })}
                        className={FIELD}
                      >
                        <option value="executed">Executed</option>
                        <option value="pending">Pending</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <Label className="block text-sm font-medium mb-1.5">Lot size</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={form.lotSize}
                        onChange={(e) => setForm({ ...form, lotSize: e.target.value })}
                        placeholder="0.1"
                      />
                    </div>
                    <div>
                      <Label className="block text-sm font-medium mb-1.5">Entry price</Label>
                      <Input
                        type="number"
                        step="0.00001"
                        value={form.entry}
                        onChange={(e) => setForm({ ...form, entry: e.target.value })}
                        placeholder="1.08500"
                      />
                    </div>
                    <div>
                      <Label className="block text-sm font-medium mb-1.5">Exit price</Label>
                      <Input
                        type="number"
                        step="0.00001"
                        value={form.exit}
                        onChange={(e) => setForm({ ...form, exit: e.target.value })}
                        placeholder={form.status === "pending" ? "Pending, no exit" : "1.09000"}
                        disabled={form.status === "pending"}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="block text-sm font-medium mb-1.5">Stop loss</Label>
                      <Input
                        type="number"
                        step="0.00001"
                        value={form.stopLoss}
                        onChange={(e) => setForm({ ...form, stopLoss: e.target.value })}
                        placeholder="1.08200"
                      />
                    </div>
                    <div>
                      <Label className="block text-sm font-medium mb-1.5">Take profit</Label>
                      <Input
                        type="number"
                        step="0.00001"
                        value={form.takeProfit}
                        onChange={(e) => setForm({ ...form, takeProfit: e.target.value })}
                        placeholder="1.09500"
                      />
                    </div>
                  </div>

                  {/* Auto results */}
                  <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-[#e6e8f2] dark:bg-[#262645]">
                    <div className="bg-[#f7f8fc] dark:bg-[#101024] px-4 py-3">
                      <div className={`text-[11px] font-medium ${MUTED}`}>P&L (auto)</div>
                      <div
                        className={`mt-0.5 text-lg font-bold tabular-nums ${
                          form.status === "pending" || !form.pnl ? MUTED : pnlClass(form.pnl)
                        }`}
                      >
                        {form.status === "pending" ? "Pending" : form.pnl ? money(form.pnl) : "—"}
                      </div>
                    </div>
                    <div className="bg-[#f7f8fc] dark:bg-[#101024] px-4 py-3">
                      <div className={`text-[11px] font-medium ${MUTED}`}>R:R (auto)</div>
                      <div className={`mt-0.5 text-lg font-bold tabular-nums ${HEAD}`}>
                        {form.status === "pending" ? "—" : form.rr || "—"}
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label className="block text-sm font-medium mb-1.5">Confluences</Label>
                    <ConfluenceTags
                      tags={form.confluences}
                      accent={ac.hex}
                      onChange={(newTags) => setForm({ ...form, confluences: newTags })}
                    />
                  </div>

                  {/* Playbook + its rules checklist */}
                  <div className={`rounded-xl border p-3 sm:p-4 ${DIVIDER}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label className="flex items-center gap-1.5 text-sm font-medium">
                        <ListChecks size={14} style={{ color: ac.hex }} />
                        Playbook this trade came from
                      </Label>
                      <button
                        type="button"
                        onClick={() => {
                          setNewPlaybookOpen((open) => !open);
                          setPlaybookError("");
                        }}
                        aria-expanded={newPlaybookOpen}
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-semibold transition-opacity hover:opacity-80 ${FOCUS}`}
                        style={{ color: ac.hex }}
                      >
                        <Plus size={11} /> {newPlaybookOpen ? "Close" : "New playbook"}
                      </button>
                    </div>

                    <select
                      value={form.playbookId}
                      onChange={(e) => choosePlaybook(e.target.value)}
                      aria-label="Playbook"
                      className={`${FIELD} mt-2`}
                    >
                      <option value="">No playbook</option>
                      {form.playbookId && !playbooks.some((playbook) => playbook.id === form.playbookId) ? (
                        <option value={form.playbookId}>{editingEntry?.playbook || "Saved playbook"}</option>
                      ) : null}
                      {playbooks.map((playbook) => (
                        <option key={playbook.id} value={playbook.id}>
                          {playbook.name}
                        </option>
                      ))}
                    </select>
                    <p className={`mt-1.5 text-[11px] leading-relaxed ${MUTED}`}>
                      {playbooks.length
                        ? "Pick the setup behind this trade; its rules show up below as a checklist."
                        : "No playbooks on this account yet — create one here so the trade records its setup."}
                    </p>

                    {newPlaybookOpen ? (
                      <div className={`mt-2 space-y-2 rounded-lg border p-3 ${DIVIDER}`}>
                        <label htmlFor="day-new-playbook" className={`block text-[11px] font-medium ${MUTED}`}>
                          New playbook name
                        </label>
                        <input
                          id="day-new-playbook"
                          value={newPlaybookName}
                          onChange={(event) => setNewPlaybookName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              createPlaybook();
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              resetPlaybookForm();
                            }
                          }}
                          autoFocus
                          autoComplete="off"
                          placeholder="e.g. London breakout"
                          disabled={savingPlaybook}
                          className={`${FIELD} h-9 text-[13px]`}
                        />
                        {playbookError ? <p className="text-[11px] text-[#d93a57] dark:text-[#ff6b86]">{playbookError}</p> : null}
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={createPlaybook}
                            disabled={savingPlaybook}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white transition hover:brightness-110 disabled:opacity-60 ${FOCUS}`}
                            style={{ backgroundColor: ac.hex }}
                          >
                            {savingPlaybook ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                            {savingPlaybook ? "Creating…" : "Create playbook"}
                          </button>
                          <button
                            type="button"
                            onClick={resetPlaybookForm}
                            disabled={savingPlaybook}
                            className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-opacity hover:opacity-100 disabled:opacity-40 ${DIVIDER} ${MUTED} ${FOCUS}`}
                          >
                            Cancel
                          </button>
                        </div>
                        <p className={`text-[10.5px] ${MUTED}`}>
                          Rules, market and risk per trade are editable on the Playbooks page.
                        </p>
                      </div>
                    ) : null}

                    {form.playbookId ? (
                      activeRules.length > 0 ? (
                        <div className="mt-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-[10.5px] font-semibold uppercase tracking-wide ${MUTED}`}>
                              Playbook checklist
                            </span>
                            <span className={`text-[10.5px] tabular-nums ${MUTED}`}>
                              {(form.playbookChecks || []).length}/{activeRules.length} checked
                            </span>
                          </div>
                          <ul className="mt-1.5 space-y-0.5">
                            {activeRules.map((rule) => {
                              const done = (form.playbookChecks || []).includes(rule);
                              return (
                                <li key={rule}>
                                  <label
                                    className={`flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1.5 text-[12px] leading-snug transition-colors hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${
                                      done ? MUTED : HEAD
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={done}
                                      onChange={() => togglePlaybookRule(rule)}
                                      className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded"
                                      style={{ accentColor: ac.hex }}
                                    />
                                    <span className={done ? "line-through" : ""}>{rule}</span>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : (
                        <p className={`mt-3 text-[11px] ${MUTED}`}>
                          This playbook has no rules yet. Add them on the Playbooks page and they will appear here.
                        </p>
                      )
                    ) : null}
                  </div>

                  {/* Screenshot – URL input + file upload */}
                  <div>
                    <Label className="block text-sm font-medium mb-1.5">Chart screenshot</Label>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex flex-1 items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => document.getElementById("image-upload").click()}
                          disabled={uploadingImage}
                          className="flex-1"
                        >
                          {uploadingImage ? (
                            <Loader2 className="animate-spin h-4 w-4" />
                          ) : (
                            <>
                              <Upload size={16} className="mr-2" />
                              Upload image
                            </>
                          )}
                        </Button>
                        <span className={`text-xs ${MUTED}`}>or paste</span>
                        <input
                          id="image-upload"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImageUpload(file);
                          }}
                        />
                      </div>
                      <div className="flex flex-1 items-center gap-2">
                        <Link size={16} className={MUTED} />
                        <Input
                          type="url"
                          value={form.screenshotUrl}
                          onChange={(e) => setForm({ ...form, screenshotUrl: e.target.value })}
                          placeholder="https://i.imgur.com/your-image.png"
                          className="flex-1"
                        />
                      </div>
                    </div>
                    {form.screenshotUrl && (
                      <div className="mt-3 relative inline-block">
                        <img
                          src={form.screenshotUrl}
                          alt="Preview"
                          className={`h-20 w-28 rounded-lg border object-cover ${DIVIDER}`}
                          onError={(e) => (e.target.style.display = "none")}
                        />
                        <button
                          type="button"
                          aria-label="Remove screenshot"
                          onClick={() => setForm({ ...form, screenshotUrl: "" })}
                          className="absolute -top-2 -right-2 rounded-full bg-[#f2556e] p-1 text-white"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <Label className="block text-sm font-medium mb-1.5">Notes / thoughts</Label>
                    <textarea
                      placeholder="What went well? What to improve? Emotional state? Market context?"
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      className={`w-full min-h-[96px] resize-y rounded-lg border bg-white dark:bg-[#101024] p-3 text-sm outline-none focus:ring-2 focus:ring-[#6C47FF] ${DIVIDER}`}
                    />
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                    <Button type="button" variant="outline" onClick={() => setModalOpen(false)} className="flex-1 h-11">
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={uploadingImage}
                      style={{ backgroundColor: ac.hex }}
                      className="flex-1 h-11 text-white font-semibold hover:brightness-110 disabled:opacity-50"
                    >
                      {uploadingImage && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
                      {editingEntry ? "Update entry" : "Save entry"}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Floating add button (phones – sits above the bottom tab bar) */}
        <button
          onClick={() => openNewEntry(selectedDate)}
          disabled={!isAccountReady}
          aria-label="Add entry"
          style={{ backgroundColor: ac.hex }}
          className={`md:hidden fixed bottom-24 right-4 z-[950] flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg shadow-black/25 active:scale-95 hover:brightness-110 disabled:opacity-50 ${FOCUS}`}
        >
          <Plus size={26} strokeWidth={2.5} />
        </button>

        {/* Delete confirmation */}
        {deleteModalOpen && (
          <DeleteConfirmModal
            isOpen={deleteModalOpen}
            onClose={() => {
              setDeleteModalOpen(false);
              setEntryToDelete(null);
              setClearDayKey(null);
            }}
            onConfirm={entryToDelete ? () => deleteEntry(entryToDelete) : clearDay}
            title={entryToDelete ? "Delete Entry" : "Clear Day's Entries"}
            message={
              entryToDelete
                ? "Are you sure you want to delete this journal entry. This action cannot be undone."
                : "Are you sure you want to delete all " +
                  (grouped[clearDayKey] || []).length +
                  " entries from this day? This cannot be undone."
            }
          />
        )}
      </div>
    </div>
  );
}
