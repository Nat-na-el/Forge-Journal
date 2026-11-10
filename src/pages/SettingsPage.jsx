// src/pages/SettingsPage.jsx
// Real settings: the signed-in Firebase account, persisted preferences and
// destructive actions that actually touch Firestore.
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  sendEmailVerification,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import { clearAllUserData } from "../lib/firestoreData";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { useTheme } from "../Theme-provider";
import useAccent from "../hooks/useAccent";
import AccentPicker from "../components/ui/AccentPicker";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Loader2,
  LogOut,
  Mail,
  Palette,
  Save,
  ShieldCheck,
  Sun,
  Moon,
  Trash2,
  User,
} from "lucide-react";
import {
  MUTED,
  HEAD,
  DIVIDER,
  CARD,
  FIELD,
  FOCUS,
} from "../lib/uiTokens";

const prefsKey = (uid) => `fj_prefs_${uid}`;

const switchBtn = (active) =>
  `rounded-md px-4 py-1.5 text-xs font-semibold transition-colors ${FOCUS} ${
    active ? "text-white shadow-sm" : `${MUTED} hover:text-[#14142b] dark:hover:text-white`
  }`;

const NOTIFICATIONS = [
  ["dailySummary", "Daily summary email"],
  ["tradeAlerts", "Trade execution alerts"],
  ["challengeReminders", "Challenge reminders"],
];

function Status({ status }) {
  if (!status) return null;
  const error = status.type === "error";
  return (
    <div
      role="status"
      className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium ${
        error
          ? "border-[#f2556e]/40 bg-[#f2556e]/[0.06] text-[#d93a57] dark:text-[#ff6b86]"
          : "border-[#22c493]/40 bg-[#22c493]/[0.06] text-[#0e9f77] dark:text-[#2dd4a0]"
      }`}
    >
      {error ? <AlertCircle size={14} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={14} className="mt-0.5 shrink-0" />}
      <span>{status.text}</span>
    </div>
  );
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  const { accent, setAccent, ac } = useAccent();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [notifications, setNotifications] = useState({
    dailySummary: true,
    tradeAlerts: true,
    challengeReminders: true,
  });

  const [profileStatus, setProfileStatus] = useState(null);
  const [prefsStatus, setPrefsStatus] = useState(null);
  const [dangerStatus, setDangerStatus] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) return;

      setDisplayName(nextUser.displayName || "");

      const cached = (() => {
        try {
          return JSON.parse(localStorage.getItem(prefsKey(nextUser.uid)) || "null");
        } catch {
          return null;
        }
      })();
      if (cached) setNotifications((prev) => ({ ...prev, ...cached }));

      // Synced copy wins over the local cache when the rules allow reading it.
      try {
        const snap = await getDoc(doc(db, "users", nextUser.uid));
        if (snap.exists() && snap.data().notifications) {
          setNotifications((prev) => ({ ...prev, ...snap.data().notifications }));
        }
        if (snap.exists() && snap.data().displayName && !nextUser.displayName) {
          setDisplayName(snap.data().displayName);
        }
      } catch {
        /* offline or restricted – the local cache is enough */
      }
    });
    return unsubscribe;
  }, []);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    setProfileStatus(null);
    try {
      const name = displayName.trim();
      await updateProfile(user, { displayName: name || null });
      setUser(auth.currentUser);

      // Mirror the name so it survives a different device, but never fail the save
      // because of Firestore rules.
      try {
        await setDoc(
          doc(db, "users", user.uid),
          { displayName: name, updatedAt: serverTimestamp() },
          { merge: true }
        );
      } catch (err) {
        console.warn("Profile mirror skipped:", err);
      }

      setProfileStatus({ type: "success", text: "Profile updated." });
    } catch (err) {
      setProfileStatus({ type: "error", text: err?.message || "Could not update your profile." });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleResendVerification = async () => {
    if (!user) return;
    setProfileStatus(null);
    try {
      await sendEmailVerification(user);
      setProfileStatus({
        type: "success",
        text: `Verification email sent to ${user.email}. Check your inbox.`,
      });
    } catch (err) {
      setProfileStatus({ type: "error", text: err?.message || "Could not send the verification email." });
    }
  };

  const persistNotifications = async (next) => {
    if (!user) return;
    localStorage.setItem(prefsKey(user.uid), JSON.stringify(next));
    try {
      await setDoc(doc(db, "users", user.uid), { notifications: next }, { merge: true });
      setPrefsStatus({ type: "success", text: "Notification settings saved." });
    } catch (err) {
      console.warn("Notification sync skipped:", err);
      setPrefsStatus({ type: "success", text: "Saved on this device." });
    }
  };

  const toggleNotification = (key) => {
    const next = { ...notifications, [key]: !notifications[key] };
    setNotifications(next);
    persistNotifications(next);
  };

  const handleClearData = async () => {
    if (!user) return;
    const confirmed = window.confirm(
      "This permanently deletes every trade, journal entry, note, challenge and backtest in all of your accounts.\n\nYour login and account names stay. Continue?"
    );
    if (!confirmed) return;

    setClearing(true);
    setDangerStatus(null);
    try {
      const { deleted, accounts, skipped } = await clearAllUserData(user.uid);

      // Drop local caches that mirror the deleted records (auth storage is untouched).
      Object.keys(localStorage).forEach((key) => {
        if (
          key === "challenges" ||
          key === "accounts" ||
          key.startsWith("dashboard_") ||
          key.startsWith("fj_prefs_") ||
          /_(trades|notes|journals)$/.test(key)
        ) {
          localStorage.removeItem(key);
        }
      });

      if (skipped.length) {
        setDangerStatus({
          type: "error",
          text: `Deleted ${deleted.toLocaleString()} record${deleted === 1 ? "" : "s"}, but could not clear: ${skipped.join(", ")}. Your Firestore rules may not cover those collections.`,
        });
      } else {
        setDangerStatus({
          type: "success",
          text: `Deleted ${deleted.toLocaleString()} record${deleted === 1 ? "" : "s"} across ${accounts} account${accounts === 1 ? "" : "s"}.`,
        });
      }
    } catch (err) {
      console.error("Clear data failed:", err);
      setDangerStatus({
        type: "error",
        text: err?.message || "Could not delete your data. Please try again.",
      });
    } finally {
      setClearing(false);
    }
  };

  const handleLogout = async () => {
    if (!window.confirm("Log out now?")) return;
    setLoggingOut(true);
    setDangerStatus(null);
    try {
      localStorage.removeItem("currentAccountId");
      await signOut(auth);
      navigate("/", { replace: true });
    } catch (err) {
      setDangerStatus({ type: "error", text: err?.message || "Could not log out." });
      setLoggingOut(false);
    }
  };

  const verified = user?.emailVerified;

  return (
    <div
      className={`${isDark ? "dark bg-[#0b0b19] text-[#e8e9f7]" : "bg-[#f4f5fa] text-[#14142b]"} min-h-screen w-full p-3 sm:p-6 lg:p-8`}
    >
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-5">
          <h1 className={`text-2xl font-bold tracking-tight sm:text-3xl ${HEAD}`}>Settings</h1>
          <p className={`mt-1 text-sm ${MUTED}`}>Your account, preferences and data</p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Main settings */}
          <div className="space-y-4 lg:col-span-2">
            {/* Profile */}
            <Card className={`${CARD} p-0`}>
              <div className={`flex items-center gap-2 border-b px-4 py-3 sm:px-5 ${DIVIDER}`}>
                <User size={16} style={{ color: ac.hex }} />
                <h2 className={`text-[15px] font-semibold ${HEAD}`}>Profile</h2>
              </div>

              <div className="space-y-4 p-4 sm:p-5">
                <div>
                  <label htmlFor="display-name" className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>
                    Display name
                  </label>
                  <input
                    id="display-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className={FIELD}
                    placeholder="e.g. Alex Trader"
                    maxLength={60}
                  />
                  <p className={`mt-1.5 text-[11px] ${MUTED}`}>
                    Shown in the top bar. Leave empty to use your email.
                  </p>
                </div>

                <div>
                  <span className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Email</span>
                  <div className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 ${DIVIDER}`}>
                    <Mail size={15} className={MUTED} />
                    <span className={`min-w-0 flex-1 truncate text-sm ${HEAD}`}>
                      {user?.email || "—"}
                    </span>
                    {verified ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0e9f77] dark:text-[#2dd4a0]">
                        <ShieldCheck size={13} /> Verified
                      </span>
                    ) : (
                      <span className={`text-[11px] font-semibold ${MUTED}`}>Not verified</span>
                    )}
                  </div>
                  {!verified && user && (
                    <button
                      type="button"
                      onClick={handleResendVerification}
                      className={`mt-2 text-[11px] font-semibold underline-offset-2 hover:underline ${FOCUS}`}
                      style={{ color: ac.hex }}
                    >
                      Resend verification email
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    onClick={handleSaveProfile}
                    disabled={savingProfile || !user}
                    style={{ backgroundColor: ac.hex }}
                    className="font-semibold text-white hover:brightness-110 disabled:opacity-50"
                  >
                    {savingProfile ? (
                      <Loader2 size={16} className="mr-2 animate-spin" />
                    ) : (
                      <Save size={16} className="mr-2" />
                    )}
                    {savingProfile ? "Saving…" : "Save profile"}
                  </Button>
                </div>

                {profileStatus && <Status status={profileStatus} />}
              </div>
            </Card>

            {/* Appearance */}
            <Card className={`${CARD} p-0`}>
              <div className={`flex items-center gap-2 border-b px-4 py-3 sm:px-5 ${DIVIDER}`}>
                <Palette size={16} style={{ color: ac.hex }} />
                <h2 className={`text-[15px] font-semibold ${HEAD}`}>Appearance</h2>
              </div>

              <div className="space-y-5 p-4 sm:p-5">
                <div>
                  <div className={`mb-2 text-xs font-semibold ${MUTED}`}>Theme</div>
                  <div className="flex w-fit rounded-lg bg-[#e9eaf4] p-1 dark:bg-[#101024]" role="group" aria-label="Theme">
                    <button
                      type="button"
                      onClick={() => setTheme("light")}
                      aria-pressed={!isDark}
                      className={switchBtn(!isDark)}
                      style={!isDark ? { backgroundColor: ac.hex } : undefined}
                    >
                      <Sun size={13} className="mr-1.5 inline" /> Light
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme("dark")}
                      aria-pressed={isDark}
                      className={switchBtn(isDark)}
                      style={isDark ? { backgroundColor: ac.hex } : undefined}
                    >
                      <Moon size={13} className="mr-1.5 inline" /> Dark
                    </button>
                  </div>
                </div>

                <div className={`border-t pt-5 ${DIVIDER}`}>
                  <div className={`mb-2 text-xs font-semibold ${MUTED}`}>Accent colour</div>
                  <div className="flex items-center gap-3">
                    <AccentPicker accent={accent} setAccent={setAccent} />
                    <span className={`text-xs ${MUTED}`}>{ac.name}</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Sidebar actions */}
          <div className="space-y-4">
            {/* Notifications */}
            <Card className={`${CARD} p-0`}>
              <div className={`flex items-center gap-2 border-b px-4 py-3 ${DIVIDER}`}>
                <Bell size={16} style={{ color: ac.hex }} />
                <h2 className={`text-[15px] font-semibold ${HEAD}`}>Notifications</h2>
              </div>

              <div className={`divide-y ${DIVIDER}`}>
                {NOTIFICATIONS.map(([key, label]) => (
                  <label key={key} className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3.5">
                    <span className={`text-sm ${HEAD}`}>{label}</span>
                    <input
                      type="checkbox"
                      checked={!!notifications[key]}
                      onChange={() => toggleNotification(key)}
                      className="h-4 w-4 rounded"
                      style={{ accentColor: ac.hex }}
                    />
                  </label>
                ))}
              </div>

              {prefsStatus && (
                <div className="px-4 pb-4">
                  <Status status={prefsStatus} />
                </div>
              )}
            </Card>

            {/* Danger zone */}
            <Card className="gap-0 rounded-xl border border-[#f2556e]/40 bg-[#f2556e]/[0.04] p-0 dark:border-[#f2556e]/30 dark:bg-[#f2556e]/[0.06]">
              <div className={`flex items-center gap-2 border-b border-[#f2556e]/25 px-4 py-3 ${HEAD}`}>
                <AlertCircle size={16} className="text-[#d93a57] dark:text-[#ff6b86]" />
                <h2 className="text-[15px] font-semibold">Danger zone</h2>
              </div>

              <div className="space-y-2.5 p-4">
                <button
                  onClick={handleClearData}
                  disabled={clearing || !user}
                  className={`flex w-full items-center gap-2 rounded-lg border border-[#f2556e]/40 px-3 py-2.5 text-sm font-semibold text-[#d93a57] transition-colors hover:bg-[#f2556e]/10 disabled:opacity-50 dark:text-[#ff6b86] ${FOCUS}`}
                >
                  {clearing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  {clearing ? "Deleting…" : "Clear all trading data"}
                </button>

                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className={`flex w-full items-center gap-2 rounded-lg border border-[#f2556e]/40 px-3 py-2.5 text-sm font-semibold text-[#d93a57] transition-colors hover:bg-[#f2556e]/10 disabled:opacity-50 dark:text-[#ff6b86] ${FOCUS}`}
                >
                  {loggingOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
                  {loggingOut ? "Logging out…" : "Log out"}
                </button>

                {dangerStatus && <Status status={dangerStatus} />}

                <p className={`pt-1 text-center text-[11px] ${MUTED}`}>
                  Clearing data cannot be undone. Your login is kept.
                </p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
