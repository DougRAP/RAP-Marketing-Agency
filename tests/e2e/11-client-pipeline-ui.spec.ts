// Client pipeline UI (phase 2, B7): the clients page renders the union of
// the designer's prospects and their sales from dashboard-data's `clients`
// (contract F), with the add-client form and the send-link action.
//
// U.1, U.2 and U.4 mock the BFF at the network layer so the rendering is
// deterministic. U.3 lets the real BFF and the real functions answer for a
// fresh account: add a client through the form, see it in the table and in
// partner_clients, then try to send the link to an account that is not
// linked. No real account is ever used here.

import { test, expect, Page } from '@playwright/test';
import {
  makeTestEmail,
  cleanupTestUser,
  getAuthUserByEmail,
  getPartnerByAuthUserId,
  getPartnerClients
} from './helpers/supabase';
import { signInWithMagicLink, waitForAuthReady } from './helpers/session';

const BFF_GLOB = '**/.netlify/functions/dashboard-data';

const NOT_LINKED_NOTE =
  'Sales will appear here once your account is matched to our records. Sending links becomes available then.';
const UNAVAILABLE_ROW = 'We could not load your clients right now.';
const EMPTY_ROW = 'No clients yet. Add a client to send them your plan link.';

const HARPER_SALE = {
  plan_registration_id: 501,
  purchase_date: '2026-09-09',
  customer_last_name: 'Harper',
  customer_email: 'harper@example.com',
  plan_number: 'QAFAKE-W501',
  plan_type: 'Plan B',
  retail_paid_cents: 304000,
  commission_cents: 30400,
  commission_status: 'Pending',
  months_coverage: 36,
  months_remaining: 30,
  plan_sent: true
};

const HARPER_CLIENT = {
  id: '11111111-1111-4111-8111-111111111111',
  client_name: 'Harper Project',
  project_name: 'Dining Room',
  client_email: 'harper@example.com',
  status: 'active',
  link_sent_at: '2026-09-10T14:02:11Z',
  link_sent_count: 1,
  plan_number: 'QAFAKE-W501',
  months_remaining: 30,
  plan_registration_id: 501
};

const BROWN_CLIENT = {
  id: '22222222-2222-4222-8222-222222222222',
  client_name: 'Brown Residence',
  project_name: 'Bedroom',
  client_email: 'brown@example.com',
  status: 'link_sent',
  link_sent_at: '2026-09-17T09:00:00Z',
  link_sent_count: 2,
  plan_number: null,
  months_remaining: null,
  plan_registration_id: null
};

const WESTON_CLIENT = {
  id: '33333333-3333-4333-8333-333333333333',
  client_name: 'Weston Condo',
  project_name: null,
  client_email: 'weston@example.com',
  status: 'added',
  link_sent_at: null,
  link_sent_count: 0,
  plan_number: null,
  months_remaining: null,
  plan_registration_id: null
};

const LINKED_WITH_CLIENTS = {
  linked: true,
  dealer_id: 421,
  affiliated_id: 'AB-RPFG',
  dealer_name: 'Adrian Barres',
  stripe_status: 'NOT_CONNECTED',
  tracked_cents: 30400,
  pending_cents: 30400,
  payable_cents: 0,
  paid_cents: 0,
  total_sales: 1,
  commissions: [HARPER_SALE],
  clients: [HARPER_CLIENT, BROWN_CLIENT, WESTON_CLIENT]
};

const NOT_LINKED_WITH_PROSPECT = {
  linked: false,
  clients: [WESTON_CLIENT]
};

const UNAVAILABLE = {
  code: 'upstream_unavailable',
  message: 'Sales data is temporarily unavailable. Please try again.'
};

async function serveDashboardData(page: Page, status: number, body: unknown): Promise<void> {
  await page.unroute(BFF_GLOB);
  await page.route(BFF_GLOB, (route) => route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'cache-control': 'no-store' },
    body: JSON.stringify(body)
  }));
}

async function openClients(page: Page): Promise<void> {
  await page.goto('/dashboard/clients/');
  await waitForAuthReady(page);
}

const rows = (page: Page) => page.locator('[data-field="clients-table"] tr.client-row');
const cellsOf = (page: Page, i: number) => rows(page).nth(i).locator('td');

test.describe('Client pipeline UI', () => {
  let testEmail: string;

  test.beforeEach(async ({ page, context }) => {
    testEmail = makeTestEmail();
    await context.clearCookies();
    await signInWithMagicLink(page, testEmail);
  });

  test.afterEach(async () => {
    if (testEmail) await cleanupTestUser(testEmail);
  });

  test('U.1 linked: sales and prospects render as one list with counts, actions and filters', async ({ page }) => {
    await serveDashboardData(page, 200, LINKED_WITH_CLIENTS);
    await openClients(page);

    await expect(rows(page)).toHaveCount(3);
    await expect(page.locator('[data-field="links-sent"]')).toHaveText('1');
    await expect(page.locator('[data-field="total-clients"]')).toHaveText('3');
    await expect(page.locator('[data-field="active-plans"]')).toHaveText('1');
    await expect(page.locator('[data-field="commission-tracked"]')).toHaveText('$304.00');

    // The matched sale shows once, under the prospect's name, not the last name.
    await expect(cellsOf(page, 0).nth(0)).toHaveText('Harper Project');
    await expect(cellsOf(page, 0).nth(1)).toHaveText('Dining Room');
    await expect(cellsOf(page, 0).nth(2)).toHaveText('Plan B');
    await expect(cellsOf(page, 0).nth(3)).toHaveText('Active');
    await expect(cellsOf(page, 0).nth(3).locator('.status-pill')).toHaveClass(/status-pill--active/);
    await expect(cellsOf(page, 0).nth(4)).toHaveText('$304.00 pending');
    await expect(cellsOf(page, 0).nth(5)).toHaveText('');
    await expect(page.locator('[data-field="clients-table"] .client-name', { hasText: 'Harper' })).toHaveCount(1);

    await expect(cellsOf(page, 1).nth(0)).toHaveText('Brown Residence');
    await expect(cellsOf(page, 1).nth(3)).toHaveText('Link sent');
    await expect(cellsOf(page, 1).nth(3).locator('.status-pill')).toHaveClass(/status-pill--sent/);
    await expect(cellsOf(page, 1).nth(4)).toHaveText('');
    const resend = cellsOf(page, 1).nth(5).locator('[data-action="send-link"]');
    await expect(resend).toHaveText('Resend link');
    await expect(resend).toHaveAttribute('data-client-id', BROWN_CLIENT.id);
    await expect(resend).not.toHaveAttribute('aria-disabled', 'true');

    await expect(cellsOf(page, 2).nth(0)).toHaveText('Weston Condo');
    await expect(cellsOf(page, 2).nth(1)).toHaveText('');
    await expect(cellsOf(page, 2).nth(3)).toHaveText('Added');
    await expect(cellsOf(page, 2).nth(5).locator('[data-action="send-link"]')).toHaveText('Send link');

    // The sample clients are gone and the not-linked note is not shown.
    await expect(page.locator('body')).not.toContainText('Miller Residence');
    await expect(page.locator('[data-field="clients-note"]')).toBeHidden();

    // A rendered row expands to its details.
    const expanded = page.locator('[data-field="clients-table"] tr.expanded-row').nth(0);
    await expect(expanded).toHaveClass(/is-hidden/);
    await rows(page).nth(0).click();
    await expect(expanded).not.toHaveClass(/is-hidden/);
    await expect(expanded).toContainText('Email: harper@example.com');
    await expect(expanded).toContainText('Plan number: QAFAKE-W501');
    await expect(expanded).toContainText('30 months remaining');

    // Status filter.
    const statusFilter = page.locator('select[data-action="filter-status"]');
    await expect(statusFilter.locator('option')).toHaveCount(5);
    await statusFilter.selectOption('link_sent');
    await expect(rows(page)).toHaveCount(1);
    await expect(cellsOf(page, 0).nth(0)).toHaveText('Brown Residence');
    await statusFilter.selectOption('all');
    await expect(rows(page)).toHaveCount(3);

    // Search matches the email too.
    const search = page.locator('input[data-action="filter-search"]');
    await search.fill('WESTON@');
    await expect(rows(page)).toHaveCount(1);
    await expect(cellsOf(page, 0).nth(0)).toHaveText('Weston Condo');
    await search.fill('');
    await expect(rows(page)).toHaveCount(3);
  });

  test('U.2 not linked: prospects render, send is disabled and the note explains why', async ({ page }) => {
    await serveDashboardData(page, 200, NOT_LINKED_WITH_PROSPECT);
    await openClients(page);

    await expect(rows(page)).toHaveCount(1);
    await expect(cellsOf(page, 0).nth(0)).toHaveText('Weston Condo');
    await expect(cellsOf(page, 0).nth(3)).toHaveText('Added');
    await expect(page.locator('[data-field="total-clients"]')).toHaveText('1');
    await expect(page.locator('[data-field="links-sent"]')).toHaveText('0');

    const send = cellsOf(page, 0).nth(5).locator('[data-action="send-link"]');
    await expect(send).toHaveText('Send link');
    await expect(send).toHaveAttribute('aria-disabled', 'true');

    const note = page.locator('[data-field="clients-note"]');
    await expect(note).toBeVisible();
    await expect(note).toHaveText(NOT_LINKED_NOTE);

    // Clicking the disabled action repeats the note instead of calling anything.
    let sendCalls = 0;
    await page.route('**/.netlify/functions/client-send-link', (route) => { sendCalls++; return route.continue(); });
    await send.click();
    await expect(page.locator('#clients-status')).toHaveText(NOT_LINKED_NOTE);
    expect(sendCalls).toBe(0);
  });

  test('U.3 real path: add a client through the form, then send to an unlinked account', async ({ page }) => {
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/.netlify/functions/dashboard-data')),
      openClients(page)
    ]);
    expect([200, 502]).toContain(response.status());
    const engineUp = response.status() === 200;
    test.info().annotations.push({
      type: 'engine',
      description: engineUp
        ? 'BFF 200 (engine reachable, fresh account not linked): expecting the not-linked note'
        : 'BFF 502 (engine unreachable): expecting the unavailable row'
    });

    const note = page.locator('[data-field="clients-note"]');
    if (engineUp) {
      await expect(note).toBeVisible();
      await expect(note).toHaveText(NOT_LINKED_NOTE);
      await expect(page.locator('[data-field="clients-table"] td')).toContainText(EMPTY_ROW);
    } else {
      await expect(page.locator('[data-field="clients-table"] td')).toContainText(UNAVAILABLE_ROW);
    }
    await expect(rows(page)).toHaveCount(0);

    // Add a client through the form.
    const form = page.locator('#add-client-form');
    await expect(form).toBeHidden();
    await page.click('[data-action="add-client"]');
    await expect(form).toBeVisible();

    const clientEmail = `harper-ui-${Date.now()}@rapqa.com`;
    await form.locator('[name="client_name"]').fill('Harper Project');
    await form.locator('[name="client_email"]').fill(clientEmail);
    await form.locator('[name="project_name"]').fill('Dining Room');
    await form.locator('[name="notes"]').fill('Met at the showroom.');

    const [added] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/.netlify/functions/client-add')),
      form.locator('button[type="submit"]').click()
    ]);
    expect(added.status(), await added.text()).toBe(201);
    const addedBody = await added.json();
    expect(addedBody.client_email).toBe(clientEmail);

    await expect(form).toBeHidden();

    // The row is in partner_clients for this partner.
    const user = await getAuthUserByEmail(testEmail);
    expect(user).not.toBeNull();
    const partner = await getPartnerByAuthUserId(user!.id);
    expect(partner).not.toBeNull();
    const stored = await getPartnerClients(partner!.id);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(addedBody.id);
    expect(stored[0].client_email).toBe(clientEmail);
    expect(stored[0].link_sent_at).toBeNull();

    if (!engineUp) {
      // Without the BFF the table cannot be rebuilt; the status line says so.
      await expect(page.locator('#clients-status')).toContainText('Client added');
      return;
    }

    // The row appears locally, as Added, with a Send link action.
    await expect(rows(page)).toHaveCount(1);
    await expect(cellsOf(page, 0).nth(0)).toHaveText('Harper Project');
    await expect(cellsOf(page, 0).nth(1)).toHaveText('Dining Room');
    await expect(cellsOf(page, 0).nth(3)).toHaveText('Added');
    await expect(page.locator('[data-field="total-clients"]')).toHaveText('1');

    const send = cellsOf(page, 0).nth(5).locator('[data-action="send-link"]');
    await expect(send).toHaveText('Send link');
    await expect(send).toHaveAttribute('data-client-id', addedBody.id);
    await expect(send).toHaveAttribute('aria-disabled', 'true');

    await send.click();
    await expect(page.locator('#clients-status')).toHaveText(NOT_LINKED_NOTE);

    // Nothing was sent.
    const after = await getPartnerClients(partner!.id);
    expect(after[0].link_sent_at).toBeNull();
    expect(after[0].link_sent_count).toBe(0);
  });

  test('U.4 BFF down: one row says the clients could not be loaded', async ({ page }) => {
    await serveDashboardData(page, 502, UNAVAILABLE);
    await openClients(page);

    await expect(rows(page)).toHaveCount(0);
    const cells = page.locator('[data-field="clients-table"] td');
    await expect(cells).toHaveCount(1);
    await expect(cells.first()).toHaveText(UNAVAILABLE_ROW);
    await expect(page.locator('body')).not.toContainText('Miller Residence');
  });

  test('U.5 send link: a modal blocks the page while sending, then confirms and leaves a banner', async ({ page }) => {
    await serveDashboardData(page, 200, LINKED_WITH_CLIENTS);
    let sendCalls = 0;
    await page.route('**/.netlify/functions/client-send-link', async (route) => {
      sendCalls++;
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: WESTON_CLIENT.id, link_sent_at: '2026-10-01T15:00:00Z', link_sent_count: 1 })
      });
    });
    await openClients(page);

    const send = page.locator(`[data-action="send-link"][data-client-id="${WESTON_CLIENT.id}"]`);
    const box = await send.boundingBox();
    await send.click();

    const modal = page.locator('#clients-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('data-state', 'busy');
    await expect(modal).toContainText('Sending the link to weston@example.com');

    // A second click on the same spot lands on the overlay, not on the action.
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

    await expect(modal).toHaveAttribute('data-state', 'ok');
    await expect(modal).toContainText('Link sent to weston@example.com');
    await expect(modal).toBeHidden();
    expect(sendCalls).toBe(1);

    const banner = page.locator('#clients-status');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('data-kind', 'ok');
    await expect(banner).toHaveText('Link sent to weston@example.com.');
  });

  test('U.6 a refused send stays on screen until it is closed', async ({ page }) => {
    await serveDashboardData(page, 200, LINKED_WITH_CLIENTS);
    await page.route('**/.netlify/functions/client-send-link', (route) => route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'rate_limited', message: 'A link was sent to this client in the last 10 minutes.' })
    }));
    await openClients(page);

    await page.locator(`[data-action="send-link"][data-client-id="${BROWN_CLIENT.id}"]`).click();

    const modal = page.locator('#clients-modal');
    await expect(modal).toHaveAttribute('data-state', 'error');
    await expect(modal).toContainText('Already sent in the last 10 minutes.');

    // Bad news does not dismiss itself: it waits to be read.
    await page.waitForTimeout(2500);
    await expect(modal).toBeVisible();
    await modal.locator('[data-modal-close]').click();
    await expect(modal).toBeHidden();

    const banner = page.locator('#clients-status');
    await expect(banner).toHaveAttribute('data-kind', 'error');
    await expect(banner).toHaveText('Already sent in the last 10 minutes.');
  });

  test('U.7 add client: the same modal confirms the save', async ({ page }) => {
    await serveDashboardData(page, 200, LINKED_WITH_CLIENTS);
    await page.route('**/.netlify/functions/client-add', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '44444444-4444-4444-8444-444444444444',
          client_name: 'Nueva Casa',
          project_name: null,
          client_email: 'nueva@example.com',
          link_sent_at: null,
          link_sent_count: 0
        })
      });
    });
    await openClients(page);

    await page.click('[data-action="add-client"]');
    const form = page.locator('#add-client-form');
    await form.locator('[name="client_name"]').fill('Nueva Casa');
    await form.locator('[name="client_email"]').fill('nueva@example.com');
    await form.locator('button[type="submit"]').click();

    const modal = page.locator('#clients-modal');
    await expect(modal).toHaveAttribute('data-state', 'busy');
    await expect(modal).toContainText('Saving Nueva Casa');
    await expect(modal).toHaveAttribute('data-state', 'ok');
    await expect(modal).toContainText('Client added');
    await expect(modal).toBeHidden();

    await expect(page.locator('#clients-status')).toHaveText('Client added: Nueva Casa.');
    await expect(rows(page)).toHaveCount(4);
  });
});
