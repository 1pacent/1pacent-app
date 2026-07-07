import { NextResponse } from "next/server";
import { synthesizeSpeech } from "@/lib/elevenlabs";

export const dynamic = "force-dynamic";

const MAX_TTS_CHARS = 2000;

/** Route handler (not a server action) — a client <audio> element needs a
 * fetchable response with a binary/audio content type, not an RPC result. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const text = (body as { text?: unknown }).text;
  if (typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "Missing text." }, { status: 400 });
  }
  if (text.length > MAX_TTS_CHARS) {
    return NextResponse.json({ error: "Text too long." }, { status: 400 });
  }

  try {
    const audio = await synthesizeSpeech(text);
    return new NextResponse(audio, { headers: { "Content-Type": "audio/mpeg" } });
  } catch (e) {
    console.warn("[sally/tts] synthesis failed:", e);
    return NextResponse.json({ error: "Speech synthesis failed." }, { status: 502 });
  }
}
