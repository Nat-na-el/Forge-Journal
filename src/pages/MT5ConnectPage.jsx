// src/pages/MT5ConnectPage.jsx
// Step 3b of the Add Trade workflow: connect a MetaTrader 5 account using the
// investor (read-only) password and import its trades as a new journal account.
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { connectMT5Account } from "../lib/mt5client";
import { ArrowLeft, Plug, Loader2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { CARD, HEAD, MUTED, DIVIDER, FIELD, PAGE, PAGE_BG } from "../lib/uiTokens";

const ACCENT = "#6C47FF";

export default function MT5ConnectPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ server: "", login: "", password: "" });
  const [connecting, setConnecting] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleConnect = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setConnecting(true);
    try {
      if (!form.server.trim()) throw new Error("Server is required");
      if (!/^\d{3,12}$/.test(form.login.trim()))
        throw new Error("Login must be your MT5 account number");
      if (!form.password) throw new Error("Investor password is required");

      const result = await connectMT5Account(form, setProgress);
      setSuccess(
        `Connected! Imported ${result.added} trade${result.added === 1 ? "" : "s"}.`
      );
      setTimeout(() => {
        navigate(`/trades/new?accountId=${result.accountId}`);
      }, 1200);
    } catch (err) {
      setError(err.message || "Connection failed");
      console.error("MT5 connect error:", err);
    } finally {
      setConnecting(false);
      setProgress("");
    }
  };

  const goBack = () => navigate("/add-trade");

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
              <h1 className={`text-2xl font-bold ${HEAD}`}>Connect MT5</h1>
              <p className="text-sm {MUTED}">Import your MetaTrader 5 trades.</p>
            </div>
          </div>
        </div>
      </div>

      <div className={`${PAGE} max-w-lg space-y-6`}>
        <div className={CARD + " p-6"}>
          <div className="mb-4 flex items-center gap-2">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: "#6C47FF14", color: "#6C47FF" }}
            >
              <Plug size={16} />
            </span>
            <h2 className={`text-lg font-bold ${HEAD}`}>Connect MT5 account</h2>
          </div>

          <p className="text-sm leading-relaxed {MUTED} mb-6">
            Import your MetaTrader 5 trades into a new journal account. Use your
            <b>investor (read-only) password</b>, never your trading password. It can only view
            trades, not place them or move money.
          </p>

          <form onSubmit={handleConnect} className="space-y-4">
            <div>
              <Label>Server</Label>
              <Input
                type="text"
                value={form.server}
                onChange={(e) => setForm({ ...form, server: e.target.value })}
                placeholder="e.g., Exness-MT5Real9"
                className={FIELD}
                disabled={connecting}
                autoComplete="off"
                required
              />
            </div>

            <div>
              <Label>Login</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={form.login}
                onChange={(e) =>
                  setForm({ ...form, login: e.target.value.replace(/\D/g, "") })
                }
                placeholder="Your MT5 account number"
                className={FIELD}
                disabled={connecting}
                autoComplete="off"
                required
              />
            </div>

            <div>
              <Label>Investor password</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Read-only investor password"
                className={FIELD}
                disabled={connecting}
                autoComplete="off"
                required
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-[#f2556e]/30 bg-[#f2556e]/10 p-3 text-sm text-[#d93a57] dark:text-[#ff6b86]">
                <span className="shrink-0 mt-0.5">!</span>
                {error}
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 rounded-lg border border-[#22c493]/30 bg-[#22c493]/10 p-3 text-sm text-[#0e9f77] dark:text-[#2dd4a0]">
                <span className="shrink-0 mt-0.5">✓</span>
                {success}
              </div>
            )}

            {connecting && progress && (
              <div className="text-center text-xs {MUTED}">{progress}</div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={connecting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#6C47FF] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50 disabled:pointer-events-none"
              >
                {connecting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Connecting…
                  </>
                ) : (
                  "Connect & import"
                )}
              </button>
              <button
                type="button"
                onClick={goBack}
                disabled={connecting}
                className="flex h-10 w-full items-center justify-center rounded-lg border border-[#e6e8f2] dark:border-[#262645] px-4 text-sm font-semibold text-[#6b7090] dark:text-[#c9ccea] transition-colors hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>

          <p className="mt-4 text-center text-xs {MUTED}">
            The first connection can take 1–2 minutes. Keep this window open.
          </p>
        </div>
      </div>
    </div>
  );
}
