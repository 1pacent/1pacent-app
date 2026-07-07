"use server";

import { decideByToken } from "@/lib/store";

export async function decide(token: string, decision: "approve" | "decline") {
  return decideByToken(token, decision);
}
