// Camino B — magic-link sign-in creates a partner row automatically.
// Uses Supabase admin API to generate the magic-link URL programmatically,
// then visits it like a real user would.

import { test, expect } from '@playwright/test';
import {
  makeTestEmail,
  generateMagicLink,
  getPartnerByAuthUserId,
  countPartnersForAuthUserId,
  cleanupTestUser,
  supabaseAdmin
} from './helpers/supabase';

test.describe('Camino B — magic-link sign-in', () => {
  let testEmail: string;

  test.beforeEach(() => {
    testEmail = makeTestEmail();
  });

  test.afterEach(async () => {
    if (testEmail) await cleanupTestUser(testEmail);
  });

  test('B.1 — magic-link click establishes session and auto-creates partner row', async ({ page, context }) => {
    await context.clearCookies();

    // Generate the verify URL via admin API (no email actually sent).
    const link = await generateMagicLink(testEmail, 'http://localhost:8888/dashboard');

    // Visit the link — Supabase verifies the token and 302s to /dashboard
    // with #access_token=... in the hash.
    await page.goto(link);

    // Wait for the dashboard to land + session to bootstrap.
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    // Give auth.js time to run public-config fetch + getSession + account-bootstrap + partner select.
    await page.waitForFunction(
      () => (window as any).DP_AUTH && (window as any).DP_AUTH.ready === true,
      { timeout: 20_000 }
    );

    // Verify DP_AUTH state.
    const authState = await page.evaluate(() => ({
      email: (window as any).DP_AUTH?.user?.email,
      partner: (window as any).DP_AUTH?.partner
    }));
    expect(authState.email).toBe(testEmail);
    expect(authState.partner).toBeTruthy();
    expect(authState.partner.account_number).toMatch(/^DP-\d+$/);

    // Verify in DB: a partners row exists for this user.
    const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
    const user = usersData?.users?.find(u => u.email === testEmail);
    expect(user, 'auth user should exist').toBeTruthy();

    const partner = await getPartnerByAuthUserId(user!.id);
    expect(partner, 'partners row should exist').toBeTruthy();
    expect(partner!.status).toBe('approved');
    expect(partner!.lifecycle_status).toBe('account_created');
    expect(partner!.account_number).toMatch(/^DP-\d+$/);
    expect(partner!.lead_id, 'partner should be linked to a leads row').toBeTruthy();

    // Verify the linked lead has the right email (email lives on leads, not partners)
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('email')
      .eq('id', partner!.lead_id)
      .single();
    expect(lead!.email).toBe(testEmail);

    // Exactly one row, no duplicates.
    const count = await countPartnersForAuthUserId(user!.id);
    expect(count).toBe(1);
  });

  test('B.2 — second sign-in for same user does NOT create a duplicate partner row', async ({ page, context }) => {
    // First sign-in
    const link1 = await generateMagicLink(testEmail, 'http://localhost:8888/dashboard');
    await page.goto(link1);
    await page.waitForFunction(
      () => (window as any).DP_AUTH && (window as any).DP_AUTH.ready === true,
      { timeout: 20_000 }
    );

    const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
    const user = usersData?.users?.find(u => u.email === testEmail)!;
    const initialCount = await countPartnersForAuthUserId(user.id);
    expect(initialCount).toBe(1);

    // Clear session and sign in again with a fresh link
    await context.clearCookies();
    await page.evaluate(() => localStorage.clear());

    const link2 = await generateMagicLink(testEmail, 'http://localhost:8888/dashboard');
    await page.goto(link2);
    await page.waitForFunction(
      () => (window as any).DP_AUTH && (window as any).DP_AUTH.ready === true,
      { timeout: 20_000 }
    );

    // Still only one row.
    const finalCount = await countPartnersForAuthUserId(user.id);
    expect(finalCount).toBe(1);
  });
});
