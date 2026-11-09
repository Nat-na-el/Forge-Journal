// src/pages/DailyJournal.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
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
  Palette,
  Target,
  Search,
  Flame,
  CalendarDays,
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
  "gap-0 rounded-xl bg-white dark:bg-[#15152b] border border-[#e6e8f2] dark:border-[#262645] shadow-sm dark:shadow-none";
const PANEL =
  "rounded-xl border border-[#e6e8f2] dark:border-[#262645] bg-[#f7f8fc] dark:bg-[#101024]";
const FIELD =
  "w-full h-10 rounded-lg border border-[#e6e8f2] dark:border-[#262645] bg-white dark:bg-[#101024] px-3 text-sm outline-none focus:ring-2 focus:ring-[#6C47FF]";
const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6C47FF]";

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
  return {
    count: list.length,
    executed: ex.length,
    pending: list.length - ex.length,
    wins: wins.length,
    losses: losses.length,
    net: grossW - grossL,
    grossW,
    grossL,
    lots: list.reduce((s, e) => s + (Number(e.lotSize) || 0), 0),
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
const DayNote = ({ dateKey, saved, onSave, accent }) => {
  const savedMoods = (saved?.moods || []).join("|");
  const [note, setNote] = useState(saved?.note || "");
  const [moods, setMoods] = useState(saved?.moods || []);
  const [reviewed, setReviewed] = useState(!!saved?.reviewed);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNote(saved?.note || "");
    setMoods(saved?.moods || []);
    setReviewed(!!saved?.reviewed);
  }, [saved?.note, saved?.reviewed, savedMoods]);

  const dirty =
    note !== (saved?.note || "") ||
    reviewed !== !!saved?.reviewed ||
    moods.join("|") !== savedMoods;

  const toggleMood = (m) => setMoods((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));

  const save = async () => {
    setBusy(true);
    await onSave(dateKey, { note, moods, reviewed });
    setBusy(false);
  };

  return (
    <div className={`border-t px-4 sm:px-5 py-4 ${DIVIDER}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h4 className={`flex items-center gap-2 text-sm font-semibold ${HEAD}`}>
          <FileText size={15} style={{ color: accent }} />
          Day note
        </h4>
        <label className={`flex cursor-pointer items-center gap-2 text-xs font-medium ${MUTED}`}>
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
            className="h-4 w-4 rounded"
            style={{ accentColor: accent }}
          />
          Mark day as reviewed
        </label>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3" role="group" aria-label="How did you feel today">
        {MOODS.map((m) => {
          const on = moods.includes(m);
          return (
            <button
              key={m}
              type="button"
              onClick={() => toggleMood(m)}
              aria-pressed={on}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${FOCUS} ${
                on ? "text-white border-transparent" : `${MUTED} ${DIVIDER} hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a]`
              }`}
              style={on ? { backgroundColor: accent } : undefined}
            >
              {m}
            </button>
          );
        })}
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What went well? What would you change? Market context, emotions, lessons for tomorrow."
        className={`w-full min-h-[96px] resize-y rounded-lg border bg-white dark:bg-[#101024] p-3 text-sm outline-none focus:ring-2 focus:ring-[#6C47FF] ${DIVIDER}`}
      />

      <div className="mt-3 flex items-center justify-end gap-3">
        {dirty && <span className={`text-xs ${MUTED}`}>Unsaved changes</span>}
        <button
          type="button"
          onClick={save}
          disabled={!dirty || busy}
          style={{ backgroundColor: accent }}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS}`}
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          Save note
        </button>
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
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState({});
  const [accent, setAccent] = useState(() => {
    try {
      const saved = localStorage.getItem("forgexAccent");
      return ACCENTS[saved] ? saved : "zella";
    } catch {
      return "zella";
    }
  });
  const ac = ACCENTS[accent] || ACCENTS.zella;
  const [form, setForm] = useState(emptyForm());

  const modalContentRef = useRef(null);
  const uploadRef = useRef(null);
  const accountLeverage = currentAccount?.leverage || 100;
  const isAccountReady = user && currentAccount;
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
    if (!user || !currentAccount?.id) {
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
      if (!authUser) {
        setEntries([]);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (user && currentAccount) refreshEntries();
  }, [currentAccount, user]);

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

  const monthEntries = useMemo(
    () => entries.filter((e) => inMonth(entryDay(e))),
    [entries, monthStartKey, monthEndKey]
  );
  const monthStats = useMemo(() => dayStats(monthEntries), [monthEntries]);

  const hasNote = (n) => !!n && ((n.note || "").trim().length > 0 || (n.moods || []).length > 0 || n.reviewed);

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
        start: startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 }),
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
        grid: { color: chartGrid },
        border: { display: false },
        ticks: { color: chartText, maxTicksLimit: 3, callback: fmtAxis },
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
    setCollapsed((c) => ({ ...c, [key]: false }));
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
    });
    setModalOpen(true);
  };

  // ─── Save entry ────────────────────────────────────────────────────
  const saveEntry = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!user || !currentAccount?.id) {
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
    };

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
    if (!user || !currentAccount?.id) return;
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
  const FILTERS = [
    ["all", "All days"],
    ["win", "Green"],
    ["loss", "Red"],
    ["noted", "With notes"],
  ];

  return (
    <div
      className={`${isDark ? "dark bg-[#0b0b19] text-[#e8e9f7]" : "bg-[#f4f5fa] text-[#14142b]"} min-h-screen w-full p-3 sm:p-6 lg:p-8`}
    >
      <div className="mx-auto max-w-[1600px]">
        {/* ───────── Header ───────── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
          <div className="min-w-0">
            <h1 className={`text-2xl sm:text-3xl font-bold tracking-tight ${HEAD}`}>Daily Journal</h1>
            <p className={`mt-1 text-sm ${MUTED}`}>
              {currentAccount.name}, auto P&L at {accountLeverage}:1 leverage
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <div className={`flex items-center rounded-lg border ${DIVIDER} bg-white dark:bg-[#15152b]`}>
              <button
                onClick={() => setViewMonth((m) => subMonths(m, 1))}
                aria-label="Previous month"
                className={`p-2.5 rounded-l-lg ${MUTED} hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] transition-colors ${FOCUS}`}
              >
                <ChevronLeft size={16} />
              </button>
              <span className={`min-w-[8.5rem] px-2 text-center text-sm font-semibold ${HEAD}`}>{monthLabel}</span>
              <button
                onClick={() => setViewMonth((m) => addMonths(m, 1))}
                aria-label="Next month"
                className={`p-2.5 rounded-r-lg ${MUTED} hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] transition-colors ${FOCUS}`}
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <button
              onClick={() => selectDay(todayKey)}
              className={`rounded-lg border ${DIVIDER} bg-white dark:bg-[#15152b] px-3.5 py-2.5 text-sm font-semibold ${HEAD} hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] transition-colors ${FOCUS}`}
            >
              Today
            </button>

            <Button
              onClick={() => openNewEntry(selectedDate)}
              disabled={!isAccountReady}
              style={{ backgroundColor: ac.hex }}
              className="hidden md:inline-flex items-center gap-2 text-white font-semibold px-4 hover:brightness-110 disabled:opacity-50"
            >
              <Plus size={16} />
              Add entry
            </Button>

            <div className="flex items-center gap-1.5 pl-1" role="radiogroup" aria-label="Accent theme">
              <Palette size={15} className={MUTED} />
              {Object.entries(ACCENTS).map(([key, a]) => (
                <button
                  key={key}
                  role="radio"
                  aria-checked={accent === key}
                  onClick={() => setAccent(key)}
                  title={a.name}
                  aria-label={`${a.name} theme`}
                  className={`h-5 w-5 rounded-full transition-transform ${FOCUS} ${
                    accent === key
                      ? "scale-110 ring-2 ring-offset-2 ring-[#8a8fb5] ring-offset-[#f4f5fa] dark:ring-white/70 dark:ring-offset-[#0b0b19]"
                      : "opacity-75 hover:scale-110 hover:opacity-100"
                  }`}
                  style={{ backgroundImage: `linear-gradient(135deg, ${a.hex}, ${a.hex2})` }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ───────── Toolbar ───────── */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex rounded-lg bg-[#e9eaf4] dark:bg-[#15152b] p-1 text-xs" role="group" aria-label="Filter days">
            {FILTERS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={`rounded-md px-3 py-1.5 font-semibold transition-colors ${FOCUS} ${
                  filter === key ? "text-white shadow-sm" : `${MUTED} hover:text-[#14142b] dark:hover:text-white`
                }`}
                style={filter === key ? { backgroundColor: ac.hex } : undefined}
              >
                {label}
              </button>
            ))}
          </div>

          <div className={`flex items-center gap-2 rounded-lg border ${DIVIDER} bg-white dark:bg-[#15152b] px-3 py-2`}>
            <Search size={15} className={MUTED} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search symbol"
              aria-label="Search by symbol"
              className="w-32 sm:w-40 bg-transparent text-sm outline-none"
            />
            {search && (
              <button onClick={() => setSearch("")} aria-label="Clear search" className={MUTED}>
                <X size={14} />
              </button>
            )}
          </div>

          <input
            type="date"
            value={selectedDate}
            max="2100-12-31"
            onChange={(e) => e.target.value && selectDay(e.target.value)}
            className={`ml-auto rounded-lg border ${DIVIDER} bg-white dark:bg-[#15152b] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#6C47FF]`}
            aria-label="Jump to date"
          />
        </div>

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

        {loading ? (
          <div className="flex justify-center items-center h-72">
            <div
              className="h-10 w-10 animate-spin rounded-full border-2 border-[#e6e8f2] dark:border-[#262645]"
              style={{ borderTopColor: ac.hex }}
              role="progressbar"
              aria-label="Loading journal"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
            {/* ───────── Right rail (first on phones) ───────── */}
            <div className="order-first xl:order-last flex flex-col gap-4 xl:sticky xl:top-6">
              {/* Month summary */}
              <Card className={`${CARD} p-0`}>
                <div className={`flex items-center justify-between border-b px-4 py-3 ${DIVIDER}`}>
                  <h3 className={`flex items-center gap-2 text-[15px] font-semibold ${HEAD}`}>
                    <CalendarDays size={16} style={{ color: ac.hex }} />
                    {monthLabel}
                  </h3>
                  <span className={`text-sm font-bold tabular-nums ${pnlClass(monthStats.net)}`}>
                    {monthStats.executed ? money(monthStats.net) : "—"}
                  </span>
                </div>

                <div className="p-4">
                  <div className="grid grid-cols-7 gap-1">
                    {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                      <div key={i} className={`pb-1 text-center text-[10px] font-semibold ${MUTED}`}>
                        {d}
                      </div>
                    ))}
                    {calendarDays.map((d) => {
                      const k = dayKey(d);
                      const t = dayTotals[k];
                      const cur = isSameMonth(d, viewMonth);
                      const sel = k === selectedDate;
                      const noted = hasNote(dayNotes[k]);
                      const tone =
                        t && t.executed
                          ? t.net >= 0
                            ? "rgba(34,196,147,0.22)"
                            : "rgba(242,85,110,0.22)"
                          : t
                          ? "rgba(245,158,11,0.2)"
                          : undefined;
                      return (
                        <button
                          key={k}
                          onClick={() => selectDay(k)}
                          aria-label={`${format(d, "d MMMM")}${t ? `, ${t.count} entries` : ""}`}
                          aria-current={isToday(d) ? "date" : undefined}
                          className={`relative aspect-square rounded-md text-xs font-semibold tabular-nums transition-colors ${FOCUS} ${
                            cur ? HEAD : `${MUTED} opacity-40`
                          } hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a]`}
                          style={{
                            backgroundColor: tone,
                            boxShadow: sel ? `inset 0 0 0 2px ${ac.hex}` : isToday(d) ? `inset 0 0 0 1px ${ac.hex}88` : undefined,
                          }}
                        >
                          {format(d, "d")}
                          {noted && (
                            <i
                              className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full"
                              style={{ backgroundColor: ac.hex }}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className={`mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] ${MUTED}`}>
                    <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm" style={{ backgroundColor: POS }} />Green</span>
                    <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm" style={{ backgroundColor: NEG }} />Red</span>
                    <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm bg-amber-500" />Pending</span>
                    <span className="inline-flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ac.hex }} />Note</span>
                  </div>
                </div>

                <div className={`grid grid-cols-2 gap-px border-t bg-[#e6e8f2] dark:bg-[#262645] ${DIVIDER} overflow-hidden rounded-b-xl`}>
                  {[
                    ["Win rate", monthStats.executed ? `${monthStats.winRate}%` : "—"],
                    ["Profit factor", monthStats.pf],
                    ["Trades", monthStats.count],
                    ["Journaled days", `${monthJournaled}/${monthDaysElapsed}`],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-white dark:bg-[#15152b] px-4 py-3">
                      <div className={`text-[11px] font-medium ${MUTED}`}>{label}</div>
                      <div className={`mt-0.5 text-base font-bold tabular-nums ${HEAD}`}>{value}</div>
                    </div>
                  ))}
                </div>

                <div className={`flex items-center justify-between border-t px-4 py-3 ${DIVIDER}`}>
                  <span className={`flex items-center gap-2 text-sm ${MUTED}`}>
                    <Flame size={16} className={streak ? "text-amber-500" : ""} />
                    Journal streak
                  </span>
                  <span className={`text-sm font-bold ${streak ? HEAD : MUTED}`}>
                    {streak} {streak === 1 ? "day" : "days"}
                  </span>
                </div>
              </Card>

              {/* Scorecard */}
              <Card className={`${CARD} p-0`}>
                <div className={`flex items-start justify-between gap-3 border-b px-4 py-3 ${DIVIDER}`}>
                  <div className="min-w-0">
                    <h3 className={`flex items-center gap-2 text-[15px] font-semibold ${HEAD}`}>
                      <Target size={16} style={{ color: ac.hex }} />
                      Journal scorecard
                    </h3>
                    <p className={`mt-0.5 text-xs ${MUTED}`}>
                      {scoreDay
                        ? `${selectedIsToday ? "Today" : format(parseISO(selectedDate), "d MMM")} vs last 30 days`
                        : "Last 30 days (no entries on this day)"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-[11px] ${MUTED}`}>Discipline</div>
                    <div className="text-2xl font-bold leading-none mt-1 tabular-nums" style={{ color: ac.hex }}>
                      {scoreMain ? scoreMain.score : "—"}
                      <span className={`text-xs font-semibold ${MUTED}`}>/100</span>
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  {scoreMain ? (
                    <>
                      <div className="relative h-64">
                        <Radar data={radarData} options={radarOptions} />
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        {SCORE_LABELS.map((label, i) => (
                          <div key={label} className={`${PANEL} px-2 py-2 text-center`}>
                            <div className={`text-[10px] truncate ${MUTED}`}>{label}</div>
                            <div className={`text-sm font-bold tabular-nums ${HEAD}`}>{scoreMain.scores[i]}%</div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className={`h-56 flex flex-col items-center justify-center text-center gap-2 ${MUTED}`}>
                      <Target size={32} className="opacity-40" />
                      <p className="text-sm">Log entries to see your scorecard.</p>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* ───────── Day feed ───────── */}
            <div className="flex min-w-0 flex-col gap-4">
              {!isAccountReady ? (
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
                  const isSel = d.key === selectedDate;
                  const isCollapsed = !!collapsed[d.key];
                  const dateObj = parseISO(d.key);
                  const cells = [
                    ["Total trades", s.count],
                    ["Winners", s.wins],
                    ["Losers", s.losses],
                    ["Win rate", s.executed ? `${s.winRate}%` : "—"],
                    ["Profit factor", s.pf],
                    ["Avg R:R", s.avgRR],
                    ["Gross profit", money(s.grossW, false)],
                    ["Gross loss", money(s.grossL, false)],
                    ["Volume (lots)", s.lots.toFixed(2)],
                  ];
                  return (
                    <Card
                      key={d.key}
                      id={`day-${d.key}`}
                      className={`${CARD} scroll-mt-6 p-0 overflow-hidden`}
                      style={isSel ? { boxShadow: `0 0 0 2px ${ac.hex}` } : undefined}
                    >
                      {/* Day header */}
                      <div className={`flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 ${isCollapsed ? "" : `border-b ${DIVIDER}`}`}>
                        <button
                          onClick={() => setCollapsed((c) => ({ ...c, [d.key]: !c[d.key] }))}
                          aria-expanded={!isCollapsed}
                          className={`flex min-w-0 items-center gap-3 text-left rounded ${FOCUS}`}
                        >
                          <ChevronDown
                            size={18}
                            className={`shrink-0 transition-transform ${MUTED} ${isCollapsed ? "-rotate-90" : ""}`}
                          />
                          <div className="min-w-0">
                            <div className={`flex flex-wrap items-center gap-2 text-[15px] font-semibold ${HEAD}`}>
                              {format(dateObj, "EEE, MMM d, yyyy")}
                              {isToday(dateObj) && (
                                <span
                                  className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-white"
                                  style={{ backgroundColor: ac.hex }}
                                >
                                  Today
                                </span>
                              )}
                              {d.note?.reviewed && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-[#22c493]/15 px-2 py-0.5 text-[11px] font-semibold text-[#0e9f77] dark:text-[#2dd4a0]">
                                  <Check size={11} /> Reviewed
                                </span>
                              )}
                            </div>
                            <div className={`mt-0.5 flex flex-wrap items-center gap-x-2 text-xs ${MUTED}`}>
                              <span>
                                {s.count} {s.count === 1 ? "entry" : "entries"}
                                {s.pending > 0 ? `, ${s.pending} pending` : ""}
                              </span>
                              {(d.note?.moods || []).slice(0, 3).map((m) => (
                                <span key={m} className={`rounded px-1.5 py-0.5 bg-[#f1f2f8] dark:bg-[#1e1e3a]`}>{m}</span>
                              ))}
                            </div>
                          </div>
                        </button>

                        <div className="flex shrink-0 items-center gap-3">
                          <div className="text-right">
                            <div className={`text-[11px] ${MUTED}`}>Net P&L</div>
                            <div className={`text-lg font-bold tabular-nums ${s.executed ? pnlClass(s.net) : MUTED}`}>
                              {s.executed ? money(s.net) : "—"}
                            </div>
                          </div>
                          <button
                            onClick={() => openNewEntry(d.key)}
                            aria-label={`Add entry on ${format(dateObj, "d MMMM")}`}
                            title="Add entry"
                            className={`rounded-lg border ${DIVIDER} p-2 ${MUTED} hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] transition-colors ${FOCUS}`}
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      </div>

                      {!isCollapsed && (
                        <>
                          {d.list.length === 0 ? (
                            <div className="px-5 py-8 text-center">
                              <p className={`text-sm ${MUTED}`}>No trades logged on this day.</p>
                              <button
                                onClick={() => openNewEntry(d.key)}
                                style={{ color: ac.hex }}
                                className={`mt-2 text-sm font-semibold hover:underline rounded ${FOCUS}`}
                              >
                                Add an entry
                              </button>
                            </div>
                          ) : (
                            <>
                              {/* Chart + stats */}
                              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                                <div className={`p-4 sm:p-5 lg:border-r ${DIVIDER}`}>
                                  <div className={`mb-2 text-xs font-medium ${MUTED}`}>Cumulative P&L through the day</div>
                                  <div className="relative h-36">
                                    <Line data={sparkData(d.list, s.net)} options={sparkOptions} />
                                  </div>
                                </div>
                                <div className="bg-[#e6e8f2] dark:bg-[#262645] p-px">
                                  <div className="grid h-full grid-cols-3 gap-px">
                                    {cells.map(([label, value]) => (
                                      <div key={label} className="bg-white dark:bg-[#15152b] px-3.5 py-3">
                                        <div className={`text-[11px] font-medium ${MUTED}`}>{label}</div>
                                        <div
                                          className={`mt-0.5 text-sm sm:text-base font-bold tabular-nums ${
                                            label === "Gross profit" ? POS_T : label === "Gross loss" ? NEG_T : HEAD
                                          }`}
                                        >
                                          {value}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              {/* Trades table */}
                              <div className={`overflow-x-auto border-t ${DIVIDER}`}>
                                <table className="w-full min-w-[560px] text-sm">
                                  <thead>
                                    <tr className={`border-b text-left text-xs ${MUTED} ${DIVIDER}`}>
                                      <th className="px-4 sm:px-5 py-2.5 font-medium">Time</th>
                                      <th className="px-3 py-2.5 font-medium">Symbol</th>
                                      <th className="px-3 py-2.5 font-medium">Side</th>
                                      <th className="px-3 py-2.5 font-medium text-right">Lots</th>
                                      <th className="px-3 py-2.5 font-medium text-right">R:R</th>
                                      <th className="px-3 py-2.5 font-medium text-right">Net P&L</th>
                                      <th className="px-4 sm:px-5 py-2.5 font-medium text-right">
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
                                        entry.notes || entry.screenshotUrl || (entry.confluences || []).length > 0;
                                      return (
                                        <React.Fragment key={entry.id}>
                                          <tr className={`border-b ${DIVIDER} ${extras ? "border-b-0" : ""} hover:bg-[#f7f8fc] dark:hover:bg-[#1b1b36] transition-colors`}>
                                            <td className={`px-4 sm:px-5 py-3 whitespace-nowrap tabular-nums ${MUTED}`}>{timeOf(entry)}</td>
                                            <td className={`px-3 py-3 font-semibold ${HEAD}`}>{entry.pair || "—"}</td>
                                            <td className="px-3 py-3">
                                              <span
                                                className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${
                                                  isLong
                                                    ? "bg-[#22c493]/15 text-[#0e9f77] dark:text-[#2dd4a0]"
                                                    : "bg-[#f2556e]/15 text-[#d93a57] dark:text-[#ff6b86]"
                                                }`}
                                              >
                                                {entry.direction || "—"}
                                              </span>
                                            </td>
                                            <td className={`px-3 py-3 text-right tabular-nums ${MUTED}`}>{entry.lotSize || "—"}</td>
                                            <td className={`px-3 py-3 text-right tabular-nums ${MUTED}`}>
                                              {!pending && entry.rr ? entry.rr : "—"}
                                            </td>
                                            <td className={`px-3 py-3 text-right font-bold tabular-nums ${pending ? "text-amber-600 dark:text-amber-400" : pnlClass(p)}`}>
                                              {pending ? "Pending" : money(p)}
                                            </td>
                                            <td className="px-4 sm:px-5 py-3">
                                              <div className="flex justify-end gap-1">
                                                <button
                                                  onClick={() => openEdit(entry)}
                                                  aria-label="Edit entry"
                                                  className={`rounded-md p-1.5 ${MUTED} hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${FOCUS}`}
                                                >
                                                  <Pencil size={15} />
                                                </button>
                                                <button
                                                  onClick={() => {
                                                    setClearDayKey(null);
                                                    setEntryToDelete(entry.id);
                                                    setDeleteModalOpen(true);
                                                  }}
                                                  aria-label="Delete entry"
                                                  className={`rounded-md p-1.5 text-[#d93a57] dark:text-[#ff6b86] hover:bg-[#f2556e]/10 ${FOCUS}`}
                                                >
                                                  <Trash2 size={15} />
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                          {extras && (
                                            <tr className={`border-b ${DIVIDER}`}>
                                              <td colSpan={7} className="px-4 sm:px-5 pb-3.5 pt-0">
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
                                                        className={`h-16 w-24 rounded-lg border object-cover hover:opacity-80 transition ${DIVIDER}`}
                                                      />
                                                    </a>
                                                  )}
                                                  <div className="min-w-0 flex-1 space-y-2">
                                                    {(entry.confluences || []).length > 0 && (
                                                      <div className="flex flex-wrap gap-1.5">
                                                        {entry.confluences.map((c) => (
                                                          <span
                                                            key={c}
                                                            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold"
                                                            style={{ backgroundColor: ac.hex + "22", color: ac.hex }}
                                                          >
                                                            <Tag size={10} />
                                                            {c}
                                                          </span>
                                                        ))}
                                                      </div>
                                                    )}
                                                    {entry.notes && (
                                                      <p className={`line-clamp-3 text-sm leading-relaxed ${MUTED}`}>{entry.notes}</p>
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
                            </>
                          )}

                          <DayNote dateKey={d.key} saved={d.note} onSave={saveDayNote} accent={ac.hex} />

                          {d.list.length > 0 && (
                            <div className={`flex justify-end border-t px-4 sm:px-5 py-2.5 ${DIVIDER}`}>
                              <button
                                onClick={() => {
                                  setEntryToDelete(null);
                                  setClearDayKey(d.key);
                                  setDeleteModalOpen(true);
                                }}
                                className={`rounded text-xs font-semibold text-[#d93a57] dark:text-[#ff6b86] hover:underline ${FOCUS}`}
                              >
                                Clear this day's entries
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </Card>
                  );
                })
              )}
            </div>
          </div>
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
                ? "Are you sure you want to delete this journal entry? This action cannot be undone."
                : `Are you sure you want to delete all ${(grouped[clearDayKey] || []).length} entries from this day? This cannot be undone.`
            }
          />
        )}
      </div>
    </div>
  );
}
