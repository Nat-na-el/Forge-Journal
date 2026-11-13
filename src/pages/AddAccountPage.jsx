// src/pages/AddAccountPage.jsx
// Step 2 of the Add Trade workflow: choose a broker / platform to connect,
// or create a custom account manually.
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronRight, Plus, Link, Plug, FileText, AlertTriangle } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { CARD, PANEL, FIELD, HEAD, MUTED, DIVIDER, FOCUS, PAGE, PAGE_BG } from "../lib/uiTokens";

const ACCENT = "#6C47FF";

const POPULAR_BROKERS = [
  { name: "Exness", desc: "MetaTrader 4 / 5", region: "Global" },
  { name: "IC Markets", desc: "MetaTrader 4 / 5, cTrader", region: "Global" },
  { name: "Pepperstone", desc: "MetaTrader 4 / 5, cTrader", region: "Global" },
  { name: "FP Markets", desc: "MetaTrader 4 / 5", region: "Global" },
  { name: "XM", desc: "MetaTrader 4 / 5", region: "Global" },
  { name: "FBS", desc: "MetaTrader 4 / 5", region: "Global" },
  { name: "OANDA", desc: "OANDA fxTrade, MT4", region: "Global" },
  { name: "IG", desc: "IG trading platform", region: "UK / EU" },
];

const SUPPORTED_INTEGRATIONS = [
  {
    name: "MetaTrader 5",
    icon: "M5",
    desc: "Read-only investor password sync",
    path: "/add-trade/mt5",
    primary: true,
  },
  {
    name: "Custom broker",
    icon: "+",
    desc: "Create an account manually",
    path: "/add-trade/custom-account",
    primary: true,
  },
  {
    name: "TradeLocker",
    icon: "TL",
    desc: "Import via CSV upload",
    path: null,
    primary: false,
  },
  {
    name: "cTrader",
    icon: "cT",
    desc: "Import via CSV upload",
    path: null,
    primary: false,
  },
  {
    name: "CSV file",
    icon: "↑",
    desc: "Upload trade history CSV",
    path: null,
    primary: false,
  },
];

export default function AddAccountPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const filteredBrokers = POPULAR_BROKERS.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase())
  );

  const goMT5 = () => navigate("/add-trade/mt5");
  const goCustom = () => navigate("/add-trade/custom-account");
  const goBack = () => navigate("/add-trade");

  const selectBroker = (broker) => {
    // Non-MT5 brokers are CSV-based placeholders; keep workflow moving to manual entry.
    navigate(`/add-trade/custom-account?broker=${encodeURIComponent(broker.name)}`);
  };

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
              <Link size={20} />
            </button>
            <div>
              <h1 className={`text-2xl font-bold ${HEAD}`}>Add Account</h1>
              <p className="text-sm {MUTED}">Connect a broker or create an account manually.</p>
            </div>
          </div>
        </div>
      </div>

      <div className={`${PAGE} space-y-6`}>
        {/* Search */}
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7090] dark:text-[#8a8fb5] shrink-0" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search brokers &amp; platforms…"
            className="pl-10"
          />
        </div>

        {/* Popular brokers */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider {MUTED} mb-4">Popular brokers</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredBrokers.length === 0 ? (
              <div className="col-span-full {PANEL} p-8 text-center border">
                <p className="text-sm {MUTED}">No brokers match your search.</p>
              </div>
            ) : (
              filteredBrokers.map((broker) => (
                <button
                  key={broker.name}
                  type="button"
                  onClick={() => selectBroker(broker)}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-colors hover:border-[#6C47FF]/50 hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${FOCUS}`}
                  style={{ backgroundColor: "#ffffff", borderColor: "#e6e8f2" }}
                >
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold"
                    style={{ backgroundColor: "#f1f2f8", color: "#6b7090" }}
                  >
                    {broker.name.charAt(0)}
                  </div>
                  <p className="text-xs font-semibold {HEAD}">{broker.name}</p>
                  <p className="text-[10px] {MUTED} leading-tight">{broker.desc}</p>
                </button>
              ))
            )}
          </div>
        </section>

        {/* Supported integrations */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider {MUTED} mb-4">Supported integrations</h2>
          <div className="space-y-2">
            {SUPPORTED_INTEGRATIONS.map((integration) => {
              const clickable = integration.path != null;
              return (
                <button
                  key={integration.name}
                  type="button"
                  onClick={
                    clickable
                      ? integration.name === "MetaTrader 5"
                        ? goMT5
                        : goCustom
                      : undefined
                  }
                  disabled={!clickable}
                  className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${FOCUS} ${!clickable ? "opacity-60 pointer-events-none" : ""}`}
                  style={{ backgroundColor: "#ffffff", borderColor: "#e6e8f2" }}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold"
                      style={{
                        backgroundColor: integration.primary ? "#6C47FF14" : "#f1f2f8",
                        color: integration.primary ? ACCENT : "#6b7090",
                      }}
                    >
                      {integration.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold {HEAD} truncate">{integration.name}</p>
                      <p className="text-xs {MUTED} truncate">{integration.desc}</p>
                    </div>
                    {!clickable && (
                      <span className="text-[9px] uppercase tracking-wider text-[#b9bcc8]">
                        Coming soon
                      </span>
                    )}
                  </div>
                  {clickable && <ChevronRight size={16} className="text-[#c9ccea] shrink-0" />}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
