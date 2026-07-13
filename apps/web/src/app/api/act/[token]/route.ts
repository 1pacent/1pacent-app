import { NextResponse, type NextRequest } from "next/server";
import { getData } from "@/lib/data";
import { poke, jobTopic, tradeTopic } from "@/lib/poke";

/**
 * One-tap signed moment actions (Developer Brief v8 §3). The token is a
 * single-use capability minted for one human's one decision — it burns on
 * use and the ledger records a human actor. POST comes from the service
 * worker's notification action; GET carries an SMS/e-mail fallback link.
 */

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  let choice = "approve";
  try {
    const body = (await request.json()) as { choice?: string };
    if (body.choice) choice = body.choice;
  } catch {
    /* default */
  }
  const result = await (await getData()).executeMomentAction(token, choice);
  if (result.ok && result.requestId) {
    await poke(jobTopic(result.requestId));
    await poke(tradeTopic());
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const choice = request.nextUrl.searchParams.get("choice");
  if (!choice) {
    return new NextResponse("Missing choice.", { status: 400 });
  }
  const result = await (await getData()).executeMomentAction(token, choice);
  if (result.ok && result.requestId) {
    await poke(jobTopic(result.requestId));
    await poke(tradeTopic());
  }
  const message = result.ok ? `${result.label ?? "Done"} ✓` : (result.error ?? "That didn't work.");
  return new NextResponse(
    `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
<body style="margin:0;display:grid;place-items:center;min-height:100dvh;background:#0B1A16;color:#fff;font-family:system-ui">
<div style="text-align:center;padding:24px">
  <p style="font-size:22px;font-weight:700">${escapeHtml(message)}</p>
  <p style="color:rgba(255,255,255,.5);font-size:14px">Recorded on the ledger${result.ok ? " with you as the actor" : ""}.</p>
</div></body>`,
    { status: result.ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
