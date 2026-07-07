"use server";

import { getData } from "@/lib/data";

export async function decide(token: string, decision: "approve" | "decline") {
  const data = await getData();
  return data.decideApprovalByToken(token, decision);
}
