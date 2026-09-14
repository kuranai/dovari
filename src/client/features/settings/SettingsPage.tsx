import { Link, useOutletContext } from 'react-router-dom';

import type { WorkspaceOutletContext } from '../../app/App';
import { ThemeControl } from '../../app/ThemeControl';
import { selectRecentPages } from '../pages/recentPages';

export function SettingsPage() {
  const { pages } = useOutletContext<WorkspaceOutletContext>();
  const versionPage = selectRecentPages(pages)[0];
  const versionHistoryUrl = versionPage
    ? `/app/pages/${encodeURIComponent(versionPage.id)}?history=1`
    : '/app';

  return (
    <section aria-labelledby="settings-title" className="settings-page settings-home-page">
      <header className="settings-header">
        <div>
          <span className="state-kicker">Workspace</span>
          <h1 id="settings-title">Settings</h1>
          <p>Keep the workspace comfortable, recoverable, and ready for everyday writing.</p>
        </div>
        <Link className="button button-secondary" to="/app">
          Back to pages
        </Link>
      </header>

      <nav aria-label="Settings sections" className="settings-section-nav">
        <a href="#theme">Theme</a>
        <a href="#trash">Trash</a>
        <a href="#versions">Version history</a>
        <a href="#backup">Backup</a>
        <a href="#restore">Restore</a>
      </nav>

      <div className="settings-card-grid">
        <section className="settings-card" id="theme">
          <div>
            <span className="state-kicker">Appearance</span>
            <h2>Theme</h2>
            <p>Choose Light, Dark, or System. Your preference stays in this browser.</p>
          </div>
          <ThemeControl />
        </section>

        <section className="settings-card" id="trash">
          <div>
            <span className="state-kicker">Recovery</span>
            <h2>Trash</h2>
            <p>Restore deleted pages or permanently remove them after confirmation.</p>
          </div>
          <Link className="button button-secondary" to="/app/settings/trash">
            Open Trash
          </Link>
        </section>

        <section className="settings-card" id="versions">
          <div>
            <span className="state-kicker">Recovery</span>
            <h2>Version history</h2>
            <p>
              Review and restore saved page versions. Each page keeps its own history next to the
              document.
            </p>
          </div>
          {versionPage ? (
            <Link className="button button-secondary" to={versionHistoryUrl}>
              Open version history
            </Link>
          ) : (
            <Link className="button button-secondary" to="/app">
              Create a page first
            </Link>
          )}
        </section>

        <section className="settings-card" id="backup">
          <div>
            <span className="state-kicker">Data</span>
            <h2>Backup</h2>
            <p>
              Download a complete, versioned Dovari backup including pages, history, and assets.
            </p>
          </div>
          <Link className="button button-secondary" to="/app/settings/backup">
            Create backup
          </Link>
        </section>

        <section className="settings-card" id="restore">
          <div>
            <span className="state-kicker">Data</span>
            <h2>Restore</h2>
            <p>Validate and resume a backup restore into an empty workspace.</p>
          </div>
          <Link className="button button-secondary" to="/app/settings/backup">
            Restore a backup
          </Link>
        </section>
      </div>
    </section>
  );
}
