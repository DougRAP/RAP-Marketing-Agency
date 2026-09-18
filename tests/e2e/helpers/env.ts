// Environment probes for specs that exercise Netlify Functions directly.
//
// netlify dev loads designer-plan-site/.env, which is where ENGINE_BASE_URL
// (and, when present, RESEND_API_KEY) live for the functions under test. The
// repo-root .env that helpers/supabase.ts loads is a separate file, so this
// reads the site file on its own. Values are never logged.

import * as fs from 'fs';
import * as path from 'path';

const SITE_ENV_PATH = path.resolve(__dirname, '../../../designer-plan-site/.env');

let cache: Record<string, string> | null = null;

function loadSiteEnv(): Record<string, string> {
  if (cache) return cache;
  const out: Record<string, string> = {};
  if (fs.existsSync(SITE_ENV_PATH)) {
    const content = fs.readFileSync(SITE_ENV_PATH, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) out[m[1]] = m[2];
    }
  }
  cache = out;
  return out;
}

/** One value from designer-plan-site/.env, or '' when absent. */
export function siteEnv(name: string): string {
  return loadSiteEnv()[name] || '';
}

/**
 * Whether the engine the functions will call answers at all. GET /api/version
 * sits outside /api/v1, so it needs no HMAC and says nothing about whether
 * our signing key matches.
 */
export async function engineReachable(timeoutMs = 3000): Promise<boolean> {
  const base = siteEnv('ENGINE_BASE_URL');
  if (!base) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/version`, { signal: controller.signal });
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Headers for a function call made as a signed-in partner. */
export function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}
