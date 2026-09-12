import { lazy, Suspense, useCallback, useEffect, useState } from 'react';

import type { PageDetail, PageSummary } from '../../../shared/pages';
import { fetchPage, pageErrorMessage, updatePageTitle } from './api';
import { usePageAutosave, type AutosaveSnapshot } from './editor/autosave';

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

function autosaveStatusLabel(snapshot: AutosaveSnapshot) {
  if (snapshot.recoveryAvailable) {
    return 'Draft found';
  }

  switch (snapshot.status) {
    case 'dirty':
      return 'Unsaved changes';
    case 'waiting':
      return 'Waiting to save…';
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved';
    case 'failed':
      return 'Not saved';
    case 'retrying':
      return 'Retrying…';
    case 'conflict':
      return 'Conflict';
    default:
      return 'Ready to write';
  }
}

function PageContentEditor({
  onPageUpdated,
  page,
}: {
  onPageUpdated: (page: PageDetail) => void;
  page: PageDetail;
}) {
  const [content, setContent] = useState(page.content);
  const [conflictActionError, setConflictActionError] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [isLoadingServer, setIsLoadingServer] = useState(false);

  const handleSaved = useCallback(
    (savedPage: PageDetail, isCurrentContent: boolean) => {
      if (isCurrentContent) {
        setContent(savedPage.content);
      }
      onPageUpdated(savedPage);
    },
    [onPageUpdated],
  );
  const handleContentAvailable = useCallback((nextContent: PageDetail['content']) => {
    setContent(nextContent);
  }, []);
  const autosave = usePageAutosave(page, handleSaved, handleContentAvailable);

  function handleContentChange(nextContent: PageDetail['content']) {
    setContent(nextContent);
    autosave.change(nextContent);
  }

  async function handleRecoverDraft() {
    const recoveredContent = await autosave.recoverDraft();
    if (recoveredContent !== null) {
      setContent(recoveredContent);
    }
  }

  async function handleDiscardDraft() {
    await autosave.discardDraft();
    setContent(page.content);
  }

  async function handleLoadServerVersion() {
    setIsLoadingServer(true);
    setConflictActionError(null);
    setCopyNotice(null);
    try {
      const response = await fetchPage(page.id);
      await autosave.resetFromServer(response.page);
      setContent(response.page.content);
      onPageUpdated(response.page);
    } catch (error: unknown) {
      setConflictActionError(pageErrorMessage(error, 'The server version could not be loaded.'));
    } finally {
      setIsLoadingServer(false);
    }
  }

  async function handleCopyMyVersion() {
    setConflictActionError(null);
    try {
      if (!navigator.clipboard) {
        throw new Error('Clipboard access is unavailable.');
      }
      await navigator.clipboard.writeText(JSON.stringify(autosave.getCurrentContent(), null, 2));
      setCopyNotice('Your version is copied to the clipboard.');
    } catch {
      setCopyNotice('Your version could not be copied automatically.');
    }
  }

  const statusClassName = [
    'editor-status',
    autosave.snapshot.hasUnconfirmedChanges ? 'is-local' : '',
    autosave.snapshot.status === 'failed' || autosave.snapshot.status === 'conflict'
      ? 'is-error'
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section aria-labelledby="page-editor-title" className="page-editor-section">
      <div className="page-editor-heading">
        <div>
          <span className="state-kicker">Content</span>
          <h2 id="page-editor-title">Write in context.</h2>
        </div>
        <span aria-live="polite" className={statusClassName}>
          {autosaveStatusLabel(autosave.snapshot)}
        </span>
      </div>
      {autosave.snapshot.recoveryAvailable ? (
        <div className="editor-save-notice editor-recovery-notice" role="status">
          <div>
            <strong>We found unsaved changes from an earlier session.</strong>
            <p>Restore them to continue editing, or discard the local draft.</p>
          </div>
          <div className="editor-save-actions">
            <button
              className="button button-primary"
              onClick={() => void handleRecoverDraft()}
              type="button"
            >
              Restore draft
            </button>
            <button
              className="button button-quiet"
              onClick={() => void handleDiscardDraft()}
              type="button"
            >
              Discard draft
            </button>
          </div>
        </div>
      ) : null}
      {autosave.snapshot.status === 'failed' ? (
        <div className="editor-save-notice editor-save-error" role="alert">
          <p>{autosave.snapshot.errorMessage ?? "We couldn't save this page."}</p>
          <button className="button button-secondary" onClick={autosave.retry} type="button">
            Retry
          </button>
        </div>
      ) : null}
      {autosave.snapshot.status === 'conflict' ? (
        <div className="editor-save-notice editor-save-error" role="alert">
          <div>
            <strong>We couldn’t save this page.</strong>
            <p>{autosave.snapshot.errorMessage}</p>
            {autosave.snapshot.conflictRevision !== null ? (
              <small>Server revision: {autosave.snapshot.conflictRevision}</small>
            ) : null}
          </div>
          <div className="editor-save-actions">
            <button
              className="button button-secondary"
              disabled={isLoadingServer}
              onClick={() => void handleLoadServerVersion()}
              type="button"
            >
              {isLoadingServer ? 'Loading…' : 'Load server version'}
            </button>
            <button
              className="button button-quiet"
              onClick={() => void handleCopyMyVersion()}
              type="button"
            >
              Copy my version
            </button>
          </div>
          {copyNotice ? <p className="editor-save-feedback">{copyNotice}</p> : null}
        </div>
      ) : null}
      {conflictActionError ? (
        <p className="inline-error" role="alert">
          {conflictActionError}
        </p>
      ) : null}
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
      <PageContentEditor onPageUpdated={onPageUpdated} page={page} />
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
