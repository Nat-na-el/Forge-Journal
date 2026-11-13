// src/pages/CustomAccountPage.jsx
// Generic account template: used for platforms without a direct link and for
// traders who simply want to log trades by hand. Creates a Firestore account
// under the signed-in user, then opens the trade form on it.
import React, { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import { AlertCircle, Check, Loader2, X } from "lucide-react";
import { findBroker } from "../lib/brokers";
import {
  AT_ACCENT,
  AT_CARD,
  AT_CENTER,
  AT_FAINT,
  AT_FIELD,
  AT_FOCUS,
  AT_MUTED,
  AT_PAGE,
  AT_PRIMARY,
} from "../lib/addTradeTheme";

const label = "mb-1.5 block text-[12px] font-medium text-[#c9cbe0]";
const hint = "mt-1.5 text-[11px] leading-relaxed text-[#5d6078]";

export default function CustomAccountPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const suggested = params.get("broker") || params.get("platform") || "";
  const brokerMeta = useMemo(() => findBroker(suggested), [suggested]);

  const [form, setForm] = useState({
    broker: suggested,
    accountName: suggested ? `${suggested} account` : "",
    startingBalance: "10000",
    leverage: "100",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const handleSave = async (event) => {
    event.preventDefault();
    setError("");
    const user = auth.currentUser;
    if (!user) {
      setError("Sign in again to create an account.");
      return;
    }
    const accountName = form.accountName.trim();
    if (!accountName) {
      setError("Give the account a name you'll recognise in the journal.");
      return;
    }
    const broker = form.broker.trim();
    if (!broker) {
      setError("Enter the broker or platform this account trades on.");
      return;
    }
    const balance = Number.parseFloat(form.startingBalance);
    if (!Number.isFinite(balance) || balance < 0) {
      setError("Starting balance must be zero or a positive number.");
      return;
    }
    const leverage = Number.parseFloat(form.leverage);
    if (!Number.isFinite(leverage) || leverage < 1) {
      setError("Leverage must be at least 1.");
      return;
    }

    setSaving(true);
    try {
      const accountData = {
        name: accountName,
        broker,
        starting_balance: balance,
        current_balance: balance,
        leverage,
        profitCalculation: "FIFO",
        connectionType: "manual",
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      };
      const ref = await addDoc(collection(db, "users", user.uid, "accounts"), accountData);
      try {
        localStorage.setItem("currentAccountId", ref.id);
      } catch {
        /* ignore blocked storage */
      }
      window.dispatchEvent(new Event("forgex:accounts-changed"));
      navigate(`/trades/new?accountId=${ref.id}&newAccount=1`);
    } catch (err) {
      console.error("Create account error:", err);
      setError("Couldn't save the account. Check your connection and try again.");
      setSaving(false);
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
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-white">Account details</h1>
          <p className={`mx-auto mt-2 max-w-[360px] text-[12px] leading-relaxed ${AT_FAINT}`}>
            Create the account once. Trades you log from now on will be filed under it.
          </p>
        </header>

        <div className={`${AT_CARD} mt-7`}>
          {brokerMeta && (
            <div className="mb-5 flex items-center gap-3 rounded-lg border border-[#23232f] bg-[#111119] px-3 py-2.5">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
                style={{ backgroundColor: brokerMeta.bg, color: brokerMeta.fg }}
                aria-hidden="true"
              >
                {brokerMeta.mark}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-white">{brokerMeta.name}</p>
                <p className={`text-[11px] ${AT_FAINT}`}>Generic template · no broker login needed</p>
              </div>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-lg border border-[#f2556e]/35 bg-[#f2556e]/10 px-3 py-2.5 text-[12px]"
              style={{ color: "#f2556e" }}
            >
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4" noValidate>
            <div>
              <label htmlFor="account-broker" className={label}>
                Broker or platform
              </label>
              <input
                id="account-broker"
                type="text"
                value={form.broker}
                onChange={set("broker")}
                placeholder="e.g. Exness, TradeLocker, my prop firm"
                autoComplete="off"
                className={AT_FIELD}
                disabled={saving}
              />
              <p className={hint}>Shown next to the account in every list and report.</p>
            </div>

            <div>
              <label htmlFor="account-name" className={label}>
                Account name
              </label>
              <input
                id="account-name"
                type="text"
                value={form.accountName}
                onChange={set("accountName")}
                placeholder="e.g. FTMO 100k, Live swing account"
                autoComplete="off"
                className={AT_FIELD}
                disabled={saving}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="account-balance" className={label}>
                  Starting balance (USD)
                </label>
                <input
                  id="account-balance"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={form.startingBalance}
                  onChange={set("startingBalance")}
                  placeholder="10000"
                  className={AT_FIELD}
                  disabled={saving}
                  required
                />
              </div>
              <div>
                <label htmlFor="account-leverage" className={label}>
                  Leverage
                </label>
                <input
                  id="account-leverage"
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min="1"
                  value={form.leverage}
                  onChange={set("leverage")}
                  placeholder="100"
                  className={AT_FIELD}
                  disabled={saving}
                  required
                />
              </div>
            </div>

            <p className="rounded-lg border border-[#23232f] bg-[#111119] px-3 py-2.5 text-[11px] leading-relaxed text-[#8a8fb5]">
              Trades are matched <span className="font-semibold text-[#c9cbe0]">FIFO</span>. You can link a broker
              later from My trading accounts — existing trades stay where they are.
            </p>

            <div className="flex gap-2.5 pt-1">
              <button type="button" onClick={goBack} disabled={saving} className={`${AT_PRIMARY} flex-1 bg-transparent text-[#c9cbe0] ring-1 ring-inset ring-[#262633] hover:bg-[#171722] disabled:bg-transparent`}>
                Back
              </button>
              <button type="submit" disabled={saving} className={`${AT_PRIMARY} flex-1`}>
                {saving ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    <Check size={15} />
                    Create account
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        <p className={`mt-6 text-center text-[11px] leading-relaxed ${AT_FAINT}`}>
          Prefer automatic imports?{" "}
          <button
            type="button"
            onClick={() => navigate("/add-trade/mt5")}
            className={`rounded font-semibold text-[#b9a6ff] hover:text-white ${AT_FOCUS}`}
          >
            Link MetaTrader with an investor password
          </button>
          .
        </p>
      </div>
    </div>
  );
}
