// src/pages/MentorMode.jsx – AI trading coach (talks to /.netlify/functions/mentor)
import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { format } from "date-fns";
import { Send, Loader2, Trash2, Sparkles, AlertCircle, Database } from "lucide-react";
import { Card } from "../components/ui/card";
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
} from "../lib/uiTokens";

const ENDPOINT = "/.netlify/functions/mentor";

const QUICK_PROMPTS = [
  "Review my recent trades",
  "What is my biggest leak?",
  "Check my risk management",
  "Help me plan tomorrow",
  "I'm on a losing streak — help",
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

export default function MentorMode({ currentAccount }) {
  const { accent, setAccent, ac } = useAccent();

  const storeKey = `forgexMentor:${currentAccount?.id || "none"}`;
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [shareData, setShareData] = useState(true);
  const [trades, setTrades] = useState([]);
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

  const context = useMemo(() => buildContext(trades, currentAccount), [trades, currentAccount]);

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
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSending(false);
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
      <div className="mx-auto max-w-4xl space-y-4">
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
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className={`ml-auto inline-flex items-center gap-1.5 text-xs font-medium ${MUTED} hover:text-[#14142b] dark:hover:text-white`}
            >
              <Trash2 size={14} /> Clear chat
            </button>
          )}
        </div>

        {/* Chat */}
        <Card
          className={`${CARD} flex h-[calc(100dvh-15rem)] min-h-[420px] flex-col overflow-hidden md:h-[calc(100dvh-13.5rem)]`}
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
  );
}
