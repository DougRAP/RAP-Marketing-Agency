// Camino C — profile form is optional enrichment, NOT account creation.
// Verifies that submitting the form UPDATES the existing partners row
// without creating duplicates.

import { test, expect } from '@playwright/test';
import {
  makeTestEmail,
  generateMagicLink,
  getPartnerByAuthUserId,
  countPartnersForAuthUserId,
  cleanupTestUser,
  supabaseAdmin
} from './helpers/supabase';

test.describe('Camino C — profile form (post-login enrichment)', () => {
  let testEmail: string;
  let userId: string;

  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    testEmail = makeTestEmail();
    const link = await generateMagicLink(testEmail, 'http://localhost:8888/dashboard');
    await page.goto(link);
    await page.waitForFunction(
      () => (window as any).DP_AUTH && (window as any).DP_AUTH.ready === true,
      { timeout: 20_000 }
    );
    const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
    userId = usersData!.users!.find(u => u.email === testEmail)!.id;
  });

  test.afterEach(async () => {
    if (testEmail) await cleanupTestUser(testEmail);
  });

  test('C.1 — /dashboard/profile renders form when authenticated', async ({ page }) => {
    await page.goto('/dashboard/profile');
    await expect(page.locator('h1')).toContainText(/Tell us about your studio/i);
    await expect(page.locator('#apply-form')).toBeVisible();
    // No required attributes — verify none of the inputs have it.
    const requiredCount = await page.locator('#apply-form [required]').count();
    expect(requiredCount).toBe(0);
  });

  test('C.2 — empty submit succeeds with "Saved" message', async ({ page }) => {
    await page.goto('/dashboard/profile');
    await page.click('#apply-submit');
    await expect(page.locator('#apply-status')).toContainText(/Saved/i, { timeout: 10_000 });

    // Partner row should still exist; no profile fields populated.
    const partner = await getPartnerByAuthUserId(userId);
    expect(partner).toBeTruthy();
    expect(partner!.studio_name).toBeNull();
    expect(partner!.specializes_in).toBeNull();
  });

  test('C.3 — submit with data UPDATES the partner row (no duplicate)', async ({ page }) => {
    await page.goto('/dashboard/profile');

    await page.fill('#studio_name', 'Test Studio LLC');
    await page.fill('#full_name', 'Test User');
    await page.check('input[name="products"][value="Furnishings"]');
    await page.check('input[name="products"][value="Lighting"]');
    await page.selectOption('#average_project_size', '$5,000 – $20,000');

    await page.click('#apply-submit');
    await expect(page.locator('#apply-status')).toContainText(/Saved/i, { timeout: 10_000 });

    const partner = await getPartnerByAuthUserId(userId);
    expect(partner!.studio_name).toBe('Test Studio LLC');
    expect(partner!.specializes_in).toEqual(expect.arrayContaining(['Furnishings', 'Lighting']));
    expect(partner!.avg_job_size).toBe('$5,000 – $20,000');

    // Exactly one partner row.
    expect(await countPartnersForAuthUserId(userId)).toBe(1);
  });

  test('C.4 — re-submit with different data updates the same row', async ({ page }) => {
    await page.goto('/dashboard/profile');

    // First save
    await page.fill('#studio_name', 'Original Studio');
    const firstResp = page.waitForResponse(r => r.url().includes('/partner-apply') && r.request().method() === 'POST');
    await page.click('#apply-submit');
    expect((await firstResp).status()).toBe(200);

    let partner = await getPartnerByAuthUserId(userId);
    const originalId = partner!.id;
    expect(partner!.studio_name).toBe('Original Studio');

    // Second save with different name — wait for actual network response
    // (the status text already says "Saved" so we can't use it as a signal).
    await page.fill('#studio_name', 'Renamed Studio Inc');
    const secondResp = page.waitForResponse(r => r.url().includes('/partner-apply') && r.request().method() === 'POST');
    await page.click('#apply-submit');
    expect((await secondResp).status()).toBe(200);

    partner = await getPartnerByAuthUserId(userId);
    expect(partner!.id).toBe(originalId);
    expect(partner!.studio_name).toBe('Renamed Studio Inc');
    expect(await countPartnersForAuthUserId(userId)).toBe(1);
  });
});
