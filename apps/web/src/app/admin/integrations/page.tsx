import { getIntegrationsOverview } from "@/lib/integrations/admin-data";
import { IntegrationsConsole } from "./integrations-console";

export const dynamic = "force-dynamic";

/** PM platform integrations console (v9 R9.2). Behind the admin gate. */
export default async function AdminIntegrationsPage() {
  const { ready, connectors, connections } = await getIntegrationsOverview();
  return (
    <div className="min-h-dvh bg-field-950 text-white" style={{ colorScheme: "dark" }}>
      <div className="mx-auto w-full max-w-3xl px-5 pb-16">
        <header className="flex items-center justify-between py-5">
          <div>
            <p className="text-lg font-extrabold">
              <span className="text-hivis-400">■</span> PM platform integrations
            </p>
            <p className="text-[10px] uppercase tracking-widest text-white/30">
              Read-only import by default · write-back OFF · no DOB / ID / financial data
            </p>
          </div>
          <a href="/admin" className="text-xs font-semibold text-white/40 hover:text-white">← Console</a>
        </header>
        <IntegrationsConsole ready={ready} connectors={connectors} connections={connections} />
      </div>
    </div>
  );
}
