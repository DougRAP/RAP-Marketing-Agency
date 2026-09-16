// Browser-side arrange helpers. Kept out of helpers/supabase.ts so that file
// stays a pure service-role module, as its own header promises.

import type { Page, Request } from '@playwright/test';
import { generateMagicLink } from './supabase';

/** The wait every spec repeats: auth.js has resolved and published its state. */
export async function waitForAuthReady(page: Page, timeout = 20_000): Promise<void> {
  await page.waitForFunction(
    () => (window as any).DP_AUTH && (window as any).DP_AUTH.ready === true,
    { timeout }
  );
}

/** Signs in the way the existing specs do, so the arrange step stays identical. */
export async function signInWithMagicLink(
  page: Page,
  email: string,
  landing = 'http://localhost:8888/dashboard'
): Promise<void> {
  const link = await generateMagicLink(email, landing);
  await page.goto(link);
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  await waitForAuthReady(page);
}

/** Drives the real /login UI with a password. No admin shortcuts. */
export async function signInWithPasswordUI(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto('/login');
  await waitForAuthReady(page);
  await page.fill('#login-email', email);
  await page.fill('#login-password', password);
  await page.click('#login-password-submit');
}

/** Reads the live session from the page itself, not from our admin client. */
export async function sessionEmailInPage(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const sb = (window as any).dpSupabase;
    if (!sb) return null;
    const res = await sb.auth.getSession();
    return (res && res.data && res.data.session && res.data.session.user.email) || null;
  });
}

/**
 * Records every GoTrue call the page makes. The confirmation-page tests assert
 * this stays empty until the visitor clicks, which is the whole anti-scanner
 * guarantee. The returned array is mutated in place: assert on it after the
 * action, not before.
 */
export function spyOnGoTrue(page: Page): string[] {
  const requests: string[] = [];
  page.on('request', (req: Request) => {
    const url = req.url();
    if (/\/auth\/v1\/(verify|otp|token|recover|user)/.test(url)) {
      requests.push(`${req.method()} ${url}`);
    }
  });
  return requests;
}
