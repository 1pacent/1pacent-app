import Link from "next/link";
import { formatCents } from "@1pacent/core";
import { TrafficLightBadge } from "@/components/traffic-light";
import { getData } from "@/lib/data";
import { TestLinksPanel } from "./test-links-panel";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getData();
  const [properties, testLinkTargets] = await Promise.all([data.listProperties(), data.getTestLinkTargets()]);
  const totals = properties.reduce(
    (acc, p) => {
      acc.red += p.compliance.counts.red;
      acc.amber += p.compliance.counts.amber;
      acc.green += p.compliance.counts.green;
      return acc;
    },
    { red: 0, amber: 0, green: 0 },
  );

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="font-serif text-2xl font-semibold text-slate-900">Portfolio compliance</h1>
        <p className="text-sm text-slate-500">
          <span className="font-semibold text-red-600">{totals.red} overdue</span>
          {" · "}
          <span className="font-semibold text-amber-600">{totals.amber} due soon</span>
          {" · "}
          <span className="font-semibold text-brand-600">{totals.green} compliant</span>
        </p>
      </div>

      <div className="mt-6 space-y-4">
        {properties.map((p) => (
          <Link
            key={p.id}
            href={`/properties/${p.id}`}
            className="block rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">{p.address}</h2>
                <p className="text-sm text-slate-500">{p.suburb}</p>
              </div>
              <div className="text-right">
                <TrafficLightBadge status={p.compliance.overall} />
                <p className="mt-1 text-xs text-slate-500">
                  {p.openRequests} open request{p.openRequests === 1 ? "" : "s"} · auto-approve cap{" "}
                  {p.autoApproveCapCents > 0 ? formatCents(p.autoApproveCapCents) : "off"}
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-1.5">
              {p.compliance.requirements.map((r) => (
                <span
                  key={r.requirement.key}
                  title={`${r.requirement.name}: ${r.status}`}
                  className={`h-1.5 flex-1 rounded-full ${
                    r.status === "red"
                      ? "bg-red-500"
                      : r.status === "amber"
                        ? "bg-amber-400"
                        : "bg-brand-500"
                  }`}
                />
              ))}
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-10">
        <TestLinksPanel {...testLinkTargets} />
      </div>
    </div>
  );
}
