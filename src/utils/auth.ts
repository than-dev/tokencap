import 'dotenv/config';
import crypto from 'node:crypto';

// Dynamic session secret based on environment
function getSessionSecret(): string {
  return (
    process.env.TOKENCAP_SESSION_SECRET ||
    `tokencap_local_secret_${process.env.TOKENCAP_DASHBOARD_PASSWORD || 'default_seed_key'}`
  );
}

/**
 * Validates dashboard login credentials against environment variables.
 * Defaults to admin/admin if no environment variables are set.
 * Uses SHA-256 pre-hashing before timingSafeEqual to avoid length-timing leaks and buffer size errors.
 */
export function validateCredentials(user: string, pass: string): boolean {
  const expectedUser = process.env.TOKENCAP_DASHBOARD_USER || 'admin';
  const expectedPass = process.env.TOKENCAP_DASHBOARD_PASSWORD || 'admin';

  if (!user || !pass) return false;

  const userHash = crypto.createHash('sha256').update(user).digest();
  const expectedUserHash = crypto.createHash('sha256').update(expectedUser).digest();
  const userMatch = crypto.timingSafeEqual(userHash, expectedUserHash);

  const passHash = crypto.createHash('sha256').update(pass).digest();
  const expectedPassHash = crypto.createHash('sha256').update(expectedPass).digest();
  const passMatch = crypto.timingSafeEqual(passHash, expectedPassHash);

  return userMatch && passMatch;
}

/**
 * Creates an HMAC-signed session token valid for 24 hours.
 */
export function createSessionToken(username: string): string {
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  const payload = `${username}:${expiresAt}`;
  const secret = getSessionSecret();
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

/**
 * Verifies an HMAC-signed session token.
 */
export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;

  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const [username, expiresStr, hmac] = decoded.split(':');

    if (!username || !expiresStr || !hmac) return false;

    const expiresAt = Number(expiresStr);
    if (Number.isNaN(expiresAt) || Date.now() > expiresAt) return false;

    const payload = `${username}:${expiresAt}`;
    const secret = getSessionSecret();
    const expectedHmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    const hmacHash = crypto.createHash('sha256').update(hmac).digest();
    const expectedHash = crypto.createHash('sha256').update(expectedHmac).digest();

    return crypto.timingSafeEqual(hmacHash, expectedHash);
  } catch {
    return false;
  }
}
