import type { Extensions } from '@tiptap/core';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import { FileHandler } from '@tiptap/extension-file-handler';
import StarterKit from '@tiptap/starter-kit';

import { validateTiptapDocument, type TiptapDocument } from '../../../../shared/pages';
import { Attachment, AssetImage } from './assetNodes';
import { AssetUploadController, createAssetUploadExtension } from './assetUpload';
import { WikiLink } from './wikiLinks';

export interface PageEditorExtensionOptions {
  assetUpload?: AssetUploadController;
}

const supportedNodeTypes = new Set([
  'doc',
  'paragraph',
  'text',
  'heading',
  'bulletList',
  'orderedList',
  'taskList',
  'listItem',
  'taskItem',
  'blockquote',
  'horizontalRule',
  'hardBreak',
  'codeBlock',
  'assetImage',
  'attachment',
  'wikiLink',
]);

const supportedMarkTypes = new Set(['bold', 'italic', 'strike', 'code', 'link']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function containsOnlyEditorTypes(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== 'string' || !supportedNodeTypes.has(value.type)) {
    return false;
  }

  if (Array.isArray(value.marks)) {
    if (
      value.marks.some(
        (mark) =>
          !isRecord(mark) || typeof mark.type !== 'string' || !supportedMarkTypes.has(mark.type),
      )
    ) {
      return false;
    }
  }

  if (value.content === undefined) {
    return true;
  }

  return Array.isArray(value.content) && value.content.every(containsOnlyEditorTypes);
}

export function isSupportedEditorDocument(value: unknown): value is TiptapDocument {
  return validateTiptapDocument(value).length === 0 && containsOnlyEditorTypes(value);
}

export function safeEditorDocument(value: unknown): TiptapDocument {
  if (isSupportedEditorDocument(value)) {
    return value;
  }

  return { type: 'doc', content: [] };
}

export function isAllowedLinkHref(value: string) {
  const href = value.trim();
  if (href.length === 0) {
    return false;
  }

  for (const character of href) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) {
      return false;
    }
  }

  try {
    const protocol = new URL(href, 'https://dovari.invalid').protocol;
    return ['http:', 'https:', 'mailto:'].includes(protocol);
  } catch {
    return false;
  }
}

export function createPageEditorExtensions(options: PageEditorExtensionOptions = {}): Extensions {
  const extensions: Extensions = [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        autolink: false,
        enableClickSelection: true,
        isAllowedUri: (url) => isAllowedLinkHref(url),
        linkOnPaste: false,
        openOnClick: false,
        HTMLAttributes: {
          rel: 'noopener noreferrer nofollow',
        },
      },
      underline: false,
    }),
    TaskList.configure({
      HTMLAttributes: { class: 'page-editor-task-list' },
    }),
    TaskItem.configure({ nested: true }),
    Placeholder.configure({
      placeholder: 'Start writing…',
      showOnlyCurrent: false,
    }),
    AssetImage,
    Attachment,
    WikiLink,
  ];

  if (options.assetUpload) {
    extensions.push(
      createAssetUploadExtension(options.assetUpload),
      FileHandler.configure({
        consumePasteEvent: true,
        onDrop: (editor, files, position) =>
          options.assetUpload?.handleDrop(editor, files, position),
        onPaste: (editor, files) => options.assetUpload?.handlePaste(editor, files),
      }),
    );
  }

  return extensions;
}

export function serializeEditorDocument(value: unknown): TiptapDocument | null {
  return isSupportedEditorDocument(value) ? value : null;
}
