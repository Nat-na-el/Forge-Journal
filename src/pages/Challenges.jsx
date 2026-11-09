import React, { useState, useEffect } from "react";
import { format, endOfMonth } from "date-fns";
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
} from "lucide-react";
import {
  POS_T,
  MUTED,
  HEAD,
  DIVIDER,
  CARD,
  PANEL,
} from "../lib/uiTokens";

// Sample data — in real app you would load from localStorage or backend
const SAMPLE_CHALLENGES = [
  {
    id: "consistency-30",
    title: "30-Day Consistency Challenge",
    description: "Execute at least 1 trade every trading day for 30 consecutive days",
    target: 30,
    current: 12,
    type: "streak",
    reward: "Custom badge + premium journal template",
    active: true,
    endDate: new Date(2025, 2, 15).toISOString(),
  },
  {
    id: "profit-goal",
    title: "Monthly Profit Goal",
    description: "Achieve +$500 net profit this month",
    target: 500,
    current: 320,
    type: "profit",
    reward: "Double mentor sessions next month",
    active: true,
    endDate: endOfMonth(new Date()).toISOString(),
  },
  {
    id: "risk-control",
    title: "Max 1% Risk Discipline",
    description: "Complete 50 trades without exceeding 1% account risk on any trade",
    target: 50,
    current: 28,
    type: "discipline",
    reward: "Priority support + personalized trade review",
    active: true,
    endDate: new Date(2025, 5, 30).toISOString(),
  },
  {
    id: "no-revenge",
    title: "No Revenge Trading",
    description: "Avoid revenge trades for 60 consecutive days",
    target: 60,
    current: 0,
    type: "psychology",
    reward: "Psychology deep-dive session",
    active: false,
    completed: true,
  },
];

export default function Challenges() {
  const { accent, setAccent, ac } = useAccent();
  const [challenges, setChallenges] = useState([]);

  // Load or initialize challenges
  useEffect(() => {
    const saved = localStorage.getItem("challenges");
    if (saved) {
      setChallenges(JSON.parse(saved));
    } else {
      setChallenges(SAMPLE_CHALLENGES);
      localStorage.setItem("challenges", JSON.stringify(SAMPLE_CHALLENGES));
    }
  }, []);

  const getProgress = (challenge) =>
    Math.min(100, Math.round((challenge.current / challenge.target) * 100));

  const formatDate = (isoString) => {
    try {
      return format(new Date(isoString), "MMM d, yyyy");
    } catch {
      return "—";
    }
  };

  const activeChallenges = challenges.filter((c) => c.active);
  const completedChallenges = challenges.filter((c) => !c.active && c.completed);
  const avgProgress = activeChallenges.length
    ? Math.round(activeChallenges.reduce((sum, c) => sum + getProgress(c), 0) / activeChallenges.length)
    : 0;

  const summary = [
    ["Active", activeChallenges.length],
    ["Completed", completedChallenges.length],
    ["Avg progress", `${avgProgress}%`],
    ["Rewards at stake", `${challenges.filter((c) => c.active).length}`],
  ];

  const challengeCard = (challenge) => {
    const progress = getProgress(challenge);
    const isCompleted = progress >= 100;
    return (
      <Card key={challenge.id} className={`${CARD} relative overflow-hidden p-0`}>
        {isCompleted && (
          <div
            className="absolute right-0 top-0 rounded-bl-lg px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white"
            style={{ backgroundColor: ac.hex }}
          >
            Completed
          </div>
        )}

        <div className={`flex items-start justify-between gap-3 border-b px-4 py-3.5 ${DIVIDER}`}>
          <div className="min-w-0 pr-8">
            <h3 className={`text-[15px] font-semibold ${HEAD}`}>{challenge.title}</h3>
            <p className={`mt-0.5 text-xs ${MUTED}`}>{challenge.description}</p>
          </div>
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{
              backgroundColor: isCompleted ? "rgba(34,196,147,0.14)" : `${ac.hex}1f`,
              color: isCompleted ? "#0e9f77" : ac.hex,
            }}
          >
            {isCompleted ? <CheckCircle2 size={20} /> : <Target size={20} />}
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs font-medium">
              <span className={MUTED}>Progress</span>
              <span className={HEAD}>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#e6e8f2] dark:bg-[#262645]">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${progress}%`,
                  backgroundColor: isCompleted ? "#22c493" : ac.hex,
                }}
              />
            </div>
          </div>

          <div className={`flex items-center justify-between text-xs ${MUTED}`}>
            <span className="font-medium">
              {challenge.current} / {challenge.target}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock size={13} /> Ends {formatDate(challenge.endDate)}
            </span>
          </div>
        </div>

        <div className={`flex items-start gap-2 border-t px-4 py-3 text-xs ${DIVIDER} ${MUTED}`}>
          <Trophy size={14} className="mt-0.5 shrink-0 text-amber-500" />
          <span>
            <span className="font-semibold text-[#14142b] dark:text-white">Reward:</span> {challenge.reward}
          </span>
        </div>
      </Card>
    );
  };

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
              Build discipline · Track progress · Unlock rewards
            </p>
          </div>
          <AccentPicker accent={accent} setAccent={setAccent} />
        </div>

        {challenges.length === 0 ? (
          <Card className={`${CARD} p-10 text-center`}>
            <Target size={36} className={`mx-auto mb-3 opacity-40 ${MUTED}`} />
            <p className={`text-lg font-semibold ${HEAD}`}>No challenges yet</p>
            <p className={`mx-auto mb-5 mt-1 max-w-md text-sm ${MUTED}`}>
              Start a challenge to push your trading skills and stay accountable.
            </p>
            <Button
              style={{ backgroundColor: ac.hex }}
              className="font-semibold text-white hover:brightness-110"
            >
              Create your first challenge
            </Button>
          </Card>
        ) : (
          <div className="space-y-5">
            {/* Summary strip */}
            <Card className={`${CARD} overflow-hidden`}>
              <div className="grid grid-cols-2 gap-px bg-[#e6e8f2] dark:bg-[#262645] md:grid-cols-4">
                {summary.map(([label, value]) => (
                  <div key={label} className="bg-white px-4 py-4 dark:bg-[#15152b]">
                    <div className={`text-[11px] font-medium ${MUTED}`}>{label}</div>
                    <div className={`mt-1 text-xl font-bold tabular-nums ${HEAD}`}>{value}</div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Active */}
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className={`flex items-center gap-2 text-[15px] font-semibold ${HEAD}`}>
                  <Flame size={17} className="text-amber-500" /> Active challenges
                </h2>
                <span className={`text-xs ${MUTED}`}>{activeChallenges.length} running</span>
              </div>

              {activeChallenges.length === 0 ? (
                <Card className={`${CARD} p-8 text-center`}>
                  <p className={`text-sm ${MUTED}`}>No active challenges right now.</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {activeChallenges.map(challengeCard)}
                </div>
              )}
            </section>

            {/* Completed */}
            {completedChallenges.length > 0 && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className={`flex items-center gap-2 text-[15px] font-semibold ${HEAD}`}>
                    <Trophy size={17} className="text-amber-500" /> Completed challenges
                  </h2>
                  <span className={`text-xs ${MUTED}`}>{completedChallenges.length} earned</span>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {completedChallenges.map((challenge) => (
                    <Card key={challenge.id} className={`${CARD} p-4`}>
                      <div className="flex items-start gap-3">
                        <div className={`${PANEL} flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${POS_T}`}>
                          <CheckCircle2 size={20} />
                        </div>
                        <div className="min-w-0">
                          <h3 className={`text-sm font-semibold ${HEAD}`}>{challenge.title}</h3>
                          <p className={`mt-0.5 text-xs ${MUTED}`}>{challenge.description}</p>
                          <div className={`mt-3 inline-flex items-center gap-1.5 text-xs font-semibold ${POS_T}`}>
                            <Trophy size={13} /> {challenge.reward}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            <div className={`flex items-center gap-2 text-xs ${MUTED}`}>
              <AlertCircle size={14} />
              Progress is saved on this device. Connect an account to sync challenges across devices.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
