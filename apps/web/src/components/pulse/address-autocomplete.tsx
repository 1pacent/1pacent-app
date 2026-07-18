"use client";

import { useEffect, useRef, useState } from "react";

export interface PickedAddress {
  gnafPid: string;
  formattedAddress: string;
  suburb: string;
  state: string;
  postcode: string;
  lat: number;
  lng: number;
}

/**
 * Verified-address entry (Geoscape/G-NAF): type 4+ characters, pick the real
 * address — no typos, one canonical record. Degrades to plain text entry
 * when the lookup isn't configured or reachable.
 */
export function AddressAutocomplete({
  placeholder = "Property address",
  onPick,
  className = "",
}: {
  placeholder?: string;
  onPick: (picked: PickedAddress | null) => void;
  className?: string;
}) {
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<Array<{ id: string; address: string }>>([]);
  const [picked, setPicked] = useState<PickedAddress | null>(null);
  const [lookupDown, setLookupDown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (picked || lookupDown || text.trim().length < 4) {
      setSuggestions([]);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/address-lookup?q=${encodeURIComponent(text)}`);
        if (res.status === 501) {
          setLookupDown(true);
          return;
        }
        const body = (await res.json()) as { suggestions?: Array<{ id: string; address: string }> };
        setSuggestions(body.suggestions ?? []);
      } catch {
        setLookupDown(true);
      }
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [text, picked, lookupDown]);

  async function pick(id: string, label: string) {
    setText(label);
    setSuggestions([]);
    try {
      const res = await fetch(`/api/address-lookup?id=${encodeURIComponent(id)}`);
      const body = (await res.json()) as { ok: boolean; detail?: PickedAddress & { addressLine: string } };
      if (body.ok && body.detail) {
        setPicked(body.detail);
        onPick(body.detail);
      }
    } catch {
      /* keep the label text; treated as free text */
    }
  }

  return (
    <div className={`relative ${className}`}>
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (picked) {
            setPicked(null);
            onPick(null);
          }
        }}
        placeholder={lookupDown ? `${placeholder} (free text)` : placeholder}
        className="w-full rounded-xl border border-field-line bg-field-900 px-4 py-3 text-sm text-white placeholder:text-white/30"
      />
      {picked && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-mint-300">
          verified ✓
        </span>
      )}
      {suggestions.length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-field-line bg-field-900 shadow-xl">
          {suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => void pick(s.id, s.address)}
              className="block w-full px-4 py-2.5 text-left text-sm text-white/80 hover:bg-field-800"
            >
              {s.address}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
