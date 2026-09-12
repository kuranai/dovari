import { expect, test } from '@playwright/test';

test('loads the Dovari app shell', async ({ page }) => {
  await page.goto('/app');

  await expect(page).toHaveTitle('Dovari');
  await expect(
    page.getByRole('heading', { name: 'Your knowledge base starts here.' }),
  ).toBeVisible();
  await expect(page.getByText('Cloudflare foundation')).toBeVisible();
});
