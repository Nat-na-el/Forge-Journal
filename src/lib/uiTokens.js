// Shared Tradezella-style design tokens.
// These mirror the palette used by the Daily Journal so every page
// (Reports, Trades, Notebook, Challenges, Mentor, Backtest, Settings)
// looks like one product.

export const POS = "#22c493";
export const NEG = "#f2556e";

export const POS_T = "text-[#0e9f77] dark:text-[#2dd4a0]";
export const NEG_T = "text-[#d93a57] dark:text-[#ff6b86]";
export const MUTED = "text-[#6b7090] dark:text-[#8a8fb5]";
export const HEAD = "text-[#14142b] dark:text-white";
export const DIVIDER = "border-[#e6e8f2] dark:border-[#262645]";

export const CARD =
  "gap-0 rounded-xl bg-white dark:bg-[#15152b] border border-[#e6e8f2] dark:border-[#262645] shadow-sm dark:shadow-none";
export const PANEL =
  "rounded-xl border border-[#e6e8f2] dark:border-[#262645] bg-[#f7f8fc] dark:bg-[#101024]";
export const FIELD =
  "w-full h-10 rounded-lg border border-[#e6e8f2] dark:border-[#262645] bg-white dark:bg-[#101024] px-3 text-sm outline-none focus:ring-2 focus:ring-[#6C47FF]";
export const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6C47FF]";

export const PAGE = "min-h-screen w-full p-3 sm:p-6 lg:p-8";
export const PAGE_BG =
  "bg-[#f4f5fa] text-[#14142b] dark:bg-[#0b0b19] dark:text-[#e8e9f7]";

// Same accent palette + storage key as the Dashboard / Journal / Sidebar.
export const ACCENTS = {
  zella: { name: "Zella", hex: "#6C47FF", hex2: "#9b7bff" },
  indigo: { name: "Indigo", hex: "#6366f1", hex2: "#a855f7" },
  emerald: { name: "Emerald", hex: "#10b981", hex2: "#06b6d4" },
  cyan: { name: "Ocean", hex: "#06b6d4", hex2: "#3b82f6" },
  amber: { name: "Amber", hex: "#f59e0b", hex2: "#ef4444" },
  rose: { name: "Rose", hex: "#f43f5e", hex2: "#ec4899" },
};

export const card = (extra = "") => `${CARD} ${extra}`;
