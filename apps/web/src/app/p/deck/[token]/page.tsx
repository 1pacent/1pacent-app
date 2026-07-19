import Link from "next/link";
import { getData } from "@/lib/data";
import { Panel, PulseTopBar } from "@/components/pulse/shell";
import { LiveRefresh } from "@/components/pulse/live-refresh";
import { EnablePush } from "@/components/pulse/enable-push";
import { BatchCard } from "./batch-card";
import { SubscriptionCard } from "./subscription-card";
import { HouseTradiesCard } from "./house-tradies-card";

export const dynamic = "force-dynamic";

const STEP_COLORS: Record<string, string> = {
  booked: "bg-white/20",
  confirmed: "bg-mint-400/50",
  on_the_way: "bg-hivis-400",
  on_site: "bg-hivis-400",
  done: "bg-mint-400",
  verified: "bg-mint-400",
  paid: "bg-mint-400",
};

/** The Dispatch Deck (Product Strategy v8 §3): every job a live tile;
 * exceptions float to the top; the PM works the queue, not the phone. */
export default async function DeckPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getData();
  const ctx = await data.getPmPortfolioContext(token);

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

  const [tiles, subscription, houseTradies] = await Promise.all([
    data.getDeckTiles(token),
    data.getPmSubscription(token),
    data.getHouseTradies(token),
  ]);
  const needsYou = tiles.filter((t) => t.needsHuman && !["closed", "cancelled"].includes(t.state));
  const moving = tiles.filter((t) => !t.needsHuman && !["closed", "cancelled"].includes(t.state));
  const doneRecently = tiles.filter((t) => ["closed", "cancelled"].includes(t.state)).slice(0, 5);

  return (
    <>
      <PulseTopBar back="/p" title="Deck" />
      <LiveRefresh topic="trade-all" />
      <div className="flex flex-1 flex-col gap-4 pt-2 pb-6">
        <div>
          <h1 className="font-serif text-2xl font-semibold">{ctx.pmName.split(" ")[0]}&apos;s deck</h1>
          <p className="text-xs text-white/50">
            {moving.length} moving without you · {needsYou.length} need{needsYou.length === 1 ? "s" : ""} a human ·{" "}
            {ctx.properties.length} doors
          </p>
        </div>

        <Link href={`/p/perf/${token}`} className="rounded-2xl border border-field-line bg-field-900 px-4 py-3 text-sm font-semibold text-white/80 active:scale-[0.98]">
          📈 Portfolio performance →
        </Link>

        {/* George's batch offers — same suburb, one run, certificates file themselves. */}
        {ctx.batchableCompliance.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-hivis-400">Batch & save</p>
            <div className="flex flex-col gap-2">
              {ctx.batchableCompliance.map((g) => (
                <BatchCard key={`${g.requirementKey}-${g.suburb}`} token={token} group={g} />
              ))}
            </div>
          </div>
        )}

        {needsYou.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-hivis-400">Needs you</p>
            <div className="flex flex-col gap-2">
              {needsYou.map((t) => (
                <Link
                  key={t.requestId}
                  href={`/p/job/${token}/${t.requestId}`}
                  className="hivis-ping-in flex items-center justify-between rounded-2xl border border-hivis-400/60 bg-field-900 px-4 py-3 active:scale-[0.98]"
                >
                  <div>
                    <p className="text-sm font-bold text-white">{t.title}</p>
                    <p className="text-xs text-white/40">{t.address}</p>
                  </div>
                  <span className="text-xs font-semibold text-hivis-400">{t.state.replace(/_/g, " ")} →</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">Moving without you</p>
          {moving.length === 0 ? (
            <Panel>
              <p className="text-center text-sm text-white/40">Quiet board. The crew will fill it.</p>
            </Panel>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {moving.map((t) => (
                <Link
                  key={t.requestId}
                  href={`/p/job/${token}/${t.requestId}`}
                  className="rounded-2xl border border-field-line bg-field-900 p-3 active:scale-[0.98]"
                >
                  <span className={`mb-2 block h-1.5 w-8 rounded ${STEP_COLORS[t.arcStep] ?? "bg-white/20"}`} />
                  <p className="text-xs font-bold leading-tight text-white">{t.title}</p>
                  <p className="mt-0.5 text-[10px] text-white/40">{t.address}</p>
                  <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-mint-300">
                    {t.arcStep.replace(/_/g, " ")}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>

        {subscription && <SubscriptionCard token={token} initial={subscription} />}
        {houseTradies && <HouseTradiesCard token={token} initial={houseTradies} />}
        <EnablePush token={token} vapidPublicKey={process.env.VAPID_PUBLIC_KEY ?? null} />

        {doneRecently.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">Recently closed</p>
            <div className="flex flex-col gap-1.5">
              {doneRecently.map((t) => (
                <Link
                  key={t.requestId}
                  href={`/p/job/${token}/${t.requestId}`}
                  className="flex items-center justify-between px-1 text-xs text-white/40"
                >
                  <span>{t.title} — {t.address}</span>
                  <span className="text-mint-300">✓</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
