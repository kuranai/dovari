import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from 'react';
import { NavLink } from 'react-router-dom';

import type { MovePageRequest, PageSummary } from '../../../shared/pages';
import { movePage as movePageRequest, pageErrorMessage, updatePageTitle } from './api';

const ROOT_PARENT = '__root__';

type DropPlacement = 'before' | 'into' | 'after';

function comparePages(first: PageSummary, second: PageSummary) {
  return (
    first.position - second.position ||
    first.title.localeCompare(second.title, undefined, { sensitivity: 'base' }) ||
    first.id.localeCompare(second.id)
  );
}

function parentKey(page: PageSummary, pageIds: Set<string>) {
  return page.parentId !== null && pageIds.has(page.parentId) ? page.parentId : ROOT_PARENT;
}

function createChildrenMap(pages: PageSummary[]) {
  const pageIds = new Set(pages.map((page) => page.id));
  const children = new Map<string, PageSummary[]>();

  for (const page of pages) {
    const key = parentKey(page, pageIds);
    const siblings = children.get(key) ?? [];
    siblings.push(page);
    children.set(key, siblings);
  }

  for (const siblings of children.values()) {
    siblings.sort(comparePages);
  }

  return children;
}

function descendantsOf(pageId: string, pages: PageSummary[]) {
  const descendants = new Set<string>();
  const pending = [pageId];

  while (pending.length > 0) {
    const parentId = pending.shift();
    if (parentId === undefined) {
      continue;
    }

    for (const page of pages) {
      if (page.parentId === parentId && !descendants.has(page.id)) {
        descendants.add(page.id);
        pending.push(page.id);
      }
    }
  }

  return descendants;
}

interface FlattenedPage {
  page: PageSummary;
  depth: number;
}

function flattenBranch(
  childrenMap: Map<string, PageSummary[]>,
  parentId: string,
  depth: number,
  visited: Set<string>,
): FlattenedPage[] {
  const flattened: FlattenedPage[] = [];
  for (const page of childrenMap.get(parentId) ?? []) {
    if (visited.has(page.id)) {
      continue;
    }

    const nextVisited = new Set(visited).add(page.id);
    flattened.push({ depth, page });
    flattened.push(...flattenBranch(childrenMap, page.id, depth + 1, nextVisited));
  }

  return flattened;
}

function pageSiblings(pages: PageSummary[], parentId: string | null, excludedId: string) {
  return pages
    .filter((page) => page.id !== excludedId && page.parentId === parentId)
    .sort(comparePages);
}

function dropPlacement(event: DragEvent<HTMLElement>): DropPlacement {
  const bounds = event.currentTarget.getBoundingClientRect();
  const offset = event.clientY - bounds.top;
  const ratio = bounds.height > 0 ? offset / bounds.height : 0.5;

  if (ratio < 0.3) {
    return 'before';
  }
  if (ratio > 0.7) {
    return 'after';
  }
  return 'into';
}

function moveRequestForDrop(page: PageSummary, placement: DropPlacement): MovePageRequest {
  if (placement === 'into') {
    return { parentId: page.id };
  }

  return placement === 'before'
    ? { beforeId: page.id, parentId: page.parentId }
    : { afterId: page.id, parentId: page.parentId };
}

function InlineRename({
  page,
  onCancel,
  onSaved,
}: {
  page: PageSummary;
  onCancel: () => void;
  onSaved: (page: PageSummary) => void;
}) {
  const [title, setTitle] = useState(page.title);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(page.title);
    setError(null);
  }, [page.title]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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
    <form className="page-tree-inline-form" onSubmit={handleSubmit}>
      <label htmlFor={`tree-title-${page.id}`}>Page title</label>
      <div className="page-tree-inline-row">
        <input
          autoFocus
          disabled={isSaving}
          id={`tree-title-${page.id}`}
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

function MovePanel({
  page,
  pages,
  error,
  onCancel,
  onMove,
}: {
  page: PageSummary;
  pages: PageSummary[];
  error: string | null;
  onCancel: () => void;
  onMove: (pageId: string, input: MovePageRequest) => Promise<boolean>;
}) {
  const childrenMap = useMemo(() => createChildrenMap(pages), [pages]);
  const descendants = useMemo(() => descendantsOf(page.id, pages), [page.id, pages]);
  const initialParentId =
    page.parentId !== null &&
    page.parentId !== page.id &&
    !descendants.has(page.parentId) &&
    pages.some((candidate) => candidate.id === page.parentId)
      ? page.parentId
      : '';
  const [parentId, setParentId] = useState(initialParentId);
  const [placement, setPlacement] = useState('end');
  const [isSaving, setIsSaving] = useState(false);

  const parentOptions = useMemo(
    () => [
      { depth: 0, id: '', title: 'Root' },
      ...flattenBranch(childrenMap, ROOT_PARENT, 0, new Set())
        .filter(({ page: candidate }) => candidate.id !== page.id && !descendants.has(candidate.id))
        .map(({ depth, page: candidate }) => ({
          depth: depth + 1,
          id: candidate.id,
          title: candidate.title,
        })),
    ],
    [childrenMap, descendants, page.id],
  );
  const siblings = useMemo(
    () => pageSiblings(pages, parentId === '' ? null : parentId, page.id),
    [page.id, pages, parentId],
  );
  const placementOptions = useMemo(
    () => [
      { label: 'At the end', value: 'end' },
      ...siblings.flatMap((sibling) => [
        { label: `Before ${sibling.title}`, value: `before:${sibling.id}` },
        { label: `After ${sibling.title}`, value: `after:${sibling.id}` },
      ]),
    ],
    [siblings],
  );

  useEffect(() => {
    if (!placementOptions.some((option) => option.value === placement)) {
      setPlacement('end');
    }
  }, [placement, placementOptions]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    const input: MovePageRequest = {
      parentId: parentId === '' ? null : parentId,
    };
    if (placement.startsWith('before:')) {
      input.beforeId = placement.slice('before:'.length);
    } else if (placement.startsWith('after:')) {
      input.afterId = placement.slice('after:'.length);
    }

    const moved = await onMove(page.id, input);
    setIsSaving(false);
    if (moved) {
      onCancel();
    }
  }

  return (
    <form className="page-tree-move-panel" onSubmit={handleSubmit}>
      <div className="page-tree-move-fields">
        <div>
          <label htmlFor={`tree-parent-${page.id}`}>Move destination</label>
          <select
            id={`tree-parent-${page.id}`}
            onChange={(event) => {
              setParentId(event.target.value);
              setPlacement('end');
            }}
            value={parentId}
          >
            {parentOptions.map((option) => (
              <option key={option.id || 'root'} value={option.id}>
                {option.depth > 0 ? `${'  '.repeat(option.depth)}↳ ` : ''}
                {option.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`tree-placement-${page.id}`}>Position</label>
          <select
            id={`tree-placement-${page.id}`}
            onChange={(event) => setPlacement(event.target.value)}
            value={placement}
          >
            {placementOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="page-tree-move-actions">
        <button className="button button-primary" disabled={isSaving} type="submit">
          {isSaving ? 'Moving…' : 'Move page'}
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
    </form>
  );
}

interface PageTreeBranchProps {
  childrenMap: Map<string, PageSummary[]>;
  collapsedIds: Set<string>;
  draggingPageId: string | null;
  editingPageId: string | null;
  movingPageId: string | null;
  onCreateChild: (parentId: string) => void;
  onDragEnd: () => void;
  onDragStart: (event: DragEvent<HTMLElement>, page: PageSummary) => void;
  onDrop: (event: DragEvent<HTMLElement>, page: PageSummary) => void;
  onDragOver: (event: DragEvent<HTMLElement>, page: PageSummary) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onMove: (pageId: string, input: MovePageRequest) => Promise<boolean>;
  onPageUpdated: (page: PageSummary) => void;
  onRename: (pageId: string) => void;
  onToggle: (pageId: string) => void;
  onMoveToggle: (pageId: string) => void;
  pages: PageSummary[];
  pendingMoveId: string | null;
  treeError: string | null;
  dropTarget: { pageId: string; placement: DropPlacement } | null;
  parentId: string;
  visited: Set<string>;
}

function PageTreeBranch({
  childrenMap,
  collapsedIds,
  draggingPageId,
  editingPageId,
  movingPageId,
  onCreateChild,
  onDragEnd,
  onDragStart,
  onDrop,
  onDragOver,
  onDragLeave,
  onMove,
  onPageUpdated,
  onRename,
  onToggle,
  onMoveToggle,
  pages,
  pendingMoveId,
  treeError,
  dropTarget,
  parentId,
  visited,
}: PageTreeBranchProps) {
  const pageItems = childrenMap.get(parentId) ?? [];

  if (pageItems.length === 0) {
    return null;
  }

  return (
    <ul className="page-tree-list">
      {pageItems.map((page) => {
        if (visited.has(page.id)) {
          return null;
        }

        const nextVisited = new Set(visited).add(page.id);
        const children = childrenMap.get(page.id) ?? [];
        const isCollapsed = collapsedIds.has(page.id);
        const isDragging = draggingPageId === page.id;
        const isDropTarget = dropTarget?.pageId === page.id;

        return (
          <li className="page-tree-item" key={page.id}>
            <div
              aria-label={`Drag ${page.title} to move it`}
              className={`page-tree-row${isDragging ? ' is-dragging' : ''}${
                isDropTarget ? ` is-drop-${dropTarget.placement}` : ''
              }`}
              draggable={pendingMoveId === null}
              onDragEnd={onDragEnd}
              onDragLeave={onDragLeave}
              onDragOver={(event) => onDragOver(event, page)}
              onDragStart={(event) => onDragStart(event, page)}
              onDrop={(event) => onDrop(event, page)}
            >
              {children.length > 0 ? (
                <button
                  aria-expanded={!isCollapsed}
                  aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${page.title}`}
                  className="page-tree-toggle"
                  onClick={() => onToggle(page.id)}
                  type="button"
                >
                  {isCollapsed ? '▸' : '▾'}
                </button>
              ) : (
                <span aria-hidden="true" className="page-tree-toggle-spacer" />
              )}
              <NavLink
                className={({ isActive }) => `page-tree-link${isActive ? ' is-active' : ''}`}
                to={`/app/pages/${page.id}`}
              >
                <span className="page-tree-icon" aria-hidden="true">
                  {page.isFavorite ? '★' : '◇'}
                </span>
                <span className="page-tree-title">{page.title}</span>
              </NavLink>
              <div className="page-tree-actions">
                <button
                  aria-label={`Create child of ${page.title}`}
                  className="page-tree-action"
                  disabled={pendingMoveId !== null}
                  onClick={() => onCreateChild(page.id)}
                  title={`Create child of ${page.title}`}
                  type="button"
                >
                  +
                </button>
                <button
                  aria-label={`Rename ${page.title}`}
                  className="page-tree-action"
                  disabled={pendingMoveId !== null}
                  onClick={() => onRename(page.id)}
                  title={`Rename ${page.title}`}
                  type="button"
                >
                  ✎
                </button>
                <button
                  aria-expanded={movingPageId === page.id}
                  aria-label={`Move ${page.title}`}
                  className="page-tree-action"
                  disabled={pendingMoveId !== null}
                  onClick={() => onMoveToggle(page.id)}
                  title={`Move ${page.title}`}
                  type="button"
                >
                  ↕
                </button>
              </div>
            </div>
            {editingPageId === page.id ? (
              <InlineRename
                onCancel={() => onRename('')}
                onSaved={(updatedPage) => {
                  onPageUpdated(updatedPage);
                  onRename('');
                }}
                page={page}
              />
            ) : null}
            {movingPageId === page.id ? (
              <MovePanel
                error={treeError}
                onCancel={() => onMoveToggle('')}
                onMove={onMove}
                page={page}
                pages={pages}
              />
            ) : null}
            {!isCollapsed ? (
              <PageTreeBranch
                childrenMap={childrenMap}
                collapsedIds={collapsedIds}
                draggingPageId={draggingPageId}
                editingPageId={editingPageId}
                movingPageId={movingPageId}
                onCreateChild={onCreateChild}
                onDragEnd={onDragEnd}
                onDragLeave={onDragLeave}
                onDragOver={onDragOver}
                onDragStart={onDragStart}
                onDrop={onDrop}
                onMove={onMove}
                onPageUpdated={onPageUpdated}
                onRename={onRename}
                onToggle={onToggle}
                onMoveToggle={onMoveToggle}
                pages={pages}
                pendingMoveId={pendingMoveId}
                treeError={treeError}
                dropTarget={dropTarget}
                parentId={page.id}
                visited={nextVisited}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export interface PageTreeProps {
  onCreateChild: (parentId: string) => void;
  onPageUpdated: (page: PageSummary) => void;
  onPagesChanged: () => Promise<void>;
  pages: PageSummary[];
}

export function PageTree({ onCreateChild, onPageUpdated, onPagesChanged, pages }: PageTreeProps) {
  const childrenMap = useMemo(() => createChildrenMap(pages), [pages]);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [draggingPageId, setDraggingPageId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    pageId: string;
    placement: DropPlacement;
  } | null>(null);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [movingPageId, setMovingPageId] = useState<string | null>(null);
  const [pendingMoveId, setPendingMoveId] = useState<string | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);

  useEffect(() => {
    const pageIds = new Set(pages.map((page) => page.id));
    setCollapsedIds((current) => {
      const next = new Set([...current].filter((id) => pageIds.has(id)));
      return next.size === current.size ? current : next;
    });
    setEditingPageId((current) => (current !== null && pageIds.has(current) ? current : null));
    setMovingPageId((current) => (current !== null && pageIds.has(current) ? current : null));
  }, [pages]);

  function handleRename(pageId: string) {
    setTreeError(null);
    setMovingPageId(null);
    setEditingPageId((current) => (current === pageId || pageId === '' ? null : pageId));
  }

  function handleMoveToggle(pageId: string) {
    setTreeError(null);
    setEditingPageId(null);
    setMovingPageId((current) => (current === pageId || pageId === '' ? null : pageId));
  }

  async function handleMove(pageId: string, input: MovePageRequest) {
    setPendingMoveId(pageId);
    setTreeError(null);
    try {
      const response = await movePageRequest(pageId, input);
      onPageUpdated(response.page);
      await onPagesChanged();
      return true;
    } catch (requestError) {
      setTreeError(pageErrorMessage(requestError, 'The page could not be moved.'));
      return false;
    } finally {
      setPendingMoveId(null);
    }
  }

  function handleDragStart(event: DragEvent<HTMLElement>, page: PageSummary) {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('button, input, select')) {
      event.preventDefault();
      return;
    }

    setTreeError(null);
    setDraggingPageId(page.id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', page.id);
  }

  function handleDragOver(event: DragEvent<HTMLElement>, page: PageSummary) {
    const sourceId = draggingPageId ?? event.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === page.id) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget({ pageId: page.id, placement: dropPlacement(event) });
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) {
      return;
    }
    setDropTarget(null);
  }

  function handleDrop(event: DragEvent<HTMLElement>, page: PageSummary) {
    event.preventDefault();
    event.stopPropagation();
    const sourceId = draggingPageId ?? event.dataTransfer.getData('text/plain');
    const placement = dropTarget?.pageId === page.id ? dropTarget.placement : dropPlacement(event);
    setDropTarget(null);
    setDraggingPageId(null);

    if (!sourceId || sourceId === page.id) {
      return;
    }

    if (descendantsOf(sourceId, pages).has(page.id)) {
      setTreeError('A page cannot be moved into itself or one of its child pages.');
      return;
    }

    void handleMove(sourceId, moveRequestForDrop(page, placement));
  }

  function handleDragEnd() {
    setDraggingPageId(null);
    setDropTarget(null);
  }

  return (
    <nav aria-label="Pages" className="page-tree">
      {treeError && pendingMoveId === null ? (
        <p className="page-tree-error" role="alert">
          {treeError}
        </p>
      ) : null}
      <PageTreeBranch
        childrenMap={childrenMap}
        collapsedIds={collapsedIds}
        draggingPageId={draggingPageId}
        editingPageId={editingPageId}
        movingPageId={movingPageId}
        onCreateChild={onCreateChild}
        onDragEnd={handleDragEnd}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDragStart={handleDragStart}
        onDrop={handleDrop}
        onMove={handleMove}
        onPageUpdated={onPageUpdated}
        onRename={handleRename}
        onToggle={(pageId) => {
          setCollapsedIds((current) => {
            const next = new Set(current);
            if (next.has(pageId)) {
              next.delete(pageId);
            } else {
              next.add(pageId);
            }
            return next;
          });
        }}
        onMoveToggle={handleMoveToggle}
        pages={pages}
        pendingMoveId={pendingMoveId}
        treeError={treeError}
        dropTarget={dropTarget}
        parentId={ROOT_PARENT}
        visited={new Set()}
      />
    </nav>
  );
}
