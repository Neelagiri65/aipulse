/**
 * gawk.dev — 7-day strip in ink by shape: solid = operational that day, hatched = an incident or a
 * non-operational poll, hollow = not measured. One cell per DayBucket, oldest left. The caveat
 * about sample availability travels with the strip as its accessible name and title.
 */

import type { DayBucket } from "@/lib/data/status-history";
import { DAY_TONE_WORD, dayMark, dayTone } from "./row-state";

export function HealthStrip({ days, hasSamples }: { days: DayBucket[]; hasSamples: boolean }) {
  if (days.length === 0) return null;
  const incidentDays = days.filter((d) => d.incidents.length > 0).length;
  const basis = hasSamples ? "polled status + incidents" : "incident-derived · poll-sample history unavailable";
  const label = `${days.length}-day strip · ${incidentDays} incident ${incidentDays === 1 ? "day" : "days"} · ${basis}`;
  return (
    <span className="ap-strip" role="img" aria-label={label} title={label}>
      {days.map((d) => {
        const tone = dayTone(d, hasSamples);
        return (
          <span
            key={d.date}
            className={`ap-strip__cell ap-strip__cell--${dayMark(tone)}`}
            title={`${d.date} · ${DAY_TONE_WORD[tone]}`}
          />
        );
      })}
    </span>
  );
}
