import { getData } from "@/lib/data";
import { PulseTopBar } from "@/components/pulse/shell";
import { EnablePush } from "@/components/pulse/enable-push";
import { TradeHome } from "./trade-home";
import { RunView } from "./run-view";

export const dynamic = "force-dynamic";

export default async function TradePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getData();
  const ctx = await data.getTradiePortalContext(token);

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

  const [presence, offers, jobs, accuracy, run] = await Promise.all([
    data.getTradiePresence(token),
    data.getOpenOffers(token),
    data.listTradieJobs(token),
    data.getTradieAccuracy(token),
    data.getTradieRun(token),
  ]);

  return (
    <>
      <PulseTopBar back="/p" title="Trade" />
      <TradeHome
        token={token}
        name={ctx.tradieName}
        initial={{
          online: presence.online,
          offers,
          jobs: jobs.map((j) => ({ requestId: j.requestId, title: j.requestTitle, address: j.propertyAddress, state: j.state })),
          accuracy: accuracy
            ? { trustScore: accuracy.trustScore, completedJobs: accuracy.completedJobs, variancePct: accuracy.avgAbsVariancePct }
            : null,
        }}
      />
      <div className="mt-4 flex flex-col gap-4">
        {run && <RunView run={run} />}
        <EnablePush token={token} vapidPublicKey={process.env.VAPID_PUBLIC_KEY ?? null} />
      </div>
    </>
  );
}
