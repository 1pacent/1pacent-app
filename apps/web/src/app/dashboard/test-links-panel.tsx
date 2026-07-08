"use client";

import { useState, useTransition } from "react";
import {
  mintPmPortfolioLinkAction,
  mintTenantIntakeLinkAction,
  mintTradieLeadIntakeLinkAction,
  mintTradiePortalLinkAction,
} from "./actions";

export interface TestLinkTargetsProps {
  properties: Array<{ id: string; address: string }>;
  propertyManagers: Array<{ id: string; name: string }>;
  tradies: Array<{ id: string; name: string }>;
}

type Minter = (id: string) => Promise<{ ok: true; path: string } | { ok: false; error: string }>;

function Row({ id, label, minter }: { id: string; label: string; minter: Minter }) {
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function go() {
    setError(null);
    startTransition(async () => {
      const r = await minter(id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setResult(r.path);
    });
  }

  return (
    <div className="flex flex-col gap-1.5 border-b border-slate-100 py-2.5 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-slate-700">{label}</span>
      {result ? (
        <div className="flex items-center gap-2">
          <a
            href={result}
            target="_blank"
            rel="noreferrer"
            className="rounded-md bg-brand-50 px-2.5 py-1 font-mono text-xs text-brand-700 hover:bg-brand-100"
          >
            {result} ↗
          </a>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(new URL(result, window.location.origin).toString())}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            Copy
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-red-600">{error}</span>}
          <button
            type="button"
            onClick={go}
            disabled={pending}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {pending ? "Minting…" : "Get link"}
          </button>
        </div>
      )}
    </div>
  );
}

export function TestLinksPanel({ properties, propertyManagers, tradies }: TestLinkTargetsProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-900">Test as a persona</h2>
      <p className="mt-1 text-xs text-slate-500">
        No landlord/tenant/tradie login exists yet — every persona is reached via a personal link
        (what would be emailed, texted, or QR-coded to them in production). Mint a fresh one below
        and open it in a private/incognito window to experience it as that real person would.
      </p>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Renter / owner — report an issue via Sally
      </p>
      {properties.length === 0 && <p className="mt-1 text-xs text-slate-400">No properties yet.</p>}
      {properties.map((p) => (
        <Row key={p.id} id={p.id} label={p.address} minter={mintTenantIntakeLinkAction} />
      ))}

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Property manager — informed portfolio view
      </p>
      {propertyManagers.length === 0 && <p className="mt-1 text-xs text-slate-400">No property managers yet.</p>}
      {propertyManagers.map((pm) => (
        <Row key={pm.id} id={pm.id} label={pm.name} minter={mintPmPortfolioLinkAction} />
      ))}

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Tradie — rate card &amp; leads portal
      </p>
      {tradies.length === 0 && <p className="mt-1 text-xs text-slate-400">No tradies yet.</p>}
      {tradies.map((t) => (
        <Row key={t.id} id={t.id} label={t.name} minter={mintTradiePortalLinkAction} />
      ))}

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Tradie&apos;s own customer — their AI receptionist link
      </p>
      {tradies.map((t) => (
        <Row key={t.id} id={t.id} label={`Talk to ${t.name}'s business`} minter={mintTradieLeadIntakeLinkAction} />
      ))}

      <p className="mt-4 text-xs text-slate-400">
        Landlord approval links are minted automatically once a renter&apos;s issue needs your
        decision — they&apos;ll show up inline on that property&apos;s page under the request, or
        approve directly from the dashboard.
      </p>
    </div>
  );
}
