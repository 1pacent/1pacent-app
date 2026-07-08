"use client";

import { useState, useTransition } from "react";
import { saveApprovalPolicyAction } from "./actions";

export interface PolicyCardRule {
  maxTotalDisplay: string;
  minTrustScore: number | null;
  excludesGasElectrical: boolean;
}

export function PolicyCard({ propertyId, existingRules }: { propertyId: string; existingRules: PolicyCardRule[] }) {
  const tier1 = existingRules.find((r) => r.minTrustScore === null);
  const tier2 = existingRules.find((r) => r.minTrustScore !== null);
  const excludeGasElectrical = existingRules.some((r) => r.excludesGasElectrical);

  const [underCap, setUnderCap] = useState(tier1?.maxTotalDisplay ?? "");
  const [trustCap, setTrustCap] = useState(tier2?.maxTotalDisplay ?? "");
  const [trustMin, setTrustMin] = useState(tier2?.minTrustScore != null ? String(tier2.minTrustScore) : "80");
  const [excludeSafety, setExcludeSafety] = useState(excludeGasElectrical || existingRules.length === 0);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await saveApprovalPolicyAction(propertyId, {
        underCapDollars: underCap,
        trustTierCapDollars: trustCap,
        trustTierMinScore: trustMin,
        excludeGasElectrical: excludeSafety,
      });
      if (!r.ok) {
        setError(r.error ?? "Could not save.");
        return;
      }
      setSaved(true);
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-900">Approval policy</h2>
      <p className="mt-1 text-xs text-slate-500">
        Once the 3 quotes are in, the top-ranked one is checked against this — matching rules dispatch
        automatically, with no tap from you. Anything that doesn&apos;t match still waits for your decision,
        same as today.
      </p>

      <div className="mt-4 space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-slate-700">Auto-approve under $</span>
          <input
            value={underCap}
            onChange={(e) => setUnderCap(e.target.value)}
            placeholder="300"
            inputMode="decimal"
            className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
          <span className="text-slate-500">— any tradie</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-700">Auto-approve under $</span>
          <input
            value={trustCap}
            onChange={(e) => setTrustCap(e.target.value)}
            placeholder="800"
            inputMode="decimal"
            className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
          <span className="text-slate-700">if trust score is at least</span>
          <input
            value={trustMin}
            onChange={(e) => setTrustMin(e.target.value)}
            placeholder="80"
            inputMode="numeric"
            className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-slate-700">
          <input type="checkbox" checked={excludeSafety} onChange={(e) => setExcludeSafety(e.target.checked)} />
          Never auto-approve gas or electrical faults — always ask me
        </label>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {saved && <p className="mt-2 text-xs font-medium text-emerald-700">Policy saved ✓</p>}
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="mt-3 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save policy"}
      </button>
    </div>
  );
}
