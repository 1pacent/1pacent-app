"use client";

import { useState } from "react";
import { AddressAutocomplete, type PickedAddress } from "@/components/pulse/address-autocomplete";

const PERSONAS = [
  { key: "renter", label: "I rent", blurb: "Something's broken at my place" },
  { key: "landlord", label: "I own a rental", blurb: "I want it handled + on the record" },
  { key: "owner", label: "I own my home", blurb: "I need a tradie I can trust" },
  { key: "pm", label: "I manage properties", blurb: "Give me the Dispatch Deck" },
  { key: "tradie", label: "I'm a tradie", blurb: "Fill my day, pay me same-day" },
] as const;

/** Onboarding: value before identity — one form, five doors. */
export function JoinForm() {
  const [persona, setPersona] = useState<string>("landlord");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [suburb, setSuburb] = useState("");
  const [address, setAddress] = useState<PickedAddress | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "done" | string>("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona,
          fullName,
          email,
          phone,
          suburb: address?.suburb ?? suburb,
          addressText: address?.formattedAddress ?? null,
          gnafPid: address?.gnafPid ?? null,
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      setState(body.ok ? "done" : (body.error ?? "Something went wrong — try again."));
    } catch {
      setState("You're offline — try again in a moment.");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-2xl border border-mint-400/40 bg-mint-400/10 p-6 text-center">
        <p className="text-lg font-bold text-mint-300">You're in the queue ✓</p>
        <p className="mt-1 text-sm text-white/60">
          We onboard street by street so every first job has verified tradies ready. We'll email you the moment your
          suburb lights up — renters and property managers usually within days.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {PERSONAS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPersona(p.key)}
            className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
              persona === p.key ? "border-hivis-400 bg-hivis-400/10" : "border-field-line bg-field-900"
            }`}
          >
            <span className={`block text-sm font-bold ${persona === p.key ? "text-hivis-400" : "text-white"}`}>
              {p.label}
            </span>
            <span className="block text-[10px] leading-tight text-white/40">{p.blurb}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          required
          placeholder="Your name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="rounded-xl border border-field-line bg-field-900 px-4 py-3 text-sm text-white placeholder:text-white/30"
        />
        <input
          required
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-xl border border-field-line bg-field-900 px-4 py-3 text-sm text-white placeholder:text-white/30"
        />
        <input
          placeholder="Mobile (optional)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="rounded-xl border border-field-line bg-field-900 px-4 py-3 text-sm text-white placeholder:text-white/30"
        />
        <AddressAutocomplete
          placeholder="Property address (start typing — pick the match)"
          onPick={(picked) => {
            setAddress(picked);
            if (picked) setSuburb(picked.suburb);
          }}
        />
      </div>
      <button
        type="submit"
        disabled={state === "sending"}
        className="hivis-breathe rounded-2xl bg-hivis-400 px-6 py-4 text-lg font-bold text-field-950 active:scale-[0.98] disabled:opacity-60"
      >
        {state === "sending" ? "Joining…" : "Join the network"}
      </button>
      {state !== "idle" && state !== "sending" && state !== "done" && (
        <p className="rounded-xl bg-red-500/15 px-3 py-2 text-center text-xs text-red-300">{state}</p>
      )}
      <p className="text-center text-[10px] text-white/30">
        No spam, no lock-in. We only email you about your own jobs and your suburb going live.
      </p>
    </form>
  );
}
