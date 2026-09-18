// Dashboard live data (phase 2, lane 2): the sales and commission fields come
// from /.netlify/functions/dashboard-data instead of the sample markup.
//
// L.1 to L.6 mock the BFF at the network layer so every state of contract C
// (linked with sales, linked with no sales, not linked, unavailable) renders
// deterministically. L.7 lets the real BFF answer and checks the wire shape
// of contract B (Bearer, no query string, no-store).

import { test, expect, Page } from '@playwright/test';
import { makeTestEmail, cleanupTestUser } from './helpers/supabase';
import { signInWithMagicLink, waitForAuthReady } from './helpers/session';

const BFF_GLOB = '**/.netlify/functions/dashboard-data';

const LINKED_WITH_SALES = {
  linked: true,
  dealer_id: 421,
  affiliated_id: 'AB-RPFG',
  dealer_name: 'Adrian Barres',
  stripe_status: 'NOT_CONNECTED',
  tracked_cents: 178840,
  pending_cents: 93600,
  payable_cents: 0,
  paid_cents: 85240,
  total_sales: 3,
  commissions: [
    {
      plan_registration_id: 12345,
      purchase_date: '2026-09-09',
      customer_last_name: 'Estevez',
      customer_email: 'qafake005@rapqa.com',
      plan_number: 'QAFAKE-W005',
      plan_type: 'Plan B',
      retail_paid_cents: 304000,
      commission_cents: 30400,
      commission_status: 'Pending',
      months_coverage: 36,
      months_remaining: 36,
      plan_sent: true
    },
    {
      plan_registration_id: 12002,
      purchase_date: '2023-08-01',
      customer_last_name: 'Miller',
      customer_email: 'qafake002@rapqa.com',
      plan_number: 'QAFAKE-W002',
      plan_type: 'Plan A',
      retail_paid_cents: 122000,
      commission_cents: 12200,
      commission_status: 'Paid',
      months_coverage: 36,
      months_remaining: 0,
      plan_sent: true
    },
    {
      plan_registration_id: 12003,
      purchase_date: '2024-09-01',
      customer_last_name: 'Estevez',
      customer_email: 'qafake005@rapqa.com',
      plan_number: 'QAFAKE-W003',
      plan_type: 'Plan C',
      retail_paid_cents: 140000,
      commission_cents: 14000,
      commission_status: 'Pending',
      months_coverage: 36,
      months_remaining: 12,
      plan_sent: false
    }
  ]
};

const LINKED_NO_SALES = {
  linked: true,
  dealer_id: 421,
  affiliated_id: 'AB-RPFG',
  dealer_name: 'Adrian Barres',
  stripe_status: 'NOT_CONNECTED',
  tracked_cents: 0,
  pending_cents: 0,
  payable_cents: 0,
  paid_cents: 0,
  total_sales: 0,
  commissions: []
};

const NOT_LINKED = { linked: false };

const UNAVAILABLE = {
  code: 'upstream_unavailable',
  message: 'Sales data is temporarily unavailable. Please try again.'
};

const NOT_LINKED_SENTENCE = 'once your account is matched';

async function serveDashboardData(page: Page, status: number, body: unknown): Promise<void> {
  await page.unroute(BFF_GLOB);
  await page.route(BFF_GLOB, (route) => route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'cache-control': 'no-store' },
    body: JSON.stringify(body)
  }));
}

async function openOverview(page: Page): Promise<void> {
  await page.goto('/dashboard/overview/');
  await waitForAuthReady(page);
}

test.describe('Dashboard live data', () => {
  let testEmail: string;

  test.beforeEach(async ({ page, context }) => {
    testEmail = makeTestEmail();
    await context.clearCookies();
    await signInWithMagicLink(page, testEmail);
  });

  test.afterEach(async () => {
    if (testEmail) await cleanupTestUser(testEmail);
  });

  test('L.1 linked with sales: overview shows the real figures and drops the sample labels', async ({ page }) => {
    await serveDashboardData(page, 200, LINKED_WITH_SALES);
    await openOverview(page);

    // commission-tracked appears twice on the overview (hero + ledger): both fill.
    const tracked = page.locator('[data-field="commission-tracked"]');
    await expect(tracked).toHaveCount(2);
    await expect(tracked.nth(0)).toHaveText('$1,788.40');
    await expect(tracked.nth(1)).toHaveText('$1,788.40');
    await expect(page.locator('[data-field="commission-pending"]')).toHaveText('$936.00');
    await expect(page.locator('[data-field="commission-payable"]')).toHaveText('$0.00');
    await expect(page.locator('[data-field="commission-paid"]')).toHaveText('$852.40');
    await expect(page.locator('[data-field="plans-sold"]')).toHaveText('3');

    // SOAR's affiliated id overrides the (empty) Supabase referral code.
    await expect(page.locator('[data-field="referral-code"]')).toHaveText('AB-RPFG');
    await expect(page.locator('[data-field="client-link"]')).toHaveText('thedesignerplan.com/plans?ref=AB-RPFG');
    const copyButtons = page.locator('[data-action="copy-referral-code"], [data-action="copy-client-link"]');
    const count = await copyButtons.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(copyButtons.nth(i)).toBeEnabled();
    }

    // Nothing on the page calls the numbers a sample any more.
    await expect(page.locator('#preview-ribbon')).toBeHidden();
    await expect(page.locator('.hero__sample-note')).toBeHidden();
    await expect(page.locator('.dp-sample-note')).toHaveCount(0);
    await expect(page.locator('.dp-sales-note')).toHaveCount(0);

    const summary = page.locator('[data-field="clients-summary"]');
    await expect(summary).toContainText('2 active plans');
    await expect(summary).toContainText('0 links sent');
    await expect(summary).toContainText('$1,788.40 tracked');

    await expect(page.locator('[data-field="stripe-note"]')).toContainText('Stripe not connected yet');
    await expect(page.locator('[data-field="setup-checklist"] li', { hasText: /Stripe connected/ }))
      .not.toHaveClass(/is-done/);
  });

  test('L.2 linked with sales: clients page builds the table from the commissions', async ({ page }) => {
    await serveDashboardData(page, 200, LINKED_WITH_SALES);
    await page.goto('/dashboard/clients/');
    await waitForAuthReady(page);

    await expect(page.locator('[data-field="active-plans"]')).toHaveText('2');
    await expect(page.locator('[data-field="links-sent"]')).toHaveText('0');
    await expect(page.locator('[data-field="commission-tracked"]')).toHaveText('$1,788.40');
    await expect(page.locator('[data-field="total-clients"]')).toHaveText('2');

    const rows = page.locator('[data-field="clients-table"] tr.client-row');
    await expect(rows).toHaveCount(3);

    const first = rows.nth(0);
    await expect(first.locator('td').nth(0)).toHaveText('Estevez');
    await expect(first.locator('td').nth(2)).toHaveText('Plan B');
    await expect(first.locator('td').nth(3)).toHaveText('Active');
    await expect(first.locator('td').nth(3).locator('.status-pill')).toHaveClass(/status-pill--active/);
    await expect(first.locator('td').nth(4)).toHaveText('$304.00 pending');

    // The sample clients are gone.
    await expect(page.locator('body')).not.toContainText('Miller Residence');
    await expect(page.locator('body')).not.toContainText('Harper Project');

    // Clicking a row still opens its detail row.
    const expanded = page.locator('[data-field="clients-table"] tr.expanded-row').nth(0);
    await expect(expanded).toHaveClass(/is-hidden/);
    await first.click();
    await expect(expanded).not.toHaveClass(/is-hidden/);
    await expect(expanded).toContainText('QAFAKE-W005');
  });

  test('L.3 linked with no sales: zeros and a "no sales yet" note, no empty table', async ({ page }) => {
    await serveDashboardData(page, 200, LINKED_NO_SALES);
    await openOverview(page);

    await expect(page.locator('[data-field="commission-tracked"]').nth(0)).toHaveText('$0.00');
    await expect(page.locator('[data-field="commission-pending"]')).toHaveText('$0.00');
    await expect(page.locator('[data-field="commission-payable"]')).toHaveText('$0.00');
    await expect(page.locator('[data-field="commission-paid"]')).toHaveText('$0.00');
    await expect(page.locator('[data-field="plans-sold"]')).toHaveText('0');

    const note = page.locator('.dp-sales-note[data-sales-state="no-sales"]');
    await expect(note).toBeVisible();
    await expect(note).toContainText('No sales yet');
    await expect(page.locator('#preview-ribbon')).toBeHidden();

    await page.goto('/dashboard/clients/');
    await waitForAuthReady(page);
    await expect(page.locator('[data-field="clients-table"] tr.client-row')).toHaveCount(0);
    await expect(page.locator('[data-field="clients-table"] td')).toContainText('No sales yet');
  });

  test('L.4 not linked: account fields from Supabase, sales explained as not matched yet', async ({ page }) => {
    await serveDashboardData(page, 200, NOT_LINKED);
    await openOverview(page);

    const ribbon = page.locator('#preview-ribbon');
    await expect(ribbon).toBeVisible();
    await expect(ribbon).toContainText('Your account is live');
    await expect(ribbon).toContainText(NOT_LINKED_SENTENCE);
    await expect(ribbon).not.toContainText('sample data');

    const note = page.locator('.dp-sales-note[data-sales-state="not-linked"]');
    await expect(note).toBeVisible();
    await expect(note).toContainText(NOT_LINKED_SENTENCE);

    // No affiliated id from the engine, no referral code in Supabase: say so.
    await expect(page.locator('[data-field="referral-code"]')).toHaveText('Not assigned yet');
    const copyButtons = page.locator('[data-action="copy-referral-code"], [data-action="copy-client-link"]');
    const count = await copyButtons.count();
    for (let i = 0; i < count; i++) {
      await expect(copyButtons.nth(i)).toBeDisabled();
    }

    await expect(page.locator('[data-field="commission-tracked"]').nth(0)).toHaveText('$0.00');
    await expect(page.locator('[data-field="commission-pending"]')).toHaveText('$0.00');
    await expect(page.locator('[data-field="plans-sold"]')).toHaveText('0');

    // Stripe copy comes from the partners row, as before the bridge.
    await expect(page.locator('[data-field="stripe-note"]'))
      .toHaveText('Stripe not connected yet. Connect it to receive commission.');
  });

  test('L.5 BFF down: account data still renders and the figures are marked unavailable', async ({ page }) => {
    await serveDashboardData(page, 502, UNAVAILABLE);

    // The landing page (where sign-in leaves us) carries the account number;
    // it comes from Supabase and must not depend on the BFF at all.
    await expect(page.locator('[data-field="account-number"]')).toHaveText(/^DP-\d+$/);

    await openOverview(page);
    await expect(page.locator('[data-field="studio-name"]').first()).toHaveText(testEmail);

    const ribbon = page.locator('#preview-ribbon');
    await expect(ribbon).toBeVisible();
    await expect(ribbon).toContainText(NOT_LINKED_SENTENCE);

    const note = page.locator('.dp-sales-note[data-sales-state="unavailable"]');
    await expect(note).toBeVisible();
    await expect(note).toContainText(NOT_LINKED_SENTENCE);

    const tracked = page.locator('[data-field="commission-tracked"]').nth(0);
    await expect(tracked).not.toHaveText('$843');
    await expect(tracked).toHaveText('\u2014');
  });

  test('L.6 Stripe status from the engine drives the note and the checklist', async ({ page }) => {
    const cases: Array<[string, string, boolean]> = [
      ['PENDING', 'Stripe setup is in progress. Finish the Stripe steps to receive commission.', false],
      ['RESTRICTED', 'Stripe needs more information before payouts can go out. Open Stripe to finish.', false],
      ['READY', 'Stripe connected. Commission is paid straight to your account.', true]
    ];

    for (const [status, copy, done] of cases) {
      await serveDashboardData(page, 200, { ...LINKED_WITH_SALES, stripe_status: status });
      await openOverview(page);

      const buttonsBefore = await page.locator('[data-action="connect-stripe"]').count();
      await expect(page.locator('[data-field="stripe-note"]')).toHaveText(copy);

      const li = page.locator('[data-field="setup-checklist"] li', { hasText: /Stripe connected/ });
      if (done) {
        await expect(li).toHaveClass(/is-done/);
        await expect(li.locator('.check-icon')).toHaveClass(/check-icon--done/);
      } else {
        await expect(li).not.toHaveClass(/is-done/);
      }
      expect(await page.locator('[data-action="connect-stripe"]').count()).toBe(buttonsBefore);
    }
  });

  test('L.7 real BFF: Bearer on the request, no query string, no-store on the answer', async ({ page }) => {
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/.netlify/functions/dashboard-data')),
      openOverview(page)
    ]);

    expect([200, 502]).toContain(response.status());
    const request = response.request();
    expect(request.method()).toBe('GET');
    expect(request.headers()['authorization']).toMatch(/^Bearer .+/);
    expect(request.url()).not.toContain('?');
    expect(response.headers()['cache-control']).toBe('no-store');

    // A fresh test account is not in SOAR (and if the engine is down the page
    // says the same thing): either way the sales are explained, not sampled.
    await expect(page.locator('.dp-sales-note')).toContainText(NOT_LINKED_SENTENCE);
    await expect(page.locator('#preview-ribbon')).not.toContainText('sample data');
  });
});
