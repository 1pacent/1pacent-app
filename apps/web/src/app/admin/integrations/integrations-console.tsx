"use client";

import { useState, useTransition } from "react";
import type { IntegrationView } from "@/lib/integrations/admin-data";
import { connectAction, syncAction, writeBackAction, disconnectAction, deleteAction } from "./actions";

export function IntegrationsConsole({
  ready,
  connectors,
  connections,
}: {
  ready: { db: boolean; encryption: boolean };
  connectors: Array<{ provider: string; displayName: string; live: boolean }>;
  connections: IntegrationView[];
}) {
  const [banner, setBanner] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [provider, setProvider] = useState(connectors[0]?.provider ?? "propertyme");
  const [pmContactId, setPmContactId] = useState("");
  const [orgId, setOrgId] = useState("");
  const [token, setToken] = useState("");

  const flash = (m: string) => {
    setBanner(m);
    setTimeout(() => setBanner(null), 7000);
  };

  return (
    <div className="flex flex-col gap-6">
      {banner && <div className="rounded-xl border border-hivis-400/40 bg-hivis-400/10 px-4 py-3 text-sm text-hivis-200">{banner}</div>}

      {!ready.encryption && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          <b>INTEGRATION_ENC_KEY not set.</b> Credentials cannot be stored securely — connecting is blocked until the key
          is configured in the environment.
        </div>
      )}

      {/* Providers */}
      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-widest text-white/40">Providers</h2>
        <div className="flex flex-wrap gap-2">
          {connectors.map((c) => (
            <span key={c.provider} className={`rounded-full px-3 py-1 text-xs font-semibold ${c.live ? "bg-mint-400/15 text-mint-300" : "bg-white/5 text-white/40"}`}>
              {c.displayName} {c.live ? "· live" : "· stub"}
            </span>
          ))}
        </div>
      </div>

      {/* Connect */}
      <div className="rounded-2xl border border-field-line bg-field-900 p-4">
        <h2 className="text-sm font-bold text-white">Connect a PM platform</h2>
        <p className="mt-1 text-xs text-white/40">
          Read-only import by default. Write-back stays OFF until you turn it on per connection. No DOB / identity /
          financial data is imported. Credentials are encrypted at rest.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-white/50">
            Provider
            <select value={provider} onChange={(e) => setProvider(e.target.value)} className="mt-1 block w-full rounded-lg border border-field-line bg-field-950 px-3 py-2 text-sm text-white">
              {connectors.map((c) => (
                <option key={c.provider} value={c.provider}>{c.displayName}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-white/50">
            Access token (vendor-issued)
            <input value={token} onChange={(e) => setToken(e.target.value)} className="mt-1 block w-full rounded-lg border border-field-line bg-field-950 px-3 py-2 text-sm text-white" placeholder="encrypted before storage" />
          </label>
          <label className="text-xs text-white/50">
            PM contact id
            <input value={pmContactId} onChange={(e) => setPmContactId(e.target.value)} className="mt-1 block w-full rounded-lg border border-field-line bg-field-950 px-3 py-2 font-mono text-xs text-white" />
          </label>
          <label className="text-xs text-white/50">
            Org id
            <input value={orgId} onChange={(e) => setOrgId(e.target.value)} className="mt-1 block w-full rounded-lg border border-field-line bg-field-950 px-3 py-2 font-mono text-xs text-white" />
          </label>
        </div>
        <button
          disabled={pending || !ready.encryption || !pmContactId || !orgId || !token}
          onClick={() =>
            start(async () => {
              const r = await connectAction({ provider: provider as never, pmContactId, orgId, accessToken: token });
              flash(r.ok ? `Connected. Imported ${r.sync?.imported ?? 0}, updated ${r.sync?.updated ?? 0}${r.sync?.overCap ? " — ⚠ OVER CAP" : ""}.` : `Failed: ${r.error}`);
              if (r.ok) setToken("");
            })
          }
          className="mt-3 rounded-lg bg-hivis-400 px-4 py-2 text-sm font-bold text-field-950 disabled:opacity-40"
        >
          Connect + import
        </button>
      </div>

      {/* Connections */}
      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-widest text-white/40">Connections</h2>
        {connections.length === 0 && <p className="text-sm text-white/40">No connections yet.</p>}
        <div className="flex flex-col gap-3">
          {connections.map((c) => (
            <div key={c.id} className="rounded-2xl border border-field-line bg-field-900 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-white">{c.pmName ?? "PM"} · {c.provider}</p>
                  <p className="text-xs text-white/40">
                    {c.status} · {c.propertyCount} properties{c.cap !== null ? ` / cap ${c.cap}` : ""}
                    {c.overCap && <span className="ml-1 font-bold text-hivis-300">⚠ over cap</span>}
                    {c.lastSyncAt ? ` · synced ${new Date(c.lastSyncAt).toLocaleString("en-AU")}` : " · never synced"}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${c.writeBackEnabled ? "bg-amber-400/15 text-amber-300" : "bg-white/5 text-white/40"}`}>
                  Write-back {c.writeBackEnabled ? "ON" : "OFF"}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Btn disabled={pending} onClick={() => start(async () => { const r = await syncAction(c.id); flash(r.ok ? `Synced: +${r.imported} / ~${r.updated}${r.overCap ? " ⚠ over cap" : ""}` : `Sync failed: ${r.error}`); })}>Sync now</Btn>
                <Btn disabled={pending} onClick={() => start(async () => { const r = await writeBackAction(c.id, !c.writeBackEnabled); flash(r.ok ? `Write-back ${!c.writeBackEnabled ? "enabled" : "disabled"}.` : `Failed: ${r.error}`); })}>
                  {c.writeBackEnabled ? "Disable write-back" : "Enable write-back"}
                </Btn>
                <Btn disabled={pending} onClick={() => start(async () => { const r = await disconnectAction(c.id); flash(r.ok ? "Disconnected + credentials purged." : `Failed: ${r.error}`); })}>Disconnect</Btn>
                <Btn danger disabled={pending} onClick={() => start(async () => { const r = await deleteAction(c.id); flash(r.ok ? `Deleted. Stripped ${r.propertiesStripped} properties of external data.` : `Failed: ${r.error}`); })}>Delete data</Btn>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Btn({ children, onClick, disabled, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40 ${danger ? "border border-red-500/40 bg-red-500/10 text-red-300" : "border border-field-line bg-field-950 text-white/80"}`}
    >
      {children}
    </button>
  );
}
