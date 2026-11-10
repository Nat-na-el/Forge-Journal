// src/components/ui/AddTrade.jsx  – full "New Trade" page, saves to Firestore like the Journal
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, addDoc, getDocs, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  ArrowLeft,
  Check,
  AlertCircle,
  Loader2,
  Tag,
  X,
  Image as ImageIcon,
  TrendingUp,
  TrendingDown,
  Clock,
} from "lucide-react";
import { useTheme } from "../../Theme-provider";
import { db, auth, storage } from "../../firebase";
import { Card } from "./card";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import AccentPicker from "./AccentPicker";
import useAccent, { CARD } from "../../hooks/useAccent";
import { MistakePicker, StarRating } from "./TradeGrading";

const QUICK_PAIRS = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "NAS100", "US30", "JP225", "UK100", "BTCUSD"];
const QUICK_TAGS = ["Trend", "Breakout", "Support/Resistance", "Liquidity sweep", "News", "Retest"];

const pad = (n) => String(n).padStart(2, "0");
const nowLocal = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const emptyForm = () => ({
  openDateTime: nowLocal(),
  closeDateTime: nowLocal(),
  pair: "",
  direction: "Long",
  status: "executed",
  entry: "",
  stopLoss: "",
  takeProfit: "",
  exit: "",
  lotSize: "0.1",
  pnlManual: "",
  playbookId: "",
  strategy: "",
  notes: "",
  screenshotUrl: "",
});

// Shrinks screenshots before upload (window.Image – the lucide icon above shadows the global)
const compressImage = (file, maxWidth = 1200, quality = 0.8) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new window.Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve(new File([blob], file.name || "chart.jpg", { type: "image/jpeg" }))
              : reject(new Error("Canvas to blob failed")),
          "image/jpeg",
          quality
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });

const money = (n) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AddTrade({ currentAccount }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const navigate = useNavigate();
  const { accent, setAccent, ac } = useAccent();

  const [form, setForm] = useState(emptyForm);
  const [tags, setTags] = useState([]);
  const [rating, setRating] = useState(0);
  const [mistakes, setMistakes] = useState([]);
  const [playbooks, setPlaybooks] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const leverage = currentAccount?.leverage || 100;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const onChange = (e) => set({ [e.target.name]: e.target.value });

  // Playbooks for this account, so a trade can be linked to a named setup.
  useEffect(() => {
    const user = auth.currentUser;
    if (!user || !currentAccount?.id) return undefined;
    let cancelled = false;
    getDocs(collection(db, "users", user.uid, "accounts", currentAccount.id, "playbooks"))
      .then((snap) => {
        if (!cancelled) setPlaybooks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentAccount?.id]);

  // ─── Live maths (same formula as the Daily Journal) ──────────────────
  const calc = useMemo(() => {
    const entry = parseFloat(form.entry);
    const sl = parseFloat(form.stopLoss);
    const tp = parseFloat(form.takeProfit);
    const exit = parseFloat(form.exit);
    const lot = parseFloat(form.lotSize) || 0.1;
    const long = form.direction === "Long";
    const k = lot * leverage * 100;

    const riskPx = entry && sl ? (long ? entry - sl : sl - entry) : null;
    const rewardPx = entry && tp ? (long ? tp - entry : entry - tp) : null;
    const risk = riskPx > 0 ? riskPx * k : null;
    const reward = rewardPx > 0 ? rewardPx * k : null;
    const rr = risk && reward ? reward / risk : null;
    const pnl = entry && exit ? (long ? exit - entry : entry - exit) * k : null;

    const warnings = [];
    if (entry && sl && riskPx <= 0)
      warnings.push(`Stop loss should be ${long ? "below" : "above"} your entry for a ${form.direction}.`);
    if (entry && tp && rewardPx <= 0)
      warnings.push(`Take profit should be ${long ? "above" : "below"} your entry for a ${form.direction}.`);

    return { risk, reward, rr, pnl, warnings };
  }, [form.entry, form.stopLoss, form.takeProfit, form.exit, form.lotSize, form.direction, leverage]);

  const pending = form.status === "pending";
  const finalPnl =
    pending ? 0 : form.pnlManual !== "" ? Number(form.pnlManual) || 0 : calc.pnl !== null ? Number(calc.pnl.toFixed(2)) : 0;
  const hasResult = !pending && (form.pnlManual !== "" || calc.pnl !== null);
  const riskShare = calc.risk && calc.reward ? (calc.risk / (calc.risk + calc.reward)) * 100 : 50;

  // ─── Screenshot upload (button or paste) ─────────────────────────────
  const uploadScreenshot = async (file) => {
    const user = auth.currentUser;
    if (!file || !user || !currentAccount?.id) return;
    setUploading(true);
    setError(null);
    try {
      const small = await compressImage(file);
      const r = ref(storage, `users/${user.uid}/accounts/${currentAccount.id}/trades/${Date.now()}_${small.name}`);
      await uploadBytes(r, small);
      set({ screenshotUrl: await getDownloadURL(r) });
    } catch (err) {
      console.error("Upload failed:", err);
      setError("Could not upload the screenshot. Try a smaller image.");
    } finally {
      setUploading(false);
    }
  };

  const uploadRef = useRef(null);
  uploadRef.current = uploadScreenshot;
  useEffect(() => {
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image"));
      if (item) {
        e.preventDefault();
        uploadRef.current?.(item.getAsFile());
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  // ─── Tags ────────────────────────────────────────────────────────────
  const addTag = (value) => {
    const v = value.trim();
    if (v && !tags.includes(v)) setTags((t) => [...t, v]);
    setTagInput("");
  };

  // ─── Save ────────────────────────────────────────────────────────────
  const save = async (another = false) => {
    setError(null);
    const user = auth.currentUser;
    if (!user || !currentAccount?.id) return setError("Please log in and select an account.");
    if (!form.pair.trim()) return setError("Pick or type a pair / asset.");
    if (!parseFloat(form.entry)) return setError("Enter your entry price.");
    if (!pending && !form.exit && form.pnlManual === "")
      return setError("Add an exit price (or a P&L), or mark the trade as Pending.");

    const selectedPlaybook = playbooks.find((p) => p.id === form.playbookId);
    const strategyText = (form.strategy || "").trim() || selectedPlaybook?.name || "";

    const payload = {
      openDateTime: form.openDateTime || nowLocal(),
      closeDateTime: pending ? null : form.closeDateTime || null,
      pair: form.pair.trim().toUpperCase(),
      direction: form.direction,
      entry: Number(form.entry) || 0,
      exit: pending ? 0 : Number(form.exit) || 0,
      stopLoss: Number(form.stopLoss) || 0,
      takeProfit: Number(form.takeProfit) || 0,
      pnl: finalPnl,
      rr: pending || !calc.rr ? "" : calc.rr.toFixed(2),
      lotSize: Number(form.lotSize) || 0.1,
      playbookId: form.playbookId || "",
      playbook: selectedPlaybook?.name || "",
      strategy: strategyText,
      notes: form.notes.trim(),
      status: form.status,
      confluences: tags,
      screenshotUrl: form.screenshotUrl || "",
      rating: Number(rating) || 0,
      mistakes,
    };

    setSaving(true);
    try {
      await addDoc(collection(db, "users", user.uid, "accounts", currentAccount.id, "trades"), {
        ...payload,
        createdAt: serverTimestamp(),
      });
      if (another) {
        setForm(emptyForm());
        setTags([]);
        setRating(0);
        setMistakes([]);
        setToast("Trade saved — ready for the next one.");
        setTimeout(() => setToast(null), 3000);
        window.scrollTo?.({ top: 0, behavior: "smooth" });
      } else {
        navigate(`/trades?date=${payload.openDateTime.slice(0, 10)}`);
      }
    } catch (err) {
      console.error("Save error:", err);
      setError("Failed to save trade: " + (err.message || "unknown error"));
    } finally {
      setSaving(false);
    }
  };

  // ─── UI helpers ──────────────────────────────────────────────────────
  const inputCls = "bg-gray-50 dark:bg-gray-900 h-11";
  const seg = (active, activeStyle) =>
    `flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
      active ? "text-white shadow-md" : "bg-gray-100 dark:bg-gray-900/60 text-gray-600 dark:text-gray-300"
    }`;
  const warn = calc.warnings.length > 0;

  if (!currentAccount) {
    return (
      <div className={`min-h-screen w-full p-8 flex items-center justify-center ${isDark ? "bg-gray-950" : "bg-gray-50"}`}>
        <Card className="p-8 max-w-md text-center bg-white/80 dark:bg-gray-800/60">
          <AlertCircle size={48} className="mx-auto text-amber-500 mb-4" />
          <h2 className="text-2xl font-bold mb-2">No Account Selected</h2>
          <p className="opacity-70">Select an account from the menu to add a trade.</p>
        </Card>
      </div>
    );
  }

  const actionButtons = (className = "") => (
    <div className={`flex gap-3 ${className}`}>
      <Button
        type="button"
        variant="outline"
        onClick={() => save(true)}
        disabled={saving || uploading}
        className="flex-1 h-12 font-semibold"
      >
        Save &amp; add another
      </Button>
      <Button
        type="button"
        onClick={() => save(false)}
        disabled={saving || uploading}
        style={{ backgroundColor: ac.hex }}
        className="flex-1 h-12 text-white font-bold hover:brightness-110 disabled:opacity-50"
      >
        {saving ? <Loader2 className="animate-spin h-5 w-5" /> : "Save trade"}
      </Button>
    </div>
  );

  return (
    <div
      className={`min-h-screen w-full p-4 sm:p-6 lg:p-8 pb-40 md:pb-8 transition-colors duration-300 ${
        isDark
          ? "bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-gray-100"
          : "bg-gradient-to-br from-gray-50 via-white to-gray-100 text-gray-900"
      }`}
    >
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center bg-gray-100 dark:bg-gray-800 hover:brightness-95 dark:hover:brightness-125"
              aria-label="Go back"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1
                className="text-3xl sm:text-4xl font-extrabold bg-clip-text text-transparent"
                style={{ backgroundImage: `linear-gradient(90deg, ${ac.hex}, ${ac.hex2})` }}
              >
                New Trade
              </h1>
              <p className="text-sm opacity-70 mt-0.5">
                {currentAccount.name} · {leverage}:1 leverage
              </p>
            </div>
          </div>
          <AccentPicker accent={accent} setAccent={setAccent} />
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-100/80 dark:bg-rose-900/30 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-700 flex items-center gap-3">
            <AlertCircle size={20} className="shrink-0" />
            {error}
          </div>
        )}
        {toast && (
          <div className="p-4 rounded-xl bg-emerald-100/80 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 flex items-center gap-3">
            <Check size={20} className="shrink-0" />
            {toast}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-5">
            {/* 1 · Setup */}
            <Card className={`${CARD} p-4 sm:p-6 space-y-4`}>
              <h3 className="font-semibold text-lg">1 · Setup</h3>

              <div>
                <Label className="text-sm opacity-70">Pair / Asset</Label>
                <Input
                  name="pair"
                  value={form.pair}
                  onChange={(e) => set({ pair: e.target.value.toUpperCase() })}
                  placeholder="e.g. EURUSD"
                  className={`${inputCls} mt-1`}
                  autoCapitalize="characters"
                />
                <div className="flex gap-2 mt-2 overflow-x-auto pb-1 -mx-1 px-1">
                  {QUICK_PAIRS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => set({ pair: p })}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        form.pair === p
                          ? "text-white border-transparent"
                          : "border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                      }`}
                      style={form.pair === p ? { backgroundColor: ac.hex } : undefined}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm opacity-70">Direction</Label>
                  <div className="flex gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => set({ direction: "Long" })}
                      className={`${seg(form.direction === "Long")} flex items-center justify-center gap-1.5`}
                      style={form.direction === "Long" ? { backgroundColor: "#10b981" } : undefined}
                    >
                      <TrendingUp size={16} /> Long
                    </button>
                    <button
                      type="button"
                      onClick={() => set({ direction: "Short" })}
                      className={`${seg(form.direction === "Short")} flex items-center justify-center gap-1.5`}
                      style={form.direction === "Short" ? { backgroundColor: "#f43f5e" } : undefined}
                    >
                      <TrendingDown size={16} /> Short
                    </button>
                  </div>
                </div>
                <div>
                  <Label className="text-sm opacity-70">Status</Label>
                  <div className="flex gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => set({ status: "executed" })}
                      className={seg(!pending)}
                      style={!pending ? { backgroundColor: ac.hex } : undefined}
                    >
                      Executed
                    </button>
                    <button
                      type="button"
                      onClick={() => set({ status: "pending" })}
                      className={`${seg(pending)} flex items-center justify-center gap-1.5`}
                      style={pending ? { backgroundColor: "#f59e0b" } : undefined}
                    >
                      <Clock size={15} /> Pending
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm opacity-70">Open date &amp; time</Label>
                  <Input
                    type="datetime-local"
                    name="openDateTime"
                    value={form.openDateTime}
                    onChange={onChange}
                    className={`${inputCls} mt-1`}
                  />
                </div>
                <div>
                  <Label className="text-sm opacity-70">Close date &amp; time</Label>
                  <Input
                    type="datetime-local"
                    name="closeDateTime"
                    value={form.closeDateTime}
                    onChange={onChange}
                    disabled={pending}
                    className={`${inputCls} mt-1 disabled:opacity-40`}
                  />
                </div>
              </div>
            </Card>

            {/* 2 · Prices */}
            <Card className={`${CARD} p-4 sm:p-6 space-y-4`}>
              <h3 className="font-semibold text-lg">2 · Prices &amp; size</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  ["entry", "Entry"],
                  ["stopLoss", "Stop loss"],
                  ["takeProfit", "Take profit"],
                  ["exit", "Exit"],
                ].map(([name, label]) => (
                  <div key={name}>
                    <Label className="text-sm opacity-70">{label}</Label>
                    <Input
                      name={name}
                      value={form[name]}
                      onChange={onChange}
                      inputMode="decimal"
                      placeholder="0.00000"
                      disabled={name === "exit" && pending}
                      className={`${inputCls} mt-1 disabled:opacity-40`}
                    />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <Label className="text-sm opacity-70">Lot size</Label>
                  <Input name="lotSize" value={form.lotSize} onChange={onChange} inputMode="decimal" className={`${inputCls} mt-1`} />
                </div>
                <div className="col-span-1 sm:col-span-3">
                  <Label className="text-sm opacity-70">P&amp;L override (optional – use your broker's real number)</Label>
                  <Input
                    name="pnlManual"
                    value={form.pnlManual}
                    onChange={onChange}
                    inputMode="decimal"
                    placeholder={calc.pnl !== null ? `Auto: ${calc.pnl.toFixed(2)}` : "Auto-calculated from exit"}
                    disabled={pending}
                    className={`${inputCls} mt-1 disabled:opacity-40`}
                  />
                </div>
              </div>
              {warn && (
                <div className="space-y-1">
                  {calc.warnings.map((w) => (
                    <p key={w} className="text-xs sm:text-sm text-amber-600 dark:text-amber-400 flex items-start gap-2">
                      <AlertCircle size={16} className="shrink-0 mt-0.5" />
                      {w}
                    </p>
                  ))}
                </div>
              )}
            </Card>

            {/* 3 · Context */}
            <Card className={`${CARD} p-4 sm:p-6 space-y-4`}>
              <h3 className="font-semibold text-lg">3 · Context</h3>

              <div>
                <Label className="text-sm opacity-70">Playbook</Label>
                <select
                  name="playbookId"
                  value={form.playbookId}
                  onChange={onChange}
                  className="w-full mt-1 p-3 rounded-xl border text-sm outline-none focus:ring-2 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                  style={{ "--tw-ring-color": ac.hex }}
                >
                  <option value="">No playbook</option>
                  {playbooks.map((playbook) => (
                    <option key={playbook.id} value={playbook.id}>
                      {playbook.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs opacity-60">
                  {playbooks.length
                    ? "Linking a trade feeds that playbook's win rate and P&L."
                    : "No playbooks yet — create them on the Playbooks page."}
                </p>
              </div>

              <div>
                <Label className="text-sm opacity-70">Strategy (free text)</Label>
                <input
                  name="strategy"
                  value={form.strategy}
                  onChange={onChange}
                  list="forge-strategies"
                  placeholder="e.g. London breakout"
                  className="w-full mt-1 p-3 rounded-xl border text-sm outline-none focus:ring-2 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                  style={{ "--tw-ring-color": ac.hex }}
                />
                <datalist id="forge-strategies">
                  <option value="London breakout" />
                  <option value="Asian range breakout" />
                  <option value="Liquidity sweep" />
                  <option value="Trend continuation" />
                  <option value="Support/Resistance reversal" />
                  <option value="News" />
                </datalist>
                <p className="mt-1.5 text-xs opacity-60">
                  Reuse the same name every time — Reports groups performance by strategy.
                </p>
              </div>

              <div>
                <Label className="text-sm opacity-70">Trade rating</Label>
                <div className="mt-2">
                  <StarRating value={rating} onChange={setRating} accent={ac.hex} size={24} />
                </div>
                <p className="mt-1.5 text-xs opacity-60">
                  Grade your execution, not the result. Reports compares P&L by grade.
                </p>
              </div>

              <div>
                <Label className="text-sm opacity-70">Mistakes</Label>
                <div className="mt-2">
                  <MistakePicker value={mistakes} onChange={setMistakes} accent={ac.hex} />
                </div>
                <p className="mt-1.5 text-xs opacity-60">
                  Optional. Tagging mistakes lets Reports total what each habit costs you.
                </p>
              </div>

              <div>
                <Label className="text-sm opacity-70">Confluences</Label>
                <div className="flex flex-wrap items-center gap-2 p-2 mt-1 border rounded-xl min-h-[48px] bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700">
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-full border"
                      style={{ backgroundColor: ac.hex + "22", borderColor: ac.hex + "55" }}
                    >
                      <Tag size={12} />
                      {t}
                      <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`}>
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addTag(tagInput);
                      }
                    }}
                    placeholder={tags.length ? "" : "Type and press Enter…"}
                    className="flex-1 min-w-[120px] bg-transparent outline-none text-sm p-1"
                  />
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {QUICK_TAGS.filter((t) => !tags.includes(t)).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => addTag(t)}
                      className="px-2.5 py-1 rounded-full text-xs border border-dashed border-gray-400/60 opacity-70 hover:opacity-100"
                    >
                      + {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-sm opacity-70">Notes</Label>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={onChange}
                  placeholder="Why this trade? How did you feel? What would you change?"
                  className="w-full mt-1 p-3 rounded-xl border min-h-[100px] text-sm resize-y outline-none focus:ring-2 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                  style={{ "--tw-ring-color": ac.hex }}
                />
              </div>

              <div>
                <Label className="text-sm opacity-70">Chart screenshot</Label>
                {form.screenshotUrl ? (
                  <div className="relative inline-block mt-2">
                    <img src={form.screenshotUrl} alt="Chart" className="h-28 rounded-xl border border-gray-300 dark:border-gray-600" />
                    <button
                      type="button"
                      onClick={() => set({ screenshotUrl: "" })}
                      className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1"
                      aria-label="Remove screenshot"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <label className="mt-1 flex items-center justify-center gap-2 h-20 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-sm opacity-80 cursor-pointer hover:opacity-100">
                    {uploading ? <Loader2 className="animate-spin h-5 w-5" /> : <ImageIcon size={20} />}
                    {uploading ? "Uploading…" : "Tap to upload — or paste an image"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => uploadScreenshot(e.target.files?.[0])}
                    />
                  </label>
                )}
              </div>

              {actionButtons("hidden md:flex pt-2")}
            </Card>
          </div>

          {/* Live preview */}
          <div className="xl:col-span-1">
            <Card className={`${CARD} p-4 sm:p-6 xl:sticky xl:top-4`}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">Live preview</h3>
                <span
                  className="px-2.5 py-1 rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: form.direction === "Long" ? "#10b981" : "#f43f5e" }}
                >
                  {form.pair || "—"} · {form.direction}
                </span>
              </div>

              <div className="mt-4">
                <div className="text-xs opacity-60">{pending ? "Status" : "Net P&L"}</div>
                <div
                  className={`text-4xl font-extrabold ${
                    pending
                      ? "text-amber-500"
                      : !hasResult
                      ? "opacity-40"
                      : finalPnl >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {pending ? "Pending" : hasResult ? `${finalPnl >= 0 ? "+" : "-"}$${money(Math.abs(finalPnl))}` : "$0.00"}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-5">
                {[
                  ["Risk", calc.risk !== null ? `$${money(calc.risk)}` : "—", "text-rose-600 dark:text-rose-400"],
                  ["Reward", calc.reward !== null ? `$${money(calc.reward)}` : "—", "text-emerald-600 dark:text-emerald-400"],
                  ["R:R", calc.rr ? `${calc.rr.toFixed(2)}:1` : "—", ""],
                ].map(([label, value, cls]) => (
                  <div key={label} className="rounded-xl bg-gray-100/70 dark:bg-gray-900/40 px-2 py-3 text-center">
                    <div className="text-[11px] opacity-60">{label}</div>
                    <div className={`text-sm sm:text-base font-bold ${cls}`} style={label === "R:R" ? { color: ac.hex } : undefined}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5">
                <div className="flex h-3 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                  <div className="bg-rose-500 transition-all" style={{ width: `${riskShare}%` }} />
                  <div className="bg-emerald-500 transition-all" style={{ width: `${100 - riskShare}%` }} />
                </div>
                <div className="flex justify-between text-[11px] opacity-60 mt-1">
                  <span>Risk</span>
                  <span>Reward</span>
                </div>
              </div>

              <dl className="mt-5 text-sm space-y-2">
                {[
                  ["Entry", form.entry],
                  ["Stop loss", form.stopLoss],
                  ["Take profit", form.takeProfit],
                  ["Lot size", form.lotSize],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <dt className="opacity-60">{k}</dt>
                    <dd className="font-medium">{v || "—"}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
        </div>
      </div>

      {/* Phones: summary + save bar above the bottom tab bar */}
      <div
        className="md:hidden fixed left-0 right-0 z-[950] px-3 pt-3 pb-3 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-t border-gray-200 dark:border-gray-700"
        style={{ bottom: "calc(3.9rem + env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between text-sm mb-2 px-1">
          <span className="opacity-70">
            R:R <b style={{ color: ac.hex }}>{calc.rr ? `${calc.rr.toFixed(2)}:1` : "—"}</b>
          </span>
          <span
            className={`font-bold ${
              pending ? "text-amber-500" : !hasResult ? "opacity-50" : finalPnl >= 0 ? "text-emerald-500" : "text-rose-500"
            }`}
          >
            {pending ? "Pending" : hasResult ? `${finalPnl >= 0 ? "+" : "-"}$${money(Math.abs(finalPnl))}` : "$0.00"}
          </span>
        </div>
        {actionButtons()}
      </div>
    </div>
  );
}
