"use client";

import { useCallback, useEffect, useState } from "react";

const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ??
  "BCluA8qIlO8oqgU9Bs7u7DowU63dUH-KThu7HhCuc59aXuyi7D-fJjjJvYVoy_Hlo_l6936I_zggUuVbjmPMwJs";

type PushState = "idle" | "subscribed" | "denied" | "unsupported";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function PushAlertToggle() {
  const [state, setState] = useState<PushState>("idle");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    // "denied" = user explicitly blocked. "default" = never asked (show button).
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    if (Notification.permission === "granted") {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          if (sub) setState("subscribed");
        });
      });
    }
    // permission === "default" → stay in "idle" state → show "Enable alerts"
  }, []);

  const subscribe = useCallback(async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });

      if (res.ok) {
        setState("subscribed");
      }
    } catch {
      // subscription failed silently
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("idle");
    } catch {
      // unsubscribe failed silently
    }
  }, []);

  if (state === "unsupported") {
    return (
      <a
        href="/subscribe"
        className="flex items-center gap-1 rounded-sm border border-border/60 px-2 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        title="Push alerts not supported in this browser — subscribe to the daily digest instead"
      >
        <BellIcon active={false} />
        <span>Subscribe</span>
      </a>
    );
  }

  if (state === "denied") {
    return (
      <span
        className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground"
        title="Notifications blocked — reset in browser settings for this site"
      >
        <BellIcon active={false} />
        <span className="hidden sm:inline">Alerts blocked</span>
      </span>
    );
  }

  if (state === "subscribed") {
    return (
      <button
        type="button"
        onClick={unsubscribe}
        className="flex items-center gap-1 rounded-sm border border-teal-500/40 px-2 py-1 font-mono text-[10px] text-teal-300 transition-colors hover:border-teal-400 hover:text-teal-200"
        title="Push alerts active — click to disable"
      >
        <BellIcon active />
        <span>Alerts on</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={subscribe}
      className="flex items-center gap-1.5 rounded border border-teal-500/50 px-2.5 py-1 font-mono text-[10px] text-teal-300 shadow-[0_0_10px_-3px_rgba(45,212,191,0.3)] transition-colors hover:border-teal-400 hover:text-teal-200 hover:shadow-[0_0_14px_-3px_rgba(45,212,191,0.5)]"
      title="Enable push notifications for AI tool outages"
    >
      <BellIcon active={false} />
      <span>Enable alerts</span>
    </button>
  );
}

function BellIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={active ? "text-teal-400" : ""}
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
