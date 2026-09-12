import { desc, sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { emptyDocument } from '../../shared/pages';

export { emptyDocument };

export const pages = sqliteTable(
  'pages',
  {
    searchId: integer('search_id').primaryKey({ autoIncrement: true }),
    id: text('id').notNull().unique(),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    contentJson: text('content_json').notNull().default(emptyDocument),
    contentText: text('content_text').notNull().default(''),
    parentId: text('parent_id'),
    position: integer('position').notNull().default(0),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    uniqueIndex('pages_slug_unique').on(sql`${table.slug} COLLATE NOCASE`),
    index('pages_parent_position').on(table.parentId, table.position, table.title),
    index('pages_updated_at').on(desc(table.updatedAt)),
    index('pages_deleted_at').on(table.deletedAt),
    check('pages_title_length', sql`length(${table.title}) BETWEEN 1 AND 200`),
    check('pages_position_nonnegative', sql`${table.position} >= 0`),
    check('pages_revision_positive', sql`${table.revision} > 0`),
    check(
      'pages_parent_not_self',
      sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`,
    ),
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: 'pages_parent_id_fkey',
    }).onDelete('set null'),
  ],
);

export const assets = sqliteTable(
  'assets',
  {
    id: text('id').primaryKey(),
    objectKey: text('object_key').notNull().unique(),
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    width: integer('width'),
    height: integer('height'),
    sha256: text('sha256'),
    uploadedForPageId: text('uploaded_for_page_id'),
    createdAt: text('created_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    index('assets_uploaded_for_page').on(table.uploadedForPageId, table.createdAt),
    check('assets_size_nonnegative', sql`${table.sizeBytes} >= 0`),
    check('assets_width_positive', sql`${table.width} IS NULL OR ${table.width} > 0`),
    check('assets_height_positive', sql`${table.height} IS NULL OR ${table.height} > 0`),
    foreignKey({
      columns: [table.uploadedForPageId],
      foreignColumns: [pages.id],
      name: 'assets_uploaded_for_page_id_fkey',
    }).onDelete('set null'),
  ],
);

export const pageAssets = sqliteTable(
  'page_assets',
  {
    pageId: text('page_id').notNull(),
    assetId: text('asset_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.pageId, table.assetId] }),
    index('page_assets_asset').on(table.assetId),
    foreignKey({
      columns: [table.pageId],
      foreignColumns: [pages.id],
      name: 'page_assets_page_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.assetId],
      foreignColumns: [assets.id],
      name: 'page_assets_asset_id_fkey',
    }).onDelete('cascade'),
  ],
);

export const pageLinks = sqliteTable(
  'page_links',
  {
    id: text('id').primaryKey(),
    sourcePageId: text('source_page_id').notNull(),
    targetPageId: text('target_page_id'),
    targetTitle: text('target_title').notNull(),
    targetTitleNormalized: text('target_title_normalized').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('page_links_source').on(table.sourcePageId),
    index('page_links_target').on(table.targetPageId),
    uniqueIndex('page_links_source_title').on(table.sourcePageId, table.targetTitleNormalized),
    foreignKey({
      columns: [table.sourcePageId],
      foreignColumns: [pages.id],
      name: 'page_links_source_page_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.targetPageId],
      foreignColumns: [pages.id],
      name: 'page_links_target_page_id_fkey',
    }).onDelete('set null'),
  ],
);

export type Page = typeof pages.$inferSelect;
export type NewPage = typeof pages.$inferInsert;
export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
export type PageAsset = typeof pageAssets.$inferSelect;
export type NewPageAsset = typeof pageAssets.$inferInsert;
export type PageLink = typeof pageLinks.$inferSelect;
export type NewPageLink = typeof pageLinks.$inferInsert;
