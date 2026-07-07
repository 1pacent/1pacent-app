import "server-only";

/** ElevenLabs is TTS-out only (no mic/STT input) — called directly here,
 * not through n8n, because it's latency-sensitive and synchronous to the
 * chat UX rather than a fire-and-forget side effect. Key stays server-side. */
export async function synthesizeSpeech(text: string): Promise<ArrayBuffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) {
    throw new Error("ELEVENLABS_API_KEY/ELEVENLABS_VOICE_ID not configured");
  }
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({ text, model_id: "eleven_turbo_v2_5" }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${body}`);
  }
  return res.arrayBuffer();
}
