// src/lib/addTradeTheme.js
// Surface tokens for the Add Trade workflow (account list, broker picker,
// account creation, MetaTrader link). The reference flow is dark in every
// theme, so these pages keep their own dark surface like the Dashboard.

export const AT_ACCENT = "#6C47FF";
export const AT_POS = "#22c493";
export const AT_NEG = "#f2556e";

export const AT_PAGE = "min-h-screen w-full bg-[#08080d] text-[#e8e9f7]";
export const AT_WRAP = "mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8";
export const AT_CENTER = "mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-[460px] flex-col px-4 py-10";

export const AT_TEXT = "text-[#e8e9f7]";
export const AT_MUTED = "text-[#8a8fb5]";
export const AT_FAINT = "text-[#5d6078]";

export const AT_PANEL = "overflow-hidden rounded-xl border border-[#1f1f2b] bg-[#0d0d16]";
export const AT_PANEL_HEAD = "flex flex-wrap items-center justify-between gap-3 px-4 py-3.5";

export const AT_FIELD =
  "h-10 w-full rounded-lg border border-[#262633] bg-[#101018] px-3 text-sm text-[#e8e9f7] outline-none transition-colors placeholder:text-[#5d6078] focus:border-[#6C47FF] focus:ring-2 focus:ring-[#6C47FF]/25";

export const AT_PRIMARY =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#6C47FF] px-4 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-[#1b1b27] disabled:text-[#5d6078] disabled:hover:brightness-100";

export const AT_GHOST =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#262633] bg-[#12121b] px-3 text-[13px] font-medium text-[#c9cbe0] transition-colors hover:border-[#33334a] hover:bg-[#171722] disabled:cursor-not-allowed disabled:opacity-50";

export const AT_ICON_BTN =
  "flex h-8 w-8 items-center justify-center rounded-lg text-[#8a8fb5] transition-colors hover:bg-[#1a1a26] hover:text-white";

export const AT_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6C47FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#08080d]";

export const AT_DIVIDER = "border-[#1f1f2b]";

export const AT_TH =
  "px-2.5 py-2.5 text-left text-[10px] font-medium uppercase leading-tight tracking-wide text-[#6b7090]";
export const AT_TD = "px-2.5 py-2.5 text-[13px] text-[#c9cbe0]";
export const AT_ROW = "border-b border-[#191922] transition-colors hover:bg-[#12121b]";

export const AT_TILE =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold";

export const AT_CARD = "rounded-xl border border-[#1f1f2b] bg-[#0d0d16] p-5 sm:p-6";
