"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Self-serve savings calculator (v9 R9.1). A PM picks their portfolio size and
 * sees the admin time Zaivo removes vs the subscription fee — the pitch deck's
 * ROI slide, made interactive. Pricing is pulled live from /api/pricing so it
 * never drifts from the billing catalogue. Assumptions are editable and shown
 * (auditable, never a black box).
 */

interface Tier {
  sku: string;
  name: string;
  propertyCap: number;
  monthlyCents: number;
}

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-AU")}`;

export function SavingsCalculator() {
  const [tiers, setTiers] = useState<Tier[] | null>(null);
  const [doors, setDoors] = useState(50);
  const [jobsPerYear, setJobsPerYear] = useState(4);
  const [minsPerJob, setMinsPerJob] = useState(45);
  const [hourlyRate, setHourlyRate] = useState(40);

  useEffect(() => {
    fetch("/api/pricing")
      .then((r) => r.json())
      .then((d: { tiers: Tier[] }) => setTiers(d.tiers))
      .catch(() => setTiers([]));
  }, []);

  const result = useMemo(() => {
    if (!tiers || tiers.length === 0) return null;
    const maxCap = tiers[tiers.length - 1]!.propertyCap;
    const d = Math.max(1, Math.min(doors, maxCap));
    const tier = tiers.find((t) => t.propertyCap >= d) ?? tiers[tiers.length - 1]!;
    // Hard labour saved (conservative): jobs/yr × mins/job × $/hr.
    const hoursSavedYear = (d * jobsPerYear * minsPerJob) / 60;
    const savingYearCents = Math.round(hoursSavedYear * hourlyRate * 100);
    const savingMonthCents = Math.round(savingYearCents / 12);
    const feeMonthCents = tier.monthlyCents;
    const netMonthCents = savingMonthCents - feeMonthCents;
    const roi = feeMonthCents > 0 ? savingMonthCents / feeMonthCents : 0;
    return { d, tier, savingMonthCents, savingYearCents, feeMonthCents, netMonthCents, roi, hoursSavedYear };
  }, [tiers, doors, jobsPerYear, minsPerJob, hourlyRate]);

  const maxCap = tiers?.[tiers.length - 1]?.propertyCap ?? 1000;

  return (
    <div className="rounded-2xl border border-field-line bg-field-900 p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-hivis-400">Savings calculator</p>
      <h3 className="mt-1 font-serif text-2xl font-semibold">What could Zaivo give your team back?</h3>
      <p className="mt-1 text-sm text-white/50">
        Slide to your portfolio size. The maths is your own — every input below is editable.
      </p>

      {/* Portfolio slider */}
      <div className="mt-5">
        <div className="flex items-baseline justify-between">
          <label className="text-xs uppercase tracking-widest text-white/40">Properties under management</label>
          <span className="font-mono text-2xl font-extrabold text-white">{result?.d ?? doors}</span>
        </div>
        <input
          type="range"
          min={1}
          max={maxCap}
          value={Math.min(doors, maxCap)}
          onChange={(e) => setDoors(Number(e.target.value))}
          className="mt-2 w-full accent-hivis-400"
        />
        <div className="flex justify-between text-[10px] text-white/30">
          <span>1</span>
          <span>{maxCap.toLocaleString("en-AU")}</span>
        </div>
      </div>

      {/* Assumptions */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Assumption label="Jobs / property / yr" value={jobsPerYear} set={setJobsPerYear} min={1} max={12} />
        <Assumption label="Mins saved / job" value={minsPerJob} set={setMinsPerJob} min={5} max={180} step={5} />
        <Assumption label="Admin $/hr" value={hourlyRate} set={setHourlyRate} min={20} max={120} step={5} />
      </div>

      {/* Result */}
      {result && (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Team time saved / yr" value={`${Math.round(result.hoursSavedYear).toLocaleString("en-AU")} hrs`} accent />
          <Stat label="Labour saved / mo" value={money(result.savingMonthCents)} accent />
          <Stat label={`${result.tier.propertyCap}-door plan`} value={`${money(result.feeMonthCents)}/mo`} />
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-xl border border-hivis-400/40 bg-hivis-400/10 p-4 text-center">
          {result.netMonthCents >= 0 ? (
            <>
              <p className="text-sm text-white/70">
                Net in your pocket after the Zaivo fee
              </p>
              <p className="mt-1 text-3xl font-extrabold text-hivis-300">
                {money(result.netMonthCents)}<span className="text-lg font-semibold text-white/50">/mo</span>
              </p>
              <p className="mt-1 text-xs text-white/50">
                That&apos;s a <span className="font-bold text-hivis-300">{result.roi.toFixed(1)}×</span> return on your
                subscription — and it ignores compliance, disputes, faster resolution and staff retention.
              </p>
            </>
          ) : (
            <p className="text-sm text-white/70">
              At this size and job volume the plan pays for itself as your volume grows — and the softer wins
              (compliance, disputes, retention) aren&apos;t even counted here.
            </p>
          )}
        </div>
      )}

      <p className="mt-3 text-center text-[10px] text-white/30">
        Indicative only, on your own inputs. Hard labour saved = properties × jobs/yr × mins/job × $/hr.
      </p>
    </div>
  );
}

function Assumption({
  label,
  value,
  set,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  set: (n: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <label className="rounded-xl border border-field-line bg-field-950 p-2 text-center">
      <span className="block text-[9px] uppercase tracking-wider text-white/40">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => set(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        className="mt-0.5 w-full bg-transparent text-center text-lg font-bold text-white outline-none"
      />
    </label>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-field-line bg-field-950 p-3 text-center">
      <p className="text-[10px] uppercase tracking-widest text-white/40">{label}</p>
      <p className={`mt-1 text-xl font-extrabold ${accent ? "text-hivis-300" : "text-white"}`}>{value}</p>
    </div>
  );
}
