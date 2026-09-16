// Camino F — password sign-in, alongside the magic link rather than instead
// of it. Doug asked for both on 2026-05-28: "I give them two choices here,
// enter your password or get a magic link".
//
// The constraint that shapes the copy: GoTrue answers the same
// "Invalid login credentials" for a wrong password, for an account with no
// password, and for an address that does not exist. So the UI cannot branch on
// that, and one message has to serve every case without leaking which it is.

import { test, expect } from '@playwright/test';
import {
  makeTestEmail,
  makeTestPassword,
  createUserWithPassword,
  createUserWithoutPassword,
  canSignInWithPassword,
  getAuthUserByEmail,
  countPartnersForAuthUserId,
  cleanupTestUser
} from './helpers/supabase';
import {
  waitForAuthReady,
  signInWithMagicLink,
  signInWithPasswordUI,
  sessionEmailInPage,
  spyOnGoTrue
} from './helpers/session';

test.describe('Camino F — password sign-in', () => {
  let testEmail: string;
  let testPassword: string;

  test.beforeEach(({ context }) => {
    testEmail = makeTestEmail();
    testPassword = makeTestPassword();
    return context.clearCookies();
  });

  test.afterEach(async () => {
    if (testEmail) await cleanupTestUser(testEmail);
  });

  test('F.1 — the right password signs in and bootstraps the partner row', async ({ page }) => {
    await createUserWithPassword(testEmail, testPassword);

    await signInWithPasswordUI(page, testEmail, testPassword);
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    await waitForAuthReady(page);

    const state = await page.evaluate(() => ({
      email: (window as any).DP_AUTH?.user?.email,
      account: (window as any).DP_AUTH?.partner?.account_number
    }));
    expect(state.email).toBe(testEmail);
    expect(state.account).toMatch(/^DP-\d+$/);

    const user = await getAuthUserByEmail(testEmail);
    expect(await countPartnersForAuthUserId(user!.id)).toBe(1);
  });

  test('F.2 — a wrong password is refused without jargon', async ({ page }) => {
    await createUserWithPassword(testEmail, testPassword);

    await signInWithPasswordUI(page, testEmail, testPassword + 'x');

    await expect(page.locator('#login-status'))
      .toHaveText(/did not match|incorrect|check your/i, { timeout: 15_000 });
    const status = await page.locator('#login-status').textContent();
    expect(status).not.toMatch(/AuthApiError|Invalid login credentials|40\d/);

    expect(page.url()).toContain('/login');
    expect(await sessionEmailInPage(page)).toBeNull();
    await expect(page.locator('#login-password-submit')).toBeEnabled();
  });

  test('F.3 — someone who never set a password is pointed at the link route', async ({ page }) => {
    await createUserWithoutPassword(testEmail);

    await signInWithPasswordUI(page, testEmail, makeTestPassword());

    // Same generic message as F.2 by design, but it has to carry the way out.
    // Wait for the settled copy, not the in-flight "signing you in".
    await expect(page.locator('#login-status'))
      .toHaveText(/did not match/i, { timeout: 15_000 });
    const status = await page.locator('#login-status').textContent();
    expect(status).toMatch(/link/i);

    // And the control to get that link is right there, usable.
    await expect(page.locator('#login-magic-submit')).toBeEnabled();
    expect(await sessionEmailInPage(page)).toBeNull();
  });

  test('F.4 — the magic link still works from the redesigned form', async ({ page }) => {
    const goTrue = spyOnGoTrue(page);

    await page.goto('/login');
    await waitForAuthReady(page);
    await page.fill('#login-email', testEmail);
    await page.click('#login-magic-submit');

    await expect(page.locator('#login-status'))
      .toHaveText(/check your inbox/i, { timeout: 15_000 });
    expect(goTrue.filter(r => /\/auth\/v1\/otp/.test(r)).length).toBeGreaterThan(0);
    expect(page.url()).toContain('/login');
  });

  test('F.5 — the password field never blocks the magic-link route', async ({ page }) => {
    await page.goto('/login');
    await waitForAuthReady(page);

    // Password is optional; email is not.
    expect(await page.locator('#login-password').getAttribute('required')).toBeNull();
    expect(await page.locator('#login-email').getAttribute('required')).not.toBeNull();

    // Leaving it empty still gets you a link.
    await page.fill('#login-email', testEmail);
    await page.click('#login-magic-submit');
    await expect(page.locator('#login-status'))
      .toHaveText(/check your inbox/i, { timeout: 15_000 });
  });

  test('F.6 — the end-to-end magic link path is unchanged', async ({ page }) => {
    // Deliberately redundant with spec 01. It is the canary for A2 not having
    // disturbed the route everyone uses today.
    await signInWithMagicLink(page, testEmail);

    const email = await page.evaluate(() => (window as any).DP_AUTH?.user?.email);
    expect(email).toBe(testEmail);

    const user = await getAuthUserByEmail(testEmail);
    expect(await countPartnersForAuthUserId(user!.id)).toBe(1);
  });

  test('F.7 — a password created from an open session then works to sign in', async ({ page }) => {
    await signInWithMagicLink(page, testEmail);

    await page.goto('/dashboard/profile');
    await waitForAuthReady(page);

    await page.fill('#new-password', testPassword);
    await page.fill('#new-password-confirm', testPassword);
    await page.click('#security-submit');

    await expect(page.locator('#security-status'))
      .toHaveText(/saved|set|updated/i, { timeout: 15_000 });

    // Out-of-band proof that something was actually written.
    expect(await canSignInWithPassword(testEmail, testPassword)).toBe(true);
  });

  test('F.8 — a mismatched confirmation never reaches the network', async ({ page }) => {
    await signInWithMagicLink(page, testEmail);
    const goTrue = spyOnGoTrue(page);

    await page.goto('/dashboard/profile');
    await waitForAuthReady(page);

    await page.fill('#new-password', testPassword);
    await page.fill('#new-password-confirm', testPassword + 'different');
    await page.click('#security-submit');

    await expect(page.locator('#security-status'))
      .toHaveText(/do not match|don.?t match/i, { timeout: 15_000 });
    expect(goTrue.filter(r => /PUT.*\/auth\/v1\/user/.test(r))).toEqual([]);
    expect(await canSignInWithPassword(testEmail, testPassword)).toBe(false);
  });

  test('F.9 — a too-short password is refused with the minimum spelled out', async ({ page }) => {
    await signInWithMagicLink(page, testEmail);

    await page.goto('/dashboard/profile');
    await waitForAuthReady(page);

    await page.fill('#new-password', 'abc');
    await page.fill('#new-password-confirm', 'abc');
    await page.click('#security-submit');

    await expect(page.locator('#security-status'))
      .toHaveText(/at least \d+ characters/i, { timeout: 15_000 });
    expect(await canSignInWithPassword(testEmail, 'abc')).toBe(false);
  });

  test('F.10 — the security form is separate from the profile form', async ({ page }) => {
    // The profile form serialises itself with FormData. A password field
    // inside it would be posted to a Netlify Function and land in its logs.
    await signInWithMagicLink(page, testEmail);
    await page.goto('/dashboard/profile');
    await waitForAuthReady(page);

    expect(await page.locator('#apply-form #security-form').count()).toBe(0);
    expect(await page.locator('#apply-form #new-password').count()).toBe(0);
    expect(await page.locator('#security-form #new-password').count()).toBe(1);
  });
});
