"use server";

import { getData } from "@/lib/data";
import { sendSallyMessage, type SendSallyMessageResult } from "@/lib/sally";

const MAX_MESSAGE_LENGTH = 2000;

export async function sendMessage(token: string, message: string): Promise<SendSallyMessageResult> {
  const trimmed = message.trim();
  if (!trimmed) return { ok: false, error: "Type a message first." };
  if (trimmed.length > MAX_MESSAGE_LENGTH) return { ok: false, error: "That message is too long." };
  return sendSallyMessage(token, trimmed);
}

export async function confirmFixedAction(token: string, requestId: string) {
  return (await getData()).confirmFixed(token, requestId);
}
