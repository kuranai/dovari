import { lazy, Suspense, useEffect, useState } from 'react';

import type { PageDetail, PageSummary } from '../../../shared/pages';
import { fetchPage, pageErrorMessage, updatePageTitle } from './api';

const PageEditor = lazy(async () => {
  const module = await import('./editor/PageEditor');
  return { default: module.PageEditor };
});

type PageLoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; page: PageDetail };

export interface PageViewProps {
  pageId: string;
  onPageDeleted: (page: PageDetail) => Promise<void>;
  onPageUpdated: (page: PageSummary) => void;
  pageSummary?: PageSummary;
}

function LoadingPage() {
  return (
    <section aria-live="polite" className="page-state page-state-loading">
      <span className="state-kicker">Page</span>
      <h1>Loading page…</h1>
      <p>Getting the latest version of this page.</p>
    </section>
  );
}

function PageLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section aria-live="assertive" className="page-state page-state-error" role="alert">
      <span className="state-kicker">Page unavailable</span>
      <h1>We couldn’t load this page.</h1>
      <p>{message}</p>
      <button className="button button-secondary" onClick={onRetry} type="button">
        Retry
      </button>
    </section>
  );
}

function RenameForm({
  page,
  onCancel,
  onSaved,
}: {
  page: PageDetail;
  onCancel: () => void;
  onSaved: (page: PageDetail) => void;
}) {
  const [title, setTitle] = useState(page.title);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(page.title);
    setError(null);
  }, [page.title]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (nextTitle.length === 0 || nextTitle === page.title) {
      onCancel();
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const response = await updatePageTitle(page.id, page.revision, nextTitle);
      onSaved(response.page);
    } catch (requestError) {
      setError(pageErrorMessage(requestError, 'The page name could not be saved.'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="rename-form" onSubmit={handleSubmit}>
      <label htmlFor="page-title">Page title</label>
      <div className="rename-form-row">
        <input
          autoFocus
          disabled={isSaving}
          id="page-title"
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onCancel();
            }
          }}
          value={title}
        />
        <button className="button button-primary" disabled={isSaving} type="submit">
          {isSaving ? 'Saving…' : 'Save title'}
        </button>
        <button
          className="button button-quiet"
          disabled={isSaving}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function PageContentEditor({ page }: { page: PageDetail }) {
  const [content, setContent] = useState(page.content);
  const [hasLocalChanges, setHasLocalChanges] = useState(false);

  function handleContentChange(nextContent: PageDetail['content']) {
    setContent(nextContent);
    setHasLocalChanges(true);
  }

  return (
    <section aria-labelledby="page-editor-title" className="page-editor-section">
      <div className="page-editor-heading">
        <div>
          <span className="state-kicker">Content</span>
          <h2 id="page-editor-title">Write in context.</h2>
        </div>
        <span className={hasLocalChanges ? 'editor-status is-local' : 'editor-status'}>
          {hasLocalChanges ? 'Changes are local' : 'Ready to write'}
        </span>
      </div>
      <Suspense
        fallback={
          <p className="page-editor-loading" role="status">
            Loading editor…
          </p>
        }
      >
        <PageEditor content={content} onChange={handleContentChange} />
      </Suspense>
      <details className="content-json">
        <summary>View current document JSON</summary>
        <pre>{JSON.stringify(content, null, 2)}</pre>
      </details>
    </section>
  );
}

function PageDetailContent({
  page,
  onPageDeleted,
  onPageUpdated,
}: {
  page: PageDetail;
  onPageDeleted: (page: PageDetail) => Promise<void>;
  onPageUpdated: (page: PageDetail) => void;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    try {
      await onPageDeleted(page);
    } catch (requestError) {
      setError(pageErrorMessage(requestError, 'The page could not be deleted.'));
      setIsDeleting(false);
    }
  }

  function handleSaved(updatedPage: PageDetail) {
    setIsRenaming(false);
    setError(null);
    onPageUpdated(updatedPage);
  }

  return (
    <article className="page-detail">
      <header className="page-detail-header">
        <div className="page-heading">
          <span className="state-kicker">Page</span>
          <h1>{page.title}</h1>
          <p className="page-slug">/{page.slug}</p>
        </div>
        <div className="page-actions">
          <button
            className="button button-secondary"
            disabled={isDeleting}
            onClick={() => setIsRenaming(true)}
            type="button"
          >
            Rename page
          </button>
          <button
            className="button button-danger"
            disabled={isDeleting}
            onClick={() => void handleDelete()}
            type="button"
          >
            {isDeleting ? 'Deleting…' : 'Delete page'}
          </button>
        </div>
      </header>
      {isRenaming ? (
        <RenameForm onCancel={() => setIsRenaming(false)} onSaved={handleSaved} page={page} />
      ) : null}
      {error ? (
        <p className="page-action-error" role="alert">
          {error}
        </p>
      ) : null}
      <PageContentEditor page={page} />
    </article>
  );
}

export function PageView({ pageId, onPageDeleted, onPageUpdated, pageSummary }: PageViewProps) {
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<PageLoadState>({ status: 'loading' });

  function handlePageUpdated(updatedPage: PageDetail) {
    setState({ status: 'ready', page: updatedPage });
    onPageUpdated(updatedPage);
  }

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    fetchPage(pageId, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) {
          setState({ status: 'ready', page: response.page });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            status: 'error',
            message: pageErrorMessage(error, 'The page could not be loaded.'),
          });
        }
      });

    return () => controller.abort();
  }, [pageId, reloadKey]);

  useEffect(() => {
    if (state.status !== 'ready' || pageSummary?.id !== state.page.id) {
      return;
    }

    if (
      state.page.title === pageSummary.title &&
      state.page.slug === pageSummary.slug &&
      state.page.parentId === pageSummary.parentId &&
      state.page.position === pageSummary.position &&
      state.page.revision === pageSummary.revision &&
      state.page.updatedAt === pageSummary.updatedAt
    ) {
      return;
    }

    setState((currentState) =>
      currentState.status === 'ready'
        ? { ...currentState, page: { ...currentState.page, ...pageSummary } }
        : currentState,
    );
  }, [pageSummary, state]);

  if (state.status === 'loading') {
    return <LoadingPage />;
  }

  if (state.status === 'error') {
    return (
      <PageLoadError message={state.message} onRetry={() => setReloadKey((value) => value + 1)} />
    );
  }

  return (
    <PageDetailContent
      key={state.page.id}
      onPageDeleted={onPageDeleted}
      onPageUpdated={handlePageUpdated}
      page={state.page}
    />
  );
}
