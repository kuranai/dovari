import { useEffect, useMemo, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';

import type { TiptapDocument } from '../../../../shared/pages';
import { EditorToolbar } from './EditorToolbar';
import {
  createPageEditorExtensions,
  safeEditorDocument,
  serializeEditorDocument,
} from './editorExtensions';

export interface PageEditorProps {
  content: TiptapDocument;
  onChange?: (content: TiptapDocument) => void;
}

export function PageEditor({ content, onChange }: PageEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const extensions = useMemo(() => createPageEditorExtensions(), []);
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
    [],
  );

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
