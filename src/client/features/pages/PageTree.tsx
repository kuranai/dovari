import { NavLink } from 'react-router-dom';

import type { PageSummary } from '../../../shared/pages';

const ROOT_PARENT = '__root__';

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

interface PageTreeBranchProps {
  childrenMap: Map<string, PageSummary[]>;
  parentId: string;
  visited: Set<string>;
}

function PageTreeBranch({ childrenMap, parentId, visited }: PageTreeBranchProps) {
  const pages = childrenMap.get(parentId) ?? [];

  if (pages.length === 0) {
    return null;
  }

  return (
    <ul className="page-tree-list">
      {pages.map((page) => {
        if (visited.has(page.id)) {
          return null;
        }

        const nextVisited = new Set(visited).add(page.id);
        return (
          <li className="page-tree-item" key={page.id}>
            <NavLink
              className={({ isActive }) => `page-tree-link${isActive ? ' is-active' : ''}`}
              to={`/app/pages/${page.id}`}
            >
              <span className="page-tree-icon" aria-hidden="true">
                ◇
              </span>
              <span className="page-tree-title">{page.title}</span>
            </NavLink>
            <PageTreeBranch childrenMap={childrenMap} parentId={page.id} visited={nextVisited} />
          </li>
        );
      })}
    </ul>
  );
}

export interface PageTreeProps {
  pages: PageSummary[];
}

export function PageTree({ pages }: PageTreeProps) {
  const childrenMap = createChildrenMap(pages);

  return (
    <nav aria-label="Pages" className="page-tree">
      <PageTreeBranch childrenMap={childrenMap} parentId={ROOT_PARENT} visited={new Set()} />
    </nav>
  );
}
