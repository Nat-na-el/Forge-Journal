// src/pages/Pricing.jsx
// Pricing / paywall page. Shows subscription tiers and a Stripe checkout
// stub. When STRIPE_SECRET_KEY is not configured, the Subscribe button opens
// a coming-soon dialog instead of failing silently.
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  sendEmailVerification,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { useTheme } from "../Theme-provider";
import useAccent from "../hooks/useAccent";
import AccentPicker from "../components/ui/AccentPicker";
import {
  Crown,
  ShieldCheck,
  AlertTriangle,
  Lock,
  X,
} from "lucide-react";
import {
  MUTED,
  HEAD,
  DIVIDER,
  CARD,
  FIELD,
  POS_T,
  FOCUS,
} from "../lib/uiTokens";

// Subscription tiers mirroring the TradeZella-inspired plans from Landing.jsx.
// In production these prices/IDs come from Stripe products.
const TIERS = [
  {
    id: "free",
    name: "Starter",
    price: 0,
    period: "forever",
    stripePriceId: null,
    popular: false,
    description: "Basic trade logging for getting started.",
    features: [
      "Basic trade logging",
      "5 performance reports",
      "Single account tracking",
      "Community challenges",
      "Standard journaling",
      "CSV export",
    ],
    proOnly: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: 35,
    period: "month",
    stripePriceId: process.env.REACT_APP_STRIPE_PRICE_PRO || null,
    popular: true,
    description: "Advanced reporting and AI-powered insights.",
    features: [
      "Unlimited trade logging",
      "50+ report categories with drilled-down views",
      "Multi-account tracking (up to 50)",
      "AI mentor with trade context",
      "Advanced backtesting with saved runs",
      "Playbooks & strategy analytics",
      "MAE/MFE and hold-time analytics",
      "Configurable breakeven band",
      "Priority support",
    ],
    proOnly: true,
  },
  {
    id: "ultra",
    name: "Ultra",
    price: 99,
    period: "month",
    stripePriceId: process.env.REACT_APP_STRIPE_PRICE_ULTRA || null,
    popular: false,
    description: "Everything in Pro, plus AI backtesting and team features.",
    features: [
      "Everything in Pro",
      "Unlimited accounts",
      "AI backtesting in plain English",
      "AI agents: habit, risk, sentiment",
      "Automatic weekly trade review",
      "Bar replay with 1-second granularity",
      "Custom API access",
      "White-label reports",
      "Dedicated account manager",
    ],
    proOnly: true,
  },
];

export default function Pricing() {
  const { accent, setAccent, ac } = useAccent();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const isDark = theme === "dark";

  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(null); // { tier, mode: "subscribe" | "coming-soon" }

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const user = auth.currentUser;
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!cancelled) {
          setSubscription(snap.exists() ? (snap.data().subscription || null) : null);
        }
      } catch (err) {
        console.warn("Could not load subscription:", err?.message || err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const stripeConfigured = Boolean(
    process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY
  );

  const openCheckout = async (tier) => {
    const user = auth.currentUser;
    if (!user) {
      navigate("/login");
      return;
    }
    if (!stripeConfigured || !tier.stripePriceId) {
      setDialog({ tier, mode: "coming-soon" });
      return;
    }
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/.netlify/functions/stripe-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          priceId: tier.stripePriceId,
          tier: tier.id,
          successUrl:
            window.location.origin +
            "/pricing?session={CHECKOUT_SESSION_ID}",
          cancelUrl: window.location.origin + "/pricing",
        }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {}
      if (!res.ok) {
        throw new Error(data.error || "Checkout failed (" + res.status + ")");
      }
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err?.message || "Could not start checkout. Try again.");
    }
  };

  const handleSession = async () => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session");
    if (!sessionId) return;
    const user = auth.currentUser;
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch("/.netlify/functions/stripe-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ sessionId }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {}
      if (res.ok && data.subscription) {
        await setDoc(
          doc(db, "users", user.uid),
          {
            subscription: data.subscription,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        setSubscription(data.subscription);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (err) {
      console.warn("Session verification failed:", err?.message || err);
    }
  };

  useEffect(() => {
    handleSession();
  }, []);

  const isPro =
    subscription &&
    subscription.status === "active" &&
    (subscription.tier === "pro" || subscription.tier === "ultra");
  const isUltra =
    subscription &&
    subscription.status === "active" &&
    subscription.tier === "ultra";
  const currentTier = subscription
    ? TIERS.find((t) => t.id === subscription.tier)
    : TIERS[0];

  const proOnlyFeature = (e) => {
    e.preventDefault();
    setDialog({ tier: TIERS[1], mode: "subscribe" });
  };

  return (
    <div className="min-h-screen w-full bg-[#f4f5fa] p-3 text-[#14142b] dark:bg-[#0b0b19] dark:text-[#e8e9f7] sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1200px]">
        {/* Header */}
        <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <h1 className={"text-2xl font-bold tracking-tight sm:text-3xl " + HEAD}>
              Pricing
            </h1>
            <p className={"mt-1 text-sm " + MUTED}>
              Choose the plan that fits your trading. Upgrade anytime.
            </p>
          </div>
          <AccentPicker accent={accent} setAccent={setAccent} className="mr-1" />
        </div>

        {/* Current subscription */}
        <Card className={CARD + " mb-5 p-0"}>
          <div className={"border-b " + DIVIDER + " px-4 py-3"}>
            <h2 className={"flex items-center gap-2 text-[15px] font-semibold " + HEAD}>
              <Crown size={16} style={{ color: ac.hex }} />
              Current plan
            </h2>
          </div>
          <div className="p-4 sm:p-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className={"rounded-xl border p-3 " + DIVIDER}>
                <div className={"text-[10px] font-medium uppercase tracking-wide " + MUTED}>
                  Plan
                </div>
                <div className={"mt-1 text-sm font-semibold " + HEAD}>
                  {currentTier.name}
                </div>
              </div>
              <div className={"rounded-xl border p-3 " + DIVIDER}>
                <div className={"text-[10px] font-medium uppercase tracking-wide " + MUTED}>
                  Status
                </div>
                <div className={"mt-1 text-sm font-semibold " + (isPro ? POS_T : HEAD)}>
                  {subscription && subscription.status === "active"
                    ? "Active · " +
                      subscription.tier.charAt(0).toUpperCase() +
                      subscription.tier.slice(1)
                    : "Free (Starter)"}
                </div>
              </div>
              <div className={"rounded-xl border p-3 " + DIVIDER}>
                <div className={"text-[10px] font-medium uppercase tracking-wide " + MUTED}>
                  Billing cycle
                </div>
                <div className={"mt-1 text-sm font-semibold " + HEAD}>
                  {currentTier.period}
                </div>
              </div>
            </div>
            {subscription && subscription.status === "active" && (
              <div className={"mt-3 flex items-center gap-2 text-xs " + MUTED}>
                <Lock size={12} />
                <span>
                  Managed via Stripe. Cancel anytime from your customer portal.
                </span>
              </div>
            )}
          </div>
        </Card>

        {/* Tiers */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {TIERS.map((tier) => {
            const isCurrent =
              subscription
                ? subscription.tier === tier.id
                : tier.id === "free";
            const isPopular = tier.popular && !isCurrent;
            return (
              <Card
                key={tier.id}
                className={
                  CARD +
                  " p-0 overflow-hidden relative " +
                  (isPopular
                    ? "ring-2 ring-[#6C47FF] shadow-lg"
                    : "") +
                  (isCurrent ? " border-[#6C47FF]/50" : " border-transparent")
                }
              >
                <div className={"px-4 py-4 border-b " + DIVIDER}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={"text-[11px] font-medium uppercase tracking-wide " + MUTED}>
                        {isPopular ? "Most popular" : tier.name === "Starter" ? "Free" : "Paid"}
                      </div>
                      <h3 className={"text-lg font-bold " + HEAD}>
                        {tier.name}
                      </h3>
                    </div>
                    {isPopular && (
                      <div className="rounded-md bg-[#6C47FF] px-2 py-0.5 text-xs font-semibold text-white">
                        Popular
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className={"text-3xl font-bold " + HEAD}>
                      ${tier.price}
                    </span>
                    <span className={"text-sm " + MUTED}>
                      {tier.price > 0 ? "/mo" : ""}
                    </span>
                  </div>
                  <p className={"mt-1 text-xs " + MUTED}>
                    {tier.description}
                  </p>
                </div>
                <div className="p-4">
                  <ul className="space-y-2">
                    {tier.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <ShieldCheck
                          size={12}
                          className="mt-0.5 shrink-0 text-[#22c493] dark:text-[#2dd4a0]"
                        />
                        <span className={MUTED}>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={"px-4 py-4 border-t " + DIVIDER}>
                  <Button
                    onClick={(e) => {
                      if (tier.proOnly && !isPro) {
                        proOnlyFeature(e);
                        return;
                      }
                      openCheckout(tier);
                    }}
                    disabled={tier.id === "free" && !isCurrent}
                    style={
                      tier.id === "free" && !isCurrent
                        ? {}
                        : { backgroundColor: ac.hex }
                    }
                    className={
                      "w-full font-semibold text-white hover:brightness-110 disabled:opacity-50 disabled:bg-transparent disabled:text-" +
                      MUTED +
                      " disabled:border"
                    }
                  >
                    {tier.id === "free" && !isCurrent
                      ? "Upgrade"
                      : isCurrent
                      ? "Current plan"
                      : "Subscribe"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Feature comparison */}
        <Card className={CARD + " mt-5 p-0"}>
          <div className={"border-b " + DIVIDER + " px-4 py-3"}>
            <h2 className={"text-[15px] font-semibold " + HEAD}>Feature comparison</h2>
          </div>
          <div className="overflow-x-auto p-4 sm:p-5">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className={"border-b " + DIVIDER}>
                  <th className={"px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide " + MUTED}>
                    Feature
                  </th>
                  {TIERS.map((t) => (
                    <th
                      key={t.id}
                      className={"px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide " + MUTED}
                    >
                      {t.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  "Unlimited trade logging",
                  "Performance reports",
                  "Multi-account tracking",
                  "AI mentor",
                  "Backtesting",
                  "Playbooks",
                  "MAE/MFE analytics",
                  "Breakeven band",
                  "AI backtesting (plain English)",
                  "Weekly AI review",
                  "Bar replay",
                  "API access",
                  "Dedicated support",
                ].map((feature, i) => (
                  <tr key={i} className={"border-b " + DIVIDER}>
                    <td className={"px-3 py-2 text-sm font-medium " + HEAD}>
                      {feature}
                    </td>
                    {TIERS.map((t) => {
                      const has =
                        (t.id === "free" &&
                          [
                            "Basic trade logging",
                            "5 performance reports",
                            "Single account tracking",
                            "Community challenges",
                            "Standard journaling",
                            "CSV export",
                          ].includes(feature)) ||
                        (t.id !== "free" &&
                          [
                            "Unlimited trade logging",
                            "50+ report categories with drilled-down views",
                            "Multi-account tracking (up to 50)",
                            "AI mentor with trade context",
                            "Advanced backtesting with saved runs",
                            "Playbooks & strategy analytics",
                            "MAE/MFE and hold-time analytics",
                            "Configurable breakeven band",
                            "Priority support",
                          ].includes(feature)) ||
                        (t.id === "ultra" &&
                          [
                            "Unlimited accounts",
                            "AI backtesting in plain English",
                            "AI agents: habit, risk, sentiment",
                            "Automatic weekly trade review",
                            "Bar replay with 1-second granularity",
                            "Custom API access",
                            "White-label reports",
                            "Dedicated account manager",
                          ].includes(feature));
                      return (
                        <td key={t.id} className="px-3 py-2 text-center">
                          {has ? (
                            <span className="text-[#22c493] dark:text-[#2dd4a0]">
                              <CheckIcon size={14} />
                            </span>
                          ) : (
                            <span className={MUTED}>—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Stripe not configured notice */}
        {!stripeConfigured && (
          <Card className={CARD + " mt-5 p-4 rounded-lg border border-[#f2556e]/40 bg-[#f2556e]/[0.06] dark:border-[#f2556e]/30 dark:bg-[#f2556e]/[0.04]"}>
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[#d93a57] dark:text-[#ff6b86]" />
              <div>
                <div className={"text-xs font-semibold uppercase tracking-wide " + MUTED}>
                  Stripe not configured
                </div>
                <p className={"mt-1 text-sm " + MUTED}>
                  Add REACT_APP_STRIPE_PUBLISHABLE_KEY and REACT_APP_STRIPE_PRICE_PRO/ULTRA
                  environment variables, plus a /.netlify/functions/stripe-checkout function,
                  to enable real subscriptions. Until then, the Subscribe button shows this dialog.
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Subscribe / coming-soon dialog */}
      {dialog && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#e6e8f2] bg-white text-[#14142b] shadow-2xl dark:border-[#262645] dark:bg-[#15152b] dark:text-white">
            <div className={"flex items-center justify-between border-b px-4 py-3 " + DIVIDER}>
              <h2 className={"text-[15px] font-semibold " + HEAD}>
                {dialog.mode === "coming-soon" ? "Coming soon" : "Upgrade to Pro"}
              </h2>
              <button
                onClick={() => setDialog(null)}
                aria-label="Close"
                className={"rounded-md p-1.5 " + MUTED + " hover:bg-[#f1f2f8] dark:hover:bg-[#1e1e3a] " + FOCUS}
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 sm:p-5">
              {dialog.mode === "coming-soon" ? (
                <>
                  <p className={"mb-3 text-sm " + HEAD}>
                    Real Stripe checkout for{" "}
                    <span className="font-semibold">{dialog.tier.name}</span>
                    is not yet configured on this deployment.
                  </p>
                  <p className={"text-sm " + MUTED}>
                    Contact the administrator to enable payments, or upgrade
                    directly through the deployed site at forgejournal.netlify.app.
                  </p>
                </>
              ) : (
                <>
                  <p className={"mb-3 text-sm " + HEAD}>
                    Upgrade to <span className="font-semibold">Pro</span> for $35/month.
                  </p>
                  <p className={"mb-4 text-sm " + MUTED}>
                    Includes 50+ report categories, AI mentor, advanced backtesting,
                    playbooks, MAE/MFE analytics, and priority support.
                  </p>
                  <Button
                    onClick={() => {
                      setDialog(null);
                      openCheckout(TIERS[1]);
                    }}
                    style={{ backgroundColor: ac.hex }}
                    className="w-full font-semibold text-white hover:brightness-110"
                  >
                    Subscribe to Pro
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Small inline check icon for the feature table (avoids extra import).
function CheckIcon({ size }) {
  return React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "3",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: "shrink-0",
  }, React.createElement("polyline", { points: "20 6 9 17 4 12" }));
}
