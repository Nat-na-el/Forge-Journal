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
