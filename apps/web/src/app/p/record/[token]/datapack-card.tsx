"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { generateDataPackAction } from "@/app/p/actions";

/**
 * The second orbit (Product Strategy v8 §7): the record powers products
 * beyond the immediate need. The Data Pack is job exhaust, compiled — sale
 * or tax time, one tap. Planning estimates never masquerade as tax advice.
 */
export function DataPackCard({ token, propertyId }: { token: string; propertyId: string }) {
  const [reportId, setReportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-2xl border border-field-line bg-field-900 p-4">
      <p className="font-bold text-white">Property Data Pack</p>
      <p className="mt-1 text-xs text-white/40">
        The record, compiled: assets & ages, spend history, compliance evidence, warranties. For sale time, tax
        time, or your insurer. Planning estimates — not a tax or legal document.
      </p>
      {reportId ? (
        <Link
          href={`/p/report/${token}/${reportId}`}
          className="mt-3 block rounded-xl bg-mint-400/15 px-4 py-2.5 text-center text-sm font-bold text-mint-300 active:scale-[0.97]"
        >
          Open the pack →
        </Link>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const r = await generateDataPackAction(token, propertyId);
              if (r.ok && r.reportId) setReportId(r.reportId);
              else setError(r.error ?? "Could not build the pack.");
            });
          }}
          className="mt-3 w-full rounded-xl bg-hivis-400 px-4 py-2.5 text-sm font-bold text-field-950 active:scale-[0.97]"
        >
          {pending ? "Compiling…" : "Build it from the record"}
        </button>
      )}
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}
