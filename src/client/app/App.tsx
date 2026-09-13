import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from 'react-router-dom';

import type { PageDetail, PageSummary } from '../../shared/pages';
import {
  createPage as createPageRequest,
  deletePage as deletePageRequest,
  downloadKnowledgeBaseExport,
  fetchPages,
  pageErrorMessage,
} from '../features/pages/api';
import { PageTree } from '../features/pages/PageTree';
import { PageView } from '../features/pages/PageView';
import { CommandPalette } from '../features/search/CommandPalette';

type PageListState = 'loading' | 'error' | 'ready';

export interface WorkspaceOutletContext {
  actionError: string | null;
  createPage: (parentId?: string | null) => Promise<void>;
  deletePage: (page: PageDetail) => Promise<void>;
  isCreating: boolean;
  listError: string | null;
  listState: PageListState;
  onPageUpdated: (page: PageSummary) => void;
  pages: PageSummary[];
  refreshPages: () => Promise<void>;
  retryPages: () => void;
}

function workspacePath(pageId: string) {
  return `/app/pages/${pageId}`;
}

function LoadingState() {
  return (
    <section aria-live="polite" className="page-state page-state-loading">
      <span className="state-kicker">Workspace</span>
      <h1>Loading your pages…</h1>
      <p>Preparing your private knowledge base.</p>
    </section>
  );
}

function EmptyState({ onCreate, isCreating }: { onCreate: () => void; isCreating: boolean }) {
  return (
    <section className="page-state page-state-empty">
      <span className="state-kicker">Your workspace</span>
      <h1>Start with one useful page.</h1>
      <p>Create a page for notes, decisions, or anything you want to keep close.</p>
      <button
        className="button button-primary"
        disabled={isCreating}
        onClick={onCreate}
        type="button"
      >
        {isCreating ? 'Creating…' : 'Create your first page'}
      </button>
    </section>
  );
}

function ListErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section aria-live="assertive" className="page-state page-state-error" role="alert">
      <span className="state-kicker">Workspace unavailable</span>
      <h1>We couldn’t load your pages.</h1>
      <p>{message}</p>
      <button className="button button-secondary" onClick={onRetry} type="button">
        Retry
      </button>
    </section>
  );
}

function WorkspaceLanding() {
  const { createPage, isCreating, listError, listState, pages, retryPages } =
    useOutletContext<WorkspaceOutletContext>();

  if (listState === 'loading') {
    return <LoadingState />;
  }

  if (listState === 'error') {
    return <ListErrorState message={listError ?? 'Please try again.'} onRetry={retryPages} />;
  }

  if (pages.length === 0) {
    return <EmptyState isCreating={isCreating} onCreate={() => void createPage()} />;
  }

  return (
    <section className="page-state page-state-empty">
      <span className="state-kicker">Choose a page</span>
      <h1>Your pages are ready.</h1>
      <p>Select a page from the sidebar to open it.</p>
    </section>
  );
}

function PageRoute() {
  const { pageId } = useParams();
  const { deletePage, onPageUpdated, pages, refreshPages } =
    useOutletContext<WorkspaceOutletContext>();
  const navigate = useNavigate();

  if (!pageId) {
    return <Navigate replace to="/app" />;
  }

  return (
    <PageView
      key={pageId}
      onNavigateToPage={(targetPageId) => navigate(workspacePath(targetPageId))}
      onPageCreated={() => void refreshPages()}
      onPageDeleted={deletePage}
      onPageUpdated={onPageUpdated}
      pageId={pageId}
      pageSummary={pages.find((page) => page.id === pageId)}
    />
  );
}

function Sidebar({
  isExporting,
  isCreating,
  onCreate,
  onCreateChild,
  onExport,
  onPageUpdated,
  onPagesChanged,
  pages,
  state,
  error,
  onRetry,
}: {
  error: string | null;
  isExporting: boolean;
  isCreating: boolean;
  onCreate: () => void;
  onCreateChild: (parentId: string) => void;
  onExport: () => void;
  onPageUpdated: (page: PageSummary) => void;
  onPagesChanged: () => Promise<void>;
  onRetry: () => void;
  pages: PageSummary[];
  state: PageListState;
}) {
  return (
    <aside className="app-sidebar" aria-label="Workspace sidebar">
      <div className="sidebar-heading">
        <div>
          <span className="state-kicker">Workspace</span>
          <h2>Pages</h2>
        </div>
        {state === 'ready' && pages.length > 0 ? (
          <span className="page-count" aria-label={`${pages.length} pages`}>
            {pages.length}
          </span>
        ) : null}
      </div>

      {state === 'loading' ? (
        <p className="sidebar-state" aria-live="polite">
          Loading pages…
        </p>
      ) : null}
      {state === 'error' ? (
        <div className="sidebar-error" role="alert">
          <p>{error ?? 'Pages are unavailable.'}</p>
          <button className="button button-quiet" onClick={onRetry} type="button">
            Retry
          </button>
        </div>
      ) : null}
      {state === 'ready' && pages.length === 0 ? (
        <p className="sidebar-state">No pages yet.</p>
      ) : null}
      {state === 'ready' && pages.length > 0 ? (
        <PageTree
          onCreateChild={onCreateChild}
          onPageUpdated={onPageUpdated}
          onPagesChanged={onPagesChanged}
          pages={pages}
        />
      ) : null}

      <div className="sidebar-footer">
        <button
          className="new-page-button"
          disabled={isCreating || state !== 'ready'}
          onClick={onCreate}
          type="button"
        >
          <span aria-hidden="true">+</span>
          {isCreating ? 'Creating page…' : 'New page'}
          <kbd>⌘N</kbd>
        </button>
        <button
          className="button button-secondary sidebar-export-button"
          disabled={isExporting || state !== 'ready'}
          onClick={onExport}
          type="button"
        >
          {isExporting ? 'Preparing export…' : 'Export Markdown + ZIP'}
        </button>
        <p className="sidebar-note">A quiet place for useful things.</p>
      </div>
    </aside>
  );
}

function Workspace() {
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [listState, setListState] = useState<PageListState>('loading');
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const paletteReturnFocusRef = useRef<HTMLElement | null>(null);
  const paletteTriggerRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const loadPages = useCallback(async (signal?: AbortSignal) => {
    setListState('loading');
    setListError(null);

    try {
      const response = await fetchPages(signal);
      if (!signal?.aborted) {
        setPages(response.pages);
        setListState('ready');
      }
    } catch (error: unknown) {
      if (!signal?.aborted) {
        setListError(pageErrorMessage(error, 'The page list could not be loaded.'));
        setListState('error');
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadPages(controller.signal);

    return () => controller.abort();
  }, [loadPages, reloadKey]);

  useEffect(() => {
    if (listState !== 'ready') {
      return;
    }

    if (location.pathname === '/app' && pages.length > 0) {
      navigate(workspacePath(pages[0].id), { replace: true });
    }
  }, [listState, location.pathname, navigate, pages]);

  const createPage = useCallback(
    async (parentId: string | null = null) => {
      if (isCreating) {
        return;
      }

      setIsCreating(true);
      setActionError(null);
      try {
        const response = await createPageRequest({ parentId, title: 'Untitled' });
        setPages((currentPages) => [...currentPages, response.page]);
        navigate(workspacePath(response.page.id));
      } catch (error: unknown) {
        setActionError(pageErrorMessage(error, 'The new page could not be created.'));
      } finally {
        setIsCreating(false);
      }
    },
    [isCreating, navigate],
  );

  const openPalette = useCallback(() => {
    if (isPaletteOpen) {
      return;
    }

    const activeElement = document.activeElement;
    paletteReturnFocusRef.current =
      activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : paletteTriggerRef.current;
    setActionError(null);
    setIsPaletteOpen(true);
  }, [isPaletteOpen]);

  const closePalette = useCallback(() => {
    setIsPaletteOpen(false);
  }, []);

  useEffect(() => {
    if (isPaletteOpen || paletteReturnFocusRef.current === null) {
      return;
    }

    const returnFocusElement = paletteReturnFocusRef.current;
    paletteReturnFocusRef.current = null;
    if (returnFocusElement.isConnected) {
      returnFocusElement.focus({ preventScroll: true });
    } else {
      paletteTriggerRef.current?.focus({ preventScroll: true });
    }
  }, [isPaletteOpen]);

  useEffect(() => {
    function handleGlobalShortcut(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }

      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openPalette();
      } else if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        closePalette();
        void createPage();
      }
    }

    window.addEventListener('keydown', handleGlobalShortcut);
    return () => window.removeEventListener('keydown', handleGlobalShortcut);
  }, [closePalette, createPage, openPalette]);

  const onPageUpdated = useCallback((updatedPage: PageSummary) => {
    setPages((currentPages) =>
      currentPages.map((page) => (page.id === updatedPage.id ? updatedPage : page)),
    );
  }, []);

  const deletePage = useCallback(
    async (page: PageDetail) => {
      await deletePageRequest(page.id, page.revision);
      setPages((currentPages) => currentPages.filter((currentPage) => currentPage.id !== page.id));
      navigate('/app', { replace: true });
    },
    [navigate],
  );

  const refreshPages = useCallback(async () => {
    await loadPages();
  }, [loadPages]);

  const exportPages = useCallback(async () => {
    if (isExporting) {
      return;
    }

    setIsExporting(true);
    setActionError(null);
    try {
      await downloadKnowledgeBaseExport();
    } catch (error: unknown) {
      setActionError(
        `Export failed: ${pageErrorMessage(error, 'The export could not be downloaded.')}`,
      );
    } finally {
      setIsExporting(false);
    }
  }, [isExporting]);

  const retryPages = useCallback(() => setReloadKey((value) => value + 1), []);
  const context: WorkspaceOutletContext = {
    actionError,
    createPage,
    deletePage,
    isCreating,
    listError,
    listState,
    onPageUpdated,
    pages,
    refreshPages,
    retryPages,
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="brand" to="/app">
          <span className="brand-mark" aria-hidden="true">
            D
          </span>
          <span>Dovari</span>
        </Link>
        <div className="header-actions">
          <span className="phase-label">Your knowledge base</span>
          <button
            aria-haspopup="dialog"
            aria-keyshortcuts="Control+K Meta+K"
            aria-label="Open command palette"
            className="palette-trigger"
            onClick={openPalette}
            ref={paletteTriggerRef}
            type="button"
          >
            <span aria-hidden="true">⌕</span>
            <span>Search</span>
            <kbd>⌘K</kbd>
          </button>
        </div>
      </header>
      {actionError ? (
        <div className="workspace-notice" role="alert">
          <span>{actionError}</span>
          <button
            className="button button-quiet"
            onClick={() => setActionError(null)}
            type="button"
          >
            Dismiss
          </button>
        </div>
      ) : null}
      <div className="app-workspace">
        <Sidebar
          error={listError}
          isExporting={isExporting}
          isCreating={isCreating}
          onCreate={() => void createPage(null)}
          onCreateChild={(parentId) => void createPage(parentId)}
          onExport={() => void exportPages()}
          onPageUpdated={onPageUpdated}
          onPagesChanged={refreshPages}
          onRetry={retryPages}
          pages={pages}
          state={listState}
        />
        <main className="app-content" id="main-content">
          <Outlet context={context} />
        </main>
      </div>
      {isPaletteOpen ? (
        <CommandPalette
          canCreatePage={listState === 'ready'}
          isCreating={isCreating}
          onClose={closePalette}
          onCreatePage={() => void createPage()}
          onOpenPage={(url) => navigate(url)}
          onPlaceholderAction={setActionError}
        />
      ) : null}
    </div>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Workspace />} path="/app">
        <Route element={<WorkspaceLanding />} index />
        <Route element={<PageRoute />} path="pages/:pageId" />
      </Route>
      <Route element={<Navigate replace to="/app" />} path="/" />
      <Route element={<Navigate replace to="/app" />} path="*" />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
