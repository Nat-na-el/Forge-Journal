import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, X } from "lucide-react";

const API_BASE = "https://tradeass-backend.onrender.com/api/trades";

const forexPairs = [
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "AUDUSD",
  "USDCAD",
  "USDCHF",
  "NZDUSD",
  "XAUUSD",
  "XAGUSD",
  "NAS100",
  "SPX500",
  "BTCUSD",
  "ETHUSD",
];

export default function AddTrade({ onSaved }) {
  const [open, setOpen] = useState(false);
  const [showDir, setShowDir] = useState(false);
  const [pairSuggestions, setPairSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    pair: "EURUSD",
    direction: "Long",
    entry: "1.1000",
    stopLoss: "1.0950",
    takeProfit: "1.1100",
    positionSize: "30",
    leverage: "10",
    exit: "",
    notesInput: "",
    accountId: "default",
  });

  const [calc, setCalc] = useState({
    risk: 150,
    reward: 300,
    rr: 2,
    pnl: 0,
  });

  const [tags, setTags] = useState([]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));

    if (name === "pair") {
      if (value.length > 0) {
        const matches = forexPairs.filter((p) =>
          p.toLowerCase().includes(value.toLowerCase()),
        );
        setPairSuggestions(matches);
        setShowSuggestions(true);
      } else {
        setShowSuggestions(false);
      }
    }
  };

  const addTag = () => {
    const newTag = form.notesInput.trim();
    if (newTag && !tags.includes(newTag)) {
      setTags([...tags, newTag]);
    }
    setForm((f) => ({ ...f, notesInput: "" }));
  };

  const removeTag = (tag) => setTags(tags.filter((t) => t !== tag));

  const handleNoteKeyDown = (e) => {
    if (e.key === "," || e.key === "Enter") {
      e.preventDefault();
      addTag();
    }
  };

  useEffect(() => {
    const entry = parseFloat(form.entry);
    const stop = parseFloat(form.stopLoss);
    const tp = parseFloat(form.takeProfit);
    const size = parseFloat(form.positionSize);
    const leverage = parseFloat(form.leverage) || 1;
    const exit = parseFloat(form.exit);

    if (!entry || !stop || !tp || !size) return;

    const direction = form.direction || "Long";
    const riskPerUnit = direction === "Long" ? entry - stop : stop - entry;
    const rewardPerUnit = direction === "Long" ? tp - entry : entry - tp;

    const risk = riskPerUnit * size * leverage;
    const reward = rewardPerUnit * size * leverage;
    const rr = risk !== 0 ? (reward / Math.abs(risk)).toFixed(2) : "0.00";

    let pnl = 0;
    if (exit) {
      const pnlPerUnit = direction === "Long" ? exit - entry : entry - exit;
      pnl = (pnlPerUnit * size * leverage).toFixed(2);
    }

    setCalc({
      risk: Math.abs(risk).toFixed(2),
      reward: reward.toFixed(2),
      rr,
      pnl: parseFloat(pnl),
    });
  }, [
    form.entry,
    form.stopLoss,
    form.takeProfit,
    form.exit,
    form.positionSize,
    form.leverage,
    form.direction,
  ]);

  // ✅ FIXED SAVE FUNCTION - NO DUPLICATE JSON!
  async function saveTrade() {
    setSaving(true);

    // ✅ GET CORRECT ACCOUNT ID FROM localStorage
    const currentAccountId =
      localStorage.getItem("currentAccountId") || "default";

    const tradeData = {
      ...form,
      notes: tags.join(", "),
      risk: parseFloat(calc.risk),
      reward: parseFloat(calc.reward),
      rr: parseFloat(calc.rr),
      pnl: parseFloat(calc.pnl),
      entry: parseFloat(form.entry) || 1.1,
      accountId: currentAccountId, // ✅ USE localStorage - NO OVERRIDE!
      stopLoss: parseFloat(form.stopLoss),
      takeProfit: parseFloat(form.takeProfit),
      positionSize: parseFloat(form.positionSize),
      leverage: parseFloat(form.leverage) || 1,
      exit: form.exit ? parseFloat(form.exit) : null,
    };

    try {
      console.log("🚀 SENDING TO SERVER:", tradeData);

      const res = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tradeData),
      });

      // ✅ ONLY CALL res.json() ONCE!
      const result = await res.json();
      console.log("✅ TRADE SAVED:", result);

      // ✅ REFRESH DASHBOARD AFTER SAVE
      if (window.location.pathname.includes("/dashboard")) {
        window.location.reload();
      }

      if (!res.ok) {
        console.error("❌ SERVER ERROR:", res.status, result);
        throw new Error(
          `HTTP ${res.status}: ${result.error || "Unknown error"}`,
        );
      }

      console.log("✅ TRADE SAVED TO DATABASE:", result.id);

      if (onSaved) onSaved(result);
      setOpen(false);
      resetForm();
    } catch (err) {
      console.error("❌ CRITICAL ERROR:", err);
      alert("Server error - check console (F12)");
    } finally {
      setSaving(false);
    }
  }

  const resetForm = () => {
    setForm({
      date: new Date().toISOString().slice(0, 10),
      pair: "EURUSD",
      direction: "Long",
      entry: "1.1000",
      stopLoss: "1.0950",
      takeProfit: "1.1100",
      positionSize: "30",
      leverage: "10",
      exit: "",
      notesInput: "",
      accountId: "default",
    });
    setTags([]);
    setCalc({ risk: 150, reward: 300, rr: "2.00", pnl: 0 });
  };

  // YOUR ORIGINAL UI - NO CHANGES
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-2 px-4 py-2 rounded-lg shadow-md border border-blue-700 transition-all">
          + Add Trade
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-6 max-h-[90vh] overflow-y-auto">
        <DialogTitle className="text-2xl font-bold mb-2 text-gray-800 dark:text-gray-100">
          Add Trade
        </DialogTitle>
        <DialogDescription className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Enter your trade details below
        </DialogDescription>

        <div className="border-t pt-4 mt-2 mb-4">
          <div className="text-xs text-gray-600 dark:text-gray-400">
            Net P&L
          </div>
          <div
            className={`text-2xl font-bold ${
              calc.pnl < 0
                ? "text-[#FF0000]"
                : calc.pnl > 0
                  ? "text-[#00A500]"
                  : "text-gray-600"
            }`}
          >
            {calc.pnl
              ? calc.pnl >= 0
                ? `+$${calc.pnl}`
                : `-$${Math.abs(calc.pnl)}`
              : "$0.00"}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative">
          <div>
            <Label className="text-sm text-gray-600 dark:text-gray-400">
              Date
            </Label>
            <Input
              type="date"
              name="date"
              value={form.date}
              onChange={handleChange}
              className="bg-gray-50 dark:bg-gray-900"
            />
          </div>
          <div className="relative">
            <Label className="text-sm text-gray-600 dark:text-gray-400">
              Pair
            </Label>
            <Input
              name="pair"
              placeholder="e.g. EURUSD"
              value={form.pair}
              onChange={handleChange}
              onFocus={() => form.pair && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              className="bg-gray-50 dark:bg-gray-900"
            />
            {showSuggestions && pairSuggestions.length > 0 && (
              <div className="absolute z-50 bg-white dark:bg-gray-800 border rounded-md shadow-lg w-full mt-1 max-h-40 overflow-y-auto">
                {pairSuggestions.map((p) => (
                  <div
                    key={p}
                    onClick={() => {
                      setForm((f) => ({ ...f, pair: p }));
                      setShowSuggestions(false);
                    }}
                    className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    {p}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <div className="relative">
            <Label className="text-sm text-gray-600 dark:text-gray-400">
              Direction
            </Label>
            <button
              type="button"
              onClick={() => setShowDir((v) => !v)}
              className="w-full flex justify-between items-center px-3 py-2 mt-1 h-[40px] rounded-md border bg-gray-50 dark:bg-gray-900 text-sm"
            >
              {form.direction} <ChevronDown className="w-4 h-4 opacity-60" />
            </button>
            {showDir && (
              <div className="absolute z-50 bg-white/95 dark:bg-gray-800 border rounded-md shadow-lg w-full mt-1">
                <div
                  onClick={() => {
                    setForm((f) => ({ ...f, direction: "Long" }));
                    setShowDir(false);
                  }}
                  className="px-3 py-2 text-sm cursor-pointer text-[#00A500] hover:bg-green-100 dark:hover:bg-green-900/40"
                >
                  🟩 Long
                </div>
                <div
                  onClick={() => {
                    setForm((f) => ({ ...f, direction: "Short" }));
                    setShowDir(false);
                  }}
                  className="px-3 py-2 text-sm cursor-pointer text-[#FF0000] hover:bg-red-100 dark:hover:bg-red-900/40"
                >
                  🟥 Short
                </div>
              </div>
            )}
          </div>
          <div>
            <Label className="text-sm text-gray-600 dark:text-gray-400">
              Position Size
            </Label>
            <Input
              name="positionSize"
              placeholder="30"
              value={form.positionSize}
              onChange={handleChange}
              className="h-[40px] bg-gray-50 dark:bg-gray-900"
            />
          </div>
          <div>
            <Label className="text-sm text-gray-600 dark:text-gray-400">
              Leverage
            </Label>
            <Input
              name="leverage"
              placeholder="10"
              value={form.leverage}
              onChange={handleChange}
              className="h-[40px] bg-gray-50 dark:bg-gray-900"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          {[
            { name: "entry", label: "Entry", placeholder: "1.0800" },
            { name: "stopLoss", label: "Stop Loss", placeholder: "1.0750" },
            { name: "takeProfit", label: "Take Profit", placeholder: "1.0900" },
          ].map(({ name, label, placeholder }) => (
            <div key={name}>
              <Label className="text-sm text-gray-600 dark:text-gray-400">
                {label}
              </Label>
              <Input
                name={name}
                placeholder={placeholder}
                value={form[name]}
                onChange={handleChange}
                className="bg-gray-50 dark:bg-gray-900"
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t pt-4 mt-4">
          <div>
            <Label className="text-sm text-gray-600 dark:text-gray-400">
              Risk
            </Label>
            <div className="text-[#FF0000] font-semibold">${calc.risk}</div>
          </div>
          <div>
            <Label className="text-sm text-gray-600 dark:text-gray-400">
              Reward
            </Label>
            <div className="text-[#00A500] font-semibold">${calc.reward}</div>
          </div>
          <div>
            <Label className="text-sm text-gray-600 dark:text-gray-400">
              R:R
            </Label>
            <div className="text-blue-600 dark:text-blue-400 font-semibold">
              {calc.rr}:1
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div>
            <Label className="text-sm text-gray-600 dark:text-gray-400">
              Exit (optional)
            </Label>
            <Input
              name="exit"
              placeholder="1.0850"
              value={form.exit}
              onChange={handleChange}
              className="bg-gray-50 dark:bg-gray-900"
            />
          </div>
          <div>
            <Label className="text-sm text-gray-600 dark:text-gray-400">
              Confluences
            </Label>
            <div className="flex flex-wrap items-center gap-2 p-2 border rounded-md bg-gray-50 dark:bg-gray-900">
              {tags.map((t, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-md text-xs"
                >
                  {t}{" "}
                  <X
                    size={12}
                    className="cursor-pointer"
                    onClick={() => removeTag(t)}
                  />
                </div>
              ))}
              <input
                type="text"
                name="notesInput"
                value={form.notesInput}
                onChange={handleChange}
                onKeyDown={handleNoteKeyDown}
                placeholder="Type and press comma..."
                className="flex-1 min-w-[100px] bg-transparent outline-none text-sm text-gray-800 dark:text-gray-200"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white shadow-md"
            onClick={saveTrade}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Trade"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
