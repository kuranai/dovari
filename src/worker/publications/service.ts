import { canonicalJson } from '../../shared/backup';
import {
  collectAssetIds,
  collectWikiLinkReferences,
  tiptapDocumentSchema,
  type TiptapDocument,
  type TiptapNode,
} from '../../shared/pages';
import {
  collectPublicAssetIds,
  derivePublicPlainText,
  publicIdSchema,
  publicPublicationSchema,
  publicTiptapDocumentSchema,
  type PrivatePublication,
  type PublicPublication,
  type PublicPublicationSummary,
  type PublicTiptapDocument,
  type PublishPublicationRequest,
  type UnpublishPublicationRequest,
} from '../../shared/publications';
import { AssetRepository } from '../assets/repository';
import { PageRepository, type PageRecord } from '../pages/repository';
import { PublicationError } from './errors';
import {
  PublicationRepository,
  type PublicationCursor,
  type PublicationRecord,
} from './repository';

function pageNotFound() {
  return new PublicationError(404, 'PAGE_NOT_FOUND', 'Page not found.');
}

function publicationNotFound() {
  return new PublicationError(404, 'PUBLICATION_NOT_FOUND', 'Publication not found.');
}

function pageConflict(currentRevision: number) {
  return new PublicationError(409, 'PAGE_CONFLICT', 'The page changed in another tab.', {
    currentRevision,
  });
}

function publicationConflict() {
  return new PublicationError(
    409,
    'PUBLICATION_CONFLICT',
    'The publication changed in another tab.',
  );
}

function internalError() {
  return new PublicationError(500, 'INTERNAL_ERROR', 'Internal server error.');
}

function nowIso(after?: string) {
  const previous = after === undefined ? Number.NaN : Date.parse(after);
  const now = Date.now();
  const next = Number.isFinite(previous) ? Math.max(now, previous + 1) : now;
  return new Date(next).toISOString();
}

function encodeBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function decodeBase64Url(value: string) {
  try {
    if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
    const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(`${normalized}${padding}`);
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(binary, (character) => character.charCodeAt(0)),
    );
  } catch {
    return null;
  }
}

const publicationCursorShape = {
  timestamp: (value: unknown) => typeof value === 'string',
};

export function encodePublicationCursor(cursor: PublicationCursor) {
  return encodeBase64Url(JSON.stringify(cursor));
}

export function decodePublicationCursor(value: string): PublicationCursor | null {
  const decoded = decodeBase64Url(value);
  if (decoded === null) return null;
  try {
    const parsed = JSON.parse(decoded) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed) ||
      !publicationCursorShape.timestamp((parsed as Record<string, unknown>).timestamp) ||
      typeof (parsed as Record<string, unknown>).publicId !== 'string'
    ) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (
      Number.isNaN(Date.parse(record.timestamp as string)) ||
      !publicIdSchema.safeParse(record.publicId).success
    ) {
      return null;
    }
    return { publicId: record.publicId as string, timestamp: record.timestamp as string };
  } catch {
    return null;
  }
}

function parsePrivateContent(page: PageRecord): TiptapDocument {
  let value: unknown;
  try {
    value = JSON.parse(page.contentJson) as unknown;
  } catch {
    throw internalError();
  }
  const parsed = tiptapDocumentSchema.safeParse(value);
  if (!parsed.success) throw internalError();
  return parsed.data;
}

function assetFallback(node: TiptapNode) {
  const value = node.type === 'assetImage' ? node.attrs?.alt : node.attrs?.filename;
  return typeof value === 'string' ? value : '';
}

function sanitizePublicNode(
  node: TiptapNode,
  activeAssets: ReadonlySet<string>,
  targetPublications: ReadonlyMap<string, PublicationRecord>,
): TiptapNode {
  if (node.type === 'wikiLink') {
    const targetPageId = node.attrs?.targetPageId;
    const targetTitle = typeof node.attrs?.targetTitle === 'string' ? node.attrs.targetTitle : '';
    const target =
      typeof targetPageId === 'string' ? targetPublications.get(targetPageId) : undefined;
    if (!target) {
      return { type: 'text', text: targetTitle };
    }
    return {
      type: 'publicWikiLink',
      attrs: { targetPublicId: target.publicId, targetTitle },
    };
  }

  if (node.type === 'assetImage' || node.type === 'attachment') {
    const assetId = node.attrs?.assetId;
    if (typeof assetId !== 'string' || !activeAssets.has(assetId)) {
      return { type: 'text', text: assetFallback(node) };
    }
  }

  return {
    ...node,
    ...(node.content
      ? {
          content: node.content.map((child) =>
            sanitizePublicNode(child, activeAssets, targetPublications),
          ),
        }
      : {}),
  };
}

function sanitizePublicDocument(
  document: TiptapDocument,
  activeAssets: ReadonlySet<string>,
  targetPublications: ReadonlyMap<string, PublicationRecord>,
): PublicTiptapDocument {
  return {
    type: 'doc',
    content: document.content.map((node) =>
      sanitizePublicNode(node, activeAssets, targetPublications),
    ),
  };
}

function privatePublication(record: PublicationRecord): PrivatePublication {
  return {
    allowIndexing: record.allowIndexing,
    publicId: record.publicId,
    publicUrl: `/p/${encodeURIComponent(record.publicId)}`,
    publishedAt: record.publishedAt,
    publishedTitle: record.publishedTitle,
    sourceRevision: record.sourceRevision,
    updatedAt: record.updatedAt,
  };
}

function publicSummary(record: PublicationRecord): PublicPublicationSummary {
  return {
    allowIndexing: record.allowIndexing,
    parentPublicId: record.publishedParentPublicId,
    position: record.publishedPosition,
    publicId: record.publicId,
    publishedAt: record.publishedAt,
    publishedTitle: record.publishedTitle,
    updatedAt: record.updatedAt,
  };
}

function publicDetail(record: PublicationRecord): PublicPublication {
  let content: unknown;
  try {
    content = JSON.parse(record.publishedContentJson) as unknown;
  } catch {
    throw internalError();
  }
  const parsed = publicPublicationSchema.safeParse({ ...publicSummary(record), content });
  if (!parsed.success) throw internalError();
  return parsed.data;
}

function isConstraintError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /constraint|unique/i.test(message);
}

export class PublicationService {
  private readonly pages: PageRepository;
  private readonly assets: AssetRepository;
  private readonly publications: PublicationRepository;

  constructor(db: D1Database) {
    this.pages = new PageRepository(db);
    this.assets = new AssetRepository(db);
    this.publications = new PublicationRepository(db);
  }

  async getForPage(pageId: string) {
    const page = await this.pages.findById(pageId);
    if (!page) throw pageNotFound();
    const record = await this.publications.findByPageId(pageId);
    return { publication: record ? privatePublication(record) : null };
  }

  async publish(pageId: string, input: PublishPublicationRequest) {
    const page = await this.pages.findById(pageId);
    if (!page) throw pageNotFound();
    if (page.revision !== input.baseRevision) throw pageConflict(page.revision);

    const document = parsePrivateContent(page);
    const [assetRecords, targetPublications, existing, parentPublicId] = await Promise.all([
      this.assets.findActiveByIds(collectAssetIds(document)),
      this.publications.findActiveTargetsByPageIds(
        collectWikiLinkReferences(document).flatMap((link) =>
          link.targetPageId === null ? [] : [link.targetPageId],
        ),
      ),
      this.publications.findByPageId(pageId),
      this.publications.findNearestPublishedAncestor(pageId),
    ]);
    const activeAssets = new Set(assetRecords.map((asset) => asset.id));
    const snapshot = sanitizePublicDocument(document, activeAssets, targetPublications);
    if (!publicTiptapDocumentSchema.safeParse(snapshot).success) throw internalError();
    const snapshotAssetIds = collectPublicAssetIds(snapshot);
    const assetIds = new Set(assetRecords.map((asset) => asset.id));
    if (snapshotAssetIds.some((assetId) => !assetIds.has(assetId))) throw internalError();
    const publishedContentJson = canonicalJson(snapshot);
    const publishedContentText = derivePublicPlainText(snapshot);

    const timestamp = nowIso(existing?.updatedAt);
    const record = {
      allowIndexing: input.allowIndexing,
      assetIds: snapshotAssetIds,
      id: existing?.id ?? crypto.randomUUID(),
      pageId,
      publicId: existing?.publicId ?? crypto.randomUUID(),
      publishedAt: timestamp,
      publishedContentJson,
      publishedContentText,
      publishedTitle: page.title,
      publishedParentPublicId: parentPublicId,
      publishedPosition: page.position,
      sourceRevision: page.revision,
      updatedAt: timestamp,
    } as const;

    try {
      const changes = await this.publications.publish(record);
      if (changes < 1) {
        const latest = await this.pages.findById(pageId);
        if (!latest) throw pageNotFound();
        throw pageConflict(latest.revision);
      }
    } catch (error) {
      if (error instanceof PublicationError) throw error;
      if (isConstraintError(error)) throw publicationConflict();
      throw error;
    }

    const saved = await this.publications.findByPageId(pageId);
    if (!saved) throw internalError();
    return { publication: privatePublication(saved) };
  }

  async unpublish(pageId: string, input: UnpublishPublicationRequest) {
    const page = await this.pages.findById(pageId);
    if (!page) throw pageNotFound();
    const current = await this.publications.findByPageId(pageId);
    if (!current || current.publicId !== input.publicId) throw publicationConflict();
    const result = await this.publications.unpublish(input.publicId, input.expectedUpdatedAt);
    if (result.meta.changes < 1) throw publicationConflict();
    return { unpublished: true as const, publicId: input.publicId };
  }

  async resolveEditorTarget(publicId: string) {
    const record = await this.publications.findByPublicId(publicId);
    if (!record) throw publicationNotFound();
    return { pageId: record.pageId };
  }

  async listPublic(cursor: PublicationCursor | null, limit: number) {
    const records = await this.publications.listPublications(cursor, limit + 1);
    const visible = records.slice(0, limit);
    const last = visible.at(-1);
    return {
      nextCursor:
        records.length > limit && last
          ? encodePublicationCursor({ publicId: last.publicId, timestamp: last.updatedAt })
          : null,
      publications: visible.map(publicSummary),
    };
  }

  async listAllPublic() {
    return (await this.publications.listActivePublications()).map(publicSummary);
  }

  async getPublic(publicId: string) {
    const record = await this.publications.findByPublicId(publicId);
    if (!record) throw publicationNotFound();
    return { publication: publicDetail(record) };
  }

  async getPublicMetadata(publicId: string) {
    const record = await this.publications.findByPublicId(publicId);
    if (!record) throw publicationNotFound();
    let content: unknown;
    try {
      content = JSON.parse(record.publishedContentJson) as unknown;
    } catch {
      throw internalError();
    }
    const parsed = publicTiptapDocumentSchema.safeParse(content);
    if (!parsed.success) throw internalError();
    const description = derivePublicPlainText(parsed.data)
      .replace(/\s+/gu, ' ')
      .trim()
      .slice(0, 180);
    return {
      allowIndexing: record.allowIndexing,
      description,
      publicId: record.publicId,
      title: record.publishedTitle,
      updatedAt: record.updatedAt,
    };
  }

  async publicAsset(publicId: string, assetId: string) {
    const record = await this.publications.findByPublicId(publicId);
    if (!record) throw publicationNotFound();
    const content = publicDetail(record).content;
    if (!collectPublicAssetIds(content).includes(assetId)) throw publicationNotFound();
    const asset = await this.publications.findAsset(publicId, assetId);
    if (!asset) throw publicationNotFound();
    return asset;
  }

  async listPublicationAssets(publicationId: string) {
    return this.publications.listAssetIds(publicationId);
  }

  async listForBackup() {
    return this.publications.listAll();
  }
}
