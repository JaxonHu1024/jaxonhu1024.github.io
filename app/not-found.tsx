/* eslint-disable @next/next/no-html-link-for-pages -- The exported 404 must use document navigation because GitHub Pages does not serve RSC routes. */

import { Navigation } from "./components/Navigation";

export default function NotFound() {
  return (
    <>
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <Navigation homePath="/" />
      <main className="not-found section" id="content" tabIndex={-1}>
        <div className="not-found-panel">
          <p className="not-found-code">404 / SIGNAL LOST</p>
          <h1>ROUTE NOT FOUND_</h1>
          <p className="not-found-copy">
            The requested coordinate is outside this system.
          </p>
          <a className="not-found-link" href="/">
            <span>RETURN HOME</span>
            <span className="not-found-link-arrow" aria-hidden="true">→</span>
          </a>
        </div>
        <p className="not-found-signature" aria-hidden="true">JAXON / RECOVERY CHANNEL</p>
      </main>
    </>
  );
}
