"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GhostButton, HiVisButton, Panel } from "@/components/pulse/shell";
import { bookJobAction, triagePreviewAction, type TriagePreviewResult } from "../../actions";

/**
 * The Button (Product Strategy v8 §4.1): camera-first, voice-second, typing
 * last. Twenty seconds from tap to a priced, bookable card. LLM-off falls
 * back to four category tiles — the flow never dies.
 */

const QUICK_PICKS = [
  { label: "Leaking tap / plumbing", category: "plumbing_general" as const },
  { label: "No hot water", category: "failure_of_essential_service_hot_water" as const },
  { label: "Electrical fault", category: "dangerous_electrical_fault" as const },
  { label: "Something else", category: "other" as const },
];

function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-AU")}`;
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

type Phase = "button" | "describe" | "preview" | "booked";

export function FixFlow({
  token,
  address,
  openJobs,
}: {
  token: string;
  address: string;
  openJobs: Array<{ id: string; title: string; state: string }>;
}) {
  const [phase, setPhase] = useState<Phase>("button");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [result, setResult] = useState<TriagePreviewResult | null>(null);
  const [slotIndex, setSlotIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<{ requestId: string; offered: number; amountCents: number | null } | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  function holdToTalk() {
    const w = window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    if (!w.webkitSpeechRecognition) return;
    const rec = new w.webkitSpeechRecognition();
    rec.lang = "en-AU";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const said = Array.from(e.results).map((r) => r[0]?.transcript ?? "").join(" ");
      setDescription((d) => (d ? `${d} ${said}` : said));
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  }

  function runTriage(category?: (typeof QUICK_PICKS)[number]["category"]) {
    setError(null);
    startTransition(async () => {
      const r = await triagePreviewAction(token, {
        description: description.trim(),
        photoDataUrl: photo,
        category,
      });
      if (!r.ok) {
        if (r.error === "llm_off") setError("pick");
        else setError(r.error ?? "Something went wrong.");
        return;
      }
      setResult(r);
      setSlotIndex(0);
      setPhase("preview");
    });
  }

  function book() {
    const preview = result?.preview;
    if (!preview) return;
    setError(null);
    startTransition(async () => {
      const r = await bookJobAction(token, {
        title: result?.triage?.title ?? preview.playbookTitle,
        description: result?.triage?.description ?? description.trim() ?? preview.playbookTitle,
        category: preview.category,
        playbookKey: preview.playbookKey,
        propertyId: preview.propertyId,
        slot: preview.slots[slotIndex]
          ? { startAt: preview.slots[slotIndex]!.startAt, endAt: preview.slots[slotIndex]!.endAt }
          : null,
        aiMeta: result?.aiMeta ?? null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setBooked({ requestId: r.requestId, offered: r.offered, amountCents: r.amountAuthorizedCents });
      setPhase("booked");
      setTimeout(() => router.push(`/p/job/${token}/${r.requestId}`), 1400);
    });
  }

  if (phase === "button") {
    return (
      <div className="flex flex-1 flex-col">
        <p className="mt-2 text-center text-xs uppercase tracking-widest text-white/40">{address}</p>
        <div className="flex flex-1 flex-col items-center justify-center py-10">
          <button
            type="button"
            onClick={() => setPhase("describe")}
            className="hivis-breathe flex h-56 w-56 flex-col items-center justify-center gap-2 rounded-full bg-hivis-400 text-field-950 shadow-2xl transition active:scale-95"
          >
            <span className="text-4xl">🛠</span>
            <span className="px-8 text-center text-xl font-extrabold leading-tight">
              Something needs fixing
            </span>
          </button>
          <p className="mt-6 max-w-[240px] text-center text-xs text-white/40">
            Photo, voice or a few words — a real price and a real time in about twenty seconds.
          </p>
        </div>
        {openJobs.length > 0 && (
          <div className="mb-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">Your live jobs</p>
            <div className="flex flex-col gap-2">
              {openJobs.map((j) => (
                <Link
                  key={j.id}
                  href={`/p/job/${token}/${j.id}`}
                  className="flex items-center justify-between rounded-2xl border border-field-line bg-field-900 px-4 py-3 active:scale-[0.98]"
                >
                  <span className="text-sm font-semibold text-white">{j.title}</span>
                  <span className="text-xs text-mint-300">{j.state.replace(/_/g, " ")} →</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (phase === "describe") {
    return (
      <div className="flex flex-1 flex-col gap-4 pt-4">
        <h1 className="font-serif text-2xl font-semibold">What&apos;s going on?</h1>

        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) setPhoto(await compressPhoto(file));
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex h-36 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-field-line bg-field-900 active:scale-[0.99]"
        >
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="the problem" className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm text-white/50">📷 Show us — photos beat words</span>
          )}
        </button>

        <div className="flex gap-2">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="…or say it / type it"
            rows={2}
            className="flex-1 rounded-2xl border border-field-line bg-field-900 px-4 py-3 text-sm text-white placeholder:text-white/30"
          />
          <button
            type="button"
            onClick={holdToTalk}
            className={`w-14 rounded-2xl border text-xl ${listening ? "border-hivis-400 text-hivis-400" : "border-field-line text-white/60"}`}
          >
            {listening ? "…" : "🎙"}
          </button>
        </div>

        {error === "pick" && (
          <p className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
            Sally&apos;s offline — pick the closest match below and everything still works.
          </p>
        )}
        {error && error !== "pick" && (
          <p className="rounded-xl bg-red-500/15 px-3 py-2 text-xs text-red-300">{error}</p>
        )}

        <HiVisButton
          onClick={() => runTriage()}
          disabled={pending || (!description.trim() && !photo)}
        >
          {pending ? "Sally's looking…" : "Get my price →"}
        </HiVisButton>

        <div className="grid grid-cols-2 gap-2">
          {QUICK_PICKS.map((q) => (
            <button
              key={q.category}
              type="button"
              disabled={pending}
              onClick={() => runTriage(q.category)}
              className="rounded-2xl border border-field-line bg-field-900 px-3 py-3 text-sm font-semibold text-white/80 active:scale-[0.97]"
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (phase === "preview" && result?.preview) {
    const p = result.preview;
    return (
      <div className="flex flex-1 flex-col gap-4 pt-4 hivis-ping-in">
        {result.triage?.hazardWarning && (
          <p className="rounded-2xl border border-red-400/50 bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-200">
            ⚠️ {result.triage.hazardWarning}
          </p>
        )}
        <Panel glow>
          <p className="text-xs uppercase tracking-widest text-white/40">{p.playbookTitle}</p>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-white">
            {result.triage?.title ?? p.playbookTitle}
          </h1>
          {result.triage?.description && (
            <p className="mt-1 text-sm text-white/60">{result.triage.description}</p>
          )}
          <div className="mt-4 border-t border-field-line pt-4">
            {p.pricing === "fixed_band" && p.bandLowCents && p.bandHighCents && p.bookAmountCents ? (
              <>
                <p className="text-3xl font-extrabold text-hivis-400">
                  {dollars(p.bookAmountCents)}
                  <span className="ml-2 align-middle text-xs font-medium text-white/40">
                    fixed · band {dollars(p.bandLowCents)}–{dollars(p.bandHighCents)}
                  </span>
                </p>
                <p className="mt-1 text-xs text-white/50">
                  From real jobs like yours nearby. Your card is authorized now, charged only when you say
                  it&apos;s done.{p.warrantyMonths > 0 ? ` ${p.warrantyMonths}-month warranty included.` : ""}
                </p>
              </>
            ) : (
              <>
                <p className="text-xl font-bold text-white">Quotes race for this one</p>
                <p className="mt-1 text-xs text-white/50">
                  Non-standard scope — three verified tradies quote in the background; you pick from your
                  phone. No calls, no chasing.
                </p>
              </>
            )}
          </div>
        </Panel>

        {p.slots.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">
              {p.tradiesOnline} verified tradie{p.tradiesOnline === 1 ? "" : "s"} online — earliest times
            </p>
            <div className="flex flex-col gap-2">
              {p.slots.map((s, i) => (
                <button
                  key={s.startAt}
                  type="button"
                  onClick={() => setSlotIndex(i)}
                  className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold active:scale-[0.98] ${
                    i === slotIndex
                      ? "border-hivis-400 bg-hivis-400/10 text-hivis-400"
                      : "border-field-line bg-field-900 text-white/70"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="rounded-xl bg-red-500/15 px-3 py-2 text-xs text-red-300">{error}</p>}

        <div className="mt-auto flex flex-col gap-2 pb-2">
          <HiVisButton onClick={book} disabled={pending} breathe>
            {pending
              ? "Booking…"
              : p.bookAmountCents
                ? `Book it — ${dollars(p.bookAmountCents)}`
                : "Send it to the network →"}
          </HiVisButton>
          <GhostButton onClick={() => setPhase("describe")}>Change something</GhostButton>
        </div>
      </div>
    );
  }

  // booked
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center hivis-ping-in">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-mint-400 text-4xl">✓</span>
      <h1 className="font-serif text-2xl font-semibold">Booked.</h1>
      <p className="max-w-[260px] text-sm text-white/50">
        {booked?.offered
          ? `Pinging ${booked.offered} verified tradie${booked.offered === 1 ? "" : "s"} near you — first to accept is yours.`
          : "Your quote race is under way."}
      </p>
    </div>
  );
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
}
