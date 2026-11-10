// src/pages/Playbooks.jsx
// Playbooks: a named setup with rules, stats and every linked trade.
// TradeZella's "playbook" equivalent — replaces a free-text strategy with a real object.
import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { useTheme } from "../Theme-provider";
import useAccent from "../hooks/useAccent";
import AccentPicker from "../components/ui/AccentPicker";
import {
  BookMarked,
  Check,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  Target,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import {
  POS_T,
  NEG_T,
  MUTED,
  HEAD,
  DIVIDER,
  CARD,
  FIELD,
  FOCUS,
} from "../lib/uiTokens";
import { money, pct, ratio, tradeStats } from "../lib/analytics";

const MARKETS = ["Forex", "Indices", "Crypto", "Futures", "Stocks", "Commodities"];
const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "Daily", "Weekly"];

const EMPTY_PLAYBOOK = {
  name: "",
  market: "",
  timeframe: "",
  description: "",
  entryCriteria: "",
  exitCriteria: "",
  riskPerTrade: "",
  rules: [],
};

// A trade belongs to a playbook by id. Trades logged before playbooks existed
// fall back to a name match against the free-text strategy, so old data still counts.
function collectTrades(playbook, trades) {
  const name = (playbook.name || "").trim().toLowerCase();
  return trades.filter((trade) => {
    if (trade.playbookId) return trade.playbookId === playbook.id;
    return !!name && (trade.strategy || "").trim().toLowerCase() === name;
  });
}

// ─── Modal shell ─────────────────────────────────────────────────────────────

function ModalShell({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        className={`w-full ${wide ? "max-w-2xl" : "max-w-lg"} max-h-[88vh] overflow-hidden rounded-2xl border border-[#e6e8f2] bg-white text-[#14142b] shadow-2xl dark:border-[#262645] dark:bg-[#15152b] dark:text-white`}
      >
        <div className={`flex items-center justify-between border-b px-4 py-3 ${DIVIDER}`}>
          <h2 className={`text-[15px] font-semibold ${HEAD}`}>{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className={`rounded-md p-1.5 ${MUTED} hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${FOCUS}`}
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[calc(88vh-3.5rem)] overflow-y-auto p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Form ────────────────────────────────────────────────────────────────────

function PlaybookForm({ initial, accent, saving, error, onCancel, onSave }) {
  const [values, setValues] = useState({ ...EMPTY_PLAYBOOK, ...initial });
  const [ruleInput, setRuleInput] = useState("");

  const set = (patch) => setValues((v) => ({ ...v, ...patch }));

  const addRule = () => {
    const rule = ruleInput.trim();
    if (!rule) return;
    set({ rules: [...values.rules, rule] });
    setRuleInput("");
  };

  const removeRule = (index) =>
    set({ rules: values.rules.filter((_, i) => i !== index) });

  const submit = (e) => {
    e.preventDefault();
    if (!values.name.trim()) return;
    onSave({
      name: values.name.trim(),
      market: values.market,
      timeframe: values.timeframe,
      description: values.description.trim(),
      entryCriteria: values.entryCriteria.trim(),
      exitCriteria: values.exitCriteria.trim(),
      riskPerTrade: values.riskPerTrade === "" ? "" : Number(values.riskPerTrade),
      rules: values.rules.map((r) => r.trim()).filter(Boolean),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Name *</label>
        <input
          value={values.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="e.g. London breakout"
          className={FIELD}
          maxLength={80}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Market</label>
          <select value={values.market} onChange={(e) => set({ market: e.target.value })} className={FIELD}>
            <option value="">Any</option>
            {MARKETS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Timeframe</label>
          <select value={values.timeframe} onChange={(e) => set({ timeframe: e.target.value })} className={FIELD}>
            <option value="">Any</option>
            {TIMEFRAMES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Description</label>
        <textarea
          value={values.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="What is the idea behind this setup?"
          className={`${FIELD} min-h-[70px] resize-y py-2`}
        />
      </div>

      <div>
        <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Entry criteria</label>
        <textarea
          value={values.entryCriteria}
          onChange={(e) => set({ entryCriteria: e.target.value })}
          placeholder="What must be true before you take it?"
          className={`${FIELD} min-h-[64px] resize-y py-2`}
        />
      </div>

      <div>
        <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Exit criteria</label>
        <textarea
          value={values.exitCriteria}
          onChange={(e) => set({ exitCriteria: e.target.value })}
          placeholder="Where is the stop, where is the target, when do you cut it?"
          className={`${FIELD} min-h-[64px] resize-y py-2`}
        />
      </div>

      <div>
        <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Rules checklist</label>
        <div className="space-y-2">
          {values.rules.map((rule, index) => (
            <div key={`${rule}-${index}`} className="flex items-start gap-2">
              <span
                className="mt-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white"
                style={{ backgroundColor: accent }}
              >
                <Check size={12} />
              </span>
              <input
                value={rule}
                onChange={(e) =>
                  set({ rules: values.rules.map((r, i) => (i === index ? e.target.value : r)) })
                }
                className={`${FIELD} flex-1`}
              />
              <button
                type="button"
                onClick={() => removeRule(index)}
                aria-label="Remove rule"
                className={`mt-1 rounded-md p-1.5 ${MUTED} hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${FOCUS}`}
              >
                <X size={15} />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              value={ruleInput}
              onChange={(e) => setRuleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addRule();
                }
              }}
              placeholder="Add a rule and press Enter"
              className={`${FIELD} flex-1`}
            />
            <button
              type="button"
              onClick={addRule}
              className={`rounded-lg border px-3 text-xs font-semibold ${DIVIDER} ${HEAD} ${FOCUS}`}
            >
              Add
            </button>
          </div>
        </div>
      </div>

      <div>
        <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Risk per trade (%)</label>
        <input
          type="number"
          step="0.1"
          min="0"
          value={values.riskPerTrade}
          onChange={(e) => set({ riskPerTrade: e.target.value })}
          placeholder="e.g. 1"
          className={FIELD}
        />
      </div>

      {error && (
        <p className="rounded-lg border border-[#f2556e]/40 bg-[#f2556e]/[0.06] px-3 py-2 text-xs font-medium text-[#d93a57] dark:text-[#ff6b86]">
          {error}
        </p>
      )}

      <div className={`flex justify-end gap-2 border-t pt-4 ${DIVIDER}`}>
        <Button type="button" variant="outline" onClick={onCancel} className={`border font-semibold ${DIVIDER}`}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={saving || !values.name.trim()}
          style={{ backgroundColor: accent }}
          className="font-semibold text-white hover:brightness-110 disabled:opacity-50"
        >
          {saving ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Check size={15} className="mr-2" />}
          {saving ? "Saving…" : "Save playbook"}
        </Button>
      </div>
    </form>
  );
}

// ─── Detail ──────────────────────────────────────────────────────────────────

function PlaybookDetail({ playbook, stats, linkedTrades, accent, onClose, onEdit, onDelete }) {
  const ruleCount = playbook.rules?.length || 0;

  return (
    <ModalShell title={playbook.name} onClose={onClose} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {playbook.market && (
            <span className="rounded-md bg-[#eef0f8] px-2 py-1 text-[11px] font-semibold dark:bg-[#101024] dark:text-[#c9ccea]">
              {playbook.market}
            </span>
          )}
          {playbook.timeframe && (
            <span className="rounded-md bg-[#eef0f8] px-2 py-1 text-[11px] font-semibold dark:bg-[#101024] dark:text-[#c9ccea]">
              {playbook.timeframe}
            </span>
          )}
          {playbook.riskPerTrade !== "" && playbook.riskPerTrade != null && (
            <span className="rounded-md bg-[#eef0f8] px-2 py-1 text-[11px] font-semibold dark:bg-[#101024] dark:text-[#c9ccea]">
              {playbook.riskPerTrade}% risk
            </span>
          )}
        </div>

        {playbook.description && (
          <p className={`text-sm leading-relaxed ${MUTED}`}>{playbook.description}</p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Trades", stats.count, HEAD],
            ["Win rate", pct(stats.winRate), HEAD],
            ["Profit factor", ratio(stats.profitFactor), HEAD],
            ["Net P&L", money(stats.net), stats.net >= 0 ? POS_T : NEG_T],
          ].map(([label, value, tone]) => (
            <div key={label} className={`rounded-xl border p-3 ${DIVIDER}`}>
              <div className={`text-[11px] font-medium ${MUTED}`}>{label}</div>
              <div className={`mt-0.5 text-lg font-bold tabular-nums ${tone}`}>{value}</div>
            </div>
          ))}
        </div>

        {(playbook.entryCriteria || playbook.exitCriteria) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {playbook.entryCriteria && (
              <div>
                <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${MUTED}`}>Entry</div>
                <p className={`whitespace-pre-wrap text-sm ${HEAD}`}>{playbook.entryCriteria}</p>
              </div>
            )}
            {playbook.exitCriteria && (
              <div>
                <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${MUTED}`}>Exit</div>
                <p className={`whitespace-pre-wrap text-sm ${HEAD}`}>{playbook.exitCriteria}</p>
              </div>
            )}
          </div>
        )}

        {ruleCount > 0 && (
          <div>
            <div className={`mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide ${MUTED}`}>
              <ListChecks size={13} /> Rules checklist
            </div>
            <ul className="space-y-1.5">
              {playbook.rules.map((rule, index) => (
                <li key={`${rule}-${index}`} className={`flex items-start gap-2 text-sm ${HEAD}`}>
                  <span className="mt-0.5 text-xs font-bold" style={{ color: accent }}>
                    {index + 1}.
                  </span>
                  {rule}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <div className={`mb-2 text-[11px] font-semibold uppercase tracking-wide ${MUTED}`}>
            Linked trades ({linkedTrades.length})
          </div>
          {linkedTrades.length === 0 ? (
            <p className={`rounded-xl border px-3 py-4 text-sm ${DIVIDER} ${MUTED}`}>
              No trades yet. Pick this playbook when you log a trade and its stats will appear here.
            </p>
          ) : (
            <div className={`overflow-hidden rounded-xl border ${DIVIDER}`}>
              {linkedTrades.slice(0, 12).map((trade) => {
                const pnl = Number(trade.pnl) || 0;
                return (
                  <div
                    key={trade.id}
                    className={`flex items-center justify-between gap-3 border-b px-3 py-2 text-sm last:border-0 ${DIVIDER}`}
                  >
                    <span className={`min-w-0 truncate font-semibold ${HEAD}`}>
                      {trade.pair || "—"} · {trade.direction || "—"}
                    </span>
                    <span className={`shrink-0 font-semibold tabular-nums ${pnl >= 0 ? POS_T : NEG_T}`}>
                      {money(pnl)}
                    </span>
                  </div>
                );
              })}
              {linkedTrades.length > 12 && (
                <div className={`px-3 py-2 text-xs ${MUTED}`}>
                  +{linkedTrades.length - 12} more
                </div>
              )}
            </div>
          )}
        </div>

        <div className={`flex justify-between gap-2 border-t pt-4 ${DIVIDER}`}>
          <Button
            type="button"
            variant="outline"
            onClick={onDelete}
            className="border border-[#f2556e]/40 font-semibold text-[#d93a57] hover:bg-[#f2556e]/10 dark:text-[#ff6b86]"
          >
            <Trash2 size={15} className="mr-2" /> Delete
          </Button>
          <Button
            type="button"
            onClick={onEdit}
            style={{ backgroundColor: accent }}
            className="font-semibold text-white hover:brightness-110"
          >
            <Pencil size={15} className="mr-2" /> Edit playbook
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Playbooks({ currentAccount }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { accent, setAccent, ac } = useAccent();

  const [playbooks, setPlaybooks] = useState([]);
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // { mode: "create" | "edit" | "view", playbook? }
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const accountId = currentAccount?.id;

  const load = async () => {
    const user = auth.currentUser;
    if (!user || !accountId) {
      setPlaybooks([]);
      setTrades([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const base = ["users", user.uid, "accounts", accountId];
      const [playbookSnap, tradeSnap] = await Promise.all([
        getDocs(collection(db, ...base, "playbooks")),
        getDocs(collection(db, ...base, "trades")),
      ]);
      setPlaybooks(playbookSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setTrades(tradeSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Playbooks load failed:", err);
      setError("Could not load your playbooks. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  // Link trades by id, falling back to a name match so trades typed before
  // playbooks existed still count towards the right setup.
  const tradesFor = (playbook) => collectTrades(playbook, trades);

  const cards = useMemo(
    () =>
      playbooks
        .map((playbook) => {
          const linked = collectTrades(playbook, trades);
          return { playbook, linked, stats: tradeStats(linked) };
        })
        .sort((a, b) => b.stats.net - a.stats.net),
    [playbooks, trades]
  );

  const overall = useMemo(() => {
    const linkedTradeIds = new Set();
    playbooks.forEach((playbook) => {
      collectTrades(playbook, trades).forEach((trade) => linkedTradeIds.add(trade.id));
    });
    return { linked: linkedTradeIds.size, total: trades.length };
  }, [playbooks, trades]);

  const openCreate = () => {
    setFormError("");
    setModal({ mode: "create" });
  };

  const openView = (playbook) => {
    setFormError("");
    setModal({ mode: "view", playbook });
  };

  const openEdit = (playbook) => {
    setFormError("");
    setModal({ mode: "edit", playbook });
  };

  const savePlaybook = async (values) => {
    const user = auth.currentUser;
    if (!user || !accountId || !modal) return;

    setSaving(true);
    setFormError("");
    try {
      const base = ["users", user.uid, "accounts", accountId];
      const collectionRef = collection(db, ...base, "playbooks");

      if (modal.mode === "create") {
        await addDoc(collectionRef, {
          ...values,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const previous = modal.playbook;
        await updateDoc(doc(collectionRef, previous.id), {
          ...values,
          updatedAt: serverTimestamp(),
        });

        // Keep the trade snapshots in step when the playbook is renamed.
        if (previous.name !== values.name) {
          const affected = trades.filter((trade) => trade.playbookId === previous.id);
          for (let i = 0; i < affected.length; i += 400) {
            const batch = writeBatch(db);
            affected.slice(i, i + 400).forEach((trade) => {
              const patch = { playbook: values.name };
              const currentStrategy = (trade.strategy || "").trim().toLowerCase();
              if (!currentStrategy || currentStrategy === previous.name.trim().toLowerCase()) {
                patch.strategy = values.name;
              }
              batch.update(doc(db, ...base, "trades", trade.id), patch);
            });
            await batch.commit();
          }
        }
      }

      await load();
      setModal(null);
    } catch (err) {
      console.error("Playbook save failed:", err);
      setFormError(err?.message || "Could not save the playbook.");
    } finally {
      setSaving(false);
    }
  };

  const deletePlaybook = async (playbook) => {
    const user = auth.currentUser;
    if (!user || !accountId) return;

    const count = tradesFor(playbook).length;
    const confirmed = window.confirm(
      `Delete "${playbook.name}"?\n\n${count} trade${count === 1 ? "" : "s"} will stay in your journal but will no longer be linked to this playbook.`
    );
    if (!confirmed) return;

    setSaving(true);
    try {
      await deleteDoc(doc(db, "users", user.uid, "accounts", accountId, "playbooks", playbook.id));
      await load();
      setModal(null);
    } catch (err) {
      console.error("Playbook delete failed:", err);
      setError(err?.message || "Could not delete the playbook.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`${isDark ? "dark bg-[#0b0b19] text-[#e8e9f7]" : "bg-[#f4f5fa] text-[#14142b]"} min-h-screen w-full p-3 sm:p-6 lg:p-8`}
    >
      <div className="mx-auto max-w-[1600px]">
        {/* Header */}
        <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <h1 className={`text-2xl font-bold tracking-tight sm:text-3xl ${HEAD}`}>Playbooks</h1>
            <p className={`mt-1 text-sm ${MUTED}`}>
              Your named setups, their rules, and how each one actually performs
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <AccentPicker accent={accent} setAccent={setAccent} className="mr-1" />
            <Button
              onClick={openCreate}
              style={{ backgroundColor: ac.hex }}
              className="font-semibold text-white hover:brightness-110"
            >
              <Plus size={16} className="mr-2" /> New playbook
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex h-72 items-center justify-center">
            <div
              className="h-10 w-10 animate-spin rounded-full border-2 border-[#e6e8f2] dark:border-[#262645]"
              style={{ borderTopColor: ac.hex }}
              role="progressbar"
              aria-label="Loading playbooks"
            />
          </div>
        ) : error ? (
          <Card className={`${CARD} p-10 text-center`}>
            <p className={`text-sm font-semibold ${HEAD}`}>{error}</p>
            <Button onClick={load} className="mt-4" style={{ backgroundColor: ac.hex }}>
              Try again
            </Button>
          </Card>
        ) : playbooks.length === 0 ? (
          <Card className={`${CARD} p-10 text-center`}>
            <BookMarked size={38} className={`mx-auto mb-3 opacity-40 ${MUTED}`} />
            <p className={`text-lg font-semibold ${HEAD}`}>No playbooks yet</p>
            <p className={`mx-auto mt-1 max-w-md text-sm ${MUTED}`}>
              A playbook is one setup you trade repeatedly — its rules, its risk and its own win rate.
              Create your first one and pick it when you log a trade.
            </p>
            <Button
              onClick={openCreate}
              style={{ backgroundColor: ac.hex }}
              className="mt-5 font-semibold text-white hover:brightness-110"
            >
              <Plus size={16} className="mr-2" /> Create a playbook
            </Button>
          </Card>
        ) : (
          <>
            <div className={`mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border px-4 py-3 text-xs ${DIVIDER} ${MUTED}`}>
              <span>{playbooks.length} playbook{playbooks.length === 1 ? "" : "s"}</span>
              <span>
                {overall.linked} of {overall.total} trades linked
              </span>
              <span className="ml-auto">Sorted by net P&L</span>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {cards.map(({ playbook, linked, stats }) => (
                <Card
                  key={playbook.id}
                  className={`${CARD} flex h-full flex-col p-4 transition-shadow hover:shadow-md`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className={`truncate text-[15px] font-semibold ${HEAD}`}>{playbook.name}</h3>
                      <div className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] ${MUTED}`}>
                        {playbook.market && <span>{playbook.market}</span>}
                        {playbook.market && playbook.timeframe && <span>·</span>}
                        {playbook.timeframe && <span>{playbook.timeframe}</span>}
                        {playbook.rules?.length > 0 && (
                          <>
                            <span>·</span>
                            <span>{playbook.rules.length} rules</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
                      style={{ backgroundColor: ac.hex }}
                    >
                      <Target size={17} />
                    </div>
                  </div>

                  {playbook.description && (
                    <p className={`mt-3 line-clamp-2 text-xs leading-relaxed ${MUTED}`}>
                      {playbook.description}
                    </p>
                  )}

                  <div className={`mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border ${DIVIDER}`}>
                    {[
                      ["Trades", stats.count, HEAD],
                      ["Win rate", pct(stats.winRate), HEAD],
                      ["PF", ratio(stats.profitFactor), HEAD],
                      ["Net", money(stats.net), stats.net >= 0 ? POS_T : NEG_T],
                    ].map(([label, value, tone]) => (
                      <div key={label} className="bg-white px-3 py-2 dark:bg-[#15152b]">
                        <div className={`text-[10px] font-medium ${MUTED}`}>{label}</div>
                        <div className={`text-sm font-bold tabular-nums ${tone}`}>{value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-auto flex gap-2 pt-4">
                    <button
                      type="button"
                      onClick={() => openView(playbook)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${DIVIDER} ${HEAD} hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${FOCUS}`}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(playbook)}
                      aria-label={`Edit ${playbook.name}`}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${DIVIDER} ${MUTED} hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${FOCUS}`}
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                </Card>
              ))}
            </div>

            {overall.linked < overall.total && (
              <p className={`mt-4 flex items-center gap-2 text-xs ${MUTED}`}>
                <TrendingUp size={14} />
                {overall.total - overall.linked} trade{overall.total - overall.linked === 1 ? "" : "s"} aren&apos;t
                linked to a playbook yet — edit them and choose one to sharpen these stats.
              </p>
            )}
          </>
        )}

        {modal?.mode === "create" && (
          <ModalShell title="New playbook" onClose={() => setModal(null)}>
            <PlaybookForm
              initial={EMPTY_PLAYBOOK}
              accent={ac.hex}
              saving={saving}
              error={formError}
              onCancel={() => setModal(null)}
              onSave={savePlaybook}
            />
          </ModalShell>
        )}

        {modal?.mode === "edit" && modal.playbook && (
          <ModalShell title={`Edit ${modal.playbook.name}`} onClose={() => setModal(null)}>
            <PlaybookForm
              initial={modal.playbook}
              accent={ac.hex}
              saving={saving}
              error={formError}
              onCancel={() => setModal(null)}
              onSave={savePlaybook}
            />
          </ModalShell>
        )}

        {modal?.mode === "view" && modal.playbook && (
          <PlaybookDetail
            playbook={modal.playbook}
            stats={tradeStats(tradesFor(modal.playbook))}
            linkedTrades={tradesFor(modal.playbook)}
            accent={ac.hex}
            onClose={() => setModal(null)}
            onEdit={() => openEdit(modal.playbook)}
            onDelete={() => deletePlaybook(modal.playbook)}
          />
        )}
      </div>
    </div>
  );
}
