"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { attachAssetReceiptAction } from "@/app/p/actions";

async function compressFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    // PDFs and other docs: raw data URL (kept small by the caller's choice).
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.75);
}

/** Proof of purchase for an asset the payer supplied themselves (v8 R4b):
 * receipt + purchase date + manufacturer warranty → the Address Record. */
export function ReceiptCard({ token, assetId, assetLabel }: { token: string; assetId: string; assetLabel: string }) {
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [purchasedAt, setPurchasedAt] = useState("");
  const [months, setMonths] = useState("60");
  const [state, setState] = useState<"idle" | "saving" | "done" | string>("idle");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  if (state === "done") return <p className="text-[10px] font-semibold text-mint-300">Receipt on file ✓</p>;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[10px] font-semibold text-hivis-400">
        + add receipt
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-field-line bg-field-950 p-3">
      <p className="text-xs font-bold text-white">Receipt for {assetLabel}</p>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) setDataUrl(await compressFile(f));
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="mt-2 w-full rounded-lg border border-field-line px-3 py-2 text-xs font-semibold text-white/70"
      >
        {dataUrl ? "📎 Attached ✓ (tap to replace)" : "📎 Photo or PDF of the receipt"}
      </button>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-[9px] uppercase tracking-wide text-white/40">
          Purchased
          <input
            type="date"
            value={purchasedAt}
            onChange={(e) => setPurchasedAt(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-field-line bg-field-900 px-2 py-1.5 text-xs text-white"
          />
        </label>
        <label className="text-[9px] uppercase tracking-wide text-white/40">
          Mfr warranty (months)
          <input
            type="number"
            min={0}
            max={240}
            value={months}
            onChange={(e) => setMonths(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-field-line bg-field-900 px-2 py-1.5 text-xs text-white"
          />
        </label>
      </div>
      <button
        type="button"
        disabled={state === "saving" || !dataUrl || !purchasedAt}
        onClick={() => {
          setState("saving");
          void attachAssetReceiptAction(token, assetId, {
            dataUrl: dataUrl!,
            purchasedAt,
            warrantyMonths: Number(months) || 0,
          }).then((r) => {
            if (r.ok) {
              setState("done");
              router.refresh();
            } else setState(r.error ?? "Could not save.");
          });
        }}
        className="mt-2 w-full rounded-lg bg-hivis-400 px-3 py-2 text-xs font-bold text-field-950 disabled:opacity-50"
      >
        {state === "saving" ? "Saving…" : "Save to the record"}
      </button>
      {state !== "idle" && state !== "saving" && state !== "done" && (
        <p className="mt-1 text-[10px] text-red-300">{state}</p>
      )}
    </div>
  );
}
