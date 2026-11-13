// src/pages/CustomAccountPage.jsx
// Step 3a of the Add Trade workflow: create a trading account manually
// when no broker integration is available.
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import { ArrowLeft, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { CARD, PANEL, FIELD, HEAD, MUTED, DIVIDER, FOCUS, PAGE, PAGE_BG } from "../lib/uiTokens";

const ACCENT = "#6C47FF";

export default function CustomAccountPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    broker: "",
    accountName: "",
    startingBalance: "",
    leverage: "100",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const searchParams = new URLSearchParams(window.location.search);
  const suggestedBroker = searchParams.get("broker") || "";
  if (suggestedBroker && !form.broker) {
    setForm((f) => ({ ...f, broker: suggestedBroker }));
  }

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    const user = auth.currentUser;
    if (!user) {
      setError("You must be logged in to create an account.");
      return;
    }
    const name = form.accountName.trim();
    if (!name) {
      setError("Account name is required.");
      return;
    }
    const balance = parseFloat(form.startingBalance);
    if (isNaN(balance) || balance <= 0) {
      setError("Starting balance must be a positive number.");
      return;
    }
    const leverage = parseFloat(form.leverage);
    if (isNaN(leverage) || leverage < 1) {
      setError("Leverage must be at least 1.");
      return;
    }
    if (!form.broker.trim()) {
      setError("Broker / platform name is required.");
      return;
    }

    setSaving(true);
    try {
      const accountData = {
        name,
        broker: form.broker.trim(),
        starting_balance: balance,
        current_balance: balance,
        leverage,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      };
      const docRef = await addDoc(
        collection(db, "users", user.uid, "accounts"),
        accountData
      );
      localStorage.setItem("currentAccountId", docRef.id);
      setSaved(true);
      setTimeout(() => {
        navigate(`/trades/new?accountId=${docRef.id}`);
      }, 900);
    } catch (err) {
      setError("Failed to create account. Please try again.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => navigate("/add-trade");

  if (saved) {
    return (
      <div className={`${PAGE_BG} ${PAGE} flex items-center justify-center`}>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#22c493]/10 text-[#22c493]">
            <CheckCircle size={32} />
          </div>
          <h2 className={`text-2xl font-bold ${HEAD}`}>Account created</h2>
          <p className="text-sm {MUTED}">Opening the trade entry form…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${PAGE_BG} min-h-screen`}>
      {/* Header */}
      <div className={`${PAGE} border-b border-[#e6e8f2] dark:border-[#262645] bg-white/50 dark:bg-[#0b0b19]/50 backdrop-blur sticky top-0 z-20`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={goBack}
              className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center border border-[#e6e8f2] dark:border-[#262645] bg-white dark:bg-[#15152b] text-[#6b7090] dark:text-[#c9ccea] hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className={`text-2xl font-bold ${HEAD}`}>Create Account</h1>
              <p className="text-sm {MUTED}">Enter your broker details to get started.</p>
            </div>
          </div>
        </div>
      </div>

      <div className={`${PAGE} max-w-lg space-y-6`}>
        {error && (
          <div className="p-4 rounded-xl border border-[#f2556e]/30 bg-[#f2556e]/10 text-sm text-[#d93a57] dark:text-[#ff6b86] flex items-start gap-3">
            <AlertTriangleIcon size={18} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <Label>Broker / platform</Label>
            <Input
              type="text"
              value={form.broker}
              onChange={(e) => setForm({ ...form, broker: e.target.value })}
              placeholder="e.g. Exness, IC Markets, Custom"
              className={FIELD}
              required
              disabled={saving}
            />
            <p className="mt-1 text-xs {MUTED}">The name of your broker or trading platform.</p>
          </div>

          <div>
            <Label>Account name</Label>
            <Input
              type="text"
              value={form.accountName}
              onChange={(e) => setForm({ ...form, accountName: e.target.value })}
              placeholder="e.g. Live EURUSD, Demo NAS100"
              className={FIELD}
              required
              disabled={saving}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Starting balance (USD)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.startingBalance}
                onChange={(e) => setForm({ ...form, startingBalance: e.target.value })}
                placeholder="10000"
                className={FIELD}
                required
                disabled={saving}
              />
            </div>
            <div>
              <Label>Leverage</Label>
              <Input
                type="number"
                step="1"
                min="1"
                value={form.leverage}
                onChange={(e) => setForm({ ...form, leverage: e.target.value })}
                placeholder="100"
                className={FIELD}
                required
                disabled={saving}
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={goBack}
              disabled={saving}
              className="flex h-10 w-full items-center justify-center rounded-lg border border-[#e6e8f2] dark:border-[#262645] px-4 text-sm font-semibold text-[#6b7090] dark:text-[#c9ccea] transition-colors hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex h-10 w-full items-center justify-center rounded-lg px-4 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50 disabled:pointer-events-none"
              style={{ backgroundColor: ACCENT }}
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-2" />
                  Creating…
                </>
              ) : (
                "Create Account"
              )}
            </button>
          </div>
        </form>

        <p className="text-xs {MUTED} mt-2">
          Your trades will be saved under this account. You can add more accounts later from the dashboard.
        </p>
      </div>
    </div>
  );
}

function AlertTriangleIcon({ size = 18, className = "" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      fill="none"
      viewBox="0 0 24 24"
      className={className}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
