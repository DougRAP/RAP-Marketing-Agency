// Client pipeline (contract F): client-add and client-send-link, called the
// way js/dashboard-clients.js will call them, plus the RLS on partner_clients.
//
// No browser: a partner is minted with a password, signed in through GoTrue
// to get a real access token, and bootstrapped through account-bootstrap so
// the partners row exists. Every user is a fresh makeTestEmail() and is
// removed in afterEach. No real account is ever used here, so the linked
// success path (engine 200 + Resend send) is covered by the unit tests only.

import { test, expect, APIRequestContext } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  makeTestEmail,
  makeTestPassword,
  createUserWithPassword,
  cleanupTestUser,
  getPartnerClients,
  supabaseAdmin,
  supabaseAnon
} from './helpers/supabase';
import { engineReachable, authHeaders } from './helpers/env';

const ADD_URL = '/.netlify/functions/client-add';
const SEND_URL = '/.netlify/functions/client-send-link';

interface Partner {
  email: string;
  token: string;
  partnerId: string;
}

const ANON_CLIENT_OPTS = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
};

/**
 * A throwaway anon-key client. Signing in on the shared supabaseAnon would
 * leave a session in its memory, and signing out again deletes that session
 * on the server, which makes the token itself invalid for auth.getUser.
 */
function freshAnonClient(headers?: Record<string, string>) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    ...ANON_CLIENT_OPTS,
    ...(headers ? { global: { headers } } : {})
  });
}

/** A signed-in partner with a partners row, as the dashboard would have it. */
async function signedInPartner(request: APIRequestContext, email: string): Promise<Partner> {
  const password = makeTestPassword('Cp');
  await createUserWithPassword(email, password);

  const { data, error } = await freshAnonClient().auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`signInWithPassword failed: ${error?.message}`);
  const token = data.session.access_token;

  const boot = await request.post('/.netlify/functions/account-bootstrap', { headers: authHeaders(token) });
  expect([200, 201]).toContain(boot.status());
  const body = await boot.json();
  return { email, token, partnerId: body.partner_id };
}

function prospect(overrides: Record<string, unknown> = {}) {
  return {
    client_name: 'Harper Project',
    project_name: 'Dining Room',
    client_email: `harper-${Date.now()}@rapqa.com`,
    ...overrides
  };
}

async function addClient(request: APIRequestContext, partner: Partner, data: Record<string, unknown>) {
  const res = await request.post(ADD_URL, { headers: authHeaders(partner.token), data });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}

test.describe('Client pipeline: client-add and client-send-link', () => {
  const emails: string[] = [];

  function freshEmail(): string {
    const email = makeTestEmail();
    emails.push(email);
    return email;
  }

  test.afterEach(async () => {
    while (emails.length) await cleanupTestUser(emails.pop()!);
  });

  test('C.1 client-add: 401 without a bearer, 400 on validation, 201 creates the row', async ({ request }) => {
    const noAuth = await request.post(ADD_URL, { data: prospect() });
    expect(noAuth.status()).toBe(401);
    expect((await noAuth.json()).code).toBe('missing_bearer_token');

    const partner = await signedInPartner(request, freshEmail());

    const invalid = await request.post(ADD_URL, {
      headers: authHeaders(partner.token),
      data: prospect({ client_email: 'not-an-email' })
    });
    expect(invalid.status()).toBe(400);
    const invalidBody = await invalid.json();
    expect(invalidBody.code).toBe('validation_failed');
    expect(invalidBody.message).toContain('client_email');

    const email = `Harper.${Date.now()}@RapQA.com`;
    const created = await addClient(request, partner, prospect({ client_email: `  ${email} `, client_phone: '' }));
    expect(created.client_name).toBe('Harper Project');
    expect(created.client_email).toBe(email.toLowerCase());
    expect(created.client_phone).toBeNull();
    expect(created.link_sent_at).toBeNull();
    expect(created.link_sent_count).toBe(0);

    const rows = await getPartnerClients(partner.partnerId);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(created.id);
    expect(rows[0].partner_id).toBe(partner.partnerId);
    expect(rows[0].link_sent_at).toBeNull();
    expect(rows[0].link_sent_count).toBe(0);
  });

  test('C.2 client-add: 409 duplicate_client on the same email in a different case (citext)', async ({ request }) => {
    const partner = await signedInPartner(request, freshEmail());
    const email = `dup-${Date.now()}@rapqa.com`;
    await addClient(request, partner, prospect({ client_email: email }));

    const again = await request.post(ADD_URL, {
      headers: authHeaders(partner.token),
      data: prospect({ client_email: email.toUpperCase() })
    });
    expect(again.status()).toBe(409);
    expect((await again.json()).code).toBe('duplicate_client');
    expect(await getPartnerClients(partner.partnerId)).toHaveLength(1);
  });

  test('C.3 client-add: honeypot answers 200 and leaves no row', async ({ request }) => {
    const partner = await signedInPartner(request, freshEmail());
    const res = await request.post(ADD_URL, {
      headers: authHeaders(partner.token),
      data: prospect({ hp: 'bot' })
    });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true, honeypot: true });
    expect(await getPartnerClients(partner.partnerId)).toHaveLength(0);
  });

  test('C.4 client-send-link: 404 for a random id and for another partner\'s client', async ({ request }) => {
    const a = await signedInPartner(request, freshEmail());
    const b = await signedInPartner(request, freshEmail());
    const bClient = await addClient(request, b, prospect());

    const random = await request.post(SEND_URL, {
      headers: authHeaders(a.token),
      data: { client_id: '00000000-0000-4000-8000-000000000000' }
    });
    expect(random.status()).toBe(404);
    expect((await random.json()).code).toBe('not_found');

    const crossTenant = await request.post(SEND_URL, {
      headers: authHeaders(a.token),
      data: { client_id: bClient.id }
    });
    expect(crossTenant.status()).toBe(404);
    expect((await crossTenant.json()).code).toBe('not_found');

    const [row] = await getPartnerClients(b.partnerId);
    expect(row.link_sent_count).toBe(0);
    expect(row.link_sent_at).toBeNull();
  });

  test('C.5 client-send-link: 429 rate_limited within 10 minutes of the last send', async ({ request }) => {
    const partner = await signedInPartner(request, freshEmail());
    const client = await addClient(request, partner, prospect());

    const { error } = await supabaseAdmin
      .from('partner_clients')
      .update({ link_sent_at: new Date().toISOString(), link_sent_count: 1 })
      .eq('id', client.id);
    expect(error).toBeNull();

    const res = await request.post(SEND_URL, {
      headers: authHeaders(partner.token),
      data: { client_id: client.id }
    });
    expect(res.status()).toBe(429);
    expect((await res.json()).code).toBe('rate_limited');

    const [row] = await getPartnerClients(partner.partnerId);
    expect(row.link_sent_count).toBe(1);
  });

  test('C.6 client-send-link: a fresh partner is not linked (409) or the engine is down (502); never sends', async ({ request }) => {
    const partner = await signedInPartner(request, freshEmail());
    const client = await addClient(request, partner, prospect());

    const reachable = await engineReachable();
    test.info().annotations.push({
      type: 'engine',
      description: reachable
        ? 'engine reachable: expecting 409 not_linked'
        : 'engine unreachable: expecting 502 upstream_unavailable'
    });

    const res = await request.post(SEND_URL, {
      headers: authHeaders(partner.token),
      data: { client_id: client.id }
    });
    const body = await res.json();
    if (reachable) {
      expect(res.status(), JSON.stringify(body)).toBe(409);
      expect(body.code).toBe('not_linked');
    } else {
      expect(res.status(), JSON.stringify(body)).toBe(502);
      expect(body.code).toBe('upstream_unavailable');
    }

    const [row] = await getPartnerClients(partner.partnerId);
    expect(row.link_sent_at).toBeNull();
    expect(row.link_sent_count).toBe(0);
  });

  test('C.7 RLS: each partner reads only their own rows; anonymous gets 42501', async ({ request }) => {
    const a = await signedInPartner(request, freshEmail());
    const b = await signedInPartner(request, freshEmail());
    const aClient = await addClient(request, a, prospect());
    const bClient = await addClient(request, b, prospect());

    const asUser = (token: string) => freshAnonClient({ Authorization: `Bearer ${token}` });

    const seenByB = await asUser(b.token).from('partner_clients').select('id');
    expect(seenByB.error).toBeNull();
    expect(seenByB.data!.map(r => r.id)).toEqual([bClient.id]);

    const seenByA = await asUser(a.token).from('partner_clients').select('id');
    expect(seenByA.error).toBeNull();
    expect(seenByA.data!.map(r => r.id)).toEqual([aClient.id]);

    const anonymous = await supabaseAnon.from('partner_clients').select('id');
    expect(anonymous.error).not.toBeNull();
    expect(anonymous.error!.code).toBe('42501');
  });
});
