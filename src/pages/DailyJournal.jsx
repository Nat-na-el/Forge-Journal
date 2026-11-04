// src/pages/DailyJournal.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import { Trash2, Plus, Loader2, Check, AlertCircle, FileText, X, Edit, Image, Tag, Upload, Link, ChevronLeft, ChevronRight, Palette, Target, BarChart3 } from "lucide-react";
import { format, addDays, subDays, startOfWeek, endOfWeek, eachDayOfInterval, parseISO } from "date-fns";
import {
  Chart as ChartJS,
  RadialLinearScale,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { Radar, Bar } from "react-chartjs-2";
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
  doc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// Helper: compress image before upload
const compressImage = (file, maxWidth = 1200, quality = 0.8) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('Canvas to blob failed'));
          resolve(new File([blob], file.name, { type: 'image/jpeg' }));
        }, 'image/jpeg', quality);
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

ChartJS.register(
  RadialLinearScale,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend
);

// Same accent palette + storage key as the Dashboard, so the theme follows you around
const ACCENTS = {
  indigo: { name: "Indigo", hex: "#6366f1", hex2: "#a855f7" },
  emerald: { name: "Emerald", hex: "#10b981", hex2: "#06b6d4" },
  cyan: { name: "Ocean", hex: "#06b6d4", hex2: "#3b82f6" },
  amber: { name: "Amber", hex: "#f59e0b", hex2: "#ef4444" },
  rose: { name: "Rose", hex: "#f43f5e", hex2: "#ec4899" },
};

const CARD =
  "rounded-2xl bg-white/80 dark:bg-gray-800/60 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg hover:shadow-xl transition-all duration-200";

const dayKey = (d) => format(d, "yyyy-MM-dd");
// Local calendar day of an entry (new entries use openDateTime, old ones used `date`)
const entryDay = (e) => String(e.openDateTime || e.date || "").slice(0, 10);
// Entries saved before the status field existed count as executed
const isExec = (e) => e.status !== "pending";

const SCORE_LABELS = ["Win Rate", "Notes", "Screenshots", "Confluences", "Risk Plan", "R:R ≥ 1.5"];

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

const formatDateTimeLocal = (d = new Date()) => {
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const formatNumber = (num) => {
  if (!num && num !== 0) return "";
  return Number(num).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const COMMON_ASSETS = [
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "NZDUSD", "USDCHF",
  "EURGBP", "EURJPY", "GBPJPY", "AUDJPY", "CADJPY", "CHFJPY",
  "UK100", "US30", "NAS100", "SPX500", "DE40", "JP225", "FRA40", "AUS200",
  "HSI", "CHINA50", "UK100.cash", "US30.cash", "NAS100.cash",
  "AAPL", "TSLA", "AMZN", "GOOGL", "MSFT", "NVDA", "META", "NFLX", "AMD", "INTC",
  "BABA", "PDD", "JD", "SHOP", "SQ", "PYPL", "DIS", "BA", "GE", "F"
];

// Tag input component for confluences
const ConfluenceTags = ({ tags, onChange }) => {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef(null);

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

  const removeTag = (tagToRemove) => {
    onChange(tags.filter(tag => tag !== tagToRemove));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 p-2 border rounded-xl min-h-[60px] items-center bg-white dark:bg-gray-800">
        {tags.map((tag, idx) => (
          <span
            key={idx}
            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-full bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30"
          >
            <Tag size={12} />
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="ml-1 hover:text-indigo-900 dark:hover:text-indigo-100"
            >
              <X size={14} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? "Type a confluence and press Enter..." : ""}
          className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-sm p-1"
        />
      </div>
      <p className="text-xs opacity-60">Press Enter or comma to add a tag</p>
    </div>
  );
};

export default function DailyJournal({ currentAccount }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [user, setUser] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => dayKey(new Date()));
  const [accent, setAccent] = useState(() => {
    try {
      const saved = localStorage.getItem("forgexAccent");
      return ACCENTS[saved] ? saved : "indigo";
    } catch {
      return "indigo";
    }
  });
  const ac = ACCENTS[accent] || ACCENTS.indigo;

  useEffect(() => {
    try {
      localStorage.setItem("forgexAccent", accent);
    } catch {}
  }, [accent]);
  const [form, setForm] = useState({
    openDateTime: formatDateTimeLocal(),
    closeDateTime: formatDateTimeLocal(),
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

  const modalContentRef = useRef(null);
  const uploadRef = useRef(null);
  const accountLeverage = currentAccount?.leverage || 100;
  const isAccountReady = user && currentAccount;

  // ─── Image upload handler with compression ─────────────────────────
  const handleImageUpload = async (file) => {
    if (!file || !user || !currentAccount?.id) return;
    setUploadingImage(true);
    try {
      const compressedFile = await compressImage(file);
      const storageRef = ref(storage, `users/${user.uid}/accounts/${currentAccount.id}/trades/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, compressedFile);
      const url = await getDownloadURL(storageRef);
      setForm(prev => ({ ...prev, screenshotUrl: url }));
      setSuccessMsg("Image uploaded successfully!");
      setTimeout(() => setSuccessMsg(null), 3000);
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
    if (!modalOpen) return;
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.indexOf("image") !== -1) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            uploadRef.current?.(file);
          }
          break;
        }
      }
    };
    const currentModal = modalContentRef.current;
    if (currentModal) {
      currentModal.addEventListener('paste', handlePaste);
    }
    return () => {
      if (currentModal) {
        currentModal.removeEventListener('paste', handlePaste);
      }
    };
  }, [modalOpen]);

  // ─── Fetch journal entries ────────────────────────────────────────
  const refreshEntries = async () => {
    if (!user || !currentAccount?.id) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const entriesRef = collection(
        db,
        "users",
        user.uid,
        "accounts",
        currentAccount.id,
        "trades"
      );
      const q = query(entriesRef, orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      const loaded = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setEntries(loaded);
    } catch (err) {
      console.error("❌ Journal fetch error:", err);
      setError("Could not load journal entries. " + (err.message || ""));
      setEntries([]);
    } finally {
      setLoading(false);
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
    if (user && currentAccount) {
      refreshEntries();
    }
  }, [currentAccount, user]);

  // ─── Auto‑calculate PnL and R:R (only if executed and exit given) ─
  useEffect(() => {
    if (form.status === "pending" || !form.exit) {
      setForm(prev => ({ ...prev, pnl: "", rr: "" }));
      return;
    }
    const entry = Number(form.entry) || 0;
    const exitPrice = Number(form.exit) || 0;
    const sl = Number(form.stopLoss) || 0;
    const tp = Number(form.takeProfit) || 0;
    const lot = Number(form.lotSize) || 0.1;

    let calculatedPnL = "";
    if (entry && exitPrice && lot && accountLeverage) {
      const priceDiff = form.direction === "Long" ? (exitPrice - entry) : (entry - exitPrice);
      calculatedPnL = (priceDiff * lot * accountLeverage * 100).toFixed(2);
    }

    let calculatedRR = "";
    if (entry && sl && tp) {
      const risk = form.direction === "Long" ? (entry - sl) : (sl - entry);
      const reward = form.direction === "Long" ? (tp - entry) : (entry - tp);
      if (risk !== 0) {
        calculatedRR = (reward / risk).toFixed(2);
      } else if (reward > 0) {
        calculatedRR = "∞";
      }
    }

    setForm((prev) => ({
      ...prev,
      pnl: calculatedPnL,
      rr: calculatedRR,
    }));
  }, [form.entry, form.exit, form.stopLoss, form.takeProfit, form.lotSize, form.direction, form.status, accountLeverage]);

  // ─── Entries for the selected day (name kept: used by clear-day below) ──
  const todayEntries = useMemo(
    () =>
      entries
        .filter((e) => entryDay(e) === selectedDate)
        .sort((x, y) =>
          String(y.openDateTime || y.date).localeCompare(String(x.openDateTime || x.date))
        ),
    [entries, selectedDate]
  );
  const todayKey = dayKey(new Date());
  const selectedIsToday = selectedDate === todayKey;
  const selectedLabel = format(parseISO(selectedDate), "EEEE, d MMMM yyyy");

  // ─── Metrics for the selected day (executed trades only) ─────────────
  const metrics = useMemo(() => {
    const ex = todayEntries.filter(isExec);
    if (!ex.length) return { net: 0, wins: 0, losses: 0, winRate: 0, avgPnL: 0 };
    let net = 0;
    let wins = 0;
    ex.forEach((e) => {
      const p = Number(e.pnl || 0);
      net += p;
      if (p > 0) wins++;
    });
    return {
      net,
      wins,
      losses: ex.length - wins,
      winRate: Math.round((wins / ex.length) * 100),
      avgPnL: net / ex.length,
    };
  }, [todayEntries]);

  // ─── Per-day totals (week strip + 14-day chart) ──────────────────────
  const byDay = useMemo(() => {
    const m = {};
    entries.forEach((e) => {
      const k = entryDay(e);
      if (!k) return;
      const o = m[k] || (m[k] = { count: 0, pnl: 0, executed: 0 });
      o.count++;
      if (isExec(e)) {
        o.pnl += Number(e.pnl) || 0;
        o.executed++;
      }
    });
    return m;
  }, [entries]);

  const weekDays = useMemo(() => {
    const base = parseISO(selectedDate);
    return eachDayOfInterval({
      start: startOfWeek(base, { weekStartsOn: 1 }),
      end: endOfWeek(base, { weekStartsOn: 1 }),
    }).map((d) => ({ date: d, key: dayKey(d), ...(byDay[dayKey(d)] || { count: 0, pnl: 0, executed: 0 }) }));
  }, [selectedDate, byDay]);

  const last14 = useMemo(() => {
    const end = new Date();
    return Array.from({ length: 14 }, (_, i) => {
      const d = subDays(end, 13 - i);
      return { date: d, key: dayKey(d), pnl: (byDay[dayKey(d)] || {}).pnl || 0 };
    });
  }, [byDay]);
  const last14Net = last14.reduce((s, d) => s + d.pnl, 0);

  // ─── Spider-web scorecard: selected day vs last 30 days ──────────────
  const scoreDay = useMemo(() => scoreEntries(todayEntries), [todayEntries]);
  const score30 = useMemo(() => {
    const from = dayKey(subDays(new Date(), 29));
    return scoreEntries(entries.filter((e) => entryDay(e) >= from && entryDay(e) <= todayKey));
  }, [entries, todayKey]);
  const scoreMain = scoreDay || score30;

  const chartText = isDark ? "#9ca3af" : "#4b5563";
  const chartGrid = isDark ? "rgba(148,163,184,0.16)" : "rgba(100,116,139,0.2)";

  const radarData = {
    labels: SCORE_LABELS,
    datasets: [
      score30 && {
        label: "Last 30 days",
        data: score30.scores,
        borderColor: isDark ? "rgba(156,163,175,0.9)" : "rgba(107,114,128,0.9)",
        backgroundColor: "rgba(156,163,175,0.08)",
        borderDash: [5, 4],
        borderWidth: 1.5,
        pointRadius: 0,
      },
      scoreDay && {
        label: selectedIsToday ? "Today" : format(parseISO(selectedDate), "d MMM"),
        data: scoreDay.scores,
        borderColor: ac.hex,
        backgroundColor: ac.hex + "40",
        borderWidth: 2.5,
        pointBackgroundColor: ac.hex,
        pointBorderColor: "#fff",
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
        pointLabels: { color: chartText, font: { size: 11, weight: "600" } },
      },
    },
    plugins: {
      legend: {
        position: "bottom",
        labels: { color: chartText, usePointStyle: true, boxWidth: 8, padding: 14 },
      },
      tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${Math.round(c.parsed.r)}%` } },
    },
  };

  const barData = {
    labels: last14.map((d) => format(d.date, "d MMM")),
    datasets: [
      {
        data: last14.map((d) => Number(d.pnl.toFixed(2))),
        backgroundColor: last14.map((d) => {
          const base = d.pnl >= 0 ? "#10b981" : "#f43f5e";
          return d.key === selectedDate ? base : base + "88";
        }),
        borderRadius: 6,
        maxBarThickness: 28,
      },
    ],
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_evt, els) => {
      if (els.length) setSelectedDate(last14[els[0].index].key);
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (c) =>
            ` ${c.parsed.y >= 0 ? "+" : "-"}$${Math.abs(c.parsed.y).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: chartText, maxRotation: 0, autoSkipPadding: 12 } },
      y: { grid: { color: chartGrid }, ticks: { color: chartText, maxTicksLimit: 5 } },
    },
  };

  const openNewEntry = () => {
    if (!isAccountReady) return;
    setEditingEntry(null);
    setForm({
      openDateTime: selectedIsToday
        ? formatDateTimeLocal()
        : `${selectedDate}T${formatDateTimeLocal().slice(11)}`,
      closeDateTime: selectedIsToday
        ? formatDateTimeLocal()
        : `${selectedDate}T${formatDateTimeLocal().slice(11)}`,
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

    // Build payload with both open and close datetimes
    const payload = {
      openDateTime: form.openDateTime || formatDateTimeLocal(),
      closeDateTime: form.status === "pending" ? null : (form.closeDateTime || null),
      pair: form.pair?.toUpperCase() || "",
      direction: form.direction || "Long",
      entry: Number(form.entry) || 0,
      exit: form.status === "pending" ? 0 : (Number(form.exit) || 0),
      stopLoss: Number(form.stopLoss) || 0,
      takeProfit: Number(form.takeProfit) || 0,
      pnl: form.status === "pending" ? 0 : (Number(form.pnl) || 0),
      rr: form.status === "pending" ? "" : form.rr,
      lotSize: Number(form.lotSize) || 0.1,
      notes: form.notes || "",
      status: form.status || "executed",
      confluences: form.confluences || [],
      screenshotUrl: form.screenshotUrl || "",
    };

    try {
      if (editingEntry) {
        const entryRef = doc(
          db,
          "users",
          user.uid,
          "accounts",
          currentAccount.id,
          "trades",
          editingEntry.id
        );
        await updateDoc(entryRef, {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        setSuccessMsg("Entry updated successfully!");
      } else {
        await addDoc(
          collection(db, "users", user.uid, "accounts", currentAccount.id, "trades"),
          {
            ...payload,
            createdAt: serverTimestamp(),
          }
        );
        setSuccessMsg("Entry added successfully!");
      }
      setSelectedDate(String(payload.openDateTime).slice(0, 10));
      setModalOpen(false);
      setEditingEntry(null);
      setForm({
        openDateTime: formatDateTimeLocal(),
        closeDateTime: formatDateTimeLocal(),
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
      await refreshEntries();
    } catch (err) {
      console.error("Save error:", err);
      setError("Failed to save entry: " + err.message);
    }
  };

  // ─── Delete entry ──────────────────────────────────────────────────
  const deleteEntry = async (id) => {
    if (!user || !currentAccount?.id) return;
    try {
      await deleteDoc(
        doc(db, "users", user.uid, "accounts", currentAccount.id, "trades", id)
      );
      setSuccessMsg("Entry deleted successfully");
      await refreshEntries();
    } catch (err) {
      console.error("Delete failed:", err);
      setError("Failed to delete entry");
    }
    setDeleteModalOpen(false);
    setEntryToDelete(null);
  };

  // ─── Clear today's entries ─────────────────────────────────────────
  const clearTodayEntries = async () => {
    if (!user || !currentAccount?.id) return;
    try {
      const batchPromises = todayEntries.map((e) =>
        deleteDoc(
          doc(db, "users", user.uid, "accounts", currentAccount.id, "trades", e.id)
        )
      );
      await Promise.all(batchPromises);
      setSuccessMsg("Today's entries cleared successfully");
      await refreshEntries();
    } catch (err) {
      console.error("Batch delete failed:", err);
      setError("Failed to clear entries");
    }
    setDeleteModalOpen(false);
  };

  // ─── If no account selected ───────────────────────────────────────
  if (!currentAccount) {
    return (
      <div className={`min-h-screen w-full p-8 flex items-center justify-center ${isDark ? "bg-gray-950" : "bg-gray-50"}`}>
        <Card className="p-8 max-w-md text-center bg-white/80 dark:bg-gray-800/60 backdrop-blur-md">
          <AlertCircle size={48} className="mx-auto text-amber-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">No Account Selected</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Please create or select an account from the sidebar to start journaling.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen w-full p-4 sm:p-6 transition-colors duration-300
        ${isDark
          ? "bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-gray-100"
          : "bg-gradient-to-br from-gray-50 via-white to-gray-100 text-gray-900"}`}
    >
      <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1
              className="text-3xl sm:text-4xl lg:text-5xl font-extrabold bg-clip-text text-transparent"
              style={{ backgroundImage: `linear-gradient(90deg, ${ac.hex}, ${ac.hex2})` }}
            >
              Daily Journal
            </h1>
            <p className="text-sm sm:text-base mt-1.5 opacity-70">
              {currentAccount.name} · Auto P&L at {accountLeverage}:1 leverage
            </p>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            {/* Accent theme picker */}
            <div className="flex items-center gap-2" role="radiogroup" aria-label="Accent theme">
              <Palette size={16} className="opacity-60" />
              {Object.entries(ACCENTS).map(([key, a]) => (
                <button
                  key={key}
                  onClick={() => setAccent(key)}
                  title={a.name}
                  aria-label={`${a.name} theme`}
                  aria-pressed={accent === key}
                  className={`h-6 w-6 rounded-full transition-transform ${
                    accent === key
                      ? "ring-2 ring-offset-2 ring-offset-transparent ring-gray-500 dark:ring-white/70 scale-110"
                      : "opacity-80 hover:scale-110"
                  }`}
                  style={{ backgroundImage: `linear-gradient(135deg, ${a.hex}, ${a.hex2})` }}
                />
              ))}
            </div>
            <Button
              onClick={openNewEntry}
              disabled={!isAccountReady}
              style={{ backgroundColor: ac.hex }}
              className="hidden md:inline-flex hover:brightness-110 text-white shadow-md px-6 py-5 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={18} className="mr-2" /> Add Entry
            </Button>
          </div>
        </div>

        {/* Day navigator + week strip */}
        <Card className={`${CARD} p-3 sm:p-5`}>
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setSelectedDate(dayKey(subDays(parseISO(selectedDate), 1)))}
              className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center bg-gray-100 dark:bg-gray-900/50 hover:brightness-95 dark:hover:brightness-125"
              aria-label="Previous day"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="text-center min-w-0">
              <div className="text-base sm:text-xl font-bold truncate">{selectedLabel}</div>
              <div className="text-xs opacity-60 mt-0.5">
                {selectedIsToday ? "Today · " : ""}
                {todayEntries.length} {todayEntries.length === 1 ? "entry" : "entries"}
              </div>
            </div>
            <button
              onClick={() => setSelectedDate(dayKey(addDays(parseISO(selectedDate), 1)))}
              className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center bg-gray-100 dark:bg-gray-900/50 hover:brightness-95 dark:hover:brightness-125"
              aria-label="Next day"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mt-4">
            {weekDays.map((d) => {
              const active = d.key === selectedDate;
              const tone =
                d.executed === 0
                  ? d.count > 0
                    ? "bg-amber-500"
                    : "bg-transparent"
                  : d.pnl >= 0
                  ? "bg-emerald-500"
                  : "bg-rose-500";
              return (
                <button
                  key={d.key}
                  onClick={() => setSelectedDate(d.key)}
                  className={`rounded-xl py-2 flex flex-col items-center gap-1 transition-all ${
                    active ? "text-white shadow-md" : "bg-gray-100/80 dark:bg-gray-900/40 hover:brightness-95 dark:hover:brightness-125"
                  }`}
                  style={active ? { backgroundColor: ac.hex } : undefined}
                >
                  <span className="text-[10px] sm:text-xs uppercase tracking-wide opacity-80">{format(d.date, "EEE")}</span>
                  <span className="text-base sm:text-lg font-bold leading-none">{format(d.date, "d")}</span>
                  <span className={`h-1.5 w-1.5 rounded-full ${active && d.count ? "bg-white" : tone}`} />
                  <span className={`hidden sm:block text-[11px] font-semibold ${d.count ? "" : "opacity-0"} ${active ? "" : d.pnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                    {d.pnl >= 0 ? "+" : "-"}{Math.abs(d.pnl).toFixed(0)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 mt-4">
            {!selectedIsToday && (
              <button
                onClick={() => setSelectedDate(todayKey)}
                className="px-3 py-2 rounded-xl text-sm font-semibold text-white hover:brightness-110"
                style={{ backgroundColor: ac.hex }}
              >
                Back to today
              </button>
            )}
            <input
              type="date"
              value={selectedDate}
              max="2100-12-31"
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="ml-auto px-3 py-2 rounded-xl text-sm border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
              aria-label="Jump to date"
            />
          </div>
        </Card>

        {/* Feedback */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-100/80 dark:bg-rose-900/30 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-700 flex items-center gap-3">
            <AlertCircle size={20} />
            {error}
          </div>
        )}
        {successMsg && (
          <div className="p-4 rounded-xl bg-emerald-100/80 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 flex items-center gap-3">
            <Check size={20} />
            {successMsg}
          </div>
        )}

        {/* Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {[
            {
              label: "Net P&L",
              value: `${metrics.net >= 0 ? "+" : "-"}$${formatNumber(Math.abs(metrics.net))}`,
              cls: metrics.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
            },
            { label: "Win Rate", value: `${metrics.winRate}%`, style: { color: ac.hex } },
            { label: "Wins / Losses", value: `${metrics.wins} / ${metrics.losses}`, cls: "text-violet-600 dark:text-violet-400" },
            {
              label: "Avg P&L",
              value: `${metrics.avgPnL >= 0 ? "+" : "-"}$${formatNumber(Math.abs(metrics.avgPnL))}`,
              cls: metrics.avgPnL >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
            },
          ].map((m) => (
            <Card key={m.label} className={`${CARD} p-3 sm:p-4`}>
              <div className="text-xs font-medium opacity-70 mb-1">{m.label}</div>
              <div className={`text-xl sm:text-2xl font-bold ${m.cls || ""}`} style={m.style}>
                {m.value}
              </div>
            </Card>
          ))}
        </div>

        {/* Scorecard radar + last 14 days */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 lg:gap-6">
          <Card className={`${CARD} xl:col-span-2 p-4 sm:p-6`}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Target className="h-5 w-5" style={{ color: ac.hex }} />
                  Journal Scorecard
                </h3>
                <p className="text-xs opacity-60 mt-1">
                  {scoreDay ? `${selectedIsToday ? "Today" : format(parseISO(selectedDate), "d MMM")} vs last 30 days` : "Last 30 days (no entries on this day)"}
                </p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs opacity-60">Discipline</div>
                <div className="text-3xl font-extrabold leading-none mt-1" style={{ color: ac.hex }}>
                  {scoreMain ? scoreMain.score : "—"}
                  <span className="text-sm font-semibold opacity-50">/100</span>
                </div>
              </div>
            </div>

            {scoreMain ? (
              <>
                <div className="relative h-72 sm:h-80">
                  <Radar data={radarData} options={radarOptions} />
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4">
                  {SCORE_LABELS.map((label, i) => (
                    <div key={label} className="rounded-xl bg-gray-100/70 dark:bg-gray-900/40 px-2 py-2 text-center">
                      <div className="text-[10px] sm:text-xs opacity-60 truncate">{label}</div>
                      <div className="text-sm sm:text-base font-bold">{scoreMain.scores[i]}%</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-72 flex flex-col items-center justify-center text-center opacity-60 gap-2">
                <Target size={40} className="opacity-60" />
                <p className="text-sm">Log entries to see your scorecard.</p>
              </div>
            )}
          </Card>

          <Card className={`${CARD} xl:col-span-3 p-4 sm:p-6`}>
            <div className="mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <BarChart3 className="h-5 w-5" style={{ color: ac.hex }} />
                Last 14 Days
              </h3>
              <p className={`text-sm font-semibold mt-1 ${last14Net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {last14Net >= 0 ? "+" : "-"}${formatNumber(Math.abs(last14Net))}
                <span className="font-normal opacity-60"> · tap a bar to open that day</span>
              </p>
            </div>
            <div className="relative h-64 sm:h-80 xl:h-[22rem]">
              <Bar data={barData} options={barOptions} />
            </div>
          </Card>
        </div>

        {/* Entries List */}
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="animate-spin h-12 w-12 text-indigo-500" />
          </div>
        ) : error ? (
          <div className="text-center py-16 text-rose-400">{error}</div>
        ) : !isAccountReady ? (
          <Card className="p-6 sm:p-8 text-center bg-white/50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-2xl">
            <p className="text-lg sm:text-xl font-medium opacity-70 mb-3">
              Preparing your account...
            </p>
            <p className="text-sm opacity-60 mb-5">
              Please wait while we set up your journal.
            </p>
          </Card>
        ) : todayEntries.length === 0 ? (
          <Card className="p-6 sm:p-8 text-center bg-white/50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-2xl">
            <p className="text-lg sm:text-xl font-medium opacity-70 mb-3">
              {selectedIsToday ? "No entries logged today" : "No entries on this day"}
            </p>
            <p className="text-sm opacity-60 mb-5">
              Add your first journal entry to start tracking
            </p>
            <Button
              onClick={openNewEntry}
              style={{ backgroundColor: ac.hex }}
              className="w-full sm:w-auto hover:brightness-110 text-white font-semibold"
            >
              <Plus size={18} className="mr-2" /> Log First Entry
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {todayEntries.map((entry) => (
              <Card
                key={entry.id}
                className={`${CARD} relative overflow-hidden p-4 sm:p-5 pl-5 sm:pl-6 group`}
              >
                <span
                  className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                    entry.status === "pending" ? "bg-amber-500" : Number(entry.pnl || 0) >= 0 ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                />
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center text-base font-bold shadow-sm flex-shrink-0 ${
                          entry.status === "pending"
                            ? "bg-gray-300 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                            : Number(entry.pnl || 0) >= 0
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                        }`}
                      >
                        {entry.pair?.slice(0, 2) || "?"}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-lg">
                            {entry.pair || "—"} • {entry.direction || "—"}
                          </span>
                          {entry.status === "pending" && (
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                              Pending
                            </span>
                          )}
                        </div>
                        <div className="text-sm opacity-70 flex flex-wrap gap-3 mt-1">
                          <span>Open: {entry.openDateTime || entry.date ? new Date(entry.openDateTime || entry.date).toLocaleString() : "—"}</span>
                          {isExec(entry) && entry.closeDateTime && (
                            <span>Close: {new Date(entry.closeDateTime).toLocaleString()}</span>
                          )}
                          <span>Lot: {entry.lotSize || "—"}</span>
                          {isExec(entry) && entry.rr && <span>R:R {entry.rr}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Confluences */}
                    {entry.confluences?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {entry.confluences.map((conf, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20"
                          >
                            <Tag size={12} />
                            {conf}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Notes */}
                    {entry.notes && (
                      <div className="text-sm opacity-80 line-clamp-2 mt-2">
                        <FileText size={14} className="inline mr-1" />
                        {entry.notes}
                      </div>
                    )}

                    {/* Screenshot thumbnail */}
                    {entry.screenshotUrl && (
                      <a
                        href={entry.screenshotUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-2"
                      >
                        <img
                          src={entry.screenshotUrl}
                          alt="Chart"
                          className="h-16 w-16 object-cover rounded-lg border border-gray-300 dark:border-gray-600 hover:opacity-80 transition"
                        />
                      </a>
                    )}
                  </div>

                  <div className="flex items-center justify-between lg:justify-end w-full lg:w-auto gap-6">
                    <div className="text-left sm:text-right sm:min-w-[100px]">
                      {entry.status === "pending" ? (
                        <div className="text-lg font-semibold text-amber-600 dark:text-amber-400">Pending</div>
                      ) : (
                        <>
                          <div
                            className={`text-xl font-bold ${
                              Number(entry.pnl || 0) >= 0
                                ? "text-emerald-700 dark:text-emerald-500"
                                : "text-rose-700 dark:text-rose-500"
                            }`}
                          >
                            {Number(entry.pnl || 0) >= 0 ? "+" : "-"}${formatNumber(Math.abs(Number(entry.pnl || 0)))}
                          </div>
                          {entry.rr && <div className="text-xs opacity-70">R:R {entry.rr}</div>}
                        </>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => {
                          setEditingEntry(entry);
                          setForm({
                            openDateTime: entry.openDateTime || (entry.date ? `${String(entry.date).slice(0, 10)}T00:00` : formatDateTimeLocal()),
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
                        }}
                        className="h-10 w-10 rounded-lg border-2 hover:bg-indigo-100 dark:hover:bg-indigo-900"
                      >
                        <Edit size={18} />
                      </Button>
                      <Button
                        size="icon"
                        variant="destructive"
                        onClick={() => {
                          setEntryToDelete(entry.id);
                          setDeleteModalOpen(true);
                        }}
                        className="h-10 w-10 rounded-lg border-2 border-rose-300 dark:border-rose-700 hover:bg-rose-100 dark:hover:bg-rose-900"
                      >
                        <Trash2 size={18} />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Add / Edit Entry Modal */}
        {modalOpen && (
          <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-[1000] p-0 sm:p-4 overflow-y-auto">
            <div
              ref={modalContentRef}
              className={`w-full max-w-2xl rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden border backdrop-blur-md
                ${isDark ? "bg-gray-900/95 border-gray-700/60" : "bg-white/95 border-gray-200/60"}`}
            >
              <div className="p-5 sm:p-6 max-h-[92dvh] overflow-y-auto">
                <div className="flex justify-between items-center mb-5 sticky top-0 bg-inherit z-10">
                  <h2
                    className="text-xl sm:text-2xl font-bold bg-clip-text text-transparent"
                    style={{ backgroundImage: `linear-gradient(90deg, ${ac.hex}, ${ac.hex2})` }}
                  >
                    {editingEntry ? "Edit Entry" : "Add New Entry"}
                  </h2>
                  <Button variant="ghost" size="icon" onClick={() => setModalOpen(false)}>
                    <X size={24} />
                  </Button>
                </div>
                <form onSubmit={saveEntry} className="space-y-4 sm:space-y-5">
                  {/* Date/Time row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="block text-sm font-medium mb-1.5">Open Date & Time</Label>
                      <Input
                        type="datetime-local"
                        value={form.openDateTime}
                        onChange={(e) => setForm({ ...form, openDateTime: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="block text-sm font-medium mb-1.5">Close Date & Time</Label>
                      <Input
                        type="datetime-local"
                        value={form.closeDateTime}
                        onChange={(e) => setForm({ ...form, closeDateTime: e.target.value })}
                        disabled={form.status === "pending"}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="block text-sm font-medium mb-1.5">Pair / Asset</Label>
                      <Input
                        list="assets-list"
                        value={form.pair}
                        onChange={(e) => setForm({ ...form, pair: e.target.value.toUpperCase() })}
                        placeholder="Type or select..."
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
                        className={`w-full p-3 rounded-xl border text-sm ${
                          isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                        } focus:ring-2 focus:ring-indigo-500 outline-none`}
                      >
                        <option value="Long">Long</option>
                        <option value="Short">Short</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <Label className="block text-sm font-medium mb-1.5">Lot Size</Label>
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
                      <Label className="block text-sm font-medium mb-1.5">Status</Label>
                      <select
                        value={form.status}
                        onChange={(e) => setForm({ ...form, status: e.target.value })}
                        className={`w-full p-3 rounded-xl border text-sm ${
                          isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                        } focus:ring-2 focus:ring-indigo-500 outline-none`}
                      >
                        <option value="executed">Executed</option>
                        <option value="pending">Pending</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <Label className="block text-sm font-medium mb-1.5">Entry Price</Label>
                      <Input
                        type="number"
                        step="0.00001"
                        value={form.entry}
                        onChange={(e) => setForm({ ...form, entry: e.target.value })}
                        placeholder="1.08500"
                      />
                    </div>
                    <div>
                      <Label className="block text-sm font-medium mb-1.5">Exit Price</Label>
                      <Input
                        type="number"
                        step="0.00001"
                        value={form.exit}
                        onChange={(e) => setForm({ ...form, exit: e.target.value })}
                        placeholder={form.status === "pending" ? "Pending – no exit" : "1.09000"}
                        disabled={form.status === "pending"}
                        className={form.status === "pending" ? "bg-gray-200 dark:bg-gray-700 cursor-not-allowed" : ""}
                      />
                    </div>
                    <div>
                      <Label className="block text-sm font-medium mb-1.5">P&L (auto)</Label>
                      <Input
                        type="text"
                        value={form.status === "pending" ? "Pending" : formatNumber(form.pnl)}
                        readOnly
                        placeholder="Auto-calculated"
                        className={`w-full p-3 rounded-xl border bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-not-allowed font-bold text-sm ${
                          Number(form.pnl) > 0
                            ? "text-emerald-700 dark:text-emerald-500"
                            : Number(form.pnl) < 0
                            ? "text-rose-700 dark:text-rose-500"
                            : ""
                        }`}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <Label className="block text-sm font-medium mb-1.5">Stop Loss</Label>
                      <Input
                        type="number"
                        step="0.00001"
                        value={form.stopLoss}
                        onChange={(e) => setForm({ ...form, stopLoss: e.target.value })}
                        placeholder="1.08200"
                      />
                    </div>
                    <div>
                      <Label className="block text-sm font-medium mb-1.5">Take Profit</Label>
                      <Input
                        type="number"
                        step="0.00001"
                        value={form.takeProfit}
                        onChange={(e) => setForm({ ...form, takeProfit: e.target.value })}
                        placeholder="1.09500"
                      />
                    </div>
                    <div>
                      <Label className="block text-sm font-medium mb-1.5">R:R (auto)</Label>
                      <Input
                        type="text"
                        value={form.status === "pending" ? "—" : form.rr}
                        readOnly
                        placeholder="Auto-calculated"
                        className={`w-full p-3 rounded-xl border bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-not-allowed font-bold text-sm`}
                      />
                    </div>
                  </div>

                  {/* Confluence Tags */}
                  <div>
                    <Label className="block text-sm font-medium mb-1.5">Confluences</Label>
                    <ConfluenceTags
                      tags={form.confluences}
                      onChange={(newTags) => setForm({ ...form, confluences: newTags })}
                    />
                  </div>

                  {/* Screenshot – URL input + file upload */}
                  <div>
                    <Label className="block text-sm font-medium mb-1.5">Chart Screenshot</Label>
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => document.getElementById("image-upload").click()}
                            disabled={uploadingImage}
                            className="relative border-2 flex-1"
                          >
                            {uploadingImage ? (
                              <Loader2 className="animate-spin h-5 w-5" />
                            ) : (
                              <>
                                <Upload size={18} className="mr-2" />
                                Upload Image
                              </>
                            )}
                          </Button>
                          <span className="text-xs opacity-60">or paste</span>
                        </div>
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
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Link size={18} className="text-gray-400" />
                          <Input
                            type="url"
                            value={form.screenshotUrl}
                            onChange={(e) => setForm({ ...form, screenshotUrl: e.target.value })}
                            placeholder="https://i.imgur.com/your-image.png"
                            className="flex-1"
                          />
                        </div>
                      </div>
                    </div>
                    {form.screenshotUrl && (
                      <div className="mt-2 relative inline-block">
                        <img
                          src={form.screenshotUrl}
                          alt="Preview"
                          className="h-20 w-20 object-cover rounded-lg border"
                          onError={(e) => e.target.style.display = 'none'}
                        />
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, screenshotUrl: "" })}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  <div>
                    <Label className="block text-sm font-medium mb-1.5">Notes / Thoughts</Label>
                    <textarea
                      placeholder="What went well? What to improve? Emotional state? Market context?..."
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      className={`w-full p-3 rounded-xl border min-h-[100px] text-sm resize-y focus:ring-2 focus:ring-indigo-500 outline-none ${
                        isDark ? "bg-gray-800 border-gray-700 text-gray-100" : "bg-white border-gray-300 text-gray-900"
                      }`}
                    />
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col sm:flex-row gap-4 pt-4">
                    <Button
                      type="submit"
                      disabled={uploadingImage}
                      style={{ backgroundColor: ac.hex }}
                      className="flex-1 hover:brightness-110 text-white py-6 sm:py-4 text-base font-bold shadow-lg disabled:opacity-50"
                    >
                      {uploadingImage ? (
                        <Loader2 className="animate-spin mr-2 h-5 w-5" />
                      ) : null}
                      {editingEntry ? "Update Entry" : "Save Entry"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setModalOpen(false)}
                      className="flex-1 py-6 sm:py-4 text-base font-semibold border-2 border-gray-400 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Floating add button (phones – sits above the bottom tab bar) */}
        <button
          onClick={openNewEntry}
          disabled={!isAccountReady}
          aria-label="Add entry"
          style={{ backgroundColor: ac.hex }}
          className="md:hidden fixed bottom-24 right-4 z-[950] w-14 h-14 rounded-full text-white shadow-lg flex items-center justify-center active:scale-95 hover:brightness-110 disabled:opacity-50"
        >
          <Plus size={28} />
        </button>

        {/* Delete Confirmation */}
        {deleteModalOpen && (
          <DeleteConfirmModal
            isOpen={deleteModalOpen}
            onClose={() => {
              setDeleteModalOpen(false);
              setEntryToDelete(null);
            }}
            onConfirm={entryToDelete ? () => deleteEntry(entryToDelete) : clearTodayEntries}
            title={entryToDelete ? "Delete Entry" : "Clear Day's Entries"}
            message={
              entryToDelete
                ? "Are you sure you want to delete this journal entry? This action cannot be undone."
                : `Are you sure you want to delete all ${todayEntries.length} entries from this day?`
            }
          />
        )}
      </div>
    </div>
  );
}
