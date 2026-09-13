import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/core';

import type { PageSummary, TiptapDocument } from '../../../../shared/pages';
import type { UploadAsset } from '../../assets/api';
import { createPage, searchWikiLinkPages, type PageApiError } from '../api';
import { EditorToolbar } from './EditorToolbar';
import {
  createPageEditorExtensions,
  safeEditorDocument,
  serializeEditorDocument,
} from './editorExtensions';
import { AssetUploadController } from './assetUpload';
import {
  findWikiLinkQuery,
  normalizedWikiLinkQuery,
  type WikiLinkQuery,
  wikiLinkTitle,
} from './wikiLinks';

export interface PageEditorProps {
  content: TiptapDocument;
  onChange?: (content: TiptapDocument) => void;
  pageId?: string;
  onNavigateToPage?: (pageId: string) => void;
  onPageCreated?: (page: PageSummary) => void;
  toolbarAccessory?: ReactNode;
  createWikiLinkPage?: typeof createPage;
  searchWikiLinkPages?: typeof searchWikiLinkPages;
  uploadAsset?: UploadAsset;
}

interface WikiLinkSession extends WikiLinkQuery {
  left: number;
  top: number;
}

function containsControlCharacters(value: string) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function sameWikiLinkSession(left: WikiLinkSession | null, right: WikiLinkSession | null) {
  return (
    left?.from === right?.from &&
    left?.to === right?.to &&
    left?.query === right?.query &&
    left?.left === right?.left &&
    left?.top === right?.top
  );
}

function createWikiLinkNode(editor: Editor, session: WikiLinkSession, page: PageSummary) {
  const nodeType = editor.state.schema.nodes.wikiLink;
  if (!nodeType) {
    return false;
  }

  const node = nodeType.create({ targetPageId: page.id, targetTitle: page.title });
  const transaction = editor.state.tr.replaceWith(session.from, session.to, node);
  editor.view.dispatch(transaction.scrollIntoView());
  editor.view.focus();
  return true;
}

function pageErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as PageApiError).message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }

  return 'The page could not be created.';
}

export function PageEditor({
  content,
  createWikiLinkPage = createPage,
  onChange,
  onNavigateToPage,
  onPageCreated,
  pageId,
  searchWikiLinkPages: searchWikiLinkPagesRequest = searchWikiLinkPages,
  toolbarAccessory,
  uploadAsset,
}: PageEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [wikiLinkSession, setWikiLinkSession] = useState<WikiLinkSession | null>(null);
  const [wikiLinkPages, setWikiLinkPages] = useState<PageSummary[]>([]);
  const [wikiLinkActiveIndex, setWikiLinkActiveIndex] = useState(0);
  const [wikiLinkError, setWikiLinkError] = useState<string | null>(null);
  const [isSearchingWikiLinks, setIsSearchingWikiLinks] = useState(false);
  const [isCreatingWikiLink, setIsCreatingWikiLink] = useState(false);
  const assetUpload = useMemo(
    () => new AssetUploadController({ pageId, upload: uploadAsset }),
    [pageId, uploadAsset],
  );
  const extensions = useMemo(() => createPageEditorExtensions({ assetUpload }), [assetUpload]);
  const initialContent = useMemo(() => safeEditorDocument(content), [content]);

  const updateWikiLinkSession = useCallback((currentEditor: Editor) => {
    const query = findWikiLinkQuery(currentEditor);
    if (!query) {
      setWikiLinkSession((current) => (current === null ? current : null));
      return;
    }

    let left = 24;
    let top = 180;
    try {
      const coordinates = currentEditor.view.coordsAtPos(query.to);
      left = Math.max(12, coordinates.left);
      top = Math.max(12, coordinates.bottom + 6);
    } catch {
      // JSDOM and some embedded editor hosts do not expose layout coordinates.
    }

    const next: WikiLinkSession = { ...query, left, top };
    setWikiLinkSession((current) => (sameWikiLinkSession(current, next) ? current : next));
  }, []);

  const editor = useEditor(
    {
      content: initialContent,
      editorProps: {
        attributes: {
          'aria-label': 'Page content',
          'aria-multiline': 'true',
          class: 'page-editor-content',
          role: 'textbox',
          spellcheck: 'true',
        },
      },
      extensions,
      immediatelyRender: false,
      onUpdate: ({ editor: currentEditor }) => {
        const serialized = serializeEditorDocument(currentEditor.getJSON());
        if (serialized) {
          onChangeRef.current?.(serialized);
        }
        updateWikiLinkSession(currentEditor);
      },
      onSelectionUpdate: ({ editor: currentEditor }) => {
        updateWikiLinkSession(currentEditor);
      },
    },
    [extensions, updateWikiLinkSession],
  );

  const normalizedQuery = normalizedWikiLinkQuery(wikiLinkSession?.query ?? '');
  const linkTitle = wikiLinkTitle(wikiLinkSession?.query ?? '');
  const hasExactPage = wikiLinkPages.some(
    (page) => normalizedWikiLinkQuery(page.title) === normalizedQuery,
  );
  const canCreatePage =
    linkTitle.length > 0 &&
    linkTitle.length <= 200 &&
    !hasExactPage &&
    !containsControlCharacters(linkTitle);
  const wikiLinkOptions = [
    ...wikiLinkPages.map((page) => ({ kind: 'page' as const, page })),
    ...(canCreatePage ? [{ kind: 'create' as const, title: linkTitle }] : []),
  ];

  useEffect(() => {
    if (wikiLinkSession === null) {
      setWikiLinkPages([]);
      setWikiLinkError(null);
      setIsSearchingWikiLinks(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setWikiLinkPages([]);
    setIsSearchingWikiLinks(true);
    setWikiLinkError(null);
    setWikiLinkActiveIndex(0);

    searchWikiLinkPagesRequest(wikiLinkSession.query, controller.signal)
      .then((response) => {
        if (active) {
          setWikiLinkPages(response.pages);
        }
      })
      .catch((error: unknown) => {
        if (active && !controller.signal.aborted) {
          setWikiLinkPages([]);
          setWikiLinkError(pageErrorMessage(error));
        }
      })
      .finally(() => {
        if (active) {
          setIsSearchingWikiLinks(false);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [searchWikiLinkPagesRequest, wikiLinkSession?.query]);

  function dismissWikiLinkAutocomplete() {
    setWikiLinkSession(null);
    setWikiLinkError(null);
  }

  function selectWikiLinkPage(page: PageSummary, session = wikiLinkSession) {
    if (!editor || !session) {
      return;
    }

    if (createWikiLinkNode(editor, session, page)) {
      dismissWikiLinkAutocomplete();
    }
  }

  async function createAndSelectWikiLink(title: string, session = wikiLinkSession) {
    if (!session || isCreatingWikiLink) {
      return;
    }

    setIsCreatingWikiLink(true);
    setWikiLinkError(null);
    try {
      const response = await createWikiLinkPage({ parentId: null, title });
      onPageCreated?.(response.page);
      selectWikiLinkPage(response.page, session);
    } catch (error: unknown) {
      setWikiLinkError(pageErrorMessage(error));
    } finally {
      setIsCreatingWikiLink(false);
    }
  }

  function handleEditorKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (!wikiLinkSession || !editor) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      dismissWikiLinkAutocomplete();
    } else if (wikiLinkOptions.length === 0) {
      return;
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setWikiLinkActiveIndex((current) => (current + 1) % wikiLinkOptions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setWikiLinkActiveIndex(
        (current) => (current - 1 + wikiLinkOptions.length) % wikiLinkOptions.length,
      );
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      const option = wikiLinkOptions[wikiLinkActiveIndex];
      if (!option) {
        return;
      }
      event.preventDefault();
      if (option.kind === 'page') {
        selectWikiLinkPage(option.page);
      } else {
        void createAndSelectWikiLink(option.title);
      }
    }
  }

  function handleEditorClick(event: React.MouseEvent<HTMLElement>) {
    if (!onNavigateToPage) {
      return;
    }

    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-dovari-wiki-link-id]')
        : null;
    const targetPageId = target?.dataset.dovariWikiLinkId;
    if (targetPageId) {
      event.preventDefault();
      onNavigateToPage(targetPageId);
    }
  }

  useEffect(() => () => assetUpload.dispose(), [assetUpload]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const currentContent = serializeEditorDocument(editor.getJSON());
    if (currentContent && JSON.stringify(currentContent) === JSON.stringify(content)) {
      return;
    }

    editor.commands.setContent(safeEditorDocument(content), { emitUpdate: false });
  }, [content, editor]);

  return (
    <section
      aria-label="Page editor"
      className="page-editor"
      onClick={handleEditorClick}
      onKeyDownCapture={handleEditorKeyDown}
    >
      {editor ? (
        <>
          <div className="page-editor-topbar">
            <EditorToolbar editor={editor} />
            {toolbarAccessory}
          </div>
          <div className="page-editor-surface">
            <EditorContent editor={editor} />
          </div>
          {wikiLinkSession ? (
            <div
              aria-label="Wiki link suggestions"
              className="wiki-link-autocomplete"
              role="listbox"
              style={{ left: wikiLinkSession.left, top: wikiLinkSession.top }}
            >
              {isSearchingWikiLinks ? (
                <p className="wiki-link-autocomplete-state">Searching pages…</p>
              ) : null}
              {!isSearchingWikiLinks && wikiLinkOptions.length === 0 && !wikiLinkError ? (
                <p className="wiki-link-autocomplete-state">No matching pages.</p>
              ) : null}
              {wikiLinkOptions.map((option, index) =>
                option.kind === 'page' ? (
                  <button
                    aria-selected={index === wikiLinkActiveIndex}
                    className={
                      index === wikiLinkActiveIndex
                        ? 'wiki-link-option is-active'
                        : 'wiki-link-option'
                    }
                    key={option.page.id}
                    onClick={() => selectWikiLinkPage(option.page)}
                    onMouseDown={(event) => event.preventDefault()}
                    role="option"
                    type="button"
                  >
                    <span>{option.page.title}</span>
                    <small>/{option.page.slug}</small>
                  </button>
                ) : (
                  <button
                    aria-selected={index === wikiLinkActiveIndex}
                    className={
                      index === wikiLinkActiveIndex
                        ? 'wiki-link-option is-active wiki-link-create-option'
                        : 'wiki-link-option wiki-link-create-option'
                    }
                    key="create-page"
                    onClick={() => void createAndSelectWikiLink(option.title)}
                    onMouseDown={(event) => event.preventDefault()}
                    role="option"
                    type="button"
                  >
                    <span>Create “{option.title}”</span>
                  </button>
                ),
              )}
              {wikiLinkError ? (
                <p className="wiki-link-autocomplete-error" role="alert">
                  {wikiLinkError}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <p className="page-editor-loading" role="status">
          Loading editor…
        </p>
      )}
    </section>
  );
}
