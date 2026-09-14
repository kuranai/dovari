import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const e2ePassword = 'dovari-e2e-password-2026';

test.beforeEach(async ({ page }) => {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login\?next=/u);
  await page.getByLabel('Password').fill(e2ePassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/app');
});

test('signs the owner out and protects the app again', async ({ page }) => {
  await page.goto('/app/settings');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/login');
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login\?next=/u);
});

test('validates and restores a lossless backup after the workspace is emptied', async ({
  page,
}, testInfo) => {
  const title = `Backup roundtrip ${Date.now()}`;

  await page.goto('/app');
  await page.getByRole('button', { name: /New page/ }).click();
  await expect(page.getByRole('heading', { name: 'Untitled' })).toBeVisible();
  await page.getByLabel('Edit title').fill(title);
  await page.getByLabel('Edit title').press('Enter');
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  await page.getByRole('link', { name: 'Backup & restore' }).first().click();
  await expect(page).toHaveURL('/app/settings/backup');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Dovari backup' }).click();
  const download = await downloadPromise;
  const backupPath = testInfo.outputPath('dovari-backup-v1.zip');
  await download.saveAs(backupPath);

  await page.getByRole('link', { name: 'Back to pages' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.getByRole('button', { name: 'Delete page' }).click();
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL('/app/settings');
  await page.getByRole('link', { name: 'Open Trash' }).click();
  await expect(page).toHaveURL('/app/settings/trash');
  const trashItem = page.locator('.trash-item').filter({ hasText: title });
  await trashItem.getByRole('button', { name: 'Delete permanently' }).click();
  const confirmation = page.getByRole('form', { name: `Permanently delete ${title}` });
  await confirmation.getByLabel(/Type .* to confirm/).fill(title);
  await confirmation.getByRole('button', { name: 'Confirm permanent delete' }).click();
  await expect(trashItem).toHaveCount(0);

  await page.getByRole('link', { name: 'Backup & restore' }).first().click();
  await page.getByLabel('Select a dovari-backup-v1.zip file').setInputFiles(backupPath);
  await expect(page.getByRole('heading', { name: 'Validated backup' })).toBeVisible();
  await page.getByRole('button', { name: 'Start restore' }).click();
  await expect(page.getByRole('status')).toContainText('Restored 1 pages');
  await page.getByRole('link', { name: 'Back to pages' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  await page.getByRole('button', { name: 'Delete page' }).click();
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL('/app/settings');
  await page.getByRole('link', { name: 'Open Trash' }).click();
  await expect(page).toHaveURL('/app/settings/trash');
  const restoredTrashItem = page.locator('.trash-item').filter({ hasText: title });
  await restoredTrashItem.getByRole('button', { name: 'Delete permanently' }).click();
  const restoredConfirmation = page.getByRole('form', { name: `Permanently delete ${title}` });
  await restoredConfirmation.getByLabel(/Type .* to confirm/).fill(title);
  await restoredConfirmation.getByRole('button', { name: 'Confirm permanent delete' }).click();
  await expect(restoredTrashItem).toHaveCount(0);
});

test('creates, navigates, renames, reloads, and deletes pages', async ({ page }) => {
  const renamedTitle = `E2E page ${Date.now()}`;

  await page.goto('/app');
  await expect(page.getByRole('heading', { exact: true, name: 'Pages' })).toBeVisible();

  await page.getByRole('button', { name: /New page/ }).click();
  await expect(page).toHaveURL(/\/app\/pages\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: 'Untitled' })).toBeVisible();

  const firstPageUrl = page.url();
  await page.getByLabel('Edit title').fill(renamedTitle);
  await page.getByLabel('Edit title').press('Enter');
  await expect(page.getByRole('heading', { name: renamedTitle })).toBeVisible();
  expect(
    await page.locator('.page-detail').evaluate((element) => element.getBoundingClientRect().width),
  ).toBeGreaterThan(820);
  await expect(page.getByText('Content', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Write in context.', { exact: true })).toHaveCount(0);
  await expect(page.getByText('View current document JSON', { exact: true })).toHaveCount(0);

  await page.reload();
  await expect(page).toHaveURL(firstPageUrl);
  await expect(page.getByRole('heading', { name: renamedTitle })).toBeVisible();

  await page.getByRole('button', { name: /New page/ }).click();
  await expect(page).toHaveURL(/\/app\/pages\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: 'Untitled' })).toBeVisible();
  const secondPageUrl = page.url();
  expect(secondPageUrl).not.toBe(firstPageUrl);

  await page.getByRole('link', { exact: true, name: renamedTitle }).click();
  await expect(page).toHaveURL(firstPageUrl);
  await expect(page.getByRole('heading', { name: renamedTitle })).toBeVisible();

  await page.getByRole('link', { exact: true, name: 'Untitled' }).click();
  await expect(page).toHaveURL(secondPageUrl);
  await page.getByRole('button', { name: 'Delete page' }).click();
  await expect(page).toHaveURL(firstPageUrl);
  await expect(page.getByRole('heading', { name: renamedTitle })).toBeVisible();

  await page.getByRole('button', { name: 'Delete page' }).click();
  await expect(page).toHaveURL('/app');
  await expect(page.getByRole('heading', { name: 'Start with one useful page.' })).toBeVisible();
});

test('covers search, screenshot paste, drag and drop, and Markdown export', async ({ page }) => {
  const title = `P24 workflow ${Date.now()}`;

  await page.goto('/app');
  await page.getByRole('button', { name: /New page/ }).click();
  await expect(page.getByRole('heading', { name: 'Untitled' })).toBeVisible();
  const pageUrl = page.url();

  await page.getByLabel('Edit title').fill(title);
  await page.getByLabel('Edit title').press('Enter');
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  const editor = page.getByRole('textbox', { name: 'Page content' });
  await editor.click();
  await page.keyboard.type('Cloudflare deployment acceptance marker');

  await editor.evaluate((element) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(
      new File(
        [
          Uint8Array.from(
            atob(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            ),
            (character) => character.charCodeAt(0),
          ),
        ],
        'screenshot.png',
        { type: 'image/png' },
      ),
    );
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer,
      }),
    );
  });
  await expect(editor.locator('.asset-image-node')).toHaveCount(1);

  const editorBox = await editor.boundingBox();
  if (!editorBox) {
    throw new Error('The page editor has no visible bounding box for the drop smoke.');
  }
  await editor.evaluate(
    (element, coordinates) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(
        new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'dropped.png', {
          type: 'image/png',
        }),
      );
      element.dispatchEvent(
        new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          clientX: coordinates.x,
          clientY: coordinates.y,
          dataTransfer,
        }),
      );
    },
    { x: editorBox.x + 24, y: editorBox.y + 24 },
  );
  await expect(editor.locator('.asset-image-node')).toHaveCount(2);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  const exportDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Markdown + ZIP' }).click();
  const download = await exportDownload;
  expect(download.suggestedFilename()).toBe('dovari-export.zip');

  await page.keyboard.press('Control+K');
  const palette = page.getByRole('dialog', { name: 'Search or run a command' });
  const search = palette.getByRole('searchbox');
  await search.fill('Cloudflare deployment acceptance marker');
  await expect(palette.getByRole('option', { name: new RegExp(title) })).toBeVisible();
  await palette.getByRole('option', { name: new RegExp(title) }).press('Enter');
  await expect(page).toHaveURL(pageUrl);

  await page.getByRole('button', { name: 'Delete page' }).click();
  await page.goto('/app/settings/trash');
  const trashItem = page.locator('.trash-item').filter({ hasText: title });
  await trashItem.getByRole('button', { name: 'Delete permanently' }).click();
  const confirmation = page.getByRole('form', { name: `Permanently delete ${title}` });
  await confirmation.getByLabel(/Type .* to confirm/).fill(title);
  await confirmation.getByRole('button', { name: 'Confirm permanent delete' }).click();
  await expect(trashItem).toHaveCount(0);
});

test('supports a navigable page tree with child creation, collapse, move, and inline rename', async ({
  page,
}) => {
  const rootTitle = `Tree root ${Date.now()}`;
  const siblingTitle = `Tree sibling ${Date.now()}`;

  await page.goto('/app');
  await expect(page.getByRole('heading', { exact: true, name: 'Pages' })).toBeVisible();

  await page.getByRole('button', { name: /New page/ }).click();
  await expect(page.getByRole('heading', { name: 'Untitled' })).toBeVisible();
  await page.getByRole('button', { name: 'Rename page' }).click();
  await page.getByLabel('Page title').fill(rootTitle);
  await page.getByRole('button', { name: 'Save title' }).click();
  await expect(page.getByRole('heading', { name: rootTitle })).toBeVisible();

  await page.getByRole('button', { name: /New page/ }).click();
  await expect(page.getByRole('heading', { name: 'Untitled' })).toBeVisible();
  await page.getByRole('button', { name: 'Rename page' }).click();
  await page.getByLabel('Page title').fill(siblingTitle);
  await page.getByRole('button', { name: 'Save title' }).click();
  await expect(page.getByRole('heading', { name: siblingTitle })).toBeVisible();

  await page.getByRole('link', { exact: true, name: rootTitle }).click();
  await page.getByRole('button', { name: `Create child of ${rootTitle}` }).click();
  await expect(page.getByRole('heading', { name: 'Untitled' })).toBeVisible();
  await expect(page.getByRole('link', { exact: true, name: 'Untitled' })).toBeVisible();

  await page.getByRole('button', { name: `Collapse ${rootTitle}` }).click();
  await expect(page.getByRole('link', { exact: true, name: 'Untitled' })).toHaveCount(0);
  await page.getByRole('button', { name: `Expand ${rootTitle}` }).click();
  await expect(page.getByRole('link', { exact: true, name: 'Untitled' })).toBeVisible();

  await page.getByRole('button', { name: `Move ${rootTitle}` }).click();
  await page.getByLabel('Position').selectOption({ label: `After ${siblingTitle}` });
  await page.getByRole('button', { name: 'Move page' }).click();
  await expect(page.getByRole('button', { name: 'Move page' })).toHaveCount(0);

  await page.getByRole('button', { name: `Rename ${rootTitle}` }).click();
  await page.getByLabel('Page title').fill(`${rootTitle} renamed`);
  await page.getByRole('button', { name: 'Save title' }).click();
  await expect(page.getByRole('link', { exact: true, name: `${rootTitle} renamed` })).toBeVisible();

  await page.getByRole('link', { exact: true, name: 'Untitled' }).click();
  await page.getByRole('button', { name: 'Delete page' }).click();
  const rootUrl = await page
    .getByRole('link', { exact: true, name: `${rootTitle} renamed` })
    .getAttribute('href');
  if (!rootUrl) {
    throw new Error('The renamed root page has no navigation URL.');
  }
  await page.goto(rootUrl);
  await expect(page.getByRole('heading', { name: `${rootTitle} renamed` })).toBeVisible();
  await page.getByRole('button', { name: 'Delete page' }).click();
  await expect(page.getByRole('heading', { name: siblingTitle })).toBeVisible();
  await page.getByRole('button', { name: 'Delete page' }).click();
  await expect(page.getByRole('heading', { name: 'Start with one useful page.' })).toBeVisible();
});

test('supports theme persistence, skip navigation, and the mobile sidebar drawer', async ({
  page,
}) => {
  await page.goto('/app');
  await expect(page.getByRole('combobox', { name: 'Theme' })).toBeVisible();

  await page.getByRole('combobox', { name: 'Theme' }).selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('link', { name: 'Skip to main content' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const sidebar = page.locator('#workspace-sidebar');
  const navigationTrigger = page.getByRole('button', { name: 'Open pages navigation' });
  await expect(navigationTrigger).toBeVisible();
  await expect(sidebar).toBeHidden();

  await navigationTrigger.click();
  await expect(sidebar).toHaveClass(/is-open/);
  await expect(page.locator('.sidebar-backdrop')).toBeVisible();
  await expect(page.locator('.sidebar-close')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(sidebar).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open pages navigation' })).toBeFocused();
});

test('has no critical accessibility violations in the workspace shell', async ({ page }) => {
  await page.goto('/app');

  const desktopResults = await new AxeBuilder({ page }).analyze();
  expect(desktopResults.violations.filter((violation) => violation.impact === 'critical')).toEqual(
    [],
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const navigationTrigger = page.getByRole('button', { name: 'Open pages navigation' });
  await navigationTrigger.click();

  const mobileResults = await new AxeBuilder({ page }).analyze();
  expect(mobileResults.violations.filter((violation) => violation.impact === 'critical')).toEqual(
    [],
  );

  await page.getByRole('button', { name: /New page/ }).click();
  await expect(page.getByRole('heading', { name: 'Untitled' })).toBeVisible();
  const pageResults = await new AxeBuilder({ page }).analyze();
  expect(pageResults.violations.filter((violation) => violation.impact === 'critical')).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByLabel('Edit title')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Delete page' }).click();
});

test('supports discoverable safe links and wiki-link navigation by mouse and keyboard', async ({
  page,
}) => {
  const sourceTitle = `P20 source ${Date.now()}`;
  const targetTitle = `P20 target ${Date.now()}`;

  await page.goto('/app');
  await page.getByRole('button', { name: /New page/ }).click();
  await expect(page.getByRole('heading', { name: 'Untitled' })).toBeVisible();
  const sourceUrl = page.url();
  await page.getByLabel('Edit title').fill(sourceTitle);
  await page.getByLabel('Edit title').press('Enter');
  await expect(page.getByRole('heading', { name: sourceTitle })).toBeVisible();

  await page.getByRole('button', { name: /New page/ }).click();
  await expect(page.getByRole('heading', { name: 'Untitled' })).toBeVisible();
  const targetUrl = page.url();
  const targetId = targetUrl.split('/').pop();
  if (!targetId) {
    throw new Error('The target page URL did not contain a page id.');
  }
  await page.getByLabel('Edit title').fill(targetTitle);
  await page.getByLabel('Edit title').press('Enter');
  await expect(page.getByRole('heading', { name: targetTitle })).toBeVisible();

  await page.getByRole('link', { exact: true, name: sourceTitle }).click();
  await expect(page).toHaveURL(sourceUrl);
  const editor = page.getByRole('textbox', { name: 'Page content' });
  await editor.click();
  await page.keyboard.type('https://example.com');
  await page.keyboard.press('Space');
  await expect(editor.locator('a[href="https://example.com"]')).toBeVisible();

  await editor.evaluate((element) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', 'person@example.com');
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    );
  });
  await expect(editor.locator('a[href="mailto:person@example.com"]')).toBeVisible();

  await editor.locator('a[href="https://example.com"]').click();
  const linkDialog = page.getByRole('dialog', { name: 'Link options' });
  await expect(linkDialog).toContainText('https://example.com');
  await page.evaluate(() => {
    const browserWindow = window as Window & { __dovariOpenCalls?: string[][] };
    browserWindow.__dovariOpenCalls = [];
    window.open = ((url, target, features) => {
      browserWindow.__dovariOpenCalls?.push([String(url), String(target), String(features)]);
      return null;
    }) as typeof window.open;
  });
  await linkDialog.getByRole('button', { name: 'Open link' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as Window & { __dovariOpenCalls?: string[][] }).__dovariOpenCalls ?? [],
      ),
    )
    .toEqual([['https://example.com', '_blank', 'noopener,noreferrer']]);

  await editor.click();
  await editor.press('Control+A');
  await editor.press('Backspace');
  await page.getByRole('button', { name: 'Wiki link' }).click();
  const wikiPicker = page.getByRole('dialog', { name: 'Wiki link picker' });
  const wikiSearch = page.getByRole('searchbox', { name: 'Search pages to link' });
  await wikiSearch.fill(targetTitle);
  await expect(
    wikiPicker.getByRole('option', { name: new RegExp(`^${targetTitle}`) }),
  ).toBeVisible();
  await wikiSearch.press('Enter');
  const wikiLink = editor.locator(`[data-dovari-wiki-link-id="${targetId}"]`);
  await expect(wikiLink).toBeVisible();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  await wikiLink.click();
  await expect(page).toHaveURL(targetUrl);
  await page.goto(sourceUrl);
  const keyboardWikiLink = page
    .getByRole('textbox', { name: 'Page content' })
    .locator(`[data-dovari-wiki-link-id="${targetId}"]`);
  await keyboardWikiLink.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(targetUrl);

  await page.getByRole('button', { name: 'Delete page' }).click();
  await expect(page.getByRole('heading', { name: sourceTitle })).toBeVisible();
  await page.getByRole('button', { name: 'Delete page' }).click();
  await expect(page.getByRole('heading', { name: 'Start with one useful page.' })).toBeVisible();
});

test('supports delete undo, Trash restore, and revision restore', async ({ page }) => {
  const title = `Recovery page ${Date.now()}`;

  await page.goto('/app');
  await page.getByRole('button', { name: /New page/ }).click();
  await expect(page.getByRole('heading', { name: 'Untitled' })).toBeVisible();
  const pageUrl = page.url();

  await page.getByLabel('Edit title').fill(title);
  await page.getByLabel('Edit title').press('Enter');
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rename page' })).toBeVisible();
  const editor = page.getByRole('textbox', { name: 'Page content' });
  await editor.click();
  await page.keyboard.type('Recoverable content');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Delete page' }).click();
  await expect(page).toHaveURL('/app');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page).toHaveURL(pageUrl);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  await page.getByRole('button', { name: 'Delete page' }).click();
  await expect(page).toHaveURL('/app');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL('/app/settings');
  await page.getByRole('link', { name: 'Open Trash' }).click();
  await expect(page).toHaveURL('/app/settings/trash');
  const trashItem = page.locator('.trash-item').filter({ hasText: title });
  await expect(trashItem).toBeVisible();
  await trashItem.getByRole('button', { name: 'Restore' }).click();
  await expect(page).toHaveURL(pageUrl);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  await page.getByRole('button', { name: 'Version history' }).click();
  const history = page.getByRole('dialog', { name: 'Version history' });
  await history.locator('.revision-list-item').filter({ hasText: title }).first().click();
  await expect(history.getByRole('button', { name: 'Restore this version' })).toBeVisible();
  await history.getByRole('button', { name: 'Restore this version' }).click();
  await expect(page.locator('h1.page-title-heading')).toHaveAttribute('aria-label', title);

  await page.getByRole('button', { name: 'Delete page' }).click();
  await expect(page).toHaveURL('/app');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL('/app/settings');
  await page.getByRole('link', { name: 'Open Trash' }).click();
  await expect(page).toHaveURL('/app/settings/trash');
  const finalTrashItem = page.locator('.trash-item').filter({ hasText: title });
  await finalTrashItem.getByRole('button', { name: 'Delete permanently' }).click();
  const confirmation = page.getByRole('form', { name: `Permanently delete ${title}` });
  await confirmation.getByLabel(/Type .* to confirm/).fill(title);
  await confirmation.getByRole('button', { name: 'Confirm permanent delete' }).click();
  await expect(finalTrashItem).toHaveCount(0);
});

test('supports Settings, Recent Pages, and slash commands on desktop and mobile', async ({
  page,
}) => {
  const sourceTitle = `P23 source ${Date.now()}`;
  const targetTitle = `P23 target ${Date.now()}`;

  await page.goto('/app');
  await page.getByRole('button', { name: /New page/ }).click();
  await expect(page.getByRole('heading', { name: 'Untitled' })).toBeVisible();
  const sourceUrl = page.url();
  const sourceId = sourceUrl.split('/').pop();
  if (!sourceId) {
    throw new Error('The source page URL did not contain a page id.');
  }
  await page.getByLabel('Edit title').fill(sourceTitle);
  await page.getByLabel('Edit title').press('Enter');
  await expect(page.getByRole('heading', { name: sourceTitle })).toBeVisible();

  await page.getByRole('button', { name: /New page/ }).click();
  await expect(page.getByRole('heading', { name: 'Untitled' })).toBeVisible();
  const targetUrl = page.url();
  const targetId = targetUrl.split('/').pop();
  if (!targetId) {
    throw new Error('The target page URL did not contain a page id.');
  }
  await page.getByLabel('Edit title').fill(targetTitle);
  await page.getByLabel('Edit title').press('Enter');
  await expect(page.getByRole('heading', { name: targetTitle })).toBeVisible();

  const recentPages = page.getByRole('navigation', { name: 'Recent pages' });
  await expect(
    recentPages.getByRole('link', { name: `Open recent page: ${sourceTitle}` }),
  ).toBeVisible();
  await expect(
    recentPages.getByRole('link', { name: `Open recent page: ${targetTitle}` }),
  ).toHaveCount(0);

  await page.getByRole('link', { name: `Open recent page: ${sourceTitle}` }).click();
  await expect(page).toHaveURL(sourceUrl);
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL('/app/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Trash' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open version history' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create backup' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Restore a backup' })).toBeVisible();

  await page.getByRole('link', { name: 'Open version history' }).click();
  await expect(page).toHaveURL(/\/app\/pages\/[^/]+\?history=1$/);
  await expect(page.getByRole('dialog', { name: 'Version history' })).toBeVisible();
  await page.getByRole('button', { name: 'Close version history' }).click();
  await expect(page).toHaveURL(/\/app\/pages\/[^?]+$/);
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL('/app/settings');

  const desktopSettingsResults = await new AxeBuilder({ page }).analyze();
  expect(
    desktopSettingsResults.violations.filter((violation) => violation.impact === 'critical'),
  ).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const navigationTrigger = page.getByRole('button', { name: 'Open pages navigation' });
  await navigationTrigger.click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  const mobileSettingsResults = await new AxeBuilder({ page }).analyze();
  expect(
    mobileSettingsResults.violations.filter((violation) => violation.impact === 'critical'),
  ).toEqual([]);
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(sourceUrl);
  await expect(page.getByRole('heading', { name: sourceTitle })).toBeVisible();
  const editor = page.getByRole('textbox', { name: 'Page content' });

  await editor.click();
  await page.keyboard.type('/heading 2');
  await expect(page.getByRole('dialog', { name: 'Slash commands' })).toBeVisible();
  const desktopSlashResults = await new AxeBuilder({ page }).analyze();
  expect(
    desktopSlashResults.violations.filter((violation) => violation.impact === 'critical'),
  ).toEqual([]);
  await page.keyboard.press('Enter');
  await expect(editor.locator('h2')).toBeVisible();

  await editor.click();
  await editor.press('Control+A');
  await editor.press('Backspace');
  await page.keyboard.type('/wiki');
  await page.keyboard.press('Enter');
  const wikiPicker = page.getByRole('dialog', { name: 'Wiki link picker' });
  const wikiSearch = page.getByRole('searchbox', { name: 'Search pages to link' });
  await wikiSearch.fill(targetTitle);
  await expect(
    wikiPicker.getByRole('option', { name: new RegExp(`^${targetTitle}`) }),
  ).toBeVisible();
  await wikiSearch.press('Enter');
  await expect(editor.locator(`[data-dovari-wiki-link-id="${targetId}"]`)).toBeVisible();

  await editor.click();
  await editor.press('Control+A');
  await editor.press('Backspace');
  await page.keyboard.type('/image');
  await page.keyboard.press('Enter');
  await page.locator('input.slash-command-file-input').setInputFiles({
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
    mimeType: 'image/png',
    name: 'pixel.png',
  });
  await expect(editor.locator('.asset-image-node')).toBeVisible();

  await editor.click();
  await editor.press('Control+A');
  await editor.press('Backspace');
  await page.keyboard.type('/file');
  await page.keyboard.press('Enter');
  await page.locator('input.slash-command-file-input').setInputFiles({
    buffer: Buffer.from('notes from slash command'),
    mimeType: 'text/plain',
    name: 'notes.txt',
  });
  await expect(editor.locator('.asset-attachment-node')).toBeVisible();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(targetUrl);
  await expect(page.getByRole('heading', { name: targetTitle })).toBeVisible();
  const mobileEditor = page.getByRole('textbox', { name: 'Page content' });
  await mobileEditor.click();
  await page.keyboard.type('/');
  await expect(page.getByRole('dialog', { name: 'Slash commands' })).toBeVisible();
  const mobileSlashResults = await new AxeBuilder({ page }).analyze();
  expect(
    mobileSlashResults.violations.filter((violation) => violation.impact === 'critical'),
  ).toEqual([]);
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(targetUrl);
  await expect(page.getByRole('heading', { name: targetTitle })).toBeVisible();
  await page.getByRole('button', { name: 'Delete page' }).click();
  await page.goto(sourceUrl);
  await expect(page.getByRole('heading', { name: sourceTitle })).toBeVisible();
  await page.getByRole('button', { name: 'Delete page' }).click();
  await page.goto('/app/settings/trash');
  for (const title of [sourceTitle, targetTitle]) {
    const trashItem = page.locator('.trash-item').filter({ hasText: title });
    await trashItem.getByRole('button', { name: 'Delete permanently' }).click();
    const confirmation = page.getByRole('form', { name: `Permanently delete ${title}` });
    await confirmation.getByLabel(/Type .* to confirm/).fill(title);
    await confirmation.getByRole('button', { name: 'Confirm permanent delete' }).click();
    await expect(trashItem).toHaveCount(0);
  }
});
