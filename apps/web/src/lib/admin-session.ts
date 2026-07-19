/**
 * Admin session cookie values (v8 R8.2). Two ways in, one cookie:
 *  - the legacy access key (cookie holds the key itself), or
 *  - username + password from WEBSITE_ADMIN_LOGIN_USERNAME /
 *    WEBSITE_ADMIN_LOGIN_PASSWORD, where the cookie holds a derived digest
 *    so the password itself never travels back and forth.
 * Edge-safe: Web Crypto only, so the middleware can verify the same digest.
 */

export const ADMIN_COOKIE = "fixbtn_admin";

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The cookie value a username/password login mints. Null when creds unset. */
export async function passwordSessionValue(): Promise<string | null> {
  const user = process.env.WEBSITE_ADMIN_LOGIN_USERNAME;
  const pass = process.env.WEBSITE_ADMIN_LOGIN_PASSWORD ?? process.env.WEBSITE_ADMIN_PASSWORD;
  if (!user || !pass) return null;
  return sha256Hex(`fixbtn-admin|${user}|${pass}`);
}

/** Does this cookie value grant admin? Accepts either login method. */
export async function isValidAdminCookie(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const key = process.env.ADMIN_ACCESS_KEY;
  if (key && value === key) return true;
  const derived = await passwordSessionValue();
  return derived !== null && value === derived;
}

/** Check a submitted username/password pair against env. */
export function checkAdminLogin(username: string, password: string): boolean {
  const user = process.env.WEBSITE_ADMIN_LOGIN_USERNAME;
  const pass = process.env.WEBSITE_ADMIN_LOGIN_PASSWORD ?? process.env.WEBSITE_ADMIN_PASSWORD;
  return Boolean(user && pass && username === user && password === pass);
}
