import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TiptapDocument } from '../../../../shared/pages';
import { PageEditor } from './PageEditor';

const documentWithFormatting: TiptapDocument = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: 'Existing heading' }],
    },
    {
      type: 'paragraph',
      content: [
        { marks: [{ type: 'bold' }], text: 'bold text', type: 'text' },
        { marks: [{ type: 'italic' }], text: ' and italic text', type: 'text' },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A bullet' }] }],
        },
      ],
    },
    {
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: false },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A task' }] }],
        },
      ],
    },
    {
      type: 'blockquote',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A quote' }] }],
    },
    {
      type: 'codeBlock',
      attrs: { language: 'ts' },
      content: [{ type: 'text', text: 'const answer = 42;' }],
    },
    { type: 'horizontalRule' },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
          text: 'Documentation',
        },
      ],
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PageEditor', () => {
  it('loads the supported document nodes and marks without interpreting HTML', async () => {
    const { container } = render(<PageEditor content={documentWithFormatting} />);

    const editor = await screen.findByRole('textbox', { name: 'Page content' });

    expect(editor.querySelector('h1')?.textContent).toContain('Existing heading');
    expect(editor.querySelector('strong')?.textContent).toContain('bold text');
    expect(editor.querySelector('em')?.textContent).toContain('and italic text');
    expect(editor.querySelector('ul:not([data-type="taskList"])')?.textContent).toContain(
      'A bullet',
    );
    expect(editor.querySelector('ul[data-type="taskList"]')?.textContent).toContain('A task');
    expect(editor.querySelector('blockquote')?.textContent).toContain('A quote');
    expect(editor.querySelector('pre code')?.textContent).toContain('const answer = 42;');
    expect(editor.querySelector('hr')).toBeTruthy();
    expect(editor.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML).not.toContain('dangerously');
  });

  it('serializes a toolbar formatting change and keeps focus in the editor', async () => {
    const onChange = vi.fn();
    render(
      <PageEditor
        content={{
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Write here' }] }],
        }}
        onChange={onChange}
      />,
    );

    const editor = await screen.findByRole('textbox', { name: 'Page content' });
    editor.focus();
    expect(document.activeElement).toBe(editor);

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Heading 2' }));
    expect(document.activeElement).toBe(editor);
    fireEvent.click(screen.getByRole('button', { name: 'Heading 2' }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const serialized = onChange.mock.lastCall?.[0] as TiptapDocument;
    expect(serialized.content[0]).toMatchObject({ attrs: { level: 2 }, type: 'heading' });
    expect(editor.querySelector('h2')?.textContent).toContain('Write here');
  });

  it('supports the Mod-B keyboard shortcut for bold text', async () => {
    render(
      <PageEditor
        content={{
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keyboard ready' }] }],
        }}
      />,
    );

    const editor = await screen.findByRole('textbox', { name: 'Page content' });
    editor.focus();
    fireEvent.keyDown(editor, { ctrlKey: true, key: 'b' });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Bold' }).getAttribute('aria-pressed')).toBe(
        'true',
      ),
    );
  });

  it('falls back to an empty document for unknown nodes', async () => {
    const unsafeDocument = {
      type: 'doc',
      content: [
        {
          type: 'html',
          attrs: { html: '<script>window.__dovariAttack = true</script>' },
        },
      ],
    } as unknown as TiptapDocument;

    const { container } = render(<PageEditor content={unsafeDocument} />);
    const editor = await screen.findByRole('textbox', { name: 'Page content' });

    expect(editor.textContent).toBe('');
    expect(container.querySelector('script')).toBeNull();
    expect((window as Window & { __dovariAttack?: boolean }).__dovariAttack).toBeUndefined();
  });

  it('rejects unsafe link URLs in the link form', async () => {
    render(
      <PageEditor
        content={{
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Link text' }] }],
        }}
      />,
    );

    const editor = await screen.findByRole('textbox', { name: 'Page content' });
    editor.focus();
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    fireEvent.change(screen.getByLabelText('Link URL'), {
      target: { value: 'javascript:alert(1)' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect((await screen.findByRole('alert')).textContent).toContain('http, https, mailto');
    expect(editor.querySelector('a')).toBeNull();
  });
});
