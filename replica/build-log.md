# Build log — Forge Journal

## Phase 2 — Add Trade and account connections

Reference: `My accounts.png`, `Broker choice.png`, `List of brokers.png`
(account list, broker picker grid, broker picker search).

| ID | Screen | Date | Status | Notes |
|----|--------|------|--------|-------|
| AT01 | My trading accounts (`/add-trade`) | 2026-11-13 | done | Account table with broker, type, sync status, balance, FIFO method, last/next update, row selection, per-row sync, active-account switch. Empty, loading and error states. |
| AT02 | Choose Broker (`/add-trade/add-account`) | 2026-11-13 | done | Popular grid, live search across all platforms, generic-template escape row, progress bar, disabled Continue until a platform is picked. |
| AT03 | Account details (`/add-trade/custom-account`) | 2026-11-13 | done | Custom broker name, account name, starting balance, leverage; writes to Firestore and opens the trade form on the new account. |
| AT04 | Link MetaTrader (`/add-trade/mt5`) | 2026-11-13 | done | Server + numeric login + investor password, show/hide, live progress text, imports through the existing `connectMT5Account`, refreshes the shell account switcher. |
| AT05 | Manual trade entry | 2026-11-13 | done | Reached from a manual account row (`Add trades`), the row action, and the generic template. Uses the existing `/trades/new?accountId=` form. |

Sidebar account management (create account, manage accounts, MT5 connect,
MT5 sync) moved into this workflow. The popover now only switches the active
account. Nothing was removed from the data layer: same Firestore paths, same
MT5 client, same trade fields.

### Harder than expected

- The account table needs ten columns at 1440px. It now uses compact padding,
  a two-line header for the profit method and a horizontal scroll below
  ~1100px.
- Broker marks are our own letter tiles; no broker logos or artwork are used.
- Platforms without a direct integration route to the generic template instead
  of pretending to authenticate.

## Phase 3 — Trades log and Tracking view

Reference: `Trades page.png`, `Filter top up.png`, `Te dollar sign top up.png`,
`Trade details.png`, `Each trades.png` (trade log, filter panel, display-unit
menu, Tracking layout with the chart and executions).

| ID | Screen | Date | Status | Notes |
|----|--------|------|--------|-------|
| T01 | Trade log (`/trades`) | 2026-11-13 | done | Always-dark page with the six KPI cards, trade table, search, sort, rows-per-page, bulk select and CSV import/export. Row actions open the Tracking view, the edit modal or the delete confirmation. Loading, empty, filtered-empty and error states. |
| T02 | Filters and display units | 2026-11-13 | done | Left-rail filter panel (General, Tags, Date & Time, Playbook) with grouped checkboxes, date presets and Reset all / Cancel / Apply. Display-unit menu swaps Dollar, Percentage, R-multiple, Ticks, Pips and Points, plus a Privacy switch. |
| T03 | Tracking view | 2026-11-13 | done | Trade detail as a full-screen page: Stats / Playbook / Executions / Attachments rail, prev/next trade, Mark as reviewed, Share, edit and delete, live TradingView advanced chart with interval switch, and a trade-note editor with save and template. |
| T04 | Analytics and Calendar tabs | 2026-11-13 | done | Equity curve, win/loss donut, long/short split, daily P&L, P&L by symbol and the full statistics list. Calendar view shows daily and weekly totals and deep-links a day back into the log. |

### Harder than expected

- The Tracking view has to escape the app shell: it is rendered through
  `createPortal` at `z-[1050]`, above the fixed sidebar (`z-1000`) and drawer,
  and below the toast layer (`z-1100`).
- The TradingView chart is the official advanced-chart embed, mounted per
  symbol and interval and torn down on close. It needs network access; if the
  embed is blocked the panel offers an "Open on TradingView" fallback instead
  of a blank box.
- Demo trades now carry instrument-appropriate prices (FX 5 digits, JPY 3,
  indices 1) and stop/target distances derived from a per-market tick size, so
  the table and the chart axis agree.
- Category and currency naming stays ours: no "Zella Scale"; the equivalent
  is "Setup score" plus the shared 1–5 star trade rating.

## Phase 4 — Daily Journal Day View

Reference: `Day view.png`, `View note on Day view page.png` (day list with
sparkline + stats rail, right-rail month calendar, day-note modal with
sections).

| ID | Screen | Date | Status | Notes |
|----|--------|------|--------|-------|
| D01 | Day View (`/journal`) | 2026-11-13 | done | Light-theme-aware page (dark sidebar preserved). Header with Day/Week tabs, filter pills, search, date range, account chip, Start my day button and settings. Promo banner dismissible. Right-rail month calendar tinted per-day (green/red/amber) with note dot. Day cards show date, signed Net P&L, equity sparkline, two-row stats rail (Total trades, Win rate, Volume, Commissions, Winners/Losers, Profit factor), trades table with side pills, P&L, edit/delete, plus day-note section with mood chips, editor toolbar, Preparation & Game plan, Session log, EOD Performance Recap and Save. Persists to `users/{uid}/accounts/{id}/journal/{yyyy-MM-dd}`. `?date=` deep link, calendar navigation, add/edit/delete trade flows, mood/reviewed fields and search/filter all preserved. |

### Harder than expected

- Keeping `?date=` deep links and the sidebar-shell layout intact while
  replacing the old month-summary + scorecard rail with the calendar-first
  Day View layout.
- TradeZella-specific copy replaced: no "Zella AI" / "Zella Scale"; actions
  renamed to "Start my day", "Save note", "Mark day as reviewed".
- Every visible action wired: day cards open notes/trades, calendar days
  select the day, note modal persists to Firestore, add/edit/delete flows
  all functional in preview and live modes.

