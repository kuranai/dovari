import type { WikiLinkReference } from '../../shared/pages';

export interface PageRecord {
  searchId: number;
  id: string;
  title: string;
  slug: string;
  contentJson: string;
  contentText: string;
  parentId: string | null;
  position: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface PageDatabaseRow {
  search_id: number;
  id: string;
  title: string;
  slug: string;
  content_json: string;
  content_text: string;
  parent_id: string | null;
  position: number;
  revision: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

const PAGE_COLUMNS = `
  search_id,
  id,
  title,
  slug,
  content_json,
  content_text,
  parent_id,
  position,
  revision,
  created_at,
  updated_at,
  deleted_at
`;

function toPageRecord(row: PageDatabaseRow): PageRecord {
  return {
    searchId: row.search_id,
    id: row.id,
    title: row.title,
    slug: row.slug,
    contentJson: row.content_json,
    contentText: row.content_text,
    parentId: row.parent_id,
    position: row.position,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export interface NewPageRecord {
  id: string;
  title: string;
  slug: string;
  contentJson: string;
  contentText: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PageTreeUpdate {
  id: string;
  parentId: string | null;
  position: number;
  revision: number;
  updatedAt: string;
}

export interface PageLinkRecord extends WikiLinkReference {
  id: string;
  createdAt: string;
}

export class PageRepository {
  constructor(private readonly db: D1Database) {}

  private treeUpdateStatement(update: PageTreeUpdate) {
    return this.db
      .prepare(
        `UPDATE pages
         SET parent_id = ?, position = ?, revision = revision + 1, updated_at = ?
         WHERE id = ? AND revision = ? AND deleted_at IS NULL`,
      )
      .bind(update.parentId, update.position, update.updatedAt, update.id, update.revision);
  }

  async listActive() {
    const result = await this.db
      .prepare(
        `SELECT ${PAGE_COLUMNS}
         FROM pages
         WHERE deleted_at IS NULL
         ORDER BY
           CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END,
           parent_id COLLATE NOCASE,
           position ASC,
           title COLLATE NOCASE,
           id
         LIMIT 100`,
      )
      .all<PageDatabaseRow>();

    return result.results.map(toPageRecord);
  }

  async findById(id: string, includeDeleted = false) {
    const deletedClause = includeDeleted ? '' : ' AND deleted_at IS NULL';
    const row = await this.db
      .prepare(`SELECT ${PAGE_COLUMNS} FROM pages WHERE id = ?${deletedClause}`)
      .bind(id)
      .first<PageDatabaseRow>();

    return row ? toPageRecord(row) : null;
  }

  async findBySlug(slug: string, excludeId?: string) {
    const excludeClause = excludeId === undefined ? '' : ' AND id <> ?';
    const statement = this.db
      .prepare(`SELECT id FROM pages WHERE slug COLLATE NOCASE = ?${excludeClause}`)
      .bind(...(excludeId === undefined ? [slug] : [slug, excludeId]));
    return statement.first<{ id: string }>();
  }

  async hasActiveParent(id: string) {
    const row = await this.db
      .prepare('SELECT id FROM pages WHERE id = ? AND deleted_at IS NULL')
      .bind(id)
      .first<{ id: string }>();
    return row !== null;
  }

  async listActiveChildren(parentId: string | null) {
    const parentClause = parentId === null ? 'parent_id IS NULL' : 'parent_id = ?';
    const statement = this.db.prepare(
      `SELECT ${PAGE_COLUMNS}
       FROM pages
       WHERE deleted_at IS NULL AND ${parentClause}
       ORDER BY position ASC, title COLLATE NOCASE, id`,
    );
    const result =
      parentId === null
        ? await statement.all<PageDatabaseRow>()
        : await statement.bind(parentId).all<PageDatabaseRow>();

    return result.results.map(toPageRecord);
  }

  async findActiveIds(ids: string[]) {
    if (ids.length === 0) {
      return new Set<string>();
    }

    const activeIds = new Set<string>();
    for (let offset = 0; offset < ids.length; offset += 900) {
      const chunk = ids.slice(offset, offset + 900);
      const placeholders = chunk.map(() => '?').join(', ');
      const result = await this.db
        .prepare(`SELECT id FROM pages WHERE deleted_at IS NULL AND id IN (${placeholders})`)
        .bind(...chunk)
        .all<{ id: string }>();
      result.results.forEach((row) => activeIds.add(row.id));
    }

    return activeIds;
  }

  async searchActiveTitles(query: string, limit: number) {
    const result = await this.db
      .prepare(
        `SELECT ${PAGE_COLUMNS}
         FROM pages
         WHERE deleted_at IS NULL
           AND instr(lower(title), lower(?)) > 0
         ORDER BY
           CASE WHEN lower(title) = lower(?) THEN 0
                WHEN lower(title) LIKE lower(?) || '%' THEN 1
                ELSE 2 END,
           title COLLATE NOCASE,
           id
         LIMIT ?`,
      )
      .bind(query, query, query, limit)
      .all<PageDatabaseRow>();

    return result.results.map(toPageRecord);
  }

  async listBacklinks(targetPageId: string) {
    const result = await this.db
      .prepare(
        `SELECT DISTINCT
           pages.search_id,
           pages.id,
           pages.title,
           pages.slug,
           pages.content_json,
           pages.content_text,
           pages.parent_id,
           pages.position,
           pages.revision,
           pages.created_at,
           pages.updated_at,
           pages.deleted_at
         FROM page_links
         INNER JOIN pages ON pages.id = page_links.source_page_id
         WHERE page_links.target_page_id = ?
           AND pages.deleted_at IS NULL
         ORDER BY pages.title COLLATE NOCASE, pages.id
         LIMIT 100`,
      )
      .bind(targetPageId)
      .all<PageDatabaseRow>();

    return result.results.map(toPageRecord);
  }

  async isInAncestorChain(startPageId: string, possibleAncestorId: string) {
    const row = await this.db
      .prepare(
        `WITH RECURSIVE ancestors(id, parent_id) AS (
           SELECT id, parent_id
           FROM pages
           WHERE id = ? AND deleted_at IS NULL
           UNION
           SELECT parent.id, parent.parent_id
           FROM pages AS parent
           INNER JOIN ancestors ON ancestors.parent_id = parent.id
           WHERE parent.deleted_at IS NULL
         )
         SELECT id
         FROM ancestors
         WHERE id = ?
         LIMIT 1`,
      )
      .bind(startPageId, possibleAncestorId)
      .first<{ id: string }>();

    return row !== null;
  }

  async updateTree(updates: PageTreeUpdate[]) {
    if (updates.length === 0) {
      return [];
    }

    const statements = updates.map((update) => this.treeUpdateStatement(update));

    return this.db.batch(statements);
  }

  async insert(page: NewPageRecord) {
    const parentFilter = page.parentId === null ? 'parent_id IS NULL' : 'parent_id = ?';
    const bindings =
      page.parentId === null
        ? [
            page.id,
            page.title,
            page.slug,
            page.contentJson,
            page.contentText,
            page.parentId,
            page.createdAt,
            page.updatedAt,
          ]
        : [
            page.id,
            page.title,
            page.slug,
            page.contentJson,
            page.contentText,
            page.parentId,
            page.createdAt,
            page.updatedAt,
            page.parentId,
          ];

    const result = await this.db
      .prepare(
        `INSERT INTO pages
          (id, title, slug, content_json, content_text, parent_id, position, revision, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, COALESCE(MAX(position) + 1, 0), 1, ?, ?
         FROM pages
         WHERE deleted_at IS NULL AND ${parentFilter}`,
      )
      .bind(...bindings)
      .run();

    return result.meta.changes;
  }

  async updateMetadata(
    id: string,
    baseRevision: number,
    values: { title: string; slug: string; updatedAt: string },
  ) {
    const result = await this.db
      .prepare(
        `UPDATE pages
         SET title = ?, slug = ?, revision = revision + 1, updated_at = ?
         WHERE id = ? AND revision = ? AND deleted_at IS NULL`,
      )
      .bind(values.title, values.slug, values.updatedAt, id, baseRevision)
      .run();

    return result.meta.changes;
  }

  async updateContent(
    id: string,
    baseRevision: number,
    values: {
      contentJson: string;
      contentText: string;
      updatedAt: string;
      assetIds: string[];
      wikiLinks?: PageLinkRecord[];
    },
  ) {
    const nextRevision = baseRevision + 1;
    const saveMarker = `
      id = ?
      AND revision = ?
      AND updated_at = ?
      AND content_json = ?
      AND deleted_at IS NULL
    `;
    const statements = [
      this.db
        .prepare(
          `UPDATE pages
           SET content_json = ?, content_text = ?, revision = revision + 1, updated_at = ?
           WHERE id = ? AND revision = ? AND deleted_at IS NULL`,
        )
        .bind(values.contentJson, values.contentText, values.updatedAt, id, baseRevision),
      this.db
        .prepare(
          `DELETE FROM page_assets
           WHERE page_id = ?
             AND EXISTS (
               SELECT 1 FROM pages
               WHERE ${saveMarker}
             )`,
        )
        .bind(id, id, nextRevision, values.updatedAt, values.contentJson),
      ...values.assetIds.map((assetId) =>
        this.db
          .prepare(
            `INSERT INTO page_assets (page_id, asset_id)
             SELECT ?, ?
             WHERE EXISTS (
               SELECT 1 FROM pages
               WHERE ${saveMarker}
             )
             AND EXISTS (SELECT 1 FROM assets WHERE id = ?)`,
          )
          .bind(id, assetId, id, nextRevision, values.updatedAt, values.contentJson, assetId),
      ),
      this.db
        .prepare(
          `DELETE FROM page_links
           WHERE source_page_id = ?
             AND EXISTS (
               SELECT 1 FROM pages
               WHERE ${saveMarker}
             )`,
        )
        .bind(id, id, nextRevision, values.updatedAt, values.contentJson),
      ...(values.wikiLinks ?? []).map((link) =>
        this.db
          .prepare(
            `INSERT INTO page_links
              (id, source_page_id, target_page_id, target_title, target_title_normalized, created_at)
             SELECT ?, ?, ?, ?, ?, ?
             WHERE EXISTS (
               SELECT 1 FROM pages
               WHERE ${saveMarker}
             )`,
          )
          .bind(
            link.id,
            id,
            link.targetPageId,
            link.targetTitle,
            link.targetTitleNormalized,
            link.createdAt,
            id,
            nextRevision,
            values.updatedAt,
            values.contentJson,
          ),
      ),
    ];

    const results = await this.db.batch(statements);
    return results[0]?.meta.changes ?? 0;
  }

  async softDelete(id: string, baseRevision?: number, deletedAt = new Date().toISOString()) {
    const revisionClause = baseRevision === undefined ? '' : ' AND revision = ?';
    const values =
      baseRevision === undefined
        ? [deletedAt, deletedAt, id]
        : [deletedAt, deletedAt, id, baseRevision];
    const result = await this.db
      .prepare(
        `UPDATE pages
         SET deleted_at = ?, revision = revision + 1, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL${revisionClause}`,
      )
      .bind(...values)
      .run();

    return result.meta.changes;
  }
}
