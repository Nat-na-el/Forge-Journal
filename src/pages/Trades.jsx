// src/pages/Trades.jsx
// Trade log for the selected account: a dark table with the display-unit
// switch, the full filter panel, account-level stats and a tracking view for
// one trade. The reference screens are dark in every theme, so the page keeps
// its own dark surface like the Dashboard and the Add Trade flow.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { endOfMonth, format, isWithinInterval, startOfMonth, subDays } from "date-fns";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Copy,
  DollarSign,
  Download,
  Edit,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Layers,
  Lock,
  MoreHorizontal,
  Paperclip,
  Percent,
  PlusCircle,
  RotateCcw,
  Ruler,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  TrendingUp,
  Upload,
  Wallet,
  Waves,
  X,
} from "lucide-react";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import DeleteConfirmModal from "../components/ui/DeleteConfirmModal";
import CsvImportModal from "../components/ui/CsvImportModal";
import { MistakePicker, StarRating } from "../components/ui/TradeGrading";
import demoDashboardTrades from "../lib/demoDashboardData";
import useAccent from "../hooks/useAccent";
import { auth, db } from "../firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler, Tooltip);

// ─── Palette ─────────────────────────────────────────────────────────────────
const BG = "#0a0a10";
const TEXT = "#e9e9f2";
const MUTED = "#8b8ba3";
const FAINT = "#66667c";
const POS = "#22c493";
const NEG = "#f2556e";
const BE = "#6C47FF";
const CHART_GRID = "rgba(148,163,184,0.10)";
const CHART_TICK = "#8a8fb5";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6C47FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a10]";
const TOOLBAR_BTN = `flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#23232f] bg-[#13131b] px-2.5 text-[12px] font-medium text-[#c7c7d6] transition-colors hover:border-[#33334a] hover:text-white ${FOCUS}`;
const ICON_BTN = `flex h-8 w-8 items-center justify-center rounded-lg border border-[#23232f] bg-[#13131b] text-[#8b8ba3] transition-colors hover:border-[#33334a] hover:text-white ${FOCUS}`;
const PRIMARY = `inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#6C47FF] px-3.5 text-[12.5px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
const GHOST = `inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#262633] bg-[#12121b] px-3 text-[12px] font-medium text-[#c9cbe0] transition-colors hover:border-[#33334a] hover:bg-[#171722] ${FOCUS}`;
const FIELD =
  "h-10 w-full rounded-lg border border-[#262633] bg-[#101018] px-3 text-sm text-[#e8e9f7] outline-none transition-colors placeholder:text-[#5d6078] focus:border-[#6C47FF] focus:ring-2 focus:ring-[#6C47FF]/25";
const LABEL = "mb-1.5 block text-[11px] font-medium text-[#8b8ba3]";
const TH = "whitespace-nowrap px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-[#6b7090]";
const TD = "whitespace-nowrap px-3 py-2.5 align-middle text-[12px] text-[#c9cbe0]";

const PERIODS = [
  ["all", "All time"],
  ["this-month", "This month"],
  ["last-30", "Last 30 days"],
  ["this-year", "This year"],
];

const DISPLAY_UNITS = [
  ["dollar", "Dollar", "$", DollarSign, "Realised profit and loss."],
  ["percent", "Percentage", "%", Percent, "P&L as a share of the starting balance."],
  ["r", "R-multiple", "R", Ruler, "Uses the stop loss saved with each trade."],
  ["ticks", "Ticks", "Ticks", Activity, "For futures — derived from the price move."],
  ["pips", "Pips", "Pips", Waves, "For forex — derived from the price move."],
  ["points", "Points", "Pts", CircleDot, "For indices and metals — from the price move."],
];

const EMPTY_FILTERS = {
  instruments: [],
  symbols: [],
  timeframe: [],
  state: [],
  reviewed: [],
  sides: [],
  statuses: [],
  ratings: [],
  tags: [],
  playbooks: [],
  from: "",
  to: "",
};

const SORT_OPTIONS = [
  ["date-desc", "Newest first"],
  ["date-asc", "Oldest first"],
  ["pnl-desc", "Highest P&L"],
  ["pnl-asc", "Lowest P&L"],
  ["pair", "Symbol A–Z"],
  ["rating", "Best rated"],
];

// ─── Numbers & dates ─────────────────────────────────────────────────────────
const usd = (value, signed = false) => {
  const n = Number(value) || 0;
  const sign = n < 0 ? "-" : signed && n > 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const usdCell = (value) => {
  const n = Number(value) || 0;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(2).replace(/\.?0+$/, "")}K`;
  if (abs >= 100) return `${sign}$${Math.round(abs)}`;
  return `${sign}$${abs.toFixed(1).replace(/\.0$/, "")}`;
};

const hexA = (hex, a) => {
  const h = (hex || "#6C47FF").replace("#", "");
  if (h.length !== 6) return `rgba(108,71,255,${a})`;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

const parseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const text = String(value);
  const d = new Date(text.length <= 10 ? `${text}T12:00:00` : text);
  return Number.isNaN(d.getTime()) ? null : d;
};

const tradeDateOf = (trade) =>
  parseDate(trade?.closeDateTime) || parseDate(trade?.openDateTime) || parseDate(trade?.createdAt);

const priceDelta = (trade) => {
  const entry = Number(trade.entry);
  const exit = Number(trade.exit);
  if (!Number.isFinite(entry) || !Number.isFinite(exit)) return 0;
  const direction = /short|sell/i.test(trade.direction || "") ? -1 : 1;
  return (exit - entry) * direction;
};

const riskAmount = (trade) => {
  const entry = Number(trade.entry);
  const stop = Number(trade.stopLoss);
  const lots = Number(trade.lotSize) || 1;
  if (!Number.isFinite(entry) || !Number.isFinite(stop) || entry === stop) return 0;
  return Math.abs(entry - stop) * 100000 * lots;
};

const isPending = (trade) => trade?.status === "pending" || !trade?.closeDateTime;

const sideOf = (trade) => (/short|sell/i.test(trade?.direction || "") ? "Short" : "Long");

const assetClassOf = (pair = "") => {
  const p = String(pair).toUpperCase();
  if (/(XAU|XAG|GOLD|SILVER)/.test(p)) return "Metals";
  if (/(BTC|ETH|SOL|XRP|DOGE|ADA)/.test(p)) return "Crypto";
  if (/(US30|NAS|SPX|NDX|GER|UK100|DJI|DAX|FTSE)/.test(p)) return "Indices";
  if (/^[A-Z]{6}$/.test(p)) return "Forex";
  return "Stocks";
};

const unitValue = (trade, mode, startingBalance) => {
  const pnl = Number(trade.pnl) || 0;
  if (mode === "percent") return (pnl / (startingBalance || 1)) * 100;
  if (mode === "r") {
    const risk = riskAmount(trade);
    const rr = Number(trade.rr);
    return risk ? pnl / risk : Number.isFinite(rr) ? rr : 0;
  }
  if (mode === "pips") return priceDelta(trade) * 10000;
  if (mode === "points") return priceDelta(trade) * 100;
  if (mode === "ticks") return priceDelta(trade) * 400;
  return pnl;
};

const countActiveFilters = (filters) =>
  Object.values(filters).reduce((sum, value) => {
    if (Array.isArray(value)) return sum + value.length;
    return sum + (value ? 1 : 0);
  }, 0);

const matchesFilters = (trade, filters) => {
  const side = sideOf(trade);
  const pending = isPending(trade);
  const reviewed = Boolean(trade.reviewed);
  const open = parseDate(trade.openDateTime);
  const close = parseDate(trade.closeDateTime);
  const intraday = Boolean(open && close && open.toDateString() === close.toDateString());
  const status = pending ? "pending" : "executed";

  if (filters.sides.length && !filters.sides.includes(side)) return false;
  if (filters.state.length && !filters.state.includes(pending ? "open" : "closed")) return false;
  if (filters.statuses.length && !filters.statuses.includes(status)) return false;
  if (filters.reviewed.length && !filters.reviewed.includes(reviewed ? "reviewed" : "unreviewed")) return false;
  if (filters.instruments.length && !filters.instruments.includes(assetClassOf(trade.pair))) return false;
  if (filters.symbols.length && !filters.symbols.includes(trade.pair || "—")) return false;
  if (filters.timeframe.length && !filters.timeframe.includes(intraday ? "intraday" : "multiday")) return false;
  if (filters.ratings.length && !filters.ratings.includes(Math.round(Number(trade.rating) || 0))) return false;
  if (filters.tags.length && !(trade.confluences || []).some((tag) => filters.tags.includes(tag))) return false;
  if (filters.playbooks.length) {
    const name = trade.playbook || trade.strategy || "";
    if (!filters.playbooks.includes(name)) return false;
  }
  const date = close || open;
  if (filters.from && (!date || date < new Date(`${filters.from}T00:00:00`))) return false;
  if (filters.to && (!date || date > new Date(`${filters.to}T23:59:59`))) return false;
  return true;
};

// ─── Toolbar dropdown ────────────────────────────────────────────────────────
function Dropdown({ label, icon: Icon, items, align = "right", width = "w-64", iconOnly = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={iconOnly ? label : undefined}
        className={TOOLBAR_BTN}
      >
        {Icon ? <Icon size={14} /> : null}
        {iconOnly ? null : <span>{label}</span>}
        {iconOnly ? null : <ChevronDown size={12} className="opacity-60" />}
      </button>

      {open ? (
        <div
          role="menu"
          className={`absolute ${align === "right" ? "right-0" : "left-0"} z-50 mt-1.5 ${width} overflow-hidden rounded-lg border border-[#26263a] bg-[#12121b] py-1 shadow-2xl shadow-black/60`}
        >
          {items.map((item) =>
            item.divider ? (
              <div key={item.divider} className="my-1 h-px" style={{ backgroundColor: "#26263a" }} />
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onClick?.();
                }}
                className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-[12px] transition-colors hover:bg-[#1c1c28] ${
                  item.active ? "text-white" : "text-[#b9b9cc]"
                }`}
              >
                <span className="flex min-w-0 items-start gap-2">
                  {item.icon ? <item.icon size={13} className="mt-0.5 shrink-0" /> : null}
                  <span className="flex min-w-0 flex-col">
                    <span>{item.label}</span>
                    {item.description ? (
                      <span className="mt-0.5 text-[10px] font-normal leading-snug" style={{ color: FAINT }}>
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                </span>
                {item.active ? (
                  <Check size={13} className="mt-0.5 shrink-0" style={{ color: item.accent || BE }} />
                ) : null}
              </button>
            )
          )}
        </div>
      ) : null}
    </div>
  );
}

// ─── Filter panel ────────────────────────────────────────────────────────────
function FilterGroup({ id, label, options, selected, expanded, onExpand, onToggle, onToggleAll }) {
  const allSelected = options.length > 0 && selected.length === options.length;
  const someSelected = selected.length > 0 && !allSelected;
  return (
    <div className="border-b border-[#1f1f2b] last:border-0">
      <div className="flex items-center gap-2 px-1 py-2">
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = someSelected;
          }}
          onChange={() => onToggleAll(options.map((option) => option.value))}
          aria-label={`Select all ${label}`}
          className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-[#33334a] bg-transparent accent-[#6C47FF]"
        />
        <button
          type="button"
          onClick={() => onExpand(expanded ? "" : id)}
          aria-expanded={expanded}
          className={`flex flex-1 items-center justify-between gap-2 rounded text-left text-[12px] font-medium text-[#d4d6e6] hover:text-white ${FOCUS}`}
        >
          <span>
            {label}
            {selected.length ? (
              <span className="ml-1.5 rounded bg-[#6C47FF]/20 px-1.5 py-0.5 text-[9px] font-semibold text-[#b9a6ff]">
                {selected.length}
              </span>
            ) : null}
          </span>
          <ChevronDown size={12} className={`shrink-0 opacity-60 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {expanded ? (
        <div className="grid max-h-44 grid-cols-2 gap-x-3 gap-y-0.5 overflow-y-auto pb-2.5 pl-5 pr-1">
          {options.length === 0 ? (
            <p className="col-span-2 py-1 text-[11px]" style={{ color: FAINT }}>
              Nothing to choose from yet.
            </p>
          ) : (
            options.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-1 text-[11.5px] text-[#b9b9cc] hover:bg-[#1a1a24] hover:text-white"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option.value)}
                  onChange={() => onToggle(option.value)}
                  className="h-3 w-3 shrink-0 cursor-pointer rounded border-[#33334a] bg-transparent accent-[#6C47FF]"
                />
                <span className="truncate">{option.label}</span>
              </label>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function FilterPanel({
  draft,
  setDraft,
  symbols,
  tags,
  playbooks,
  books,
  onReset,
  onCancel,
  onApply,
  panelRef,
}) {
  const [tab, setTab] = useState("general");
  const [expanded, setExpanded] = useState("instruments");

  const toggle = (key, value) =>
    setDraft((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value],
    }));

  const toggleAll = (key, values) =>
    setDraft((current) => ({
      ...current,
      [key]: current[key].length === values.length ? [] : values,
    }));

  const instrumentOptions = ["Forex", "Indices", "Metals", "Crypto", "Stocks"].map((value) => ({
    value,
    label: value,
  }));

  const groupProps = (key, label, options) => ({
    id: key,
    label,
    options,
    selected: draft[key],
    expanded: expanded === key,
    onExpand: setExpanded,
    onToggle: (value) => toggle(key, value),
    onToggleAll: (values) => toggleAll(key, values),
  });

  const tabs = [
    ["general", "General", SlidersHorizontal],
    ["tags", "Tags", Tag],
    ["datetime", "Date & Time", CalendarDays],
    ["playbook", "Playbook", Layers],
  ];

  const quickRange = (days) => {
    const to = new Date();
    const from = subDays(to, days - 1);
    setDraft((current) => ({
      ...current,
      from: format(from, "yyyy-MM-dd"),
      to: format(to, "yyyy-MM-dd"),
    }));
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Filter trades"
      className="absolute right-0 top-full z-50 mt-2 w-[min(560px,calc(100vw-24px))] overflow-hidden rounded-xl border border-[#26263a] bg-[#12121b] shadow-2xl shadow-black/70"
    >
      <div className="grid grid-cols-1 sm:grid-cols-[168px_minmax(0,1fr)]">
        <div className="flex flex-row gap-1 overflow-x-auto border-b border-[#1f1f2b] p-2 sm:flex-col sm:border-b-0 sm:border-r">
          {tabs.map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11.5px] font-medium transition-colors ${FOCUS} ${
                tab === key ? "bg-[#1d1d2c] text-white" : "text-[#9a9ab2] hover:bg-[#181822] hover:text-white"
              }`}
            >
              <Icon size={13} className="shrink-0" />
              {label}
            </button>
          ))}
        </div>

        <div className="max-h-[360px] overflow-y-auto px-2 py-1.5">
          {tab === "general" ? (
            <>
              <FilterGroup {...groupProps("instruments", "Instrument", instrumentOptions)} />
              <FilterGroup
                {...groupProps("timeframe", "Intraday/Multiday", [
                  { value: "intraday", label: "Intraday" },
                  { value: "multiday", label: "Multiday" },
                ])}
              />
              <FilterGroup
                {...groupProps("state", "Open/Closed", [
                  { value: "open", label: "Open" },
                  { value: "closed", label: "Closed" },
                ])}
              />
              <FilterGroup
                {...groupProps("reviewed", "Reviewed/Unreviewed", [
                  { value: "reviewed", label: "Reviewed" },
                  { value: "unreviewed", label: "Unreviewed" },
                ])}
              />
              <FilterGroup
                {...groupProps("sides", "Side", [
                  { value: "Long", label: "Long" },
                  { value: "Short", label: "Short" },
                ])}
              />
              <FilterGroup
                {...groupProps(
                  "symbols",
                  "Symbol",
                  symbols.map((symbol) => ({ value: symbol, label: symbol }))
                )}
              />
              <FilterGroup
                {...groupProps("statuses", "Status", [
                  { value: "executed", label: "Executed" },
                  { value: "pending", label: "Pending" },
                ])}
              />
              <FilterGroup
                {...groupProps(
                  "ratings",
                  "Trade rating",
                  [5, 4, 3, 2, 1].map((value) => ({
                    value,
                    label: `${value} star${value === 1 ? "" : "s"}`,
                  }))
                )}
              />
            </>
          ) : null}

          {tab === "tags" ? (
            <div className="px-1 py-2">
              <p className="mb-2 text-[11px]" style={{ color: MUTED }}>
                Show trades that carry any of these tags.
              </p>
              {tags.length === 0 ? (
                <p className="text-[11px]" style={{ color: FAINT }}>
                  No tags have been saved on this account yet.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => {
                    const active = draft.tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggle("tags", tag)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${FOCUS} ${
                          active
                            ? "border-[#6C47FF] bg-[#6C47FF]/25 text-white"
                            : "border-[#2a2a3a] text-[#b9b9cc] hover:border-[#3a3a4e] hover:text-white"
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {tab === "datetime" ? (
            <div className="space-y-3 px-1 py-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="trade-filter-from" className={LABEL}>
                    From
                  </label>
                  <input
                    id="trade-filter-from"
                    type="date"
                    value={draft.from}
                    onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
                    className={`${FIELD} h-9`}
                  />
                </div>
                <div>
                  <label htmlFor="trade-filter-to" className={LABEL}>
                    To
                  </label>
                  <input
                    id="trade-filter-to"
                    type="date"
                    value={draft.to}
                    onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
                    className={`${FIELD} h-9`}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  ["Today", () => quickRange(1)],
                  ["Last 7 days", () => quickRange(7)],
                  ["Last 30 days", () => quickRange(30)],
                  ["Clear", () => setDraft((current) => ({ ...current, from: "", to: "" }))],
                ].map(([label, action]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={action}
                    className={`rounded-lg border border-[#2a2a3a] px-2.5 py-1 text-[11px] font-medium text-[#b9b9cc] transition-colors hover:border-[#3a3a4e] hover:text-white ${FOCUS}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[10.5px] leading-relaxed" style={{ color: FAINT }}>
                Dates use the close time of each trade, falling back to the open time for positions that are still running.
              </p>
            </div>
          ) : null}

          {tab === "playbook" ? (
            <div className="px-1 py-2">
              {books.length === 0 && playbooks.length === 0 ? (
                <p className="text-[11px]" style={{ color: FAINT }}>
                  No playbooks or strategies have been saved yet.
                </p>
              ) : (
                <div className="space-y-0.5">
                  {[...new Set([...books, ...playbooks])].map((name) => (
                    <label
                      key={name}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-[11.5px] text-[#b9b9cc] hover:bg-[#1a1a24] hover:text-white"
                    >
                      <input
                        type="checkbox"
                        checked={draft.playbooks.includes(name)}
                        onChange={() => toggle("playbooks", name)}
                        className="h-3 w-3 shrink-0 cursor-pointer rounded border-[#33334a] bg-transparent accent-[#6C47FF]"
                      />
                      <span className="truncate">{name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-[#1f1f2b] px-3 py-2.5">
        <button
          type="button"
          onClick={onReset}
          className={`flex items-center gap-1.5 rounded px-1 text-[11.5px] font-medium text-[#9a9ab2] transition-colors hover:text-white ${FOCUS}`}
        >
          <RotateCcw size={12} /> Reset all
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className={GHOST}>
            Cancel
          </button>
          <button type="button" onClick={onApply} className={PRIMARY}>
            Apply filters
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Small building blocks ───────────────────────────────────────────────────
const Panel = ({ title, action, children, className = "" }) => (
  <section className={`overflow-hidden rounded-xl border border-[#23232f] bg-[#13131b] ${className}`}>
    {title ? (
      <div className="flex items-center justify-between gap-2 border-b border-[#1f1f2b] px-4 py-3">
        <h3 className="text-[13px] font-semibold text-[#e9e9f2]">{title}</h3>
        {action}
      </div>
    ) : null}
    <div className="p-4">{children}</div>
  </section>
);

const StatRow = ({ label, value, tone }) => (
  <div className="flex items-center justify-between gap-3 border-b border-[#1f1f2b] py-2 text-[11.5px] last:border-0">
    <span style={{ color: MUTED }}>{label}</span>
    <span className="text-right font-semibold tabular-nums" style={{ color: tone || "#d4d6e6" }}>
      {value}
    </span>
  </div>
);

const Donut = ({ wins, losses, be }) => {
  const total = wins + losses + be;
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const segs = [
    { v: wins, col: POS },
    { v: be, col: "#5d6078" },
    { v: losses, col: NEG },
  ];
  return (
    <svg viewBox="0 0 100 100" className="h-32 w-32 shrink-0 -rotate-90">
      <circle cx="50" cy="50" r={r} fill="none" stroke="#20202c" strokeWidth="10" />
      {total > 0 &&
        segs.map((sg, i) => {
          if (!sg.v) return null;
          const len = (sg.v / total) * c;
          const el = (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={sg.col}
              strokeWidth="10"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
    </svg>
  );
};

const SidePill = ({ trade }) => {
  const short = sideOf(trade) === "Short";
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold"
      style={{
        backgroundColor: short ? "rgba(242,85,110,0.12)" : "rgba(34,196,147,0.12)",
        color: short ? NEG : POS,
      }}
    >
      {short ? "Short" : "Long"}
    </span>
  );
};

// ─── Calendar ────────────────────────────────────────────────────────────────
const PnLCalendar = ({ month, onMonth, daily, onPick, selected, fmtCompact }) => {
  const y = month.getFullYear();
  const m = month.getMonth();
  const lead = new Date(y, m, 1).getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const keyOf = (d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const monthTotal = cells.reduce((sum, d) => sum + (d ? daily[keyOf(d)]?.pnl || 0 : 0), 0);
  const nav = `rounded-lg border border-[#23232f] p-1.5 text-[#8b8ba3] transition-colors hover:bg-[#1c1c28] hover:text-white ${FOCUS}`;

  return (
    <Panel
      title={`${format(month, "MMMM yyyy")} · ${fmtCompact(monthTotal, true)}`}
      action={
        <div className="flex gap-1.5">
          <button type="button" className={nav} onClick={() => onMonth(new Date(y, m - 1, 1))} aria-label="Previous month">
            <ChevronLeft size={15} />
          </button>
          <button type="button" className={nav} onClick={() => onMonth(new Date(y, m + 1, 1))} aria-label="Next month">
            <ChevronRight size={15} />
          </button>
        </div>
      }
    >
      <div className="mb-1.5 grid grid-cols-8 gap-1.5 text-center text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Week"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="space-y-1.5">
        {weeks.map((wk, wi) => {
          const weekTotal = wk.reduce((sum, d) => sum + (d ? daily[keyOf(d)]?.pnl || 0 : 0), 0);
          const weekCount = wk.reduce((sum, d) => sum + (d ? daily[keyOf(d)]?.count || 0 : 0), 0);
          return (
            <div key={wi} className="grid grid-cols-8 gap-1.5">
              {wk.map((d, di) => {
                if (!d) return <div key={di} />;
                const rec = daily[keyOf(d)];
                const tone = !rec
                  ? "border-[#1f1f2b] bg-[#0d0d16]"
                  : rec.pnl > 0
                  ? "border-[#22c493]/30 bg-[#22c493]/10"
                  : rec.pnl < 0
                  ? "border-[#f2556e]/30 bg-[#f2556e]/10"
                  : "border-[#6C47FF]/30 bg-[#6C47FF]/10";
                return (
                  <button
                    key={di}
                    type="button"
                    onClick={() => rec && onPick(keyOf(d))}
                    className={`min-h-[62px] rounded-lg border p-1.5 text-left transition ${tone} ${
                      selected === keyOf(d) ? "ring-2 ring-[#6C47FF]" : ""
                    } ${rec ? "cursor-pointer hover:brightness-125" : "cursor-default"} ${FOCUS}`}
                  >
                    <div className="text-[10px]" style={{ color: rec ? MUTED : FAINT }}>
                      {d}
                    </div>
                    {rec ? (
                      <>
                        <div
                          className="text-[11.5px] font-semibold tabular-nums"
                          style={{ color: rec.pnl > 0 ? POS : rec.pnl < 0 ? NEG : TEXT }}
                        >
                          {fmtCompact(rec.pnl, true)}
                        </div>
                        <div className="text-[9.5px]" style={{ color: MUTED }}>
                          {rec.count} trade{rec.count > 1 ? "s" : ""}
                        </div>
                      </>
                    ) : null}
                  </button>
                );
              })}
              <div className="rounded-lg border border-[#1f1f2b] bg-[#0f0f18] p-1.5">
                <div className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: FAINT }}>
                  Wk {wi + 1}
                </div>
                <div
                  className="text-[11.5px] font-bold tabular-nums"
                  style={{ color: weekTotal > 0 ? POS : weekTotal < 0 ? NEG : TEXT }}
                >
                  {fmtCompact(weekTotal, true)}
                </div>
                <div className="text-[9.5px]" style={{ color: MUTED }}>
                  {weekCount} day{weekCount === 1 ? "" : "s"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
};

// ─── Live TradingView chart ──────────────────────────────────────────────────
const TV_SYMBOL_MAP = {
  EURUSD: "FX:EURUSD",
  GBPUSD: "FX:GBPUSD",
  USDJPY: "FX:USDJPY",
  AUDUSD: "FX:AUDUSD",
  USDCAD: "FX:USDCAD",
  GBPJPY: "FX:GBPJPY",
  NZDUSD: "FX:NZDUSD",
  EURJPY: "FX:EURJPY",
  XAUUSD: "OANDA:XAUUSD",
  XAGUSD: "OANDA:XAGUSD",
  NAS100: "OANDA:NAS100USD",
  US30: "OANDA:US30USD",
  SPX500: "OANDA:SPX500USD",
  GER40: "OANDA:DE30EUR",
  UK100: "OANDA:UK100GBP",
  BTCUSD: "BITSTAMP:BTCUSD",
  ETHUSD: "BITSTAMP:ETHUSD",
};

const tvSymbolFor = (pair) => {
  const key = String(pair || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (TV_SYMBOL_MAP[key]) return TV_SYMBOL_MAP[key];
  if (/^[A-Z]{6}$/.test(key)) return `FX:${key}`;
  return key || "FX:EURUSD";
};

const tvChartUrl = (symbol) => `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`;

const TV_INTERVALS = [
  ["1", "1m"],
  ["5", "5m"],
  ["15", "15m"],
  ["60", "1h"],
  ["D", "1D"],
];

// The advanced-chart embed is the only supported way to show a real,
// live TradingView chart inside the app. The widget owns its own iframe, so
// this component only mounts it into a host div and tears it down on change.
function TradingViewChart({ symbol, interval, accent = "#6C47FF" }) {
  const hostRef = useRef(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    setStatus("loading");
    host.innerHTML = "";

    const container = document.createElement("div");
    container.className = "tradingview-widget-container__widget";
    container.style.height = "100%";
    container.style.width = "100%";
    host.appendChild(container);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "rgba(11, 11, 18, 1)",
      gridColor: "rgba(148, 163, 184, 0.08)",
      hide_top_toolbar: false,
      hide_legend: false,
      hide_side_toolbar: false,
      allow_symbol_change: true,
      withdateranges: true,
      save_image: false,
      details: false,
      hotlist: false,
      calendar: false,
      studies: [],
      support_host: "https://www.tradingview.com",
    });
    script.onerror = () => setStatus("failed");
    host.appendChild(script);

    // The widget mounts its own iframe once the embed script runs. Watch for
    // it so the loading panel disappears on its own, and surface a fallback
    // if the script is blocked (offline, script blocker, corporate proxy).
    const poll = window.setInterval(() => {
      if (host.querySelector("iframe")) {
        window.clearInterval(poll);
        setStatus("ready");
      }
    }, 350);
    const timer = window.setTimeout(() => {
      window.clearInterval(poll);
      if (!host.querySelector("iframe")) setStatus("failed");
    }, 15000);

    return () => {
      window.clearInterval(poll);
      window.clearTimeout(timer);
      host.innerHTML = "";
    };
  }, [symbol, interval]);

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="tradingview-widget-container h-full w-full" />
      {status === "loading" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0b0b13]">
          <span
            className="h-7 w-7 animate-spin rounded-full border-2 border-[#2a2a3a]"
            style={{ borderTopColor: accent }}
          />
          <p className="text-[11.5px]" style={{ color: MUTED }}>
            Loading the live chart…
          </p>
        </div>
      ) : null}
      {status === "failed" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0b0b13] px-4 text-center">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#6C47FF]/15"
            style={{ color: accent }}
          >
            <BarChart3 size={18} />
          </span>
          <p className="text-[13px] font-medium text-[#c9cbe0]">The live chart could not load</p>
          <p className="max-w-[300px] text-[11px] leading-relaxed" style={{ color: FAINT }}>
            Check the connection, or open this market on TradingView in a new tab.
          </p>
          <a
            href={tvChartUrl(symbol)}
            target="_blank"
            rel="noopener noreferrer"
            className={`${GHOST} mt-1 !h-8`}
          >
            <ExternalLink size={12} /> Open on TradingView
          </a>
        </div>
      ) : null}
    </div>
  );
}

// ─── Tracking view ───────────────────────────────────────────────────────────
function TagSection({ title, items = [], color = "#b9b9cc", onManage }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
          {title}
        </span>
        {onManage ? (
          <button
            type="button"
            onClick={onManage}
            className={`rounded text-[10px] font-medium text-[#b9a6ff] transition-colors hover:text-white ${FOCUS}`}
          >
            Manage
          </button>
        ) : null}
      </div>
      {items.length ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <span
              key={item}
              className="rounded-md px-2 py-1 text-[10.5px] font-medium"
              style={{ backgroundColor: `${color}18`, color, border: `1px solid ${color}33` }}
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[10.5px]" style={{ color: FAINT }}>
          None tagged
        </p>
      )}
    </div>
  );
}

function TrackingOverlay({
  trade,
  accountName,
  startingBalance,
  accent,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onClose,
  onEdit,
  onToggleReviewed,
  onSaveNote,
  onDelete,
  onOpenJournal,
}) {
  const [tab, setTab] = useState("stats");
  const [noteTab, setNoteTab] = useState("note");
  const [interval, setInterval] = useState("5");
  const [noteDraft, setNoteDraft] = useState(trade.notes || "");
  const [noteSaved, setNoteSaved] = useState(false);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    setNoteDraft(trade.notes || "");
    setNoteSaved(false);
  }, [trade.id, trade.notes]);

  useEffect(() => {
    if (!noteSaved) return undefined;
    const timer = window.setTimeout(() => setNoteSaved(false), 2000);
    return () => window.clearTimeout(timer);
  }, [noteSaved]);

  useEffect(() => {
    if (!shared) return undefined;
    const timer = window.setTimeout(() => setShared(false), 1800);
    return () => window.clearTimeout(timer);
  }, [shared]);

  const pending = isPending(trade);
  const pnl = Number(trade.pnl) || 0;
  const open = parseDate(trade.openDateTime);
  const close = parseDate(trade.closeDateTime);
  const day = close || open;
  const short = sideOf(trade) === "Short";
  const commission = Number(trade.commission) || 0;
  const swap = Number(trade.swap) || 0;
  const gross = pending ? pnl : pnl + commission + swap;
  const roi = startingBalance ? (pnl / startingBalance) * 100 : 0;
  const tone = pending ? TEXT : pnl > 0 ? POS : pnl < 0 ? NEG : TEXT;

  const multiplier = assetClassOf(trade.pair) === "Forex" ? 100000 : assetClassOf(trade.pair) === "Metals" ? 100 : 1;
  const lots = Number(trade.lotSize) || 0;
  const entry = Number(trade.entry) || 0;
  const stop = Number(trade.stopLoss) || 0;
  const target = Number(trade.takeProfit) || 0;
  const notional = entry * lots * multiplier;
  const riskUsd = Math.abs(entry - stop) * lots * multiplier;
  const plannedRR = entry && stop && target && entry !== stop ? Math.abs(target - entry) / Math.abs(entry - stop) : 0;
  const rating = Math.round(Number(trade.rating) || 0);
  const name = trade.playbook || trade.strategy || "";
  const symbol = tvSymbolFor(trade.pair);
  const journalUrl = tvChartUrl(symbol);

  const rows = [
    ["Side", sideOf(trade).toUpperCase(), short ? NEG : POS],
    ["Lots traded", trade.lotSize || "—"],
    ["Commissions & fees", usd(commission)],
    ["Swap", usd(swap)],
    ["Net ROI", `${roi.toFixed(2)}%`, roi > 0 ? POS : roi < 0 ? NEG : TEXT],
    ["Gross P&L", pending ? "Open" : usd(gross, true), pending ? MUTED : gross > 0 ? POS : gross < 0 ? NEG : TEXT],
    ["Notional exposure", notional ? usd(notional) : "—"],
    ["Playbook", name || "Not linked"],
    ...(trade.mae != null || trade.mfe != null
      ? [[
          "MAE / MFE",
          `${trade.mae != null ? Number(trade.mae).toFixed(2) : "—"}R / ${
            trade.mfe != null ? Number(trade.mfe).toFixed(2) : "—"
          }R`,
        ]]
      : []),
    ["Profit target", trade.takeProfit || "—"],
    ["Stop loss", trade.stopLoss || "—"],
    ["Trade risk", riskUsd ? usd(riskUsd) : "—"],
    ["Planned R:R", plannedRR ? `${plannedRR.toFixed(2)} : 1` : "—"],
    ["Realized R", trade.rr != null && trade.rr !== "" ? `${Number(trade.rr).toFixed(2)}R` : "—"],
    ["Average entry", trade.entry || "—"],
    ["Average exit", pending ? "Open" : trade.exit || "—"],
    ["Entry time", open ? format(open, "MMM d, HH:mm") : "—"],
    ["Exit time", close ? format(close, "MMM d, HH:mm") : "Open"],
  ];

  const progress = rating ? Math.min(100, (rating / 5) * 100) : 0;
  const dirty = noteDraft !== (trade.notes || "");
  const words = noteDraft.trim() ? noteDraft.trim().split(/\s+/).length : 0;

  const saveNote = () => {
    onSaveNote?.(noteDraft);
    setNoteSaved(true);
  };

  const share = async () => {
    const text = `${trade.pair || "Trade"} · ${sideOf(trade)} · ${
      pending ? "open position" : usd(pnl, true)
    }${day ? ` · ${format(day, "MMM d, yyyy")}` : ""} — ${accountName}`;
    try {
      await navigator.clipboard.writeText(text);
      setShared(true);
    } catch {
      // Clipboard access can be refused; leave the button unchanged.
    }
  };

  const insertTemplate = () => {
    const template = "Setup:\n\nExecution:\n\nWhat went well:\n\nWhat to fix:\n";
    setNoteDraft((current) => (current.trim() ? `${current.replace(/\s+$/, "")}\n\n${template}` : template));
  };

  const tabs = [
    ["stats", "Stats"],
    ["playbook", "Playbook"],
    ["executions", "Executions"],
    ["attachments", "Attachments"],
  ];

  return (
    <div className="fixed inset-0 z-[1050] flex flex-col" style={{ backgroundColor: "#07070c", color: TEXT }}>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[#1f1f2b] bg-[#0a0a10] px-2.5 sm:px-4">
        <button type="button" onClick={onClose} className={ICON_BTN} aria-label="Back to the trade log">
          <ArrowLeft size={16} />
        </button>

        <div className="hidden shrink-0 items-center rounded-lg border border-[#23232f] bg-[#12121b] sm:flex">
          <button
            type="button"
            onClick={onPrev}
            disabled={!canPrev}
            aria-label="Previous trade"
            className={`flex h-8 w-8 items-center justify-center rounded-l-lg text-[#8b8ba3] transition-colors hover:bg-[#1c1c28] hover:text-white disabled:cursor-not-allowed disabled:opacity-30 ${FOCUS}`}
          >
            <ChevronLeft size={15} />
          </button>
          <span className="h-4 w-px bg-[#23232f]" />
          <button
            type="button"
            onClick={onNext}
            disabled={!canNext}
            aria-label="Next trade"
            className={`flex h-8 w-8 items-center justify-center rounded-r-lg text-[#8b8ba3] transition-colors hover:bg-[#1c1c28] hover:text-white disabled:cursor-not-allowed disabled:opacity-30 ${FOCUS}`}
          >
            <ChevronRight size={15} />
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-semibold">{trade.pair || "—"}</span>
            <SidePill trade={trade} />
            {pending ? (
              <span className="rounded bg-[#f59e0b]/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#fbbf24]">
                Open
              </span>
            ) : null}
            <span className="hidden truncate text-[10.5px] sm:inline" style={{ color: MUTED }}>
              {day ? format(day, "EEE, MMM d, yyyy") : "No date"} · {accountName}
            </span>
          </div>
          <p className="truncate text-[10.5px] sm:hidden" style={{ color: MUTED }}>
            {day ? format(day, "MMM d, yyyy") : "No date"} · {accountName}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleReviewed}
            className={trade.reviewed ? `${GHOST} !border-[#22c493]/40 !text-[#2dd4a0]` : GHOST}
            aria-pressed={Boolean(trade.reviewed)}
          >
            <Check size={13} />
            <span className="hidden md:inline">{trade.reviewed ? "Reviewed" : "Mark as reviewed"}</span>
          </button>
          <a
            href={journalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${GHOST} hidden sm:inline-flex`}
            title="Open this market on TradingView"
          >
            <ExternalLink size={13} />
            <span className="hidden md:inline">Open chart</span>
          </a>
          <button type="button" onClick={share} className={`${GHOST} hidden sm:inline-flex`}>
            {shared ? <Check size={13} /> : <Share2 size={13} />}
            <span className="hidden lg:inline">{shared ? "Copied" : "Share"}</span>
          </button>
          <button type="button" onClick={onEdit} className={ICON_BTN} aria-label="Edit trade">
            <Edit size={15} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className={`${ICON_BTN} hover:!text-[#ff8ba0]`}
            aria-label="Delete trade"
          >
            <Trash2 size={15} />
          </button>
          <button type="button" onClick={onClose} className={ICON_BTN} aria-label="Close trade">
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:grid-cols-[304px_minmax(0,1fr)] lg:overflow-hidden">
        <aside className="shrink-0 border-b border-[#1f1f2b] p-3 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="overflow-hidden rounded-xl border border-[#23232f] bg-[#13131b]">
            <div className="flex flex-wrap gap-1 border-b border-[#1f1f2b] p-1.5" role="tablist" aria-label="Trade details">
              {tabs.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`rounded-lg px-2 py-1.5 text-[10.5px] font-medium transition-colors ${FOCUS} ${
                    tab === key ? "bg-[#1d1d2c] text-white" : "text-[#8b8ba3] hover:bg-[#181822] hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "stats" ? (
              <div className="p-3">
                <div className="rounded-lg border border-[#23232f] bg-[#0d0d16] px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide" style={{ color: MUTED }}>
                    Net P&amp;L
                  </p>
                  <p className="mt-1 text-[24px] font-bold leading-none tabular-nums" style={{ color: tone }}>
                    {pending ? "Open" : usd(pnl, true)}
                  </p>
                </div>

                <dl className="mt-1.5 divide-y divide-[#1f1f2b]">
                  {rows.map(([label, value, valueTone]) => (
                    <div key={label} className="flex items-center justify-between gap-3 py-[6px] text-[11px]">
                      <dt style={{ color: MUTED }}>{label}</dt>
                      <dd className="truncate text-right font-medium tabular-nums" style={{ color: valueTone || "#d4d6e6" }}>
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-3">
                  <div className="flex items-center justify-between text-[10.5px]">
                    <span style={{ color: MUTED }}>Setup score</span>
                    <span className="font-semibold" style={{ color: rating ? accent : FAINT }}>
                      {rating ? `${rating} / 5` : "Not scored"}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#20202c]">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${progress}%`, backgroundColor: accent }}
                    />
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-[#23232f] bg-[#0d0d16] px-2.5 py-2">
                  <span className="text-[10.5px]" style={{ color: MUTED }}>
                    Trade rating
                  </span>
                  {rating ? (
                    <StarRating value={rating} accent={accent} readOnly size={13} />
                  ) : (
                    <span className="text-[10px]" style={{ color: FAINT }}>
                      Not rated
                    </span>
                  )}
                </div>
              </div>
            ) : null}

            {tab === "playbook" ? (
              <div className="space-y-3.5 p-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wide" style={{ color: MUTED }}>
                    Playbook
                  </p>
                  <p className="mt-0.5 text-[12.5px] font-semibold text-white">{name || "Not linked"}</p>
                  {trade.strategy && trade.playbook && trade.strategy !== trade.playbook ? (
                    <p className="text-[10.5px]" style={{ color: MUTED }}>
                      Strategy: {trade.strategy}
                    </p>
                  ) : null}
                </div>

                <TagSection title="Custom tags" items={trade.confluences} color={accent} onManage={onEdit} />
                <TagSection title="Mistakes" items={trade.mistakes} color={NEG} onManage={onEdit} />

                <button type="button" onClick={onEdit} className={`${GHOST} w-full`}>
                  <Edit size={12} /> Edit playbook and tags
                </button>
              </div>
            ) : null}

            {tab === "executions" ? (
              <div className="p-3">
                <table className="w-full border-collapse text-[10.5px]">
                  <thead>
                    <tr className="text-left" style={{ color: MUTED }}>
                      <th className="pb-1.5 font-medium">Time</th>
                      <th className="pb-1.5 text-right font-medium">Price</th>
                      <th className="pb-1.5 text-right font-medium">Qty</th>
                      <th className="pb-1.5 text-right font-medium">Side</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-[#1f1f2b]">
                      <td className="py-1.5 tabular-nums">{open ? format(open, "HH:mm:ss") : "—"}</td>
                      <td className="py-1.5 text-right tabular-nums">{trade.entry || "—"}</td>
                      <td className="py-1.5 text-right tabular-nums">{trade.lotSize || "—"}</td>
                      <td className="py-1.5 text-right font-semibold" style={{ color: short ? NEG : POS }}>
                        {short ? "Sell" : "Buy"}
                      </td>
                    </tr>
                    {!pending ? (
                      <tr className="border-t border-[#1f1f2b]">
                        <td className="py-1.5 tabular-nums">{close ? format(close, "HH:mm:ss") : "—"}</td>
                        <td className="py-1.5 text-right tabular-nums">{trade.exit || "—"}</td>
                        <td className="py-1.5 text-right tabular-nums">{trade.lotSize || "—"}</td>
                        <td className="py-1.5 text-right font-semibold" style={{ color: MUTED }}>
                          Close
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
                <p className="mt-3 border-t border-[#1f1f2b] pt-2 text-[10px] leading-relaxed" style={{ color: FAINT }}>
                  Fills come from the trade record. Imports with partial fills are grouped into a single average entry and exit.
                </p>
              </div>
            ) : null}

            {tab === "attachments" ? (
              <div className="p-3">
                {trade.screenshotUrl ? (
                  <a
                    href={trade.screenshotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block overflow-hidden rounded-lg border border-[#23232f] bg-[#0b0b13]"
                  >
                    <img
                      src={trade.screenshotUrl}
                      alt={`${trade.pair || "Trade"} chart snapshot`}
                      className="max-h-[260px] w-full object-contain"
                    />
                  </a>
                ) : (
                  <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-[#2a2a3a] px-3 py-8 text-center">
                    <Paperclip size={18} style={{ color: FAINT }} />
                    <p className="text-[11.5px] text-[#9a9ab2]">No attachments yet</p>
                    <p className="text-[10px] leading-relaxed" style={{ color: FAINT }}>
                      Add a chart snapshot URL to keep the setup with the trade.
                    </p>
                  </div>
                )}
                <button type="button" onClick={onEdit} className={`${GHOST} mt-2 w-full`}>
                  <Edit size={12} /> {trade.screenshotUrl ? "Change snapshot" : "Add a snapshot"}
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-3 space-y-3 rounded-xl border border-[#23232f] bg-[#13131b] p-3">
            <TagSection title="Setups" items={name ? [name] : []} color={POS} onManage={onEdit} />
            <TagSection title="Mistakes" items={trade.mistakes} color={NEG} />
            <TagSection title="Custom tags" items={trade.confluences} color={accent} />
          </div>
        </aside>

        <main className="flex min-h-0 flex-1 flex-col">
          <section className="flex min-h-[380px] flex-1 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1f1f2b] bg-[#101018] px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11.5px] font-semibold text-white">{trade.pair || "Chart"}</span>
                <span className="text-[10px]" style={{ color: FAINT }}>
                  {symbol}
                </span>
                <div className="flex items-center rounded-md border border-[#23232f] bg-[#0d0d16] p-0.5">
                  {TV_INTERVALS.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setInterval(value)}
                      aria-pressed={interval === value}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${FOCUS} ${
                        interval === value ? "bg-[#6C47FF] text-white" : "text-[#8b8ba3] hover:text-white"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden items-center gap-1 text-[10px] sm:flex" style={{ color: FAINT }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: POS }} /> Live chart
                </span>
                <a
                  href={journalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`rounded text-[10.5px] font-semibold text-[#b9a6ff] transition-colors hover:text-white ${FOCUS}`}
                >
                  TradingView ↗
                </a>
              </div>
            </div>
            <div className="relative h-[380px] w-full bg-[#0b0b13] lg:h-auto lg:min-h-0 lg:flex-1">
              <TradingViewChart symbol={symbol} interval={interval} accent={accent} />
            </div>
          </section>

          <section className="shrink-0 border-t border-[#1f1f2b] bg-[#0d0d16]">
            <div className="flex flex-wrap items-center gap-1 border-b border-[#1f1f2b] px-2.5 py-1.5">
              {[
                ["note", "Trade note", FileText],
                ["journal", "Daily journal", CalendarDays],
              ].map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setNoteTab(key)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${FOCUS} ${
                    noteTab === key ? "bg-[#1d1d2c] text-white" : "text-[#8b8ba3] hover:bg-[#181822] hover:text-white"
                  }`}
                >
                  <Icon size={12} /> {label}
                </button>
              ))}

              <div className="ml-auto flex items-center gap-2">
                {noteTab === "note" ? (
                  <>
                    <span className="hidden text-[10px] sm:inline" style={{ color: FAINT }}>
                      {words} word{words === 1 ? "" : "s"}
                    </span>
                    <button
                      type="button"
                      onClick={insertTemplate}
                      className={`flex items-center gap-1 rounded-md border border-[#2a2a3a] px-2 py-1 text-[10.5px] font-medium text-[#b9b9cc] transition-colors hover:border-[#3a3a4e] hover:text-white ${FOCUS}`}
                    >
                      <Sparkles size={11} /> Template
                    </button>
                    <button
                      type="button"
                      onClick={saveNote}
                      disabled={!dirty}
                      className={`${PRIMARY} !h-7 !px-2.5 disabled:cursor-not-allowed disabled:!border disabled:!border-[#2a2a3a] disabled:!bg-[#171722] disabled:!text-[#6b7090] disabled:opacity-100`}
                    >
                      {noteSaved ? <Check size={12} /> : null}
                      {noteSaved ? "Saved" : "Save note"}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpenJournal(day)}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-semibold text-[#b9a6ff] transition-colors hover:text-white ${FOCUS}`}
                  >
                    <CalendarDays size={11} /> Open the journal for this day
                  </button>
                )}
              </div>
            </div>

            {noteTab === "note" ? (
              <textarea
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                placeholder="What did you see, how did you execute, and what would you repeat?"
                aria-label="Trade note"
                className="h-[132px] w-full resize-none bg-transparent px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[#c9cbe0] outline-none placeholder:text-[#5d6078]"
              />
            ) : (
              <div className="flex h-[132px] flex-col items-center justify-center gap-1.5 text-center">
                <CalendarDays size={18} style={{ color: FAINT }} />
                <p className="text-[12px] text-[#9a9ab2]">
                  Daily journal entries live alongside the trading day.
                </p>
                <button
                  type="button"
                  onClick={() => onOpenJournal(day)}
                  className={`rounded text-[11px] font-semibold text-[#b9a6ff] transition-colors hover:text-white ${FOCUS}`}
                >
                  Open the journal for this day
                </button>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function Trades({ currentAccount }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { ac } = useAccent();
  const accent = ac.hex;

  const [PREVIEW] = useState(
    () =>
      typeof window !== "undefined" &&
      process.env.NODE_ENV !== "production" &&
      new URLSearchParams(window.location.search).get("preview") === "1"
  );

  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState({ text: "", type: "success" });

  const selectedDate = searchParams.get("date");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("date-desc");
  const [period, setPeriod] = useState("all");
  const [displayMode, setDisplayMode] = useState("dollar");
  const [privacy, setPrivacy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState("log");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedIds, setSelectedIds] = useState([]);

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);

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
    strategy: "",
    playbookId: "",
    playbook: "",
    rating: 0,
    mistakes: [],
    openDateTime: "",
    closeDateTime: "",
  });
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [tradeToDelete, setTradeToDelete] = useState(null);
  const [user, setUser] = useState(null);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [playbooks, setPlaybooks] = useState([]);
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((authUser) => {
      setUser(authUser);
    });
    return unsubscribe;
  }, []);

  const refreshTrades = async () => {
    if (PREVIEW) {
      setTrades(demoDashboardTrades());
      setError("");
      setLoading(false);
      return;
    }
    if (!user || !currentAccount?.id) {
      setTrades([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const tradesRef = collection(db, "users", user.uid, "accounts", currentAccount.id, "trades");
      const snapshot = await getDocs(query(tradesRef, orderBy("createdAt", "desc")));
      setTrades(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Trades fetch failed:", err);
      setError("We couldn't load your trades. Check your connection and try again.");
      setTrades([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (PREVIEW || (user && currentAccount)) refreshTrades();
    else {
      setTrades([]);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccount?.id, user, PREVIEW]);

  useEffect(() => {
    const accountId = currentAccount?.id;
    if (!user || !accountId || PREVIEW) {
      setPlaybooks([]);
      return undefined;
    }
    let cancelled = false;
    getDocs(collection(db, "users", user.uid, "accounts", accountId, "playbooks"))
      .then((snap) => {
        if (!cancelled) setPlaybooks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentAccount?.id, user, PREVIEW]);

  useEffect(() => {
    if (!filterOpen) return undefined;
    const onPointer = (event) => {
      if (filterRef.current && !filterRef.current.contains(event.target)) {
        setFilterOpen(false);
        setDraftFilters(filters);
      }
    };
    const onKey = (event) => {
      if (event.key === "Escape") {
        setFilterOpen(false);
        setDraftFilters(filters);
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [filterOpen, filters]);

  useEffect(() => {
    if (!message.text) return undefined;
    const timer = setTimeout(() => setMessage({ text: "", type: "success" }), 4200);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  const startingBalance = Number(currentAccount?.starting_balance) || Number(currentAccount?.current_balance) || 10000;

  const symbols = useMemo(
    () => [...new Set(trades.map((trade) => trade.pair).filter(Boolean))].sort(),
    [trades]
  );
  const tags = useMemo(
    () => [...new Set(trades.flatMap((trade) => trade.confluences || []))].sort(),
    [trades]
  );
  const bookNames = useMemo(
    () => [...new Set(trades.map((trade) => trade.playbook || trade.strategy).filter(Boolean))].sort(),
    [trades]
  );

  const inPeriod = (trade) => {
    if (period === "all") return true;
    const date = tradeDateOf(trade);
    if (!date) return false;
    const now = new Date();
    const start =
      period === "this-month"
        ? startOfMonth(now)
        : period === "this-year"
        ? new Date(now.getFullYear(), 0, 1)
        : subDays(now, 29);
    const end = period === "this-month" ? endOfMonth(now) : now;
    return isWithinInterval(date, { start, end });
  };

  const filteredTrades = useMemo(() => {
    let result = [...trades];
    if (selectedDate) {
      result = result.filter((trade) => tradeDateOf(trade) && format(tradeDateOf(trade), "yyyy-MM-dd") === selectedDate);
    }
    result = result.filter((trade) => inPeriod(trade) && matchesFilters(trade, filters));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (trade) =>
          (trade.pair || "").toLowerCase().includes(q) ||
          (trade.notes || "").toLowerCase().includes(q) ||
          (trade.strategy || "").toLowerCase().includes(q) ||
          (trade.playbook || "").toLowerCase().includes(q) ||
          (trade.confluences || []).some((tag) => tag.toLowerCase().includes(q))
      );
    }
    const dateOf = (trade) => tradeDateOf(trade)?.getTime() || 0;
    result.sort((a, b) => {
      if (sortBy === "date-desc") return dateOf(b) - dateOf(a);
      if (sortBy === "date-asc") return dateOf(a) - dateOf(b);
      if (sortBy === "pnl-desc") return Number(b.pnl || 0) - Number(a.pnl || 0);
      if (sortBy === "pnl-asc") return Number(a.pnl || 0) - Number(b.pnl || 0);
      if (sortBy === "pair") return (a.pair || "").localeCompare(b.pair || "");
      if (sortBy === "rating") return (Number(b.rating) || 0) - (Number(a.rating) || 0);
      return 0;
    });
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, selectedDate, period, filters, searchQuery, sortBy]);

  const unitTrades = useMemo(
    () =>
      filteredTrades.map((trade) => ({
        ...trade,
        displayPnl: Number(unitValue(trade, displayMode, startingBalance).toFixed(4)),
      })),
    [filteredTrades, displayMode, startingBalance]
  );

  const analytics = useMemo(() => {
    const ex = unitTrades.filter((trade) => !isPending(trade));
    const pnlOf = (trade) => Number(trade.displayPnl) || 0;
    const dayOf = (trade) => {
      const date = tradeDateOf(trade);
      return date ? format(date, "yyyy-MM-dd") : "";
    };
    const wins = ex.filter((trade) => pnlOf(trade) > 0);
    const losses = ex.filter((trade) => pnlOf(trade) < 0);
    const be = ex.length - wins.length - losses.length;
    const grossWin = wins.reduce((sum, trade) => sum + pnlOf(trade), 0);
    const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + pnlOf(trade), 0));
    const net = grossWin - grossLoss;
    const avgWin = wins.length ? grossWin / wins.length : 0;
    const avgLoss = losses.length ? grossLoss / losses.length : 0;

    const chrono = [...ex].sort((a, b) => (tradeDateOf(a)?.getTime() || 0) - (tradeDateOf(b)?.getTime() || 0));
    let run = 0;
    let peak = 0;
    let maxDD = 0;
    let curW = 0;
    let curL = 0;
    let maxW = 0;
    let maxL = 0;
    const equity = chrono.map((trade) => {
      const p = pnlOf(trade);
      run += p;
      peak = Math.max(peak, run);
      maxDD = Math.max(maxDD, peak - run);
      if (p > 0) {
        curW += 1;
        curL = 0;
      } else if (p < 0) {
        curL += 1;
        curW = 0;
      } else {
        curW = 0;
        curL = 0;
      }
      maxW = Math.max(maxW, curW);
      maxL = Math.max(maxL, curL);
      return { label: dayOf(trade), value: Number(run.toFixed(2)) };
    });

    const daily = {};
    ex.forEach((trade) => {
      const key = dayOf(trade);
      if (!key) return;
      daily[key] = daily[key] || { pnl: 0, count: 0 };
      daily[key].pnl += pnlOf(trade);
      daily[key].count += 1;
    });

    const side = (re) => {
      const group = ex.filter((trade) => re.test(trade.direction || ""));
      const groupWins = group.filter((trade) => pnlOf(trade) > 0).length;
      return {
        count: group.length,
        winRate: group.length ? (groupWins / group.length) * 100 : 0,
        pnl: group.reduce((sum, trade) => sum + pnlOf(trade), 0),
      };
    };

    const pnls = ex.map(pnlOf);
    return {
      total: ex.length,
      pending: unitTrades.length - ex.length,
      wins: wins.length,
      losses: losses.length,
      be,
      grossWin,
      grossLoss,
      net,
      avgWin,
      avgLoss,
      winRate: ex.length ? (wins.length / ex.length) * 100 : 0,
      profitFactor: grossLoss ? grossWin / grossLoss : grossWin ? Infinity : 0,
      payoff: avgLoss ? avgWin / avgLoss : avgWin ? Infinity : 0,
      expectancy: ex.length ? net / ex.length : 0,
      maxDD,
      maxW,
      maxL,
      best: pnls.length ? Math.max(...pnls) : 0,
      worst: pnls.length ? Math.min(...pnls) : 0,
      avgRR: ex.length ? ex.reduce((sum, trade) => sum + (Number(trade.rr) || 0), 0) / ex.length : 0,
      equity,
      daily,
      long: side(/^(long|buy)/i),
      short: side(/^(short|sell)/i),
    };
  }, [unitTrades]);

  const pairPnL = useMemo(() => {
    const map = {};
    unitTrades
      .filter((trade) => !isPending(trade))
      .forEach((trade) => {
        const key = trade.pair || "?";
        map[key] = (map[key] || 0) + (Number(trade.displayPnl) || 0);
      });
    return Object.entries(map)
      .map(([pair, pnl]) => ({ pair, pnl: Number(pnl.toFixed(2)) }))
      .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
      .slice(0, 8);
  }, [unitTrades]);

  const pageCount = Math.max(1, Math.ceil(filteredTrades.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageTrades = filteredTrades.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [selectedDate, period, filters, searchQuery, sortBy, pageSize]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => trades.some((trade) => trade.id === id)));
  }, [trades]);

  const activeFilterCount = countActiveFilters(filters);

  const fmt = (value, signed = false) => {
    if (privacy) return "••••";
    const n = Number(value) || 0;
    const sign = n < 0 ? "-" : signed && n > 0 ? "+" : "";
    const abs = Math.abs(n);
    if (displayMode === "percent") return `${sign}${abs.toFixed(2)}%`;
    if (displayMode === "r") return `${sign}${abs.toFixed(2)}R`;
    if (displayMode === "pips") return `${sign}${abs.toFixed(1)} pips`;
    if (displayMode === "points") return `${sign}${abs.toFixed(1)} pts`;
    if (displayMode === "ticks") return `${sign}${Math.round(abs)} ticks`;
    return `${sign}$${abs.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const fmtCompact = (value, signed = false) => {
    if (privacy) return "••••";
    const n = Number(value) || 0;
    if (displayMode === "dollar") return usdCell(n);
    return fmt(n, signed);
  };

  const unitLabel = DISPLAY_UNITS.find(([key]) => key === displayMode)?.[2] || "$";

  const copyNet = async () => {
    try {
      await navigator.clipboard.writeText(fmt(analytics.net, true));
      setCopied(true);
    } catch {
      // Clipboard can be blocked; leave the icon untouched.
    }
  };

  const lastImport = useMemo(() => {
    const stamps = trades
      .map((trade) => parseDate(trade.updatedAt) || parseDate(trade.createdAt) || tradeDateOf(trade))
      .filter(Boolean);
    if (!stamps.length) return null;
    return new Date(Math.max(...stamps.map((date) => date.getTime())));
  }, [trades]);

  const rangeLabel = useMemo(() => {
    const dates = filteredTrades.map(tradeDateOf).filter(Boolean).sort((a, b) => a - b);
    if (!dates.length) return "No trades in range";
    return `${format(dates[0], "MMM dd, yyyy")} – ${format(dates[dates.length - 1], "MMM dd, yyyy")}`;
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
      strategy: trade.strategy || "",
      playbookId: trade.playbookId || "",
      playbook: trade.playbook || "",
      rating: Number(trade.rating) || 0,
      mistakes: trade.mistakes || [],
      openDateTime: trade.openDateTime || "",
      closeDateTime: trade.closeDateTime || "",
    });
    setEditModalOpen(true);
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    if (!editingTrade) return;
    const playbookName =
      playbooks.find((playbook) => playbook.id === editForm.playbookId)?.name ||
      editingTrade.playbook ||
      editForm.playbook ||
      "";
    const payload = {
      ...editForm,
      playbook: playbookName,
      strategy: (editForm.strategy || "").trim() || playbookName,
    };

    if (PREVIEW) {
      setTrades((current) =>
        current.map((trade) => (trade.id === editingTrade.id ? { ...trade, ...payload } : trade))
      );
      setEditModalOpen(false);
      setEditingTrade(null);
      setMessage({ text: "Trade updated.", type: "success" });
      return;
    }

    if (!user || !currentAccount?.id) {
      setMessage({ text: "No account or user signed in.", type: "error" });
      return;
    }
    try {
      await updateDoc(
        doc(db, "users", user.uid, "accounts", currentAccount.id, "trades", editingTrade.id),
        { ...payload, updatedAt: serverTimestamp() }
      );
      setMessage({ text: "Trade updated.", type: "success" });
      setEditModalOpen(false);
      setEditingTrade(null);
      await refreshTrades();
    } catch (err) {
      console.error("Update error:", err);
      setMessage({ text: `Couldn't update the trade: ${err.message}`, type: "error" });
    }
  };

  const deleteTrade = async (id) => {
    setDeleteModalOpen(false);
    setTradeToDelete(null);

    if (PREVIEW) {
      setTrades((current) => current.filter((trade) => trade.id !== id));
      setSelectedTrade((current) => (current?.id === id ? null : current));
      setMessage({ text: "Trade deleted.", type: "success" });
      return;
    }
    if (!user || !currentAccount?.id) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "accounts", currentAccount.id, "trades", id));
      setSelectedTrade((current) => (current?.id === id ? null : current));
      setMessage({ text: "Trade deleted.", type: "success" });
      await refreshTrades();
    } catch (err) {
      console.error("Delete failed:", err);
      setMessage({ text: `Couldn't delete the trade: ${err.message}`, type: "error" });
    }
  };

  const deleteSelected = async () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`Delete ${selectedIds.length} selected trade${selectedIds.length === 1 ? "" : "s"}? This cannot be undone.`)) {
      return;
    }

    if (PREVIEW) {
      setTrades((current) => current.filter((trade) => !selectedIds.includes(trade.id)));
      setSelectedIds([]);
      setMessage({ text: "Selected trades deleted.", type: "success" });
      return;
    }
    if (!user || !currentAccount?.id) return;
    try {
      const batch = writeBatch(db);
      selectedIds.forEach((id) => {
        batch.delete(doc(db, "users", user.uid, "accounts", currentAccount.id, "trades", id));
      });
      await batch.commit();
      setSelectedIds([]);
      setMessage({ text: "Selected trades deleted.", type: "success" });
      await refreshTrades();
    } catch (err) {
      console.error("Bulk delete failed:", err);
      setMessage({ text: `Couldn't delete the selected trades: ${err.message}`, type: "error" });
    }
  };

  const toggleReviewed = async (trade) => {
    const next = !trade.reviewed;
    setTrades((current) => current.map((item) => (item.id === trade.id ? { ...item, reviewed: next } : item)));
    setSelectedTrade((current) => (current?.id === trade.id ? { ...current, reviewed: next } : current));

    if (PREVIEW) return;
    if (!user || !currentAccount?.id) return;
    try {
      await updateDoc(doc(db, "users", user.uid, "accounts", currentAccount.id, "trades", trade.id), {
        reviewed: next,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Review toggle failed:", err);
      setMessage({ text: "Couldn't save the review state.", type: "error" });
    }
  };

  const saveNote = async (text) => {
    const target = selectedTrade;
    if (!target?.id) return;
    setTrades((current) => current.map((item) => (item.id === target.id ? { ...item, notes: text } : item)));
    setSelectedTrade((current) => (current?.id === target.id ? { ...current, notes: text } : current));

    if (PREVIEW) {
      setMessage({ text: "Note saved.", type: "success" });
      return;
    }
    if (!user || !currentAccount?.id) return;
    try {
      await updateDoc(doc(db, "users", user.uid, "accounts", currentAccount.id, "trades", target.id), {
        notes: text,
        updatedAt: serverTimestamp(),
      });
      setMessage({ text: "Note saved.", type: "success" });
    } catch (err) {
      console.error("Note save failed:", err);
      setMessage({ text: "Couldn't save the note.", type: "error" });
    }
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
      "Playbook",
      "Strategy",
      "Confluences",
      "Rating",
      "Mistakes",
      "Notes",
    ];
    const rows = filteredTrades.map((trade) => [
      trade.openDateTime || "",
      trade.closeDateTime || "",
      trade.pair || "",
      trade.direction || "",
      trade.entry || "",
      trade.exit || "",
      trade.stopLoss || "",
      trade.takeProfit || "",
      trade.pnl || 0,
      trade.rr || "",
      trade.status || "executed",
      trade.playbook || "",
      trade.strategy || "",
      (trade.confluences || []).join("; "),
      Number(trade.rating) || "",
      (trade.mistakes || []).join("; "),
      `"${(trade.notes || "").replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `forgex-trades-${currentAccount?.name || "account"}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const migrateOldTrades = async () => {
    if (PREVIEW) {
      setMessage({ text: "Migration is disabled while previewing demo data.", type: "error" });
      return;
    }
    if (!user || !currentAccount?.id) {
      setMessage({ text: "No user or account selected.", type: "error" });
      return;
    }
    try {
      const oldTradesSnap = await getDocs(collection(db, "users", user.uid, "trades"));
      if (oldTradesSnap.empty) {
        setMessage({ text: "No legacy trades to move.", type: "error" });
        return;
      }
      const batch = writeBatch(db);
      oldTradesSnap.forEach((oldDoc) => {
        const newRef = doc(collection(db, "users", user.uid, "accounts", currentAccount.id, "trades"));
        batch.set(newRef, oldDoc.data());
        batch.delete(oldDoc.ref);
      });
      await batch.commit();
      setMessage({ text: `Moved ${oldTradesSnap.size} trades into ${currentAccount.name}.`, type: "success" });
      await refreshTrades();
    } catch (err) {
      console.error("Migration failed:", err);
      setMessage({ text: `Migration failed: ${err.message}`, type: "error" });
    }
  };

  const accountName = currentAccount?.name || "Demo account";

  // The tracking view walks the same order as the table, so prev/next stays
  // in sync with whatever the filters and sort currently show.
  const overlayList = useMemo(() => {
    if (!selectedTrade) return [];
    const inFiltered = filteredTrades.some((trade) => trade.id === selectedTrade.id);
    return inFiltered ? filteredTrades : trades;
  }, [filteredTrades, trades, selectedTrade]);
  const overlayIndex = selectedTrade
    ? overlayList.findIndex((trade) => trade.id === selectedTrade.id)
    : -1;
  const overlayPrev = overlayIndex > 0 ? overlayList[overlayIndex - 1] : null;
  const overlayNext =
    overlayIndex >= 0 && overlayIndex < overlayList.length - 1 ? overlayList[overlayIndex + 1] : null;

  if (!currentAccount && !PREVIEW) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6" style={{ backgroundColor: BG, color: TEXT }}>
        <div className="max-w-md rounded-xl border border-[#23232f] bg-[#13131b] p-8 text-center">
          <AlertCircle size={34} className="mx-auto mb-3" style={{ color: "#f59e0b" }} />
          <h2 className="mb-1.5 text-lg font-semibold">No account selected</h2>
          <p className="mb-4 text-[12.5px] leading-relaxed" style={{ color: MUTED }}>
            Pick a trading account first, then its trades will show up here.
          </p>
          <button type="button" onClick={() => navigate("/add-trade")} className={PRIMARY}>
            <Wallet size={14} /> Choose an account
          </button>
        </div>
      </div>
    );
  }

  const pfText = analytics.profitFactor === Infinity ? "∞" : analytics.profitFactor.toFixed(2);
  const payoffText = analytics.payoff === Infinity ? "∞" : analytics.payoff.toFixed(2);
  const dailyKeys = Object.keys(analytics.daily).sort().slice(-30);
  const allPageSelected = pageTrades.length > 0 && pageTrades.every((trade) => selectedIds.includes(trade.id));

  return (
    <div className="-m-1 min-h-screen sm:-m-3" style={{ backgroundColor: BG, color: TEXT }}>
      <div className="mx-auto max-w-[1600px] p-3 sm:p-5">
        {/* Header + toolbar */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight sm:text-[24px]">Trades</h1>
            <p className="mt-1 text-[12px]" style={{ color: MUTED }}>
              {accountName} · {trades.length} logged · {analytics.total} closed
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Dropdown
              label={unitLabel}
              width="w-64"
              items={[
                ...DISPLAY_UNITS.map(([key, label, , Icon, description]) => ({
                  label,
                  icon: Icon,
                  description,
                  active: displayMode === key,
                  accent,
                  onClick: () => setDisplayMode(key),
                })),
                { divider: "privacy" },
                {
                  label: "Privacy",
                  icon: Lock,
                  description: "Hide P&L figures while sharing your screen.",
                  active: privacy,
                  accent,
                  onClick: () => setPrivacy((value) => !value),
                },
              ]}
            />

            <div className="relative" ref={filterRef}>
              <button
                type="button"
                onClick={() => {
                  setDraftFilters(filters);
                  setFilterOpen((value) => !value);
                }}
                aria-haspopup="dialog"
                aria-expanded={filterOpen}
                className={TOOLBAR_BTN}
              >
                <Filter size={14} />
                <span>Filters</span>
                {activeFilterCount ? (
                  <span className="rounded bg-[#6C47FF] px-1.5 text-[9px] font-bold leading-4 text-white">
                    {activeFilterCount}
                  </span>
                ) : (
                  <ChevronDown size={12} className="opacity-60" />
                )}
              </button>
              {filterOpen ? (
                <FilterPanel
                  draft={draftFilters}
                  setDraft={setDraftFilters}
                  symbols={symbols}
                  tags={tags}
                  books={bookNames}
                  playbooks={playbooks.map((book) => book.name).filter(Boolean)}
                  panelRef={filterRef}
                  onReset={() => setDraftFilters(EMPTY_FILTERS)}
                  onCancel={() => {
                    setDraftFilters(filters);
                    setFilterOpen(false);
                  }}
                  onApply={() => {
                    setFilters(draftFilters);
                    setFilterOpen(false);
                  }}
                />
              ) : null}
            </div>

            <Dropdown
              label={PERIODS.find(([key]) => key === period)?.[1] || "All time"}
              icon={CalendarDays}
              width="w-48"
              items={PERIODS.map(([key, label]) => ({
                label,
                active: period === key,
                accent,
                onClick: () => setPeriod(key),
              }))}
            />

            <button
              type="button"
              onClick={() => navigate("/add-trade")}
              className={TOOLBAR_BTN}
              title="Switch trading account"
            >
              <Wallet size={14} />
              <span className="max-w-[140px] truncate">{accountName}</span>
              <ChevronDown size={12} className="opacity-60" />
            </button>

            <Dropdown
              label="More actions"
              icon={MoreHorizontal}
              iconOnly
              width="w-52"
              items={[
                { label: "Import trades from CSV", icon: Upload, onClick: () => setCsvModalOpen(true) },
                { label: "Export filtered trades", icon: Download, onClick: exportCSV },
                { divider: "legacy" },
                { label: "Move legacy trades here", icon: RotateCcw, onClick: migrateOldTrades },
              ]}
            />

            <button type="button" onClick={() => navigate("/add-trade")} className={PRIMARY}>
              <PlusCircle size={15} /> Add trade
            </button>
          </div>
        </div>

        {/* Import line */}
        <div className="mb-4 mt-2 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: MUTED }}>
          <span>
            Last import:{" "}
            <span style={{ color: "#b9b9cc" }}>
              {lastImport ? format(lastImport, "MMM d, yyyy hh:mm a") : "no trades yet"}
            </span>
          </span>
          <button
            type="button"
            onClick={refreshTrades}
            disabled={loading}
            className={`font-semibold text-[#b7a6ff] transition-opacity hover:underline disabled:opacity-50 ${FOCUS}`}
          >
            {loading ? "Resyncing…" : "Resync"}
          </button>
          <span className="hidden sm:inline" style={{ color: FAINT }}>
            · {rangeLabel}
          </span>
          {selectedDate ? (
            <button
              type="button"
              onClick={() => setSearchParams({})}
              className={`flex items-center gap-1 rounded-md border border-[#3a2d6b] bg-[#1b1436] px-2 py-0.5 text-[10px] font-semibold text-[#cbbcff] ${FOCUS}`}
            >
              Showing {selectedDate} <X size={10} />
            </button>
          ) : null}
          {activeFilterCount ? (
            <button
              type="button"
              onClick={() => {
                setFilters(EMPTY_FILTERS);
                setDraftFilters(EMPTY_FILTERS);
              }}
              className={`flex items-center gap-1 rounded-md border border-[#3a2d6b] bg-[#1b1436] px-2 py-0.5 text-[10px] font-semibold text-[#cbbcff] ${FOCUS}`}
            >
              {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"} <X size={10} />
            </button>
          ) : null}
        </div>

        {error ? (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-[#f2556e]/40 bg-[#f2556e]/10 px-3 py-2 text-[12px]">
            <span className="flex items-center gap-2" style={{ color: "#ff9bad" }}>
              <AlertCircle size={14} /> {error}
            </span>
            <button type="button" onClick={refreshTrades} className={`font-semibold text-white hover:underline ${FOCUS}`}>
              Retry
            </button>
          </div>
        ) : null}

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-xl border border-[#23232f] bg-[#13131b] px-4 py-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11.5px] font-medium" style={{ color: MUTED }}>
                Net P&amp;L
              </span>
              <button
                type="button"
                onClick={copyNet}
                aria-label="Copy net P&L"
                className={`flex h-6 w-6 items-center justify-center rounded-md border border-[#2f2560] bg-[#1a1433] text-[#a78bfa] transition-colors hover:brightness-125 ${FOCUS}`}
              >
                {copied ? <Check size={11} /> : <Copy size={11} />}
              </button>
            </div>
            <div
              className="mt-1.5 text-[24px] font-bold leading-none tabular-nums"
              style={{ color: analytics.net > 0 ? POS : analytics.net < 0 ? NEG : TEXT }}
            >
              {fmt(analytics.net, true)}
            </div>
            <div className="mt-1.5 text-[10.5px]" style={{ color: FAINT }}>
              {analytics.total} closed{analytics.pending ? ` · ${analytics.pending} open` : ""}
            </div>
          </div>

          <div className="rounded-xl border border-[#23232f] bg-[#13131b] px-4 py-3.5">
            <div className="text-[11.5px] font-medium" style={{ color: MUTED }}>
              Win rate
            </div>
            <div className="mt-1.5 text-[24px] font-bold leading-none tabular-nums">
              {analytics.winRate.toFixed(1)}%
            </div>
            <div className="mt-1.5 text-[10.5px]" style={{ color: FAINT }}>
              {analytics.wins}W · {analytics.be}BE · {analytics.losses}L
            </div>
          </div>

          <div className="rounded-xl border border-[#23232f] bg-[#13131b] px-4 py-3.5">
            <div className="text-[11.5px] font-medium" style={{ color: MUTED }}>
              Profit factor
            </div>
            <div className="mt-1.5 text-[24px] font-bold leading-none tabular-nums">{pfText}</div>
            <div className="mt-1.5 text-[10.5px]" style={{ color: FAINT }}>
              {fmt(analytics.grossWin)} / {fmt(analytics.grossLoss)}
            </div>
          </div>

          <div className="rounded-xl border border-[#23232f] bg-[#13131b] px-4 py-3.5">
            <div className="text-[11.5px] font-medium" style={{ color: MUTED }}>
              Avg win / loss
            </div>
            <div className="mt-1.5 text-[24px] font-bold leading-none tabular-nums">{payoffText}</div>
            <div className="mt-1.5 text-[10.5px]" style={{ color: FAINT }}>
              {fmt(analytics.avgWin)} / {fmt(analytics.avgLoss)}
            </div>
          </div>

          <div className="rounded-xl border border-[#23232f] bg-[#13131b] px-4 py-3.5">
            <div className="text-[11.5px] font-medium" style={{ color: MUTED }}>
              Expectancy
            </div>
            <div
              className="mt-1.5 text-[24px] font-bold leading-none tabular-nums"
              style={{ color: analytics.expectancy > 0 ? POS : analytics.expectancy < 0 ? NEG : TEXT }}
            >
              {fmt(analytics.expectancy, true)}
            </div>
            <div className="mt-1.5 text-[10.5px]" style={{ color: FAINT }}>
              per closed trade
            </div>
          </div>

          <div className="rounded-xl border border-[#23232f] bg-[#13131b] px-4 py-3.5">
            <div className="text-[11.5px] font-medium" style={{ color: MUTED }}>
              Max drawdown
            </div>
            <div
              className="mt-1.5 text-[24px] font-bold leading-none tabular-nums"
              style={{ color: analytics.maxDD ? NEG : TEXT }}
            >
              {analytics.maxDD ? fmt(-analytics.maxDD) : fmt(0)}
            </div>
            <div className="mt-1.5 text-[10.5px]" style={{ color: FAINT }}>
              peak to trough
            </div>
          </div>
        </div>

        {/* View tabs */}
        <div className="mt-4 flex items-center gap-1 border-b border-[#1f1f2b]">
          {[
            ["log", "Trade log", filteredTrades.length],
            ["analytics", "Analytics", null],
            ["calendar", "Calendar", null],
          ].map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[12px] font-medium transition-colors ${FOCUS} ${
                view === key
                  ? "border-[#6C47FF] text-white"
                  : "border-transparent text-[#8b8ba3] hover:text-[#d4d6e6]"
              }`}
            >
              {label}
              {count != null ? (
                <span className="rounded bg-[#1d1d2c] px-1.5 py-0.5 text-[9.5px] font-semibold text-[#9a9ab2]">
                  {count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {view === "log" ? (
          <section className="mt-3 overflow-hidden rounded-xl border border-[#23232f] bg-[#13131b]">
            {/* Table toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1f1f2b] px-3 py-2.5">
              <div className="flex items-center gap-2">
                <h2 className="text-[13px] font-semibold">Trade log</h2>
                <span className="text-[11px]" style={{ color: MUTED }}>
                  {filteredTrades.length} trade{filteredTrades.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex items-center gap-1.5 rounded-lg border border-[#23232f] bg-[#0f0f18] px-2.5 py-1.5">
                  <Search size={13} style={{ color: MUTED }} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search symbol, notes, tags…"
                    aria-label="Search trades"
                    className="w-40 bg-transparent text-[11.5px] text-[#e9e9f2] outline-none placeholder:text-[#5d6078] sm:w-52"
                  />
                  {searchQuery ? (
                    <button type="button" onClick={() => setSearchQuery("")} aria-label="Clear search" className={FOCUS}>
                      <X size={12} style={{ color: MUTED }} />
                    </button>
                  ) : null}
                </div>

                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                  aria-label="Sort trades"
                  className="h-8 rounded-lg border border-[#23232f] bg-[#0f0f18] px-2 text-[11.5px] text-[#c7c7d6] outline-none focus:border-[#6C47FF]"
                >
                  {SORT_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value} className="bg-[#12121b]">
                      {label}
                    </option>
                  ))}
                </select>

                <button type="button" onClick={() => setCsvModalOpen(true)} className={`${GHOST} !h-8 !px-2`}>
                  <Upload size={13} /> <span className="hidden sm:inline">Import</span>
                </button>
                <button
                  type="button"
                  onClick={exportCSV}
                  disabled={!filteredTrades.length}
                  className={`${GHOST} !h-8 !px-2 disabled:opacity-50`}
                >
                  <Download size={13} /> <span className="hidden sm:inline">Export</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] border-collapse">
                <thead>
                  <tr className="border-b border-[#1f1f2b] bg-[#111119]">
                    <th scope="col" className="w-9 px-3 py-2.5">
                      <input
                        type="checkbox"
                        aria-label="Select all trades on this page"
                        checked={allPageSelected}
                        onChange={(event) =>
                          setSelectedIds((current) => {
                            const ids = pageTrades.map((trade) => trade.id);
                            if (event.target.checked) return [...new Set([...current, ...ids])];
                            return current.filter((id) => !ids.includes(id));
                          })
                        }
                        className="h-3.5 w-3.5 cursor-pointer rounded border-[#33334a] bg-transparent accent-[#6C47FF]"
                      />
                    </th>
                    <th scope="col" className={TH}>Date</th>
                    <th scope="col" className={TH}>Symbol</th>
                    <th scope="col" className={TH}>Side</th>
                    <th scope="col" className={`${TH} text-right`}>Entry</th>
                    <th scope="col" className={`${TH} text-right`}>Exit</th>
                    <th scope="col" className={`${TH} text-right`}>Lots</th>
                    <th scope="col" className={`${TH} text-right`}>R</th>
                    <th scope="col" className={`${TH} text-right`}>Net P&amp;L</th>
                    <th scope="col" className={TH}>Rating</th>
                    <th scope="col" className={`${TH} hidden 2xl:table-cell`}>Playbook</th>
                    <th scope="col" className={`${TH} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 8 }).map((_, index) => (
                      <tr key={`skeleton-${index}`} className="border-b border-[#191922]">
                        {Array.from({ length: 12 }).map((__, cell) => (
                          <td key={cell} className="px-3 py-3">
                            <div
                              className="h-2.5 animate-pulse rounded bg-[#1c1c28]"
                              style={{ width: cell === 1 ? "70%" : "50%" }}
                            />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filteredTrades.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-16">
                        <div className="flex flex-col items-center text-center">
                          <span
                            className="mb-3 flex h-11 w-11 items-center justify-center rounded-full"
                            style={{ backgroundColor: "rgba(108,71,255,0.14)", color: accent }}
                          >
                            <Search size={19} />
                          </span>
                          <p className="text-[14px] font-semibold text-white">
                            {trades.length ? "No trades match these filters" : "No trades logged yet"}
                          </p>
                          <p className="mt-1 max-w-[380px] text-[12px] leading-relaxed" style={{ color: MUTED }}>
                            {trades.length
                              ? "Loosen a filter or clear them all to see the rest of the account."
                              : `Start the history for ${accountName} with a manual entry or a CSV import.`}
                          </p>
                          <div className="mt-4 flex flex-wrap justify-center gap-2">
                            {trades.length ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setFilters(EMPTY_FILTERS);
                                  setDraftFilters(EMPTY_FILTERS);
                                  setSearchQuery("");
                                  setPeriod("all");
                                  setSearchParams({});
                                }}
                                className={GHOST}
                              >
                                <RotateCcw size={13} /> Clear filters
                              </button>
                            ) : (
                              <>
                                <button type="button" onClick={() => navigate("/add-trade")} className={PRIMARY}>
                                  <PlusCircle size={14} /> Add a trade
                                </button>
                                <button type="button" onClick={() => setCsvModalOpen(true)} className={GHOST}>
                                  <Upload size={13} /> Import CSV
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pageTrades.map((trade) => {
                      const pending = isPending(trade);
                      const displayPnl = Number(unitValue(trade, displayMode, startingBalance).toFixed(4));
                      const date = tradeDateOf(trade);
                      const checked = selectedIds.includes(trade.id);
                      return (
                        <tr
                          key={trade.id}
                          onClick={() => setSelectedTrade(trade)}
                          className={`cursor-pointer border-b border-[#191922] transition-colors hover:bg-[#16161f] ${
                            checked ? "bg-[#141426]" : ""
                          }`}
                        >
                          <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              aria-label={`Select ${trade.pair || "trade"} from ${date ? format(date, "MMM d, yyyy") : "unknown date"}`}
                              checked={checked}
                              onChange={(event) =>
                                setSelectedIds((current) =>
                                  event.target.checked
                                    ? [...new Set([...current, trade.id])]
                                    : current.filter((id) => id !== trade.id)
                                )
                              }
                              className="h-3.5 w-3.5 cursor-pointer rounded border-[#33334a] bg-transparent accent-[#6C47FF]"
                            />
                          </td>
                          <td className={TD}>
                            <div className="text-[11.5px] text-[#d4d6e6]">
                              {date ? format(date, "MMM d, yyyy") : "—"}
                            </div>
                            <div className="text-[10px]" style={{ color: FAINT }}>
                              {date ? format(date, "HH:mm") : ""}
                              {pending ? " · open" : ""}
                            </div>
                          </td>
                          <td className={TD}>
                            <div className="flex items-center gap-2">
                              <span
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[9px] font-bold"
                                style={{
                                  backgroundColor: pending
                                    ? "rgba(245,158,11,0.14)"
                                    : displayPnl >= 0
                                    ? "rgba(34,196,147,0.14)"
                                    : "rgba(242,85,110,0.14)",
                                  color: pending ? "#fbbf24" : displayPnl >= 0 ? POS : NEG,
                                }}
                                aria-hidden="true"
                              >
                                {(trade.pair || "?").slice(0, 2)}
                              </span>
                              <span className="text-[12px] font-semibold text-[#e9e9f2]">{trade.pair || "—"}</span>
                            </div>
                          </td>
                          <td className={TD}>
                            <SidePill trade={trade} />
                          </td>
                          <td className={`${TD} text-right tabular-nums`}>{trade.entry || "—"}</td>
                          <td className={`${TD} text-right tabular-nums`}>{pending ? "—" : trade.exit || "—"}</td>
                          <td className={`${TD} text-right tabular-nums`}>{trade.lotSize || "—"}</td>
                          <td className={`${TD} text-right tabular-nums`}>
                            {trade.rr != null && trade.rr !== "" ? Number(trade.rr).toFixed(2) : "—"}
                          </td>
                          <td
                            className={`${TD} text-right font-semibold tabular-nums`}
                            style={{ color: pending ? MUTED : displayPnl > 0 ? POS : displayPnl < 0 ? NEG : TEXT }}
                          >
                            {pending ? "Open" : fmt(displayPnl, true)}
                          </td>
                          <td className={TD}>
                            {Number(trade.rating) > 0 ? (
                              <StarRating value={Number(trade.rating)} accent={accent} readOnly size={11} />
                            ) : (
                              <span className="text-[10px]" style={{ color: FAINT }}>
                                —
                              </span>
                            )}
                          </td>
                          <td className={`${TD} hidden max-w-[150px] 2xl:table-cell`}>
                            <span className="block truncate text-[11.5px]" style={{ color: "#b9b9cc" }}>
                              {trade.playbook || trade.strategy || "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                            <div className="flex items-center justify-end gap-0.5">
                              <button
                                type="button"
                                onClick={() => setSelectedTrade(trade)}
                                aria-label={`View ${trade.pair || "trade"}`}
                                className={`${ICON_BTN} !h-7 !w-7 !border-transparent !bg-transparent`}
                              >
                                <Eye size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => openEdit(trade)}
                                aria-label={`Edit ${trade.pair || "trade"}`}
                                className={`${ICON_BTN} !h-7 !w-7 !border-transparent !bg-transparent`}
                              >
                                <Edit size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setTradeToDelete(trade);
                                  setDeleteModalOpen(true);
                                }}
                                aria-label={`Delete ${trade.pair || "trade"}`}
                                className={`${ICON_BTN} !h-7 !w-7 !border-transparent !bg-transparent hover:!text-[#ff8ba0]`}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1f1f2b] px-3 py-2.5">
              <div className="flex items-center gap-3 text-[11px]" style={{ color: MUTED }}>
                <span>
                  {filteredTrades.length
                    ? `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, filteredTrades.length)} of ${filteredTrades.length}`
                    : "0 trades"}
                </span>
                {selectedIds.length ? (
                  <button
                    type="button"
                    onClick={deleteSelected}
                    className={`flex items-center gap-1 font-semibold text-[#ff8ba0] hover:underline ${FOCUS}`}
                  >
                    <Trash2 size={11} /> Delete {selectedIds.length} selected
                  </button>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  aria-label="Rows per page"
                  className="h-7 rounded-md border border-[#23232f] bg-[#0f0f18] px-1.5 text-[11px] text-[#c7c7d6] outline-none focus:border-[#6C47FF]"
                >
                  {[10, 25, 50, 100].map((size) => (
                    <option key={size} value={size} className="bg-[#12121b]">
                      {size} / page
                    </option>
                  ))}
                </select>
                <span className="text-[11px]" style={{ color: MUTED }}>
                  Page {safePage} of {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={safePage === 1}
                  aria-label="Previous page"
                  className={`${ICON_BTN} !h-7 !w-7 disabled:opacity-40`}
                >
                  <ChevronLeft size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                  disabled={safePage === pageCount}
                  aria-label="Next page"
                  className={`${ICON_BTN} !h-7 !w-7 disabled:opacity-40`}
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {view === "analytics" ? (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <Panel
                className="lg:col-span-2"
                title="Equity curve"
                action={<TrendingUp size={15} style={{ color: accent }} />}
              >
                {analytics.equity.length ? (
                  <div className="relative h-64">
                    <Line
                      data={{
                        labels: analytics.equity.map((point) => point.label),
                        datasets: [
                          {
                            data: analytics.equity.map((point) => point.value),
                            borderColor: accent,
                            backgroundColor: hexA(accent, 0.12),
                            fill: true,
                            tension: 0.3,
                            borderWidth: 2,
                            pointRadius: analytics.equity.length > 40 ? 0 : 3,
                            pointHoverRadius: 5,
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: "index", intersect: false },
                        plugins: {
                          legend: { display: false },
                          tooltip: { callbacks: { label: (ctx) => ` ${fmt(ctx.parsed.y, true)}` } },
                        },
                        scales: {
                          x: { grid: { display: false }, ticks: { color: CHART_TICK, maxTicksLimit: 8 } },
                          y: { grid: { color: CHART_GRID }, ticks: { color: CHART_TICK, callback: (v) => fmt(v) } },
                        },
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex h-64 items-center justify-center text-[12px]" style={{ color: MUTED }}>
                    Close a trade to start the equity curve
                  </div>
                )}
              </Panel>

              <Panel title="Win / loss breakdown">
                <div className="flex items-center gap-5">
                  <div className="relative">
                    <Donut wins={analytics.wins} losses={analytics.losses} be={analytics.be} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="text-[20px] font-semibold tabular-nums">{analytics.winRate.toFixed(0)}%</div>
                      <div className="text-[9px] uppercase tracking-wider" style={{ color: MUTED }}>
                        win rate
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 space-y-2 text-[12px]">
                    <div className="flex justify-between">
                      <span style={{ color: MUTED }}>Wins</span>
                      <span style={{ color: POS }}>{analytics.wins}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: MUTED }}>Break-even</span>
                      <span>{analytics.be}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: MUTED }}>Losses</span>
                      <span style={{ color: NEG }}>{analytics.losses}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  {[
                    ["Long", analytics.long],
                    ["Short", analytics.short],
                  ].map(([name, data]) => (
                    <div key={name} className="rounded-lg border border-[#23232f] bg-[#0f0f18] p-3">
                      <div className="text-[10.5px] font-medium" style={{ color: MUTED }}>
                        {name}
                      </div>
                      <div
                        className="mt-1 text-[14px] font-bold tabular-nums"
                        style={{ color: data.pnl > 0 ? POS : data.pnl < 0 ? NEG : TEXT }}
                      >
                        {fmt(data.pnl, true)}
                      </div>
                      <div className="text-[10px]" style={{ color: FAINT }}>
                        {data.count} trades · {data.winRate.toFixed(0)}% win
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Panel title="Daily net P&L (last 30 days)">
                <div className="relative h-56">
                  <Bar
                    data={{
                      labels: dailyKeys.map((key) => key.slice(5)),
                      datasets: [
                        {
                          data: dailyKeys.map((key) => Number(analytics.daily[key].pnl.toFixed(2))),
                          backgroundColor: dailyKeys.map((key) => (analytics.daily[key].pnl >= 0 ? POS : NEG)),
                          borderRadius: 4,
                          maxBarThickness: 18,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: (ctx) => ` ${fmt(ctx.parsed.y, true)}` } },
                      },
                      scales: {
                        x: { grid: { display: false }, ticks: { color: CHART_TICK, maxTicksLimit: 10 } },
                        y: { grid: { color: CHART_GRID }, ticks: { color: CHART_TICK, callback: (v) => fmt(v) } },
                      },
                    }}
                  />
                </div>
              </Panel>

              <Panel title="P&L by symbol" action={<BarChart3 size={15} style={{ color: accent }} />}>
                {pairPnL.length ? (
                  <div className="relative" style={{ height: Math.max(224, pairPnL.length * 32 + 32) }}>
                    <Bar
                      data={{
                        labels: pairPnL.map((item) => item.pair),
                        datasets: [
                          {
                            data: pairPnL.map((item) => item.pnl),
                            backgroundColor: pairPnL.map((item) => (item.pnl >= 0 ? POS : NEG)),
                            borderRadius: 4,
                            maxBarThickness: 18,
                          },
                        ],
                      }}
                      options={{
                        indexAxis: "y",
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { display: false },
                          tooltip: { callbacks: { label: (ctx) => ` ${fmt(ctx.parsed.x, true)}` } },
                        },
                        scales: {
                          x: { grid: { color: CHART_GRID }, ticks: { color: CHART_TICK, maxTicksLimit: 6, callback: (v) => fmt(v) } },
                          y: { grid: { display: false }, ticks: { color: CHART_TICK } },
                        },
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex h-56 items-center justify-center text-[12px]" style={{ color: MUTED }}>
                    No closed trades in this range
                  </div>
                )}
              </Panel>
            </div>

            <Panel title="Trade statistics">
              <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                <div>
                  <StatRow label="Gross profit" value={fmt(analytics.grossWin)} tone={POS} />
                  <StatRow label="Gross loss" value={fmt(-analytics.grossLoss)} tone={analytics.grossLoss ? NEG : undefined} />
                  <StatRow label="Average win" value={fmt(analytics.avgWin)} tone={POS} />
                  <StatRow label="Average loss" value={fmt(-analytics.avgLoss)} tone={analytics.avgLoss ? NEG : undefined} />
                  <StatRow label="Best trade" value={fmt(analytics.best, true)} tone={analytics.best > 0 ? POS : undefined} />
                </div>
                <div>
                  <StatRow label="Worst trade" value={fmt(analytics.worst, true)} tone={analytics.worst < 0 ? NEG : undefined} />
                  <StatRow label="Average R:R" value={analytics.avgRR.toFixed(2)} />
                  <StatRow label="Max win streak" value={analytics.maxW} />
                  <StatRow label="Max loss streak" value={analytics.maxL} />
                  <StatRow label="Open positions" value={analytics.pending} />
                </div>
              </div>
            </Panel>
          </div>
        ) : null}

        {view === "calendar" ? (
          <div className="mt-3">
            <PnLCalendar
              month={calMonth}
              onMonth={setCalMonth}
              daily={analytics.daily}
              selected={selectedDate}
              fmtCompact={fmtCompact}
              onPick={(day) => setSearchParams({ date: day })}
            />
          </div>
        ) : null}

        {/* Toast */}
        {message.text ? (
          <div
            role={message.type === "error" ? "alert" : "status"}
            className="fixed bottom-5 right-5 z-[1100] flex max-w-[360px] items-start gap-2 rounded-lg border px-3.5 py-2.5 text-[12.5px] shadow-xl shadow-black/50"
            style={{
              backgroundColor: "#15151f",
              borderColor: message.type === "error" ? "rgba(242,85,110,0.45)" : "rgba(34,196,147,0.45)",
              color: message.type === "error" ? NEG : POS,
            }}
          >
            {message.type === "error" ? <AlertCircle size={14} className="mt-0.5 shrink-0" /> : <Check size={14} className="mt-0.5 shrink-0" />}
            <span className="flex-1">{message.text}</span>
            <button type="button" onClick={() => setMessage({ text: "", type: "success" })} aria-label="Dismiss" className={FOCUS}>
              <X size={13} />
            </button>
          </div>
        ) : null}

        {/* Tracking view */}
        {selectedTrade
          ? createPortal(
              <TrackingOverlay
            trade={selectedTrade}
            accountName={accountName}
            startingBalance={startingBalance}
            accent={accent}
            canPrev={Boolean(overlayPrev)}
            canNext={Boolean(overlayNext)}
            onPrev={() => overlayPrev && setSelectedTrade(overlayPrev)}
            onNext={() => overlayNext && setSelectedTrade(overlayNext)}
            onClose={() => setSelectedTrade(null)}
            onEdit={() => {
              const trade = selectedTrade;
              setSelectedTrade(null);
              openEdit(trade);
            }}
            onToggleReviewed={() => toggleReviewed(selectedTrade)}
            onSaveNote={saveNote}
            onDelete={() => {
              const trade = selectedTrade;
              setSelectedTrade(null);
              setTradeToDelete(trade);
              setDeleteModalOpen(true);
            }}
            onOpenJournal={(day) => navigate(day ? `/journal?date=${format(day, "yyyy-MM-dd")}` : "/journal")}
              />,
              document.body
            )
          : null}

        {/* Edit modal */}
        {editModalOpen && editingTrade ? (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-4">
            <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-[#262633] bg-[#12121b] text-[#e9e9f2] shadow-2xl shadow-black/70">
              <div className="flex items-center justify-between border-b border-[#1f1f2b] px-4 py-3">
                <div>
                  <h2 className="text-[14px] font-semibold">Edit trade</h2>
                  <p className="text-[10.5px]" style={{ color: MUTED }}>
                    {editingTrade.pair || "Trade"} · changes save to this account
                  </p>
                </div>
                <button type="button" onClick={() => setEditModalOpen(false)} aria-label="Close" className={ICON_BTN}>
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={saveEdit} className="max-h-[80vh] space-y-4 overflow-y-auto p-4 sm:p-5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className={LABEL} htmlFor="edit-pair">Symbol</label>
                    <input
                      id="edit-pair"
                      value={editForm.pair}
                      onChange={(event) => setEditForm({ ...editForm, pair: event.target.value })}
                      className={FIELD}
                    />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="edit-direction">Side</label>
                    <select
                      id="edit-direction"
                      value={editForm.direction}
                      onChange={(event) => setEditForm({ ...editForm, direction: event.target.value })}
                      className={FIELD}
                    >
                      <option value="Long" className="bg-[#12121b]">Long</option>
                      <option value="Short" className="bg-[#12121b]">Short</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className={LABEL} htmlFor="edit-open">Open date / time</label>
                    <input
                      id="edit-open"
                      type="datetime-local"
                      value={editForm.openDateTime}
                      onChange={(event) => setEditForm({ ...editForm, openDateTime: event.target.value })}
                      className={FIELD}
                    />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="edit-close">Close date / time</label>
                    <input
                      id="edit-close"
                      type="datetime-local"
                      value={editForm.closeDateTime}
                      onChange={(event) => setEditForm({ ...editForm, closeDateTime: event.target.value })}
                      disabled={editForm.status === "pending"}
                      className={`${FIELD} disabled:cursor-not-allowed disabled:opacity-50`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div>
                    <label className={LABEL} htmlFor="edit-entry">Entry</label>
                    <input
                      id="edit-entry"
                      type="number"
                      step="0.00001"
                      value={editForm.entry}
                      onChange={(event) => setEditForm({ ...editForm, entry: event.target.value })}
                      className={FIELD}
                    />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="edit-exit">Exit</label>
                    <input
                      id="edit-exit"
                      type="number"
                      step="0.00001"
                      value={editForm.exit}
                      onChange={(event) => setEditForm({ ...editForm, exit: event.target.value })}
                      disabled={editForm.status === "pending"}
                      className={`${FIELD} disabled:cursor-not-allowed disabled:opacity-50`}
                    />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="edit-pnl">Net P&amp;L</label>
                    <input
                      id="edit-pnl"
                      type="number"
                      step="0.01"
                      value={editForm.pnl}
                      onChange={(event) => setEditForm({ ...editForm, pnl: event.target.value })}
                      disabled={editForm.status === "pending"}
                      className={`${FIELD} disabled:cursor-not-allowed disabled:opacity-50`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div>
                    <label className={LABEL} htmlFor="edit-stop">Stop loss</label>
                    <input
                      id="edit-stop"
                      type="number"
                      step="0.00001"
                      value={editForm.stopLoss}
                      onChange={(event) => setEditForm({ ...editForm, stopLoss: event.target.value })}
                      className={FIELD}
                    />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="edit-target">Take profit</label>
                    <input
                      id="edit-target"
                      type="number"
                      step="0.00001"
                      value={editForm.takeProfit}
                      onChange={(event) => setEditForm({ ...editForm, takeProfit: event.target.value })}
                      className={FIELD}
                    />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="edit-rr">R:R</label>
                    <input
                      id="edit-rr"
                      type="number"
                      step="0.1"
                      value={editForm.rr}
                      onChange={(event) => setEditForm({ ...editForm, rr: event.target.value })}
                      disabled={editForm.status === "pending"}
                      className={`${FIELD} disabled:cursor-not-allowed disabled:opacity-50`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className={LABEL} htmlFor="edit-status">Status</label>
                    <select
                      id="edit-status"
                      value={editForm.status}
                      onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}
                      className={FIELD}
                    >
                      <option value="executed" className="bg-[#12121b]">Executed</option>
                      <option value="pending" className="bg-[#12121b]">Pending / open</option>
                    </select>
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="edit-playbook">Playbook</label>
                    <select
                      id="edit-playbook"
                      value={editForm.playbookId || ""}
                      onChange={(event) => setEditForm({ ...editForm, playbookId: event.target.value })}
                      className={FIELD}
                    >
                      <option value="" className="bg-[#12121b]">No playbook</option>
                      {playbooks.map((playbook) => (
                        <option key={playbook.id} value={playbook.id} className="bg-[#12121b]">
                          {playbook.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className={LABEL} htmlFor="edit-strategy">Strategy / setup</label>
                  <input
                    id="edit-strategy"
                    type="text"
                    value={editForm.strategy || ""}
                    onChange={(event) => setEditForm({ ...editForm, strategy: event.target.value })}
                    placeholder="e.g. London breakout"
                    list="forge-strategies-edit"
                    className={FIELD}
                  />
                  <datalist id="forge-strategies-edit">
                    <option value="London breakout" />
                    <option value="Asian range breakout" />
                    <option value="Liquidity sweep" />
                    <option value="Trend continuation" />
                    <option value="Support/Resistance reversal" />
                    <option value="News" />
                  </datalist>
                </div>

                <div>
                  <span className={LABEL}>Confluences</span>
                  <ConfluenceTags
                    tags={editForm.confluences}
                    accent={accent}
                    onChange={(next) => setEditForm({ ...editForm, confluences: next })}
                  />
                </div>

                <div>
                  <span className={LABEL}>Trade rating</span>
                  <StarRating
                    value={Number(editForm.rating) || 0}
                    onChange={(value) => setEditForm({ ...editForm, rating: value })}
                    accent={accent}
                    size={20}
                  />
                </div>

                <div>
                  <span className={LABEL}>Mistakes</span>
                  <MistakePicker
                    value={editForm.mistakes || []}
                    onChange={(next) => setEditForm({ ...editForm, mistakes: next })}
                    accent={accent}
                  />
                </div>

                <div>
                  <label className={LABEL} htmlFor="edit-screenshot">Chart snapshot URL</label>
                  <input
                    id="edit-screenshot"
                    type="url"
                    value={editForm.screenshotUrl}
                    onChange={(event) => setEditForm({ ...editForm, screenshotUrl: event.target.value })}
                    placeholder="https://example.com/chart.png"
                    className={FIELD}
                  />
                </div>

                <div>
                  <label className={LABEL} htmlFor="edit-notes">Trade note</label>
                  <textarea
                    id="edit-notes"
                    value={editForm.notes}
                    onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })}
                    className={`${FIELD} min-h-[88px] resize-y py-2.5`}
                    placeholder="What did you see, and what would you repeat?"
                  />
                </div>

                <div className="flex gap-2.5 border-t border-[#1f1f2b] pt-4">
                  <button type="submit" className={`${PRIMARY} flex-1`}>
                    Save changes
                  </button>
                  <button type="button" onClick={() => setEditModalOpen(false)} className={`${GHOST} flex-1`}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {csvModalOpen ? (
          <CsvImportModal
            currentAccount={currentAccount}
            onClose={() => setCsvModalOpen(false)}
            onImported={(count) => {
              setCsvModalOpen(false);
              refreshTrades();
              setMessage({
                text: `Imported ${count} trade${count === 1 ? "" : "s"}.`,
                type: "success",
              });
            }}
          />
        ) : null}

        {deleteModalOpen && tradeToDelete ? (
          <DeleteConfirmModal
            isOpen={deleteModalOpen}
            onClose={() => {
              setDeleteModalOpen(false);
              setTradeToDelete(null);
            }}
            onConfirm={() => deleteTrade(tradeToDelete.id)}
            title="Delete trade?"
            message={`Delete this ${tradeToDelete.pair || ""} trade? This cannot be undone.`}
          />
        ) : null}
      </div>
    </div>
  );
}

// ─── Inline confluence editor ────────────────────────────────────────────────
function ConfluenceTags({ tags, onChange, accent = "#6C47FF" }) {
  const [inputValue, setInputValue] = useState("");

  const commit = () => {
    const next = inputValue.trim();
    if (!next) return;
    if (!tags.some((tag) => tag.toLowerCase() === next.toLowerCase())) onChange([...tags, next]);
    setInputValue("");
  };

  return (
    <div className="rounded-lg border border-[#262633] bg-[#0f0f18] p-2.5">
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 ? (
          <span className="text-[11px]" style={{ color: FAINT }}>
            No confluences tagged yet.
          </span>
        ) : (
          tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-semibold"
              style={{ backgroundColor: `${accent}22`, color: accent }}
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(tags.filter((item) => item !== tag))}
                aria-label={`Remove ${tag}`}
                className="rounded hover:text-white"
              >
                <X size={10} />
              </button>
            </span>
          ))
        )}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              commit();
            }
          }}
          placeholder="Add a confluence and press Enter"
          className="h-8 flex-1 rounded-md border border-[#262633] bg-[#101018] px-2.5 text-[11.5px] text-[#e9e9f2] outline-none placeholder:text-[#5d6078] focus:border-[#6C47FF]"
        />
        <button type="button" onClick={commit} className={`${GHOST} !h-8 !px-2.5`}>
          Add
        </button>
      </div>
    </div>
  );
}
