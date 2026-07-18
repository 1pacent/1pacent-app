"use client";

import { useState } from "react";

/** The CRM mirror: one-way sync of network contacts + join requests into
 * HubSpot. Env-gated — without a token, this card says exactly what to add. */
export function HubspotCard({ configured }: { configured: boolean }) {
  const [state, setState] = useState<"idle" | "syncing" | string>("idle");

  async function sync() {
    setState("syncing");
    try {
      const res = await fetch("/api/admin/hubspot-sync", { method: "POST" });
      const body = (await res.json()) as { ok: boolean; synced?: number; failed?: number; error?: string };
      setState(
        body.ok
          ? `Synced ${body.synced ?? 0} contact${(body.synced ?? 0) === 1 ? "" : "s"}${body.failed ? ` · ${body.failed} failed` : ""} ✓`
          : (body.error ?? "Sync failed."),
      );
    } catch {
      setState("Sync failed — network error.");
    }
  }

  return (
    <section className="rounded-2xl border border-field-line bg-field-900 p-5">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-white/40">HubSpot CRM</h2>
      {configured ? (
        <>
          <p className="mt-3 text-sm text-white/60">
            Connected. New join requests mirror automatically; the button below pushes every network contact
            (owners, managers, tradies) and any unsynced leads.
          </p>
          <button
            type="button"
            disabled={state === "syncing"}
            onClick={sync}
            className="mt-4 w-full rounded-xl bg-hivis-400 px-4 py-3 text-sm font-bold text-field-950 active:scale-[0.98] disabled:opacity-60"
          >
            {state === "syncing" ? "Syncing…" : "Sync contacts to HubSpot"}
          </button>
          {state !== "idle" && state !== "syncing" && (
            <p className="mt-2 text-center text-xs text-mint-300">{state}</p>
          )}
        </>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-white/60">
          Not connected. Create a HubSpot <span className="text-white">private app</span> with{" "}
          <code className="text-hivis-400">crm.objects.contacts</code> read+write scopes, then add its token as{" "}
          <code className="text-hivis-400">HUBSPOT_ACCESS_TOKEN</code> in the Vercel project env and redeploy.
          Join requests and network contacts will mirror as CRM contacts.
        </p>
      )}
    </section>
  );
}
