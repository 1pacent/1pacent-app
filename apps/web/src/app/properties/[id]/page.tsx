import Link from "next/link";
import { notFound } from "next/navigation";
import { formatCents } from "@1pacent/core";
import { StateBadge, TrafficLightBadge } from "@/components/traffic-light";
import { getData } from "@/lib/data";

export const dynamic = "force-dynamic";

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await (await getData()).getProperty(id);
  if (!property) notFound();

  return (
    <div>
      <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-700">
        ← Portfolio
      </Link>
      <div className="mt-2 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-slate-900">
          {property.address}, {property.suburb}
        </h1>
        <TrafficLightBadge status={property.compliance.overall} />
      </div>

      <h2 className="mt-8 text-lg font-semibold text-slate-900">Compliance checklist</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Requirement</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Last done</th>
              <th className="px-4 py-2.5">Next due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {property.compliance.requirements.map((r) => (
              <tr key={r.requirement.key}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{r.requirement.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{r.requirement.legislationRef}</p>
                </td>
                <td className="px-4 py-3">
                  <TrafficLightBadge status={r.status} />
                </td>
                <td className="px-4 py-3 text-slate-600">{formatDate(r.lastCompletedAt)}</td>
                <td className="px-4 py-3 text-slate-600">
                  {r.dueAt ? (
                    <>
                      {formatDate(r.dueAt)}
                      {r.daysUntilDue !== null && r.daysUntilDue < 0 && (
                        <span className="ml-1 text-xs font-semibold text-red-600">
                          ({-r.daysUntilDue}d overdue)
                        </span>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-lg font-semibold text-slate-900">Maintenance requests</h2>
      <div className="mt-3 space-y-3">
        {property.requests.length === 0 && (
          <p className="text-sm text-slate-500">No requests yet.</p>
        )}
        {property.requests.map((r) => (
          <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-900">{r.title}</p>
                <p className="text-xs text-slate-500">
                  {r.category.replace(/_/g, " ")}
                  {r.estimateCents ? ` · est. ${formatCents(r.estimateCents)}` : ""}
                </p>
              </div>
              <StateBadge state={r.state} />
            </div>
            <ol className="mt-3 space-y-1 border-l-2 border-slate-100 pl-3 text-xs text-slate-500">
              {r.events.map((e, i) => (
                <li key={i}>
                  <span className="font-medium text-slate-700">{e.eventType.replace(/_/g, " ")}</span>{" "}
                  by {e.actorType.replace(/_/g, " ")}
                  {e.note ? ` — ${e.note}` : ""}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}
