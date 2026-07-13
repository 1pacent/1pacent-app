"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { savePushSubscriptionAction } from "@/app/p/actions";

/**
 * Moments arrive on the lock screen (Product Strategy v8 §4.4). One tap
 * grants notifications, registers the service worker and stores the push
 * subscription against this token's person. Hidden when the server has no
 * VAPID keys (the degraded ladder: moments still render in-app) or once
 * this device is subscribed.
 */
export function EnablePush({ token, vapidPublicKey }: { token: string; vapidPublicKey: string | null }) {
  const pathname = usePathname();
  const [state, setState] = useState<"unknown" | "unsupported" | "ready" | "subscribed" | "denied">("unknown");

  useEffect(() => {
    if (!vapidPublicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    void navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? "subscribed" : "ready"))
      .catch(() => setState("unsupported"));
  }, [vapidPublicKey]);

  if (state !== "ready") return null;

  async function subscribe() {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey!),
      });
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
      await savePushSubscriptionAction(token, {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        homePath: pathname,
      });
      setState("subscribed");
    } catch {
      setState("unsupported");
    }
  }

  return (
    <button
      type="button"
      onClick={subscribe}
      className="flex w-full items-center justify-between rounded-2xl border border-hivis-400/40 bg-field-900 px-4 py-3 text-left active:scale-[0.98]"
    >
      <span>
        <span className="block text-sm font-semibold text-white">Decisions on your lock screen</span>
        <span className="block text-xs text-white/40">One tap to approve, verify, release — without opening the app.</span>
      </span>
      <span className="rounded-xl bg-hivis-400 px-3 py-1.5 text-xs font-bold text-field-950">Turn on</span>
    </button>
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
