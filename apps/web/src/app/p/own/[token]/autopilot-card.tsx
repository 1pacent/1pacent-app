"use client";

import { useState, useTransition } from "react";
import type { AutopilotView } from "@/lib/data-types";
import { setAutopilotAction } from "@/app/p/actions";

const CAP_STOPS = [20_000, 35_000, 50_000, 75_000, 100_000, 150_000, 250_000];
const TRUST_STOPS = [0, 40, 50, 60, 70, 80, 90];

/**
 * Owner Autopilot (Developer Brief v8 §8 R2): the v4 approval-policy engine
 * resurfaced as three sliders. Configure once; thereafter quotes that fit
 * inside these bounds auto-accept and everything else lands as a Moment.
 * Gas / dangerous-electrical / life-safety work always comes to a human
 * while the safety switch is on.
 */
export function AutopilotCard({ token, initial }: { token: string; initial: AutopilotView }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [capIdx, setCapIdx] = useState(nearestIndex(CAP_STOPS, initial.maxTotalCents));
  const [trustIdx, setTrustIdx] = useState(nearestIndex(TRUST_STOPS, initial.minTrustScore));
  const [safetyOn, setSafetyOn] = useState(initial.safetyCategories.length > 0);
  const [saved, setSaved] = useState<null | "ok" | string>(null);
  const [pending, startTransition] = useTransition();

  function save(next: { enabled?: boolean; capIdx?: number; trustIdx?: number; safetyOn?: boolean }) {
    const payload = {
      enabled: next.enabled ?? enabled,
      maxTotalCents: CAP_STOPS[next.capIdx ?? capIdx]!,
      minTrustScore: TRUST_STOPS[next.trustIdx ?? trustIdx]!,
      safetyOn: next.safetyOn ?? safetyOn,
    };
    setSaved(null);
    startTransition(async () => {
      const r = await setAutopilotAction(token, payload);
      setSaved(r.ok ? "ok" : (r.error ?? "Could not save."));
    });
  }

  return (
    <div className="rounded-2xl border border-field-line bg-field-900 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-bold text-white">Autopilot</p>
          <p className="text-xs text-white/40">
            {enabled
              ? `Approving up to $${Math.round(CAP_STOPS[capIdx]! / 100)} · trust ${TRUST_STOPS[trustIdx]}+ · ${initial.propertiesCovered} propert${initial.propertiesCovered === 1 ? "y" : "ies"}`
              : "Every decision comes to you"}
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setEnabled(!enabled);
            save({ enabled: !enabled });
          }}
          className={`relative h-7 w-12 rounded-full transition-colors ${enabled ? "bg-hivis-400" : "bg-white/15"}`}
          aria-label="Toggle autopilot"
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${enabled ? "left-[calc(100%-1.625rem)]" : "left-0.5"}`}
          />
        </button>
      </div>

      {enabled && (
        <div className="mt-4 flex flex-col gap-4">
          <label className="block">
            <span className="flex justify-between text-xs text-white/50">
              <span>Approve without asking, up to</span>
              <span className="font-bold text-hivis-400">${Math.round(CAP_STOPS[capIdx]! / 100)}</span>
            </span>
            <input
              type="range"
              min={0}
              max={CAP_STOPS.length - 1}
              step={1}
              value={capIdx}
              onChange={(e) => setCapIdx(Number(e.target.value))}
              onPointerUp={() => save({})}
              onKeyUp={() => save({})}
              className="mt-1 w-full accent-[#38BDF8]"
            />
          </label>
          <label className="block">
            <span className="flex justify-between text-xs text-white/50">
              <span>Only tradies with trust score</span>
              <span className="font-bold text-hivis-400">{TRUST_STOPS[trustIdx]}+</span>
            </span>
            <input
              type="range"
              min={0}
              max={TRUST_STOPS.length - 1}
              step={1}
              value={trustIdx}
              onChange={(e) => setTrustIdx(Number(e.target.value))}
              onPointerUp={() => save({})}
              onKeyUp={() => save({})}
              className="mt-1 w-full accent-[#38BDF8]"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setSafetyOn(!safetyOn);
              save({ safetyOn: !safetyOn });
            }}
            className="flex items-center justify-between rounded-xl border border-field-line px-3 py-2.5 text-left"
          >
            <span>
              <span className="block text-xs font-semibold text-white">Safety work always asks me</span>
              <span className="block text-[10px] text-white/40">Gas, dangerous electrical, smoke alarms</span>
            </span>
            <span className={`text-xs font-bold ${safetyOn ? "text-mint-300" : "text-white/30"}`}>
              {safetyOn ? "ON" : "OFF"}
            </span>
          </button>
        </div>
      )}

      {saved === "ok" && <p className="mt-2 text-right text-[10px] font-semibold text-mint-300">Saved ✓</p>}
      {saved && saved !== "ok" && <p className="mt-2 text-right text-[10px] text-red-300">{saved}</p>}
    </div>
  );
}

function nearestIndex(stops: number[], value: number): number {
  let best = 0;
  for (let i = 1; i < stops.length; i++) {
    if (Math.abs(stops[i]! - value) < Math.abs(stops[best]! - value)) best = i;
  }
  return best;
}
