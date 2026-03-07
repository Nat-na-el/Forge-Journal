// src/pages/Trades.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { format, parseISO } from "date-fns";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTheme } from "../Theme-provider";
import {
  Trash2,
  Eye,
  Download,
  X,
  FileText,
  Edit,
  Check,
  AlertCircle,
  PlusCircle,
  BookOpen,
  Tag,
} from "lucide-react";
import DeleteConfirmModal from "../components/ui/DeleteConfirmModal";
import { db, auth } from "../firebase";
import {
  collection,
  getDocs,
  query,
  orderBy,
  updateDoc,
  doc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

const formatNumber = (num) => {
  if (!num && num !== 0) return "0.00";
  return Number(num).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// Tag input component for confluences (if editing, but we can keep simple display)
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

export default function Trades({ currentAccount }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState({ text: "", type: "success" });

  const selectedDate = searchParams.get("date");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("date-desc");

  const [selectedTrade, setSelectedTrade] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);
  const [editForm, setEditForm] = useState({
    pair: "",
    direction: "",
    entry: "",
    exit: "",
    stopLoss: "",
    takeProfit: "",
    rr: "",
    pnl: "",
    notes: "",
    status: "executed",
    confluences: [],
    screenshotUrl: "",
    openDateTime: "",
    closeDateTime: "",
  });
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [tradeToDelete, setTradeToDelete] = useState(null);
  const [user, setUser] = useState(null);

  const isAccountReady = user && currentAccount;

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((authUser) => {
      setUser(authUser);
      if (!authUser) {
        setTrades([]);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const refreshTrades = async () => {
    if (!user || !currentAccount?.id) {
      setTrades([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const tradesRef = collection(
        db,
        "users",
        user.uid,
        "accounts",
        currentAccount.id,
        "trades"
      );
      const q = query(tradesRef, orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      const loaded = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTrades(loaded);
    } catch (err) {
      console.error("Trades fetch failed:", err);
      setError("Could not load trades. Please check your connection.");
      setTrades([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && currentAccount) {
      refreshTrades();
    } else {
      setTrades([]);
      setLoading(false);
    }
  }, [currentAccount, user]);

  const filteredTrades = useMemo(() => {
    let result = [...trades];
    if (selectedDate) {
      result = result.filter((t) => t.openDateTime?.startsWith(selectedDate));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          (t.pair || "").toLowerCase().includes(q) ||
          (t.notes || "").toLowerCase().includes(q) ||
          (t.strategy || "").toLowerCase().includes(q) ||
          (t.confluences?.some(c => c.toLowerCase().includes(q)))
      );
    }
    result.sort((a, b) => {
      if (sortBy === "date-desc") return new Date(b.openDateTime || 0) - new Date(a.openDateTime || 0);
      if (sortBy === "date-asc") return new Date(a.openDateTime || 0) - new Date(b.openDateTime || 0);
      if (sortBy === "pnl-desc") return Number(b.pnl || 0) - Number(a.pnl || 0);
      if (sortBy === "pnl-asc") return Number(a.pnl || 0) - Number(b.pnl || 0);
      if (sortBy === "pair") return (a.pair || "").localeCompare(b.pair || "");
      return 0;
    });
    return result;
  }, [trades, selectedDate, searchQuery, sortBy]);

  const stats = useMemo(() => {
    const executed = filteredTrades.filter(t => t.status !== "pending");
    if (!executed.length) {
      return { totalPnL: 0, winRate: 0, totalTrades: filteredTrades.length, avgRR: 0 };
    }
    const total = executed.length;
    const wins = executed.filter((t) => Number(t.pnl || 0) > 0).length;
    const totalPnL = executed.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
    const totalRR = executed.reduce((sum, t) => sum + Number(t.rr || 0), 0);
    return {
      totalPnL: totalPnL.toFixed(2),
      winRate: total ? Math.round((wins / total) * 100) : 0,
      totalTrades: filteredTrades.length,
      avgRR: total ? (totalRR / total).toFixed(2) : 0,
    };
  }, [filteredTrades]);

  const openEdit = (trade) => {
    setEditingTrade(trade);
    setEditForm({
      pair: trade.pair || "",
      direction: trade.direction || "Long",
      entry: trade.entry || "",
      exit: trade.exit || "",
      stopLoss: trade.stopLoss || "",
      takeProfit: trade.takeProfit || "",
      rr: trade.rr || "",
      pnl: trade.pnl || "",
      notes: trade.notes || "",
      status: trade.status || "executed",
      confluences: trade.confluences || [],
      screenshotUrl: trade.screenshotUrl || "",
      openDateTime: trade.openDateTime || "",
      closeDateTime: trade.closeDateTime || "",
    });
    setEditModalOpen(true);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editingTrade) return;
    if (!user || !currentAccount?.id) {
      setMessage({ text: "No account or user logged in", type: "error" });
      return;
    }
    try {
      const tradeRef = doc(
        db,
        "users",
        user.uid,
        "accounts",
        currentAccount.id,
        "trades",
        editingTrade.id
      );
      await updateDoc(tradeRef, {
        ...editForm,
        updatedAt: serverTimestamp(),
      });
      setMessage({ text: "Trade updated successfully!", type: "success" });
      setTimeout(() => setMessage({ text: "", type: "success" }), 4000);
      setEditModalOpen(false);
      setEditingTrade(null);
      await refreshTrades();
    } catch (err) {
      console.error("Update error:", err);
      setMessage({ text: "Error updating trade: " + err.message, type: "error" });
    }
  };

  const deleteTrade = async (id) => {
    if (!user || !currentAccount?.id) return;
    try {
      await deleteDoc(
        doc(db, "users", user.uid, "accounts", currentAccount.id, "trades", id)
      );
      setMessage({ text: "Trade deleted successfully", type: "success" });
      setTimeout(() => setMessage({ text: "", type: "success" }), 4000);
      await refreshTrades();
    } catch (err) {
      console.error("Delete failed:", err);
      setMessage({ text: "Failed to delete trade: " + err.message, type: "error" });
    }
    setDeleteModalOpen(false);
    setTradeToDelete(null);
  };

  const exportCSV = () => {
    if (!filteredTrades.length) return;
    const headers = [
      "Open Date",
      "Close Date",
      "Pair",
      "Direction",
      "Entry",
      "Exit",
      "Stop Loss",
      "Take Profit",
      "PnL",
      "R:R",
      "Status",
      "Confluences",
      "Notes",
    ];
    const rows = filteredTrades.map((t) => [
      t.openDateTime || "",
      t.closeDateTime || "",
      t.pair || "",
      t.direction || "",
      t.entry || "",
      t.exit || "",
      t.stopLoss || "",
      t.takeProfit || "",
      t.pnl || 0,
      t.rr || "",
      t.status || "executed",
      (t.confluences || []).join("; "),
      `"${(t.notes || "").replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `forgex-trades-${currentAccount?.name || "account"}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const migrateOldTrades = async () => {
    if (!user || !currentAccount?.id) {
      setMessage({ text: "No user or account selected", type: "error" });
      return;
    }
    try {
      const oldTradesSnap = await getDocs(collection(db, "users", user.uid, "trades"));
      if (oldTradesSnap.empty) {
        setMessage({ text: "No old trades found to migrate", type: "info" });
        return;
      }
      const batch = writeBatch(db);
      oldTradesSnap.forEach((oldDoc) => {
        const newRef = doc(
          collection(db, "users", user.uid, "accounts", currentAccount.id, "trades")
        );
        batch.set(newRef, oldDoc.data());
        batch.delete(oldDoc.ref);
      });
      await batch.commit();
      setMessage({
        text: `Migrated ${oldTradesSnap.size} old trades to ${currentAccount.name}!`,
        type: "success",
      });
      await refreshTrades();
    } catch (err) {
      console.error("Migration failed:", err);
      setMessage({ text: "Migration failed: " + err.message, type: "error" });
    }
  };

  if (!currentAccount) {
    return (
      <div className={`min-h-screen w-full p-8 flex items-center justify-center ${isDark ? "bg-gray-950" : "bg-gray-50"}`}>
        <Card className="p-8 max-w-md text-center bg-white/80 dark:bg-gray-800/60 backdrop-blur-md">
          <AlertCircle size={48} className="mx-auto text-amber-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">No Account Selected</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Please create or select an account from the sidebar to view your trades.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen w-full p-4 sm:p-6 lg:p-8 transition-colors duration-300
        ${isDark
          ? "bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-gray-100"
          : "bg-gradient-to-br from-gray-50 via-white to-gray-100 text-gray-900"}`}
    >
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent">
              {currentAccount.name} – Trade History
            </h1>
            <p className="text-sm sm:text-base mt-1 opacity-80">
              Track and review your executed and pending trades
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={exportCSV}
              disabled={!filteredTrades.length || loading}
              className="bg-gray-700 hover:bg-gray-800 text-white shadow-md disabled:opacity-50 border-2 border-gray-600"
            >
              <Download size={18} className="mr-2" /> Export CSV
            </Button>
            <Button
              onClick={migrateOldTrades}
              variant="outline"
              className="border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400 hover:bg-indigo-600/10 border-2"
            >
              Migrate Old Trades
            </Button>
          </div>
        </div>

        {/* Feedback */}
        {message.text && (
          <div
            className={`p-4 rounded-xl flex items-center gap-3 shadow-sm ${
              message.type === "success"
                ? "bg-emerald-100/90 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700"
                : "bg-rose-100/90 dark:bg-rose-900/40 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-700"
            }`}
          >
            {message.type === "success" ? <Check size={20} /> : <AlertCircle size={20} />}
            {message.text}
          </div>
        )}

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium mb-2 opacity-80">Filter by Date</label>
            <input
              type="date"
              value={selectedDate || ""}
              onChange={(e) => setSearchParams(e.target.value ? { date: e.target.value } : {})}
              className={`w-full p-3.5 rounded-xl border transition-all ${
                isDark
                  ? "bg-gray-800/70 border-gray-700 text-gray-100 focus:border-indigo-500"
                  : "bg-white/80 border-gray-300 text-gray-900 focus:border-indigo-500"
              } focus:ring-2 focus:ring-indigo-500/40 outline-none`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 opacity-80">Search</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Pair, notes, confluences..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full p-3.5 pr-10 rounded-xl border transition-all ${
                  isDark
                    ? "bg-gray-800/70 border-gray-700 text-gray-100 focus:border-indigo-500"
                    : "bg-white/80 border-gray-300 text-gray-900 focus:border-indigo-500"
                } focus:ring-2 focus:ring-indigo-500/40 outline-none`}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 opacity-80">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className={`w-full p-3.5 rounded-xl border transition-all ${
                isDark
                  ? "bg-gray-800/70 border-gray-700 text-gray-100 focus:border-indigo-500"
                  : "bg-white/80 border-gray-300 text-gray-900 focus:border-indigo-500"
              } focus:ring-2 focus:ring-indigo-500/40 outline-none`}
            >
              <option value="date-desc">Newest First</option>
              <option value="date-asc">Oldest First</option>
              <option value="pnl-desc">Highest PnL</option>
              <option value="pnl-asc">Lowest PnL</option>
              <option value="pair">Pair (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 lg:gap-6">
          <Card className="p-5 rounded-2xl bg-white/80 dark:bg-gray-800/60 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
            <div className="text-xs font-medium opacity-70 mb-1">Total P&L (executed)</div>
            <div
              className={`text-2xl lg:text-3xl font-bold ${
                Number(stats.totalPnL) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {Number(stats.totalPnL) >= 0 ? "+" : "-"}${Math.abs(Number(stats.totalPnL)).toFixed(2)}
            </div>
          </Card>
          <Card className="p-5 rounded-2xl bg-white/80 dark:bg-gray-800/60 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
            <div className="text-xs font-medium opacity-70 mb-1">Win Rate</div>
            <div className="text-2xl lg:text-3xl font-bold text-indigo-600 dark:text-indigo-400">
              {stats.winRate}%
            </div>
          </Card>
          <Card className="p-5 rounded-2xl bg-white/80 dark:bg-gray-800/60 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
            <div className="text-xs font-medium opacity-70 mb-1">Total Trades</div>
            <div className="text-2xl lg:text-3xl font-bold text-violet-600 dark:text-violet-400">
              {stats.totalTrades}
            </div>
          </Card>
          <Card className="p-5 rounded-2xl bg-white/80 dark:bg-gray-800/60 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
            <div className="text-xs font-medium opacity-70 mb-1">Avg R:R</div>
            <div className="text-2xl lg:text-3xl font-bold text-cyan-600 dark:text-cyan-400">
              {stats.avgRR}
            </div>
          </Card>
        </div>

        {/* Trades List */}
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
          </div>
        ) : error ? (
          <div className="text-center py-16 text-rose-400 text-xl font-medium">{error}</div>
        ) : filteredTrades.length === 0 ? (
          <Card className="p-12 text-center bg-white/70 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl max-w-2xl mx-auto">
            <AlertCircle size={72} className="mx-auto text-amber-500 mb-6 opacity-90" />
            <h2 className="text-3xl font-bold mb-4 text-gray-900 dark:text-gray-100">
              No trades yet in {currentAccount.name}
            </h2>
            <p className="text-lg opacity-80 mb-10 leading-relaxed">
              Start building your performance history.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-6">
              <Button
                size="lg"
                className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg px-10 py-7 text-xl font-medium border-2 border-indigo-400"
                onClick={() => navigate("/trades/new")}
              >
                <PlusCircle size={24} className="mr-3" />
                Add New Trade
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-2 border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400 hover:bg-indigo-600/10 px-10 py-7 text-xl font-medium"
                onClick={() => navigate("/journal")}
              >
                <BookOpen size={24} className="mr-3" />
                Journal Today
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredTrades.map((trade) => (
              <Card
                key={trade.id}
                className="p-5 rounded-2xl bg-white/80 dark:bg-gray-800/60 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-md hover:shadow-xl transition-all duration-200 group"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center text-base font-bold shadow-sm ${
                          trade.status === "pending"
                            ? "bg-gray-300 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                            : Number(trade.pnl || 0) >= 0
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                        }`}
                      >
                        {trade.pair?.slice(0, 2) || "?"}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-lg">
                            {trade.pair || "—"} • {trade.direction || "—"}
                          </span>
                          {trade.status === "pending" && (
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                              Pending
                            </span>
                          )}
                        </div>
                        <div className="text-sm opacity-70 flex flex-wrap gap-3 mt-1">
                          <span>Open: {trade.openDateTime ? new Date(trade.openDateTime).toLocaleString() : "—"}</span>
                          {trade.status === "executed" && trade.closeDateTime && (
                            <span>Close: {new Date(trade.closeDateTime).toLocaleString()}</span>
                          )}
                          <span>Lot: {trade.lotSize || "—"}</span>
                          {trade.status === "executed" && trade.rr && <span>R:R {trade.rr}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Confluences */}
                    {trade.confluences?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {trade.confluences.map((conf, idx) => (
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
                    {trade.notes && (
                      <div className="text-sm opacity-80 line-clamp-2 mt-2">
                        <FileText size={14} className="inline mr-1" />
                        {trade.notes}
                      </div>
                    )}

                    {/* Screenshot */}
                    {trade.screenshotUrl && (
                      <a
                        href={trade.screenshotUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-2"
                      >
                        <img
                          src={trade.screenshotUrl}
                          alt="Chart"
                          className="h-16 w-16 object-cover rounded-lg border border-gray-300 dark:border-gray-600 hover:opacity-80 transition"
                        />
                      </a>
                    )}
                  </div>

                  <div className="flex items-center justify-between lg:justify-end w-full lg:w-auto gap-6">
                    <div className="text-right min-w-[100px]">
                      {trade.status === "pending" ? (
                        <div className="text-lg font-semibold text-amber-600 dark:text-amber-400">Pending</div>
                      ) : (
                        <>
                          <div
                            className={`text-xl font-bold ${
                              Number(trade.pnl || 0) >= 0
                                ? "text-emerald-700 dark:text-emerald-500"
                                : "text-rose-700 dark:text-rose-500"
                            }`}
                          >
                            {Number(trade.pnl || 0) >= 0 ? "+" : ""}$
                            {Math.abs(Number(trade.pnl || 0)).toFixed(2)}
                          </div>
                          {trade.rr && <div className="text-xs opacity-70">R:R {trade.rr}</div>}
                        </>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => setSelectedTrade(trade)}
                        className="h-10 w-10 rounded-lg border-2 hover:bg-indigo-100 dark:hover:bg-indigo-900"
                      >
                        <Eye size={18} />
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => openEdit(trade)}
                        className="h-10 w-10 rounded-lg border-2 hover:bg-indigo-100 dark:hover:bg-indigo-900"
                      >
                        <Edit size={18} />
                      </Button>
                      <Button
                        size="icon"
                        variant="destructive"
                        onClick={() => {
                          setTradeToDelete(trade.id);
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

        {/* View Details Modal */}
        {selectedTrade && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000] p-4">
            <div
              className={`w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border backdrop-blur-md
                ${isDark ? "bg-gray-900/95 border-gray-700/60" : "bg-white/95 border-gray-200/60"}`}
            >
              <div className="p-6 max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent">
                    Trade Details
                  </h2>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedTrade(null)}>
                    <X size={24} />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm opacity-70 mb-1">Pair & Direction</div>
                      <div className="text-xl font-semibold">
                        {selectedTrade.pair || "—"} • {selectedTrade.direction || "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm opacity-70 mb-1">Open Date & Time</div>
                      <div className="text-lg">
                        {selectedTrade.openDateTime
                          ? new Date(selectedTrade.openDateTime).toLocaleString()
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm opacity-70 mb-1">Close Date & Time</div>
                      <div className="text-lg">
                        {selectedTrade.closeDateTime
                          ? new Date(selectedTrade.closeDateTime).toLocaleString()
                          : selectedTrade.status === "pending" ? "Pending" : "—"}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm opacity-70 mb-1">Entry</div>
                        <div className="text-lg font-medium">{selectedTrade.entry || "—"}</div>
                      </div>
                      <div>
                        <div className="text-sm opacity-70 mb-1">Exit</div>
                        <div className="text-lg font-medium">
                          {selectedTrade.status === "pending" ? "Pending" : (selectedTrade.exit || "—")}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm opacity-70 mb-1">Stop Loss</div>
                        <div className="text-lg">{selectedTrade.stopLoss || "—"}</div>
                      </div>
                      <div>
                        <div className="text-sm opacity-70 mb-1">Take Profit</div>
                        <div className="text-lg">{selectedTrade.takeProfit || "—"}</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm opacity-70 mb-1">Risk:Reward</div>
                      <div className="text-xl font-bold text-violet-600 dark:text-violet-400">
                        {selectedTrade.status === "pending" ? "—" : (selectedTrade.rr || "—")}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm opacity-70 mb-1">Status</div>
                      <div className={`text-lg font-semibold ${
                        selectedTrade.status === "pending" ? "text-amber-600" : "text-emerald-600"
                      }`}>
                        {selectedTrade.status === "pending" ? "⏳ Pending" : "✅ Executed"}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm opacity-70 mb-1">Profit & Loss</div>
                      <div
                        className={`text-3xl font-bold ${
                          selectedTrade.status === "pending"
                            ? "text-gray-500"
                            : Number(selectedTrade.pnl || 0) >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {selectedTrade.status === "pending"
                          ? "Pending"
                          : `${Number(selectedTrade.pnl || 0) >= 0 ? "+" : ""}$${Math.abs(Number(selectedTrade.pnl || 0)).toFixed(2)}`
                        }
                      </div>
                    </div>
                    {selectedTrade.confluences?.length > 0 && (
                      <div>
                        <div className="text-sm opacity-70 mb-2">Confluences</div>
                        <div className="flex flex-wrap gap-2">
                          {selectedTrade.confluences.map((conf, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-3 py-1 text-xs rounded-full bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30"
                            >
                              {conf}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedTrade.notes && (
                      <div>
                        <div className="text-sm opacity-70 mb-2 flex items-center gap-2">
                          <FileText size={16} /> Notes
                        </div>
                        <div className="p-4 rounded-xl bg-gray-50/80 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 whitespace-pre-wrap text-sm">
                          {selectedTrade.notes}
                        </div>
                      </div>
                    )}
                    {selectedTrade.screenshotUrl && (
                      <div>
                        <div className="text-sm opacity-70 mb-2">Chart</div>
                        <a href={selectedTrade.screenshotUrl} target="_blank" rel="noopener noreferrer">
                          <img
                            src={selectedTrade.screenshotUrl}
                            alt="Chart"
                            className="max-h-48 rounded-lg border border-gray-300 dark:border-gray-600"
                          />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-4">
                <Button variant="outline" onClick={() => openEdit(selectedTrade)}>
                  <Edit size={16} className="mr-2" /> Edit Trade
                </Button>
                <Button variant="outline" onClick={() => setSelectedTrade(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editModalOpen && editingTrade && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000] p-4">
            <div
              className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border backdrop-blur-md
                ${isDark ? "bg-gray-900/95 border-gray-700/60" : "bg-white/95 border-gray-200/60"}`}
            >
              <div className="p-6 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent">
                    Edit Trade
                  </h2>
                  <Button variant="ghost" size="icon" onClick={() => setEditModalOpen(false)}>
                    <X size={24} />
                  </Button>
                </div>
                <form onSubmit={saveEdit} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Pair</label>
                      <input
                        value={editForm.pair}
                        onChange={(e) => setEditForm({ ...editForm, pair: e.target.value })}
                        className={`w-full p-3 rounded-xl border ${
                          isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                        } focus:ring-2 focus:ring-indigo-500 outline-none`}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Direction</label>
                      <select
                        value={editForm.direction}
                        onChange={(e) => setEditForm({ ...editForm, direction: e.target.value })}
                        className={`w-full p-3 rounded-xl border ${
                          isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                        } focus:ring-2 focus:ring-indigo-500 outline-none`}
                      >
                        <option value="Long">Long</option>
                        <option value="Short">Short</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Open Date/Time</label>
                      <input
                        type="datetime-local"
                        value={editForm.openDateTime}
                        onChange={(e) => setEditForm({ ...editForm, openDateTime: e.target.value })}
                        className={`w-full p-3 rounded-xl border ${
                          isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                        } focus:ring-2 focus:ring-indigo-500 outline-none`}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Close Date/Time</label>
                      <input
                        type="datetime-local"
                        value={editForm.closeDateTime}
                        onChange={(e) => setEditForm({ ...editForm, closeDateTime: e.target.value })}
                        disabled={editForm.status === "pending"}
                        className={`w-full p-3 rounded-xl border ${
                          editForm.status === "pending"
                            ? "bg-gray-200 dark:bg-gray-700 cursor-not-allowed"
                            : isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                        } focus:ring-2 focus:ring-indigo-500 outline-none`}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Entry</label>
                      <input
                        type="number"
                        step="0.00001"
                        value={editForm.entry}
                        onChange={(e) => setEditForm({ ...editForm, entry: e.target.value })}
                        className={`w-full p-3 rounded-xl border ${
                          isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                        } focus:ring-2 focus:ring-indigo-500 outline-none`}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Exit</label>
                      <input
                        type="number"
                        step="0.00001"
                        value={editForm.exit}
                        onChange={(e) => setEditForm({ ...editForm, exit: e.target.value })}
                        disabled={editForm.status === "pending"}
                        className={`w-full p-3 rounded-xl border ${
                          editForm.status === "pending"
                            ? "bg-gray-200 dark:bg-gray-700 cursor-not-allowed"
                            : isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                        } focus:ring-2 focus:ring-indigo-500 outline-none`}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">PnL</label>
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.pnl}
                        onChange={(e) => setEditForm({ ...editForm, pnl: e.target.value })}
                        disabled={editForm.status === "pending"}
                        className={`w-full p-3 rounded-xl border ${
                          editForm.status === "pending"
                            ? "bg-gray-200 dark:bg-gray-700 cursor-not-allowed"
                            : isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                        } focus:ring-2 focus:ring-indigo-500 outline-none`}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Stop Loss</label>
                      <input
                        type="number"
                        step="0.00001"
                        value={editForm.stopLoss}
                        onChange={(e) => setEditForm({ ...editForm, stopLoss: e.target.value })}
                        className={`w-full p-3 rounded-xl border ${
                          isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                        } focus:ring-2 focus:ring-indigo-500 outline-none`}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Take Profit</label>
                      <input
                        type="number"
                        step="0.00001"
                        value={editForm.takeProfit}
                        onChange={(e) => setEditForm({ ...editForm, takeProfit: e.target.value })}
                        className={`w-full p-3 rounded-xl border ${
                          isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                        } focus:ring-2 focus:ring-indigo-500 outline-none`}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">R:R</label>
                      <input
                        type="number"
                        step="0.1"
                        value={editForm.rr}
                        onChange={(e) => setEditForm({ ...editForm, rr: e.target.value })}
                        disabled={editForm.status === "pending"}
                        className={`w-full p-3 rounded-xl border ${
                          editForm.status === "pending"
                            ? "bg-gray-200 dark:bg-gray-700 cursor-not-allowed"
                            : isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                        } focus:ring-2 focus:ring-indigo-500 outline-none`}
                      />
                    </div>
                  </div>

                  {/* Status */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Status</label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                      className={`w-full p-3 rounded-xl border ${
                        isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                      } focus:ring-2 focus:ring-indigo-500 outline-none`}
                    >
                      <option value="executed">Executed</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>

                  {/* Confluences */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Confluences</label>
                    <ConfluenceTags
                      tags={editForm.confluences}
                      onChange={(newTags) => setEditForm({ ...editForm, confluences: newTags })}
                    />
                  </div>

                  {/* Screenshot URL */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Screenshot URL</label>
                    <input
                      type="url"
                      value={editForm.screenshotUrl}
                      onChange={(e) => setEditForm({ ...editForm, screenshotUrl: e.target.value })}
                      placeholder="https://i.imgur.com/your-image.png"
                      className={`w-full p-3 rounded-xl border ${
                        isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                      } focus:ring-2 focus:ring-indigo-500 outline-none`}
                    />
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Notes</label>
                    <textarea
                      value={editForm.notes}
                      onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                      className={`w-full p-3 rounded-xl border min-h-[80px] ${
                        isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                      } focus:ring-2 focus:ring-indigo-500 outline-none`}
                      placeholder="What did you learn from this trade?"
                    />
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-4 pt-4">
                    <Button
                      type="submit"
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                    >
                      Save Changes
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditModalOpen(false)}
                      className="flex-1"
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
              setTradeToDelete(null);
            }}
            onConfirm={() => deleteTrade(tradeToDelete)}
            title="Delete Trade"
            message="Are you sure you want to delete this trade? This action cannot be undone."
          />
        )}
      </div>
    </div>
  );
}
