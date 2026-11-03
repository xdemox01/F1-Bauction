// Pure filtering/sorting for card lists. Shared by the catalogue now and the
// player collection in milestone 2.

import { CARD_CATEGORIES, EDITIONS, RARITIES } from "./types.ts";
import type { CardCategory, Edition, RatedCardTemplate, Rarity } from "./types.ts";

export const SORT_OPTIONS = ["overall_desc", "overall_asc", "name_asc", "rarity_desc"] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export interface CatalogueQuery {
  category?: CardCategory;
  rarity?: Rarity;
  edition?: Edition;
  season?: number;
  teamId?: string;
  search?: string;
  sort: SortOption;
}

type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

function pick<T extends string>(allowed: readonly T[], value: string | undefined): T | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** Parses untrusted URL search params; unknown values are ignored, never thrown. */
export function parseCatalogueQuery(params: RawParams): CatalogueQuery {
  const seasonRaw = first(params.season);
  const season = seasonRaw && /^\d{4}$/.test(seasonRaw) ? Number(seasonRaw) : undefined;
  const team = first(params.team);
  return {
    category: pick(CARD_CATEGORIES, first(params.category)),
    rarity: pick(RARITIES, first(params.rarity)),
    edition: pick(EDITIONS, first(params.edition)),
    season,
    teamId: team && /^[a-z0-9-]{1,40}$/.test(team) ? team : undefined,
    search: first(params.q)?.slice(0, 60),
    sort: pick(SORT_OPTIONS, first(params.sort)) ?? "overall_desc",
  };
}

const normalise = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function filterCatalogue(cards: RatedCardTemplate[], query: CatalogueQuery): RatedCardTemplate[] {
  const needle = query.search ? normalise(query.search) : undefined;
  const result = cards.filter(
    (c) =>
      (!query.category || c.category === query.category) &&
      (!query.rarity || c.rarity === query.rarity) &&
      (!query.edition || c.edition === query.edition) &&
      (!query.season || c.season === query.season) &&
      (!query.teamId || c.teamId === query.teamId) &&
      (!needle || normalise(c.name).includes(needle)),
  );
  const byName = (a: RatedCardTemplate, b: RatedCardTemplate) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug);
  const sorters: Record<SortOption, (a: RatedCardTemplate, b: RatedCardTemplate) => number> = {
    overall_desc: (a, b) => b.overall - a.overall || byName(a, b),
    overall_asc: (a, b) => a.overall - b.overall || byName(a, b),
    name_asc: byName,
    rarity_desc: (a, b) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) || b.overall - a.overall || byName(a, b),
  };
  return result.sort(sorters[query.sort]);
}
