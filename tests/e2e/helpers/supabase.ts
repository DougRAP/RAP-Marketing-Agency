// Test helpers backed by the Supabase admin API. Service-role only —
// never imported into production browser code.

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load .env manually since the test runner doesn't auto-load it.
const envPath = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env. Make sure .env is present at repo root.');
}

export const supabaseAdmin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

/** Generates a unique test email — used to keep tests isolated. */
export function makeTestEmail(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `e2e-test-${ts}-${rand}@rapqa.com`;
}

/**
 * Generates a magic-link URL for the given email without sending an email.
 * Pre-creates the auth user if needed (admin generateLink('magiclink')
 * only works for existing users; for brand-new emails we createUser
 * first with email_confirm=true so the auth row exists).
 *
 * The returned URL is one-shot — visiting it consumes the token.
 *
 * Note: this leaves the partners row STILL absent. Our app's
 * account-bootstrap is responsible for creating that on first sign-in,
 * which is exactly what we want to test.
 */
export async function generateMagicLink(email: string, redirectTo: string): Promise<string> {
  // Best-effort pre-create. If the user already exists this throws
  // a known error we ignore.
  const createRes = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true
  });
  if (createRes.error && !/already.*registered|already.*exists/i.test(createRes.error.message)) {
    throw new Error(`createUser failed: ${createRes.error.message}`);
  }

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo }
  });
  if (error) throw new Error(`generateLink failed: ${error.message}`);
  const link = (data as any)?.properties?.action_link;
  if (!link) throw new Error(`generateLink returned no action_link: ${JSON.stringify(data)}`);
  return link;
}

/**
 * Fetches the partner row for a given auth_user_id. Returns null if not found.
 */
export async function getPartnerByAuthUserId(authUserId: string) {
  const { data, error } = await supabaseAdmin
    .from('partners')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (error) throw new Error(`getPartnerByAuthUserId failed: ${error.message}`);
  return data;
}

/**
 * Counts partner rows for an auth_user_id. Should always return 0 or 1.
 */
export async function countPartnersForAuthUserId(authUserId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('partners')
    .select('id', { count: 'exact', head: true })
    .eq('auth_user_id', authUserId);
  if (error) throw new Error(`countPartners failed: ${error.message}`);
  return count ?? 0;
}

/**
 * Deletes the partner row and auth user for the given email.
 * Idempotent — safe to call in `afterEach` even if test failed early.
 */
export async function cleanupTestUser(email: string): Promise<void> {
  // Find user by email
  const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
  const user = usersData?.users?.find(u => u.email === email);
  // Delete partner rows (filter by auth_user_id when we have user, else by lead match)
  if (user) {
    await supabaseAdmin.from('partners').delete().eq('auth_user_id', user.id);
    await supabaseAdmin.auth.admin.deleteUser(user.id);
  }
  // Delete lead-level rows by email. Has to run AFTER partner delete
  // because partners.lead_id references it.
  await supabaseAdmin.from('lead_events').delete().in('lead_id',
    (await supabaseAdmin.from('leads').select('id').eq('email', email)).data?.map(r => r.id) || []
  );
  await supabaseAdmin.from('leads').delete().eq('email', email);
}
