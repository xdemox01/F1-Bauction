// Small shared UI pieces.

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { ATTR_LABEL, CATEGORY_LABEL } from "../shared/pool.ts";
import type { ItemView, ManagerView } from "../shared/types.ts";

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
  label,
  columns,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  label: string;
  columns?: number;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label} style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} disabled={disabled} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Panel({ title, icon, sub, children, className, badge }: { title: string; icon?: ReactNode; sub?: string; children: ReactNode; className?: string; badge?: string }) {
  return (
    <section className={`fp ${className ?? ""}`} aria-label={title}>
      <header className="fp__head">
        {icon && <span className="fp__icon" aria-hidden="true">{icon}</span>}
        <div>
          <h2 className="fp__title">{title}</h2>
          {sub && <p className="fp__sub">{sub}</p>}
        </div>
        {badge && <span className="badge">{badge}</span>}
      </header>
      {children}
    </section>
  );
}

export function useCountdown(endsAt: number | null, serverNow: () => number, everyMs = 100) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => setTick((t) => t + 1), everyMs);
    return () => clearInterval(id);
  }, [endsAt, everyMs]);
  return endsAt === null ? null : Math.max(0, endsAt - serverNow());
}

export function Swatch({ color }: { color: string }) {
  return <span className="swatch" style={{ background: color }} aria-hidden="true" />;
}

export function ManagerName({ m }: { m: ManagerView }) {
  return (
    <span className="mname">
      <Swatch color={m.color} />
      <span className="mname__text">{m.name}</span>
      {m.isYou && <span className="tag-s">YOU</span>}
      {m.isHost && <span className="tag-s">HOST</span>}
      {m.isBot && <span className="tag-s">AI</span>}
    </span>
  );
}

const ERA_TAG: Record<string, string> = { current: "2026 grid", legend: "Legend", academy: "Academy (fictional)", privateer: "Privateer (fictional)" };

export function ItemCard({ item, size = "md", price }: { item: ItemView; size?: "sm" | "md" | "lg"; price?: number }) {
  const ratingClass = item.overall === null ? "unknown" : item.overall >= 91 ? "apex" : item.overall >= 85 ? "mythic" : item.overall >= 78 ? "epic" : item.overall >= 70 ? "rare" : "common";
  return (
    <article className={`icard icard--${size}`} data-tier={ratingClass} data-cat={item.category} aria-label={`${item.name}, ${CATEGORY_LABEL[item.category]}${item.overall !== null ? `, overall ${item.overall}` : ""}`}>
      <div className="icard__top">
        <span className="icard__ovr">{item.overall ?? "?"}</span>
        <span className="icard__cat">{CATEGORY_LABEL[item.category]}</span>
      </div>
      <h3 className="icard__name">{item.name}</h3>
      <p className="icard__meta">
        {item.team}
        {item.season ? ` · ${item.season}` : ""}
        {item.nationality ? ` · ${item.nationality}` : ""}
      </p>
      <p className="icard__era">{ERA_TAG[item.era]}</p>
      {item.attrs && size !== "sm" && (
        <dl className="icard__attrs">
          {Object.entries(item.attrs).map(([k, v]) => (
            <div key={k}>
              <dt>{ATTR_LABEL[k] ?? k}</dt>
              <dd>
                <span className="bar" aria-hidden="true">
                  <span style={{ width: `${v}%` }} />
                </span>
                {v}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {!item.attrs && size !== "sm" && <p className="icard__blind">Blind auction: ratings hidden</p>}
      {price !== undefined && <p className="icard__price">{price} cr</p>}
    </article>
  );
}

export function copyText(text: string): Promise<boolean> {
  return navigator.clipboard?.writeText(text).then(
    () => true,
    () => false,
  ) ?? Promise.resolve(false);
}
