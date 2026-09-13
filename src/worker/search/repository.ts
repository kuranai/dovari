import { SEARCH_SNIPPET_MAX_TOKENS, type SearchRequest } from '../../shared/search';

export interface SearchPageMatch {
  id: string;
  title: string;
  slug: string;
  parentId: string | null;
  snippet: string;
}

export interface SearchTreePage {
  id: string;
  title: string;
  slug: string;
  parentId: string | null;
}

interface SearchPageDatabaseRow {
  id: string;
  title: string;
  slug: string;
  parent_id: string | null;
  snippet: string;
}

interface SearchTreeDatabaseRow {
  id: string;
  title: string;
  slug: string;
  parent_id: string | null;
}

function toSearchPageMatch(row: SearchPageDatabaseRow): SearchPageMatch {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    parentId: row.parent_id,
    snippet: row.snippet,
  };
}

function toSearchTreePage(row: SearchTreeDatabaseRow): SearchTreePage {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    parentId: row.parent_id,
  };
}

export class SearchRepository {
  constructor(private readonly db: D1Database) {}

  async findMatches(matchQuery: string, request: SearchRequest) {
    const result = await this.db
      .prepare(
        `SELECT
           pages.id,
           pages.title,
           pages.slug,
           pages.parent_id,
           snippet(pages_fts, -1, '<mark>', '</mark>', '…', ${SEARCH_SNIPPET_MAX_TOKENS}) AS snippet
         FROM pages_fts
         INNER JOIN pages ON pages.search_id = pages_fts.rowid
         WHERE pages_fts MATCH ?
           AND pages.deleted_at IS NULL
         ORDER BY
           CASE WHEN pages.title COLLATE NOCASE = ? THEN 0 ELSE 1 END,
           bm25(pages_fts, 8.0, 1.0),
           pages.title COLLATE NOCASE,
           pages.id
         LIMIT ?`,
      )
      .bind(matchQuery, request.query, request.limit)
      .all<SearchPageDatabaseRow>();

    return result.results.map(toSearchPageMatch);
  }

  async listActiveTreePages() {
    const result = await this.db
      .prepare(
        `SELECT id, title, slug, parent_id
         FROM pages
         WHERE deleted_at IS NULL`,
      )
      .all<SearchTreeDatabaseRow>();

    return result.results.map(toSearchTreePage);
  }
}
