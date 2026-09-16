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
  // Find user by email. Paginated lookup: listUsers() with no params returns
  // only the first page, so a run that aborted before afterEach could leave
  // users behind that this would then silently fail to find.
  const user = await getAuthUserByEmail(email);
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

// ---------------------------------------------------------------------------
// Anon client — the same key the browser gets from /public-config. The
// service-role client is not a fair way to ask "could a real visitor still
// redeem this token?": only the anon key walks the same GoTrue path a browser
// does.
// ---------------------------------------------------------------------------
const ANON_KEY = process.env.SUPABASE_ANON_KEY!;

if (!ANON_KEY) {
  throw new Error('Missing SUPABASE_ANON_KEY in env. Make sure .env is present at repo root.');
}

export const supabaseAnon: SupabaseClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});

/** The email-link flavours these tests mint. Mirrors GenerateLinkType. */
export type EmailLinkType = 'magiclink' | 'recovery';

/** Everything the Supabase email template would have put in the URL. */
export interface EmailTokenParts {
  tokenHash: string;
  verificationType: string;
  userId: string | null;
}

/** A password that clears the policy and is unique, so an HIBP check can't reject it. */
export function makeTestPassword(tag = 'Pw'): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${tag}!${Date.now()}${rand}Aa1`;
}

/**
 * Finds an auth user by email across every page. `listUsers()` with no params
 * returns only the first page, so the naive find() used elsewhere silently
 * misses users once the table grows past one page.
 */
export async function getAuthUserByEmail(email: string) {
  const target = email.toLowerCase();
  const perPage = 200;
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const users = (data as any)?.users ?? [];
    const hit = users.find((u: any) => (u.email || '').toLowerCase() === target);
    if (hit) return hit;
    if (users.length < perPage) return null;
  }
  return null;
}

/** Creates the auth user if absent, optionally with a password. Idempotent. */
export async function ensureAuthUser(email: string, password?: string): Promise<string> {
  const attrs: Record<string, unknown> = { email, email_confirm: true };
  if (password) attrs.password = password;

  const { data, error } = await supabaseAdmin.auth.admin.createUser(attrs as any);
  if (!error) return (data as any).user.id;

  if (!/already.*registered|already.*exists/i.test(error.message)) {
    throw new Error(`createUser failed: ${error.message}`);
  }
  const existing = await getAuthUserByEmail(email);
  if (!existing) throw new Error(`createUser said "already exists" but no user found for ${email}`);
  return existing.id;
}

/** A partner who has set a password. */
export async function createUserWithPassword(email: string, password: string): Promise<string> {
  return ensureAuthUser(email, password);
}

/**
 * A partner who has only ever used the magic link, so there is no password.
 * GoTrue gives no way to observe that from the API: signInWithPassword answers
 * the same "Invalid login credentials" as a wrong password would.
 */
export async function createUserWithoutPassword(email: string): Promise<string> {
  return ensureAuthUser(email);
}

/**
 * Mints an email token without sending an email and returns the raw parts.
 * `properties.hashed_token` is the `?token_hash=` value the confirm page
 * reads, which is what lets these tests drive it without a mailbox.
 */
export async function generateEmailToken(
  email: string,
  type: EmailLinkType = 'magiclink',
  redirectTo = 'http://localhost:8888/dashboard/'
): Promise<EmailTokenParts> {
  await ensureAuthUser(email);

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type, email, options: { redirectTo }
  } as any);
  if (error) throw new Error(`generateLink(${type}) failed: ${error.message}`);

  const props = (data as any)?.properties;
  if (!props?.hashed_token) {
    throw new Error(`generateLink(${type}) returned no hashed_token: ${JSON.stringify(data)}`);
  }
  return {
    tokenHash: props.hashed_token,
    verificationType: props.verification_type,
    userId: (data as any)?.user?.id ?? null
  };
}

/**
 * Builds the URL the email template is expected to produce. Kept here so the
 * tests and the template agree on one spelling of the contract:
 *   {{ .SiteURL }}/login/confirm?token_hash={{ .TokenHash }}&type=...
 */
export function confirmUrl(parts: EmailTokenParts, next?: string): string {
  const qs = new URLSearchParams({
    token_hash: parts.tokenHash,
    type: parts.verificationType
  });
  if (next) qs.set('next', next);
  return `/login/confirm?${qs.toString()}`;
}

/**
 * Redeems a token hash from Node with the anon key, the same privilege a real
 * visitor has. DESTRUCTIVE: success consumes the one-shot token, so this is
 * always the last assertion of a test.
 */
export async function isTokenStillValid(
  tokenHash: string,
  type: EmailLinkType = 'magiclink'
): Promise<boolean> {
  const { data, error } = await supabaseAnon.auth.verifyOtp({ token_hash: tokenHash, type });
  const ok = !error && !!(data as any)?.session;
  await supabaseAnon.auth.signOut().catch(() => {});
  return ok;
}

/** Out-of-band proof that a password really works, without using the browser. */
export async function canSignInWithPassword(email: string, password: string): Promise<boolean> {
  const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });
  const ok = !error && !!(data as any)?.session;
  await supabaseAnon.auth.signOut().catch(() => {});
  return ok;
}
