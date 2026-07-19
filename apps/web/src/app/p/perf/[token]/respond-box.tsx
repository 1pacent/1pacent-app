"use client";

import { useState } from "react";
import { respondToReviewAction } from "@/app/p/actions";

/** One reply, on the record — the business closes the loop on feedback. */
export function RespondBox({ token, reviewId }: { token: string; reviewId: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done" | string>("idle");

  if (state === "done") return <p className="mt-1 text-[10px] text-mint-300">Response posted ✓</p>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 text-[10px] font-semibold text-hivis-400">
        Respond
      </button>
    );
  }
  return (
    <div className="mt-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Your reply — the payer and future customers see it"
        rows={2}
        className="w-full rounded-xl border border-field-line bg-field-950 px-3 py-2 text-xs text-white placeholder:text-white/30"
      />
      <div className="mt-1.5 flex gap-2">
        <button
          type="button"
          disabled={state === "saving" || text.trim().length < 2}
          onClick={() => {
            setState("saving");
            void respondToReviewAction(token, reviewId, text.trim()).then((r) =>
              setState(r.ok ? "done" : (r.error ?? "Could not post.")),
            );
          }}
          className="rounded-lg bg-hivis-400 px-3 py-1.5 text-[10px] font-bold text-field-950 disabled:opacity-50"
        >
          Post reply
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[10px] text-white/40">
          Cancel
        </button>
      </div>
      {state !== "idle" && state !== "saving" && state !== "done" && (
        <p className="mt-1 text-[10px] text-red-300">{state}</p>
      )}
    </div>
  );
}
