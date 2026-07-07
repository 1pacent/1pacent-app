"use server";

import { REQUEST_CATEGORIES, type RequestCategory } from "@1pacent/core";
import { resolveDemoToken, submitIntake } from "@/lib/store";

export interface IntakeResult {
  ok: boolean;
  error?: string;
  requestId?: string;
  urgent?: boolean;
  state?: string;
}

export async function lodgeRequest(token: string, formData: FormData): Promise<IntakeResult> {
  const resolved = resolveDemoToken(token);
  if (!resolved || resolved.scope !== "tenant_intake") {
    return { ok: false, error: "This link is invalid or has expired. Ask your rental provider for a new one." };
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "other") as RequestCategory;

  if (title.length < 3) return { ok: false, error: "Please describe the issue briefly in the title." };
  if (!REQUEST_CATEGORIES.includes(category)) return { ok: false, error: "Please pick a category." };

  const result = submitIntake({ propertyId: resolved.aggregateId, title, description, category });
  return { ok: true, ...result };
}
