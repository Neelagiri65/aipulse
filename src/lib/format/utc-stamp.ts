/** `dd/mm/yyyy hh:mm UTC` for an ISO time; the input echoed back when it does not parse. */
export function stampUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

/** `hh:mm UTC` for an ISO time; the input echoed back when it does not parse. */
export function hhmmUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

/**
 * `dd/mm/yyyy` for an ISO instant that means a DATE; the input echoed back
 * when it does not parse, same contract as `stampUtc`.
 *
 * Upstream hands some date-shaped facts as instants — OpenRouter's
 * `knowledge_cutoff` arrives as `2026-02-16T00:00:00.000Z` and
 * `2025-01-31T23:59:59.000Z`, start-of-day and end-of-day for what is, in
 * both cases, simply a date. Printing the instant put a machine timestamp on
 * screen, wrapped over two lines, with milliseconds a reader cannot use.
 */
export function dateUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}
