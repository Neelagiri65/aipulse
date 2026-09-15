"use client";

import { useState } from "react";
import { TOOLS } from "@/components/health/tools";
import { toggleTool, type ToolId } from "@/lib/stack";
import { shareUrlFor } from "@/lib/stack-url";

const NAME: Record<string, string> = Object.fromEntries(TOOLS.map((t) => [t.id, t.name]));

/**
 * Inline chip row inside the Health panel. One button per tracked tool,
 * pressed = in the visitor's stack. Never an overlay. "Show all" clears.
 *
 * `shared` is a stack proposed by the URL (`/?stack=…`) that differs from
 * the stored one. It renders as one inline line with "Use it" / "Keep
 * mine"; nothing is written until the visitor clicks. "Copy link" produces
 * the share URL for the current stack; `data-share-url` carries it so it
 * can be checked without the clipboard.
 */
export function StackPicker({
  stack,
  onChange,
  shared = null,
  onUseShared,
  onDismissShared,
  origin,
}: {
  stack: ToolId[] | null;
  onChange: (next: ToolId[] | null) => void;
  shared?: ToolId[] | null;
  onUseShared?: () => void;
  onDismissShared?: () => void;
  /** Where the share link points; undefined on the server (no link rendered). */
  origin?: string;
}) {
  const set = new Set<ToolId>(stack ?? []);
  const [copied, setCopied] = useState<"idle" | "copied" | "manual">("idle");
  const shareUrl = stack && stack.length > 0 && origin ? shareUrlFor(stack, origin) : null;

  const copy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied("copied");
    } catch {
      setCopied("manual"); // no clipboard permission: show the link as selectable text
    }
  };

  return (
    <div className="ap-stack" role="group" aria-label="Your stack" data-testid="stack-picker">
      <span className="ap-stack__label">Your stack</span>
      {TOOLS.map((t) => {
        const on = set.has(t.id);
        return (
          <button
            key={t.id}
            type="button"
            className="ap-stack__chip"
            aria-pressed={on}
            data-testid={`stack-chip-${t.id}`}
            onClick={() => onChange(toggleTool(stack, t.id))}
          >
            {t.name}
          </button>
        );
      })}
      {stack && stack.length > 0 ? (
        <>
          {shareUrl ? (
            <button
              type="button"
              className="ap-stack__share"
              data-testid="stack-share"
              data-share-url={shareUrl}
              title="Copy a link that proposes this stack to whoever opens it"
              onClick={copy}
            >
              {copied === "copied" ? "Copied" : "Copy link"}
            </button>
          ) : null}
          <button type="button" className="ap-stack__clear" data-testid="stack-clear" onClick={() => onChange(null)}>
            Show all
          </button>
        </>
      ) : (
        <span className="ap-stack__hint">pick the tools you use</span>
      )}
      {copied === "manual" && shareUrl ? (
        <span className="ap-stack__shared" data-testid="stack-share-manual">
          Copy this link: <code>{shareUrl}</code>
        </span>
      ) : null}
      {shared && shared.length > 0 ? (
        <span className="ap-stack__shared" data-testid="stack-shared">
          Shared stack: {shared.map((id) => NAME[id] ?? id).join(", ")} ·{" "}
          <button type="button" className="ap-stack__shared-btn" data-testid="stack-shared-use" onClick={onUseShared}>
            Use it
          </button>{" "}
          <button type="button" className="ap-stack__shared-btn" data-testid="stack-shared-keep" onClick={onDismissShared}>
            {stack && stack.length > 0 ? "Keep mine" : "Dismiss"}
          </button>
        </span>
      ) : null}
    </div>
  );
}
