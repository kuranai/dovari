import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import type { PublicPublication, PublicPublicationSummary } from '../../../shared/publications';
import { fetchAllPublicPublications, fetchPublicPublication, publicationErrorMessage } from './api';
import { PublicDocument } from './PublicDocument';

type PublicPageState =
  | { status: 'loading' }
  | { status: 'error'; message: string; notFound: boolean }
  | {
      status: 'ready';
      publication: PublicPublication;
      navigation: PublicPublicationSummary[];
      navigationError: string | null;
    };

function PublicHeader({ publicId }: { publicId: string }) {
  return (
    <header className="public-header">
      <Link className="brand" to="/">
        <span aria-hidden="true" className="brand-mark">
          D
        </span>
        <span>Dovari</span>
      </Link>
      <a
        className="button button-secondary"
        href={`/app/publications/${encodeURIComponent(publicId)}/edit`}
      >
        Edit page
      </a>
    </header>
  );
}

function PublicPageState({
  message,
  notFound,
  onRetry,
}: {
  message: string;
  notFound: boolean;
  onRetry: () => void;
}) {
  return (
    <section aria-live="assertive" className="public-state public-state-error" role="alert">
      <span className="state-kicker">
        {notFound ? 'Page unavailable' : 'Public page unavailable'}
      </span>
      <h1>{notFound ? 'This public page is gone.' : 'We couldn’t load this public page.'}</h1>
      <p>{message}</p>
      <div className="public-state-actions">
        <button className="button button-secondary" onClick={onRetry} type="button">
          Retry
        </button>
        <Link className="button button-quiet" to="/">
          Back to public pages
        </Link>
      </div>
    </section>
  );
}

export function PublicPage() {
  const { publicId } = useParams();
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<PublicPageState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    if (!publicId) {
      setState({ status: 'error', message: 'This public page is not available.', notFound: true });
      return () => controller.abort();
    }
    const currentPublicId = publicId;

    async function load() {
      try {
        const response = await fetchPublicPublication(currentPublicId, controller.signal);
        if (controller.signal.aborted) return;
        setState({
          status: 'ready',
          navigation: [],
          navigationError: null,
          publication: response.publication,
        });
        try {
          const navigation = await fetchAllPublicPublications(controller.signal);
          if (!controller.signal.aborted) {
            setState((current) =>
              current.status === 'ready' ? { ...current, navigation } : current,
            );
          }
        } catch (navigationError: unknown) {
          if (!controller.signal.aborted) {
            setState((current) =>
              current.status === 'ready'
                ? {
                    ...current,
                    navigationError: publicationErrorMessage(
                      navigationError,
                      'Public navigation is temporarily unavailable.',
                    ),
                  }
                : current,
            );
          }
        }
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          setState({
            status: 'error',
            message: publicationErrorMessage(error, 'The public page could not be loaded.'),
            notFound:
              error instanceof Error && 'code' in error && error.code === 'PUBLICATION_NOT_FOUND',
          });
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [publicId, reloadKey]);

  if (state.status === 'loading') {
    return (
      <div className="public-shell">
        <PublicHeader publicId={publicId ?? ''} />
        <main className="public-main" id="main-content" tabIndex={-1}>
          <section aria-busy="true" aria-live="polite" className="public-state">
            <h1>Loading public page…</h1>
          </section>
        </main>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="public-shell">
        <PublicHeader publicId={publicId ?? ''} />
        <main className="public-main" id="main-content" tabIndex={-1}>
          <PublicPageState
            message={state.message}
            notFound={state.notFound}
            onRetry={() => setReloadKey((value) => value + 1)}
          />
        </main>
      </div>
    );
  }

  const { publication, navigation, navigationError } = state;
  return (
    <div className="public-shell">
      <PublicHeader publicId={publication.publicId} />
      <div className="public-layout">
        <aside className="public-navigation" aria-label="Public pages">
          <Link className="public-home-link" to="/">
            All public pages
          </Link>
          {navigationError ? <p className="public-navigation-error">{navigationError}</p> : null}
          {navigation.length > 0 ? (
            <ul>
              {navigation.map((item) => (
                <li key={item.publicId}>
                  <Link
                    aria-current={item.publicId === publication.publicId ? 'page' : undefined}
                    className={item.publicId === publication.publicId ? 'is-current' : ''}
                    to={`/p/${encodeURIComponent(item.publicId)}`}
                  >
                    {item.publishedTitle}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </aside>
        <main className="public-main public-page-main" id="main-content" tabIndex={-1}>
          <article className="public-article">
            <header className="public-article-header">
              <span className="state-kicker">Published page</span>
              <h1>{publication.publishedTitle}</h1>
              <time dateTime={publication.updatedAt}>
                Updated {new Date(publication.updatedAt).toLocaleDateString()}
              </time>
            </header>
            <PublicDocument document={publication.content} publicationId={publication.publicId} />
          </article>
        </main>
      </div>
    </div>
  );
}
