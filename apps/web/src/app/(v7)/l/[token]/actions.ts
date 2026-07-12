"use server";

import { sendTradieLeadMessage, type SendTradieLeadMessageResult } from "@/lib/sallyTradie";

const MAX_MESSAGE_LENGTH = 2000;

export async function sendLeadMessage(
  token: string,
  message: string,
  conversationId?: string,
): Promise<SendTradieLeadMessageResult> {
  const trimmed = message.trim();
  if (!trimmed) return { ok: false, error: "Type a message first." };
  if (trimmed.length > MAX_MESSAGE_LENGTH) return { ok: false, error: "That message is too long." };
  return sendTradieLeadMessage(token, trimmed, conversationId);
}
