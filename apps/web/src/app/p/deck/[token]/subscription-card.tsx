"use client";

import { useState, useTransition } from "react";
import type { PmSubscriptionView } from "@/lib/data-types";
import { selectPmSubscriptionAction } from "@/app/p/actions";

function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-AU")}`;
}

/**
 * The PM's PUM cohort (v8 R7 — HubSpot PRD-1P-004-* products): pick the
 * band that covers the doors you manage. Mirrored to the CRM as a deal and
 * to the operator console with actual PUM against the cap.
 */
export function SubscriptionCard({ token, initial }: { token: string; initial: PmSubscriptionView }) {
  const [view, setView] = useState(initial);
  const [open, setOpen] = useState(!initial.current);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const fits = (cap: number) => cap >= view.propertiesUnderManagement;

  return (
    <div className="rounded-2xl border border-field-line bg-field-900 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-bold text-white">Subscription</p>
          <p className="text-xs text-white/40">
            {view.current
              ? `${view.current.name} · ${dollars(view.current.priceCents)}/mo · managing ${view.propertiesUnderManagement} of ${view.current.propertyCap}`
              : `${view.propertiesUnderManagement} properties under management — pick your cohort`}
          </p>
        </div>
        {view.current && !open && (
          <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-hivis-400">
            Change
          </button>
        )}
      </div>

      {view.current && view.overCap && (
        <p className="mt-2 rounded-xl bg-amber-400/15 px-3 py-2 text-xs text-amber-300">
          You manage {view.propertiesUnderManagement} doors — over your {view.current.propertyCap}-property cohort.
          Step up to stay covered.
        </p>
      )}

      {open && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {view.options.map((t) => (
            <button
              key={t.sku}
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const r = await selectPmSubscriptionAction(token, t.sku);
                  if (r.ok) {
                    setView({
                      ...view,
                      current: { ...t, selectedAt: new Date().toISOString() },
                      overCap: view.propertiesUnderManagement > t.propertyCap,
                    });
                    setOpen(false);
                  } else setError(r.error ?? "Could not select.");
                });
              }}
              className={`rounded-xl border p-3 text-left transition-colors ${
                view.current?.sku === t.sku
                  ? "border-hivis-400 bg-hivis-400/10"
                  : fits(t.propertyCap)
                    ? "border-field-line bg-field-950"
                    : "border-field-line bg-field-950 opacity-50"
              }`}
            >
              <p className="text-lg font-extrabold text-white">{t.propertyCap}</p>
              <p className="text-[9px] uppercase tracking-wide text-white/40">doors</p>
              <p className="mt-1 text-xs font-bold text-hivis-400">{dollars(t.priceCents)}/mo</p>
              {!fits(t.propertyCap) && <p className="text-[9px] text-amber-300">below your PUM</p>}
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}
