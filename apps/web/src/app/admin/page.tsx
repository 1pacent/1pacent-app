import { getAdminOverview, type AdminOverview } from "@/lib/admin-data";
import { HubspotCard } from "./hubspot-card";

export const dynamic = "force-dynamic";

function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-AU")}`;
}

const BUCKET_META = {
  open: { label: "Open", icon: "◐", tone: "text-hivis-400" },
  pending: { label: "Pending verification", icon: "⏳", tone: "text-amber-300" },
  closed: { label: "Closed & settled", icon: "✓", tone: "text-mint-300" },
} as const;

/** The operator dashboard: the whole network on one screen — properties and
 * their managers, the transaction pipeline, settled money by month with the
 * platform take, and the CRM mirror. Read-only over the ledger. */
export default async function AdminPage() {
  const o: AdminOverview = await getAdminOverview();
  const monthlyMax = Math.max(1, ...o.monthly.map((m) => m.grossCents));
  const takeCents = (m: AdminOverview["monthly"][number]) => m.platformFeeCents + m.fastpayFeeCents;
  const allTimeGross = o.monthly.reduce((s, m) => s + m.grossCents, 0);
  const allTimeTake = o.monthly.reduce((s, m) => s + takeCents(m), 0);

  return (
    <div className="min-h-dvh bg-field-950 text-white" style={{ colorScheme: "dark" }}>
      <div className="mx-auto w-full max-w-5xl px-5 pb-16">
        <header className="flex items-center justify-between py-5">
          <div>
            <p className="text-lg font-extrabold">
              <span className="text-hivis-400">■</span> Operator console
            </p>
            <p className="text-[10px] uppercase tracking-widest text-white/30">
              {o.dataSource === "live" ? "Live ledger" : "Demo data"} · read-only · refreshed per load
            </p>
          </div>
          <a href="/admin/logout" className="text-xs font-semibold text-white/40 hover:text-white">
            Sign out
          </a>
        </header>

        {/* Network KPIs */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Properties on record", String(o.counts.properties)],
            ["Property managers", String(o.counts.propertyManagers)],
            ["Tradies (online now)", `${o.counts.tradies} (${o.counts.tradiesOnline})`],
            ["Join requests", String(o.counts.joinRequests)],
            ["Subscription MRR", dollars(o.subscriptionMrrCents)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-field-line bg-field-900 p-4">
              <p className="text-[10px] uppercase tracking-widest text-white/40">{label}</p>
              <p className="mt-1 text-3xl font-extrabold text-white">{value}</p>
            </div>
          ))}
        </section>

        {/* Pipeline */}
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">Transaction pipeline</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {(Object.keys(BUCKET_META) as Array<keyof typeof BUCKET_META>).map((b) => (
              <div key={b} className="rounded-2xl border border-field-line bg-field-900 p-4">
                <p className={`text-xs font-bold ${BUCKET_META[b].tone}`}>
                  {BUCKET_META[b].icon} {BUCKET_META[b].label}
                </p>
                <p className="mt-1 text-3xl font-extrabold">{dollars(o.pipeline[b].valueCents)}</p>
                <p className="text-xs text-white/40">
                  {o.pipeline[b].count} job{o.pipeline[b].count === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Monthly settled + take */}
        <section className="mt-6 rounded-2xl border border-field-line bg-field-900 p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-white/40">
              Settled per month (gross)
            </h2>
            <p className="text-xs text-white/40">
              All time: <span className="font-bold text-white">{dollars(allTimeGross)}</span> gross ·{" "}
              <span className="font-bold text-mint-300">{dollars(allTimeTake)}</span> platform take
              {allTimeGross > 0 ? ` (${((allTimeTake / allTimeGross) * 100).toFixed(1)}%)` : ""}
            </p>
          </div>
          {o.monthly.length === 0 ? (
            <p className="mt-4 text-sm text-white/40">Nothing settled yet — the first verified job starts the ledger.</p>
          ) : (
            <>
              {/* Single series; value labelled at each mark; table below is the accessible view. */}
              <div className="mt-4 flex items-end gap-2" style={{ height: 120 }} aria-hidden>
                {o.monthly.map((m) => (
                  <div key={m.month} className="flex flex-1 flex-col items-center justify-end gap-1 self-stretch">
                    <span className="text-[10px] font-semibold text-white/70">{dollars(m.grossCents)}</span>
                    <div
                      className="w-full max-w-14 rounded-t bg-hivis-400"
                      style={{ height: `${Math.max(4, (m.grossCents / monthlyMax) * 80)}px` }}
                    />
                    <span className="text-[9px] uppercase text-white/40">
                      {new Date(`${m.month}-01`).toLocaleDateString("en-AU", { month: "short", year: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
              <table className="mt-4 w-full text-left text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-white/40">
                    <th className="py-1 font-semibold">Month</th>
                    <th className="py-1 text-right font-semibold">Jobs closed</th>
                    <th className="py-1 text-right font-semibold">Gross</th>
                    <th className="py-1 text-right font-semibold">Platform 1.2%</th>
                    <th className="py-1 text-right font-semibold">Fast-Pay 2%</th>
                    <th className="py-1 text-right font-semibold">My take</th>
                  </tr>
                </thead>
                <tbody>
                  {o.monthly.map((m) => (
                    <tr key={m.month} className="border-t border-field-line text-white/80">
                      <td className="py-1.5">{m.month}</td>
                      <td className="py-1.5 text-right">{m.jobsClosed}</td>
                      <td className="py-1.5 text-right">{dollars(m.grossCents)}</td>
                      <td className="py-1.5 text-right">{dollars(m.platformFeeCents)}</td>
                      <td className="py-1.5 text-right">{dollars(m.fastpayFeeCents)}</td>
                      <td className="py-1.5 text-right font-bold text-mint-300">
                        {dollars(takeCents(m))}
                        {m.grossCents > 0 ? ` (${((takeCents(m) / m.grossCents) * 100).toFixed(1)}%)` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>

        {/* PM subscriptions (v8 R7): who pays what, against actual PUM */}
        <section className="mt-6 rounded-2xl border border-field-line bg-field-900 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-white/40">Manager subscriptions</h2>
          {o.pmSubscriptions.length === 0 ? (
            <p className="mt-3 text-sm text-white/40">No cohorts selected yet — PMs pick theirs on the Deck.</p>
          ) : (
            <table className="mt-3 w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-white/40">
                  <th className="py-1 font-semibold">Manager</th>
                  <th className="py-1 font-semibold">Tier (SKU)</th>
                  <th className="py-1 text-right font-semibold">$/mo</th>
                  <th className="py-1 text-right font-semibold">Cap</th>
                  <th className="py-1 text-right font-semibold">PUM</th>
                  <th className="hidden py-1 text-right font-semibold sm:table-cell">CRM</th>
                </tr>
              </thead>
              <tbody>
                {o.pmSubscriptions.map((sub) => (
                  <tr key={sub.sku + sub.pmName} className="border-t border-field-line text-white/80">
                    <td className="py-1.5 font-semibold text-white">{sub.pmName}</td>
                    <td className="py-1.5">
                      {sub.tierName} <span className="text-white/40">({sub.sku})</span>
                    </td>
                    <td className="py-1.5 text-right">{dollars(sub.priceCents)}</td>
                    <td className="py-1.5 text-right">{sub.propertyCap}</td>
                    <td className={`py-1.5 text-right font-bold ${sub.overCap ? "text-amber-300" : "text-mint-300"}`}>
                      {sub.propertiesUnderManagement}
                      {sub.overCap ? " ⚠ over cap" : ""}
                    </td>
                    <td className="hidden py-1.5 text-right sm:table-cell">
                      {sub.hubspotDealId ? <span className="text-mint-300">deal ✓</span> : <span className="text-white/30">local</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Properties by PM */}
        <section className="mt-6 rounded-2xl border border-field-line bg-field-900 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-white/40">Properties by manager</h2>
          <table className="mt-3 w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-white/40">
                <th className="py-1 font-semibold">Manager</th>
                <th className="py-1 text-right font-semibold">Properties</th>
                <th className="py-1 text-right font-semibold">Open jobs</th>
                <th className="hidden py-1 pl-4 font-semibold sm:table-cell">Addresses</th>
              </tr>
            </thead>
            <tbody>
              {o.propertiesByPm.map((g) => (
                <tr key={g.pmName} className="border-t border-field-line align-top text-white/80">
                  <td className="py-1.5 font-semibold text-white">{g.pmName}</td>
                  <td className="py-1.5 text-right">{g.properties}</td>
                  <td className="py-1.5 text-right">{g.openJobs}</td>
                  <td className="hidden py-1.5 pl-4 text-white/50 sm:table-cell">{g.addresses.join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Recent transactions */}
        <section className="mt-6 rounded-2xl border border-field-line bg-field-900 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-white/40">Recent transactions</h2>
          <table className="mt-3 w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-white/40">
                <th className="py-1 font-semibold">Job</th>
                <th className="hidden py-1 font-semibold sm:table-cell">Property</th>
                <th className="py-1 font-semibold">Status</th>
                <th className="py-1 text-right font-semibold">Value</th>
                <th className="py-1 text-right font-semibold">Fee</th>
              </tr>
            </thead>
            <tbody>
              {o.transactions.map((t) => (
                <tr key={t.requestId} className="border-t border-field-line text-white/80">
                  <td className="py-1.5">{t.title}</td>
                  <td className="hidden py-1.5 text-white/50 sm:table-cell">{t.address}</td>
                  <td className={`py-1.5 ${BUCKET_META[t.bucket].tone}`}>
                    {BUCKET_META[t.bucket].icon} {t.state.replace(/_/g, " ")}
                  </td>
                  <td className="py-1.5 text-right">{t.amountCents !== null ? dollars(t.amountCents) : "—"}</td>
                  <td className="py-1.5 text-right text-white/50">{t.feeCents !== null ? dollars(t.feeCents) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {/* Join requests */}
          <section className="rounded-2xl border border-field-line bg-field-900 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-white/40">
              Join requests (the funnel)
            </h2>
            {o.joinRequests.length === 0 ? (
              <p className="mt-3 text-sm text-white/40">None yet — the site's Join form lands here.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {o.joinRequests.slice(0, 8).map((j, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-white">
                        {j.fullName} <span className="text-white/40">· {j.persona}</span>
                        {j.suburb ? <span className="text-white/40"> · {j.suburb}</span> : null}
                      </p>
                      <p className="text-white/50">{j.email}</p>
                      {(j.company || j.abn || j.trades?.length || j.propertyCount || j.propertiesUnderMgmt || j.serviceSuburbs?.length) && (
                        <p className="text-[10px] text-white/40">
                          {j.company ? `${j.company}${j.abn ? ` (ABN ${j.abn})` : ""}` : null}
                          {j.trades?.length ? ` · ${j.trades.join(", ")}` : null}
                          {j.serviceSuburbs?.length ? ` · serves ${j.serviceSuburbs.length} suburb${j.serviceSuburbs.length === 1 ? "" : "s"}` : null}
                          {j.propertyCount ? ` · ${j.propertyCount} propert${j.propertyCount === 1 ? "y" : "ies"}` : null}
                          {j.propertiesUnderMgmt ? ` · up to ${j.propertiesUnderMgmt} PUM` : null}
                        </p>
                      )}
                    </div>
                    <span className={j.hubspotSynced ? "text-mint-300" : "text-white/30"}>
                      {j.hubspotSynced ? "in CRM ✓" : "not synced"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* HubSpot */}
          <HubspotCard configured={o.hubspot.configured} />
        </div>
      </div>
    </div>
  );
}
