// src/pages/MentorMode.jsx – AI trading coach (talks to /.netlify/functions/mentor)
import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDoc, getDocs, doc, updateDoc, query, orderBy, limit, increment } from "firebase/firestore";
import { format, subDays } from "date-fns";
import { Send, Loader2, Trash2, Sparkles, AlertCircle, Database, ShieldAlert, Flame, Calendar, DollarSign } from "lucide-react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { db, auth } from "../firebase";
import AccentPicker from "../components/ui/AccentPicker";
import useAccent from "../hooks/useAccent";
import {
  MUTED,
  HEAD,
  DIVIDER,
  CARD,
  FIELD,
  FOCUS,
  POS_T,
  NEG_T,
} from "../lib/uiTokens";

const ENDPOINT = "/.netlify/functions/mentor";

const QUICK_PROMPTS = [
  "Review my recent trades",
  "What is my biggest leak?",
  "Check my risk management",
  "Help me plan tomorrow",
  "I'm on a losing streak — help",
];

const AGENTS = [
  {
    id: "general",
    name: "General Mentor",
    icon: "Sparkles",
    description: "Straight, practical feedback on your trading.",
    systemPrompt: `You are an experienced trading mentor. Review the trader's journal data and give honest, practical, actionable feedback. Be direct but encouraging. Focus on what the data shows, not what the trader hopes. If you see a pattern, point it out. Keep answers concise and use bullet points when helpful.`,
  },
  {
    id: "habit",
    name: "Habit Agent",
    icon: "Clock",
    description: "Spots recurring behaviors — good and bad — across your trade log.",
    systemPrompt: `You are a habit-analysis agent for traders. Your job is to spot recurring patterns in the trader's journal: repeated mistakes, consistent winning setups, time-of-day tendencies, day-of-week patterns, emotional triggers, and execution habits. Look at the trade list and context data to find what happens over and over. Tell the trader: (1) which habits are helping them, (2) which habits are hurting them, and (3) one specific habit to change this week. Be concrete and reference specific trades or patterns when you can.`,
  },
  {
    id: "risk",
    name: "Risk Agent",
    icon: "ShieldAlert",
    description: "Reviews position sizing, stop losses, drawdown, and risk per trade.",
    systemPrompt: `You are a risk-management agent for traders. Your job is to evaluate the trader's risk discipline from their journal data. Look at: position sizing vs account balance, stop-loss placement and adherence, max drawdown, loss streaks, risk/reward ratios, and whether the trader is risking too much on single trades. Give a clear risk rating (1-10) with justification, flag any rule violations, and suggest specific risk rules to adopt. Be strict — capital preservation comes first.`,
  },
  {
    id: "sentiment",
    name: "Sentiment Agent",
    icon: "Flame",
    description: "Reads your trade notes for emotional state and psychological patterns.",
    systemPrompt: `You are a trading-psychology agent. Your job is to read the trader's journal notes and trade comments to detect emotional state and psychological patterns. Look for: fear, greed, revenge trading, overconfidence, hesitation, FOMO, anger, and discipline breakdowns. Correlate emotions with trade outcomes. Tell the trader: (1) what emotional state they seem to be in, (2) how that state is affecting their P&L, and (3) one psychological technique to use next session. Be empathetic but direct.`,
  },
];

const GREETING =
  "Hi, I'm your trading mentor. I can read your journal stats and give you straight, practical feedback.\n\nTry one of the prompts below, or tell me about your last trade.";

const entryDate = (t) => String(t.openDateTime || t.date || "");

// ─── Compact summary of the journal that is sent to the mentor ─────────
function buildContext(trades, account) {
  if (!trades.length) return { note: "The trader has no logged trades yet.", account: { name: account?.name } };
  const sorted = [...trades].sort((a, b) => entryDate(b).localeCompare(entryDate(a)));
  const ex = sorted.filter((t) => t.status !== "pending");
  const pnl = (t) => Number(t.pnl) || 0;
  const wins = ex.filter((t) => pnl(t) > 0);
  const losses = ex.filter((t) => pnl(t) < 0);
  const gw = wins.reduce((s, t) => s + pnl(t), 0);
  const gl = Math.abs(losses.reduce((s, t) => s + pnl(t), 0));
  const pct = (c, n) => (n ? Math.round((c / n) * 100) : 0);

  const byPair = {};
  ex.forEach((t) => {
    const k = t.pair || "?";
    const o = byPair[k] || (byPair[k] = { pair: k, trades: 0, pnl: 0 });
    o.trades++;
    o.pnl += pnl(t);
  });
  const dir = (d) => {
    const l = ex.filter((t) => t.direction === d);
    return { trades: l.length, winRate: pct(l.filter((t) => pnl(t) > 0).length, l.length) };
  };

  let streak = 0;
  let streakType = "none";
  for (const t of ex) {
    const p = pnl(t);
    if (!p) continue;
    const type = p > 0 ? "win" : "loss";
    if (streakType === "none") streakType = type;
    if (type !== streakType) break;
    streak++;
  }

  return {
    account: { name: account?.name, startingBalance: account?.starting_balance, leverage: account?.leverage },
    sampleSize: ex.length,
    pendingTrades: sorted.length - ex.length,
    netPnL: Number((gw - gl).toFixed(2)),
    winRatePct: pct(wins.length, ex.length),
    profitFactor: gl ? Number((gw / gl).toFixed(2)) : null,
    avgWin: wins.length ? Number((gw / wins.length).toFixed(2)) : 0,
    avgLoss: losses.length ? Number((gl / losses.length).toFixed(2)) : 0,
    currentStreak: { type: streakType, count: streak },
    longs: dir("Long"),
    shorts: dir("Short"),
    pairs: Object.values(byPair)
      .sort((a, b) => b.trades - a.trades)
      .slice(0, 6)
      .map((p) => ({ ...p, pnl: Number(p.pnl.toFixed(2)) })),
    journalHabits: {
      withNotesPct: pct(sorted.filter((t) => (t.notes || "").trim()).length, sorted.length),
      withStopLossPct: pct(sorted.filter((t) => Number(t.stopLoss) > 0).length, sorted.length),
      withScreenshotPct: pct(sorted.filter((t) => t.screenshotUrl).length, sorted.length),
    },
    recentTrades: sorted.slice(0, 12).map((t) => ({
      date: entryDate(t).slice(0, 10),
      pair: t.pair,
      dir: t.direction,
      status: t.status || "executed",
      pnl: pnl(t),
      rr: t.rr || null,
      note: (t.notes || "").slice(0, 100),
    })),
  };
}

// ─── Tiny markdown renderer (bold, `code`, lists, headings) ────────────
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code key={i} className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    return part;
  });
}

function Markdown({ text }) {
  const blocks = [];
  let list = null;
  const flush = () => {
    if (list) blocks.push(list);
    list = null;
  };
  text.split("\n").forEach((raw, i) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (bullet || numbered) {
      const type = bullet ? "ul" : "ol";
      if (!list || list.type !== type) {
        flush();
        list = { type, items: [], key: i };
      }
      list.items.push((bullet || numbered)[1]);
      return;
    }
    flush();
    if (!line.trim()) return;
    const h = line.match(/^#{1,4}\s+(.*)/);
    blocks.push({ type: h ? "h" : "p", text: h ? h[1] : line, key: i });
  });
  flush();

  return (
    <div className="space-y-2 leading-relaxed">
      {blocks.map((b) =>
        b.type === "ul" || b.type === "ol" ? (
          React.createElement(
            b.type,
            { key: b.key, className: `${b.type === "ul" ? "list-disc" : "list-decimal"} pl-5 space-y-1` },
            b.items.map((it, j) => <li key={j}>{inline(it)}</li>)
          )
        ) : b.type === "h" ? (
          <p key={b.key} className="font-bold">
            {inline(b.text)}
          </p>
        ) : (
          <p key={b.key}>{inline(b.text)}</p>
        )
      )}
    </div>
  );
}

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const decrementCredit = async (uid) => {
  try {
    await updateDoc(doc(db, "users", uid), { credits: increment(-1) });
  } catch {
    /* best effort */
  }
};

export default function MentorMode({ currentAccount }) {
  const { accent, setAccent, ac } = useAccent();

  const storeKey = `forgexMentor:${currentAccount?.id || "none"}`;
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [shareData, setShareData] = useState(true);
  const [agent, setAgent] = useState(AGENTS[0]);
  const [trades, setTrades] = useState([]);
  const [weeklyReview, setWeeklyReview] = useState(null);
  const [weeklyReviewLoading, setWeeklyReviewLoading] = useState(false);
  const [credits, setCredits] = useState(null);
  const [creditsLoading, setCreditsLoading] = useState(true);
  const endRef = useRef(null);

  // Load saved chat for this account
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) || "[]");
      setMessages(Array.isArray(saved) ? saved : []);
    } catch {
      setMessages([]);
    }
  }, [storeKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storeKey, JSON.stringify(messages.slice(-40)));
    } catch {}
  }, [messages, storeKey]);

  // Load the latest trades once per account (used as coaching context)
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const user = auth.currentUser;
      if (!user || !currentAccount?.id) return setTrades([]);
      try {
        const q = query(
          collection(db, "users", user.uid, "accounts", currentAccount.id, "trades"),
          orderBy("createdAt", "desc"),
          limit(80)
        );
        const snap = await getDocs(q);
        if (!cancelled) setTrades(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Mentor: could not load trades", err);
      }
    };
    const unsub = auth.onAuthStateChanged(run);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [currentAccount?.id]);

  // Load AI credit balance from Firestore
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const user = auth.currentUser;
      if (!user) {
        setCreditsLoading(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!cancelled) {
          setCredits(snap.exists() ? Number(snap.data()?.credits || 0) : 0);
        }
      } catch (err) {
        console.warn("Could not load credits:", err?.message || err);
        if (!cancelled) setCredits(0);
      } finally {
        if (!cancelled) setCreditsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const context = useMemo(() => buildContext(trades, currentAccount), [trades, currentAccount]);

  const weekAgo = subDays(new Date(), 7);
  const weeklyTrades = useMemo(() => {
    return trades.filter((t) => {
      if (t.status !== "executed") return false;
      const d = new Date(t.closeDateTime || t.openDateTime || t.date);
      return d >= weekAgo;
    });
  }, [trades]);

  const weeklyStats = useMemo(() => {
    const pnl = weeklyTrades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
    const wins = weeklyTrades.filter((t) => (Number(t.pnl) || 0) > 0).length;
    const losses = weeklyTrades.filter((t) => (Number(t.pnl) || 0) < 0).length;
    const best = weeklyTrades.length ? Math.max(...weeklyTrades.map((t) => Number(t.pnl) || 0)) : 0;
    const worst = weeklyTrades.length ? Math.min(...weeklyTrades.map((t) => Number(t.pnl) || 0)) : 0;
    const grossWin = weeklyTrades.filter((t) => (Number(t.pnl) || 0) > 0).reduce((s, t) => s + (Number(t.pnl) || 0), 0);
    const grossLoss = Math.abs(weeklyTrades.filter((t) => (Number(t.pnl) || 0) < 0).reduce((s, t) => s + (Number(t.pnl) || 0), 0));
    return {
      count: weeklyTrades.length,
      pnl,
      winRate: weeklyTrades.length ? (wins / weeklyTrades.length) * 100 : 0,
      wins,
      losses,
      best,
      worst,
      grossWin,
      grossLoss,
      profitFactor: grossLoss ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    };
  }, [weeklyTrades]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setError(null);
    const userMsg = { id: newId(), role: "user", content, ts: new Date().toISOString() };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setSending(true);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Please log in again.");
      const token = await user.getIdToken();
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messages: history.slice(-14).map((m) => ({ role: m.role, content: m.content })),
          context: shareData ? context : null,
          agent: agent.id,
          systemPrompt: agent.systemPrompt,
        }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {}
      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? "The AI function isn't available here. It runs on the deployed site (or locally with `netlify dev`)."
            : data.error || `Request failed (${res.status})`
        );
      }
      setMessages((m) => [...m, { id: newId(), role: "assistant", content: data.reply, ts: new Date().toISOString() }]);
      if (user && credits !== null && credits > 0) await decrementCredit(user.uid);
      setCredits((prev) => (prev === null ? prev : Math.max(0, prev - 1)));
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSending(false);
    }
  };

  const generateWeeklyReview = async () => {
    if (weeklyTrades.length === 0) {
      setWeeklyReview("No executed trades in the last 7 days. Log some trades and come back.");
      return;
    }
    setWeeklyReviewLoading(true);
    setError(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Please log in again.");
      const token = await user.getIdToken();
      const stats = weeklyStats;
      const prompt = `Generate a weekly trading review based on this data:
- Period: Last 7 days
- Trades: ${stats.count}
- Net P&L: $${stats.pnl.toFixed(2)}
- Win rate: ${stats.winRate.toFixed(1)}% (${stats.wins}W / ${stats.losses}L)
- Best trade: $${stats.best.toFixed(2)}
- Worst trade: $${stats.worst.toFixed(2)}
- Gross profit: $${stats.grossWin.toFixed(2)}
- Gross loss: $${stats.grossLoss.toFixed(2)}
- Profit factor: ${stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)}

Agent role: ${agent.name}. ${agent.systemPrompt}

Provide: (1) a one-line summary of the week, (2) 2-3 specific observations from the data, (3) one concrete action for next week. Be concise and use bullet points.`;
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          context: shareData ? context : null,
          agent: agent.id,
          systemPrompt: agent.systemPrompt,
        }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {}
      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      setWeeklyReview(data.reply || "No review generated.");
      if (user && credits !== null && credits > 0) await decrementCredit(user.uid);
      setCredits((prev) => (prev === null ? prev : Math.max(0, prev - 1)));
    } catch (err) {
      setError(err.message || "Could not generate weekly review.");
    } finally {
      setWeeklyReviewLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  const shown = messages.length
    ? messages
    : [{ id: "hello", role: "assistant", content: GREETING, ts: new Date().toISOString() }];

  return (
    <div className="min-h-screen w-full bg-[#f4f5fa] p-3 text-[#14142b] dark:bg-[#0b0b19] dark:text-[#e8e9f7] sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1600px] space-y-4">
        {/* Header */}
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h1 className={`text-2xl font-bold tracking-tight sm:text-3xl ${HEAD}`}>Mentor Mode</h1>
            <p className={`mt-1 text-sm ${MUTED}`}>
              Your AI trading coach — honest feedback from your own journal
            </p>
          </div>
          <AccentPicker accent={accent} setAccent={setAccent} />
        </div>

        {/* Context bar */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            onClick={() => setShareData((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${FOCUS} ${
              shareData ? "border-transparent text-white" : `${DIVIDER} ${MUTED}`
            }`}
            style={shareData ? { backgroundColor: ac.hex } : undefined}
            aria-pressed={shareData}
          >
            <Database size={14} />
            {shareData ? "Using my journal data" : "Journal data off"}
          </button>
          {shareData && (
            <span className={`text-xs ${MUTED}`}>
              {context.sampleSize
                ? `${context.sampleSize} trades · ${context.winRatePct}% win rate`
                : "No trades logged yet"}
            </span>
          )}
          <select
            value={agent.id}
            onChange={(e) => setAgent(AGENTS.find((a) => a.id === e.target.value) || AGENTS[0])}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${DIVIDER} ${HEAD} ${FOCUS} bg-white dark:bg-[#101024]`}
            aria-label="AI agent"
          >
            {AGENTS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          {credits !== null && creditsLoading === false && credits > 0 && (
            <span className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${DIVIDER} ${HEAD}`}>
              <DollarSign size={12} />
              {`Credits: ${credits}`}
            </span>
          )}
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className={`ml-auto inline-flex items-center gap-1.5 text-xs font-medium ${MUTED} hover:text-[#14142b] dark:hover:text-white`}
            >
              <Trash2 size={14} /> Clear chat
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Weekly Review */}
        <div className="xl:order-2 xl:col-span-4">
        <Card className={`${CARD} p-0`}>
          <div className={`flex items-center justify-between border-b px-4 py-3 ${DIVIDER}`}>
            <div className="flex items-center gap-2">
              <Calendar size={16} style={{ color: ac.hex }} />
              <h2 className={`text-[15px] font-semibold ${HEAD}`}>Weekly Review</h2>
            </div>
            <Button
              onClick={generateWeeklyReview}
              disabled={weeklyReviewLoading || weeklyTrades.length === 0}
              variant="outline"
              className={`border font-semibold ${DIVIDER}`}
            >
              {weeklyReviewLoading ? (
                <Loader2 size={16} className="mr-2 animate-spin" />
              ) : (
                <Sparkles size={16} className="mr-2" />
              )}
              {weeklyReviewLoading ? "Generating…" : "AI Review"}
            </Button>
          </div>
          <div className="p-4 sm:p-5">
            {weeklyTrades.length === 0 ? (
              <div className="text-center py-8">
                <p className={`text-sm ${MUTED}`}>No executed trades in the last 7 days.</p>
                <p className={`text-[11px] ${MUTED}`}>Log some trades and the weekly review will populate here.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["Net P&L", `$${weeklyStats.pnl.toFixed(2)}`, weeklyStats.pnl >= 0 ? POS_T : NEG_T],
                    ["Win Rate", `${weeklyStats.winRate.toFixed(1)}%`, HEAD],
                    ["Trades", weeklyStats.count, HEAD],
                    ["Profit Factor", weeklyStats.profitFactor === Infinity ? "∞" : weeklyStats.profitFactor.toFixed(2), HEAD],
                  ].map(([label, value, tone]) => (
                    <div key={label} className={`rounded-xl border p-3 ${DIVIDER}`}>
                      <div className={`text-[10px] font-medium ${MUTED}`}>{label}</div>
                      <div className={`mt-0.5 text-lg font-bold tabular-nums ${tone}`}>{value}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className={`rounded-xl border p-3 ${DIVIDER}`}>
                    <div className={`text-[10px] font-medium ${MUTED}`}>Best trade</div>
                    <div className={`mt-0.5 text-lg font-bold tabular-nums ${POS_T}`}>$${weeklyStats.best.toFixed(2)}</div>
                  </div>
                  <div className={`rounded-xl border p-3 ${DIVIDER}`}>
                    <div className={`text-[10px] font-medium ${MUTED}`}>Worst trade</div>
                    <div className={`mt-0.5 text-lg font-bold tabular-nums ${NEG_T}`}>$${weeklyStats.worst.toFixed(2)}</div>
                  </div>
                </div>
                {weeklyReview && (
                  <div className={`mt-4 rounded-xl border p-4 ${DIVIDER} bg-white dark:bg-[#101024]`}>
                    <div className={`mb-2 text-[10px] font-semibold uppercase tracking-wide ${MUTED}`}>
                      AI Review ({agent.name})
                    </div>
                    <div className="whitespace-pre-wrap text-sm">{weeklyReview}</div>
                  </div>
                )}
              </>
            )}
          </div>
        </Card>
        </div>

        {/* Chat */}
        <Card
          className={`${CARD} xl:order-1 xl:col-span-8 flex h-[calc(100dvh-15rem)] min-h-[420px] flex-col overflow-hidden md:h-[calc(100dvh-13.5rem)]`}
        >
          <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
            {shown.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm shadow-sm sm:max-w-[80%] sm:text-[15px] ${
                    m.role === "user"
                      ? "rounded-br-md text-white"
                      : `rounded-bl-md border bg-[#f7f8fc] dark:bg-[#101024] ${DIVIDER} ${HEAD}`
                  }`}
                  style={m.role === "user" ? { backgroundColor: ac.hex } : undefined}
                >
                  {m.role === "assistant" && (
                    <div className="mb-2 flex items-center gap-2">
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-full text-white"
                        style={{ backgroundColor: ac.hex }}
                      >
                        <Sparkles size={14} />
                      </div>
                      <span className={`text-xs font-semibold ${MUTED}`}>Forgex Mentor</span>
                    </div>
                  )}
                  {m.role === "assistant" ? <Markdown text={m.content} /> : <p className="whitespace-pre-wrap">{m.content}</p>}
                  <div className={`mt-2 text-right text-[10px] ${m.role === "user" ? "text-white/70" : MUTED}`}>
                    {format(new Date(m.ts), "HH:mm")}
                  </div>
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div
                  className={`flex items-center gap-2 rounded-2xl rounded-bl-md border px-4 py-3 text-sm ${DIVIDER} bg-[#f7f8fc] dark:bg-[#101024] ${MUTED}`}
                >
                  <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-[#f2556e]/30 bg-[#f2556e]/10 px-4 py-3 text-sm font-medium text-[#d93a57] dark:text-[#ff6b86]">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Composer */}
          <div className={`space-y-3 border-t p-3 sm:p-4 ${DIVIDER}`}>
            {messages.length < 2 && (
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {QUICK_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => send(p)}
                    disabled={sending}
                    className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:brightness-110 disabled:opacity-50"
                    style={{ borderColor: `${ac.hex}66`, color: ac.hex }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={1}
                placeholder="Ask about a trade, risk, psychology, your plan…"
                className={`${FIELD} max-h-32 min-h-[46px] flex-1 resize-none py-3`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || sending}
                aria-label="Send"
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white transition hover:brightness-110 disabled:opacity-40 ${FOCUS}`}
                style={{ backgroundColor: ac.hex }}
              >
                <Send size={19} />
              </button>
            </div>
            <p className={`text-center text-[11px] ${MUTED}`}>
              AI coaching for education only — not financial advice. Replies can be wrong, so double-check important decisions.
            </p>
          </div>
        </Card>
        </div>
      </div>
    </div>
  );
}
