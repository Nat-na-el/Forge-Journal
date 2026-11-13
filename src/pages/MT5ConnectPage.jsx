// src/pages/MT5ConnectPage.jsx
// MetaTrader link: server, login and the investor (read-only) password.
// Connecting creates a journal account and imports the trade history.
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { connectMT5Account } from "../lib/mt5client";
import { AlertCircle, Check, Eye, EyeOff, Loader2, Plug, X } from "lucide-react";
import {
  AT_ACCENT,
  AT_CARD,
  AT_CENTER,
  AT_FAINT,
  AT_FIELD,
  AT_FOCUS,
  AT_MUTED,
  AT_PAGE,
  AT_POS,
  AT_PRIMARY,
} from "../lib/addTradeTheme";

const label = "mb-1.5 block text-[12px] font-medium text-[#c9cbe0]";
const hint = "mt-1.5 text-[11px] leading-relaxed text-[#5d6078]";

export default function MT5ConnectPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ server: "", login: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const handleConnect = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!form.server.trim()) {
      setError("Enter the server name exactly as it appears in MetaTrader.");
      return;
    }
    if (!/^\d{3,12}$/.test(form.login.trim())) {
      setError("The login is your numeric MetaTrader account number.");
      return;
    }
    if (!form.password) {
      setError("Enter the investor (read-only) password.");
      return;
    }

    setConnecting(true);
    try {
      const result = await connectMT5Account(form, setProgress);
      setSuccess(`Linked. Imported ${result.added} trade${result.added === 1 ? "" : "s"} so far.`);
      try {
        localStorage.setItem("currentAccountId", result.accountId);
      } catch {
        /* storage can be blocked; the account list still reads Firestore */
      }
      window.dispatchEvent(new Event("forgex:accounts-changed"));
      window.setTimeout(() => navigate("/add-trade"), 1200);
    } catch (err) {
      console.error("MT5 connect error:", err);
      setError(err.message || "Couldn't connect. Check the server, login and investor password.");
    } finally {
      setConnecting(false);
      setProgress("");
    }
  };

  const goBack = () => navigate("/add-trade/add-account");

  return (
    <div className={`${AT_PAGE} relative`}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 24% 46%, rgba(108,71,255,0.16), transparent 62%)" }}
      />
      <button
        type="button"
        onClick={goBack}
        aria-label="Close and go back to broker selection"
        className={`absolute right-4 top-0 z-10 flex h-9 w-9 items-center justify-center rounded-lg text-[#8a8fb5] transition-colors hover:bg-[#1a1a26] hover:text-white ${AT_FOCUS}`}
      >
        <X size={20} />
      </button>

      <div className={`${AT_CENTER} relative`}>
        <div
          className="h-1 w-full overflow-hidden rounded-full bg-[#20202c]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={55}
          aria-label="Add trade progress"
        >
          <div className="h-full rounded-full" style={{ width: "55%", backgroundColor: AT_ACCENT }} />
        </div>

        <header className="mt-8 text-center">
          <p className={`text-[13px] font-medium ${AT_MUTED}`}>Add Trades</p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-white">Link MetaTrader</h1>
          <p className={`mx-auto mt-2 max-w-[360px] text-[12px] leading-relaxed ${AT_FAINT}`}>
            Works with MetaTrader 4 and 5 hosting. Imported trades appear in a new journal account.
          </p>
        </header>

        <div className={`${AT_CARD} mt-7`}>
          <div className="mb-5 flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: "rgba(108,71,255,0.15)", color: AT_ACCENT }}
            >
              <Plug size={15} />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-white">Read-only connection</p>
              <p className={`text-[11px] ${AT_FAINT}`}>Investor password only — trading stays disabled.</p>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-lg border border-[#f2556e]/35 bg-[#f2556e]/10 px-3 py-2.5 text-[12px]"
              style={{ color: "#f2556e" }}
            >
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
              {error.includes("FTMO") || error.includes("server") || error.includes("Couldn't connect") ? (
                <p className="mt-1 text-[11px] leading-relaxed text-[#f2556e]">
                  FTMO demo servers are usually named like <b>FTMO-Demo</b>, <b>FTMO-Demo2</b>, etc. Use the
                  <b>investor (read-only)</b> password — never your master trading password.
                </p>
              ) : null}
            </div>
          )}

          {success && (
            <div
              role="status"
              className="mb-4 flex items-start gap-2 rounded-lg border border-[#22c493]/35 bg-[#22c493]/10 px-3 py-2.5 text-[12px]"
              style={{ color: AT_POS }}
            >
              <Check size={14} className="mt-0.5 shrink-0" />
              <span>{success} Taking you to your accounts…</span>
            </div>
          )}

          <form onSubmit={handleConnect} className="space-y-4" noValidate>
            <div>
              <label htmlFor="mt5-server" className={label}>
                Server
              </label>
              <input
                id="mt5-server"
                type="text"
                value={form.server}
                onChange={set("server")}
                placeholder="e.g. Exness-MT5Real9"
                autoComplete="off"
                className={AT_FIELD}
                disabled={connecting}
                required
              />
              <p className={hint}>Copy it from the MetaTrader login window (e.g. FTMO-Demo, FTMO-Demo2).</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, server: "FTMO-Demo" }))}
                  disabled={connecting}
                  className="rounded px-2 py-1.5 text-[11px] font-medium border border-[#262633] bg-transparent text-[#c9cbe0] hover:bg-[#171722] disabled:opacity-50"
                >
                  FTMO-Demo
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, server: "FTMO-Demo2" }))}
                  disabled={connecting}
                  className="rounded px-2 py-1.5 text-[11px] font-medium border border-[#262633] bg-transparent text-[#c9cbe0] hover:bg-[#171722] disabled:opacity-50"
                >
                  FTMO-Demo2
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, server: "FTMO-Demo3" }))}
                  disabled={connecting}
                  className="rounded px-2 py-1.5 text-[11px] font-medium border border-[#262633] bg-transparent text-[#c9cbe0] hover:bg-[#171722] disabled:opacity-50"
                >
                  FTMO-Demo3
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="mt5-login" className={label}>
                Account login
              </label>
              <input
                id="mt5-login"
                type="text"
                inputMode="numeric"
                value={form.login}
                onChange={(event) => setForm((current) => ({ ...current, login: event.target.value.replace(/\D/g, "") }))}
                placeholder="Numeric account number"
                autoComplete="off"
                className={AT_FIELD}
                disabled={connecting}
                required
              />
            </div>

            <div>
              <label htmlFor="mt5-password" className={label}>
                Investor password
              </label>
              <div className="relative">
                <input
                  id="mt5-password"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={set("password")}
                  placeholder="Read-only password"
                  autoComplete="off"
                  className={`${AT_FIELD} pr-10`}
                  disabled={connecting}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide investor password" : "Show investor password"}
                  className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[#6b7090] transition-colors hover:bg-[#1a1a26] hover:text-white"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <p className={hint}>
                Not the master password. The investor password can view history but can never place a trade.
              </p>
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={goBack}
                disabled={connecting}
                className={`${AT_PRIMARY} flex-1 bg-transparent text-[#c9cbe0] ring-1 ring-inset ring-[#262633] hover:bg-[#171722] disabled:bg-transparent`}
              >
                Back
              </button>
              <button type="submit" disabled={connecting} className={`${AT_PRIMARY} flex-1`}>
                {connecting ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Connecting…
                  </>
                ) : (
                  "Connect & import"
                )}
              </button>
            </div>
          </form>

          {connecting && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-[#23232f] bg-[#111119] px-3 py-2.5">
              <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin" style={{ color: AT_ACCENT }} />
              <div>
                <p className="text-[12px] font-medium text-[#c9cbe0]">{progress || "Starting the connection…"}</p>
                <p className={`mt-0.5 text-[11px] ${AT_FAINT}`}>
                  The first link can take a minute. Leave this page open until it finishes.
                </p>
              </div>
            </div>
          )}
        </div>

        <p className={`mt-6 text-center text-[11px] leading-relaxed ${AT_FAINT}`}>
          No MetaTrader account?{" "}
          <button
            type="button"
            onClick={() => navigate("/add-trade/custom-account")}
            className={`rounded font-semibold text-[#b9a6ff] hover:text-white ${AT_FOCUS}`}
          >
            Create one manually instead
          </button>
          .
        </p>
      </div>
    </div>
  );
}
