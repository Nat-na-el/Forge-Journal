# Forge Journal vs TradeZella — Feature Comparison

Source: tradezella.com (`/`, `/pricing`, `/trading-journal`, `/backtesting`, `/zella-ai`), checked Nov 2026.
Code reference: this repository (`src/pages/*`, `src/components/ui/*`, `src/lib/*`, `netlify/functions/*`).

Legend: **Have** = works end-to-end · **Partial** = exists but limited/stubbed/mock · **Missing** = not present.

---

## 1. TradeZella's tiers (for context)

| Plan | Price | Accounts | AI credits | Notable unlocks |
|---|---|---|---|---|
| Essential | $35/mo | 1 | 500 | Journaling + analytics, reports, basic AI |
| Pro | $59/mo | 50 | 1,500 | Trade replay, AI agents, full reporting |
| Ultra | $99/mo | Unlimited | 3,000 | 100 AI backtests/mo, everything |

Premium areas TradeZella markets: 500+ broker auto-sync · 50+ report categories with 300+ drilled-down views · playbooks & strategy analytics · custom tags · MAE/MFE · running P&L · configurable breakeven · trade ratings · commissions/fees · multi-currency · 1-second trade replay with AI insights · AI backtesting in plain English + manual bar replay · 11+ years of historical data · AI agents (habit, risk, sentiment, custom) · Spaces / mentor mode / community · prop-firm sync · Zella University.

---

## 2. Area-by-area comparison

### A. Trade capture & data ingestion

| TradeZella capability | Forge Journal | Notes |
|---|---|---|
| 500+ broker auto-sync | **Partial** | MT5 only, via MetaApi (`netlify/functions/mt5.js`). No MT4, no cTrader, no futures broker APIs, no Interactive Brokers/Tradovate/Tradier. |
| Manual trade entry | **Have** | `AddTrade.jsx` + `Trades.jsx` — entry/exit/SL/TP, direction, size, fees, screenshots, confluences. |
| CSV import | **Have** | `CsvImportModal.jsx` with column mapping. |
| CSV export | **Have** | `Trades.jsx`. |
| Broker-specific CSV presets | **Missing** | Mapping is manual every time; no saved templates. |
| Duplicate detection on import | **Missing** | Re-importing the same file duplicates trades. |
| Deposits / withdrawals sync | **Partial** | MT5 sync reads deposits, but there is no deposit/withdrawal ledger in the UI. |
| Multi-account | **Have** | Account switcher in `App.js`, data under `users/{uid}/accounts/{id}`. |
| Multi-currency | **Partial** | Everything formatted USD (`Topbar.jsx`). No FX conversion. |
| Commissions & fees | **Partial** | A `fees` field exists and is captured; not modelled as its own cost line in reports (swap/commission split missing). |

### B. Analytics & reporting

| TradeZella capability | Forge Journal | Notes |
|---|---|---|
| Win rate, profit factor, expectancy | **Have** | `Trades.jsx` analytics block (420–510) and dashboard KPIs. |
| Net P&L, gross win/loss, avg win/loss | **Have** | `Trades.jsx`. |
| Equity curve | **Have** | `Dashboard.jsx` (chart.js). |
| Max drawdown / streaks | **Have** | `Dashboard.jsx`, radar "edge score". |
| Long vs short breakdown | **Have** | `Trades.jsx` side analytics. |
| Calendar P&L view | **Have** | `Trades.jsx` + `Dashboard.jsx` calendars. |
| 50+ report categories / 300+ drilled-down reports | **Missing** | `Reports.jsx` is a single page and still reads a **legacy Render API** (`tradeass-backend.onrender.com`) instead of Firestore. |
| Day-of-week performance | **Partial** | Weekly bars exist in the dashboard; no dedicated day-of-week report. |
| Time-of-day / session performance | **Missing** | No hour buckets, no session (Asia/London/NY) analytics. |
| MAE / MFE (heat on trade management) | **Missing** | Not captured, not charted. |
| Running P&L within a trade | **Missing** | No intra-trade excursion tracking. |
| R-multiple distribution | **Partial** | R is implied by SL/TP in `AddTrade.jsx`; no R histogram or R-based stats. |
| Hold time analytics | **Missing** | No duration buckets. |
| Trade rating / grade | **Missing** | No 1–5 star or A–F grading per trade. |
| Configurable breakeven rules | **Partial** | Break-even trades are counted, but no threshold setting (e.g. ±0.1R = BE). |
| Benchmark vs buy & hold / index | **Missing** | — |
| Symbol / pair performance table | **Have** | Dashboard pair table. |
| Custom report builder / filters | **Partial** | Filters exist in `Trades.jsx` (search, direction, result, date); not composable saved views. |

### C. Journaling

| TradeZella capability | Forge Journal | Notes |
|---|---|---|
| Daily journal | **Have** | `DailyJournal.jsx` — moods, review flag, scorecard, entries. |
| Notes / notebook | **Have** | `Notebook.jsx` — CRUD, tags, priority (pin is unused). |
| Attach notes to a specific trade | **Partial** | Notes exist on trades (searchable), but no rich linked note object. |
| Screenshots on trades | **Have** | `screenshotUrl` on trade create/edit, shown in list + detail. |
| Screenshot upload to Storage | **Missing** | URL only — user must host the image elsewhere. |
| Trade replay-linked journaling | **Missing** | No replay to journal from. |
| Templates / prompts | **Partial** | Day scorecard is fixed; no user-defined journal templates. |

### D. Tags, playbooks & strategy taxonomy

| TradeZella capability | Forge Journal | Notes |
|---|---|---|
| Custom tags | **Have** | `ConfluenceTags` in `Trades.jsx`. |
| Tag performance analytics | **Missing** | Tags are searchable only — no win rate / P&L per tag. |
| Playbooks (named strategy = setup + rules + stats) | **Missing** | Only a free-text `strategy` string on each trade. |
| Strategy performance analytics | **Partial** | Can filter by strategy text; no aggregation dashboard. |
| Setup / mistake taxonomy | **Missing** | No "mistake" or "rule broken" tagging. |
| Auto-tagging from AI | **Missing** | — |

### E. Backtesting, replay & optimisation

| TradeZella capability | Forge Journal | Notes |
|---|---|---|
| Manual bar-by-bar replay | **Missing** | — |
| 1-second replay with AI insights | **Missing** | — |
| AI backtesting in plain English | **Missing** | — |
| Guided scenarios / 11+ years data | **Missing** | — |
| Strategy backtest engine | **Partial** | `Backtest.jsx`: one hard-coded Asian-breakout strategy, **synthetic data**, not real historical prices. |
| Parameter grid optimisation | **Have** | Grid search with KPI table. |
| Optimisation leaderboard | **Have** | Results table sorted by P&L. |
| Save / compare backtests | **Partial** | Results live in page state; reload loses them. |
| Backtest → journal handoff | **Missing** | Backtest trades can't be pushed into the trade log. |
| Multiple strategies / custom rules | **Missing** | Single strategy definition. |

### F. AI

| TradeZella capability | Forge Journal | Notes |
|---|---|---|
| AI chat mentor with your trade context | **Have** | `MentorMode.jsx` → `netlify/functions/mentor.js` (Anthropic proxy). |
| AI agents (habit / risk / sentiment) | **Missing** | One general chat, no specialised agents. |
| Automated trade review / weekly recap | **Missing** | User must prompt manually. |
| AI-generated insights on reports | **Missing** | — |
| Usage metering / credits | **Missing** | No credit accounting. |
| Model reliability | **Have** | `mentor.js` defaults to `claude-haiku-5-5` (valid) and falls back to `claude-haiku-4-5` if the id is ever rejected. |

### G. Community, mentor & education

| TradeZella capability | Forge Journal | Notes |
|---|---|---|
| Spaces / community feed | **Missing** | — |
| Mentor / coach accounts reviewing your journal | **Missing** | "Mentor Mode" is AI only. |
| Zella University / courses | **Missing** | — |
| Shareable public trade cards | **Missing** | — |

### H. Prop-firm & challenges

| TradeZella capability | Forge Journal | Notes |
|---|---|---|
| Prop-firm account sync / rule tracking | **Missing** | — |
| Challenge tracker (target, max DD, daily loss) | **Partial** | `Challenges.jsx` uses **mock `SAMPLE_CHALLENGES`** in localStorage; "create" button has no handler. |
| Rule-violation alerts | **Missing** | — |
| Payout tracking | **Missing** | — |

### I. Platform, auth & UX

| TradeZella capability | Forge Journal | Notes |
|---|---|---|
| Email + Google auth | **Have** | Firebase Auth. |
| Cloud data | **Have** | Firestore with IndexedDB persistence. |
| Cross-device sync | **Have** | Firestore. |
| Dark/light theme + accents | **Have** | `Theme-provider`, `useAccent`, `uiTokens.js`. |
| Mobile responsive | **Have** | `useIsMobile`, `BottomNav`. |
| Settings / profile management | **Partial** | `SettingsPage.jsx` shows a hardcoded email; save only persists alerts; logout doesn't call Firebase `signOut`; "clear data" clears localStorage only. |
| Account deletion (GDPR) | **Missing** | Not implemented. |
| Public marketing site | **Have** | `Landing.jsx`. |
| Pricing / billing | **Missing** | No paywall, plans, or Stripe. |

---

## 3. What is similar (already matched or close)

- **Core trade journaling loop** — log a trade, attach notes/tags/screenshot, browse, filter, edit, delete.
- **CSV import/export** — TradeZella's most-used onboarding path; you have it with column mapping.
- **Broker auto-sync** — both auto-import; you cover MT5, TradeZella covers 500+.
- **Headline KPIs** — win rate, profit factor, expectancy, avg win/loss, streaks, drawdown.
- **Equity curve + calendar** — same visual language and purpose.
- **Daily journal + notebook** — TradeZella has daily reflection; yours is comparable and arguably more structured (mood + scorecard).
- **AI mentor chat grounded in your trades** — same product idea, narrower scope.
- **Backtest engine with parameter optimisation** — TradeZella's is far deeper, but the concept and the optimisation grid exist.
- **Multi-account support** and a dark, accent-driven UI that already reads "premium".

## 4. What is different (the real gaps)

**Data foundation**
1. `Reports.jsx` reads a dead legacy Render API instead of Firestore → reports don't reflect real trades.
2. No persisted `playbook`/`setup` entity; strategy is a free-text string.
3. No tag-level or strategy-level aggregation.

**Analytics depth**
4. No MAE/MFE, running P&L, hold-time, time-of-day, session or R-distribution analytics.
5. No trade rating, no mistake tagging, no configurable breakeven threshold.
6. Reports are one page, not a library of drilled-down views.

**Backtesting**
7. Synthetic data + one strategy — not usable for real validation.
8. No replay, no AI backtesting, no saved/comparable runs, no backtest→journal handoff.

**AI**
9. One general chat vs. specialised proactive agents; no automatic reviews.

**Product surface**
10. Challenges are mock data; settings are stubs; no billing/paywall.
11. No prop-firm rule tracking, no community/Spaces, no education.
12. Screenshots are URL-only (no upload), fees aren't split into commission/swap, currency is USD-only.

---

## 5. Biggest gaps ranked by user value per unit of work

| # | Gap | Why it matters | Effort |
|---|---|---|---|
| 1 | Reports → Firestore | Reports are currently wrong/empty; everything else depends on trustworthy numbers | S |
| 2 | Playbooks + tag analytics | TradeZella's single most-praised premium feature; turns tags into decisions | M |
| 3 | MAE/MFE + time-of-day/session + R distribution | The "why am I losing" analytics serious traders pay for | M |
| 4 | Trade rating + mistake tagging + breakeven setting | Cheap, high perceived value, feeds AI and reports | S |
| 5 | Settings/login/logout correctness | Broken basics undercut trust | S |
| 6 | Backtest on real data + save runs | Makes the backtest page actually useful | L |
| 7 | Prop-firm challenge tracker (real) | Large segment of the target market | M |
| 8 | AI agents + auto weekly review | Signature TradeZella differentiator | L |
| 9 | Replay / AI backtesting | Biggest build, needs market data vendor | XL |
| 10 | Community/Spaces + education + billing | Business layer, not journaling layer | XL |

---

## 6. Proposed match-up roadmap

**Phase 1 — Make the numbers true (foundation)**
- Move `Reports.jsx` to Firestore, reuse the `Trades.jsx` analytics engine.
- Split reports into tabs: Performance · Symbols · Sessions · Tags · Risk.
- Fix `SettingsPage.jsx` (real email, real `signOut`, real data deletion).
- Fix `mentor.js` model default.

**Phase 2 — The premium analytics layer**
- Playbooks (named strategy with rules, description, stats).
- Tag & playbook performance tables (win rate, PF, expectancy, net P&L, count).
- MAE/MFE capture + charts; running P&L on the trade detail.
- Time-of-day / day-of-week / session heatmaps; hold-time buckets; R-multiple histogram.
- Trade rating (1–5) + mistake tags; configurable breakeven band.

**Phase 3 — Backtesting credibility**
- Real OHLC data (vendor or bundled dataset).
- Multiple strategy templates + save/compare runs.
- Push backtest trades into the journal as a "Backtest" account.

**Phase 4 — Prop firm & automation**
- Real challenge tracker with target / max DD / daily loss / min days, alerts, payout log.
- AI agents: habit, risk, sentiment + automatic weekly review email/in-app.
- Credit metering for AI.

**Phase 5 — Replay & community (long term)**
- Bar replay with 1-second granularity.
- AI plain-English backtesting.
- Spaces, mentor accounts, education, billing.

### Quick wins (can ship in a day or two each)
- Reports on Firestore.
- Tag performance table.
- Trade rating + mistake tags.
- Playbook field + grouping.
- Session/time-of-day buckets.
- Fix settings/logout.
- CSV dedupe on import.
- Screenshot upload to Firebase Storage.

---

## 7. Phase 1 — implemented

**Reports on Firestore**
- `src/pages/Reports.jsx` now reads `users/{uid}/accounts/{accountId}/trades` directly. The legacy Render API is gone.
- Five report tabs: **Performance** (KPIs, equity curve, monthly P&L, win/loss split, best/worst), **Symbols** (per-symbol table with PF, expectancy, best/worst), **Sessions** (session cards, day-of-week, 3-hour buckets), **Tags & playbooks** (confluence tag ranking, strategy ranking), **Risk** (drawdown, streaks, payoff, hold time, R-multiple histogram, long vs short).
- Export CSV now includes stop loss, take profit, R, strategy and tags.

**Shared analytics**
- New `src/lib/analytics.js`: one implementation of `tradeStats`, `equityCurve`, `drawdown`, `streaks`, `groupStats`, session/day/hour buckets, R distribution and hold-time helpers. Reports uses it; future pages can too.

**Settings**
- Real signed-in email with verification badge and "resend verification".
- Display name saved via `updateProfile` (+ best-effort Firestore mirror).
- Notification preferences persist to `users/{uid}` and fall back to local storage.
- Log out calls Firebase `signOut`.
- "Clear all trading data" actually deletes trades, journal, notes, challenges and backtests across every account (batched, 400 writes per commit).

**Data-integrity fixes**
- Account reset used to target a `journals` collection that never existed; it now clears `journal`.
- Account reset now awaits its deletes instead of firing them and forgetting.

**Strategy field**
- `AddTrade` and the Trades edit modal now capture a strategy/playbook name, so the playbook report has data to group.

---

## 8. Phase 2 (started) — trade grading & mistakes

**New component** `src/components/ui/TradeGrading.jsx`
- `StarRating` — 1–5 stars, clickable or read-only.
- `MistakePicker` — preset chips (FOMO, Chased entry, Moved stop, Oversized, Early exit, Revenge trade, No plan, Ignored news, Overtraded) plus custom entries.
- `GradingSummary` — read-only block for the trade detail card.

**Trade capture**
- New optional fields: `rating` (0–5) and `mistakes` (array of strings).
- Added to `AddTrade` (new trade form) and the Trades edit modal.
- Trade list rows show compact stars and a mistake count; the detail modal shows the full grade.
- CSV export (Trades and Reports) includes rating and mistakes.

**Reports → Discipline tab**
- Average rating, share of trades rated, and net P&L of 4–5★ vs 1–2★ trades.
- Performance table per rating (trades, win %, PF, net, avg) with an "unrated" row.
- "Cost of mistakes" table ranked by net P&L, with a damage bar per mistake.
- Contextual note that refuses to draw conclusions under ten rated trades.

**Analytics** `src/lib/analytics.js`
- `ratingBreakdown(trades)` and `mistakeBreakdown(trades)` join the shared stat helpers.

Still to come in Phase 2: MAE/MFE, configurable breakeven band, trade filters/saved views, commission/swap split.


