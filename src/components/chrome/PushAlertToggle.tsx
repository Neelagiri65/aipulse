"use client";

import { useCallback, useEffect, useState } from "react";
import { parseStack, STACK_CHANGE_EVENT, STACK_STORAGE_KEY, type ToolId } from "@/lib/stack";
import { useStack } from "@/lib/hooks/use-stack";

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

/**
 * Register (or re-register) a subscription with the visitor's stack. The
 * server replaces the whole record, so `tools: null` clears an earlier
 * scope — "Show all" on the Health panel widens alerts back to every tool.
 */
export async function registerSubscription(sub: PushSubscription, stack: readonly ToolId[] | null): Promise<boolean> {
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...sub.toJSON(), tools: stack ?? [] }),
  });
  return res.ok;
}

export function PushAlertToggle() {
  const [state, setState] = useState<PushState>("idle");
  const { stack } = useStack();

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

  // While alerts are on, a stack change re-registers the subscription with
  // the new tools. Driven by the write event, NOT by the stack value: the
  // value goes null → stored on every load (server snapshot is null), and
  // that must not cost a write per pageview.
  useEffect(() => {
    if (state !== "subscribed" || typeof window === "undefined") return;
    const onChange = () => {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => {
          if (!sub) return;
          let raw: string | null = null;
          try {
            raw = window.localStorage.getItem(STACK_STORAGE_KEY);
          } catch {
            raw = null;
          }
          return registerSubscription(sub, parseStack(raw));
        })
        .catch(() => {
          // re-registration failed silently; the next change retries
        });
    };
    window.addEventListener(STACK_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(STACK_CHANGE_EVENT, onChange);
  }, [state]);

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

      if (await registerSubscription(sub, stack)) {
        setState("subscribed");
      }
    } catch {
      // subscription failed silently
    }
  }, [stack]);

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

  // Every state carries data-testid/data-state/data-scope so a browser that
  // cannot grant push (headless Chromium reports "denied") can still show
  // that the stored stack reached the toggle.
  const scopeAttr = stack ? stack.length : 0;

  if (state === "unsupported") {
    return (
      <a
        href="/subscribe"
        className="flex items-center gap-1 rounded-sm border border-border/60 px-2 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        title="Push alerts not supported in this browser — subscribe to the daily digest instead"
        data-testid="push-toggle"
        data-state="unsupported"
        data-scope={scopeAttr}
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
        data-testid="push-toggle"
        data-state="denied"
        data-scope={scopeAttr}
      >
        <BellIcon active={false} />
        <span className="hidden sm:inline">Alerts blocked</span>
      </span>
    );
  }

  if (state === "subscribed") {
    const scope = stack ? `your stack (${stack.length})` : "all tools";
    return (
      <button
        type="button"
        onClick={unsubscribe}
        className="ap-btn-ghost flex items-center gap-1 font-mono text-[10px]"
        title={
          stack
            ? `Push alerts on for your stack — ${stack.length} tool${stack.length === 1 ? "" : "s"}, chosen on the Health panel. Click to disable.`
            : "Push alerts on for every tool — pick a stack on the Health panel to narrow them. Click to disable."
        }
        data-testid="push-toggle"
        data-state="subscribed"
        data-scope={scopeAttr}
      >
        <BellIcon active />
        <span>Alerts on · {scope}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={subscribe}
      className="ap-btn-ghost flex items-center gap-1.5 font-mono text-[10px]"
      title={
        stack
          ? `Enable push notifications for outages of your stack (${stack.length} tool${stack.length === 1 ? "" : "s"})`
          : "Enable push notifications for AI tool outages"
      }
      data-testid="push-toggle"
      data-state="idle"
      data-scope={scopeAttr}
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
      className={active ? "ap-bell--on" : undefined}
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
