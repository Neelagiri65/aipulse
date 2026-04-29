/**
 * Gawk — NEW_RELEASE deriver
 *
 * Pure function over a HuggingFace `?sort=createdAt&direction=-1&full=true`
 * response. Emits one Card per model that:
 *   - was created within `NEW_RELEASE_AGE_HOURS` of `nowMs`,
 *   - is published by an org in the `MAJOR_LAB_AUTHORS` allowlist (HF
 *     org strings normalised to lowercase + a small alias map for the
 *     two known divergences: HF's `meta-llama` ↔ `meta-llama`, HF's
 *     `deepseek-ai` ↔ OpenRouter's `deepseek`).
 *   - has at least `NEW_RELEASE_MIN_LIKES` likes — first-paint social
 *     proof on HF, more reliable than the rolling 30d `downloads`
 *     counter which starts at 0 for brand-new repos.
 *
 * Severity 70: between MODEL_MOVER (80) and SDK_TREND (60). Locked.
 * No new metric — the deriver reports what HF's catalogue says was
 * published, with the lab gate filtering out fine-tunes from no-name
 * orgs that flood the createdAt-sorted listing.
 *
 * Per CLAUDE.md trust contract — no fabricated copy, no LLM, no
 * scoring. License is taken verbatim from `cardData.license`; if HF
 * returned no license string the card simply omits it rather than
 * inferring one.
 */

import { HUGGINGFACE_MODELS } from "@/lib/data-sources";
import type { HuggingFaceModel } from "@/lib/data/fetch-models";
import { isOpenWeight } from "@/lib/data/open-weight";
import { MAJOR_LAB_AUTHORS } from "@/lib/data/openrouter-types";
import { cardId } from "@/lib/feed/card-id";
import { FEED_SEVERITIES, FEED_TRIGGERS } from "@/lib/feed/thresholds";
import type { Card } from "@/lib/feed/types";

const SOURCE_NAME = "HuggingFace Models API";

/**
 * HuggingFace org strings differ from OpenRouter author handles for two
 * orgs we care about. Normalise HF → MAJOR_LAB_AUTHORS once so the
 * gate uses the one canonical allowlist across both surfaces.
 */
const HF_ORG_ALIAS: Record<string, string> = {
  "deepseek-ai": "deepseek",
  // HF and OpenRouter both use "meta-llama" — included as identity for
  // documentation; the lookup is a no-op.
  "meta-llama": "meta-llama",
};

const KNOWN_LAB_SET: ReadonlySet<string> = new Set(MAJOR_LAB_AUTHORS);

function normaliseOrg(org: string): string {
  const lower = org.toLowerCase();
  return HF_ORG_ALIAS[lower] ?? lower;
}

export function isKnownLab(org: string | undefined | null): boolean {
  if (!org) return false;
  return KNOWN_LAB_SET.has(normaliseOrg(org));
}

export function deriveNewReleaseCards(
  models: readonly HuggingFaceModel[],
  nowMs: number = Date.now(),
): Card[] {
  const cards: Card[] = [];
  const ageWindowMs =
    FEED_TRIGGERS.NEW_RELEASE_AGE_HOURS * 60 * 60 * 1000;
  const minLikes = FEED_TRIGGERS.NEW_RELEASE_MIN_LIKES;

  for (const model of models) {
    if (!model.createdAt) continue;
    const createdMs = Date.parse(model.createdAt);
    if (!Number.isFinite(createdMs)) continue;
    const ageMs = nowMs - createdMs;
    if (ageMs < 0) continue; // future-dated, skip rather than leak
    if (ageMs > ageWindowMs) continue;
    if (model.likes < minLikes) continue;
    if (!isKnownLab(model.author)) continue;

    const ageHours = Math.max(1, Math.round(ageMs / (60 * 60 * 1000)));
    const license = model.license?.trim() ?? "";
    const open = isOpenWeight(model.id);
    const detailParts: string[] = [];
    if (open) detailParts.push("OPEN");
    if (license) detailParts.push(license);
    detailParts.push(`${ageHours}h ago`);

    cards.push({
      id: cardId("NEW_RELEASE", `hf:${model.id}`, createdMs),
      type: "NEW_RELEASE",
      severity: FEED_SEVERITIES.NEW_RELEASE,
      headline: `${model.author} released ${model.name}`,
      detail: detailParts.join(" · "),
      sourceName: SOURCE_NAME,
      sourceUrl: model.hubUrl,
      timestamp: model.createdAt,
      meta: {
        hfId: model.id,
        author: model.author,
        license: license || "unspecified",
        openWeight: open,
        likes: model.likes,
        downloads: model.downloads,
        ageHours,
        registryUrl: HUGGINGFACE_MODELS.url,
      },
    });
  }
  return cards;
}
