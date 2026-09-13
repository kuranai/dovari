import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

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

  await page.getByRole('link', { name: renamedTitle }).click();
  await expect(page).toHaveURL(firstPageUrl);
  await expect(page.getByRole('heading', { name: renamedTitle })).toBeVisible();

  await page.getByRole('link', { name: 'Untitled' }).click();
  await expect(page).toHaveURL(secondPageUrl);
  await page.getByRole('button', { name: 'Delete page' }).click();
  await expect(page).toHaveURL(firstPageUrl);
  await expect(page.getByRole('heading', { name: renamedTitle })).toBeVisible();

  await page.getByRole('button', { name: 'Delete page' }).click();
  await expect(page).toHaveURL('/app');
  await expect(page.getByRole('heading', { name: 'Start with one useful page.' })).toBeVisible();
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

  await page.getByRole('link', { name: rootTitle }).click();
  await page.getByRole('button', { name: `Create child of ${rootTitle}` }).click();
  await expect(page.getByRole('heading', { name: 'Untitled' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Untitled' })).toBeVisible();

  await page.getByRole('button', { name: `Collapse ${rootTitle}` }).click();
  await expect(page.getByRole('link', { name: 'Untitled' })).toHaveCount(0);
  await page.getByRole('button', { name: `Expand ${rootTitle}` }).click();
  await expect(page.getByRole('link', { name: 'Untitled' })).toBeVisible();

  await page.getByRole('button', { name: `Move ${rootTitle}` }).click();
  await page.getByLabel('Position').selectOption({ label: `After ${siblingTitle}` });
  await page.getByRole('button', { name: 'Move page' }).click();
  await expect(page.getByRole('button', { name: 'Move page' })).toHaveCount(0);

  await page.getByRole('button', { name: `Rename ${rootTitle}` }).click();
  await page.getByLabel('Page title').fill(`${rootTitle} renamed`);
  await page.getByRole('button', { name: 'Save title' }).click();
  await expect(page.getByRole('link', { name: `${rootTitle} renamed` })).toBeVisible();

  await page.getByRole('link', { name: 'Untitled' }).click();
  await page.getByRole('button', { name: 'Delete page' }).click();
  const rootUrl = await page
    .getByRole('link', { name: `${rootTitle} renamed` })
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

  await page.getByRole('link', { name: sourceTitle }).click();
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
