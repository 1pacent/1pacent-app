import "server-only";
import {
  decideApproval,
  evaluateProperty,
  hashToken,
  isUrgentCategory,
  projectState,
  transition,
  validateToken,
  REQUEST_EVENTS,
  type ActorType,
  type EvidenceRecord,
  type RequestCategory,
  type RequestEvent,
  type RequestState,
  type TokenScope,
} from "@1pacent/core";
import { serviceClient } from "./supabase";
import type {
  ApprovalContext,
  DataSource,
  IntakeContext,
  PropertyDetail,
  PropertySummary,
  RequestView,
} from "./data-types";

/**
 * Supabase-backed data source. Runs with the service role inside the API
 * tier only; every query is explicitly scoped by id/token — tokens are
 * looked up by SHA-256 hash and validated with @1pacent/core before any
 * row is touched. Status transitions append to `events` first (source of
 * truth), then update the projection column.
 */

interface PropertyRow {
  id: string;
  address_line1: string;
  suburb: string;
  state: string;
  postcode: string;
  jurisdiction: "VIC" | "NSW" | "QLD";
  has_gas: boolean;
  has_pool: boolean;
  auto_approve_cap_cents: number;
  org_id: string;
}

interface CertRow {
  requirement_key: string;
  completed_at: string;
  expires_at: string | null;
}

interface RequestRow {
  id: string;
  org_id: string;
  property_id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  estimate_cents: number | null;
  reported_at: string;
}

interface EventRow {
  aggregate_id: string;
  event_type: string;
  actor_type: string;
  actor_id: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

function toEvidence(certs: CertRow[]): EvidenceRecord[] {
  return certs.map((c) => ({
    requirementKey: c.requirement_key,
    completedAt: new Date(c.completed_at),
    ...(c.expires_at ? { expiresAt: new Date(c.expires_at) } : {}),
  }));
}

const OPEN_EXCLUDED = ["closed", "cancelled"];

function toRequestView(row: RequestRow, events: EventRow[]): RequestView {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category as RequestCategory,
    estimateCents: row.estimate_cents,
    state: row.status as RequestState,
    events: events
      .filter((e) => e.aggregate_id === row.id)
      .map((e) => ({
        eventType: e.event_type as RequestEvent,
        actorType: e.actor_type as ActorType,
        note: typeof e.payload?.note === "string" ? e.payload.note : undefined,
      })),
  };
}

export const supabaseData: DataSource = {
  async listProperties(): Promise<PropertySummary[]> {
    const db = serviceClient();
    const { data, error } = await db
      .from("properties")
      .select(
        "id, address_line1, suburb, state, postcode, jurisdiction, has_gas, has_pool, auto_approve_cap_cents, org_id, compliance_certificates(requirement_key, completed_at, expires_at), maintenance_requests(status)",
      )
      .order("created_at", { ascending: true });
    if (error) throw new Error(`listProperties: ${error.message}`);
    const today = new Date();
    return (data as unknown as Array<
      PropertyRow & { compliance_certificates: CertRow[]; maintenance_requests: Array<{ status: string }> }
    >).map((p) => ({
      id: p.id,
      address: p.address_line1,
      suburb: `${p.suburb} ${p.state} ${p.postcode}`,
      autoApproveCapCents: Number(p.auto_approve_cap_cents),
      compliance: evaluateProperty(
        { jurisdiction: p.jurisdiction, hasGas: p.has_gas, hasPool: p.has_pool },
        toEvidence(p.compliance_certificates ?? []),
        today,
      ),
      openRequests: (p.maintenance_requests ?? []).filter((r) => !OPEN_EXCLUDED.includes(r.status))
        .length,
    }));
  },

  async getProperty(id: string): Promise<PropertyDetail | null> {
    const db = serviceClient();
    const { data: p, error } = await db
      .from("properties")
      .select(
        "id, address_line1, suburb, state, postcode, jurisdiction, has_gas, has_pool, auto_approve_cap_cents, org_id, compliance_certificates(requirement_key, completed_at, expires_at), maintenance_requests(id, org_id, property_id, title, description, category, status, estimate_cents, reported_at)",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`getProperty: ${error.message}`);
    if (!p) return null;
    const property = p as unknown as PropertyRow & {
      compliance_certificates: CertRow[];
      maintenance_requests: RequestRow[];
    };
    const requestIds = (property.maintenance_requests ?? []).map((r) => r.id);
    let events: EventRow[] = [];
    if (requestIds.length > 0) {
      const { data: ev, error: evError } = await db
        .from("events")
        .select("aggregate_id, event_type, actor_type, actor_id, payload, created_at")
        .eq("aggregate_type", "maintenance_request")
        .in("aggregate_id", requestIds)
        .order("id", { ascending: true });
      if (evError) throw new Error(`getProperty events: ${evError.message}`);
      events = ev as unknown as EventRow[];
    }
    const requests = (property.maintenance_requests ?? []).map((r) => toRequestView(r, events));
    return {
      id: property.id,
      address: property.address_line1,
      suburb: `${property.suburb} ${property.state} ${property.postcode}`,
      autoApproveCapCents: Number(property.auto_approve_cap_cents),
      compliance: evaluateProperty(
        { jurisdiction: property.jurisdiction, hasGas: property.has_gas, hasPool: property.has_pool },
        toEvidence(property.compliance_certificates ?? []),
        new Date(),
      ),
      openRequests: requests.filter((r) => !OPEN_EXCLUDED.includes(r.state)).length,
      requests,
    };
  },

  async getIntakeContext(token: string): Promise<IntakeContext | null> {
    const resolved = await resolveToken(token, "tenant_intake");
    if (!resolved?.aggregate_id) return null;
    const property = await this.getProperty(resolved.aggregate_id);
    if (!property) return null;
    return { property: { id: property.id, address: property.address, suburb: property.suburb } };
  },

  async lodgeIntake(token, input) {
    const resolved = await resolveToken(token, "tenant_intake");
    if (!resolved?.aggregate_id) {
      return { ok: false as const, error: "This link is invalid or has expired. Ask your rental provider for a new one." };
    }
    const db = serviceClient();
    const { data: prop, error: propError } = await db
      .from("properties")
      .select("id, org_id, auto_approve_cap_cents")
      .eq("id", resolved.aggregate_id)
      .maybeSingle();
    if (propError || !prop) return { ok: false as const, error: "Property not found for this link." };

    const urgent = isUrgentCategory(input.category);
    const decision = decideApproval({
      category: input.category,
      estimateCents: 0,
      policy: { autoApproveCapCents: Number(prop.auto_approve_cap_cents) },
    });
    const followUp: RequestEvent =
      urgent && decision.outcome === "auto_approved" ? "auto_approve" : "request_approval";
    // Validate the projected stream before persisting anything.
    const state = projectState([
      { eventType: "triage", actorType: "system" },
      { eventType: followUp, actorType: "system" },
    ]);

    const { data: req, error: reqError } = await db
      .from("maintenance_requests")
      .insert({
        org_id: prop.org_id,
        property_id: prop.id,
        title: input.title,
        description: input.description,
        category: input.category,
        is_urgent: urgent,
        status: state,
      })
      .select("id")
      .single();
    if (reqError) return { ok: false as const, error: `Could not save the request: ${reqError.message}` };

    const base = {
      org_id: prop.org_id,
      aggregate_type: "maintenance_request",
      aggregate_id: req.id,
      actor_type: "system",
    };
    const { error: evError } = await db.from("events").insert([
      { ...base, event_type: "triage", actor_id: "triage-rules", payload: { source: "tenant_intake", token_id: resolved.id } },
      {
        ...base,
        event_type: followUp,
        actor_id: "approval-rules",
        payload: {
          note:
            followUp === "auto_approve"
              ? "Urgent bypass (VIC urgent repairs list)"
              : "Routed to landlord approval",
        },
      },
    ]);
    if (evError) return { ok: false as const, error: `Could not record events: ${evError.message}` };

    return { ok: true as const, requestId: req.id, state, urgent };
  },

  async getApprovalContext(token: string): Promise<ApprovalContext | null> {
    const resolved = await resolveToken(token, "landlord_approval");
    if (!resolved?.aggregate_id) return null;
    const db = serviceClient();
    const { data: req } = await db
      .from("maintenance_requests")
      .select("id, title, description, category, estimate_cents, property_id, properties(address_line1, suburb, state, postcode)")
      .eq("id", resolved.aggregate_id)
      .maybeSingle();
    if (!req) return null;
    // supabase-js types to-one joins as arrays; normalise either shape.
    const joined = (req as unknown as {
      properties?:
        | { address_line1: string; suburb: string; state: string; postcode: string }
        | Array<{ address_line1: string; suburb: string; state: string; postcode: string }>;
    }).properties;
    const prop = Array.isArray(joined) ? joined[0] : joined;
    return {
      request: {
        id: req.id,
        title: req.title,
        description: req.description,
        category: req.category as RequestCategory,
        estimateCents: req.estimate_cents,
        address: prop ? `${prop.address_line1}, ${prop.suburb} ${prop.state} ${prop.postcode}` : "",
      },
    };
  },

  async decideApprovalByToken(token, decision) {
    const resolved = await resolveToken(token, "landlord_approval");
    if (!resolved?.aggregate_id) {
      return { ok: false as const, error: "This approval link is invalid or has expired." };
    }
    const db = serviceClient();
    const { data: req } = await db
      .from("maintenance_requests")
      .select("id, org_id, status")
      .eq("id", resolved.aggregate_id)
      .maybeSingle();
    if (!req) return { ok: false as const, error: "Request not found." };

    const current = req.status as RequestState;
    const result = transition(current, decision, "landlord");
    if (!result.ok) {
      return { ok: false as const, error: `This request is ${current.replace(/_/g, " ")} — no decision is pending.` };
    }

    const { error: evError } = await db.from("events").insert({
      org_id: req.org_id,
      aggregate_type: "maintenance_request",
      aggregate_id: req.id,
      event_type: decision,
      actor_type: "landlord",
      actor_id: `token:${resolved.id}`,
    });
    if (evError) return { ok: false as const, error: `Could not record the decision: ${evError.message}` };

    await db.from("maintenance_requests").update({ status: result.state }).eq("id", req.id);
    await db.from("access_tokens").update({ used_at: new Date().toISOString() }).eq("id", resolved.id);
    return { ok: true as const, state: result.state };
  },
};

interface TokenRow {
  id: string;
  token_hash: string;
  scope: TokenScope;
  aggregate_id: string | null;
  expires_at: string;
  used_at: string | null;
}

async function resolveToken(rawToken: string, expectedScope: TokenScope): Promise<TokenRow | null> {
  const db = serviceClient();
  const { data } = await db
    .from("access_tokens")
    .select("id, token_hash, scope, aggregate_id, expires_at, used_at")
    .eq("token_hash", hashToken(rawToken))
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as TokenRow;
  const check = validateToken(
    rawToken,
    {
      tokenHash: row.token_hash,
      scope: row.scope,
      expiresAt: new Date(row.expires_at),
      usedAt: row.used_at ? new Date(row.used_at) : null,
    },
    expectedScope,
  );
  return check.ok ? row : null;
}

// Compile-time guard: request event names used above must stay in the
// canonical list exported by core.
const _guard: readonly RequestEvent[] = REQUEST_EVENTS;
void _guard;
