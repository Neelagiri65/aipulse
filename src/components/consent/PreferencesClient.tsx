"use client";

/**
 * PreferencesClient — the interactive half of /privacy/preferences.
 *
 * Loads the current consent state from GET /api/consent, lets the user
 * toggle analytics / marketing, and POSTs back on save. Also exposes a
 * "Delete my record" button that hits POST /api/consent/delete and
 * wipes the aip_consent cookie.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { normaliseCategories } from "@/lib/consent-client";
import type { ConsentCategories, ConsentAction } from "@/lib/data/consent";

type ConsentResponse = {
  ok: boolean;
  visitorId: string;
  categories: ConsentCategories;
  gpc: boolean;
  covered: boolean;
};

type Status = "idle" | "loading" | "saving" | "saved" | "deleted" | "error";

export function PreferencesClient() {
  const [state, setState] = useState<ConsentResponse | null>(null);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/consent", { credentials: "include" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const body = (await r.json()) as ConsentResponse;
        if (cancelled) return;
        setState(body);
        setAnalytics(Boolean(body.categories.analytics));
        setMarketing(Boolean(body.categories.marketing));
        setStatus("idle");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(
    async (action: ConsentAction) => {
      setStatus("saving");
      setError(null);
      try {
        const r = await fetch("/api/consent", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ analytics, marketing, action }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const body = (await r.json()) as ConsentResponse & { coerced?: boolean };
        setState(body);
        setAnalytics(Boolean(body.categories.analytics));
        setMarketing(Boolean(body.categories.marketing));
        setStatus("saved");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      }
    },
    [analytics, marketing],
  );

  const deleteAll = useCallback(async () => {
    setStatus("saving");
    setError(null);
    try {
      const r = await fetch("/api/consent/delete", {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setState((prev) =>
        prev
          ? { ...prev, categories: normaliseCategories(null) }
          : prev,
      );
      setAnalytics(false);
      setMarketing(false);
      setStatus("deleted");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, []);

  if (status === "loading") {
    return (
      <div
        className="space-y-3"
        role="status"
        aria-label="Loading consent preferences"
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 animate-pulse"
            aria-hidden
          >
            <div className="h-4 w-40 rounded bg-muted/60" />
            <div className="h-6 w-12 rounded-full bg-muted/40" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="consent-preferences">
      {state?.gpc && (
        <p
          className="rounded-md border border-border bg-muted/40 p-3 text-xs"
          data-testid="gpc-notice"
        >
          Your browser is sending <code className="font-mono">Sec-GPC: 1</code>.
          We are honouring that signal — analytics and marketing are off
          regardless of the toggles below.
        </p>
      )}

      <fieldset disabled={state?.gpc} className="space-y-3">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={true}
            disabled
            className="mt-0.5"
            aria-describedby="necessary-desc"
          />
          <span>
            <span className="font-medium">Necessary</span>
            <span id="necessary-desc" className="block text-muted-foreground text-xs">
              Session + CSRF cookies. Always on — the site doesn&apos;t
              load without them.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={analytics}
            onChange={(e) => setAnalytics(e.target.checked)}
            className="mt-0.5"
            data-testid="toggle-analytics"
          />
          <span>
            <span className="font-medium">Analytics</span>
            <span className="block text-muted-foreground text-xs">
              Counts which panels people open. No cross-site tracking.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={marketing}
            onChange={(e) => setMarketing(e.target.checked)}
            className="mt-0.5"
            data-testid="toggle-marketing"
          />
          <span>
            <span className="font-medium">Marketing</span>
            <span className="block text-muted-foreground text-xs">
              Reserved for future use (product updates). Currently unused —
              leaving this off is safe.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="default"
          size="sm"
          onClick={() => save("update")}
          disabled={state?.gpc || status === "saving"}
          data-testid="save-preferences"
        >
          Save
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={deleteAll}
          disabled={status === "saving"}
          data-testid="delete-record"
        >
          Delete my record
        </Button>
      </div>

      {status === "saved" && (
        <p className="text-xs text-emerald-400" data-testid="save-ok">
          Saved.
        </p>
      )}
      {status === "deleted" && (
        <p className="text-xs text-emerald-400" data-testid="delete-ok">
          Deleted. Your consent record has been wiped.
        </p>
      )}
      {status === "error" && error && (
        <p className="text-xs text-rose-400" data-testid="save-error">
          Error: {error}
        </p>
      )}
    </div>
  );
}
