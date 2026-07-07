"use client";

import { useState, useTransition } from "react";
import { submitQuote, type SubmitQuoteResult } from "./actions";

export function QuoteForm({ token }: { token: string }) {
  const [result, setResult] = useState<SubmitQuoteResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (result?.ok) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <p className="text-lg font-semibold text-emerald-900">Quote sent ✓</p>
        <p className="mt-2 text-sm text-emerald-800">
          The landlord will review all quotes and let you know if you've been selected.
        </p>
      </div>
    );
  }

  return (
    <form
      action={(formData) => startTransition(async () => setResult(await submitQuote(token, formData)))}
      className="space-y-5"
    >
      {result && !result.ok && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{result.error}</p>
      )}

      <div>
        <label htmlFor="quote" className="block text-sm font-medium text-slate-700">
          Your quote (excl. call-out fee)
        </label>
        <input
          id="quote"
          name="quote"
          required
          placeholder="e.g. 180.00"
          inputMode="decimal"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
        />
      </div>

      <div>
        <label htmlFor="calloutFee" className="block text-sm font-medium text-slate-700">
          Call-out fee (optional)
        </label>
        <input
          id="calloutFee"
          name="calloutFee"
          placeholder="e.g. 80.00"
          inputMode="decimal"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
        />
      </div>

      <div>
        <label htmlFor="note" className="block text-sm font-medium text-slate-700">
          Anything the landlord should know (optional)
        </label>
        <textarea
          id="note"
          name="note"
          rows={3}
          placeholder="Availability, assumptions, exclusions…"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send quote"}
      </button>
    </form>
  );
}
