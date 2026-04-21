/**
 * Single-panel / two-panel cap enforcement (FIX-01, see
 * `docs/design-spec-v2.md`).
 *
 * At ≥1440px viewports the dashboard allows two visible panels side-by-
 * side (the observatory posture). Below 1440 only one panel may be
 * visible at a time, so opening a new panel closes any others first.
 *
 * "Visible" = `open && !min`. A minimised panel stays in state but isn't
 * occluding the map, so it doesn't count toward the cap. Eviction order
 * is oldest-first (head of `zorder` is oldest focus).
 *
 * Pure function — called from Dashboard's `toggle()` state updater; kept
 * out of the component so the branching logic (toggle-closed vs
 * open-with-eviction vs cap of 1 vs 2) is unit-testable in isolation.
 */

export type PanelState = { open: boolean; min: boolean };

export function capForViewportWidth(width: number): 1 | 2 {
  return width >= 1440 ? 2 : 1;
}

/**
 * Returns the next panels map after toggling `id`. The toggle rule:
 *   - If `id` is currently visible (open + not minimised) → close it.
 *   - Otherwise open it and evict the oldest visible panels (from the
 *     head of `zorder`, excluding `id`) until total visible ≤ cap.
 *
 * The focus/zorder shuffle is Dashboard's concern — this helper only
 * computes the next `{ open, min }` map.
 */
export function togglePanelWithCap<Id extends string>(
  panels: Record<Id, PanelState>,
  zorder: Id[],
  id: Id,
  cap: number,
): Record<Id, PanelState> {
  const cur = panels[id];
  if (cur.open && !cur.min) {
    return { ...panels, [id]: { open: false, min: false } };
  }
  const next: Record<Id, PanelState> = {
    ...panels,
    [id]: { open: true, min: false },
  };
  const visibleOrdered = zorder.filter(
    (x) => x !== id && next[x].open && !next[x].min,
  );
  const over = Math.max(0, visibleOrdered.length + 1 - cap);
  for (let i = 0; i < over; i++) {
    next[visibleOrdered[i]] = { open: false, min: false };
  }
  return next;
}
