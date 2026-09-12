import {
  derivePlainText,
  estimatePageRowBytes,
  emptyDocument,
  MAX_PAGE_ROW_BYTES,
  PAGE_SLUG_MAX_LENGTH,
  tiptapDocumentSchema,
  type CreatePageRequest,
  type DeletePageRequest,
  type PageDetail,
  type PageSummary,
  type TiptapDocument,
  type UpdatePageContentRequest,
  type UpdatePageRequest,
} from '../../shared/pages';
import { PageError } from './errors';
import { PageRepository, type PageRecord } from './repository';

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
    const changes = await this.repository.softDelete(id, baseRevision, deletedAt);
    if (changes < 1) {
      const latest = await this.repository.findById(id);
      if (!latest) {
        throw pageNotFound();
      }
      throw pageConflict(latest);
    }

    const deleted = await this.repository.findById(id, true);
    if (!deleted) {
      throw new PageError(500, 'INTERNAL_ERROR', 'Internal server error.');
    }
    return toDetail(deleted);
  }
}
