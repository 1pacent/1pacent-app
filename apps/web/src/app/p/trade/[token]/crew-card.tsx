"use client";

import { useState } from "react";
import { addCrewMemberAction } from "@/app/p/actions";

/**
 * The crew (v8 R5b): field staff under the business. Each gets their own
 * link — their own Online toggle, their own location, their own run — while
 * the rate card, trust score and payouts stay with the business. The minted
 * link shows ONCE: share it straight to their phone.
 */
export function CrewCard({
  token,
  initial,
}: {
  token: string;
  initial: Array<{ contactId: string; name: string; online: boolean }>;
}) {
  const [crew, setCrew] = useState(initial);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [mintedPath, setMintedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="rounded-2xl border border-field-line bg-field-900 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-bold text-white">My crew</p>
          <p className="text-xs text-white/40">
            {crew.length === 0
              ? "Just you for now — add your team so jobs keep flowing when you're on the tools."
              : `${crew.filter((c) => c.online).length} of ${crew.length} online`}
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setMintedPath(null);
            }}
            className="rounded-xl bg-hivis-400 px-3 py-1.5 text-xs font-bold text-field-950 active:scale-[0.97]"
          >
            + Add
          </button>
        )}
      </div>

      {crew.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {crew.map((c) => (
            <div key={c.contactId} className="flex items-center justify-between text-sm">
              <span className="text-white/80">{c.name}</span>
              <span className={`text-xs font-bold ${c.online ? "text-mint-300" : "text-white/30"}`}>
                {c.online ? "● online" : "offline"}
              </span>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-3 border-t border-field-line pt-3">
          <input
            type="text"
            placeholder="Their name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-field-line bg-field-950 px-3 py-2.5 text-sm text-white placeholder:text-white/30"
          />
          <input
            type="tel"
            placeholder="Mobile (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-2 w-full rounded-xl border border-field-line bg-field-950 px-3 py-2.5 text-sm text-white placeholder:text-white/30"
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending || name.trim().length < 2}
              onClick={() => {
                setPending(true);
                setError(null);
                void addCrewMemberAction(token, { name: name.trim(), phone: phone.trim() || undefined }).then((r) => {
                  setPending(false);
                  if (r.ok && r.path) {
                    setMintedPath(r.path);
                    setCrew((prev) => [...prev, { contactId: `new-${Date.now()}`, name: name.trim(), online: false }]);
                    setName("");
                    setPhone("");
                    setOpen(false);
                  } else setError(r.error ?? "Could not add them.");
                });
              }}
              className="flex-1 rounded-xl bg-hivis-400 px-4 py-2.5 text-sm font-bold text-field-950 active:scale-[0.97] disabled:opacity-50"
            >
              {pending ? "Adding…" : "Add to crew"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setOpen(false)}
              className="rounded-xl border border-field-line px-4 py-2.5 text-sm font-semibold text-white/60"
            >
              Cancel
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
        </div>
      )}

      {mintedPath && (
        <div className="mt-3 rounded-xl border border-mint-400/40 bg-mint-400/10 p-3">
          <p className="text-xs font-bold text-mint-300">Their link — share it to their phone now (shown once):</p>
          <p className="mt-1 break-all font-mono text-[10px] text-white/80">
            {typeof window !== "undefined" ? window.location.origin : ""}
            {mintedPath}
          </p>
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}${mintedPath}`)}
            className="mt-2 rounded-lg border border-field-line px-3 py-1.5 text-[10px] font-semibold text-white/70"
          >
            Copy link
          </button>
        </div>
      )}
    </div>
  );
}
