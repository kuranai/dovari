import type { MouseEvent, ReactNode } from 'react';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';

interface ToolbarButtonProps {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}

function ToolbarButton({ active, children, disabled = false, label, onClick }: ToolbarButtonProps) {
  function keepEditorSelection(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={active ? 'editor-toolbar-button is-active' : 'editor-toolbar-button'}
      disabled={disabled}
      onClick={onClick}
      onMouseDown={keepEditorSelection}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

interface EditorToolbarProps {
  editor: Editor;
  onOpenLink: () => void;
  onOpenWikiLink: () => void;
}

export function EditorToolbar({ editor, onOpenLink, onOpenWikiLink }: EditorToolbarProps) {
  const active = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      blockquote: currentEditor.isActive('blockquote'),
      bold: currentEditor.isActive('bold'),
      bulletList: currentEditor.isActive('bulletList'),
      code: currentEditor.isActive('code'),
      codeBlock: currentEditor.isActive('codeBlock'),
      heading1: currentEditor.isActive('heading', { level: 1 }),
      heading2: currentEditor.isActive('heading', { level: 2 }),
      heading3: currentEditor.isActive('heading', { level: 3 }),
      italic: currentEditor.isActive('italic'),
      link: currentEditor.isActive('link'),
      orderedList: currentEditor.isActive('orderedList'),
      paragraph: currentEditor.isActive('paragraph'),
      strike: currentEditor.isActive('strike'),
      taskList: currentEditor.isActive('taskList'),
    }),
  });

  return (
    <div aria-label="Text formatting" className="editor-toolbar" role="toolbar">
      <div className="editor-toolbar-group">
        <ToolbarButton
          active={active.paragraph}
          label="Text"
          onClick={() => editor.chain().focus().setParagraph().run()}
        >
          Text
        </ToolbarButton>
        <ToolbarButton
          active={active.heading1}
          label="Heading 1"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          H1
        </ToolbarButton>
        <ToolbarButton
          active={active.heading2}
          label="Heading 2"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          active={active.heading3}
          label="Heading 3"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </ToolbarButton>
      </div>

      <span aria-hidden="true" className="editor-toolbar-separator" />

      <div className="editor-toolbar-group">
        <ToolbarButton
          active={active.bold}
          label="Bold"
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          active={active.italic}
          label="Italic"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton
          active={active.strike}
          label="Strike"
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <s>S</s>
        </ToolbarButton>
        <ToolbarButton
          active={active.code}
          label="Inline code"
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          {'</>'}
        </ToolbarButton>
        <ToolbarButton active={active.link} label="Link" onClick={onOpenLink}>
          ↗
        </ToolbarButton>
        <ToolbarButton label="Wiki link" onClick={onOpenWikiLink}>
          Wiki link
        </ToolbarButton>
      </div>

      <span aria-hidden="true" className="editor-toolbar-separator" />

      <div className="editor-toolbar-group">
        <ToolbarButton
          active={active.bulletList}
          label="Bullet list"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          • List
        </ToolbarButton>
        <ToolbarButton
          active={active.orderedList}
          label="Ordered list"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1. List
        </ToolbarButton>
        <ToolbarButton
          active={active.taskList}
          label="Checklist"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        >
          ☑ List
        </ToolbarButton>
        <ToolbarButton
          active={active.blockquote}
          label="Quote"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          “ Quote
        </ToolbarButton>
        <ToolbarButton
          active={active.codeBlock}
          label="Code block"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          Code
        </ToolbarButton>
        <ToolbarButton
          label="Divider"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          —
        </ToolbarButton>
      </div>

      <span aria-hidden="true" className="editor-toolbar-separator" />

      <div className="editor-toolbar-group editor-toolbar-history">
        <ToolbarButton
          disabled={!editor.can().undo()}
          label="Undo"
          onClick={() => editor.chain().focus().undo().run()}
        >
          ↶
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor.can().redo()}
          label="Redo"
          onClick={() => editor.chain().focus().redo().run()}
        >
          ↷
        </ToolbarButton>
      </div>
    </div>
  );
}
