"use client";

import { useState, useTransition } from "react";
import { invoiceJobAction, markJobDoneAction, startJobAction } from "./actions";

/** Display-ready only — no @1pacent/core import here (breaks the client
 * bundle, same rule as rate-card-form.tsx). */
export interface JobsPanelJob {
  workOrderId: string;
  category: string;
  requestTitle: string;
  propertyAddress: string;
  stateLabel: "scheduled" | "in_progress" | "evidence_pending" | "verified";
  quoteDisplay: string;
}

function displayCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function JobsPanel({ token, jobs }: { token: string; jobs: JobsPanelJob[] }) {
  const scheduled = jobs.filter((j) => j.stateLabel === "scheduled");
  const inProgress = jobs.filter((j) => j.stateLabel === "in_progress");
  const evidencePending = jobs.filter((j) => j.stateLabel === "evidence_pending");
  const awaitingInvoice = jobs.filter((j) => j.stateLabel === "verified");

  if (jobs.length === 0) {
    return <p className="mt-2 text-sm text-slate-500">No active jobs right now.</p>;
  }

  return (
    <div className="mt-3 space-y-5">
      {scheduled.length > 0 && (
        <JobGroup title="Ready to start">
          {scheduled.map((j) => (
            <StartRow key={j.workOrderId} token={token} job={j} />
          ))}
        </JobGroup>
      )}
      {inProgress.length > 0 && (
        <JobGroup title="In progress">
          {inProgress.map((j) => (
            <MarkDoneRow key={j.workOrderId} token={token} job={j} />
          ))}
        </JobGroup>
      )}
      {evidencePending.length > 0 && (
        <JobGroup title="Waiting on the tenant to confirm">
          {evidencePending.map((j) => (
            <JobLine key={j.workOrderId} job={j}>
              <span className="text-xs text-slate-400">Sent to tenant</span>
            </JobLine>
          ))}
        </JobGroup>
      )}
      {awaitingInvoice.length > 0 && (
        <JobGroup title="Confirmed — enter your invoice">
          {awaitingInvoice.map((j) => (
            <InvoiceRow key={j.workOrderId} token={token} job={j} />
          ))}
        </JobGroup>
      )}
    </div>
  );
}

function JobGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function JobLine({ job, children }: { job: JobsPanelJob; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
      <div>
        <p className="font-medium text-slate-900">{job.requestTitle}</p>
        <p className="text-xs text-slate-500">
          {job.propertyAddress} · {job.quoteDisplay}
        </p>
      </div>
      {children}
    </div>
  );
}

function StartRow({ token, job }: { token: string; job: JobsPanelJob }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) return <JobLine job={job}><span className="text-xs font-medium text-brand-700">Started ✓</span></JobLine>;

  return (
    <JobLine job={job}>
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-red-600">{error}</span>}
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await startJobAction(token, job.workOrderId);
              if (!r.ok) {
                setError(r.error ?? "Could not start this job.");
                return;
              }
              setDone(true);
            })
          }
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Starting…" : "Start job"}
        </button>
      </div>
    </JobLine>
  );
}

function MarkDoneRow({ token, job }: { token: string; job: JobsPanelJob }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) return <JobLine job={job}><span className="text-xs font-medium text-brand-700">Sent to tenant ✓</span></JobLine>;

  if (!open) {
    return (
      <JobLine job={job}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
        >
          Mark done
        </button>
      </JobLine>
    );
  }

  return (
    <div className="rounded-lg bg-slate-50 px-3 py-3 text-sm">
      <p className="font-medium text-slate-900">{job.requestTitle}</p>
      <p className="text-xs text-slate-500">{job.propertyAddress}</p>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What did you do? (the tenant will see this)"
        rows={2}
        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={pending || !note.trim()}
          onClick={() =>
            startTransition(async () => {
              const r = await markJobDoneAction(token, job.workOrderId, note.trim());
              if (!r.ok) {
                setError(r.error ?? "Could not mark this job done.");
                return;
              }
              setDone(true);
            })
          }
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send to tenant"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function InvoiceRow({ token, job }: { token: string; job: JobsPanelJob }) {
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) return <JobLine job={job}><span className="text-xs font-medium text-brand-700">Invoiced ✓</span></JobLine>;

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const r = await invoiceJobAction(token, job.workOrderId, job.category, formData);
          setResult(r);
          if (r.ok) setDone(true);
        })
      }
      className="rounded-lg bg-slate-50 px-3 py-3 text-sm"
    >
      <p className="font-medium text-slate-900">{job.requestTitle}</p>
      <p className="text-xs text-slate-500">{job.propertyAddress}</p>
      {result && !result.ok && <p className="mt-2 text-xs text-red-600">{result.error}</p>}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input name="invoiceCents" placeholder="Total invoice $" inputMode="decimal" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input name="callOutFeeCents" placeholder="Call-out fee $" inputMode="decimal" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input name="assetLabel" placeholder='What you worked on (e.g. "Hot water system")' required className="col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input name="assetInstalledAt" type="date" placeholder="Installed date (if known)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-500" />
        <select name="warrantyMonths" defaultValue="0" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="0">No warranty</option>
          <option value="3">3 months</option>
          <option value="6">6 months</option>
          <option value="12">12 months</option>
          <option value="24">24 months</option>
        </select>
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        A warranty routes any matching future issue straight back to you — no new marketplace round.
      </p>
      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Send invoice"}
      </button>
    </form>
  );
}
