"use client";

import { useState, useTransition } from "react";
import type { BillingTier } from "@/lib/pm-tiers";
import { saveTierAction, saveSettingsAction, provisionTierAction, provisionAllAction, importHubspotAction } from "./actions";

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`;
}
function monthly(t: { baseFeeCents: number; perPropertyCents: number; propertyCap: number }): number {
  return t.baseFeeCents + t.perPropertyCents * t.propertyCap;
}

export function BillingConsole({
  tiers,
  settings,
  status,
}: {
  tiers: BillingTier[];
  settings: { transactionFeeBps: number; fastpayFeeBps: number; currency: string };
  status: { stripe: boolean; hubspot: boolean };
}) {
  const [banner, setBanner] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const flash = (msg: string) => {
    setBanner(msg);
    setTimeout(() => setBanner(null), 6000);
  };

  return (
    <div className="flex flex-col gap-6">
      {banner && (
        <div className="rounded-xl border border-hivis-400/40 bg-hivis-400/10 px-4 py-3 text-sm text-hivis-200">{banner}</div>
      )}

      {/* System-of-truth status */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="text-white/40">Sync targets:</span>
        <span className={`rounded-full px-3 py-1 font-semibold ${status.stripe ? "bg-mint-400/15 text-mint-300" : "bg-white/5 text-white/40"}`}>
          Stripe {status.stripe ? "live" : "simulated (no key)"}
        </span>
        <span className={`rounded-full px-3 py-1 font-semibold ${status.hubspot ? "bg-mint-400/15 text-mint-300" : "bg-white/5 text-white/40"}`}>
          HubSpot {status.hubspot ? "connected" : "not configured"}
        </span>
      </div>

      {/* Global actions */}
      <div className="flex flex-wrap gap-2">
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await provisionAllAction();
              flash(r.ok ? `Provisioned ${r.count} tiers to Stripe${r.simulated ? " (simulated)" : ""} + HubSpot.` : `Some failed: ${r.errors.join("; ")}`);
            })
          }
          className="rounded-xl bg-hivis-400 px-4 py-2 text-sm font-bold text-field-950 disabled:opacity-50"
        >
          ⇪ Push all tiers → Stripe + HubSpot
        </button>
        <button
          disabled={pending || !status.hubspot}
          onClick={() =>
            startTransition(async () => {
              const r = await importHubspotAction();
              flash(r.ok ? `Imported ${r.updated} tiers from HubSpot.` : `Import failed: ${r.error}`);
            })
          }
          className="rounded-xl border border-field-line bg-field-900 px-4 py-2 text-sm font-semibold text-white/80 disabled:opacity-40"
        >
          ⭳ Prepopulate from HubSpot
        </button>
      </div>

      {/* Fee settings */}
      <SettingsCard settings={settings} onSaved={flash} pending={pending} startTransition={startTransition} />

      {/* Tiers */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-widest text-white/40">Subscription tiers</h2>
        {tiers.map((t) => (
          <TierCard key={t.sku} tier={t} onSaved={flash} pending={pending} startTransition={startTransition} />
        ))}
      </div>
    </div>
  );
}

function SettingsCard({
  settings,
  onSaved,
  pending,
  startTransition,
}: {
  settings: { transactionFeeBps: number; fastpayFeeBps: number };
  onSaved: (m: string) => void;
  pending: boolean;
  startTransition: (cb: () => void) => void;
}) {
  const [txn, setTxn] = useState((settings.transactionFeeBps / 100).toString());
  const [fastpay, setFastpay] = useState((settings.fastpayFeeBps / 100).toString());
  return (
    <div className="rounded-2xl border border-field-line bg-field-900 p-4">
      <p className="text-sm font-bold text-white">Transaction fees</p>
      <p className="mt-1 text-xs text-white/40">
        Transaction fee is deducted from settled job value (the customer sees one clean price; the tradie receives the
        remainder). Fast-Pay is the optional same-day factoring fee off the tradie&apos;s payout.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-4">
        <label className="text-xs text-white/60">
          Transaction fee %
          <input
            value={txn}
            onChange={(e) => setTxn(e.target.value)}
            inputMode="decimal"
            className="mt-1 block w-28 rounded-lg border border-field-line bg-field-950 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="text-xs text-white/60">
          Fast-Pay %
          <input
            value={fastpay}
            onChange={(e) => setFastpay(e.target.value)}
            inputMode="decimal"
            className="mt-1 block w-28 rounded-lg border border-field-line bg-field-950 px-3 py-2 text-sm text-white"
          />
        </label>
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await saveSettingsAction({
                transactionFeeBps: Math.round(Number(txn) * 100),
                fastpayFeeBps: Math.round(Number(fastpay) * 100),
              });
              onSaved(r.ok ? "Fees saved." : `Save failed: ${r.error}`);
            })
          }
          className="rounded-lg bg-hivis-400 px-4 py-2 text-sm font-bold text-field-950 disabled:opacity-50"
        >
          Save fees
        </button>
      </div>
    </div>
  );
}

function TierCard({
  tier,
  onSaved,
  pending,
  startTransition,
}: {
  tier: BillingTier;
  onSaved: (m: string) => void;
  pending: boolean;
  startTransition: (cb: () => void) => void;
}) {
  const [name, setName] = useState(tier.name);
  const [description, setDescription] = useState(tier.description ?? "");
  const [base, setBase] = useState((tier.baseFeeCents / 100).toString());
  const [perProp, setPerProp] = useState((tier.perPropertyCents / 100).toString());
  const [cap, setCap] = useState(tier.propertyCap.toString());
  const [active, setActive] = useState(tier.active);

  const previewMonthly = monthly({
    baseFeeCents: Math.round(Number(base) * 100) || 0,
    perPropertyCents: Math.round(Number(perProp) * 100) || 0,
    propertyCap: Math.round(Number(cap)) || 0,
  });

  return (
    <div className="rounded-2xl border border-field-line bg-field-900 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-mono text-[11px] text-white/30">{tier.sku}</p>
          <p className="text-sm font-bold text-white">{name || tier.sku}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-extrabold text-hivis-400">{dollars(previewMonthly)}/mo</p>
          <p className="text-[10px] text-white/40">
            {tier.stripePriceId ? `Stripe ✓ ${tier.stripePriceId.slice(0, 14)}…` : "not on Stripe yet"}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-white/50">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 block w-full rounded-lg border border-field-line bg-field-950 px-3 py-2 text-sm text-white" />
        </label>
        <label className="text-xs text-white/50">
          Property cap
          <input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="numeric" className="mt-1 block w-full rounded-lg border border-field-line bg-field-950 px-3 py-2 text-sm text-white" />
        </label>
        <label className="text-xs text-white/50 sm:col-span-2">
          Description
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 block w-full rounded-lg border border-field-line bg-field-950 px-3 py-2 text-sm text-white" />
        </label>
        <label className="text-xs text-white/50">
          Base fee ($/mo)
          <input value={base} onChange={(e) => setBase(e.target.value)} inputMode="decimal" className="mt-1 block w-full rounded-lg border border-field-line bg-field-950 px-3 py-2 text-sm text-white" />
        </label>
        <label className="text-xs text-white/50">
          Per property ($/mo)
          <input value={perProp} onChange={(e) => setPerProp(e.target.value)} inputMode="decimal" className="mt-1 block w-full rounded-lg border border-field-line bg-field-950 px-3 py-2 text-sm text-white" />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-white/60">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
        </label>
        <div className="flex-1" />
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await saveTierAction(tier.sku, {
                name,
                description,
                baseFeeCents: Math.round(Number(base) * 100),
                perPropertyCents: Math.round(Number(perProp) * 100),
                propertyCap: Math.round(Number(cap)),
                active,
              });
              onSaved(r.ok ? `${tier.sku} saved.` : `Save failed: ${r.error}`);
            })
          }
          className="rounded-lg border border-field-line bg-field-950 px-4 py-2 text-sm font-semibold text-white/80 disabled:opacity-50"
        >
          Save
        </button>
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await provisionTierAction(tier.sku);
              onSaved(r.ok ? `${tier.sku} pushed to Stripe${r.simulated ? " (simulated)" : ""} + HubSpot.` : `Provision failed: ${r.error}`);
            })
          }
          className="rounded-lg bg-hivis-400 px-4 py-2 text-sm font-bold text-field-950 disabled:opacity-50"
        >
          Push → Stripe + HubSpot
        </button>
      </div>
    </div>
  );
}
