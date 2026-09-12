import {
  derivePlainText,
  estimatePageRowBytes,
  emptyDocument,
  MAX_PAGE_ROW_BYTES,
  PAGE_SLUG_MAX_LENGTH,
  tiptapDocumentSchema,
  type CreatePageRequest,
  type DeletePageRequest,
  type MovePageRequest,
  type PageDetail,
  type PageSummary,
  type TiptapDocument,
  type UpdatePageContentRequest,
  type UpdatePageRequest,
} from '../../shared/pages';
import { PageError } from './errors';
import { PageRepository, type PageRecord, type PageTreeUpdate } from './repository';

const MAX_SLUG_ATTEMPTS = 1_000;

function isConstraintError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /constraint|unique/i.test(message);
}

function timestamp(after?: string) {
  const previous = after === undefined ? Number.NaN : Date.parse(after);
  const now = Date.now();
  const next = Number.isFinite(previous) ? Math.max(now, previous + 1) : now;
  return new Date(next).toISOString();
}

export function slugifyPageTitle(title: string) {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, PAGE_SLUG_MAX_LENGTH)
    .replace(/-+$/g, '');

  return slug || 'page';
}

function slugWithSuffix(base: string, suffix: number) {
  if (suffix === 1) {
    return base;
  }

  const suffixText = `-${suffix}`;
  const availableBaseLength = PAGE_SLUG_MAX_LENGTH - suffixText.length;
  const truncatedBase = base.slice(0, availableBaseLength).replace(/-+$/g, '') || 'page';
  return `${truncatedBase}${suffixText}`;
}

function pageNotFound() {
  return new PageError(404, 'PAGE_NOT_FOUND', 'Page not found.');
}

function pageConflict(current: PageRecord) {
  return new PageError(409, 'PAGE_CONFLICT', 'The page changed in another tab.', {
    currentRevision: current.revision,
  });
}

function toSummary(page: PageRecord): PageSummary {
  return {
    id: page.id,
    title: page.title,
    slug: page.slug,
    parentId: page.parentId,
    position: page.position,
    revision: page.revision,
    updatedAt: page.updatedAt,
  };
}

function parseStoredContent(page: PageRecord): TiptapDocument {
  let value: unknown;
  try {
    value = JSON.parse(page.contentJson) as unknown;
  } catch {
    throw new PageError(500, 'INTERNAL_ERROR', 'Internal server error.');
  }

  const parsed = tiptapDocumentSchema.safeParse(value);
  if (!parsed.success) {
    throw new PageError(500, 'INTERNAL_ERROR', 'Internal server error.');
  }

  return parsed.data;
}

function toDetail(page: PageRecord): PageDetail {
  return {
    ...toSummary(page),
    content: parseStoredContent(page),
    contentText: page.contentText,
    createdAt: page.createdAt,
    deletedAt: page.deletedAt,
  };
}

export class PageService {
  constructor(private readonly repository: PageRepository) {}

  private async normalizeSiblings(parentId: string | null, siblings?: PageRecord[]) {
    const currentSiblings = siblings ?? (await this.repository.listActiveChildren(parentId));
    const updates: PageTreeUpdate[] = currentSiblings.flatMap((page, position) =>
      page.position === position
        ? []
        : [
            {
              id: page.id,
              parentId,
              position,
              revision: page.revision,
              updatedAt: timestamp(page.updatedAt),
            },
          ],
    );

    if (updates.length === 0) {
      return;
    }

    await this.repository.updateTree(updates);
    const normalized = await this.repository.listActiveChildren(parentId);
    if (
      normalized.length !== currentSiblings.length ||
      normalized.some(
        (page, position) => page.id !== currentSiblings[position]?.id || page.position !== position,
      )
    ) {
      throw new PageError(409, 'PAGE_CONFLICT', 'The page tree changed in another tab.');
    }
  }

  async list(): Promise<PageSummary[]> {
    const pages = await this.repository.listActive();
    return pages.map(toSummary);
  }

  async get(id: string): Promise<PageDetail> {
    const page = await this.repository.findById(id);
    if (!page) {
      throw pageNotFound();
    }

    return toDetail(page);
  }

  private async uniqueSlug(base: string, excludeId?: string) {
    for (let suffix = 1; suffix <= MAX_SLUG_ATTEMPTS; suffix += 1) {
      const candidate = slugWithSuffix(base, suffix);
      const existing = await this.repository.findBySlug(candidate, excludeId);
      if (!existing) {
        return candidate;
      }
    }

    throw new PageError(409, 'SLUG_CONFLICT', 'A unique page slug could not be generated.');
  }

  async create(input: CreatePageRequest): Promise<PageDetail> {
    if (input.parentId !== null && !(await this.repository.hasActiveParent(input.parentId))) {
      throw new PageError(422, 'PARENT_NOT_FOUND', 'The selected parent page does not exist.');
    }

    await this.normalizeSiblings(input.parentId);

    const now = timestamp();
    const id = crypto.randomUUID();
    const baseSlug = slugifyPageTitle(input.title);

    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
      const slug = await this.uniqueSlug(baseSlug);

      try {
        const changes = await this.repository.insert({
          id,
          title: input.title,
          slug,
          contentJson: emptyDocument,
          contentText: '',
          parentId: input.parentId,
          createdAt: now,
          updatedAt: now,
        });

        if (changes < 1) {
          throw new PageError(500, 'INTERNAL_ERROR', 'Internal server error.');
        }

        const page = await this.repository.findById(id);
        if (!page) {
          throw new PageError(500, 'INTERNAL_ERROR', 'Internal server error.');
        }

        return toDetail(page);
      } catch (error) {
        if (!isConstraintError(error)) {
          throw error;
        }
      }
    }

    throw new PageError(409, 'SLUG_CONFLICT', 'A unique page slug could not be generated.');
  }

  async updateMetadata(id: string, input: UpdatePageRequest): Promise<PageDetail> {
    const current = await this.repository.findById(id);
    if (!current) {
      throw pageNotFound();
    }
    if (current.revision !== input.baseRevision) {
      throw pageConflict(current);
    }

    const title = input.title ?? current.title;
    let slug: string;
    if (input.slug !== undefined) {
      const existing = await this.repository.findBySlug(input.slug, id);
      if (existing) {
        throw new PageError(409, 'SLUG_CONFLICT', 'A page with this slug already exists.');
      }
      slug = input.slug;
    } else if (input.title !== undefined) {
      slug = await this.uniqueSlug(slugifyPageTitle(input.title), id);
    } else {
      slug = current.slug;
    }

    const updatedAt = timestamp(current.updatedAt);
    try {
      const changes = await this.repository.updateMetadata(id, input.baseRevision, {
        title,
        slug,
        updatedAt,
      });
      if (changes < 1) {
        const latest = await this.repository.findById(id);
        if (!latest) {
          throw pageNotFound();
        }
        throw pageConflict(latest);
      }
    } catch (error) {
      if (isConstraintError(error)) {
        throw new PageError(409, 'SLUG_CONFLICT', 'A page with this slug already exists.');
      }
      throw error;
    }

    const page = await this.repository.findById(id);
    if (!page) {
      throw new PageError(500, 'INTERNAL_ERROR', 'Internal server error.');
    }
    return toDetail(page);
  }

  async updateContent(id: string, input: UpdatePageContentRequest): Promise<PageDetail> {
    const current = await this.repository.findById(id);
    if (!current) {
      throw pageNotFound();
    }

    const contentJson = JSON.stringify(input.content);
    const contentText = derivePlainText(input.content);
    const updatedAt = timestamp(current.updatedAt);
    const estimatedBytes = estimatePageRowBytes({
      id: current.id,
      title: current.title,
      slug: current.slug,
      contentJson,
      contentText,
      parentId: current.parentId,
      position: current.position,
      revision: current.revision + 1,
      createdAt: current.createdAt,
      updatedAt,
    });

    if (estimatedBytes > MAX_PAGE_ROW_BYTES) {
      throw new PageError(
        413,
        'PAGE_TOO_LARGE',
        'This page is too large. Split it into smaller pages.',
        { maxBytes: MAX_PAGE_ROW_BYTES },
      );
    }

    const changes = await this.repository.updateContent(id, input.baseRevision, {
      contentJson,
      contentText,
      updatedAt,
    });
    if (changes < 1) {
      const latest = await this.repository.findById(id);
      if (!latest) {
        throw pageNotFound();
      }
      throw pageConflict(latest);
    }

    const page = await this.repository.findById(id);
    if (!page) {
      throw new PageError(500, 'INTERNAL_ERROR', 'Internal server error.');
    }
    return toDetail(page);
  }

  async move(id: string, input: MovePageRequest): Promise<PageDetail> {
    const current = await this.repository.findById(id);
    if (!current) {
      throw pageNotFound();
    }

    if (input.parentId !== null) {
      const parent = await this.repository.findById(input.parentId);
      if (!parent) {
        throw new PageError(422, 'PARENT_NOT_FOUND', 'The selected parent page does not exist.');
      }

      if (await this.repository.isInAncestorChain(input.parentId, id)) {
        throw new PageError(422, 'PAGE_CYCLE', 'A page cannot be moved into itself or its child.');
      }
    }

    const anchorId = input.beforeId ?? input.afterId;
    let anchor: PageRecord | null = null;
    if (anchorId !== undefined) {
      anchor = await this.repository.findById(anchorId);
      if (!anchor) {
        throw new PageError(
          422,
          'MOVE_TARGET_NOT_FOUND',
          'The selected move target does not exist.',
        );
      }
      if (anchor.id === current.id || anchor.parentId !== input.parentId) {
        throw new PageError(
          422,
          'MOVE_TARGET_INVALID',
          'The selected move target must be a sibling in the destination.',
        );
      }
    }

    const sourceSiblings = await this.repository.listActiveChildren(current.parentId);
    const destinationSiblings =
      current.parentId === input.parentId
        ? sourceSiblings
        : await this.repository.listActiveChildren(input.parentId);
    const sourceWithoutCurrent = sourceSiblings.filter((page) => page.id !== current.id);
    const destinationWithoutCurrent = destinationSiblings.filter((page) => page.id !== current.id);

    if (!sourceSiblings.some((page) => page.id === current.id)) {
      throw new PageError(500, 'INTERNAL_ERROR', 'Internal server error.');
    }

    const insertionIndex =
      anchor === null
        ? destinationWithoutCurrent.length
        : destinationWithoutCurrent.findIndex((page) => page.id === anchor?.id) +
          (input.afterId === undefined ? 0 : 1);
    if (insertionIndex < 0) {
      throw new PageError(
        422,
        'MOVE_TARGET_INVALID',
        'The selected move target must be a sibling in the destination.',
      );
    }

    const nextDestination = [...destinationWithoutCurrent];
    nextDestination.splice(insertionIndex, 0, current);

    const desired = new Map<string, { parentId: string | null; position: number }>();
    sourceWithoutCurrent.forEach((page, position) => {
      desired.set(page.id, { parentId: current.parentId, position });
    });
    nextDestination.forEach((page, position) => {
      desired.set(page.id, { parentId: input.parentId, position });
    });

    const updates = Array.from(desired, ([pageId, next]) => {
      const page =
        pageId === current.id
          ? current
          : (sourceSiblings.find((sibling) => sibling.id === pageId) ??
            destinationSiblings.find((sibling) => sibling.id === pageId));
      if (!page) {
        throw new PageError(500, 'INTERNAL_ERROR', 'Internal server error.');
      }

      if (page.parentId === next.parentId && page.position === next.position) {
        return null;
      }

      return {
        id: page.id,
        parentId: next.parentId,
        position: next.position,
        revision: page.revision,
        updatedAt: timestamp(page.updatedAt),
      };
    }).filter((update): update is NonNullable<typeof update> => update !== null);

    if (updates.length === 0) {
      return toDetail(current);
    }

    await this.repository.updateTree(updates);
    const sourceAfter = await this.repository.listActiveChildren(current.parentId);
    const destinationAfter =
      current.parentId === input.parentId
        ? sourceAfter
        : await this.repository.listActiveChildren(input.parentId);
    const expectedSourceIds = sourceWithoutCurrent.map((page) => page.id);
    const expectedDestinationIds = nextDestination.map((page) => page.id);
    const matchesTree = (
      actual: PageRecord[],
      expectedIds: string[],
      expectedParentId: string | null,
    ) =>
      actual.length === expectedIds.length &&
      actual.every(
        (page, position) =>
          page.id === expectedIds[position] &&
          page.parentId === expectedParentId &&
          page.position === position,
      );
    const sourceMatches = matchesTree(sourceAfter, expectedSourceIds, current.parentId);
    const destinationMatches = matchesTree(
      destinationAfter,
      expectedDestinationIds,
      input.parentId,
    );
    const sameParent = current.parentId === input.parentId;
    const treeMatches = sameParent ? destinationMatches : sourceMatches && destinationMatches;
    if (!treeMatches) {
      const latest = await this.repository.findById(id);
      if (!latest) {
        throw pageNotFound();
      }
      throw pageConflict(latest);
    }

    const moved = await this.repository.findById(id);
    if (!moved) {
      throw new PageError(500, 'INTERNAL_ERROR', 'Internal server error.');
    }
    return toDetail(moved);
  }

  async delete(id: string, input?: DeletePageRequest): Promise<PageDetail> {
    const current = await this.repository.findById(id);
    if (!current) {
      throw pageNotFound();
    }
    if (input?.baseRevision !== undefined && current.revision !== input.baseRevision) {
      throw pageConflict(current);
    }

    const deletedAt = timestamp(current.updatedAt);
    const baseRevision = input?.baseRevision ?? current.revision;
    const siblings = await this.repository.listActiveChildren(current.parentId);
    if (!siblings.some((page) => page.id === current.id)) {
      throw new PageError(500, 'INTERNAL_ERROR', 'Internal server error.');
    }
    const changes = await this.repository.softDelete(id, baseRevision, deletedAt);
    if (changes < 1) {
      const latest = await this.repository.findById(id);
      if (!latest) {
        throw pageNotFound();
      }
      throw pageConflict(latest);
    }
    await this.normalizeSiblings(
      current.parentId,
      siblings.filter((page) => page.id !== current.id),
    );

    const deleted = await this.repository.findById(id, true);
    if (!deleted) {
      throw new PageError(500, 'INTERNAL_ERROR', 'Internal server error.');
    }
    return toDetail(deleted);
  }
}
