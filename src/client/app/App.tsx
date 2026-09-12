export function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="/" aria-label="Dovari home">
          <span className="brand-mark" aria-hidden="true">
            D
          </span>
          <span>Dovari</span>
        </a>
        <span className="phase-label">Cloudflare foundation</span>
      </header>

      <main className="app-main">
        <section className="welcome-card" aria-labelledby="welcome-title">
          <p className="eyebrow">A quiet place for useful things</p>
          <h1 id="welcome-title">Your knowledge base starts here.</h1>
          <p className="welcome-copy">
            The Dovari workspace is running through a local Cloudflare Worker. Pages, search, and
            the editor will arrive as the foundation grows.
          </p>
        </section>
      </main>
    </div>
  );
}
