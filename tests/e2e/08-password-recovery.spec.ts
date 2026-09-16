// Camino G — password recovery.
//
// The recovery email is a single-use link too, so without the confirmation
// page it breaks for exactly the same people, in exactly the same way. G.3 is
// the test that pins that down.

import { test, expect } from '@playwright/test';
import {
  makeTestEmail,
  makeTestPassword,
  createUserWithPassword,
  generateEmailToken,
  confirmUrl,
  isTokenStillValid,
  canSignInWithPassword,
  cleanupTestUser
} from './helpers/supabase';
import {
  waitForAuthReady,
  signInWithPasswordUI,
  sessionEmailInPage,
  spyOnGoTrue
} from './helpers/session';

test.describe('Camino G — password recovery', () => {
  let testEmail: string;

  test.beforeEach(({ context }) => {
    testEmail = makeTestEmail();
    return context.clearCookies();
  });

  test.afterEach(async () => {
    if (testEmail) await cleanupTestUser(testEmail);
  });

  test('G.1 — /login links to the reset page', async ({ page }) => {
    await page.goto('/login');
    await waitForAuthReady(page);

    const forgot = page.locator('#login-forgot');
    await expect(forgot).toBeVisible();
    expect(await forgot.getAttribute('href')).toBe('/login/reset');
  });

  test('G.2 — requesting a reset says the same thing whether or not the account exists', async ({ page }) => {
    await createUserWithPassword(testEmail, makeTestPassword());
    const goTrue = spyOnGoTrue(page);

    await page.goto('/login/reset');
    await waitForAuthReady(page);
    await page.fill('#reset-email', testEmail);
    await page.click('#reset-submit');
    await expect(page.locator('#reset-status'))
      .toHaveText(/if that email/i, { timeout: 15_000 });
    const known = await page.locator('#reset-status').textContent();

    // Now an address that does not exist at all.
    await page.goto('/login/reset');
    await waitForAuthReady(page);
    await page.fill('#reset-email', makeTestEmail());
    await page.click('#reset-submit');
    await expect(page.locator('#reset-status'))
      .toHaveText(/if that email/i, { timeout: 15_000 });
    const unknown = await page.locator('#reset-status').textContent();

    // Identical copy, so the page never reveals which addresses are registered.
    expect(unknown).toBe(known);
    expect(known).not.toMatch(/no account|not found|does not exist/i);
    expect(goTrue.filter(r => /\/auth\/v1\/recover/.test(r)).length).toBe(2);
  });

  test('G.3 — loading the confirm page does NOT spend a recovery token', async ({ page }) => {
    await createUserWithPassword(testEmail, makeTestPassword());
    const parts = await generateEmailToken(testEmail, 'recovery');
    const goTrue = spyOnGoTrue(page);

    await page.goto(confirmUrl(parts, '/login/new-password'));
    await expect(page.locator('#confirm-submit')).toBeVisible();
    await page.waitForTimeout(2000);

    expect(goTrue.filter(r => /\/auth\/v1\/verify/.test(r))).toEqual([]);
    expect(await sessionEmailInPage(page)).toBeNull();
    expect(await isTokenStillValid(parts.tokenHash, 'recovery')).toBe(true);
  });

  test('G.4 — full recovery: link, confirm, new password, sign in with it', async ({ page }) => {
    const oldPassword = makeTestPassword('Old');
    const newPassword = makeTestPassword('New');
    await createUserWithPassword(testEmail, oldPassword);

    const parts = await generateEmailToken(testEmail, 'recovery');
    await page.goto(confirmUrl(parts, '/login/new-password'));
    await page.click('#confirm-submit');

    await page.waitForURL(/\/login\/new-password/, { timeout: 20_000 });
    await waitForAuthReady(page);

    await page.fill('#new-password', newPassword);
    await page.fill('#new-password-confirm', newPassword);
    await page.click('#new-password-submit');
    // The page redirects on success, so the destination is the assertion:
    // the success message is on screen too briefly to catch reliably.
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

    expect(await canSignInWithPassword(testEmail, newPassword)).toBe(true);
    expect(await canSignInWithPassword(testEmail, oldPassword)).toBe(false);
  });

  test('G.5 — the new password works through the real login form', async ({ page, context }) => {
    const oldPassword = makeTestPassword('Old');
    const newPassword = makeTestPassword('New');
    await createUserWithPassword(testEmail, oldPassword);

    const parts = await generateEmailToken(testEmail, 'recovery');
    await page.goto(confirmUrl(parts, '/login/new-password'));
    await page.click('#confirm-submit');
    await page.waitForURL(/\/login\/new-password/, { timeout: 20_000 });
    await waitForAuthReady(page);

    await page.fill('#new-password', newPassword);
    await page.fill('#new-password-confirm', newPassword);
    await page.click('#new-password-submit');
    // The page redirects on success, so the destination is the assertion:
    // the success message is on screen too briefly to catch reliably.
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

    // Start clean and come in the front door.
    await context.clearCookies();
    await page.evaluate(() => localStorage.clear());
    await signInWithPasswordUI(page, testEmail, newPassword);
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    await waitForAuthReady(page);

    const email = await page.evaluate(() => (window as any).DP_AUTH?.user?.email);
    expect(email).toBe(testEmail);
  });

  test('G.6 — the recovery page asks for one thing and nothing else', async ({ page }) => {
    await createUserWithPassword(testEmail, makeTestPassword());
    const parts = await generateEmailToken(testEmail, 'recovery');

    await page.goto(confirmUrl(parts, '/login/new-password'));
    await page.click('#confirm-submit');
    await page.waitForURL(/\/login\/new-password/, { timeout: 20_000 });
    await waitForAuthReady(page);

    // The heading is about the password, not about the studio profile.
    await expect(page.locator('h1')).toHaveText(/password/i);
    // And the profile form is nowhere near it.
    expect(await page.locator('#apply-form').count()).toBe(0);
  });

  test('G.7 — without a session the page sends you back to ask for a link', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/login/new-password', { waitUntil: 'commit' });
    await page.waitForURL(/\/login\/reset/, { timeout: 20_000 });
    expect(page.url()).toContain('/login/reset');
  });

  test('G.8 — mismatched and too-short passwords are caught before the network', async ({ page }) => {
    await createUserWithPassword(testEmail, makeTestPassword());
    const parts = await generateEmailToken(testEmail, 'recovery');
    await page.goto(confirmUrl(parts, '/login/new-password'));
    await page.click('#confirm-submit');
    await page.waitForURL(/\/login\/new-password/, { timeout: 20_000 });
    await waitForAuthReady(page);

    const goTrue = spyOnGoTrue(page);

    await page.fill('#new-password', 'abc');
    await page.fill('#new-password-confirm', 'abc');
    await page.click('#new-password-submit');
    await expect(page.locator('#new-password-status'))
      .toHaveText(/at least \d+ characters/i, { timeout: 15_000 });

    const good = makeTestPassword();
    await page.fill('#new-password', good);
    await page.fill('#new-password-confirm', good + 'different');
    await page.click('#new-password-submit');
    await expect(page.locator('#new-password-status'))
      .toHaveText(/do not match/i, { timeout: 15_000 });

    expect(goTrue.filter(r => /PUT.*\/auth\/v1\/user/.test(r))).toEqual([]);
  });
});
