"use client";

import { useState } from "react";

/**
 * Service-area picker for tradies (v8 R8.3). Tap the common Melbourne
 * suburbs you cover, or type any other and add it as a chip. Deliberately
 * lightweight — a clickable-map suburb selector is a nice future upgrade but
 * would slow onboarding and needs boundary data; chips get the job done in
 * seconds. Selected suburbs scope which jobs the tradie is pinged for.
 */

const POPULAR: string[] = [
  "Melbourne CBD", "Carlton", "Fitzroy", "Collingwood", "Richmond", "South Yarra",
  "Prahran", "St Kilda", "Brunswick", "Northcote", "Preston", "Coburg",
  "Footscray", "Yarraville", "Williamstown", "Essendon", "Moonee Ponds",
  "Hawthorn", "Camberwell", "Box Hill", "Doncaster", "Ringwood",
  "Dandenong", "Frankston", "Werribee", "Sunshine", "Craigieburn", "Reservoir",
];

export function SuburbChips({ onChange }: { onChange: (suburbs: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  function set(next: string[]) {
    setSelected(next);
    onChange(next);
  }
  function toggle(s: string) {
    set(selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s]);
  }
  function addDraft() {
    const s = draft.trim();
    if (s && !selected.some((x) => x.toLowerCase() === s.toLowerCase())) set([...selected, s]);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggle(s)}
              className="rounded-full bg-hivis-400 px-3 py-1 text-xs font-semibold text-field-950"
            >
              {s} ✕
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {POPULAR.filter((s) => !selected.includes(s)).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => toggle(s)}
            className="rounded-full border border-field-line bg-field-900 px-3 py-1 text-xs text-white/60 hover:border-hivis-400/60 hover:text-white"
          >
            + {s}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addDraft();
            }
          }}
          placeholder="Other suburb — type and press Enter"
          className="min-w-0 flex-1 rounded-xl border border-field-line bg-field-900 px-4 py-2.5 text-sm text-white placeholder:text-white/30"
        />
        <button
          type="button"
          onClick={addDraft}
          className="rounded-xl border border-field-line bg-field-800 px-3 py-2.5 text-sm font-semibold text-white/70"
        >
          Add
        </button>
      </div>
    </div>
  );
}
