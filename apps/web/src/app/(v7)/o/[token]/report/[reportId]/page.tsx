import { getData } from "@/lib/data";

export const dynamic = "force-dynamic";

const KIND_TITLES: Record<string, string> = {
  property_data_pack: "Property Data Pack",
  spending_summary: "Spending Summary",
  obligations_calendar: "Obligations Calendar",
};

function dollars(cents: unknown): string {
  return typeof cents === "number" ? `$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2 })}` : "—";
}

/** Rendered report artifact — printable (browser print → PDF). The payload is
 * the source of truth; this page is only a view of it. */
export default async function ReportPage({
  params,
}: {
  params: Promise<{ token: string; reportId: string }>;
}) {
  const { token, reportId } = await params;
  const data = await getData();
  const report = await data.getReport(token, reportId);

  if (!report) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Report not found</h1>
      </div>
    );
  }

  const p = report.payload as {
    disclaimerText?: string;
    property?: { address: string; suburb: string };
    assets?: Array<{
      label: string;
      category: string;
      installedAt: string | null;
      depreciation: {
        ageYears: number;
        effectiveLifeYears: number;
        annualPrimeCostCents: number;
        annualDiminishingValueCents: number;
      } | null;
    }>;
    maintenanceHistory?: Array<{ title: string; invoiceCents: number; tradieName: string; invoicedAt: string | null }>;
    openWarranties?: Array<{ assetLabel: string; expiresAt: string }>;
    compliance?: { overall: string; requirements: Array<{ name: string; status: string; dueAt: string | null }> };
    totalCents?: number;
    jobCount?: number;
    byCategory?: Array<{ category: string; totalCents: number; jobCount: number; vsMedianPct: number | null }>;
    months?: Array<{ month: string; items: Array<{ propertyAddress: string; requirementName: string; status: string }> }>;
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <p className="text-sm text-slate-500">Generated {new Date(report.createdAt).toLocaleString("en-AU")}</p>
      </div>

      <h1 className="font-serif text-3xl font-semibold text-slate-900">
        {KIND_TITLES[report.kind] ?? report.kind}
      </h1>
      {p.property && (
        <p className="mt-1 text-lg text-slate-600">
          {p.property.address}, {p.property.suburb}
        </p>
      )}

      {p.disclaimerText && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          {p.disclaimerText}
        </p>
      )}

      {p.assets && p.assets.length > 0 && (
        <section className="mt-8">
          <h2 className="font-serif text-xl font-semibold text-slate-900">Asset register</h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2">Asset</th>
                <th>Installed</th>
                <th>Age / life</th>
                <th>Annual depn. (PC / DV)*</th>
              </tr>
            </thead>
            <tbody>
              {p.assets.map((a, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-2 font-medium text-slate-900">{a.label}</td>
                  <td>{a.installedAt ? new Date(a.installedAt).getFullYear() : "—"}</td>
                  <td>{a.depreciation ? `${a.depreciation.ageYears}y of ${a.depreciation.effectiveLifeYears}y` : "—"}</td>
                  <td>
                    {a.depreciation
                      ? `${dollars(a.depreciation.annualPrimeCostCents)} / ${dollars(a.depreciation.annualDiminishingValueCents)}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-slate-400">* planning estimates, not a tax schedule</p>
        </section>
      )}

      {p.maintenanceHistory && p.maintenanceHistory.length > 0 && (
        <section className="mt-8">
          <h2 className="font-serif text-xl font-semibold text-slate-900">Maintenance history</h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2">Job</th>
                <th>Tradie</th>
                <th>Invoiced</th>
                <th className="text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {p.maintenanceHistory.map((h, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-2 font-medium text-slate-900">{h.title}</td>
                  <td>{h.tradieName}</td>
                  <td>{h.invoicedAt ? new Date(h.invoicedAt).toLocaleDateString("en-AU") : "—"}</td>
                  <td className="text-right">{dollars(h.invoiceCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {p.openWarranties && p.openWarranties.length > 0 && (
        <section className="mt-8">
          <h2 className="font-serif text-xl font-semibold text-slate-900">Open warranties</h2>
          <ul className="mt-3 list-disc pl-5 text-sm text-slate-700">
            {p.openWarranties.map((w, i) => (
              <li key={i}>
                {w.assetLabel} — until {new Date(w.expiresAt).toLocaleDateString("en-AU")}
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.compliance && (
        <section className="mt-8">
          <h2 className="font-serif text-xl font-semibold text-slate-900">Compliance</h2>
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            {p.compliance.requirements.map((r, i) => (
              <li key={i}>
                <span
                  className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${
                    r.status === "green" ? "bg-emerald-500" : r.status === "amber" ? "bg-amber-400" : "bg-red-500"
                  }`}
                />
                {r.name}
                {r.dueAt ? ` — next due ${new Date(r.dueAt).toLocaleDateString("en-AU")}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.byCategory && (
        <section className="mt-8">
          <h2 className="font-serif text-xl font-semibold text-slate-900">
            Spending{typeof p.totalCents === "number" ? ` — ${dollars(p.totalCents)} total` : ""}
          </h2>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {p.byCategory.map((c, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-2 font-medium text-slate-900">{c.category.replace(/_/g, " ")}</td>
                  <td>{c.jobCount} job(s)</td>
                  <td className="text-right">{dollars(c.totalCents)}</td>
                  <td className="text-right text-xs text-slate-500">
                    {c.vsMedianPct !== null ? `${c.vsMedianPct <= 0 ? "" : "+"}${c.vsMedianPct}% vs median` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {p.months && (
        <section className="mt-8">
          <h2 className="font-serif text-xl font-semibold text-slate-900">Obligations by month</h2>
          {p.months.map((m, i) => (
            <div key={i} className="mt-3">
              <h3 className="text-sm font-semibold text-slate-700">{m.month}</h3>
              <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                {m.items.map((item, j) => (
                  <li key={j}>
                    {item.requirementName} — {item.propertyAddress} ({item.status})
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
