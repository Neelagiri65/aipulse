/**
 * What a card is about, in one block: the source's own words (`summary`) as plain text, else a
 * machine summary of the linked page under a "Machine summary" heading. Never both — the derivers never set both, and this
 * component shows `summary` if they ever did. Blank text renders nothing. Same copy as iOS.
 * Rendered by the Feed's reading pane and the card permalink page.
 */
import type { Card } from "@/lib/feed/types";

export function CardSummary({ card }: { card: Pick<Card, "summary" | "machineSummary"> }) {
  const own = card.summary?.trim();
  if (own) {
    return (
      <section className="ap-summary" data-testid="card-summary" data-summary-kind="source">
        <p className="ap-summary__text">{own}</p>
      </section>
    );
  }
  const machine = card.machineSummary;
  const text = machine?.text.trim();
  if (!machine || !text) return null;
  return (
    <section className="ap-summary ap-summary--machine" data-testid="card-summary" data-summary-kind="machine">
      <div className="ap-summary__head">Machine summary</div>
      <p className="ap-summary__text">{text}</p>
    </section>
  );
}
