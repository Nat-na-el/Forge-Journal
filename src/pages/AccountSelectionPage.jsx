// src/pages/AccountSelectionPage.jsx
// Step 1 of the Add Trade workflow: pick an existing account or add a new one.
// Matches the Tradezella-inspired dark shell used by the rest of the app.
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { auth, db } from "../firebase";
import { ArrowLeft, Plus, Check, Plug, RefreshCw, ChevronRight } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { CARD, PANEL, FIELD, HEAD, MUTED, DIVIDER, FOCUS, PAGE, PAGE_BG } from "../lib/uiTokens";

const ACCENT = "#6C47FF";

const SUPPORTED_PLATFORMS = [
  { name: "TradeLocker", icon: "TL", desc: "Modern web-based trading platform" },
  { name: "cTrader", icon: "cT", desc: "ECN execution and advanced charting" },
  { name: "NinjaTrader", icon: "NT", desc: "Futures and forex analytics" },
  { name: "MetaTrader 5", icon: "M5", desc: "Connect via investor password" },
  { name: "TradingView", icon: "TV", desc: "Charting and paper trading" },
  { name: "Bloomberg Terminal", icon: "BB", desc: "Institutional market data" },
];

export default function AccountSelectionPage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const user = auth.currentUser;
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const q = query(collection(db, "users", user.uid, "accounts"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        setAccounts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        setError("Could not load your accounts.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const selectAccount = (account) => {
    localStorage.setItem("currentAccountId", account.id);
    navigate(`/trades/new?accountId=${account.id}`);
  };

  const goAddAccount = () => navigate("/add-trade/add-account");

  if (loading) {
    return (
      <div className={`${PAGE_BG} ${PAGE} flex items-center justify-center`}>
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#e6e8f2] dark:border-[#262645]" style={{ borderTopColor: ACCENT }} />
          <p className="text-sm font-medium {MUTED}">Loading your accounts…</p>
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
              onClick={() => navigate("/dashboard")}
              className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center border border-[#e6e8f2] dark:border-[#262645] bg-white dark:bg-[#15152b] text-[#6b7090] dark:text-[#c9ccea] hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className={`text-2xl font-bold ${HEAD}`}>Add Trade</h1>
              <p className="text-sm {MUTED}">Choose an account to log a new trade for.</p>
            </div>
          </div>
          <Button
            type="button"
            onClick={goAddAccount}
            className="px-4 py-2 text-sm font-semibold"
            style={{ backgroundColor: ACCENT }}
          >
            <Plus size={16} className="mr-2" /> Add Account
          </Button>
        </div>
      </div>

      <div className={`${PAGE} space-y-6`}>
        {error && (
          <div className="p-4 rounded-xl border border-[#f2556e]/30 bg-[#f2556e]/10 text-sm text-[#d93a57] dark:text-[#ff6b86] flex items-start gap-3">
            <span className="shrink-0 mt-0.5">!</span>
            {error}
          </div>
        )}

        {/* Existing accounts */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider {MUTED}">Your accounts</h2>
            {accounts.length === 0 && (
              <span className="text-xs {MUTED}">No accounts yet — add one to get started.</span>
            )}
          </div>

          {accounts.length === 0 ? (
            <div className={PANEL + " p-8 text-center border dashed"}>
              <p className="text-sm {MUTED} mb-4">You don't have any trading accounts yet.</p>
              <Button
                type="button"
                onClick={goAddAccount}
                className="px-6 py-2 text-sm font-semibold"
                style={{ backgroundColor: ACCENT }}
              >
                <Plus size={16} className="mr-2" /> Add your first account
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.map((account) => {
                const mt5 = account.mt5Connected;
                return (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => selectAccount(account)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${FOCUS}`}
                    style={{
                      backgroundColor: "#ffffff",
                      borderColor: "#e6e8f2",
                    }}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{ backgroundColor: ACCENT }}
                      >
                        {account.name?.charAt(0)?.toUpperCase() || "A"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold {HEAD} truncate">{account.name}</p>
                        <p className="text-xs {MUTED} truncate">
                          ${
                            account.starting_balance != null
                              ? `$${Number(account.starting_balance).toLocaleString()} starting`
                              : "Starting balance not set"
                          }
                        </p>
                      </div>
                      {mt5 ? (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-[#0e9f77] dark:text-[#2dd4a0] border border-[#0e9f77]/30 bg-[#0e9f77]/10 dark:bg-[#0e9f77]/10">
                          <Plug size={10} /> MT5 connected
                        </span>
                      ) : null}
                    </div>
                    <ChevronRight size={16} className="text-[#c9ccea] shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Supported platforms */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider {MUTED} mb-4">Supported platforms</h2>
          <p className="text-sm {MUTED} mb-4">Connect trades from the platforms you already use.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {SUPPORTED_PLATFORMS.map((p) => {
              const isMT5 = p.name === "MetaTrader 5";
              return (
                <button
                  key={p.name}
                  type="button"
                  onClick={isMT5 ? () => navigate("/add-trade/mt5") : undefined}
                  disabled={!isMT5}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-colors hover:border-[#6C47FF]/50 ${FOCUS} ${isMT5 ? "border-transparent" : "border-[#e6e8f2] dark:border-[#262645]"}`}
                  style={{
                    backgroundColor: isMT5 ? "#6C47FF14" : undefined,
                  }}
                >
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold"
                    style={{
                      backgroundColor: isMT5 ? ACCENT : "#f1f2f8",
                      color: isMT5 ? "#ffffff" : "#6b7090",
                    }}
                  >
                    {p.icon}
                  </div>
                  <p className="text-xs font-semibold {HEAD}">{p.name}</p>
                  <p className="text-[10px] {MUTED} leading-tight">{p.desc}</p>
                  {!isMT5 && (
                    <span className="text-[9px] uppercase tracking-wider text-[#b9bcc8] mt-1">
                      Coming soon
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
