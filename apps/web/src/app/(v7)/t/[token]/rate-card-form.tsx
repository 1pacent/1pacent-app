"use client";

import { useState, useTransition } from "react";
import { saveRateCard, type SaveRateCardResult } from "./actions";
import { RATE_CARD_CATEGORIES } from "./categories";
import type { RateCard } from "@/lib/data-types";

/** Local display formatter — no @1pacent/core import here (that barrel
 * re-exports tokens.ts / node:crypto, which breaks a "use client" bundle). */
function displayCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function RateCardForm({ token, rateCard }: { token: string; rateCard: RateCard | null }) {
  const [result, setResult] = useState<SaveRateCardResult | null>(null);
  const [pending, startTransition] = useTransition();

  function itemFor(category: string) {
    return rateCard?.items.find((i) => i.category === category);
  }

  return (
    <form
      action={(formData) => startTransition(async () => setResult(await saveRateCard(token, formData)))}
      className="space-y-6"
    >
      {result && (
        <p className={`rounded-lg px-4 py-3 text-sm ${result.ok ? "bg-brand-50 text-brand-700" : "bg-red-50 text-red-700"}`}>
          {result.ok ? "Rate card saved ✓" : result.error}
        </p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Base rates</h2>
        <p className="mt-1 text-xs text-slate-500">
          These auto-populate every quote draft — from Zaivo jobs and, once you use your own intake link,
          from your own customers too.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="callOutFee" className="block text-sm font-medium text-slate-700">
              Call-out fee
            </label>
            <input
              id="callOutFee"
              name="callOutFee"
              defaultValue={rateCard ? (rateCard.callOutFeeCents / 100).toFixed(2) : ""}
              placeholder="80.00"
              inputMode="decimal"
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="hourlyRate" className="block text-sm font-medium text-slate-700">
              Hourly rate
            </label>
            <input
              id="hourlyRate"
              name="hourlyRate"
              defaultValue={rateCard ? (rateCard.hourlyRateCents / 100).toFixed(2) : ""}
              placeholder="120.00"
              inputMode="decimal"
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Standard job prices (optional)</h2>
        <p className="mt-1 text-xs text-slate-500">
          Set a flat price, or a typical duration to estimate from your hourly rate instead. Leave both blank
          to fall back to the call-out fee + hourly rate.
        </p>
        <div className="mt-4 space-y-3">
          {RATE_CARD_CATEGORIES.map(({ value, label }) => {
            const item = itemFor(value);
            return (
              <div key={value} className="grid grid-cols-3 items-center gap-3 text-sm">
                <span className="text-slate-700">{label}</span>
                <input
                  name={`price_${value}`}
                  defaultValue={item?.flatPriceCents != null ? (item.flatPriceCents / 100).toFixed(2) : ""}
                  placeholder="Flat price $"
                  inputMode="decimal"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  name={`minutes_${value}`}
                  defaultValue={item?.typicalMinutes ?? ""}
                  placeholder="or typical minutes"
                  inputMode="numeric"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            );
          })}
        </div>
      </div>

      {rateCard && (
        <p className="text-xs text-slate-500">
          Current base: {displayCents(rateCard.callOutFeeCents)} call-out + {displayCents(rateCard.hourlyRateCents)}/hr.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save rate card"}
      </button>
    </form>
  );
}
