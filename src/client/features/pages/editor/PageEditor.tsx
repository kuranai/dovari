import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
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
import {
  LinkPopover,
  type EditorLinkSelection,
  type LinkPopoverMode,
  type LinkPopoverPosition,
} from './LinkPopover';
import { AssetUploadController } from './assetUpload';
import {
  findWikiLinkQuery,
  normalizedWikiLinkQuery,
  type WikiLinkQuery,
  wikiLinkTitle,
} from './wikiLinks';
import { WikiLinkPicker, type WikiLinkPickerOption } from './WikiLinkPicker';

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
  position: LinkPopoverPosition;
  source: 'autocomplete' | 'toolbar';
}

interface LinkPopoverSession extends EditorLinkSelection {
  mode: LinkPopoverMode;
  position: LinkPopoverPosition;
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
    left?.position.left === right?.position.left &&
    left?.position.top === right?.position.top &&
    left?.source === right?.source
  );
}

function popupPosition(editor: Editor, position: number): LinkPopoverPosition {
  let left = 24;
  let top = 180;
  try {
    const coordinates = editor.view.coordsAtPos(position);
    left = Math.max(12, coordinates.left);
    top = Math.max(12, coordinates.bottom + 8);
  } catch {
    // JSDOM and some embedded editor hosts do not expose layout coordinates.
  }

  if (typeof window !== 'undefined') {
    left = Math.min(left, Math.max(12, window.innerWidth - 380));
    top = Math.min(top, Math.max(12, window.innerHeight - 260));
  }

  return { left, top };
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
  const [linkPopoverSession, setLinkPopoverSession] = useState<LinkPopoverSession | null>(null);
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

    const next: WikiLinkSession = {
      ...query,
      position: popupPosition(currentEditor, query.to),
      source: 'autocomplete',
    };
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

  function editorSelectionForLink(link?: HTMLAnchorElement) {
    if (!editor) {
      return null;
    }

    if (link) {
      try {
        const linkPosition = editor.view.posAtDOM(link, 0);
        editor.chain().focus().setTextSelection(linkPosition).extendMarkRange('link').run();
      } catch {
        return null;
      }
    } else if (editor.isActive('link')) {
      editor.chain().focus().extendMarkRange('link').run();
    }

    return {
      from: editor.state.selection.from,
      to: editor.state.selection.to,
    };
  }

  function openLinkPopover(mode: LinkPopoverMode) {
    if (!editor) {
      return;
    }

    const selection = editorSelectionForLink();
    if (!selection) {
      return;
    }

    setWikiLinkSession(null);
    setLinkPopoverSession({
      ...selection,
      mode,
      position: popupPosition(editor, selection.to),
    });
  }

  function openWikiLinkPicker() {
    if (!editor) {
      return;
    }

    const selection = editor.state.selection;
    setLinkPopoverSession(null);
    setWikiLinkError(null);
    setWikiLinkSession({
      from: selection.from,
      position: popupPosition(editor, selection.to),
      query: '',
      source: 'toolbar',
      to: selection.to,
    });
  }

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

  function handleWikiLinkKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
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

  function handleEditorKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (!editor || !(event.target instanceof Node) || !editor.view.dom.contains(event.target)) {
      return;
    }

    handleWikiLinkKeyDown(event);
    if (event.defaultPrevented || wikiLinkSession) {
      return;
    }

    const wikiLinkTarget =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-dovari-wiki-link-id]')
        : null;
    const wikiLinkPageId = wikiLinkTarget?.dataset.dovariWikiLinkId;
    if (event.key === 'Enter' && wikiLinkPageId && onNavigateToPage) {
      event.preventDefault();
      onNavigateToPage(wikiLinkPageId);
      return;
    }

    if (event.key === 'Enter' && editor.isActive('link')) {
      event.preventDefault();
      openLinkPopover('view');
    }
  }

  function handleEditorClick(event: React.MouseEvent<HTMLElement>) {
    if (!editor || !(event.target instanceof Element)) {
      return;
    }

    const target = event.target.closest<HTMLElement>('[data-dovari-wiki-link-id]');
    const targetPageId = target?.dataset.dovariWikiLinkId;
    if (targetPageId) {
      if (onNavigateToPage) {
        event.preventDefault();
        onNavigateToPage(targetPageId);
      }
      return;
    }

    const link = event.target.closest<HTMLAnchorElement>('a[href]');
    if (
      !link ||
      !editor.view.dom.contains(link) ||
      link.classList.contains('asset-attachment-node')
    ) {
      return;
    }

    event.preventDefault();
    const selection = editorSelectionForLink(link);
    if (!selection) {
      return;
    }
    setWikiLinkSession(null);
    setLinkPopoverSession({
      ...selection,
      mode: 'view',
      position: popupPosition(editor, selection.to),
    });
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
            <EditorToolbar
              editor={editor}
              onOpenLink={() => openLinkPopover('edit')}
              onOpenWikiLink={openWikiLinkPicker}
            />
            {toolbarAccessory}
          </div>
          <div className="page-editor-surface">
            <EditorContent editor={editor} />
          </div>
          {wikiLinkSession ? (
            <WikiLinkPicker
              activeIndex={wikiLinkActiveIndex}
              error={wikiLinkError}
              isCreating={isCreatingWikiLink}
              isSearching={isSearchingWikiLinks}
              onCreatePage={(title) => void createAndSelectWikiLink(title)}
              onKeyDown={handleWikiLinkKeyDown}
              onQueryChange={(query) =>
                setWikiLinkSession((current) =>
                  current?.source === 'toolbar' ? { ...current, query } : current,
                )
              }
              onSelectPage={selectWikiLinkPage}
              options={wikiLinkOptions as WikiLinkPickerOption[]}
              position={wikiLinkSession.position}
              query={wikiLinkSession.query}
              source={wikiLinkSession.source}
            />
          ) : null}
          {linkPopoverSession ? (
            <LinkPopover
              editor={editor}
              initialMode={linkPopoverSession.mode}
              key={`${linkPopoverSession.from}-${linkPopoverSession.to}-${linkPopoverSession.mode}`}
              onClose={() => {
                setLinkPopoverSession(null);
                editor.view.focus();
              }}
              position={linkPopoverSession.position}
              selection={linkPopoverSession}
            />
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
