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
  await page.getByRole('button', { name: 'Rename page' }).click();
  await page.getByLabel('Page title').fill(renamedTitle);
  await page.getByRole('button', { name: 'Save title' }).click();
  await expect(page.getByRole('heading', { name: renamedTitle })).toBeVisible();

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
});
