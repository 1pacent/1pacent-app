"use client";

import { useLive } from "./use-live";

/** Drop-in server-page refresher: re-renders the page when the topic pokes. */
export function LiveRefresh({ topic }: { topic: string }) {
  useLive(topic);
  return null;
}
