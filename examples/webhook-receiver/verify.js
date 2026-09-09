'use strict';

const crypto = require('node:crypto');

/**
 * Verify a 42min webhook signature.
 *
 * 42min signs `${timestamp}.${rawBody}` with HMAC-SHA256 using your
 * subscription's signing secret, hex-encodes it, and sends:
 *
 *   X-42min-Webhook-Signature: t=1757370000,v1=6a1f...c3
 *
 * @param {Buffer|string} rawBody  The request body EXACTLY as received.
 * @param {string} signatureHeader The X-42min-Webhook-Signature header value.
 * @param {string} secret          Your signing_secret.
 * @param {number} [toleranceSeconds=300] Reject timestamps older than this.
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
function verifyWebhook(rawBody, signatureHeader, secret, toleranceSeconds = 300) {
  if (!signatureHeader) return { ok: false, reason: 'missing signature header' };
  if (!secret) return { ok: false, reason: 'no signing secret configured' };

  // Parse `t=<unix-seconds>,v1=<hex>`. Order is not guaranteed by the spec, so
  // do not rely on position.
  const parts = Object.create(null);
  for (const piece of String(signatureHeader).split(',')) {
    const eq = piece.indexOf('=');
    if (eq === -1) continue;
    parts[piece.slice(0, eq).trim()] = piece.slice(eq + 1).trim();
  }

  const timestamp = parts.t;
  const provided = parts.v1;
  if (!timestamp || !provided) return { ok: false, reason: 'malformed signature header' };
  if (!/^\d+$/.test(timestamp)) return { ok: false, reason: 'malformed timestamp' };

  // Replay window. 42min does not enforce this for you: without it, anyone who
  // captures one delivery can resend it verbatim forever and the signature
  // still validates.
  const ageSeconds = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (Math.abs(ageSeconds) > toleranceSeconds) {
    return { ok: false, reason: `timestamp outside tolerance (${ageSeconds}s)` };
  }

  // The signed payload is the timestamp, a literal dot, then the RAW body.
  // Signing a re-serialized object instead of the received bytes is the single
  // most common cause of "my signature never matches": JSON.stringify may
  // reorder keys, change spacing, or alter unicode escaping.
  const expected = crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), Buffer.from(rawBody)]))
    .digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  // timingSafeEqual throws on a length mismatch, so check length first. The
  // length itself is not a secret.
  if (a.length !== b.length) return { ok: false, reason: 'signature mismatch' };
  if (!crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'signature mismatch' };

  return { ok: true };
}

module.exports = { verifyWebhook };
