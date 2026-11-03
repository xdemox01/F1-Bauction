// Read-only card catalogue for the game engine, built from the seed.

import { templateOverall } from "../cards/rating.ts";
import { CARD_TEMPLATES } from "../cards/seed.ts";
import type { CardCategory, RatedCardTemplate, Rarity } from "../cards/types.ts";

export const CATALOGUE: RatedCardTemplate[] = CARD_TEMPLATES.map((t) => ({ ...t, overall: templateOverall(t) }));

const bySlug = new Map(CATALOGUE.map((t) => [t.slug, t]));

export function getTemplate(slug: string): RatedCardTemplate | undefined {
  return bySlug.get(slug);
}

export function requireTemplate(slug: string): RatedCardTemplate {
  const t = bySlug.get(slug);
  if (!t) throw new Error(`Unknown card ${slug}`);
  return t;
}

/** Cards that packs can contain. Limited editions are excluded until a server can assign serial numbers. */
export const PACK_POOL: RatedCardTemplate[] = CATALOGUE.filter((t) => t.serialLimit === null);

export function packPoolByRarity(rarity: Rarity): RatedCardTemplate[] {
  return PACK_POOL.filter((t) => t.rarity === rarity);
}

export function cardsInCategory(category: CardCategory, pool: RatedCardTemplate[] = CATALOGUE): RatedCardTemplate[] {
  return pool.filter((t) => t.category === category);
}
