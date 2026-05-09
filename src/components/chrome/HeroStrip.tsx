"use client";

import type { StatusResult } from "@/lib/data/fetch-status";
import { deriveSev } from "@/components/chrome/StatusBar";
import { PushAlertToggle } from "@/components/chrome/PushAlertToggle";

export type HeroStripProps = {
  status?: StatusResult;
  variant?: "desktop" | "mobile";
};

export function HeroStrip({ status, variant = "desktop" }: HeroStripProps) {
  const sev = deriveSev(status);
  const total = sev.total;
  const allOp = total > 0 && sev.operational === total;
  const hasOutage = sev.outage > 0;

  const pillColor = hasOutage
    ? "var(--sev-outage)"
    : !allOp
      ? "var(--sev-degrade)"
      : "var(--sev-op)";

  const pillLabel =
    total === 0
      ? "Checking..."
      : `${sev.operational}/${total} Operational`;

  if (variant === "mobile") {
    return (
      <div className="flex flex-col gap-2 border-b border-border/40 bg-background/90 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-base font-medium tracking-tight text-foreground">
            Real-time status for{" "}
            <span className="text-white">
              Claude · Cursor · Copilot · Windsurf · OpenAI
            </span>
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span
            className="flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold tabular-nums"
            style={{
              color: pillColor,
              border: `1px solid color-mix(in srgb, ${pillColor} 40%, transparent)`,
              boxShadow: `0 0 12px color-mix(in srgb, ${pillColor} 15%, transparent)`,
            }}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{
                background: pillColor,
                boxShadow: `0 0 6px ${pillColor}`,
              }}
            />
            {pillLabel}
          </span>
          <PushAlertToggle />
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed left-0 right-0 z-[38] flex items-center justify-between border-b border-border/40 bg-background/90 px-6 backdrop-blur-md"
      style={{ top: 76, height: 56 }}
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-base font-medium tracking-tight text-foreground lg:text-lg">
          Real-time status for{" "}
          <span className="text-white">
            Claude · Cursor · Copilot · Windsurf · OpenAI
          </span>
        </span>
        <span className="text-xs text-gray-300">
          Get pinged when they break.
        </span>
      </div>

      <div className="flex items-center gap-5">
        <span
          className="flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold tabular-nums"
          style={{
            color: pillColor,
            border: `1px solid color-mix(in srgb, ${pillColor} 40%, transparent)`,
            boxShadow: `0 0 12px color-mix(in srgb, ${pillColor} 15%, transparent)`,
          }}
        >
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{
              background: pillColor,
              boxShadow: `0 0 8px ${pillColor}`,
            }}
          />
          {pillLabel}
        </span>

        <div className="scale-[1.35]">
          <PushAlertToggle />
        </div>
      </div>
    </div>
  );
}
