import React from "react";
import { Palette } from "lucide-react";
import { ACCENTS } from "../../hooks/useAccent";

export default function AccentPicker({ accent, setAccent, className = "" }) {
  return (
    <div className={`flex items-center gap-2 ${className}`} role="radiogroup" aria-label="Accent theme">
      <Palette size={16} className="opacity-60" />
      {Object.entries(ACCENTS).map(([key, a]) => (
        <button
          key={key}
          type="button"
          onClick={() => setAccent(key)}
          title={a.name}
          aria-label={`${a.name} theme`}
          aria-pressed={accent === key}
          className={`h-6 w-6 rounded-full transition-transform ${
            accent === key
              ? "ring-2 ring-offset-2 ring-offset-transparent ring-gray-500 dark:ring-white/70 scale-110"
              : "opacity-80 hover:scale-110"
          }`}
          style={{ backgroundImage: `linear-gradient(135deg, ${a.hex}, ${a.hex2})` }}
        />
      ))}
    </div>
  );
}
