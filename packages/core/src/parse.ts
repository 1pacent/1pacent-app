/**
 * Defensive parsing helpers — the "fallback across many key names"
 * tolerance ported from the Dart models (audit §1.3), for ingesting
 * payloads from n8n workflows and third parties whose key naming drifts.
 */

export function firstOf<T = unknown>(
  obj: Record<string, unknown> | null | undefined,
  keys: readonly string[],
): T | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null) return value as T;
  }
  return undefined;
}

export function asString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

export function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function asDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return undefined;
}
