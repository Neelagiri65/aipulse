/**
 * CountryPill + LangTag — neutral chrome for the Regional Wire.
 *
 * Design discipline (tracked in RSS-03 AUDITOR-PENDING):
 *   - CountryPill is the *same dimensions* as the HN orange pill so
 *     the two layers feel like peers inside THE WIRE row — different
 *     provenance, same visual weight.
 *   - Neutral slate fill avoids implying any nation carries more
 *     editorial weight than another. The map layer (amber) is where
 *     "RSS" as a concept gets its colour; the country itself stays
 *     neutral.
 *   - LangTag renders only when lang !== "en" to prevent a DE/EN
 *     decoration asymmetry — if every row said `EN` it would be
 *     visual noise; flagging the non-default is the informative case.
 */

export function CountryPill({ country }: { country: string }) {
  const iso = country.toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-sm bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-200"
      title={`Publisher HQ country: ${iso}`}
    >
      {iso}
    </span>
  );
}

export function LangTag({ lang }: { lang: string }) {
  const normalised = lang.trim().toLowerCase();
  if (!normalised || normalised === "en") return null;
  return (
    <span
      className="inline-flex shrink-0 items-center font-mono text-[9px] font-medium uppercase tracking-wider text-slate-400"
      title={`Feed language: ${normalised}`}
    >
      {normalised}
    </span>
  );
}
