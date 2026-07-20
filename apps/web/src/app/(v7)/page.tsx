import Link from "next/link";
import { supabaseConfigured } from "@/lib/supabase";

export default function LandingPage() {
  const live = supabaseConfigured();
  return (
    <div className="py-4">
      <div className="rounded-2xl bg-brand-900 px-6 py-10 sm:px-10 sm:py-14">
        <p className="font-mono text-xs uppercase tracking-widest text-gold-300">The record that never resets</p>
        <h1 className="mt-3 max-w-xl font-serif text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Your rental&apos;s whole history, in one permanent record.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-brand-100">
          Every Zaivo property gets a passport, not an account — a maintenance and compliance
          record that survives a change of tenant, owner, or managing agent, instead of resetting
          to zero every time one of them changes.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg bg-gold-400 px-5 py-2.5 font-semibold text-brand-900 hover:bg-gold-300"
          >
            {live ? "Open the dashboard" : "See the demo dashboard"}
          </Link>
          <Link
            href={live ? "/dashboard" : "/r/demo-intake"}
            className="rounded-lg border border-brand-500 px-5 py-2.5 font-semibold text-brand-50 hover:bg-brand-800"
          >
            {live ? "Test as a persona" : "Try tenant intake"}
          </Link>
        </div>
        <div className="mt-10 flex flex-wrap gap-x-8 gap-y-2 border-t border-brand-700 pt-5 font-mono text-xs text-brand-200">
          <span>
            <span className="text-gold-300">TYPE</span> · AU RENTAL
          </span>
          <span>
            <span className="text-gold-300">AUTHORITY</span> · 1PACENT NETWORK
          </span>
          <span>
            <span className="text-gold-300">VALID</span> · AS LONG AS THE PROPERTY STANDS
          </span>
        </div>
      </div>

      <div className="mt-12 grid gap-6 sm:grid-cols-3">
        {[
          {
            title: "Warranty-aware repairs",
            body: "A matching fault within warranty routes straight back to the tradie who did the original job — no new marketplace round, no second callout fee.",
          },
          {
            title: "Approval on autopilot",
            body: "Set your policy once — \"auto-approve under $300\" or \"under $800 if trust is 80+\" — and most jobs dispatch with zero taps from you.",
          },
          {
            title: "A record that survives you",
            body: "Compliance history, asset ages, and real cost data outlive any single tenant, owner, or managing agent — an audit-grade trail from day one.",
          },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="font-serif text-base font-semibold text-slate-900">{f.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{f.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
