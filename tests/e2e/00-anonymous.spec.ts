// Camino A — visitante anónimo (sin sesión).
// Verifies the public surface: dashboard accessible, CTAs route to /login,
// gated pages bounce to /login, /partner-apply redirects to /login.

import { test, expect } from '@playwright/test';

test.describe('Camino A — anonymous visitor', () => {
  test.beforeEach(async ({ context }) => {
    // Make sure no session lingers from a previous run.
    await context.clearCookies();
  });

  test('A.1 — /dashboard renders public (no redirect to /login)', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard\/?(\?.*)?$/);
    await expect(page.locator('h1')).toContainText(/control room/i);
  });

  test('A.2 — Hero CTAs in /dashboard point at /login', async ({ page }) => {
    await page.goto('/dashboard');
    const loginCta = page.locator('a.btn.btn--accent', { hasText: /Log in to my dashboard/i });
    await expect(loginCta).toHaveAttribute('href', '/login');
  });

  test('A.3 — Homepage button CTAs (not info links) point at /login', async ({ page }) => {
    await page.goto('/');
    // Filter to .btn-primary buttons specifically (excludes the info-page
    // link to /partner which uses .btn-photo).
    const ctas = page.locator('a.btn-primary', { hasText: /Become a partner/i });
    const count = await ctas.count();
    expect(count, 'expected at least one .btn-primary "Become a partner" CTA').toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(ctas.nth(i)).toHaveAttribute('href', '/login');
    }
  });

  test('A.4 — /partner-apply redirects to /login when anonymous', async ({ page }) => {
    await page.goto('/partner-apply', { waitUntil: 'commit' });
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('A.5 — /dashboard/profile redirects to /login when anonymous (gate)', async ({ page }) => {
    await page.goto('/dashboard/profile', { waitUntil: 'commit' });
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('A.6 — No "Apply to the program" copy remains visible on key pages', async ({ page }) => {
    for (const path of ['/', '/dashboard', '/login', '/partner', '/partnership', '/plans']) {
      await page.goto(path);
      const html = await page.content();
      expect(html, `"Apply to the program" found on ${path}`).not.toMatch(/Apply to the program/i);
    }
  });
});
