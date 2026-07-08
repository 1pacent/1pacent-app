import type { RequestCategory } from "@1pacent/core";

/** Curated set for the rate-card settings form — the full category list has
 * ~26 entries, too many for a usable table. Electrician-first wedge
 * (docs/PRODUCT_BRIEF_v3.md §7). Plain shared module (no "use server"/"use
 * client" directive) so both the action and the client form can import it. */
export const RATE_CARD_CATEGORIES: Array<{ value: RequestCategory; label: string }> = [
  { value: "electrical_general", label: "Electrical (general)" },
  { value: "dangerous_electrical_fault", label: "Dangerous electrical fault" },
  { value: "safety_device_fault_smoke_alarm_or_pool_barrier", label: "Smoke alarm / safety device fault" },
  { value: "appliance_general", label: "Appliance problem" },
  { value: "air_conditioning_failure", label: "Air conditioning failure" },
  { value: "other", label: "Other" },
];
