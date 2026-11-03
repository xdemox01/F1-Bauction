import type { CatalogueSource } from "../lib/data/catalogue-repository.ts";

/** Always tells the player where the data on screen comes from. */
export function SourceNotice({ source }: { source: CatalogueSource }) {
  return (
    <p className="source-notice" data-kind={source.kind}>
      <span className="source-notice__dot" aria-hidden="true" />
      {source.label}. Ratings are game estimates.
    </p>
  );
}
