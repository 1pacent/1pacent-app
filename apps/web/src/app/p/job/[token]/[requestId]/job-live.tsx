"use client";

import { useRef, useState, useTransition } from "react";
import { StatusArc } from "@/components/pulse/arc";
import { GhostButton, HiVisButton, Panel } from "@/components/pulse/shell";
import { useLive } from "@/components/pulse/use-live";
import type { JobProjection } from "@/lib/data-types";
import {
  addEvidenceAction,
  addJobPartAction,
  completeJobAction,
  decideVarianceAction,
  fundJobNowAction,
  getJobAction,
  onMyWayAction,
  proposeVarianceAction,
  setAssetDetailsAction,
  startJobPulseAction,
  submitReviewAction,
  verifySettleAction,
} from "../../../actions";

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`;
}

async function compressPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.7);
}

const ROLE_LABELS = { customer: "Resident", owner: "Owner", pm: "Manager", tradie: "Tradie" } as const;

export function JobLive({ token, initial }: { token: string; initial: JobProjection }) {
  const [job, setJob] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [gateForCamera, setGateForCamera] = useState<string>("before");
  const [varianceOpen, setVarianceOpen] = useState(false);
  const [varianceTotal, setVarianceTotal] = useState("");
  const [varianceReason, setVarianceReason] = useState("");
  const [partOpen, setPartOpen] = useState(false);
  const [partLabel, setPartLabel] = useState("");
  const [partCost, setPartCost] = useState("");
  const [variancePhoto, setVariancePhoto] = useState<string | null>(null);
  const [assetOpen, setAssetOpen] = useState(false);
  const [assetMake, setAssetMake] = useState("");
  const [assetModel, setAssetModel] = useState("");
  const [assetSerial, setAssetSerial] = useState("");
  const [assetSaved, setAssetSaved] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewState, setReviewState] = useState<"idle" | "sent" | string>("idle");
  const [assetReceipt, setAssetReceipt] = useState<string | null>(null);
  const [assetPurchased, setAssetPurchased] = useState("");
  const [assetWarrantyMonths, setAssetWarrantyMonths] = useState("60");
  const varPhotoRef = useRef<HTMLInputElement | null>(null);
  const receiptRef = useRef<HTMLInputElement | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement | null>(null);

  useLive(`job-${job.requestId}`, () => {
    void getJobAction(token, job.requestId).then((next) => next && setJob(next));
  });

  function act(fn: () => Promise<{ ok: boolean; error?: string; gatesRemaining?: string[] }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      const next = await getJobAction(token, job.requestId);
      if (next) setJob(next);
    });
  }

  const wo = job.workOrderId;
  const gatesLeft = job.gatesRemaining;

  return (
    <div className="flex flex-1 flex-col gap-4 pt-2">
      <div>
        <p className="text-xs uppercase tracking-widest text-white/40">{job.propertyAddress}</p>
        <h1 className="mt-1 font-serif text-2xl font-semibold">{job.title}</h1>
      </div>

      <Panel glow={job.arcStep !== "paid"}>
        <StatusArc arc={job.arc} />
        {job.slot && (
          <p className="mt-2 text-center text-sm font-semibold text-white/80">📅 {job.slot.label}</p>
        )}
        {job.onTheWayAt && job.arcStep === "on_the_way" && (
          <p className="mt-1 text-center text-xs text-mint-300">
            On the way since {new Date(job.onTheWayAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}
          </p>
        )}
      </Panel>

      {/* People rail */}
      <div className="flex gap-2 overflow-x-auto">
        {job.parties.map((p) => (
          <div
            key={`${p.role}-${p.name}`}
            className="flex min-w-[96px] flex-col items-center gap-1 rounded-2xl border border-field-line bg-field-900 px-3 py-2.5"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-field-700 text-sm font-bold text-white/80">
              {p.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
            </span>
            <span className="text-[11px] font-semibold text-white/80">{p.name.split(" ")[0]}</span>
            <span className="text-[9px] uppercase tracking-wide text-white/40">
              {ROLE_LABELS[p.role]}
              {p.verified ? " · ✓ licensed" : ""}
            </span>
          </div>
        ))}
      </div>

      {/* Money line */}
      <Panel>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/40">Money</p>
            <p className="mt-0.5 text-sm text-white/70">{job.money.label}</p>
          </div>
          {job.money.visible && (
            <p className="text-xl font-extrabold text-hivis-400">
              {job.money.payoutCents !== null
                ? dollars(job.money.payoutCents)
                : job.money.amountCents !== null
                  ? dollars(job.money.amountCents)
                  : ""}
            </p>
          )}
        </div>
        {job.money.basis && (
          <p className="mt-2 border-t border-field-line pt-2 text-[10px] leading-relaxed text-white/40">
            {job.money.basis}
          </p>
        )}
      </Panel>

      {/* Parts booked to the job (v8 R3.5) */}
      {job.parts.length > 0 && (
        <Panel>
          <p className="mb-2 text-[10px] uppercase tracking-widest text-white/40">Parts on this job</p>
          <div className="flex flex-col gap-1.5">
            {job.parts.map((pt) => (
              <div key={pt.id} className="flex items-center justify-between text-sm">
                <span className={pt.status === "declined" ? "text-white/30 line-through" : "text-white/80"}>
                  🔩 {pt.label}
                </span>
                <span className="flex items-center gap-2 text-xs">
                  {pt.status === "pending_approval" && (
                    <span className="rounded-full bg-hivis-400/15 px-2 py-0.5 text-[9px] font-bold uppercase text-hivis-400">
                      awaiting payer
                    </span>
                  )}
                  {pt.costCents !== null && <span className="font-semibold text-white/60">{dollars(pt.costCents)}</span>}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* The learning loop, on the glass */}
      {job.onSite.actualMinutes !== null && job.onSite.estimatedMinutes !== null && (
        <p className="text-xs text-white/40">
          ⏱ On site {job.onSite.actualMinutes} min · estimated {job.onSite.estimatedMinutes} min — every job sharpens
          the network&apos;s estimates.
        </p>
      )}

      {/* Evidence strip */}
      {(job.evidence.length > 0 || job.viewer === "tradie") && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">
            Evidence{gatesLeft.length > 0 && job.viewer === "tradie" ? ` — still needed: ${gatesLeft.join(", ").replace(/_/g, " ")}` : ""}
          </p>
          <div className="flex gap-2 overflow-x-auto">
            {job.evidence.map((e, i) => (
              <div key={i} className="min-w-[88px]">
                {e.dataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.dataUrl} alt={e.gate} className="h-20 w-24 rounded-xl border border-field-line object-cover" />
                ) : (
                  <div className="flex h-20 w-24 items-center justify-center rounded-xl border border-field-line bg-field-900 text-2xl">
                    📄
                  </div>
                )}
                <p className="mt-1 text-center text-[9px] uppercase tracking-wide text-white/40">
                  {e.gate.replace(/_/g, " ")}
                </p>
              </div>
            ))}
            {job.evidence.length === 0 && (
              <p className="text-xs text-white/30">Photos land here as the work happens.</p>
            )}
          </div>
        </div>
      )}

      {/* The variance protocol (v8 R3): scope changed on site. */}
      {job.variance && job.variance.status === "pending" && (
        <div className="hivis-ping-in rounded-2xl border border-hivis-400/60 bg-field-900 p-4">
          <p className="font-bold text-white">Price changed on site</p>
          <p className="mt-1 text-xs text-white/50">
            {job.variance.reason} — {dollars(job.variance.bookedCents)} booked → {dollars(job.variance.newTotalCents)} proposed.
          </p>
          {job.variance.photoDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={job.variance.photoDataUrl}
              alt="What the tradie found"
              className="mt-2 max-h-44 w-full rounded-xl border border-field-line object-cover"
            />
          )}
          {job.actions.includes("decide_variance") ? (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  const id = job.variance!.id;
                  act(() => decideVarianceAction(token, id, job.requestId, "approve"));
                }}
                className="flex-1 rounded-xl bg-hivis-400 px-4 py-2.5 text-sm font-bold text-field-950 active:scale-[0.97]"
              >
                Approve {dollars(job.variance.newTotalCents)}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  const id = job.variance!.id;
                  act(() => decideVarianceAction(token, id, job.requestId, "decline"));
                }}
                className="flex-1 rounded-xl border border-field-line px-4 py-2.5 text-sm font-semibold text-white/60 active:scale-[0.97]"
              >
                Keep booked scope
              </button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-white/40">
              {job.viewer === "tradie" ? "Waiting on the payer — work pauses until they decide." : "The payer is deciding."}
            </p>
          )}
        </div>
      )}
      {job.variance && job.variance.status !== "pending" && job.arcStep !== "paid" && (
        <p className="text-xs text-white/40">
          Scope change {dollars(job.variance.newTotalCents)}:{" "}
          {job.variance.status === "auto_applied"
            ? "auto-approved inside the playbook's threshold"
            : job.variance.status === "approved"
              ? "approved by the payer"
              : "declined — job continues at the booked scope"}
          .
        </p>
      )}

      {error && <p className="rounded-xl bg-red-500/15 px-3 py-2 text-xs text-red-300">{error}</p>}

      {/* The one action that matters, per viewer per moment */}
      <div className="mt-auto flex flex-col gap-2 pb-2">
        {job.viewer === "tradie" && wo && (
          <>
            {job.actions.includes("on_my_way") && (
              <HiVisButton breathe disabled={pending} onClick={() => act(() => onMyWayAction(token, wo, job.requestId))}>
                🚐 On my way
              </HiVisButton>
            )}
            {job.actions.includes("start") && (
              <HiVisButton
                breathe={!job.actions.includes("on_my_way")}
                disabled={pending}
                onClick={() => act(() => startJobPulseAction(token, wo, job.requestId))}
              >
                I&apos;ve arrived — start the job
              </HiVisButton>
            )}
            {job.actions.includes("add_evidence") && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const dataUrl = await compressPhoto(file);
                    act(() => addEvidenceAction(token, wo, job.requestId, { gate: gateForCamera, dataUrl }));
                    e.target.value = "";
                  }}
                />
                <div className="flex gap-2">
                  {(gatesLeft.length > 0 ? gatesLeft : ["extra"]).map((gate) => (
                    <button
                      key={gate}
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setGateForCamera(gate);
                        fileRef.current?.click();
                      }}
                      className="flex-1 rounded-2xl border border-field-line bg-field-900 px-3 py-3 text-sm font-semibold text-white/80 active:scale-[0.97]"
                    >
                      📷 {gate.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
                {job.actions.includes("mark_done") && (
                  <HiVisButton
                    breathe={gatesLeft.length === 0}
                    disabled={pending || gatesLeft.length > 0}
                    onClick={() => act(() => completeJobAction(token, wo, job.requestId, "Done via Pulse"))}
                  >
                    {gatesLeft.length > 0 ? "Evidence first, then done" : "Job's done ✓"}
                  </HiVisButton>
                )}
              </>
            )}
            {job.actions.includes("add_part") && !partOpen && (
              <GhostButton disabled={pending} onClick={() => setPartOpen(true)}>
                🔩 Book a part to the job
              </GhostButton>
            )}
            {job.actions.includes("add_part") && partOpen && (
              <div className="rounded-2xl border border-field-line bg-field-900 p-4">
                <p className="text-sm font-bold text-white">Part &amp; cost</p>
                <input
                  type="text"
                  placeholder="What is it? (e.g. 15mm mixer cartridge)"
                  value={partLabel}
                  onChange={(e) => setPartLabel(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-field-line bg-field-950 px-3 py-2.5 text-sm text-white placeholder:text-white/30"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder="$ cost"
                  value={partCost}
                  onChange={(e) => setPartCost(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-field-line bg-field-950 px-3 py-2.5 text-sm text-white placeholder:text-white/30"
                />
                <div className="mt-3 flex gap-2">
                  <HiVisButton
                    disabled={pending || !partLabel.trim() || !partCost}
                    onClick={() => {
                      const cents = Math.round(Number(partCost) * 100);
                      act(async () => {
                        const r = await addJobPartAction(token, wo, job.requestId, {
                          label: partLabel.trim(),
                          costCents: cents,
                        });
                        if (r.ok) {
                          setPartOpen(false);
                          setPartLabel("");
                          setPartCost("");
                        }
                        return r;
                      });
                    }}
                  >
                    Book it
                  </HiVisButton>
                  <GhostButton disabled={pending} onClick={() => setPartOpen(false)}>
                    Cancel
                  </GhostButton>
                </div>
                <p className="mt-2 text-[10px] text-white/40">
                  Small parts land instantly; big ones pause for a one-tap payer approval — no surprise bills.
                </p>
              </div>
            )}
            {job.actions.includes("add_part") && !assetOpen && !assetSaved && (
              <GhostButton disabled={pending} onClick={() => setAssetOpen(true)}>
                🏷 Record the asset (make · model · serial)
              </GhostButton>
            )}
            {assetSaved && (
              <p className="text-center text-xs text-mint-300">Asset identity recorded ✓ — lands on the property record at settle.</p>
            )}
            {job.actions.includes("add_part") && assetOpen && (
              <div className="rounded-2xl border border-field-line bg-field-900 p-4">
                <p className="text-sm font-bold text-white">From the id plate</p>
                <input type="text" placeholder="Manufacturer (e.g. Daikin)" value={assetMake} onChange={(e) => setAssetMake(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-field-line bg-field-950 px-3 py-2.5 text-sm text-white placeholder:text-white/30" />
                <input type="text" placeholder="Model" value={assetModel} onChange={(e) => setAssetModel(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-field-line bg-field-950 px-3 py-2.5 text-sm text-white placeholder:text-white/30" />
                <input type="text" placeholder="Serial number" value={assetSerial} onChange={(e) => setAssetSerial(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-field-line bg-field-950 px-3 py-2.5 text-sm text-white placeholder:text-white/30" />
                <input
                  ref={receiptRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) setAssetReceipt(await compressPhoto(file));
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => receiptRef.current?.click()}
                  className="mt-2 w-full rounded-xl border border-field-line px-3 py-2.5 text-sm font-semibold text-white/70 active:scale-[0.97]"
                >
                  {assetReceipt ? "🧾 Receipt attached ✓ (tap to retake)" : "🧾 Bought it yourself? Snap the receipt"}
                </button>
                {assetReceipt && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="text-[9px] uppercase tracking-wide text-white/40">
                      Purchased
                      <input type="date" value={assetPurchased} onChange={(e) => setAssetPurchased(e.target.value)}
                        className="mt-0.5 w-full rounded-lg border border-field-line bg-field-950 px-2 py-1.5 text-xs text-white" />
                    </label>
                    <label className="text-[9px] uppercase tracking-wide text-white/40">
                      Mfr warranty (months)
                      <input type="number" min={0} max={240} value={assetWarrantyMonths} onChange={(e) => setAssetWarrantyMonths(e.target.value)}
                        className="mt-0.5 w-full rounded-lg border border-field-line bg-field-950 px-2 py-1.5 text-xs text-white" />
                    </label>
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  <HiVisButton
                    disabled={pending || (!assetMake.trim() && !assetModel.trim() && !assetSerial.trim())}
                    onClick={() =>
                      act(async () => {
                        const r = await setAssetDetailsAction(token, wo, job.requestId, {
                          manufacturer: assetMake,
                          model: assetModel,
                          serial: assetSerial,
                          receipt:
                            assetReceipt && assetPurchased
                              ? { dataUrl: assetReceipt, purchasedAt: assetPurchased, warrantyMonths: Number(assetWarrantyMonths) || 0 }
                              : null,
                        });
                        if (r.ok) {
                          setAssetOpen(false);
                          setAssetSaved(true);
                        }
                        return r;
                      })
                    }
                  >
                    Save to the record
                  </HiVisButton>
                  <GhostButton disabled={pending} onClick={() => setAssetOpen(false)}>
                    Cancel
                  </GhostButton>
                </div>
              </div>
            )}
            {job.actions.includes("propose_variance") && !varianceOpen && (
              <GhostButton disabled={pending} onClick={() => setVarianceOpen(true)}>
                Price changed on site?
              </GhostButton>
            )}
            {job.actions.includes("propose_variance") && varianceOpen && (
              <div className="rounded-2xl border border-field-line bg-field-900 p-4">
                <p className="text-sm font-bold text-white">New total for the whole job</p>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder="$ new total"
                  value={varianceTotal}
                  onChange={(e) => setVarianceTotal(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-field-line bg-field-950 px-3 py-2.5 text-sm text-white placeholder:text-white/30"
                />
                <input
                  type="text"
                  placeholder="What changed? (the payer reads this)"
                  value={varianceReason}
                  onChange={(e) => setVarianceReason(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-field-line bg-field-950 px-3 py-2.5 text-sm text-white placeholder:text-white/30"
                />
                <input
                  ref={varPhotoRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) setVariancePhoto(await compressPhoto(file));
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => varPhotoRef.current?.click()}
                  className="mt-2 w-full rounded-xl border border-field-line px-3 py-2.5 text-sm font-semibold text-white/70 active:scale-[0.97]"
                >
                  {variancePhoto ? "📷 Photo attached ✓ (tap to retake)" : "📷 Photo of what you found (protects you)"}
                </button>
                <div className="mt-3 flex gap-2">
                  <HiVisButton
                    disabled={pending || !varianceTotal || !varianceReason.trim()}
                    onClick={() => {
                      const cents = Math.round(Number(varianceTotal) * 100);
                      act(async () => {
                        const r = await proposeVarianceAction(token, wo, job.requestId, {
                          newTotalCents: cents,
                          reason: varianceReason.trim(),
                          photoDataUrl: variancePhoto,
                        });
                        if (r.ok) {
                          setVarianceOpen(false);
                          setVarianceTotal("");
                          setVarianceReason("");
                          setVariancePhoto(null);
                        }
                        return r;
                      });
                    }}
                  >
                    Send to payer
                  </HiVisButton>
                  <GhostButton disabled={pending} onClick={() => setVarianceOpen(false)}>
                    Cancel
                  </GhostButton>
                </div>
                <p className="mt-2 text-[10px] text-white/40">
                  Small changes inside the playbook&apos;s threshold apply instantly; bigger ones pause the job for a
                  one-tap payer decision. Approved scope changes never count against your accuracy score — the photo is
                  your proof it wasn&apos;t your call.
                </p>
              </div>
            )}
            {job.arcStep === "done" && (
              <p className="text-center text-xs text-white/40">
                Waiting on the customer&apos;s tap — you&apos;ll be paid the moment they verify.
              </p>
            )}
            {job.arcStep === "paid" && (
              <p className="rounded-2xl bg-mint-400/15 px-4 py-3 text-center text-sm font-bold text-mint-300">
                💸 Paid out — same day. Nice work.
              </p>
            )}
          </>
        )}

        {job.viewer !== "tradie" && job.actions.includes("verify") && (
          <HiVisButton breathe disabled={pending} onClick={() => act(() => verifySettleAction(token, job.requestId))}>
            Yes — it&apos;s fixed ✓
          </HiVisButton>
        )}
        {/* v8 R6: trust short — the owner pays now, tradie still same-day. */}
        {job.viewer === "payer" && job.money.awaitingFunding && (
          <div className="hivis-ping-in rounded-2xl border border-amber-400/60 bg-field-900 p-4">
            <p className="font-bold text-white">Rent hasn&apos;t landed — pay this one now?</p>
            <p className="mt-1 text-xs text-white/50">
              The property&apos;s trust balance is short{job.money.amountCents ? ` of ${dollars(job.money.amountCents)}` : ""}.
              One tap pays by card; your tradie is still paid today. Or leave it for the month-end run.
            </p>
            <HiVisButton
              breathe
              disabled={pending}
              onClick={() => act(() => fundJobNowAction(token, job.requestId))}
            >
              💳 Pay now{job.money.amountCents ? ` — ${dollars(job.money.amountCents)}` : ""}
            </HiVisButton>
          </div>
        )}

        {job.viewer !== "tradie" && job.arcStep === "paid" && (
          <p className="rounded-2xl bg-mint-400/15 px-4 py-3 text-center text-sm font-bold text-mint-300">
            All done — written to the address record forever.
          </p>
        )}
        {/* v8 R6: feedback into the score — one review per job, post-verify. */}
        {job.viewer !== "tradie" && job.arcStep === "paid" && reviewState !== "sent" && (
          <div className="rounded-2xl border border-field-line bg-field-900 p-4">
            <p className="text-sm font-bold text-white">How was it?</p>
            <div className="mt-2 flex justify-center gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setReviewRating(n)}
                  className={`text-3xl ${n <= reviewRating ? "text-hivis-400" : "text-white/20"}`}
                  aria-label={`${n} star${n === 1 ? "" : "s"}`}
                >
                  ★
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="A sentence for the next customer (optional)"
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              className="mt-2 w-full rounded-xl border border-field-line bg-field-950 px-3 py-2.5 text-sm text-white placeholder:text-white/30"
            />
            <button
              type="button"
              disabled={pending || reviewRating === 0}
              onClick={() => {
                setReviewState("idle");
                void submitReviewAction(token, job.requestId, {
                  rating: reviewRating,
                  comment: reviewComment.trim() || undefined,
                }).then((r) => setReviewState(r.ok ? "sent" : (r.error ?? "Could not send.")));
              }}
              className="mt-3 w-full rounded-xl bg-hivis-400 px-4 py-2.5 text-sm font-bold text-field-950 active:scale-[0.97] disabled:opacity-50"
            >
              Send review
            </button>
            <p className="mt-1.5 text-center text-[10px] text-white/40">
              Feeds the tradie&apos;s trust score (30% of it) — accuracy earns the other 70%.
            </p>
            {reviewState !== "idle" && reviewState !== "sent" && (
              <p className="mt-1 text-center text-[10px] text-red-300">{reviewState}</p>
            )}
          </div>
        )}
        {reviewState === "sent" && (
          <p className="text-center text-xs font-semibold text-mint-300">Review posted — thank you ✓</p>
        )}
      </div>

      {/* Timeline */}
      <details className="pb-4">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-white/40">
          Full history
        </summary>
        <ul className="mt-2 space-y-1.5">
          {job.timeline.map((t, i) => (
            <li key={i} className="flex justify-between text-xs">
              <span className="text-white/70">{t.label}</span>
              <span className="text-white/30">
                {t.at ? new Date(t.at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : ""}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

