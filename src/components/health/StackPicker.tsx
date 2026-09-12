"use client";

import { TOOLS } from "@/components/health/tools";
import { toggleTool, type ToolId } from "@/lib/stack";

/**
 * Inline chip row inside the Health panel. One button per tracked tool,
 * pressed = in the visitor's stack. Never an overlay. "Show all" clears.
 */
export function StackPicker({
  stack,
  onChange,
}: {
  stack: ToolId[] | null;
  onChange: (next: ToolId[] | null) => void;
}) {
  const set = new Set<ToolId>(stack ?? []);
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
        <button type="button" className="ap-stack__clear" data-testid="stack-clear" onClick={() => onChange(null)}>
          Show all
        </button>
      ) : (
        <span className="ap-stack__hint">pick the tools you use</span>
      )}
    </div>
  );
}
