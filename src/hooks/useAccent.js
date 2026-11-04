import { useEffect, useState } from "react";

// One accent palette shared by every page (same storage key as Dashboard + Journal)
export const ACCENTS = {
  indigo: { name: "Indigo", hex: "#6366f1", hex2: "#a855f7" },
  emerald: { name: "Emerald", hex: "#10b981", hex2: "#06b6d4" },
  cyan: { name: "Ocean", hex: "#06b6d4", hex2: "#3b82f6" },
  amber: { name: "Amber", hex: "#f59e0b", hex2: "#ef4444" },
  rose: { name: "Rose", hex: "#f43f5e", hex2: "#ec4899" },
};

export const CARD =
  "rounded-2xl bg-white/80 dark:bg-gray-800/60 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg hover:shadow-xl transition-all duration-200";

export default function useAccent() {
  const [accent, setAccent] = useState(() => {
    try {
      const saved = localStorage.getItem("forgexAccent");
      return ACCENTS[saved] ? saved : "indigo";
    } catch {
      return "indigo";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("forgexAccent", accent);
    } catch {}
  }, [accent]);

  return { accent, setAccent, ac: ACCENTS[accent] || ACCENTS.indigo };
}
