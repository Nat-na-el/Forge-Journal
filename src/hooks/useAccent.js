import { useEffect, useState } from "react";
import { ACCENTS, CARD, POS_T, NEG_T } from "../lib/uiTokens";

// Re-export the shared palette so existing imports keep working.
export { ACCENTS, CARD, POS_T, NEG_T };

export default function useAccent() {
  const [accent, setAccent] = useState(() => {
    try {
      const saved = localStorage.getItem("forgexAccent");
      return ACCENTS[saved] ? saved : "zella";
    } catch {
      return "zella";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("forgexAccent", accent);
    } catch {}
  }, [accent]);

  return { accent, setAccent, ac: ACCENTS[accent] || ACCENTS.zella };
}
