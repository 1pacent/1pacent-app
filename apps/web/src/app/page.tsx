import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="py-8">
      <div className="max-w-2xl">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-emerald-700">
          For Victorian rental providers
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">
          Is your rental property compliant <em className="not-italic underline decoration-red-400 decoration-4">right now</em>?
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          Smoke alarms every 12 months. Gas every 2 years. Electrical every 2 years. Minimum
          standards before you list. 1Pacent turns Victoria&apos;s rental compliance rules into a
          traffic-light dashboard — and handles the maintenance requests, approvals, and tradie
          dispatch that follow, with an audit-grade evidence trail.
        </p>
        <div className="mt-8 flex gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg bg-emerald-600 px-5 py-2.5 font-semibold text-white hover:bg-emerald-700"
          >
            See the demo dashboard
          </Link>
          <Link
            href="/r/demo-intake"
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 font-semibold text-slate-700 hover:bg-slate-50"
          >
            Try tenant intake
          </Link>
        </div>
      </div>

      <div className="mt-16 grid gap-6 sm:grid-cols-3">
        {[
          {
            title: "Compliance radar",
            body: "Answer six questions, see every overdue check in red. VIC ruleset built in, sourced from the Residential Tenancies Regulations 2021.",
          },
          {
            title: "Tenant QR intake",
            body: "Tenants report issues with photos in under 90 seconds from a QR code. No app, no account, ever.",
          },
          {
            title: "Audit-grade trail",
            body: "Every action — human or AI-assisted — lands in an append-only event log. Export a Compliance Pack PDF when it matters.",
          },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="font-semibold text-slate-900">{f.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{f.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
