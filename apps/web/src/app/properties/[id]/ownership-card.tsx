"use client";

import { useState, useTransition } from "react";
import { updateOwnershipAction } from "./actions";

export interface OwnershipCardProps {
  propertyId: string;
  occupancyStatus: "owner_occupied" | "tenanted" | "vacant";
  ownerContactId: string | null;
  availableOwners: Array<{ id: string; name: string }>;
}

const OCCUPANCY_LABELS: Record<OwnershipCardProps["occupancyStatus"], string> = {
  owner_occupied: "Owner-occupied",
  tenanted: "Tenanted",
  vacant: "Vacant",
};

export function OwnershipCard({ propertyId, occupancyStatus, ownerContactId, availableOwners }: OwnershipCardProps) {
  const [occupancy, setOccupancy] = useState(occupancyStatus);
  const [owner, setOwner] = useState(ownerContactId ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await updateOwnershipAction(propertyId, occupancy, owner || null);
      if (!r.ok) {
        setError(r.error ?? "Could not save.");
        return;
      }
      setSaved(true);
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-900">Ownership</h2>
      <p className="mt-1 text-xs text-slate-500">
        Who&apos;s actually responsible for this property — the start of its permanent record, kept
        even if the tenant, owner, or managing agent changes.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="occupancy" className="block text-xs font-medium text-slate-700">
            Occupancy
          </label>
          <select
            id="occupancy"
            value={occupancy}
            onChange={(e) => setOccupancy(e.target.value as OwnershipCardProps["occupancyStatus"])}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {(Object.keys(OCCUPANCY_LABELS) as OwnershipCardProps["occupancyStatus"][]).map((k) => (
              <option key={k} value={k}>
                {OCCUPANCY_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="owner" className="block text-xs font-medium text-slate-700">
            Current owner
          </label>
          <select
            id="owner"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Not set</option>
            {availableOwners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {saved && <p className="mt-2 text-xs font-medium text-brand-700">Saved ✓</p>}
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="mt-3 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
