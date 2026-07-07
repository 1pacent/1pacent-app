"use client";

import { useState, useTransition } from "react";
import { lodgeRequest, type IntakeResult } from "./actions";

const CATEGORY_OPTIONS: Array<{ value: string; label: string; urgent?: boolean }> = [
  { value: "failure_of_essential_service_hot_water", label: "No hot water", urgent: true },
  { value: "gas_leak", label: "Gas leak / gas smell", urgent: true },
  { value: "burst_water_service", label: "Burst water pipe", urgent: true },
  { value: "blocked_or_broken_toilet", label: "Blocked or broken toilet", urgent: true },
  { value: "dangerous_electrical_fault", label: "Dangerous electrical fault", urgent: true },
  { value: "failure_of_essential_service_heating", label: "Heating not working", urgent: true },
  { value: "unsafe_or_insecure_premises", label: "Property unsafe / can't lock up", urgent: true },
  { value: "plumbing_general", label: "Plumbing (leaks, taps, drains)" },
  { value: "electrical_general", label: "Electrical (lights, switches, power)" },
  { value: "appliance_general", label: "Appliance problem" },
  { value: "doors_windows_locks", label: "Doors, windows or locks" },
  { value: "walls_ceilings_floors", label: "Walls, ceilings or floors" },
  { value: "pest_control", label: "Pests" },
  { value: "garden_external", label: "Garden / outside" },
  { value: "other", label: "Something else" },
];

export function IntakeForm({ token }: { token: string }) {
  const [result, setResult] = useState<IntakeResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (result?.ok) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
        <h2 className="text-lg font-semibold text-emerald-900">Request lodged ✓</h2>
        <p className="mt-2 text-sm text-emerald-800">
          {result.urgent
            ? "This is classed as an urgent repair under Victorian law — it has been fast-tracked and a tradie will be contacted immediately."
            : "Your rental provider has been notified and will review it shortly."}
        </p>
        <p className="mt-2 text-xs text-emerald-700">Reference: {result.requestId}</p>
      </div>
    );
  }

  return (
    <form
      action={(formData) => startTransition(async () => setResult(await lodgeRequest(token, formData)))}
      className="space-y-5"
    >
      {result && !result.ok && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{result.error}</p>
      )}

      <div>
        <label htmlFor="category" className="block text-sm font-medium text-slate-700">
          What kind of problem is it?
        </label>
        <select
          id="category"
          name="category"
          required
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
        >
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
              {o.urgent ? " (urgent)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-slate-700">
          Sum it up in a line
        </label>
        <input
          id="title"
          name="title"
          required
          minLength={3}
          placeholder="e.g. Hot water system not working"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-slate-700">
          Any details that would help (optional)
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          placeholder="When did it start? Where exactly is it?"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
        />
      </div>

      <p className="text-xs text-slate-500">
        Photo upload and access windows land with the evidence vault (Epic 2) — omitted from this
        demo build.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send to my rental provider"}
      </button>
    </form>
  );
}
