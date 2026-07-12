import "server-only";
import type { SallyToolCall, SallyToolExecutor, SallyToolResult } from "@1pacent/agents";
import type { DataSource } from "./data-types";

/**
 * Binds Sally's tool names to DataSource calls with the session token baked
 * in (Developer Brief v6 §2.1). The model cannot name a property or
 * portfolio it wasn't given: every method here is already scoped by the
 * token in the data layer — the security boundary is the query, not the
 * prompt. Every tool is read-only except generate_report, which writes a
 * report row and nothing else.
 */
export function createSallyToolExecutor(data: DataSource, token: string): SallyToolExecutor {
  return async (call: SallyToolCall): Promise<SallyToolResult> => {
    const result = await executeTool(data, token, call);
    return { name: call.name, result };
  };
}

async function executeTool(data: DataSource, token: string, call: SallyToolCall): Promise<unknown> {
  const args = call.arguments;
  switch (call.name) {
    case "get_my_requests": {
      const requests = await data.getRequestStatusForContact(token);
      // Compact for the model: the canvas carries the full detail.
      return requests.map((r) => ({
        title: r.title,
        category: r.category,
        state: r.state,
        isWarrantyClaim: r.isWarrantyClaim,
        lastUpdate: r.events[r.events.length - 1]?.at ?? null,
      }));
    }
    case "get_property_compliance":
      return data.getComplianceStatus(token);
    case "get_spending_summary": {
      const period = typeof args.period_months === "number" && args.period_months > 0 ? args.period_months : 12;
      return data.getSpendingSummary(token, Math.min(60, Math.floor(period)));
    }
    case "get_asset_horizon":
      return data.getAssetHorizon(token);
    case "get_obligations_calendar": {
      const horizon = typeof args.horizon_days === "number" && args.horizon_days > 0 ? args.horizon_days : 120;
      return data.getObligationsCalendar(token, Math.min(366, Math.floor(horizon)));
    }
    case "generate_report": {
      const kind = args.kind;
      if (kind !== "property_data_pack" && kind !== "spending_summary" && kind !== "obligations_calendar") {
        return { error: `Unknown report kind "${String(kind)}"` };
      }
      const subjectId = typeof args.property_id === "string" ? args.property_id : undefined;
      const outcome = await data.generateReport(token, kind, subjectId);
      return outcome.ok
        ? { ok: true, reportId: outcome.reportId, note: "The report card is on the board — open it there." }
        : { ok: false, error: outcome.error };
    }
    case "get_my_jobs":
      return data.listTradieJobs(token);
    case "get_my_accuracy":
      return data.getTradieAccuracy(token);
    default:
      return { error: `unknown tool "${call.name}"` };
  }
}
