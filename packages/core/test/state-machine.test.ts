import { describe, expect, it } from "vitest";
import {
  availableEvents,
  isTerminal,
  projectState,
  REQUEST_EVENTS,
  REQUEST_STATES,
  TRANSITIONS,
  transition,
  type ActorType,
  type RequestEvent,
  type RequestState,
} from "../src/requests/state-machine.js";

describe("transition table shape", () => {
  it("every declared transition targets a known state", () => {
    for (const [from, rules] of Object.entries(TRANSITIONS)) {
      expect(REQUEST_STATES).toContain(from as RequestState);
      for (const rule of Object.values(rules!)) {
        expect(REQUEST_STATES).toContain(rule.to);
        expect(rule.allowedActors.length).toBeGreaterThan(0);
      }
    }
  });

  it("terminal states have no outgoing transitions", () => {
    expect(TRANSITIONS.closed).toBeUndefined();
    expect(TRANSITIONS.cancelled).toBeUndefined();
    expect(isTerminal("closed")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("reported")).toBe(false);
  });

  it("every non-terminal state has at least one outgoing transition (no dead ends)", () => {
    for (const state of REQUEST_STATES) {
      if (isTerminal(state)) continue;
      expect(availableEvents(state).length, `state "${state}" is a dead end`).toBeGreaterThan(0);
    }
  });
});

describe("exhaustive transition validation", () => {
  it("rejects every (state, event) pair not in the table", () => {
    for (const state of REQUEST_STATES) {
      for (const event of REQUEST_EVENTS) {
        const declared = TRANSITIONS[state]?.[event];
        const result = transition(state, event, "system");
        if (!declared) {
          expect(result.ok, `${state} + ${event} should be invalid`).toBe(false);
        }
      }
    }
  });
});

describe("golden path", () => {
  it("walks reported → closed via the full lifecycle", () => {
    const steps: Array<{ eventType: RequestEvent; actorType: ActorType }> = [
      { eventType: "triage", actorType: "agency_user" },
      { eventType: "request_approval", actorType: "agency_user" },
      { eventType: "approve", actorType: "landlord" },
      { eventType: "request_quotes", actorType: "agency_user" },
      { eventType: "accept_quote", actorType: "landlord" },
      { eventType: "start_work", actorType: "tradie" },
      { eventType: "submit_evidence", actorType: "tradie" },
      { eventType: "verify", actorType: "tenant" },
      { eventType: "invoice", actorType: "tradie" },
      { eventType: "record_payment", actorType: "system" },
      { eventType: "close", actorType: "system" },
    ];
    expect(projectState(steps)).toBe("closed");
  });

  it("urgent path: auto-approve then schedule directly, skipping quoting", () => {
    const state = projectState([
      { eventType: "triage", actorType: "system" },
      { eventType: "auto_approve", actorType: "system" },
      { eventType: "schedule", actorType: "tradie" },
    ]);
    expect(state).toBe("scheduled");
  });

  it("decline path reaches closed", () => {
    const state = projectState([
      { eventType: "triage", actorType: "agency_user" },
      { eventType: "request_approval", actorType: "agency_user" },
      { eventType: "decline", actorType: "landlord" },
      { eventType: "close", actorType: "system" },
    ]);
    expect(state).toBe("closed");
  });

  it("evidence rejection loops back to in_progress", () => {
    const state = projectState([
      { eventType: "triage", actorType: "system" },
      { eventType: "auto_approve", actorType: "system" },
      { eventType: "schedule", actorType: "agency_user" },
      { eventType: "start_work", actorType: "tradie" },
      { eventType: "submit_evidence", actorType: "tradie" },
      { eventType: "reject_evidence", actorType: "tenant" },
    ]);
    expect(state).toBe("in_progress");
  });
});

describe("actor guards (B2 remediation)", () => {
  it("a tenant cannot approve spend", () => {
    const result = transition("pending_approval", "approve", "tenant");
    expect(result).toMatchObject({ ok: false, error: "actor_not_allowed" });
  });

  it("a tradie cannot approve spend", () => {
    const result = transition("pending_approval", "approve", "tradie");
    expect(result).toMatchObject({ ok: false, error: "actor_not_allowed" });
  });

  it("only the system may auto-approve — never a client-supplied actor", () => {
    for (const actor of ["tenant", "landlord", "agency_user", "tradie"] as const) {
      expect(transition("triaged", "auto_approve", actor).ok).toBe(false);
    }
    expect(transition("triaged", "auto_approve", "system").ok).toBe(true);
  });

  it("a landlord approves from pending_approval", () => {
    const result = transition("pending_approval", "approve", "landlord");
    expect(result).toEqual({ ok: true, state: "approved" });
  });

  it("availableEvents filters by actor", () => {
    expect(availableEvents("pending_approval", "landlord")).toEqual(
      expect.arrayContaining(["approve", "decline"]),
    );
    expect(availableEvents("pending_approval", "tenant")).toEqual([]);
  });
});

describe("event stream projection", () => {
  it("throws on a corrupt stream rather than guessing", () => {
    expect(() =>
      projectState([
        { eventType: "approve", actorType: "landlord" }, // invalid from "reported"
      ]),
    ).toThrow(/Corrupt event stream/);
  });

  it("empty stream projects to reported", () => {
    expect(projectState([])).toBe("reported");
  });
});
