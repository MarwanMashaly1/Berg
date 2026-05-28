import { createHmac, timingSafeEqual } from 'crypto';

/**
 * HMAC-signed tokens for admin email approval links.
 *
 * Structure: base64url(JSON({ action, subject, exp, sig }))
 *
 * - action:  'approve' | 'reject' | 'approve-all'
 * - subject: promptId (single) or comma-joined sorted IDs (approve-all)
 * - exp:     Unix timestamp in seconds (7 days from creation)
 * - sig:     HMAC-SHA256(ADMIN_SECRET, "action:subject:exp") as hex
 *
 * The raw ADMIN_SECRET never appears in URLs or email bodies.
 * Tokens expire after 7 days and are action + subject specific — a
 * token for "approve:abc" cannot be used for "reject:abc".
 */

const TOKEN_TTL_SECS = 7 * 24 * 60 * 60; // 7 days

function sign(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message).digest('hex');
}

export type AdminAction = 'approve' | 'reject' | 'approve-all' | 'generate';

/**
 * Create a signed token for an admin email link.
 *
 * @param adminSecret  The ADMIN_SECRET env var value
 * @param action       The action this token authorises
 * @param subject      promptId for approve/reject; sorted comma-joined IDs for approve-all
 */
export function createEmailToken(
  adminSecret: string,
  action: AdminAction,
  subject: string,
): string {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECS;
  const message = `${action}:${subject}:${exp}`;
  const sig = sign(adminSecret, message);
  return Buffer.from(JSON.stringify({ action, subject, exp, sig })).toString('base64url');
}

/**
 * Verify an admin email token.
 * Returns true only if the token is valid, unexpired, and matches the expected action + subject.
 */
export function verifyEmailToken(
  adminSecret: string,
  token: string,
  expectedAction: AdminAction,
  expectedSubject: string,
): boolean {
  if (!token || !adminSecret) return false;

  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
      action: string;
      subject: string;
      exp: number;
      sig: string;
    };

    const { action, subject, exp, sig } = decoded;

    // Check expiry
    if (Math.floor(Date.now() / 1000) > exp) return false;

    // Check action + subject match what the route expects
    if (action !== expectedAction || subject !== expectedSubject) return false;

    // Timing-safe signature comparison
    const expectedSig = sign(adminSecret, `${action}:${subject}:${exp}`);
    if (sig.length !== expectedSig.length) return false;

    return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'));
  } catch {
    return false;
  }
}
