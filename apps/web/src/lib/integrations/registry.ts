import type { PmConnector, PmProvider } from "./types";
import { propertymeConnector } from "./connectors/propertyme";

/**
 * Provider registry (v9 R9.2). PropertyMe is the reference connector; the
 * others are registered stubs (documented endpoints, `live: false`) awaiting
 * partner credentials. Each becomes real by implementing `listProperties`
 * against its API — the sync/PII/encryption/cap-check machinery is shared.
 */

function stub(provider: PmProvider, displayName: string): PmConnector {
  return {
    provider,
    displayName,
    live: false,
    async listProperties() {
      return []; // awaiting partner API wiring; see docs/PM_INTEGRATIONS_v1.md
    },
  };
}

const CONNECTORS: Record<PmProvider, PmConnector> = {
  propertyme: propertymeConnector,
  property_tree: stub("property_tree", "Property Tree (MRI)"),
  console: stub("console", "Console Cloud"),
  reapit: stub("reapit", "Reapit"),
  ailo: stub("ailo", "Ailo"),
  other: stub("other", "Other"),
};

export function getConnector(provider: PmProvider): PmConnector {
  return CONNECTORS[provider] ?? CONNECTORS.other;
}

export function listConnectors(): Array<{ provider: PmProvider; displayName: string; live: boolean }> {
  return Object.values(CONNECTORS).map((c) => ({ provider: c.provider, displayName: c.displayName, live: c.live }));
}
