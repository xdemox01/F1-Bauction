// Placeholder art. No photographs, team marks or liveries are used; these
// generic motifs are replaced by licensed imagery when available.

import type { CardCategory } from "../../lib/cards/types.ts";

export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const pick = parts.length > 2 ? [parts[0], parts[parts.length - 1]] : parts;
  return pick.map((p) => p[0]).join("").toUpperCase();
}

export function CardArt({ category, name }: { category: CardCategory; name: string }) {
  if (category === "driver") {
    return (
      <div className="card-art card-art--driver" aria-hidden="true">
        <span className="card-art__monogram">{initials(name)}</span>
        <svg className="card-art__helmet" viewBox="0 0 120 100">
          <path d="M18 70c0-34 22-56 52-56 22 0 38 14 38 36v14c0 6-4 10-10 10H60l-6 10H28c-6 0-10-6-10-14z" />
          <path className="card-art__visor" d="M56 42h46c3 0 5 3 4 6l-3 8H58c-6 0-9-14-2-14z" />
        </svg>
      </div>
    );
  }
  if (category === "car") {
    return (
      <div className="card-art card-art--car" aria-hidden="true">
        <svg className="card-art__car" viewBox="0 0 240 90">
          <path d="M8 58h20l8-10h44l14-12h46l22 12h40l20 6v12H200a18 18 0 0 0-36 0H86a18 18 0 0 0-36 0H8z" />
          <path d="M150 30h22l6 12h-34z" className="card-art__cockpit" />
          <path d="M4 40h22v8H4zM212 46h22v12h-22z" />
          <circle cx="68" cy="68" r="14" className="card-art__wheel" />
          <circle cx="182" cy="68" r="14" className="card-art__wheel" />
        </svg>
      </div>
    );
  }
  return (
    <div className="card-art card-art--crew" aria-hidden="true">
      <svg className="card-art__tyre" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="50" className="card-art__tyre-wall" />
        <circle cx="60" cy="60" r="30" className="card-art__rim" />
        <circle cx="60" cy="60" r="7" className="card-art__nut" />
        {Array.from({ length: 10 }, (_, i) => (
          <line key={i} x1="60" y1="34" x2="60" y2="44" transform={`rotate(${i * 36} 60 60)`} className="card-art__spoke" />
        ))}
      </svg>
    </div>
  );
}
