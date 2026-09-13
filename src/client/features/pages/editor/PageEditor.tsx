import { useEffect, useMemo, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';

import type { TiptapDocument } from '../../../../shared/pages';
import type { UploadAsset } from '../../assets/api';
import { EditorToolbar } from './EditorToolbar';
import {
  createPageEditorExtensions,
  safeEditorDocument,
  serializeEditorDocument,
} from './editorExtensions';
import { AssetUploadController } from './assetUpload';

export interface PageEditorProps {
  content: TiptapDocument;
  onChange?: (content: TiptapDocument) => void;
  pageId?: string;
  uploadAsset?: UploadAsset;
}

export function PageEditor({ content, onChange, pageId, uploadAsset }: PageEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const assetUpload = useMemo(
    () => new AssetUploadController({ pageId, upload: uploadAsset }),
    [pageId, uploadAsset],
  );
  const extensions = useMemo(() => createPageEditorExtensions({ assetUpload }), [assetUpload]);
  const initialContent = useMemo(() => safeEditorDocument(content), [content]);
  const editor = useEditor(
    {
      content: initialContent,
      editorProps: {
        attributes: {
          'aria-label': 'Page content',
          'aria-multiline': 'true',
          class: 'page-editor-content',
          role: 'textbox',
          spellcheck: 'true',
        },
      },
      extensions,
      immediatelyRender: false,
      onUpdate: ({ editor: currentEditor }) => {
        const serialized = serializeEditorDocument(currentEditor.getJSON());
        if (serialized) {
          onChangeRef.current?.(serialized);
        }
      },
    },
    [extensions],
  );

  useEffect(() => () => assetUpload.dispose(), [assetUpload]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const currentContent = serializeEditorDocument(editor.getJSON());
    if (currentContent && JSON.stringify(currentContent) === JSON.stringify(content)) {
      return;
    }

    editor.commands.setContent(safeEditorDocument(content), { emitUpdate: false });
  }, [content, editor]);

  return (
    <section aria-label="Page editor" className="page-editor">
      {editor ? (
        <>
          <EditorToolbar editor={editor} />
          <div className="page-editor-surface">
            <EditorContent editor={editor} />
          </div>
        </>
      ) : (
        <p className="page-editor-loading" role="status">
          Loading editor…
        </p>
      )}
    </section>
  );
}
