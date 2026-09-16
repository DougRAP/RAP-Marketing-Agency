// Camino E — /login/confirm redeems the sign-in token only on a real click.
//
// Why this page exists: Microsoft Defender (and every other corporate link
// scanner) fetches links inside incoming email to inspect them. Supabase's
// default confirmation URL is a GET that spends a single-use token, so the
// scanner burns it and the human arrives to "otp_expired". This page holds the
// token and spends it only when someone clicks.
//
// E.1 is the test that matters: loading the page must leave the token usable.

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  makeTestEmail,
  generateEmailToken,
  confirmUrl,
  isTokenStillValid,
  getPartnerByAuthUserId,
  countPartnersForAuthUserId,
  getAuthUserByEmail,
  cleanupTestUser
} from './helpers/supabase';
import { waitForAuthReady, sessionEmailInPage, spyOnGoTrue } from './helpers/session';

test.describe('Camino E — /login/confirm', () => {
  let testEmail: string;

  test.beforeEach(() => {
    testEmail = makeTestEmail();
  });

  test.afterEach(async () => {
    if (testEmail) await cleanupTestUser(testEmail);
  });

  test('E.1 — loading the page does NOT spend the token', async ({ page, context }) => {
    await context.clearCookies();
    const parts = await generateEmailToken(testEmail);
    const goTrue = spyOnGoTrue(page);

    await page.goto(confirmUrl(parts));
    await expect(page.locator('#confirm-submit')).toBeVisible();
    // Give any stray timer or deferred script a chance to misbehave.
    await page.waitForTimeout(2000);

    expect(goTrue.filter(r => /\/auth\/v1\/verify/.test(r))).toEqual([]);
    expect(await sessionEmailInPage(page)).toBeNull();
    expect(page.url()).toContain('/login/confirm');

    // The decisive one: a real visitor could still use this link.
    expect(await isTokenStillValid(parts.tokenHash)).toBe(true);
  });

  test('E.2 — a scanner-style fetch with no JavaScript does not spend it', async ({ page }) => {
    const parts = await generateEmailToken(testEmail);
    const url = confirmUrl(parts);

    // APIRequestContext issues raw HTTP and runs no scripts, which is what a
    // link scanner does when it pre-fetches.
    const get = await page.request.get(url);
    expect(get.status()).toBe(200);

    expect(await isTokenStillValid(parts.tokenHash)).toBe(true);
  });

  test('E.3 — clicking signs the visitor in and bootstraps their partner row', async ({ page, context }) => {
    await context.clearCookies();
    const parts = await generateEmailToken(testEmail);
    const goTrue = spyOnGoTrue(page);

    await page.goto(confirmUrl(parts));
    await page.click('#confirm-submit');
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    await waitForAuthReady(page);

    const state = await page.evaluate(() => ({
      email: (window as any).DP_AUTH?.user?.email,
      account: (window as any).DP_AUTH?.partner?.account_number
    }));
    expect(state.email).toBe(testEmail);
    expect(state.account).toMatch(/^DP-\d+$/);

    expect(goTrue.filter(r => /\/auth\/v1\/verify/.test(r))).toHaveLength(1);

    const user = await getAuthUserByEmail(testEmail);
    expect(await getPartnerByAuthUserId(user!.id)).toBeTruthy();
    expect(await countPartnersForAuthUserId(user!.id)).toBe(1);

    // One-shot: the token is spent now.
    expect(await isTokenStillValid(parts.tokenHash)).toBe(false);
  });

  test('E.4 — a missing token explains itself instead of crashing', async ({ page, context }) => {
    await context.clearCookies();
    const pageErrors: string[] = [];
    page.on('pageerror', e => pageErrors.push(e.message));

    await page.goto('/login/confirm');

    const status = await page.locator('#confirm-status').textContent();
    expect(status).toMatch(/link|expired|incomplete|invalid/i);
    expect(status).not.toMatch(/undefined|null|\[object|AuthApiError/);
    await expect(page.locator('#confirm-submit')).toBeDisabled();
    // There is always a way out.
    await expect(page.locator('main a[href="/login"]')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('E.5 — a bad token shows readable copy and signs nobody in', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/login/confirm?token_hash=not-a-real-token&type=magiclink');
    await page.click('#confirm-submit');

    // Wait for the request to settle rather than reading the in-flight copy.
    await expect(page.locator('#confirm-status'))
      .toHaveText(/expired|no longer valid|request a new/i, { timeout: 15_000 });
    const status = await page.locator('#confirm-status').textContent();
    expect(status).not.toMatch(/AuthApiError|Error:|40\d/);
    expect(await sessionEmailInPage(page)).toBeNull();
    expect(page.url()).toContain('/login/confirm');
  });

  test('E.6 — an off-site next is ignored, no open redirect', async ({ page, context }) => {
    await context.clearCookies();
    const parts = await generateEmailToken(testEmail);

    await page.goto(confirmUrl(parts, 'https://evil.example.com/x'));
    await page.click('#confirm-submit');
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

    expect(new URL(page.url()).origin).toBe('http://localhost:8888');
  });

  test('E.7 — double click redeems once, not twice', async ({ page, context }) => {
    await context.clearCookies();
    const parts = await generateEmailToken(testEmail);
    const goTrue = spyOnGoTrue(page);

    await page.goto(confirmUrl(parts));
    await page.locator('#confirm-submit').dblclick();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

    expect(goTrue.filter(r => /\/auth\/v1\/verify/.test(r))).toHaveLength(1);
  });

  test('E.8 — the confirm page is not behind the auth gate', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/login/confirm');
    await page.waitForTimeout(3000);

    // A copy-pasted gate() would have bounced us to /login by now.
    expect(page.url()).toContain('/login/confirm');
  });
});

test.describe('Camino E — security headers', () => {
  // Without X-Frame-Options the confirmation click can be stolen through an
  // invisible iframe, which would defeat the whole page.
  //
  // `netlify dev --dir` serves through a simple static server that does not
  // apply _headers, so this asserts the rules are declared. That they are
  // actually served is verified against production after deploy, and is in
  // the manual checklist.
  test('E.9 — the _headers file declares the rules the confirm page relies on', () => {
    const file = path.resolve(__dirname, '../../designer-plan-site/_headers');
    expect(fs.existsSync(file), '_headers must live in the publish root').toBe(true);

    const rules = fs.readFileSync(file, 'utf-8');
    expect(rules).toMatch(/X-Frame-Options:\s*DENY/i);
    expect(rules).toMatch(/X-Content-Type-Options:\s*nosniff/i);
    expect(rules).toMatch(/\/login\/\*/);
    expect(rules).toMatch(/Referrer-Policy:\s*no-referrer/i);
    expect(rules).toMatch(/Cache-Control:\s*no-store/i);
  });
});
