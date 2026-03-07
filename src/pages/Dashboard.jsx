// src/pages/DailyJournal.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import { Trash2, Plus, Loader2, Check, AlertCircle, FileText, X, Edit, Image, Tag, Upload, Link } from "lucide-react";
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
            handleImageUpload(file);
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

  // ─── Today's entries ────────────────────────────────────────────────
  const todayEntries = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return entries.filter((e) => e.openDateTime?.startsWith(today));
  }, [entries]);

  // ─── Metrics for today (only executed trades) ───────────────────────
  const metrics = useMemo(() => {
    const executed = todayEntries.filter(e => e.status === "executed");
    if (!executed.length) {
      return { net: 0, wins: 0, losses: 0, winRate: 0, avgPnL: 0 };
    }
    const total = executed.length;
    let net = 0;
    let wins = 0;
    executed.forEach((e) => {
      const pnl = Number(e.pnl || 0);
      net += pnl;
      if (pnl > 0) wins++;
    });
    const winRate = Math.round((wins / total) * 100);
    const avgPnL = net / total;
    return {
      net: net.toFixed(2),
      wins,
      losses: total - wins,
      winRate,
      avgPnL: avgPnL.toFixed(2),
    };
  }, [todayEntries]);

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
      <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sticky top-0 z-10 bg-inherit py-2">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent">
              Daily Journal – {currentAccount.name}
            </h1>
            <p className="text-sm sm:text-base mt-1 opacity-80">
              Log trades with auto PnL (Leverage {accountLeverage}:1)
            </p>
          </div>
          <Button
            onClick={() => {
              if (!isAccountReady) return;
              setModalOpen(true);
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
            }}
            disabled={!isAccountReady}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white shadow-md py-5 sm:py-4 text-base font-semibold border-2 border-indigo-400 dark:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={18} className="mr-2" /> Add Entry
          </Button>
        </div>

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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="p-4 rounded-xl bg-white/80 dark:bg-gray-800/60 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-md">
            <div className="text-xs font-medium opacity-70 mb-1">Net P&L Today</div>
            <div
              className={`text-xl sm:text-2xl font-bold ${
                metrics.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {metrics.net >= 0 ? "+" : "-"}${formatNumber(Math.abs(metrics.net))}
            </div>
          </Card>
          <Card className="p-4 rounded-xl bg-white/80 dark:bg-gray-800/60 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-md">
            <div className="text-xs font-medium opacity-70 mb-1">Win Rate</div>
            <div className="text-xl sm:text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {metrics.winRate}%
            </div>
          </Card>
          <Card className="p-4 rounded-xl bg-white/80 dark:bg-gray-800/60 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-md">
            <div className="text-xs font-medium opacity-70 mb-1">Wins / Losses</div>
            <div className="text-xl sm:text-2xl font-bold text-violet-600 dark:text-violet-400">
              {metrics.wins} / {metrics.losses}
            </div>
          </Card>
          <Card className="p-4 rounded-xl bg-white/80 dark:bg-gray-800/60 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-md">
            <div className="text-xs font-medium opacity-70 mb-1">Avg P&L</div>
            <div
              className={`text-xl sm:text-2xl font-bold ${
                metrics.avgPnL >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {metrics.avgPnL >= 0 ? "+" : "-"}${formatNumber(Math.abs(metrics.avgPnL))}
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
              No entries logged today
            </p>
            <p className="text-sm opacity-60 mb-5">
              Add your first journal entry to start tracking
            </p>
            <Button
              onClick={() => {
                setModalOpen(true);
                setEditingEntry(null);
              }}
              className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-semibold border-2 border-indigo-400"
            >
              <Plus size={18} className="mr-2" /> Log First Entry
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {todayEntries.map((entry) => (
              <Card
                key={entry.id}
                className="p-4 sm:p-5 rounded-2xl bg-white/80 dark:bg-gray-800/60 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-md hover:shadow-xl transition-all duration-200 group"
              >
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
                          <span>Open: {entry.openDateTime ? new Date(entry.openDateTime).toLocaleString() : "—"}</span>
                          {entry.status === "executed" && entry.closeDateTime && (
                            <span>Close: {new Date(entry.closeDateTime).toLocaleString()}</span>
                          )}
                          <span>Lot: {entry.lotSize || "—"}</span>
                          {entry.status === "executed" && entry.rr && <span>R:R {entry.rr}</span>}
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
                    <div className="text-right min-w-[100px]">
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
                            openDateTime: entry.openDateTime || formatDateTimeLocal(),
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
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000] p-4 overflow-y-auto">
            <div
              ref={modalContentRef}
              className={`w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border backdrop-blur-md
                ${isDark ? "bg-gray-900/95 border-gray-700/60" : "bg-white/95 border-gray-200/60"}`}
            >
              <div className="p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-5 sticky top-0 bg-inherit z-10">
                  <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent">
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
                      className="flex-1 bg-indigo-700 hover:bg-indigo-800 text-white py-6 sm:py-4 text-base font-bold border-2 border-indigo-500 shadow-lg disabled:opacity-50"
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

        {/* Delete Confirmation */}
        {deleteModalOpen && (
          <DeleteConfirmModal
            isOpen={deleteModalOpen}
            onClose={() => {
              setDeleteModalOpen(false);
              setEntryToDelete(null);
            }}
            onConfirm={entryToDelete ? () => deleteEntry(entryToDelete) : clearTodayEntries}
            title={entryToDelete ? "Delete Entry" : "Clear Today's Entries"}
            message={
              entryToDelete
                ? "Are you sure you want to delete this journal entry? This action cannot be undone."
                : `Are you sure you want to delete all ${todayEntries.length} entries from today?`
            }
          />
        )}
      </div>
    </div>
  );
}
