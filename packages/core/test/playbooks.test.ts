import { describe, expect, it } from "vitest";
import {
  arcStepFor,
  checkPlaybookGate,
  getPlaybook,
  playbookForCategory,
  PLAYBOOKS,
  unsatisfiedGates,
  varianceNeedsApproval,
} from "../src/playbooks/index.js";

describe("playbook selection", () => {
  it("maps categories to their playbook", () => {
    expect(playbookForCategory("plumbing_general").key).toBe("tap_leak");
    expect(playbookForCategory("failure_of_essential_service_hot_water").key).toBe("hws_replace");
    expect(playbookForCategory("dangerous_electrical_fault").key).toBe("electrical_fault");
  });
  it("falls back to the quote race for unknown scopes", () => {
    expect(playbookForCategory("pest_control").key).toBe("general_quote_race");
  });
  it("resolves keys and rejects unknowns", () => {
    expect(getPlaybook("gas_check")?.compliance?.filesCertificate).toBe("vic_gas_safety_check");
    expect(getPlaybook("nope")).toBeNull();
  });
});

describe("evidence gates — core rule, not UI hope", () => {
  const pb = PLAYBOOKS.tap_leak; // gates: before, after
  it("blocks completion while gates are unsatisfied", () => {
    const check = checkPlaybookGate(pb, "submit_evidence", [{ gate: "before", at: new Date() }]);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.missing).toEqual(["after"]);
  });
  it("passes once every gate has evidence", () => {
    const check = checkPlaybookGate(pb, "submit_evidence", [
      { gate: "before", at: new Date() },
      { gate: "after", at: new Date() },
    ]);
    expect(check.ok).toBe(true);
  });
  it("extra evidence never satisfies a named gate", () => {
    expect(unsatisfiedGates(pb, [{ gate: "extra", at: new Date() }])).toEqual(["before", "after"]);
  });
  it("compliance playbooks demand the certificate", () => {
    const gas = PLAYBOOKS.gas_check;
    const missing = unsatisfiedGates(gas, [{ gate: "arrival_photo", at: new Date() }]);
    expect(missing).toEqual(["certificate"]);
  });
});

describe("variance protocol", () => {
  it("small on-site changes proceed; big ones need the payer", () => {
    const pb = PLAYBOOKS.tap_leak; // 25%
    expect(varianceNeedsApproval(pb, 20_000, 24_000)).toBe(false); // +20%
    expect(varianceNeedsApproval(pb, 20_000, 26_000)).toBe(true); // +30%
  });
});

describe("the job arc", () => {
  it("projects ledger state + flags to the shared arc", () => {
    expect(arcStepFor("scheduled", { onTheWay: false, captured: false })).toBe("confirmed");
    expect(arcStepFor("scheduled", { onTheWay: true, captured: false })).toBe("on_the_way");
    expect(arcStepFor("in_progress", { onTheWay: true, captured: false })).toBe("on_site");
    expect(arcStepFor("evidence_pending", { onTheWay: false, captured: false })).toBe("done");
    expect(arcStepFor("verified", { onTheWay: false, captured: false })).toBe("verified");
    expect(arcStepFor("closed", { onTheWay: false, captured: true })).toBe("paid");
  });
});
