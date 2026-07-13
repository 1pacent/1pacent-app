import "server-only";
import webpush from "web-push";
import { getData } from "./data";
import type { MomentActionKind, MomentRole } from "./data-types";

/**
 * Moments over Web Push (Developer Brief v8 §3): decisions come to the lock
 * screen. Fire-and-forget delivery — the ledger is truth and the app renders
 * the same moment from DB state, so a lost push loses nothing but latency.
 * No VAPID keys configured → no-op (the degraded ladder: screens still show
 * every moment on refresh).
 */

export interface MomentPush {
  title: string;
  body: string;
  /** Path relative to the recipient's home (their token page), e.g. a job. */
  path?: string;
  /** One-tap decision: minted per recipient, burns on use. */
  oneTap?: {
    kind: MomentActionKind;
    choices: Array<{ choice: string; label: string }>;
    actorType?: "tenant" | "agency_user";
    meta?: Record<string, unknown>;
  };
  tag?: string;
}

function vapidConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let vapidReady = false;
function ensureVapid(): boolean {
  if (!vapidConfigured()) return false;
  if (!vapidReady) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? "mailto:mac@1pacent.com",
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    vapidReady = true;
  }
  return true;
}

/** Send a moment about `requestId` to everyone holding `role`. Never throws. */
export async function pushMoment(requestId: string, role: MomentRole, moment: MomentPush): Promise<void> {
  try {
    if (!ensureVapid()) return;
    const data = await getData();
    const targets = await data.getPushTargets(requestId, role);
    await Promise.all(
      targets.map(async (target) => {
        let actions: Array<{ action: string; title: string }> = [];
        let actUrl: string | null = null;
        if (moment.oneTap) {
          const minted = await data.mintMomentAction(requestId, {
            kind: moment.oneTap.kind,
            contactId: target.contactId,
            meta: {
              ...(moment.oneTap.meta ?? {}),
              ...(moment.oneTap.actorType ? { actorType: moment.oneTap.actorType } : {}),
            },
          });
          if (minted.ok && minted.path) {
            actUrl = minted.path;
            actions = moment.oneTap.choices.map((c) => ({ action: c.choice, title: c.label }));
          }
        }
        const url = moment.path && target.homePath ? joinHome(target.homePath, moment.path) : (target.homePath ?? "/p");
        const payload = JSON.stringify({
          title: moment.title,
          body: moment.body,
          url,
          actUrl,
          actions,
          tag: moment.tag ?? `req-${requestId}`,
        });
        try {
          await webpush.sendNotification(
            { endpoint: target.endpoint, keys: target.keys },
            payload,
            { TTL: 3600 },
          );
        } catch (e) {
          console.warn(`[push] delivery to ${target.name || target.contactId} failed:`, e);
        }
      }),
    );
  } catch (e) {
    console.warn("[push] moment fan-out failed:", e);
  }
}

/** `/p/own/{token}` + `job/{requestId}` → `/p/job/{token}/{requestId}` style
 * deep links: pulse routes address jobs as /p/job/{token}/{id}, so rebuild
 * from the home path's token. */
function joinHome(homePath: string, subPath: string): string {
  const m = /^\/p\/(?:own|trade|deck|fix|record)\/([^/?]+)/.exec(homePath);
  if (m && subPath.startsWith("job/")) return `/p/job/${m[1]}/${subPath.slice(4)}`;
  return homePath;
}

export function pushConfigured(): boolean {
  return vapidConfigured();
}
