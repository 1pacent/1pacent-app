"use server";

import { revalidatePath } from "next/cache";
import {
  connectIntegration,
  syncIntegration,
  setWriteBack,
  disconnectIntegration,
  deleteIntegration,
} from "@/lib/integrations/service";
import type { PmProvider } from "@/lib/integrations/types";

export async function connectAction(input: { provider: PmProvider; pmContactId: string; orgId: string; accessToken: string }) {
  const r = await connectIntegration({
    provider: input.provider,
    pmContactId: input.pmContactId.trim(),
    orgId: input.orgId.trim(),
    credentials: { accessToken: input.accessToken.trim() },
  });
  revalidatePath("/admin/integrations");
  return r;
}

export async function syncAction(id: string) {
  const r = await syncIntegration(id);
  revalidatePath("/admin/integrations");
  return r;
}

export async function writeBackAction(id: string, enabled: boolean) {
  const r = await setWriteBack(id, enabled);
  revalidatePath("/admin/integrations");
  return r;
}

export async function disconnectAction(id: string) {
  const r = await disconnectIntegration(id);
  revalidatePath("/admin/integrations");
  return r;
}

export async function deleteAction(id: string) {
  const r = await deleteIntegration(id);
  revalidatePath("/admin/integrations");
  return r;
}
