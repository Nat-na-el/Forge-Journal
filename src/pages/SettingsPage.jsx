import React, { useState } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { useTheme } from "../Theme-provider";
import useAccent from "../hooks/useAccent";
import AccentPicker from "../components/ui/AccentPicker";
import {
  User,
  Bell,
  Palette,
  LogOut,
  Trash2,
  Save,
  AlertCircle,
  Sun,
  Moon,
} from "lucide-react";
import {
  MUTED,
  HEAD,
  DIVIDER,
  CARD,
  FIELD,
  FOCUS,
} from "../lib/uiTokens";

const switchBtn = (active, accent) =>
  `rounded-md px-4 py-1.5 text-xs font-semibold transition-colors ${FOCUS} ${
    active
      ? "text-white shadow-sm"
      : `${MUTED} hover:text-[#14142b] dark:hover:text-white`
  }`;

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  const { accent, setAccent, ac } = useAccent();

  const [accountName, setAccountName] = useState("Trader #1");
  const [email, setEmail] = useState("trader@example.com");

  const [notifications, setNotifications] = useState({
    dailySummary: true,
    tradeAlerts: true,
    challengeReminders: true,
  });

  const handleSaveProfile = () => {
    alert("Profile updated successfully!");
  };

  const handleClearData = () => {
    if (window.confirm("⚠️ This will delete ALL your trades, notes, challenges, and settings permanently.\n\nAre you absolutely sure?")) {
      localStorage.clear();
      alert("All data cleared. Page will reload...");
      window.location.reload();
    }
  };

  const handleLogout = () => {
    if (window.confirm("Log out now?")) {
      localStorage.removeItem("currentAccountId");
      window.location.href = "/login";
    }
  };

  return (
    <div
      className={`${isDark ? "dark bg-[#0b0b19] text-[#e8e9f7]" : "bg-[#f4f5fa] text-[#14142b]"} min-h-screen w-full p-3 sm:p-6 lg:p-8`}
    >
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-5">
          <h1 className={`text-2xl font-bold tracking-tight sm:text-3xl ${HEAD}`}>Settings</h1>
          <p className={`mt-1 text-sm ${MUTED}`}>Customize your trading environment</p>
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
                  <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>
                    Account name
                  </label>
                  <input
                    type="text"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    className={FIELD}
                    placeholder="e.g. Main Account"
                  />
                </div>

                <div>
                  <label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>
                    Email for notifications
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={FIELD}
                    placeholder="you@example.com"
                  />
                </div>

                <Button
                  onClick={handleSaveProfile}
                  style={{ backgroundColor: ac.hex }}
                  className="text-white font-semibold hover:brightness-110"
                >
                  <Save size={16} className="mr-2" />
                  Save profile
                </Button>
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
                      className={switchBtn(!isDark, ac.hex)}
                      style={!isDark ? { backgroundColor: ac.hex } : undefined}
                    >
                      <Sun size={13} className="mr-1.5 inline" /> Light
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme("dark")}
                      aria-pressed={isDark}
                      className={switchBtn(isDark, ac.hex)}
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
                {[
                  ["dailySummary", "Daily summary email"],
                  ["tradeAlerts", "Trade execution alerts"],
                  ["challengeReminders", "Challenge reminders"],
                ].map(([key, label]) => (
                  <label key={key} className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3.5">
                    <span className={`text-sm ${HEAD}`}>{label}</span>
                    <input
                      type="checkbox"
                      checked={notifications[key]}
                      onChange={() =>
                        setNotifications({ ...notifications, [key]: !notifications[key] })
                      }
                      className="h-4 w-4 rounded"
                      style={{ accentColor: ac.hex }}
                    />
                  </label>
                ))}
              </div>
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
                  className={`flex w-full items-center gap-2 rounded-lg border border-[#f2556e]/40 px-3 py-2.5 text-sm font-semibold text-[#d93a57] transition-colors hover:bg-[#f2556e]/10 dark:text-[#ff6b86] ${FOCUS}`}
                >
                  <Trash2 size={16} /> Clear all data
                </button>

                <button
                  onClick={handleLogout}
                  className={`flex w-full items-center gap-2 rounded-lg border border-[#f2556e]/40 px-3 py-2.5 text-sm font-semibold text-[#d93a57] transition-colors hover:bg-[#f2556e]/10 dark:text-[#ff6b86] ${FOCUS}`}
                >
                  <LogOut size={16} /> Log out
                </button>

                <p className={`pt-1 text-center text-[11px] ${MUTED}`}>
                  These actions cannot be undone
                </p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
