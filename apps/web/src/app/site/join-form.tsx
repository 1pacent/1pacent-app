"use client";

import { useState } from "react";
import { AddressAutocomplete, type PickedAddress } from "@/components/pulse/address-autocomplete";
import { CompanyLookup, type PickedCompany } from "./company-lookup";
import { SuburbChips } from "./suburb-chips";

/**
 * Persona-aware onboarding (v8 R8.3). Value before identity, but the form
 * now expands to capture exactly what the network needs from each persona to
 * do its job — no more, so joining stays fast:
 *  - renter: their place.
 *  - owner-occupier: their home (and they can also flag they're a landlord →
 *    add rental properties in the same go).
 *  - landlord: one or more rental properties.
 *  - PM: agency (ABN lookup) + portfolio size (→ subscription cohort).
 *  - tradie: business (ABN lookup) + trades + suburbs served.
 */

const PERSONAS = [
  { key: "renter", label: "I rent", blurb: "Something's broken at my place" },
  { key: "owner", label: "I own my home", blurb: "I need a tradie I can trust" },
  { key: "landlord", label: "I own a rental", blurb: "Handled + on the record" },
  { key: "pm", label: "I manage properties", blurb: "Give me the Dispatch Deck" },
  { key: "tradie", label: "I'm a tradie", blurb: "Fill my day, pay me same-day" },
] as const;

const TRADES: Array<{ key: string; label: string }> = [
  { key: "plumbing", label: "Plumbing" },
  { key: "electrical", label: "Electrical" },
  { key: "hvac", label: "Heating & cooling" },
  { key: "appliance_repair", label: "Appliances" },
  { key: "locksmith", label: "Locksmith" },
  { key: "carpentry", label: "Carpentry" },
  { key: "roofing", label: "Roofing" },
  { key: "painting", label: "Painting" },
  { key: "pest_control", label: "Pest control" },
  { key: "gardening", label: "Gardening" },
  { key: "general_maintenance", label: "Handyman (general)" },
];

const PM_COHORTS = [20, 50, 100, 200, 300, 400, 500, 1000];

interface PropertyEntry {
  address: PickedAddress | null;
  addressText: string;
  role: "owner_occupier" | "rental";
}

export function JoinForm() {
  const [persona, setPersona] = useState<string>("owner");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | string>("idle");

  // owner/landlord
  const [alsoLandlord, setAlsoLandlord] = useState(false);
  const [homeAddress, setHomeAddress] = useState<PickedAddress | null>(null);
  const [rentals, setRentals] = useState<PropertyEntry[]>([{ address: null, addressText: "", role: "rental" }]);

  // tradie / pm business
  const [company, setCompany] = useState<PickedCompany>({ name: "", abn: null });
  const [tradeTypes, setTradeTypes] = useState<string[]>([]);
  const [serviceSuburbs, setServiceSuburbs] = useState<string[]>([]);
  const [pum, setPum] = useState<number | null>(null);

  const showBusiness = persona === "tradie" || persona === "pm";
  const showProperties = persona === "landlord" || (persona === "owner" && alsoLandlord);

  function toggleTrade(key: string) {
    setTradeTypes((t) => (t.includes(key) ? t.filter((x) => x !== key) : [...t, key]));
  }
  function updateRental(i: number, patch: Partial<PropertyEntry>) {
    setRentals((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");

    const roles: string[] = [persona];
    if (persona === "owner" && alsoLandlord) roles.push("landlord");

    const properties: Array<{ addressText: string | null; gnafPid: string | null; suburb: string | null; role: string }> = [];
    if (persona === "owner" && homeAddress) {
      properties.push({ addressText: homeAddress.formattedAddress, gnafPid: homeAddress.gnafPid, suburb: homeAddress.suburb, role: "owner_occupier" });
    }
    if (showProperties) {
      for (const r of rentals) {
        const text = r.address?.formattedAddress ?? r.addressText.trim();
        if (text) properties.push({ addressText: text, gnafPid: r.address?.gnafPid ?? null, suburb: r.address?.suburb ?? null, role: "rental" });
      }
    }

    const primaryAddress =
      persona === "renter" ? homeAddress : persona === "owner" ? homeAddress : properties[0]?.gnafPid ? properties[0] : null;

    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona,
          roles,
          firstName,
          lastName,
          fullName: `${firstName} ${lastName}`.trim(),
          email,
          phone,
          // primary address (renter/owner home)
          suburb: (primaryAddress as PickedAddress | null)?.suburb ?? homeAddress?.suburb ?? null,
          addressText: (primaryAddress as { formattedAddress?: string } | null)?.formattedAddress ?? homeAddress?.formattedAddress ?? null,
          gnafPid: (primaryAddress as PickedAddress | null)?.gnafPid ?? homeAddress?.gnafPid ?? null,
          // business
          companyName: showBusiness ? company.name || null : null,
          abn: showBusiness ? company.abn : null,
          tradeTypes: persona === "tradie" ? tradeTypes : null,
          serviceSuburbs: persona === "tradie" ? serviceSuburbs : null,
          propertiesUnderMgmt: persona === "pm" ? pum : null,
          // properties (landlord/owner-landlord)
          properties: properties.length > 0 ? properties : null,
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
        <p className="text-lg font-bold text-mint-300">You&apos;re in the queue ✓</p>
        <p className="mt-1 text-sm text-white/60">
          {persona === "tradie"
            ? "We verify your licence & insurance, then switch you on for jobs in your suburbs. We'll be in touch shortly."
            : persona === "pm"
              ? "We'll set up your Dispatch Deck and confirm the subscription cohort for your portfolio. Talk soon."
              : "We onboard street by street so every first job has verified tradies ready. We'll email the moment your suburb lights up."}
        </p>
      </div>
    );
  }

  const inputClass =
    "rounded-xl border border-field-line bg-field-900 px-4 py-3 text-sm text-white placeholder:text-white/30";

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {/* Persona picker */}
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
            <span className={`block text-sm font-bold ${persona === p.key ? "text-hivis-400" : "text-white"}`}>{p.label}</span>
            <span className="block text-[10px] leading-tight text-white/40">{p.blurb}</span>
          </button>
        ))}
      </div>

      {/* Everyone: name split + contact */}
      <div className="grid gap-2 sm:grid-cols-2">
        <input required placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
        <input required placeholder="Surname" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
        <input required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        <input required placeholder="Mobile" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} inputMode="tel" />
      </div>

      {/* Renter / owner-occupier: their place */}
      {(persona === "renter" || persona === "owner") && (
        <AddressAutocomplete
          placeholder={persona === "renter" ? "Your rental's address" : "Your home's address"}
          onPick={(p) => setHomeAddress(p)}
        />
      )}

      {/* Owner: also a landlord? */}
      {persona === "owner" && (
        <label className="flex items-center gap-2 rounded-xl border border-field-line bg-field-900 px-4 py-3 text-sm text-white/80">
          <input type="checkbox" checked={alsoLandlord} onChange={(e) => setAlsoLandlord(e.target.checked)} className="h-4 w-4 accent-hivis-400" />
          I&apos;m also a landlord — I have rental properties to add
        </label>
      )}

      {/* Landlord / owner-landlord: the rental properties */}
      {showProperties && (
        <div className="flex flex-col gap-2 rounded-xl border border-field-line bg-field-900/50 p-3">
          <p className="text-xs font-semibold text-white/70">
            {persona === "owner" ? "Your rental properties" : "Your rental properties"} — add as many as you like
          </p>
          {rentals.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex-1">
                <AddressAutocomplete
                  placeholder={`Rental #${i + 1} address`}
                  onPick={(p) => updateRental(i, { address: p, addressText: p?.formattedAddress ?? "" })}
                />
              </div>
              {rentals.length > 1 && (
                <button
                  type="button"
                  onClick={() => setRentals((rs) => rs.filter((_, idx) => idx !== i))}
                  className="rounded-lg border border-field-line px-2 py-2 text-xs text-white/50"
                  aria-label="Remove property"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRentals((rs) => [...rs, { address: null, addressText: "", role: "rental" }])}
            className="self-start text-xs font-semibold text-hivis-400"
          >
            + Add another property
          </button>
        </div>
      )}

      {/* Business persona: company via ABN lookup */}
      {showBusiness && (
        <CompanyLookup onPick={setCompany} />
      )}

      {/* Tradie: trades + service suburbs */}
      {persona === "tradie" && (
        <>
          <div className="rounded-xl border border-field-line bg-field-900/50 p-3">
            <p className="mb-2 text-xs font-semibold text-white/70">What do you do? (pick all that apply)</p>
            <div className="flex flex-wrap gap-1.5">
              {TRADES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => toggleTrade(t.key)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    tradeTypes.includes(t.key) ? "bg-hivis-400 text-field-950" : "border border-field-line bg-field-900 text-white/60"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-field-line bg-field-900/50 p-3">
            <p className="mb-2 text-xs font-semibold text-white/70">Suburbs you cover</p>
            <SuburbChips onChange={setServiceSuburbs} />
          </div>
        </>
      )}

      {/* PM: portfolio size → subscription cohort */}
      {persona === "pm" && (
        <div className="rounded-xl border border-field-line bg-field-900/50 p-3">
          <p className="mb-2 text-xs font-semibold text-white/70">How many properties do you manage?</p>
          <div className="flex flex-wrap gap-1.5">
            {PM_COHORTS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setPum(c)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  pum === c ? "bg-hivis-400 text-field-950" : "border border-field-line bg-field-900 text-white/60"
                }`}
              >
                up to {c}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-white/40">Sets your subscription cohort — you can change it before you go live.</p>
        </div>
      )}

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
        No spam, no lock-in. We only email you about your own jobs and your suburb going live. By joining you agree to our{" "}
        <a href="/terms" className="underline">Terms of Use</a>.
      </p>
    </form>
  );
}
