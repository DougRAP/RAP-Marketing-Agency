// Camino D — redirects and logout behavior.
// Validates auth-aware routing once a session is established.

import { test, expect } from '@playwright/test';
import { makeTestEmail, generateMagicLink, cleanupTestUser } from './helpers/supabase';

test.describe('Camino D — redirects and logout', () => {
  let testEmail: string;

  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    testEmail = makeTestEmail();
    const link = await generateMagicLink(testEmail, 'http://localhost:8888/dashboard');
    await page.goto(link);
    await page.waitForFunction(
      () => (window as any).DP_AUTH && (window as any).DP_AUTH.ready === true,
      { timeout: 20_000 }
    );
  });

  test.afterEach(async () => {
    if (testEmail) await cleanupTestUser(testEmail);
  });

  test('D.1 — /partner-apply redirects to /dashboard/profile when authenticated', async ({ page }) => {
    await page.goto('/partner-apply', { waitUntil: 'commit' });
    await page.waitForURL(/\/dashboard\/profile/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/dashboard\/profile/);
  });

  test('D.2 — /login redirects to /dashboard when already authenticated', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'commit' });
    await page.waitForURL(/\/dashboard(\/?|$|\?)/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('D.3 — nav account-link shows "<email> · Log out" when signed in', async ({ page }) => {
    await page.goto('/dashboard/overview');
    // Wait for renderAccountLinks to run
    await page.waitForFunction(
      (email) => {
        const links = document.querySelectorAll('header a[href="/login"], nav a[href="/login"], aside a[href="/login"]');
        return Array.from(links).some(a => a.textContent?.includes(email) && a.textContent?.includes('Log out'));
      },
      testEmail,
      { timeout: 10_000 }
    );
  });

  test('D.4 — sign out clears DP_AUTH and gates re-engage', async ({ page }) => {
    await page.goto('/dashboard/profile');
    await expect(page.locator('h1')).toContainText(/Tell us about your studio/i);

    // Call signOut directly from the page context.
    await page.evaluate(async () => {
      await (window as any).DP_AUTH.signOut();
    });

    // After sign-out, visiting /dashboard/profile should bounce to /login.
    await page.goto('/dashboard/profile', { waitUntil: 'commit' });
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
