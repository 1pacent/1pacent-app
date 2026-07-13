import Link from "next/link";
import { getData } from "@/lib/data";
import { Panel, PulseTopBar } from "@/components/pulse/shell";
import { LiveRefresh } from "@/components/pulse/live-refresh";
import { EnablePush } from "@/components/pulse/enable-push";
import { MomentCard } from "./moment-card";
import { AutopilotCard } from "./autopilot-card";

export const dynamic = "force-dynamic";

function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-AU")}`;
}

/** The owner seat (Product Strategy v8 §4.4): Moments to decide, the record
 * to browse, and nothing demanding daily attendance. */
export default async function OwnPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getData();
  const ctx = await data.getOwnerPortalContext(token);

  if (!ctx) {
    return (
      <>
        <PulseTopBar back="/p" />
        <div className="mt-16 text-center">
          <h1 className="font-serif text-2xl font-semibold">This link isn&apos;t active</h1>
        </div>
      </>
    );
  }

  const [cards, spending, autopilot] = await Promise.all([
    data.getCanvasCards(token),
    data.getSpendingSummary(token, 12),
    data.getAutopilot(token),
  ]);
  const moments = cards.filter((c) => c.state === "needs_you");
  const liveJobs = ctx.properties
    .flatMap((p) => p.requests.map((r) => ({ ...r, address: p.address })))
    .filter((r) => !["closed", "cancelled", "declined"].includes(r.state))
    .slice(0, 5);

  return (
    <>
      <PulseTopBar back="/p" title="Own" />
      <LiveRefresh topic="trade-all" />
      <div className="flex flex-1 flex-col gap-4 pt-2">
        <div>
          <h1 className="font-serif text-2xl font-semibold">{ctx.ownerName.split(" ")[0]}&apos;s properties</h1>
          <p className="text-xs text-white/50">
            {ctx.properties.length} address{ctx.properties.length === 1 ? "" : "es"} on the record
            {spending && spending.jobCount > 0 ? ` · ${dollars(spending.totalCents)} maintained this year` : ""}
          </p>
        </div>

        {/* Moments — decisions come to you. */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-hivis-400">
            {moments.length === 0 ? "Nothing needs you" : `${moments.length} decision${moments.length === 1 ? "" : "s"} waiting`}
          </p>
          {moments.length === 0 ? (
            <Panel>
              <p className="text-center text-sm text-white/40">
                The crew&apos;s handling it. Decisions land here — one tap each.
              </p>
            </Panel>
          ) : (
            <div className="flex flex-col gap-3">
              {moments.map((m) => (
                <MomentCard key={m.id} card={m} token={token} />
              ))}
            </div>
          )}
        </div>

        {/* Autopilot — configure once, decide from the lock screen after. */}
        {autopilot && <AutopilotCard token={token} initial={autopilot} />}
        <EnablePush token={token} vapidPublicKey={process.env.VAPID_PUBLIC_KEY ?? null} />

        {/* Live jobs */}
        {liveJobs.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">Live jobs</p>
            <div className="flex flex-col gap-2">
              {liveJobs.map((r) => (
                <Link
                  key={r.id}
                  href={`/p/job/${token}/${r.id}`}
                  className="flex items-center justify-between rounded-2xl border border-field-line bg-field-900 px-4 py-3 active:scale-[0.98]"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">{r.title}</p>
                    <p className="text-xs text-white/40">{r.address}</p>
                  </div>
                  <span className="text-xs font-semibold text-mint-300">{r.state.replace(/_/g, " ")} →</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* The record */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">The address remembers</p>
          <div className="flex flex-col gap-2">
            {ctx.properties.map((p) => (
              <Link
                key={p.id}
                href={`/p/record/${token}?property=${p.id}`}
                className="flex items-center justify-between rounded-2xl border border-field-line bg-field-900 px-4 py-3 active:scale-[0.98]"
              >
                <div>
                  <p className="text-sm font-semibold text-white">{p.address}</p>
                  <p className="text-xs text-white/40">{p.suburb}</p>
                </div>
                <span
                  className={`h-3 w-3 rounded-full ${
                    p.compliance.overall === "green"
                      ? "bg-mint-400"
                      : p.compliance.overall === "amber"
                        ? "bg-amber-400"
                        : "bg-red-500"
                  }`}
                />
              </Link>
            ))}
          </div>
        </div>

        <Link
          href={`/p/fix/${token}`}
          className="hivis-breathe mt-auto rounded-2xl bg-hivis-400 px-6 py-4 text-center text-lg font-bold text-field-950 active:scale-[0.98]"
        >
          🛠 Something needs fixing
        </Link>
      </div>
    </>
  );
}
