// src/pages/AddAccountPage.jsx
// "Choose Broker" step of the Add Trade workflow. A single narrow column with
// a search field: the popular platforms show as a two-column grid, and typing
// swaps in a full result list plus the generic-template escape hatch.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Info, Search, X, Check } from "lucide-react";
import { BROKERS, POPULAR_BROKERS } from "../lib/brokers";
import {
  AT_ACCENT,
  AT_CENTER,
  AT_FIELD,
  AT_FAINT,
  AT_FOCUS,
  AT_MUTED,
  AT_PAGE,
  AT_PRIMARY,
} from "../lib/addTradeTheme";

const BrokerTile = ({ broker, size = "md" }) => {
  const dims = size === "sm" ? "h-5 w-5 rounded-md text-[8px]" : "h-8 w-8 rounded-lg text-[11px]";
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center font-bold ${dims}`}
      style={{ backgroundColor: broker?.bg || "#1f1f2b", color: broker?.fg || "#ffffff" }}
    >
      {broker?.mark || "?"}
    </span>
  );
};

export default function AddAccountPage() {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") navigate("/add-trade");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navigate]);

  const query = search.trim().toLowerCase();
  const searching = query.length > 0;
  const results = useMemo(
    () => (searching ? BROKERS.filter((b) => b.name.toLowerCase().includes(query)) : []),
    [query, searching]
  );

  const selected = BROKERS.find((b) => b.id === selectedId) || null;

  const goClose = () => navigate("/add-trade");
  const goGeneric = (brokerName = "") =>
    navigate(
      brokerName
        ? `/add-trade/custom-account?broker=${encodeURIComponent(brokerName)}`
        : "/add-trade/custom-account"
    );

  const continueTo = () => {
    if (!selected) return;
    if (selected.integration === "mt5") navigate("/add-trade/mt5");
    else goGeneric(selected.name);
  };

  const pick = (broker) => {
    setSelectedId(broker.id);
    // A single click on a platform is the choice; Continue then opens its
    // connection step so the selection is always visible before we navigate.
    inputRef.current?.blur();
  };

  const genericRow = (
    <button
      type="button"
      onClick={() => goGeneric()}
      className={`flex w-full items-center justify-between gap-3 rounded-lg bg-[#6C47FF] px-3 py-2.5 text-left transition hover:brightness-110 ${AT_FOCUS}`}
    >
      <span className="flex items-center gap-2 text-[12px] font-semibold text-white">
        <Info size={13} className="shrink-0" />
        Can&apos;t find your broker?
      </span>
      <span className="text-right text-[10px] font-medium leading-tight text-white/75">
        Use generic template
        <br />
        or add trades manually
      </span>
    </button>
  );

  return (
    <div className={`${AT_PAGE} relative`}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 24% 46%, rgba(108,71,255,0.16), transparent 62%)" }}
      />
      <button
        type="button"
        onClick={goClose}
        aria-label="Close and go back to my accounts"
        className={`absolute right-4 top-0 z-10 flex h-9 w-9 items-center justify-center rounded-lg text-[#8a8fb5] transition-colors hover:bg-[#1a1a26] hover:text-white ${AT_FOCUS}`}
      >
        <X size={20} />
      </button>

      <div className={`${AT_CENTER} relative`}>
        {/* Progress */}
        <div
          className="h-1 w-full overflow-hidden rounded-full bg-[#20202c]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={35}
          aria-label="Add trade progress"
        >
          <div className="h-full rounded-full" style={{ width: "35%", backgroundColor: AT_ACCENT }} />
        </div>

        <header className="mt-8 text-center">
          <p className={`text-[13px] font-medium ${AT_MUTED}`}>Add Trades</p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-white">Choose Broker</h1>
        </header>

        {/* Search */}
        <div className="relative mt-9">
          <label htmlFor="broker-search" className="sr-only">
            Search brokers and trading platforms
          </label>
          <input
            id="broker-search"
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Start typing the broker name"
            autoComplete="off"
            className={`${AT_FIELD} pr-10`}
          />
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#6b7090]"
          />
        </div>

        {/* Popular grid */}
        {!searching && (
          <section className="mt-7">
            <h2 className="text-[14px] font-semibold text-white">Popular Brokers</h2>
            <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5">
              {POPULAR_BROKERS.map((broker) => {
                const isSelected = selectedId === broker.id;
                return (
                  <button
                    key={broker.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => pick(broker)}
                    onDoubleClick={() =>
                      broker.integration === "mt5" ? navigate("/add-trade/mt5") : goGeneric(broker.name)
                    }
                    className={`flex items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors ${AT_FOCUS} ${
                      isSelected ? "bg-[#171725]" : "hover:bg-[#12121b]"
                    }`}
                  >
                    <BrokerTile broker={broker} />
                    <span
                      className={`min-w-0 flex-1 truncate text-[13px] font-medium ${
                        isSelected ? "text-white" : "text-[#d4d6e6]"
                      }`}
                    >
                      {broker.name}
                    </span>
                    {isSelected && <Check size={14} style={{ color: AT_ACCENT }} className="shrink-0" />}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Search results */}
        {searching && (
          <section className="mt-1.5">
            <div className="overflow-hidden rounded-lg border border-[#23232f] bg-[#0d0d16]">
              <div className="max-h-[300px] overflow-y-auto py-1">
                {results.length === 0 ? (
                  <p className={`px-3 py-3 text-[12px] ${AT_FAINT}`}>
                    No platform matches &ldquo;{search.trim()}&rdquo;.
                  </p>
                ) : (
                  results.map((broker) => {
                    const isSelected = selectedId === broker.id;
                    return (
                      <button
                        key={broker.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => pick(broker)}
                        className={`flex w-full items-center gap-2.5 px-3 py-1 text-left transition-colors ${AT_FOCUS} ${
                          isSelected ? "bg-[#1d1d2c]" : "hover:bg-[#1a1a24]"
                        }`}
                      >
                        <BrokerTile broker={broker} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-[12px] text-[#d4d6e6]">
                          {broker.name}
                        </span>
                        {isSelected && <Check size={13} style={{ color: AT_ACCENT }} className="shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
              <div className="p-1.5 pt-0">{genericRow}</div>
            </div>
          </section>
        )}

        {/* Generic escape hatch when browsing popular platforms */}
        {!searching && <div className="mt-7">{genericRow}</div>}

        <div className="mt-8">
          <p className={`mb-3 text-center text-[11px] ${AT_FAINT}`}>
            Pick a platform to link an account, or choose the generic template to log trades by hand.
          </p>
          <button
            type="button"
            onClick={continueTo}
            disabled={!selected}
            className={`${AT_PRIMARY} w-full`}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
