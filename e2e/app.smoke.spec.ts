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
