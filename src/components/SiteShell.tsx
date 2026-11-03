import type { ReactNode } from "react";

import { BRAND } from "../lib/brand.ts";

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <div className="site-header__inner">
          <a className="brand" href="/">
            <span className="brand__mark" aria-hidden="true" />
            {BRAND.name}
          </a>
          <nav aria-label="Main">
            <ul className="nav">
              <li><a href="/">Home</a></li>
              <li><a href="/cards">Cards</a></li>
              <li><a href="/play/index.html">Play</a></li>
            </ul>
          </nav>
        </div>
      </header>
      <main id="main" className="site-main">{children}</main>
      <footer className="site-footer">
        <p>{BRAND.disclaimer}</p>
      </footer>
    </>
  );
}
