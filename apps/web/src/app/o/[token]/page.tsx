import Link from "next/link";
import { getData } from "@/lib/data";
import { Canvas } from "@/components/canvas";
import { TalkPanel } from "@/components/talk-panel";
import { TwinPanel } from "@/components/twin-panel";
import { TrafficLightBadge } from "@/components/traffic-light";
import { ReportButtons } from "./report-buttons";

export const dynamic = "force-dynamic";

/** The owner/landlord seat (Product Design v6 §4.2) — a durable tokenised
 * graph position. Talk on the left, the decision board on the right; every
 * card deep-links into the workspace. */
export default async function OwnerPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getData();
  const ctx = await data.getOwnerPortalContext(token);

  if (!ctx) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <h1 className="text-xl font-semibold text-slate-900">This link isn&apos;t active</h1>
        <p className="mt-2 text-sm text-slate-600">Ask for a fresh owner link.</p>
      </div>
    );
  }

  const cards = await data.getCanvasCards(token);

  return (
    <div className="mx-auto max-w-6xl">
      <p className="text-sm font-medium text-brand-700">Your property seat</p>
      <h1 className="mt-1 font-serif text-2xl font-semibold text-slate-900">
        {ctx.ownerName} — {ctx.properties.length} propert{ctx.properties.length === 1 ? "y" : "ies"}
      </h1>
      <p className="mt-2 mb-6 text-sm text-slate-600">
        Ask Sally anything on the left; decisions and updates land on your board on the right. If Sally&apos;s ever
        offline, the board and every link on it keep working.
      </p>
      <TwinPanel
        talk={<TalkPanel mode="owner_portal" token={token} />}
        board={<Canvas cards={cards} token={token} scope="owner" />}
      />

      <h2 className="mt-10 mb-4 font-serif text-lg font-semibold text-slate-900">Workspace</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          {ctx.properties.map((p) => (
            <Link
              key={p.id}
              href={`/properties/${p.id}`}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300"
            >
              <div>
                <p className="font-medium text-slate-900">{p.address}</p>
                <p className="text-xs text-slate-500">
                  {p.suburb} · {p.openRequests} open request{p.openRequests === 1 ? "" : "s"}
                </p>
              </div>
              <TrafficLightBadge status={p.compliance.overall} />
            </Link>
          ))}
        </div>
        <ReportButtons token={token} />
      </div>
    </div>
  );
}
