import { z } from 'zod';

export const PAGE_TITLE_MAX_LENGTH = 200;
export const PAGE_SLUG_MAX_LENGTH = 200;
export const MAX_PAGE_ROW_BYTES = 1_800_000;
export const MAX_PAGE_REQUEST_BYTES = MAX_PAGE_ROW_BYTES + 64_000;
export const MAX_DOCUMENT_DEPTH = 100;
export const emptyDocument = '{"type":"doc","content":[]}';

export interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: TiptapMark[];
}

export interface TiptapDocument {
  type: 'doc';
  content: TiptapNode[];
}

export interface PageSummary {
  id: string;
  title: string;
  slug: string;
  parentId: string | null;
  position: number;
  revision: number;
  updatedAt: string;
}

export interface PageDetail extends PageSummary {
  createdAt: string;
  content: TiptapDocument;
  contentText: string;
  deletedAt: string | null;
}

export interface DocumentValidationIssue {
  path: Array<string | number>;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isUuid(value: unknown) {
  return typeof value === 'string' && z.string().uuid().safeParse(value).success;
}

function addIssue(
  issues: DocumentValidationIssue[],
  path: Array<string | number>,
  message: string,
) {
  if (issues.length < 20) {
    issues.push({ message, path });
  }
}

function validateLinkAttributes(
  attrs: unknown,
  path: Array<string | number>,
  issues: DocumentValidationIssue[],
) {
  if (!isRecord(attrs) || !hasOnlyKeys(attrs, ['href', 'target', 'rel', 'class'])) {
    addIssue(issues, path, 'Link attributes are invalid.');
    return;
  }

  if (typeof attrs.href !== 'string' || attrs.href.length === 0 || attrs.href.length > 2_048) {
    addIssue(issues, [...path, 'href'], 'A link must contain a valid href.');
    return;
  }

  try {
    const protocol = new URL(attrs.href, 'https://dovari.invalid').protocol;
    if (!['http:', 'https:', 'mailto:'].includes(protocol)) {
      addIssue(issues, [...path, 'href'], 'This link protocol is not allowed.');
    }
  } catch {
    addIssue(issues, [...path, 'href'], 'A link must contain a valid href.');
  }

  for (const key of ['target', 'rel', 'class']) {
    const value = attrs[key];
    if (value !== undefined && value !== null && typeof value !== 'string') {
      addIssue(issues, [...path, key], 'Link attributes must be strings or null.');
    }
  }
}

function validateMarks(
  value: unknown,
  path: Array<string | number>,
  issues: DocumentValidationIssue[],
) {
  if (!Array.isArray(value)) {
    addIssue(issues, path, 'Marks must be an array.');
    return;
  }

  value.forEach((mark, index) => {
    const markPath = [...path, index];
    if (!isRecord(mark) || typeof mark.type !== 'string') {
      addIssue(issues, markPath, 'A mark must have a type.');
      return;
    }

    if (!hasOnlyKeys(mark, ['type', 'attrs'])) {
      addIssue(issues, markPath, 'A mark contains unsupported fields.');
      return;
    }

    if (!['bold', 'italic', 'strike', 'code', 'link'].includes(mark.type)) {
      addIssue(issues, [...markPath, 'type'], `The mark '${mark.type}' is not allowed.`);
      return;
    }

    if (mark.type === 'link') {
      validateLinkAttributes(mark.attrs, [...markPath, 'attrs'], issues);
    } else if (mark.attrs !== undefined) {
      addIssue(issues, [...markPath, 'attrs'], 'This mark does not accept attributes.');
    }
  });
}

function validateAssetAttributes(
  attrs: unknown,
  path: Array<string | number>,
  issues: DocumentValidationIssue[],
  attachment: boolean,
) {
  const allowedKeys = attachment
    ? ['assetId', 'filename', 'title']
    : ['assetId', 'alt', 'title', 'width', 'height'];

  if (!isRecord(attrs) || !hasOnlyKeys(attrs, allowedKeys)) {
    addIssue(issues, path, 'Asset attributes are invalid.');
    return;
  }

  if (!isUuid(attrs.assetId)) {
    addIssue(issues, [...path, 'assetId'], 'An asset node must reference a UUID.');
  }

  for (const key of attachment ? ['filename', 'title'] : ['alt', 'title']) {
    const value = attrs[key];
    if (
      value !== undefined &&
      value !== null &&
      (typeof value !== 'string' || value.length > 500)
    ) {
      addIssue(issues, [...path, key], 'Asset text attributes must be short strings or null.');
    }
  }

  if (!attachment) {
    for (const key of ['width', 'height']) {
      const value = attrs[key];
      if (
        value !== undefined &&
        value !== null &&
        (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > 100_000)
      ) {
        addIssue(issues, [...path, key], 'Asset dimensions must be positive integers.');
      }
    }
  }
}

function validateNode(
  value: unknown,
  path: Array<string | number>,
  context: 'root' | 'block' | 'inline' | 'code',
  depth: number,
  issues: DocumentValidationIssue[],
) {
  if (depth > MAX_DOCUMENT_DEPTH) {
    addIssue(issues, path, 'The document is nested too deeply.');
    return;
  }

  if (!isRecord(value) || typeof value.type !== 'string') {
    addIssue(issues, path, 'Every document node must have a type.');
    return;
  }

  if (!hasOnlyKeys(value, ['type', 'attrs', 'content', 'text', 'marks'])) {
    addIssue(issues, path, 'A document node contains unsupported fields.');
  }

  const type = value.type;
  const childPath = [...path, 'content'];

  if (type === 'text') {
    if (!['inline', 'code'].includes(context)) {
      addIssue(issues, path, 'Text nodes are only allowed inside text content.');
    }
    if (typeof value.text !== 'string' || value.text.length === 0) {
      addIssue(issues, [...path, 'text'], 'Text nodes must contain text.');
    }
    if (value.attrs !== undefined || value.content !== undefined) {
      addIssue(issues, path, 'Text nodes cannot contain attributes or child nodes.');
    }
    if (value.marks !== undefined) {
      if (context === 'code') {
        addIssue(issues, [...path, 'marks'], 'Code block text cannot contain marks.');
      } else {
        validateMarks(value.marks, [...path, 'marks'], issues);
      }
    }
    return;
  }

  if (value.text !== undefined || value.marks !== undefined) {
    addIssue(issues, path, 'Only text nodes may contain text or marks.');
  }

  const hasContent = value.content !== undefined;
  const requireContent = (childrenContext: 'block' | 'inline' | 'code') => {
    if (!hasContent) {
      addIssue(issues, childPath, 'This node must contain a content array.');
      return;
    }
    if (!Array.isArray(value.content)) {
      addIssue(issues, childPath, 'Node content must be an array.');
      return;
    }
    value.content.forEach((child, index) =>
      validateNode(child, [...childPath, index], childrenContext, depth + 1, issues),
    );
  };
  const optionalContent = (childrenContext: 'block' | 'inline' | 'code') => {
    if (hasContent) {
      if (!Array.isArray(value.content)) {
        addIssue(issues, childPath, 'Node content must be an array.');
        return;
      }
      value.content.forEach((child, index) =>
        validateNode(child, [...childPath, index], childrenContext, depth + 1, issues),
      );
    }
  };
  const noContent = () => {
    if (hasContent) {
      addIssue(issues, childPath, 'This node cannot contain child nodes.');
    }
  };
  const noAttrs = () => {
    if (value.attrs !== undefined) {
      addIssue(issues, [...path, 'attrs'], 'This node does not accept attributes.');
    }
  };
  const requireBlockContext = () => {
    if (!['root', 'block'].includes(context)) {
      addIssue(issues, path, `The node '${type}' is not allowed here.`);
    }
  };

  switch (type) {
    case 'doc':
      if (context !== 'root') {
        addIssue(issues, path, 'A document node is only allowed at the root.');
      }
      noAttrs();
      requireContent('block');
      break;
    case 'paragraph':
      requireBlockContext();
      noAttrs();
      optionalContent('inline');
      break;
    case 'heading':
      requireBlockContext();
      if (
        !isRecord(value.attrs) ||
        !hasOnlyKeys(value.attrs, ['level']) ||
        !Number.isInteger(value.attrs.level) ||
        ![1, 2, 3].includes(value.attrs.level as number)
      ) {
        addIssue(issues, [...path, 'attrs'], 'Heading level must be 1, 2, or 3.');
      }
      optionalContent('inline');
      break;
    case 'bulletList':
      requireBlockContext();
      noAttrs();
      requireContent('block');
      break;
    case 'orderedList':
      requireBlockContext();
      if (
        value.attrs !== undefined &&
        (!isRecord(value.attrs) ||
          !hasOnlyKeys(value.attrs, ['start']) ||
          (value.attrs.start !== undefined &&
            value.attrs.start !== null &&
            (!Number.isInteger(value.attrs.start) || (value.attrs.start as number) < 0)))
      ) {
        addIssue(issues, [...path, 'attrs'], 'Ordered-list attributes are invalid.');
      }
      requireContent('block');
      break;
    case 'taskList':
      requireBlockContext();
      noAttrs();
      requireContent('block');
      break;
    case 'listItem':
      if (context !== 'block') {
        addIssue(issues, path, 'List items are only allowed inside lists.');
      }
      noAttrs();
      requireContent('block');
      break;
    case 'taskItem':
      if (context !== 'block') {
        addIssue(issues, path, 'Task items are only allowed inside task lists.');
      }
      if (
        !isRecord(value.attrs) ||
        !hasOnlyKeys(value.attrs, ['checked']) ||
        typeof value.attrs.checked !== 'boolean'
      ) {
        addIssue(issues, [...path, 'attrs'], 'Task-item attributes are invalid.');
      }
      requireContent('block');
      break;
    case 'blockquote':
      requireBlockContext();
      noAttrs();
      requireContent('block');
      break;
    case 'horizontalRule':
      requireBlockContext();
      noAttrs();
      noContent();
      break;
    case 'hardBreak':
      if (context !== 'inline') {
        addIssue(issues, path, 'Hard breaks are only allowed inside text content.');
      }
      noAttrs();
      noContent();
      break;
    case 'codeBlock':
      requireBlockContext();
      if (
        value.attrs !== undefined &&
        (!isRecord(value.attrs) ||
          !hasOnlyKeys(value.attrs, ['language']) ||
          (value.attrs.language !== undefined &&
            value.attrs.language !== null &&
            typeof value.attrs.language !== 'string'))
      ) {
        addIssue(issues, [...path, 'attrs'], 'Code-block attributes are invalid.');
      }
      optionalContent('code');
      break;
    case 'assetImage':
      if (!['block', 'inline'].includes(context)) {
        addIssue(issues, path, 'Asset images are not allowed here.');
      }
      validateAssetAttributes(value.attrs, [...path, 'attrs'], issues, false);
      noContent();
      break;
    case 'attachment':
      if (!['block', 'inline'].includes(context)) {
        addIssue(issues, path, 'Attachments are not allowed here.');
      }
      validateAssetAttributes(value.attrs, [...path, 'attrs'], issues, true);
      noContent();
      break;
    default:
      addIssue(issues, [...path, 'type'], `The node '${type}' is not allowed.`);
  }
}

export function validateTiptapDocument(value: unknown): DocumentValidationIssue[] {
  const issues: DocumentValidationIssue[] = [];
  validateNode(value, [], 'root', 0, issues);
  return issues;
}

export const tiptapDocumentSchema = z.custom<TiptapDocument>(
  (value) => validateTiptapDocument(value).length === 0,
  { message: 'The document contains unsupported or invalid content.' },
);

export const pageIdSchema = z.string().uuid();
export const pageTitleSchema = z.string().trim().min(1).max(PAGE_TITLE_MAX_LENGTH);
export const pageSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(PAGE_SLUG_MAX_LENGTH)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const baseRevisionSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const createPageRequestSchema = z
  .object({
    title: pageTitleSchema,
    parentId: pageIdSchema.nullable().default(null),
  })
  .strict();

export const updatePageRequestSchema = z
  .object({
    baseRevision: baseRevisionSchema,
    title: pageTitleSchema.optional(),
    slug: pageSlugSchema.optional(),
  })
  .strict()
  .refine((value) => value.title !== undefined || value.slug !== undefined, {
    message: 'At least one page metadata field is required.',
    path: ['title'],
  });

export const updatePageContentRequestSchema = z
  .object({
    baseRevision: baseRevisionSchema,
    content: tiptapDocumentSchema,
  })
  .strict();

export const deletePageRequestSchema = z
  .object({
    baseRevision: baseRevisionSchema,
  })
  .strict();

export const pageSummarySchema = z
  .object({
    id: pageIdSchema,
    title: pageTitleSchema,
    slug: pageSlugSchema,
    parentId: pageIdSchema.nullable(),
    position: z.number().int().nonnegative(),
    revision: baseRevisionSchema,
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const pageDetailSchema = pageSummarySchema.extend({
  createdAt: z.string().datetime({ offset: true }),
  content: tiptapDocumentSchema,
  contentText: z.string(),
  deletedAt: z.string().datetime({ offset: true }).nullable(),
});

export const pagesListResponseSchema = z
  .object({ pages: z.array(pageSummarySchema).max(100) })
  .strict();

export const pageResponseSchema = z.object({ page: pageDetailSchema }).strict();

export function derivePlainText(document: TiptapDocument): string {
  const nodeText = (node: TiptapNode): string => {
    if (node.type === 'text') {
      return node.text ?? '';
    }

    if (node.type === 'assetImage') {
      const alt = node.attrs?.alt;
      return typeof alt === 'string' ? alt : '';
    }

    if (node.type === 'attachment') {
      const filename = node.attrs?.filename;
      return typeof filename === 'string' ? filename : '';
    }

    if (node.type === 'horizontalRule') {
      return '';
    }

    if (node.type === 'hardBreak') {
      return '\n';
    }

    const children = node.content ?? [];
    const separator = node.type === 'codeBlock' ? '' : '\n';
    return children.map(nodeText).join(separator);
  };

  return nodeText(document)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface PageRowSizeInput {
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
}

export function estimatePageRowBytes(page: PageRowSizeInput) {
  const encoder = new TextEncoder();
  const stringBytes = [
    page.id,
    page.title,
    page.slug,
    page.contentJson,
    page.contentText,
    page.parentId ?? '',
    page.createdAt,
    page.updatedAt,
  ].reduce((total, value) => total + encoder.encode(value).byteLength, 0);

  return stringBytes + 256 + String(page.position).length + String(page.revision).length;
}

export type CreatePageRequest = z.infer<typeof createPageRequestSchema>;
export type UpdatePageRequest = z.infer<typeof updatePageRequestSchema>;
export type UpdatePageContentRequest = z.infer<typeof updatePageContentRequestSchema>;
export type DeletePageRequest = z.infer<typeof deletePageRequestSchema>;
export type PagesListResponse = z.infer<typeof pagesListResponseSchema>;
export type PageResponse = z.infer<typeof pageResponseSchema>;
