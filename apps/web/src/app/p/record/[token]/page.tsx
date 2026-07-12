import { getData } from "@/lib/data";
import { Panel, PulseTopBar } from "@/components/pulse/shell";

export const dynamic = "force-dynamic";

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`;
}

/** The Address Record (Product Strategy v8 §4.3): a property's medical file,
 * built entirely from job exhaust. Beautiful and boring. */
export default async function RecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ property?: string }>;
}) {
  const { token } = await params;
  const { property } = await searchParams;
  const record = await (await getData()).getAddressRecord(token, property);

  if (!record) {
    return (
      <>
        <PulseTopBar back="/p" />
        <div className="mt-16 text-center">
          <h1 className="font-serif text-2xl font-semibold">No record here</h1>
        </div>
      </>
    );
  }

  return (
    <>
      <PulseTopBar back={`/p/own/${token}`} title="Record" />
      <div className="flex flex-col gap-4 pt-2 pb-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-white/40">The address remembers</p>
          <h1 className="mt-1 font-serif text-3xl font-semibold">{record.address}</h1>
          <p className="text-sm text-white/50">{record.suburb}</p>
          <p className="mt-2 text-xs text-white/40">
            {record.eventsCount} ledger events
            {record.spend12moCents !== null ? ` · ${dollars(record.spend12moCents)} maintained this year` : ""}
          </p>
        </div>

        {/* Compliance */}
        <Panel>
          <p className="mb-2 text-[10px] uppercase tracking-widest text-white/40">Safety & compliance</p>
          <div className="flex flex-col gap-1.5">
            {record.compliance.requirements.map((r) => (
              <div key={r.name} className="flex items-center justify-between text-sm">
                <span className="text-white/80">{r.name}</span>
                <span className="flex items-center gap-2 text-xs text-white/40">
                  {r.dueAt ? `due ${new Date(r.dueAt).toLocaleDateString("en-AU", { month: "short", year: "numeric" })}` : "—"}
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      r.status === "green" ? "bg-mint-400" : r.status === "amber" ? "bg-amber-400" : "bg-red-500"
                    }`}
                  />
                </span>
              </div>
            ))}
          </div>
        </Panel>

        {/* Assets */}
        {record.assets.length > 0 && (
          <Panel>
            <p className="mb-2 text-[10px] uppercase tracking-widest text-white/40">Assets on record</p>
            <div className="flex flex-col gap-2">
              {record.assets.map((a) => (
                <div key={a.assetLabel} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="text-white/80">{a.assetLabel}</p>
                    {a.ageYears > 0 && (
                      <p className="text-xs text-white/40">
                        year {a.ageYears} of {a.effectiveLifeYears} · {a.remainingLifeYears}y left
                        <span className="text-white/25"> (planning estimate)</span>
                      </p>
                    )}
                  </div>
                  {a.status !== "healthy" && (
                    <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">
                      plan ahead
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* Warranties */}
        {record.warranties.length > 0 && (
          <Panel>
            <p className="mb-2 text-[10px] uppercase tracking-widest text-white/40">Live warranties</p>
            {record.warranties.map((w, i) => (
              <p key={i} className="text-sm text-white/80">
                🛡 {w.assetLabel} — {w.tradieName}, until {new Date(w.expiresAt).toLocaleDateString("en-AU")}
              </p>
            ))}
          </Panel>
        )}

        {/* History */}
        <Panel>
          <p className="mb-2 text-[10px] uppercase tracking-widest text-white/40">Every job, forever</p>
          {record.history.length === 0 ? (
            <p className="text-sm text-white/40">The first job writes the first line.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {record.history.map((h, i) => (
                <div key={i} className="flex items-start justify-between text-sm">
                  <div>
                    <p className="text-white/80">{h.title}</p>
                    <p className="text-xs text-white/40">
                      {h.tradieName}
                      {h.at ? ` · ${new Date(h.at).toLocaleDateString("en-AU", { month: "short", year: "numeric" })}` : ""}
                    </p>
                  </div>
                  {h.invoiceCents !== null && (
                    <span className="font-semibold text-white/60">{dollars(h.invoiceCents)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
