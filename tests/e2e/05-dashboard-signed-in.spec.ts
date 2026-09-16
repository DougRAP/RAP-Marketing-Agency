// Dashboard signed-in state — the partner's own account data replaces the
// public preview, and the sample sales figures stay labelled as samples.
//
// Uses the Supabase admin API to mint a magic link (no email is sent), then
// visits it like a real user would.

import { test, expect } from '@playwright/test';
import {
  makeTestEmail,
  generateMagicLink,
  cleanupTestUser
} from './helpers/supabase';

async function waitForAuth(page: any) {
  await page.waitForFunction(
    () => (window as any).DP_AUTH && (window as any).DP_AUTH.ready === true,
    { timeout: 20_000 }
  );
  // dashboard.js renders on the same event; give it a tick to paint.
  await page.waitForTimeout(300);
}

test.describe('Dashboard — signed-in state', () => {
  let testEmail: string;

  test.beforeEach(() => {
    testEmail = makeTestEmail();
  });

  test.afterEach(async () => {
    if (testEmail) await cleanupTestUser(testEmail);
  });

  test('D.1 — anonymous visitor still sees the public preview', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/dashboard/');
    await waitForAuth(page);

    await expect(page.locator('.hero-ctas[data-dp-when="signed-out"]')).toBeVisible();
    await expect(page.locator('.hero-ctas[data-dp-when="signed-in"]')).toBeHidden();
    // The sign-up invitation belongs to anonymous visitors.
    await expect(page.locator('section[data-dp-when="signed-out"]')).toBeVisible();
  });

  test('D.2 — signed-in partner sees their own account on the dashboard landing', async ({ page, context }) => {
    await context.clearCookies();
    const link = await generateMagicLink(testEmail, 'http://localhost:8888/dashboard');
    await page.goto(link);
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    await waitForAuth(page);

    // Signed-in CTAs replace the "log in" ones.
    await expect(page.locator('.hero-ctas[data-dp-when="signed-in"]')).toBeVisible();
    await expect(page.locator('.hero-ctas[data-dp-when="signed-out"]')).toBeHidden();
    await expect(page.getByRole('link', { name: /Open my dashboard/ })).toBeVisible();

    // The page greets them with their own identity, not the sample studio.
    const studio = await page.locator('[data-field="studio-name"]').first().textContent();
    expect(studio).toBe(testEmail);
    expect(studio).not.toContain('Example Designer Studio');

    // Their real account number is shown.
    const account = await page.locator('[data-field="account-number"]').textContent();
    expect(account).toMatch(/^DP-\d+$/);

    // "Not a partner yet?" is gone once you are a partner.
    await expect(page.locator('section[data-dp-when="signed-out"]')).toBeHidden();
  });

  test('D.3 — overview shows real account fields and labels the sample figures', async ({ page, context }) => {
    await context.clearCookies();
    const link = await generateMagicLink(testEmail, 'http://localhost:8888/dashboard');
    await page.goto(link);
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    await waitForAuth(page);

    await page.goto('/dashboard/overview/');
    await waitForAuth(page);

    // The dev-only state switcher is retired behind a real session.
    await expect(page.locator('.state-switcher')).toBeHidden();

    // A fresh partner has no Stripe account yet, so the account is "incomplete".
    await expect(page.locator('.status-state[data-state="incomplete"]')).toHaveClass(/is-active/);
    await expect(page.locator('.status-state[data-state="public"]')).not.toHaveClass(/is-active/);

    // Setup progress reflects the real onboarding_step, not the hardcoded copy.
    const progress = await page.locator('[data-field="setup-progress-line"]').textContent();
    expect(progress).toMatch(/Account setup: [1-5] of 5 complete/);

    // The ribbon tells the truth about which half of the page is real.
    const ribbon = await page.locator('#preview-ribbon').textContent();
    expect(ribbon).toContain('Your account is live');
    expect(ribbon).toContain('sample data');
    expect(ribbon).not.toContain('This is what your dashboard will look like');

    // And the figures themselves carry a note, for anyone scrolling past it.
    await expect(page.locator('.dp-sample-note')).toBeVisible();
  });
});
