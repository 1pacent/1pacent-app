/**
 * The memory substrate seam (Product Brief v7 §2). Honcho gives Sally
 * per-person theory-of-mind memory (peers = contacts, sessions =
 * conversations). HARD RULE, enforced *in code* at this boundary: Honcho
 * never stores or answers facts about money, dates, assets, or compliance —
 * the database is the source of truth; Honcho only makes Sally feel like
 * she knows you.
 */

export type GuardedFactTag = "money" | "date" | "compliance" | "asset";

export interface MemoryFact {
  content: string;
  /** Optional caller-supplied tags; guarded tags are refused. */
  tags?: string[];
}

export interface MemoryBackend {
  readonly name: "honcho" | "pgvector";
  /** Store curated conversational facts about a person. Guarded facts are refused. */
  writeFacts(input: {
    orgId: string;
    contactId: string;
    conversationId: string;
    facts: MemoryFact[];
  }): Promise<{ written: number; refused: number }>;
  /** Recall conversational context for a person. Never a source of factual answers. */
  recall(input: { orgId: string; contactId: string; query: string }): Promise<string | null>;
}

const GUARDED_TAGS: readonly GuardedFactTag[] = ["money", "date", "compliance", "asset"];

/** Heuristics for facts that must live in the ledger, not in memory. */
const GUARDED_PATTERNS: RegExp[] = [
  /\$\s?\d/, // dollar amounts
  /\b\d+(?:\.\d+)?\s*(?:dollars|aud|cents)\b/i,
  /\b(?:invoice|quote[ds]?|paid|payment|owes?|owing|cost[s]?|price[sd]?)\b/i,
  /\b(?:due|expires?|expiry|deadline|overdue)\b/i,
  /\b(?:complian[ct]|certificate|smoke alarm|gas check|electrical check)\b/i,
  /\b(?:warranty|asset register|installed (?:in|on|at)\s)\b/i,
  /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/, // concrete dates
];

/** True when a fact must be refused at the memory boundary. Exported for tests. */
export function isGuardedFact(fact: MemoryFact): boolean {
  if (fact.tags?.some((t) => (GUARDED_TAGS as readonly string[]).includes(t))) return true;
  return GUARDED_PATTERNS.some((p) => p.test(fact.content));
}

export interface HonchoBackendOptions {
  baseUrl: string;
  apiKey?: string;
  /** Honcho workspace per org: `${workspacePrefix}${orgId}`. */
  workspacePrefix?: string;
  fetchImpl?: typeof fetch;
}

export class HonchoBackend implements MemoryBackend {
  readonly name = "honcho" as const;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: HonchoBackendOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...(this.opts.apiKey ? { Authorization: `Bearer ${this.opts.apiKey}` } : {}),
    };
  }

  private workspace(orgId: string): string {
    return `${this.opts.workspacePrefix ?? "1pacent-"}${orgId}`;
  }

  async writeFacts(input: {
    orgId: string;
    contactId: string;
    conversationId: string;
    facts: MemoryFact[];
  }): Promise<{ written: number; refused: number }> {
    const safe = input.facts.filter((f) => !isGuardedFact(f));
    const refused = input.facts.length - safe.length;
    if (refused > 0) {
      console.warn(`[memory] refused ${refused} guarded fact(s) at the Honcho boundary (DB is truth)`);
    }
    if (safe.length === 0) return { written: 0, refused };

    const base = this.opts.baseUrl.replace(/\/$/, "");
    const workspace = this.workspace(input.orgId);
    const res = await this.fetchImpl(
      `${base}/v2/workspaces/${encodeURIComponent(workspace)}/sessions/${encodeURIComponent(input.conversationId)}/messages`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          messages: safe.map((f) => ({ peer_id: input.contactId, content: f.content })),
        }),
      },
    );
    if (!res.ok) throw new Error(`Honcho writeFacts failed (${res.status})`);
    return { written: safe.length, refused };
  }

  async recall(input: { orgId: string; contactId: string; query: string }): Promise<string | null> {
    const base = this.opts.baseUrl.replace(/\/$/, "");
    const workspace = this.workspace(input.orgId);
    const res = await this.fetchImpl(
      `${base}/v2/workspaces/${encodeURIComponent(workspace)}/peers/${encodeURIComponent(input.contactId)}/chat`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ query: input.query }),
      },
    );
    if (!res.ok) throw new Error(`Honcho recall failed (${res.status})`);
    const body = (await res.json()) as { content?: string | null };
    return typeof body.content === "string" && body.content.length > 0 ? body.content : null;
  }
}

/**
 * Tone injection (Developer Brief v8 §5): ask Honcho how to SPEAK with this
 * person — preferences, anxieties, communication style — never what's true
 * about their money, dates, assets or compliance. Output is clipped and any
 * recall failure degrades to null (Sally is politely generic, never wrong).
 */
export async function recallTone(
  backend: MemoryBackend,
  input: { orgId: string; contactId: string },
): Promise<string | null> {
  try {
    const tone = await backend.recall({
      orgId: input.orgId,
      contactId: input.contactId,
      query:
        "In two short sentences: how should an assistant speak with this person? " +
        "Tone, communication preferences, anxieties only — no facts, no amounts, no dates.",
    });
    if (!tone) return null;
    const clipped = tone.length > 400 ? `${tone.slice(0, 400)}…` : tone;
    // The boundary guard applies on the way out too: a tone hint that smells
    // like a ledger fact is dropped wholesale.
    return isGuardedFact({ content: clipped }) ? null : clipped;
  } catch (e) {
    console.warn("[memory] tone recall failed (degrading to generic):", e);
    return null;
  }
}

export interface ResolveMemoryEnv {
  HONCHO_BASE_URL?: string;
  HONCHO_API_KEY?: string;
}

/** Honcho when configured, else null (callers keep today's pgvector flow —
 * the degraded rung: Sally is politely generic, never wrong). */
export function resolveMemoryBackend(
  env: ResolveMemoryEnv,
  fetchImpl?: typeof fetch,
): MemoryBackend | null {
  if (!env.HONCHO_BASE_URL) return null;
  return new HonchoBackend({
    baseUrl: env.HONCHO_BASE_URL,
    apiKey: env.HONCHO_API_KEY,
    fetchImpl,
  });
}
