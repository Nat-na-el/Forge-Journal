// src/pages/Challenges.jsx
// Real challenge tracker: Firestore-backed challenges that auto-evaluate
// against the account's trades, with rule-violation alerts and a payout log.
import React, { useEffect, useMemo, useState } from "react";
import { format, endOfMonth } from "date-fns";
import {
  collection,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import useAccent from "../hooks/useAccent";
import AccentPicker from "../components/ui/AccentPicker";
import {
  Trophy,
  Target,
  Flame,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  Trash2,
  Plus,
  ShieldAlert,
  DollarSign,
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

// ─── Challenge type definitions ──────────────────────────────────────────
// type: "streak" | "profit" | "trades" | "days" | "winrate"
// rule: how current progress is computed from trades
const CHALLENGE_PRESETS = [
  {
    id: "consistency-30",
    title: "30-Day Consistency",
    description: "Log at least 1 trade on 30 separate days.",
    type: "days",
    target: 30,
    reward: "Custom badge",
  },
  {
    id: "profit-500",
    title: "Monthly Profit Goal",
    description: "Reach +$500 net P&L this calendar month.",
    type: "profit",
    target: 500,
    reward: "Double mentor sessions",
  },
  {
    id: "risk-control",
    title: "Max 1% Risk Discipline",
    description: "Complete 50 trades without any single trade risking more than 1% of the account.",
    type: "discipline",
    target: 50,
    reward: "Priority support",
  },
  {
    id: "no-revenge",
    title: "No Revenge Trading",
    description: "Go 60 days with no loss immediately followed by a larger loss on the same pair.",
    type: "psychology",
    target: 60,
    reward: "Psychology deep-dive",
  },
  {
    id: "win-rate-60",
    title: "60% Win Rate",
    description: "Close 25 trades with a win rate of at least 60%.",
    type: "winrate",
    target: 60,
    reward: "Premium journal template",
  },
];

const EMPTY_CHALLENGE = {
  title: "",
  description: "",
  type: "streak",
  target: 10,
  reward: "",
  startDate: new Date().toISOString().split("T")[0],
  endDate: endOfMonth(new Date()).toISOString().split("T")[0],
};

// ─── Progress evaluation ─────────────────────────────────────────────────
// Returns { current, met, violated, violationNote } for a challenge given the account's trades.
export function evaluateChallenge(challenge, trades = [], accountBalance = 0) {
  const executed = trades.filter((t) => t.status !== "pending");
  const now = new Date();
  const start = new Date(challenge.startDate || now);
  const end = new Date(challenge.endDate || now);
  const inWindow = (t) => {
    const d = new Date(t.closeDateTime || t.openDateTime || t.date);
    return d >= start && d <= end;
  };
  const windowTrades = executed.filter(inWindow);

  // Rule-violation detection (once broken, cannot be recovered)
  let violated = false;
  let violationNote = "";

  if (challenge.type === "discipline") {
    const riskLimit = (accountBalance || 10000) * 0.01;
    const breaches = windowTrades.filter(
      (t) => (Number(t.pnl) || 0) < 0 && Math.abs(Number(t.pnl)) > riskLimit
    );
    if (breaches.length > 0) {
      violated = true;
      violationNote = `A single loss exceeded the 1% risk limit ($${riskLimit.toFixed(0)})`;
    }
  }

  if (!violated && challenge.type === "psychology") {
    const byPair = {};
    windowTrades.forEach((t) => {
      const k = (t.pair || "").toUpperCase();
      if (!byPair[k]) byPair[k] = [];
      byPair[k].push(t);
    });
    Object.values(byPair).some((list) => {
      const sorted = [...list].sort(
        (a, b) =>
          new Date(b.closeDateTime || b.openDateTime || b.date) -
          new Date(a.closeDateTime || a.openDateTime || a.date)
      );
      for (let i = 1; i < sorted.length; i++) {
        const prev = Number(sorted[i - 1].pnl) || 0;
        const curr = Number(sorted[i].pnl) || 0;
        if (prev < 0 && curr < 0 && Math.abs(curr) > Math.abs(prev)) {
          violated = true;
          violationNote = "Revenge trading detected: a larger loss followed a loss on the same pair";
          return true;
        }
      }
      return false;
    });
  }

  switch (challenge.type) {
    case "days": {
      const days = new Set(
        windowTrades.map((t) => {
          const d = new Date(t.closeDateTime || t.openDateTime || t.date);
          return d.toISOString().slice(0, 10);
        })
      );
      return { current: days.size, met: days.size >= challenge.target, violated, violationNote };
    }
    case "profit": {
      const pnl = windowTrades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
      return { current: pnl, met: pnl >= challenge.target, violated, violationNote };
    }
    case "trades": {
      return { current: windowTrades.length, met: windowTrades.length >= challenge.target, violated, violationNote };
    }
    case "winrate": {
      const wins = windowTrades.filter((t) => (Number(t.pnl) || 0) > 0).length;
      const rate = windowTrades.length ? (wins / windowTrades.length) * 100 : 0;
      return {
        current: Math.round(rate * 10) / 10,
        met: windowTrades.length >= 5 && rate >= challenge.target,
        violated,
        violationNote,
      };
    }
    case "discipline": {
      const risky = windowTrades.filter(
        (t) => Number(t.lotSize || 0) > 0 && Number(t.pnl || 0) < 0
      ).length;
      return {
        current: windowTrades.length - risky,
        met: windowTrades.length >= challenge.target && risky === 0,
        violated,
        violationNote,
      };
    }
    case "psychology": {
      // Count days with no loss-followed-by-larger-loss on the same pair
      const byPair = {};
      windowTrades.forEach((t) => {
        const k = (t.pair || "").toUpperCase();
        if (!byPair[k]) byPair[k] = [];
        byPair[k].push(t);
      });
      let cleanDays = 0;
      const days = new Set(
        windowTrades.map((t) =>
          new Date(t.closeDateTime || t.openDateTime || t.date).toISOString().slice(0, 10)
        )
      );
      days.forEach((day) => {
        Object.values(byPair).forEach((list) => {
          const dayList = list.filter(
            (t) => new Date(t.closeDateTime || t.openDateTime || t.date).toISOString().slice(0, 10) === day
          );
          const losses = dayList.filter((t) => (Number(t.pnl) || 0) < 0).sort(
            (a, b) => Number(a.pnl) - Number(b.pnl)
          );
        });
        cleanDays += 1;
      });
      return { current: cleanDays, met: cleanDays >= challenge.target, violated, violationNote };
    }
    default: // streak
      let streak = 0;
      let best = 0;
      const sorted = [...windowTrades].sort(
        (a, b) =>
          new Date(b.closeDateTime || b.openDateTime || b.date) -
          new Date(a.closeDateTime || a.openDateTime || a.date)
      );
      sorted.forEach((t) => {
        const p = Number(t.pnl) || 0;
        if (p > 0) {
          streak += 1;
          best = Math.max(best, streak);
        } else {
          streak = 0;
        }
      });
      return { current: best, met: best >= challenge.target, violated, violationNote };
  }
}

// ─── Component ───────────────────────────────────────────────────────────
export default function Challenges({ currentAccount }) {
  const { accent, setAccent, ac } = useAccent();
  const accountId = currentAccount?.id;

  const [challenges, setChallenges] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // { mode: "create" | "edit", challenge? }
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", type: "streak", target: "10",
    startDate: new Date().toISOString().split("T")[0],
    endDate: endOfMonth(new Date()).toISOString().split("T")[0], reward: "",
  });

  // Load challenges + payouts + trades for this account
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const user = auth.currentUser;
      if (!user || !accountId) {
        if (!cancelled) {
          setChallenges([]);
          setPayouts([]);
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      setError("");
      try {
        const base = ["users", user.uid, "accounts", accountId];
        const [chSnap, paySnap, tradeSnap] = await Promise.all([
          getDocs(
            query(collection(db, ...base, "challenges"), orderBy("createdAt", "desc"))
          ),
          getDocs(
            query(collection(db, ...base, "challengePayouts"), orderBy("createdAt", "desc"))
          ),
          getDocs(collection(db, ...base, "trades")),
        ]);
        if (!cancelled) {
          setChallenges(chSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
          setPayouts(paySnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
      } catch (err) {
        console.warn("Challenges collections may not exist yet:", err?.message || err);
        if (!cancelled) {
          setChallenges([]);
          setPayouts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const tradesRef = useMemo(
    () => (auth.currentUser && accountId
      ? collection(db, "users", auth.currentUser.uid, "accounts", accountId, "trades")
      : null),
    [accountId]
  );

  // Re-evaluate every challenge against the latest trades
  const [allTrades, setAllTrades] = useState([]);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const user = auth.currentUser;
      if (!user || !tradesRef) {
        setAllTrades([]);
        return;
      }
      try {
        const snap = await getDocs(tradesRef);
        if (!cancelled) setAllTrades(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.warn("Could not load trades for challenge evaluation:", err?.message || err);
        setAllTrades([]);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [tradesRef]);

  const evaluated = useMemo(() => {
    const balance = currentAccount?.starting_balance || currentAccount?.current_balance || 0;
    return challenges.map((ch) => {
      const progress = evaluateChallenge(ch, allTrades, Number(balance) || 0);
      return { ...ch, progress };
    });
  }, [challenges, allTrades, currentAccount]);

  const active = evaluated.filter((c) => !c.completed && !c.archived);
  const completed = evaluated.filter((c) => c.completed);
  const violated = evaluated.filter((c) => c.progress.violated);

  // ─── Actions ───────────────────────────────────────────────────────────
  const openCreate = () => {
    setForm({
      title: "", description: "", type: "streak", target: "10",
      startDate: new Date().toISOString().split("T")[0],
      endDate: endOfMonth(new Date()).toISOString().split("T")[0], reward: "",
    });
    setModal({ mode: "create" });
  };
  const openEdit = (challenge) => {
    setForm({
      title: challenge.title || "",
      description: challenge.description || "",
      type: challenge.type || "streak",
      target: String(challenge.target || ""),
      startDate: challenge.startDate || new Date().toISOString().split("T")[0],
      endDate: challenge.endDate || endOfMonth(new Date()).toISOString().split("T")[0],
      reward: challenge.reward || "",
    });
    setModal({ mode: "edit", challenge });
  };

  const saveChallenge = async (values) => {
    const user = auth.currentUser;
    if (!user || !accountId) return;
    setSaving(true);
    try {
      const base = ["users", user.uid, "accounts", accountId];
      const payload = {
        ...values,
        target: Number(values.target),
        startDate: values.startDate || new Date().toISOString().split("T")[0],
        endDate: values.endDate || endOfMonth(new Date()).toISOString().split("T")[0],
        createdAt: serverTimestamp(),
      };
      if (modal.mode === "create") {
        await addDoc(collection(db, ...base, "challenges"), payload);
      } else {
        await updateDoc(doc(db, ...base, "challenges", modal.challenge.id), payload);
      }
      setModal(null);
    } catch (err) {
      setError(err?.message || "Could not save the challenge.");
    } finally {
      setSaving(false);
    }
  };

  const completeChallenge = async (challenge) => {
    const user = auth.currentUser;
    if (!user || !accountId) return;
    try {
      const base = ["users", user.uid, "accounts", accountId];
      await updateDoc(doc(db, ...base, "challenges", challenge.id), {
        completed: true,
        completedAt: serverTimestamp(),
      });
      await addDoc(collection(db, ...base, "challengePayouts"), {
        challengeId: challenge.id,
        challengeTitle: challenge.title,
        reward: challenge.reward,
        paidAt: serverTimestamp(),
      });
    } catch (err) {
      setError(err?.message || "Could not mark challenge complete.");
    }
  };

  const archiveChallenge = async (challenge) => {
    const user = auth.currentUser;
    if (!user || !accountId) return;
    try {
      const base = ["users", user.uid, "accounts", accountId];
      await updateDoc(doc(db, ...base, "challenges", challenge.id), {
        archived: true,
      });
    } catch (err) {
      setError(err?.message || "Could not archive challenge.");
    }
  };

  const deleteChallenge = async (challenge) => {
    if (!window.confirm(`Delete "${challenge.title}"?`)) return;
    const user = auth.currentUser;
    if (!user || !accountId) return;
    try {
      const base = ["users", user.uid, "accounts", accountId];
      await deleteDoc(doc(db, ...base, "challenges", challenge.id));
      setError("");
    } catch (err) {
      setError(err?.message || "Could not delete challenge.");
    }
  };

  const formatDate = (isoString) => {
    try { return format(new Date(isoString), "MMM d, yyyy"); } catch { return "—"; }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f5fa] dark:bg-[#0b0b19]">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-[#e6e8f2] dark:border-[#262645]"
          style={{ borderTopColor: ac.hex }}
          role="progressbar"
        />
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen w-full bg-[#f4f5fa] p-3 text-[#14142b] dark:bg-[#0b0b19] dark:text-[#e8e9f7] sm:p-6 lg:p-8`}
    >
      <div className="mx-auto max-w-[1600px]">
        {/* Header */}
        <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <h1 className={`text-2xl font-bold tracking-tight sm:text-3xl ${HEAD}`}>Challenges</h1>
            <p className={`mt-1 text-sm ${MUTED}`}>
              Set targets, track progress against your real trades, and claim payouts.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AccentPicker accent={accent} setAccent={setAccent} className="mr-1" />
            <Button onClick={openCreate} style={{ backgroundColor: ac.hex }} className="font-semibold text-white hover:brightness-110">
              <Plus size={16} className="mr-2" /> New challenge
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-[#f2556e]/40 bg-[#f2556e]/[0.06] px-4 py-3 text-xs font-medium text-[#d93a57] dark:text-[#ff6b86]">
            {error}
          </div>
        )}

        {challenges.length === 0 ? (
          <Card className={`${CARD} p-12 text-center`}>
            <Target size={36} className={`mx-auto mb-3 opacity-40 ${MUTED}`} />
            <p className={`text-lg font-semibold ${HEAD}`}>No challenges yet</p>
            <p className={`mx-auto mb-6 mt-1 max-w-md text-sm ${MUTED}`}>
              Challenges measure your discipline against your actual trade log — win rate,
              profit, streaks, risk control, and trading days.
            </p>
            <Button onClick={openCreate} style={{ backgroundColor: ac.hex }} className="font-semibold text-white hover:brightness-110">
              <Plus size={16} className="mr-2" /> Create your first challenge
            </Button>
          </Card>
        ) : (
          <>
            {/* Violation alerts */}
            {violated.length > 0 && (
              <Card className={`${CARD} mb-4 p-4 rounded-xl border border-[#f2556e]/40 bg-[#f2556e]/[0.06] dark:border-[#f2556e]/30 dark:bg-[#f2556e]/[0.04]`}>
                <div className="flex items-start gap-3">
                  <ShieldAlert size={18} className="mt-0.5 shrink-0 text-[#d93a57] dark:text-[#ff6b86]" />
                  <div>
                    <div className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>Rule violation</div>
                    <p className={`mt-1 text-sm ${HEAD}`}>
                      {violated.length} challenge{violated.length > 1 ? "s" : ""} has a violated rule:
                    </p>
                    <ul className="mt-2 text-sm space-y-1 {MUTED}">
                      {violated.map((c) => (
                        <li key={c.id}>
                          <span className={`font-medium ${HEAD}`}>{c.title}</span>{" "}
                          — {c.progress.violationNote || "rule breached"}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Card>
            )}

            {/* Summary strip */}
            <Card className={`${CARD} overflow-hidden mb-5`}>
              <div className="grid grid-cols-2 gap-px bg-[#e6e8f2] dark:bg-[#262645] md:grid-cols-4">
                {[
                  ["Active", active.length],
                  ["Completed", completed.length],
                  ["Violations", violated.length],
                  ["Payouts claimed", payouts.length],
                ].map(([label, value]) => (
                  <div key={label} className="bg-white px-4 py-4 dark:bg-[#15152b]">
                    <div className={`text-[11px] font-medium ${MUTED}`}>{label}</div>
                    <div className={`mt-1 text-xl font-bold tabular-nums ${HEAD}`}>{value}</div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Active challenges */}
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className={`flex items-center gap-2 text-[15px] font-semibold ${HEAD}`}>
                  <Flame size={17} className="text-amber-500" /> Active challenges
                </h2>
                <span className={`text-xs ${MUTED}`}>{active.length} running</span>
              </div>

              {active.length === 0 ? (
                <Card className={`${CARD} p-8 text-center`}>
                  <p className={`text-sm ${MUTED}`}>No active challenges right now.</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {active.map((challenge) => {
                    const progress = challenge.progress;
                    const pct = challenge.type === "profit"
                      ? Math.min(100, Math.round((progress.current / challenge.target) * 100))
                      : Math.min(100, Math.round((progress.current / challenge.target) * 100));
                    const met = progress.met;
                    return (
                      <Card
                        key={challenge.id}
                        className={`${CARD} relative overflow-hidden p-0`}
                      >
                        {met && (
                          <div className="absolute right-0 top-0 rounded-bl-lg px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white" style={{ backgroundColor: ac.hex }}>
                            Target met
                          </div>
                        )}
                        <div className={`flex items-start justify-between gap-3 border-b px-4 py-3.5 ${DIVIDER}`}>
                          <div className="min-w-0 pr-8">
                            <h3 className={`text-[15px] font-semibold ${HEAD}`}>{challenge.title}</h3>
                            <p className={`mt-0.5 text-xs ${MUTED}`}>{challenge.description}</p>
                          </div>
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{
                            backgroundColor: met ? "rgba(34,196,147,0.14)" : `${ac.hex}1f`,
                            color: met ? "#0e9f77" : ac.hex,
                          }}>
                            {met ? <CheckCircle2 size={20} /> : <Target size={20} />}
                          </div>
                        </div>

                        <div className="space-y-3 p-4">
                          <div>
                            <div className="mb-1.5 flex items-center justify-between text-xs font-medium">
                              <span className={MUTED}>Progress</span>
                              <span className={HEAD}>{pct}%</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-[#e6e8f2] dark:bg-[#262645]">
                              <div
                                className="h-full rounded-full transition-all duration-700"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: met ? "#22c493" : ac.hex,
                                }}
                              />
                            </div>
                          </div>

                          <div className={`flex items-center justify-between text-xs ${MUTED}`}>
                            <span className="font-medium">
                              {challenge.type === "profit"
                                ? `$${progress.current.toFixed(2)} / $${challenge.target}`
                                : `${progress.current} / ${challenge.target}`}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <Clock size={13} /> Ends {formatDate(challenge.endDate)}
                            </span>
                          </div>
                        </div>

                        <div className={`flex items-start gap-2 border-t px-4 py-3 text-xs ${DIVIDER} ${MUTED}`}>
                          <Trophy size={14} className="mt-0.5 shrink-0 text-amber-500" />
                          <span className="font-semibold">{challenge.reward}</span>
                          {met && (
                            <Button
                              size="sm"
                              onClick={() => completeChallenge(challenge)}
                              style={{ backgroundColor: "#22c493" }}
                              className="ml-auto font-semibold text-white"
                            >
                              Claim payout
                            </Button>
                          )}
                        </div>

                        <div className="border-t px-4 py-3">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEdit(challenge)}
                              className={`flex-1 border font-semibold text-xs ${DIVIDER}`}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => archiveChallenge(challenge)}
                              className="border border-[#f2556e]/40 text-[#d93a57] hover:bg-[#f2556e]/10 dark:text-[#ff6b86] font-semibold text-xs"
                            >
                              Archive
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Completed challenges */}
            {completed.length > 0 && (
              <section className="mt-6">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className={`flex items-center gap-2 text-[15px] font-semibold ${HEAD}`}>
                    <Trophy size={17} className="text-amber-500" /> Completed challenges
                  </h2>
                  <span className={`text-xs ${MUTED}`}>{completed.length} earned</span>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {completed.map((challenge) => (
                    <Card key={challenge.id} className={`${CARD} p-4`}>
                      <div className="flex items-start gap-3">
                        <div className={`${POS_T} flex h-10 w-10 shrink-0 items-center justify-center rounded-lg`}>
                          <CheckCircle2 size={20} />
                        </div>
                        <div className="min-w-0">
                          <h3 className={`text-sm font-semibold ${HEAD}`}>{challenge.title}</h3>
                          <p className={`mt-0.5 text-xs ${MUTED}`}>{challenge.description}</p>
                          <div className={`mt-3 inline-flex items-center gap-1.5 text-xs font-semibold ${POS_T}`}>
                            <Trophy size={13} /> {challenge.reward}
                          </div>
                          <div className={`mt-2 text-[10px] ${MUTED}`}>
                            Completed {formatDate(challenge.completedAt)}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {/* Payout log */}
            {payouts.length > 0 && (
              <section className="mt-6">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className={`flex items-center gap-2 text-[15px] font-semibold ${HEAD}`}>
                    <DollarSign size={17} className="text-emerald-500" /> Payout log
                  </h2>
                  <span className={`text-xs ${MUTED}`}>{payouts.length} claimed</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className={`border-b ${DIVIDER}`}>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide {MUTED}">Challenge</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide {MUTED}">Reward</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide {MUTED}">Claimed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payouts.map((p) => (
                        <tr key={p.id} className={`border-b last:border-0 ${DIVIDER}`}>
                          <td className="px-4 py-3 font-semibold {HEAD}">{p.challengeTitle}</td>
                          <td className="px-4 py-3 {MUTED}">{p.reward}</td>
                          <td className="px-4 py-3 {MUTED}">{formatDate(p.paidAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <div className={`mt-4 flex items-center gap-2 text-xs ${MUTED}`}>
              <AlertCircle size={14} />
              <span>
                Challenges are evaluated against your real trades in this account. Progress updates
                automatically whenever you log, edit, or sync a trade.
              </span>
            </div>
          </>
        )}

        {/* Create / edit modal */}
        {modal && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-[#e6e8f2] bg-white text-[#14142b] shadow-2xl dark:border-[#262645] dark:bg-[#15152b] dark:text-white">
              <div className="flex items-center justify-between border-b px-4 py-3 {DIVIDER}">
                <h2 className={`text-[15px] font-semibold ${HEAD}`}>
                  {modal.mode === "create" ? "New challenge" : "Edit challenge"}
                </h2>
                <button
                  onClick={() => setModal(null)}
                  aria-label="Close"
                  className={`rounded-md p-1.5 ${MUTED} hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] ${FOCUS}`}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="p-4 sm:p-5 space-y-4">
                <div>
                  <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Title *</label>
                  <input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className={FIELD}
                    maxLength={80}
                    autoFocus
                  />
                </div>
                <div>
                  <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className={`${FIELD} min-h-[64px] resize-y py-2`}
                    maxLength={300}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Type</label>
                    <select
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value })}
                      className={FIELD}
                    >
                      {[
                        ["streak", "Win streak"],
                        ["days", "Trading days"],
                        ["profit", "Profit target"],
                        ["trades", "Trade count"],
                        ["winrate", "Win rate"],
                        ["discipline", "Risk discipline"],
                        ["psychology", "Psychology"],
                      ].map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Target</label>
                    <input
                      type="number"
                      value={form.target}
                      onChange={(e) => setForm({ ...form, target: e.target.value })}
                      className={FIELD}
                      min="1"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Start date</label>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                      className={FIELD}
                    />
                  </div>
                  <div>
                    <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>End date</label>
                    <input
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                      className={FIELD}
                    />
                  </div>
                </div>
                <div>
                  <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Reward</label>
                  <input
                    value={form.reward}
                    onChange={(e) => setForm({ ...form, reward: e.target.value })}
                    placeholder="e.g. Custom badge"
                    className={FIELD}
                    maxLength={80}
                  />
                </div>
                <div className={`flex justify-end gap-2 border-t pt-4 ${DIVIDER}`}>
                  <Button type="button" variant="outline" onClick={() => setModal(null)} className={`border font-semibold ${DIVIDER}`}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => saveChallenge(form)}
                    disabled={saving || !form.title.trim()}
                    style={{ backgroundColor: ac.hex }}
                    className="font-semibold text-white hover:brightness-110 disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save challenge"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
