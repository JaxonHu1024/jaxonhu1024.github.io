import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found section grid-surface" id="content">
      <div className="not-found-panel">
        <p className="not-found-code">404 / SIGNAL LOST</p>
        <h1>ROUTE NOT FOUND_</h1>
        <p className="not-found-copy">
          The requested coordinate is outside this system.
        </p>
        <Link className="terminal-button not-found-link" href="/">
          <span>RETURN HOME</span>
          <span className="button-arrow" aria-hidden="true">›</span>
        </Link>
      </div>
      <p className="not-found-signature" aria-hidden="true">JAXON / RECOVERY CHANNEL</p>
    </main>
  );
}
