import { describe, expect, it } from "vitest";
import { handymanCanCover, tradesForCategory, tradieMatchesJob } from "./trade-match";
import { PLAYBOOKS } from "../playbooks";

const hws = PLAYBOOKS.hws_replace; // quote_race + gas certificate
const tap = PLAYBOOKS.tap_leak; // fixed_band, no certificate
const gasCheck = PLAYBOOKS.gas_check; // fixed_band BUT files a certificate

describe("tradesForCategory", () => {
  it("maps specialist categories to their trades", () => {
    expect(tradesForCategory("failure_of_essential_service_hot_water")).toEqual(["plumbing"]);
    expect(tradesForCategory("dangerous_electrical_fault")).toEqual(["electrical"]);
    expect(tradesForCategory("pest_control")).toEqual(["pest_control"]);
  });
});

describe("tradieMatchesJob — specialists", () => {
  it("a plumber never hears about an electrical job, and vice versa", () => {
    expect(tradieMatchesJob("plumbing", "electrical_general", tap)).toBe(false);
    expect(tradieMatchesJob("electrical", "plumbing_general", tap)).toBe(false);
  });

  it("the matching specialist always qualifies, small job or big", () => {
    expect(tradieMatchesJob("plumbing", "failure_of_essential_service_hot_water", hws)).toBe(true);
    expect(tradieMatchesJob("electrical", "electrical_general", tap)).toBe(true);
  });
});

describe("tradieMatchesJob — the handyman rule", () => {
  it("handymen can take small fixed-band jobs of any trade", () => {
    expect(tradieMatchesJob("general_maintenance", "plumbing_general", tap)).toBe(true);
    expect(tradieMatchesJob("general_maintenance", "electrical_general", tap)).toBe(true);
  });

  it("handymen are excluded from quote races (big scope needs the specialist)", () => {
    expect(tradieMatchesJob("general_maintenance", "failure_of_essential_service_hot_water", hws)).toBe(false);
  });

  it("handymen are excluded from certificate work even when fixed-band", () => {
    expect(handymanCanCover(gasCheck)).toBe(false);
    expect(tradieMatchesJob("general_maintenance", "plumbing_general", gasCheck)).toBe(false);
  });

  it("handymen are first-class for generalist categories regardless of playbook", () => {
    expect(tradieMatchesJob("general_maintenance", "garden_external", hws)).toBe(true);
    expect(tradieMatchesJob("general_maintenance", "other", hws)).toBe(true);
  });
});

describe("tradieMatchesJob — unknown trade type", () => {
  it("blank/unknown trades are treated as handymen, never as specialists", () => {
    expect(tradieMatchesJob(null, "plumbing_general", tap)).toBe(true);
    expect(tradieMatchesJob("", "failure_of_essential_service_hot_water", hws)).toBe(false);
    expect(tradieMatchesJob("scaffolding", "plumbing_general", tap)).toBe(false);
  });
});
