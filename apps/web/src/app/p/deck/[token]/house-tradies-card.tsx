"use client";

import { useState, useTransition } from "react";
import type { HouseTradiesView } from "@/lib/data-types";
import { setHouseTradiesAction } from "@/app/p/actions";

/**
 * House tradies (v8 R7): up to 3 defaults for small jobs — the PM's own
 * handyman identity, an onsite man, or a standing agreement. Small
 * fixed-band jobs at this PM's properties dispatch to these FIRST; bigger
 * jobs still race the open network.
 */
export function HouseTradiesCard({ token, initial }: { token: string; initial: HouseTradiesView }) {
  const [selected, setSelected] = useState<string[]>(initial.tradies.map((t) => t.contactId));
  const [maxDollars, setMaxDollars] = useState(String(Math.round(initial.maxJobCents / 100)));
  const [saved, setSaved] = useState<null | "ok" | string>(null);
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setSaved(null);
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 3 ? [...prev, id] : prev));
  }

  return (
    <div className="rounded-2xl border border-field-line bg-field-900 p-4">
      <p className="font-bold text-white">House tradies</p>
      <p className="text-xs text-white/40">
        Small jobs go to your defaults first — your own handyman, the onsite man, or a standing agreement. Pick up to
        3 in order of preference; anything bigger races the open network as usual.
      </p>

      <div className="mt-3 flex flex-col gap-1.5">
        {initial.networkTradies.map((t) => {
          const idx = selected.indexOf(t.contactId);
          return (
            <button
              key={t.contactId}
              type="button"
              disabled={pending}
              onClick={() => toggle(t.contactId)}
              className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left ${
                idx >= 0 ? "border-hivis-400 bg-hivis-400/10" : "border-field-line bg-field-950"
              }`}
            >
              <span className="text-sm font-semibold text-white">{t.name}</span>
              <span className={`text-xs font-bold ${idx >= 0 ? "text-hivis-400" : "text-white/30"}`}>
                {idx >= 0 ? `#${idx + 1}` : "—"}
              </span>
            </button>
          );
        })}
      </div>

      <label className="mt-3 block text-[10px] uppercase tracking-wide text-white/40">
        Send to house tradies for jobs up to
        <div className="mt-1 flex items-center gap-2">
          <span className="text-sm font-bold text-white">$</span>
          <input
            type="number"
            min={0}
            max={5000}
            value={maxDollars}
            onChange={(e) => {
              setMaxDollars(e.target.value);
              setSaved(null);
            }}
            className="w-28 rounded-xl border border-field-line bg-field-950 px-3 py-2 text-sm text-white"
          />
        </div>
      </label>

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await setHouseTradiesAction(token, {
              tradieContactIds: selected,
              maxJobCents: Math.round(Number(maxDollars) * 100) || 0,
            });
            setSaved(r.ok ? "ok" : (r.error ?? "Could not save."));
          })
        }
        className="mt-3 w-full rounded-xl bg-hivis-400 px-4 py-2.5 text-sm font-bold text-field-950 active:scale-[0.97] disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save house dispatch"}
      </button>
      {saved === "ok" && <p className="mt-1.5 text-center text-[10px] font-semibold text-mint-300">Saved ✓</p>}
      {saved && saved !== "ok" && <p className="mt-1.5 text-center text-[10px] text-red-300">{saved}</p>}
    </div>
  );
}
