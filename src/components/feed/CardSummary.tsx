/**
 * What a card is about, in one block: the source's own words (`summary`) under "In their words",
 * else a machine summary of the linked page under "Machine summary", always with the model that
 * wrote it and "not the source's words". Never both — the derivers never set both, and this
 * component shows `summary` if they ever did. Blank text renders nothing. Same copy as iOS.
 * Rendered by the Feed's reading pane and the card permalink page.
 */
import type { Card } from "@/lib/feed/types";

export function CardSummary({ card }: { card: Pick<Card, "summary" | "machineSummary"> }) {
  const own = card.summary?.trim();
  if (own) {
    return (
      <section className="ap-summary" data-testid="card-summary" data-summary-kind="source">
        <div className="ap-summary__head">In their words</div>
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
      {/* One string: split JSX text lost the space after the model in the client bundle ("20bfrom"). */}
      <p className="ap-summary__label">{`Written by ${machine.model} from the linked page · not the source's words`}</p>
    </section>
  );
}
