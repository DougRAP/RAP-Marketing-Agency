// Dashboard signed-in state: the partner's own account data replaces the
// public preview. Sales figures come from the dashboard-data BFF (spec 10);
// here the account is fresh and unlinked, so the page says sales are not
// linked yet instead of showing sample numbers.
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

    // So is the invitation to log in to a dashboard they are already in.
    await expect(page.getByRole('link', { name: /Or log in to your real dashboard/ })).toBeHidden();
    await expect(page.getByRole('link', { name: /See my full dashboard/ })).toBeVisible();
  });

  test('D.3 - overview shows real account fields and says sales are not linked yet', async ({ page, context }) => {
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

    // The ribbon tells the truth about which half of the page is real. The
    // BFF answers after auth, so these assertions auto-wait for the final copy.
    // A fresh account is unknown to SOAR ("not matched"); with no engine
    // reachable, as on a machine without the local engine, the page says the
    // figures are unavailable instead. Either is the truth, never sample data.
    const NOT_SAMPLE = /once your account is matched|temporarily unavailable/;
    const ribbon = page.locator('#preview-ribbon');
    await expect(ribbon).toContainText('Your account is live');
    await expect(ribbon).toContainText(NOT_SAMPLE);
    await expect(ribbon).not.toContainText('sample data');
    await expect(ribbon).not.toContainText('This is what your dashboard will look like');

    // And the figures themselves carry a note, for anyone scrolling past it.
    await expect(page.locator('.dp-sales-note')).toBeVisible();
    await expect(page.locator('.dp-sales-note')).toContainText(NOT_SAMPLE);
    await expect(page.locator('.dp-sample-note')).toHaveCount(0);
    await expect(page.locator('.hero__sample-note')).toBeHidden();
  });

  test('D.4 — a partner with no referral code yet is told so, not shown the sample one', async ({ page, context }) => {
    await context.clearCookies();
    const link = await generateMagicLink(testEmail, 'http://localhost:8888/dashboard');
    await page.goto(link);
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    await waitForAuth(page);

    await page.goto('/dashboard/overview/');
    await waitForAuth(page);

    // account-bootstrap creates the row without a referral code.
    const code = await page.locator('[data-field="referral-code"]').textContent();
    expect(code).toBe('Not assigned yet');
    expect(code).not.toContain('EXAMPLESTUDIO');

    const clientLink = await page.locator('[data-field="client-link"]').textContent();
    expect(clientLink).not.toContain('EXAMPLESTUDIO');

    // Copying a placeholder would be worse than not offering it. The page
    // repeats the pair three times, so check every one of them.
    const copyButtons = page.locator('[data-action="copy-referral-code"], [data-action="copy-client-link"]');
    const count = await copyButtons.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(copyButtons.nth(i)).toBeDisabled();
    }

    // The setup checklist must not claim what the fields above deny.
    const checklist = page.locator('[data-field="setup-checklist"] li');
    await expect(checklist.filter({ hasText: 'Referral code assigned' })).not.toHaveClass(/is-done/);
    await expect(checklist.filter({ hasText: 'Client link assigned' })).not.toHaveClass(/is-done/);
  });

  test('D.5 - overview does not invite a signed-in partner to create an account', async ({ page, context }) => {
    await context.clearCookies();
    const link = await generateMagicLink(testEmail, 'http://localhost:8888/dashboard');
    await page.goto(link);
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    await waitForAuth(page);

    await page.goto('/dashboard/overview/');
    await waitForAuth(page);

    await expect(page.locator('.hero__help-cta')).toBeHidden();
    await expect(page.locator('.hero__help-aside')).toBeHidden();
    await expect(page.locator('section.final-cta')).toBeHidden();
    // The two "Log in" buttons used to become two "<email> · Log out" buttons.
    await expect(page.locator('a.btn:visible', { hasText: 'Log out' })).toHaveCount(0);
    await expect(page.locator('.hero__title [data-dp-when="signed-in"]')).toHaveText('Partner dashboard');
    // What a partner can still use there stays.
    await expect(page.locator('.hero__help-contact')).toBeVisible();
  });
});
