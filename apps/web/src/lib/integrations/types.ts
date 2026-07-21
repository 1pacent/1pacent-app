/**
 * PM platform integration contracts (v9 R9.2). The connector interface every
 * provider implements, and the PII-safe shapes that cross the boundary.
 */

export const PM_PROVIDERS = ["propertyme", "property_tree", "console", "reapit", "ailo", "other"] as const;
export type PmProvider = (typeof PM_PROVIDERS)[number];

/** The ONLY property shape allowed across the boundary — an allowlist. Any
 * field a provider returns that is not mapped here is dropped (so a new PII
 * field can never leak by default). NEVER add DOB, identity docs, or financial
 * fields. Contact fields are minimised and encrypted at rest. */
export interface ExternalProperty {
  externalId: string;
  addressLine1: string;
  addressLine2?: string | null;
  suburb: string;
  state: string;
  postcode: string;
  propertyType?: string | null;
  managedFromDate?: string | null;
  /** Access-coordination only. Encrypted at rest. Optional. */
  maintenanceContactName?: string | null;
  maintenanceContactPhone?: string | null;
  /** Provider flags "this property is no longer managed" → we mark archived. */
  archived?: boolean;
}

/** Job outcome pushed back to the PM's platform — ONLY when write-back is
 * explicitly enabled. Deliberately narrow: a maintenance note, never money or
 * tenancy. */
export interface JobOutcome {
  externalPropertyId: string;
  title: string;
  completedAt: string;
  summary: string;
  invoiceTotalCents?: number | null;
}

export interface ConnectorContext {
  /** Decrypted credentials for this connection (provider-specific shape). */
  credentials: Record<string, unknown>;
}

export interface PmConnector {
  readonly provider: PmProvider;
  readonly displayName: string;
  /** Whether real API wiring exists yet (vs a documented stub awaiting partner creds). */
  readonly live: boolean;
  /** READ: pull the full managed portfolio (bulk import + reconciliation). */
  listProperties(ctx: ConnectorContext): Promise<ExternalProperty[]>;
  /** Optional WRITE-BACK: push a job outcome. Only invoked when the connection
   * has write-back explicitly enabled. Absent = provider is read-only. */
  pushJobOutcome?(ctx: ConnectorContext, outcome: JobOutcome): Promise<{ ok: boolean; error?: string }>;
  /** Verify a webhook payload's signature (when the provider supports webhooks). */
  verifyWebhook?(headers: Headers, rawBody: string): boolean;
  /** Parse a webhook payload into property deltas. */
  parseWebhook?(rawBody: string): ExternalProperty[];
}

export interface SyncResult {
  ok: boolean;
  imported: number;
  updated: number;
  archived: number;
  propertyCount: number;
  overCap: boolean;
  cap: number | null;
  error?: string;
}
