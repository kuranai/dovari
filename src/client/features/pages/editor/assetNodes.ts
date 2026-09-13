import { mergeAttributes, Node } from '@tiptap/core';

import { assetIdSchema } from '../../../../shared/assets';

export function assetContentUrl(assetId: string) {
  return `/api/private/assets/${encodeURIComponent(assetId)}/content`;
}

function assetIdFromNode(value: unknown) {
  return assetIdSchema.safeParse(value).success && typeof value === 'string' ? value : '';
}

export const AssetImage = Node.create({
  name: 'assetImage',

  group: 'inline',

  inline: true,

  atom: true,

  draggable: true,

  addAttributes() {
    return {
      assetId: {
        default: null,
        rendered: false,
      },
      alt: {
        default: '',
      },
      title: {
        default: null,
      },
      width: {
        default: null,
      },
      height: {
        default: null,
      },
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    const assetId = assetIdFromNode(node.attrs.assetId);
    return [
      'img',
      mergeAttributes(HTMLAttributes, {
        'data-dovari-asset-id': assetId,
        src: assetContentUrl(assetId),
        class: 'asset-image-node',
      }),
    ];
  },
});

export const Attachment = Node.create({
  name: 'attachment',

  group: 'inline',

  inline: true,

  atom: true,

  draggable: true,

  addAttributes() {
    return {
      assetId: {
        default: null,
        rendered: false,
      },
      filename: {
        default: 'Attachment',
        rendered: false,
      },
      title: {
        default: null,
      },
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    const assetId = assetIdFromNode(node.attrs.assetId);
    const filename = typeof node.attrs.filename === 'string' ? node.attrs.filename : 'Attachment';
    return [
      'a',
      mergeAttributes(HTMLAttributes, {
        'aria-label': `Download ${filename}`,
        'data-dovari-asset-id': assetId,
        class: 'asset-attachment-node',
        download: '',
        href: assetContentUrl(assetId),
        rel: 'noopener noreferrer',
      }),
      ['span', { 'aria-hidden': 'true', class: 'asset-attachment-icon' }, '📎'],
      ['span', { class: 'asset-attachment-name' }, filename],
    ];
  },
});
