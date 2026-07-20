"use client";

import { useEffect, useRef, useState } from "react";

export interface PickedCompany {
  name: string;
  abn: string | null;
}

/**
 * Company / ABN lookup for the tradie & PM join forms (v8 R8.3). Type a
 * business name or ABN → pick the verified ABR record, which fills both the
 * name and the ABN. Degrades to plain manual entry when the ABR GUID isn't
 * configured or the service is unreachable — onboarding never blocks.
 */
export function CompanyLookup({
  onPick,
  className = "",
}: {
  onPick: (picked: PickedCompany) => void;
  className?: string;
}) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<Array<{ name: string; abn: string; state: string | null }>>([]);
  const [picked, setPicked] = useState<PickedCompany | null>(null);
  const [down, setDown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (picked || down || text.trim().length < 3) {
      setResults([]);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/abn-lookup?q=${encodeURIComponent(text.trim())}`);
        if (res.status === 501) {
          setDown(true);
          return;
        }
        const body = (await res.json()) as { ok: boolean; results?: Array<{ name: string; abn: string; state: string | null }> };
        setResults(body.ok ? (body.results ?? []) : []);
      } catch {
        setDown(true);
      }
    }, 280);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [text, picked, down]);

  const inputClass =
    "w-full rounded-xl border border-field-line bg-field-900 px-4 py-3 text-sm text-white placeholder:text-white/30";

  // Manual fallback: keep whatever they type as the company name, no ABN.
  if (down) {
    return (
      <input
        placeholder="Business / company name"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onPick({ name: e.target.value, abn: null });
        }}
        className={`${inputClass} ${className}`}
      />
    );
  }

  return (
    <div className={`relative ${className}`}>
      <input
        placeholder="Business name or ABN (start typing)"
        value={picked ? `${picked.name}${picked.abn ? ` · ${picked.abn}` : ""}` : text}
        onChange={(e) => {
          setPicked(null);
          setText(e.target.value);
          onPick({ name: e.target.value, abn: null });
        }}
        className={inputClass}
      />
      {!picked && results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-field-line bg-field-900 shadow-xl">
          {results.map((r) => (
            <li key={r.abn}>
              <button
                type="button"
                onClick={() => {
                  const p = { name: r.name, abn: r.abn };
                  setPicked(p);
                  setResults([]);
                  onPick(p);
                }}
                className="block w-full px-4 py-2.5 text-left text-sm text-white/80 hover:bg-field-800"
              >
                {r.name}
                <span className="ml-2 text-xs text-white/40">
                  {r.abn}
                  {r.state ? ` · ${r.state}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
