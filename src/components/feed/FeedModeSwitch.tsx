"use client";

/**
 * Gawk — Feed view switch: Stories (news + research cards) or Wire (the chronological
 * GitHub-events + HN wire). Deep-linked as `?view=wire`. Ink-only segmented control: the accent
 * belongs to the primary tab and the one hot button, never here.
 */

import type { FeedViewMode } from "@/components/chrome/primary-tabs";

const MODES: ReadonlyArray<{ id: FeedViewMode; label: string; hint: string }> = [
  { id: "stories", label: "Stories", hint: "News and research, newest first" },
  { id: "wire", label: "Wire", hint: "Public GitHub events and HN stories, chronological" },
];

export function FeedModeSwitch({
  mode,
  onChange,
}: {
  mode: FeedViewMode;
  onChange: (mode: FeedViewMode) => void;
}) {
  return (
    <div className="ap-feedseg" role="tablist" aria-label="Feed view">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          role="tab"
          aria-selected={mode === m.id}
          title={m.hint}
          className={`ap-feedseg__item${mode === m.id ? " is-active" : ""}`}
          onClick={() => onChange(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
