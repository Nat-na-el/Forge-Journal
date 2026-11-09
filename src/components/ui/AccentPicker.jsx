import React from "react";
import { Palette } from "lucide-react";
import { ACCENTS } from "../../hooks/useAccent";
import { MUTED, FOCUS } from "../../lib/uiTokens";

export default function AccentPicker({ accent, setAccent, className = "" }) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`} role="radiogroup" aria-label="Accent theme">
      <Palette size={15} className={MUTED} />
      {Object.entries(ACCENTS).map(([key, a]) => (
        <button
          key={key}
          type="button"
          onClick={() => setAccent(key)}
          title={a.name}
          aria-label={`${a.name} theme`}
          aria-checked={accent === key}
          role="radio"
          className={`h-5 w-5 rounded-full transition-transform ${FOCUS} ${
            accent === key
              ? "scale-110 ring-2 ring-offset-2 ring-[#8a8fb5] ring-offset-[#f4f5fa] dark:ring-white/70 dark:ring-offset-[#0b0b19]"
              : "opacity-75 hover:scale-110 hover:opacity-100"
          }`}
          style={{ backgroundImage: `linear-gradient(135deg, ${a.hex}, ${a.hex2})` }}
        />
      ))}
    </div>
  );
}
