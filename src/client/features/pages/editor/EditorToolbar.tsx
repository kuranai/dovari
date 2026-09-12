import { useEffect, useRef, useState } from 'react';
import type { FormEvent, MouseEvent, ReactNode } from 'react';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';

import { isAllowedLinkHref } from './editorExtensions';

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
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
  const [isLinkFormOpen, setIsLinkFormOpen] = useState(false);
  const [linkHref, setLinkHref] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    if (isLinkFormOpen) {
      linkInputRef.current?.focus();
    }
  }, [isLinkFormOpen]);

  function openLinkForm() {
    const attrs = editor.getAttributes('link') as { href?: unknown };
    setLinkHref(typeof attrs.href === 'string' ? attrs.href : '');
    setLinkError(null);
    setIsLinkFormOpen(true);
  }

  function closeLinkForm() {
    setIsLinkFormOpen(false);
    setLinkError(null);
  }

  function handleLinkSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const href = linkHref.trim();
    if (!isAllowedLinkHref(href)) {
      setLinkError('Use an http, https, mailto, or relative link.');
      return;
    }

    if (!editor.chain().focus().setLink({ href }).run()) {
      setLinkError('Select some text before adding a link.');
      return;
    }

    closeLinkForm();
  }

  function removeLink() {
    editor.chain().focus().unsetLink().run();
    closeLinkForm();
  }

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
        <ToolbarButton active={active.link} label="Link" onClick={openLinkForm}>
          ↗
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

      {isLinkFormOpen ? (
        <form aria-label="Link options" className="editor-link-form" onSubmit={handleLinkSubmit}>
          <label htmlFor="editor-link-url">Link URL</label>
          <input
            autoComplete="off"
            id="editor-link-url"
            onChange={(event) => setLinkHref(event.target.value)}
            placeholder="https://example.com"
            ref={linkInputRef}
            type="text"
            value={linkHref}
          />
          <button className="button button-primary" type="submit">
            Apply
          </button>
          {active.link ? (
            <button className="button button-quiet" onClick={removeLink} type="button">
              Remove
            </button>
          ) : null}
          <button className="button button-quiet" onClick={closeLinkForm} type="button">
            Cancel
          </button>
          {linkError ? (
            <p className="editor-link-error" role="alert">
              {linkError}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
