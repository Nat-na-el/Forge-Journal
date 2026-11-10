// src/components/ui/TradeGrading.jsx
// Shared trade grading UI: a 1–5 star rating and a mistake tag picker.
// Used by AddTrade (new trade), Trades (edit + detail) and the Discipline report.
import React, { useState } from "react";
import { Star, X } from "lucide-react";
import { MUTED, HEAD, DIVIDER, FOCUS } from "../../lib/uiTokens";

export const MISTAKE_OPTIONS = [
  "FOMO",
  "Chased entry",
  "Moved stop",
  "Oversized",
  "Early exit",
  "Revenge trade",
  "No plan",
  "Ignored news",
  "Overtraded",
];

const stars = [1, 2, 3, 4, 5];

export function StarRating({
  value = 0,
  onChange,
  accent = "#6C47FF",
  size = 20,
  readOnly = false,
  label = "Trade rating",
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || Number(value) || 0;

  if (readOnly) {
    return (
      <div className="flex items-center gap-0.5" aria-label={`${Number(value) || 0} out of 5`}>
        {stars.map((n) => (
          <Star
            key={n}
            size={size}
            strokeWidth={1.8}
            style={{ color: n <= shown ? accent : undefined }}
            fill={n <= shown ? accent : "none"}
            className={n <= shown ? "" : MUTED}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
      {stars.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={Number(value) === n}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange?.(Number(value) === n ? 0 : n)}
          className={`rounded transition-transform hover:scale-110 ${FOCUS}`}
          style={{ color: n <= shown ? accent : undefined }}
        >
          <Star
            size={size}
            strokeWidth={1.8}
            fill={n <= shown ? accent : "none"}
            className={n <= shown ? "" : MUTED}
          />
        </button>
      ))}
      <span className={`ml-1 text-xs font-semibold tabular-nums ${MUTED}`}>
        {Number(value) ? `${value}/5` : "Not rated"}
      </span>
    </div>
  );
}

export function MistakePicker({
  value = [],
  onChange,
  accent = "#6C47FF",
  options = MISTAKE_OPTIONS,
}) {
  const [custom, setCustom] = useState("");
  const selected = Array.isArray(value) ? value : [];

  const toggle = (mistake) =>
    onChange(
      selected.includes(mistake)
        ? selected.filter((m) => m !== mistake)
        : [...selected, mistake]
    );

  const addCustom = () => {
    const next = custom.trim();
    if (!next || selected.includes(next)) {
      setCustom("");
      return;
    }
    onChange([...selected, next]);
    setCustom("");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((mistake) => {
          const active = selected.includes(mistake);
          return (
            <button
              key={mistake}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(mistake)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${FOCUS} ${
                active ? "text-white" : `${DIVIDER} ${MUTED} hover:text-[#14142b] dark:hover:text-white`
              }`}
              style={
                active
                  ? { backgroundColor: accent, borderColor: accent }
                  : undefined
              }
            >
              {mistake}
            </button>
          );
        })}
      </div>

      {selected.filter((m) => !options.includes(m)).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected
            .filter((m) => !options.includes(m))
            .map((mistake) => (
              <span
                key={mistake}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white"
                style={{ backgroundColor: accent }}
              >
                {mistake}
                <button type="button" onClick={() => toggle(mistake)} aria-label={`Remove ${mistake}`}>
                  <X size={11} />
                </button>
              </span>
            ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="Add your own mistake…"
          className={`h-8 flex-1 rounded-lg border px-2.5 text-xs outline-none ${DIVIDER} bg-white focus:ring-2 focus:ring-[#6C47FF] dark:bg-[#101024]`}
        />
        <button
          type="button"
          onClick={addCustom}
          className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${DIVIDER} ${HEAD} ${FOCUS}`}
        >
          Add
        </button>
      </div>
    </div>
  );
}

/** Read-only display used on the trade detail card. */
export function GradingSummary({ rating = 0, mistakes = [], accent = "#6C47FF" }) {
  const hasRating = Number(rating) > 0;
  const hasMistakes = Array.isArray(mistakes) && mistakes.length > 0;
  if (!hasRating && !hasMistakes) return null;

  return (
    <div className="space-y-2">
      {hasRating && (
        <div>
          <div className={`mb-1 text-[11px] font-medium ${MUTED}`}>Trade rating</div>
          <StarRating value={Number(rating)} accent={accent} readOnly size={16} />
        </div>
      )}
      {hasMistakes && (
        <div>
          <div className={`mb-1 text-[11px] font-medium ${MUTED}`}>Mistakes</div>
          <div className="flex flex-wrap gap-1.5">
            {mistakes.map((mistake) => (
              <span
                key={mistake}
                className="rounded-md bg-[#f2556e]/10 px-2 py-1 text-[11px] font-semibold text-[#d93a57] dark:text-[#ff6b86]"
              >
                {mistake}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
